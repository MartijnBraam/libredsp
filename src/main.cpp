#include <Arduino.h>
#include <Audio.h>
#include <list>
#include <map>
#include <set>
#include <Wire.h>

#include "i2cscan.h"
#include "board/board_fosdem_revc.h"

#ifdef BOARD_VARIAX
#include "control_tlv320aic3104.h"
#elifdef BOARD_REVC
#include "board/board_fosdem_revc.h"
#endif

#include <QNEthernet.h>

#include "AsyncFSJson_Teensy41.h"
#include "nodemap.h"
using namespace qindesign::network;

#include <AsyncFSWebServer_Teensy41.h>
#include "web.h"

AsyncWebServer server(80);

#ifdef BOARD_VARIAX
AudioControlTLV320AIC3104 codec(1, true, AICMODE_I2S, 44100, 24);
#endif
#ifdef BOARD_REVC
#endif

static std::map<size_t, AudioConnection*> dynLinks;
static std::map<size_t, AudioStream*> dynNodes;
static std::map<size_t, AudioAnalyzeRMS*> dynRms;
static std::set<AudioStream*> staticNodes;

AudioInputUSB static_input_usb;
AudioOutputUSB static_output_usb;

#ifdef NodeAudioInputI2SQuad
AudioInputI2SQuad static_input_i2s_quad;
#endif
#ifdef NodeAudioOutputI2SQuad
AudioOutputI2SQuad static_output_i2s_quad;
#endif

void handleNotFound(AsyncWebServerRequest* request) {
    String message = "Not Found\n\n";

    message += "URI: ";
    //message += server.uri();
    message += request->url();
    message += "\nMethod: ";
    message += (request->method() == HTTP_GET) ? "GET" : "POST";
    message += "\nArguments: ";
    message += request->args();
    message += "\n";

    for (uint8_t i = 0; i < request->args(); i++) {
        message += " " + request->argName(i) + ": " + request->arg(i) + "\n";
    }

    request->send(404, "text/plain", message);
}

#ifdef BOARD_VARIAX
void setupVariaxBoard() {
    Wire.begin();
    Wire.setSCL(19);
    Wire.setSDA(18);

    codec.setVerbose(2);
    codec.begin(6);
    codec.setPll(11289600, 1, 1, 7, 0);
    codec.inputMode(AIC_DIFF);
    codec.DACpower(DAC_100);
    codec.enable(CH_BOTH);
    codec.enableLineOut(true);
    codec.volume(1.0);
}
#endif

void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data,
               size_t length) {
    if (type == WS_EVT_CONNECT) {
        Serial.println("WS connect");
        client->ping();
    }
    else if (type == WS_EVT_DISCONNECT) {
        Serial.println("WS disconnect");
    }
    else if (type == WS_EVT_ERROR) {
        Serial.printf("WS error: %s\n", (char*)data);
    }
    else if (type == WS_EVT_DATA) {
    }
}

void cleanGraph() {
    staticNodes.clear();
    staticNodes.insert(&static_input_usb);
    staticNodes.insert(&static_output_usb);
#ifdef NodeAudioInputI2SQuad
    staticNodes.insert(&static_input_i2s_quad);
#endif
#ifdef NodeAudioOutputI2SQuad
    staticNodes.insert(&static_output_i2s_quad);
#endif

    for (size_t i = dynNodes.size(); i > 0; i--) {
        bool isStatic = false;
        for (auto& staticNode : staticNodes) {
            if (dynNodes[i] == staticNode) {
                isStatic = true;
                break;
            }
        }
        if (!isStatic) {
            Serial.printf("Deleting node %d\n", i);
            delete dynNodes[i];
        }
        else {
            Serial.printf("Node %d is static\n", i);
        }
    }
    dynNodes.clear();
    for (auto& link : dynLinks) {
        link.second->disconnect();
    }
    dynLinks.clear();
}

void setup() {
    Serial.begin(115200);
    AudioMemory(64);

    delay(1000);
    scanI2C(0, Wire);
    scanI2C(1, Wire1);
    scanI2C(2, Wire2);

    Ethernet.setHostname("libredsp");
    Ethernet.begin();

    setupBoard();

    server.onNotFound(handleNotFound);

    server.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
        auto* response = request->beginResponse(200, "text/html", index_html, index_html_len);
        response->addHeader("Content-Encoding", "gzip");
        request->send(response);
    });

    server.on("/libredsp.js", HTTP_GET, [](AsyncWebServerRequest* request) {
        auto* response = request->beginResponse(200, "text/javascript", libredsp_js, libredsp_js_len);
        response->addHeader("Content-Encoding", "gzip");
        request->send(response);
    });

    server.on("/node-editor.js", HTTP_GET, [](AsyncWebServerRequest* request) {
        auto* response = request->beginResponse(200, "text/javascript", node_editor_js, node_editor_js_len);
        response->addHeader("Content-Encoding", "gzip");
        request->send(response);
    });

    server.on("/nodes.json", HTTP_GET, [](AsyncWebServerRequest* request) {
        auto* response = request->beginResponse(200, "text/javascript", nodes_json, nodes_json_len);
        response->addHeader("Content-Encoding", "gzip");
        request->send(response);
    });

    auto wshandler = new AsyncWebSocket("/ws");
    wshandler->onEvent(onWsEvent);
    server.addHandler(wshandler);

    auto handler = new AsyncCallbackJsonWebHandler(
        "/graph", [](AsyncWebServerRequest* request, JsonVariant& raw) {
            auto json = raw.as<JsonObject>();
            JsonObject nodes = json["nodes"];

            cleanGraph();
            size_t index = 0;
            for (JsonPair nodepair : nodes) {
                JsonObject node = nodepair.value();
                JsonObject ctrl = node["ctrl"];
                int classIdx = node["class"].as<int>();
                AudioStream* newNode;
                AudioAnalyzeRMS* newRms;
                switch (classIdx) {
                case NodeAudioInputUSB:
                    newNode = &static_input_usb;
                    break;
                case NodeAudioOutputUSB:
                    newNode = &static_output_usb;
                    break;
#ifdef NodeAsyncAudioInputSPDIF3
                case NodeAsyncAudioInputSPDIF3:
                    newNode = new AudioInputSPDIF3();
                    break;
#endif
                case NodeAudioEffectFreeverb:
                    {
                        auto inst = new AudioEffectFreeverb();
                        inst->damping(ctrl["damp"]);
                        inst->roomsize(ctrl["size"]);
                        newNode = inst;
                    }
                    break;
#ifdef NodeAudioOutputI2S2
                case NodeAudioOutputI2S2:
                    newNode = new AudioOutputI2S2();
                    break;
#endif
#ifdef NodeAudioInputI2S2
                case NodeAudioInputI2S2:
                    newNode = new AudioInputI2S2();
                    break;
#endif
#ifdef NodeAudioInputI2SQuad
                case NodeAudioInputI2SQuad:
                    Serial.println("AudioInputI2SQuad");
                    newNode = &static_input_i2s_quad;
                    break;
#endif
#ifdef NodeAudioOutputI2SQuad
                case NodeAudioOutputI2SQuad:
                    Serial.println("AudioOutputI2SQuad");
                    newNode = &static_output_i2s_quad;
                    break;
#endif
                }
                Serial.println("Adding node");
                dynNodes[index++] = newNode;
            }
            JsonArray links = json["links"];
            index = 0;
            for (JsonArray link : links) {
                int snode = link[0];
                int dnode = link[2];
                auto src = dynNodes[snode];
                auto dst = dynNodes[dnode];
                int spad = link[1];
                int dpad = link[3];
                Serial.printf("link %d:%d -> %d:%d\n", snode, spad, dnode, dpad);
                auto l = new AudioConnection(*src, spad, *dst, dpad);
                dynLinks[index++] = l;
            }
            request->send(200, "application/json", "[]");
        });
    server.addHandler(handler);

    server.begin();
}

void buildNodeGraph() {
}

void loop() {
}
