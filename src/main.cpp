#include <Arduino.h>
#include <Audio.h>
#include <list>
#include <map>
#include <set>
#include <Wire.h>

#include "i2cscan.h"
#include "board/board_fosdem_revc.h"
#include "node/effect_freeverb.h"
#include "node/effect_freeverb_stereo.h"
#include "node/input_i2s_quad.h"
#include "node/input_usb.h"
#include "node/output_i2s_quad.h"
#include "node/output_usb.h"

#ifdef BOARD_VARIAX
#include "control_tlv320aic3104.h"
#elifdef BOARD_REVC
#include "board/board_fosdem_revc.h"
#endif

#include <QNEthernet.h>

#include <AsyncJson_Teensy41.h>
#include "nodemap.h"
using namespace qindesign::network;

#include <AsyncWebServer_Teensy41.h>
#include "web.h"

AsyncWebServer server(80);
AsyncEventSource events("/events");

#ifdef BOARD_VARIAX
AudioControlTLV320AIC3104 codec(1, true, AICMODE_I2S, 44100, 24);
#endif
#ifdef BOARD_REVC
#endif

static std::map<size_t, AudioConnection*> dynLinks;
static std::map<size_t, Node*> dynNodes;
static std::map<size_t, AudioAnalyzeRMS*> dynRms;
static std::set<AudioStream*> staticNodes;

LibreDspInputUSB static_input_usb;
LibreDspOutputUSB static_output_usb;

#ifdef NodeAudioInputI2SQuad
LibreDspInputI2SQuad static_input_i2s_quad;
#endif
#ifdef NodeAudioOutputI2SQuad
LibreDspOutputI2SQuad static_output_i2s_quad;
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
               size_t len) {
    if (type == WS_EVT_CONNECT) {
        Serial.printf("ws[Server: %s][ClientID: %u] WSClient connected\n", server->url(), client->id());
        client->text("Hello from Teensy4_1 Server");
    }
    else if (type == WS_EVT_DISCONNECT) {
        Serial.printf("ws[Server: %s][ClientID: %u] WSClient disconnected\n", server->url(), client->id());
    }
    else if (type == WS_EVT_ERROR) {
        //error was received from the other end
        Serial.printf("ws[Server: %s][ClientID: %u] error(%u): %s\n", server->url(), client->id(), *((uint16_t*)arg),
                      (char*)data);
    }
    else if (type == WS_EVT_PONG) {
        //pong message was received (in response to a ping request maybe)
        Serial.printf("ws[Server: %s][ClientID: %u] pong[%u]: %s\n", server->url(), client->id(), len,
                      (len) ? (char*)data : "");
    }
    else if (type == WS_EVT_DATA) {
        //data packet
        AwsFrameInfo* info = (AwsFrameInfo*)arg;

        if (info->final && info->index == 0 && info->len == len) {
            //the whole message is in a single frame and we got all of it's data
            Serial.printf("ws[Server: %s][ClientID: %u] %s-message[len: %llu]: ", server->url(), client->id(),
                          (info->opcode == WS_TEXT) ? "text" : "binary", info->len);

            if (info->opcode == WS_TEXT) {
                data[len] = 0;
                Serial.printf("%s\n", (char*)data);
            }
            else {
                for (size_t i = 0; i < info->len; i++) {
                    Serial.printf("%02x ", data[i]);
                }

                Serial.printf("\n");
            }

            if (info->opcode == WS_TEXT)
                client->text("Got your text message");
            else
                client->binary("Got your binary message");
        }
        else {
            //message is comprised of multiple frames or the frame is split into multiple packets
            if (info->index == 0) {
                if (info->num == 0) {
                    Serial.printf("ws[Server: %s][ClientID: %u] %s-message start\n", server->url(), client->id(),
                                  (info->message_opcode == WS_TEXT) ? "text" : "binary");
                }

                Serial.printf("ws[Server: %s][ClientID: %u] frame[%u] start[%llu]\n", server->url(), client->id(),
                              info->num, info->len);
            }

            Serial.printf("ws[Server: %s][ClientID: %u] frame[%u] %s[%llu - %llu]: ", server->url(), client->id(),
                          info->num, (info->message_opcode == WS_TEXT) ? "text" : "binary", info->index,
                          info->index + len);

            if (info->message_opcode == WS_TEXT) {
                data[len] = 0;
                Serial.printf("%s\n", (char*)data);
            }
            else {
                for (size_t i = 0; i < len; i++) {
                    Serial.printf("%02x ", data[i]);
                }

                Serial.printf("\n");
            }

            if ((info->index + len) == info->len) {
                Serial.printf("ws[Server: %s][ClientID: %u] frame[%u] end[%llu]\n", server->url(), client->id(),
                              info->num, info->len);

                if (info->final) {
                    Serial.printf("ws[Server: %s][ClientID: %u] %s-message end\n", server->url(), client->id(),
                                  (info->message_opcode == WS_TEXT) ? "text" : "binary");

                    if (info->message_opcode == WS_TEXT)
                        client->text("I got your text message");
                    else
                        client->binary("I got your binary message");
                }
            }
        }
    }
}

void cleanGraph() {
    for (size_t i = dynNodes.size(); i > 0; i--) {
        bool isStatic = dynNodes[i]->Static();
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

    server.addHandler(&events);

    auto controlHandler = new AsyncCallbackJsonWebHandler(
        "/control", [](AsyncWebServerRequest* request, JsonVariant& raw) {
            auto json = raw.as<JsonObject>();
            int node = json["n"].as<int>();
            auto key = json["r"].as<JsonString>();
            Serial.printf("control %d %s\n", node, key.c_str());
            if (dynNodes[node]->Static()) {
                controlBoard(0, key, json["v"]);
            }
            else {
                dynNodes[node]->Control(key, json["v"]);
            }

        });
    server.addHandler(controlHandler);

    auto handler = new AsyncCallbackJsonWebHandler(
        "/graph", [](AsyncWebServerRequest* request, JsonVariant& raw) {
            auto json = raw.as<JsonObject>();
            JsonObject nodes = json["nodes"];

            //cleanGraph();
            size_t index = 0;
            for (JsonPair nodepair : nodes) {
                JsonObject node = nodepair.value();
                JsonObject ctrl = node["ctrl"];
                int classIdx = node["class"].as<int>();
                Node* newNode;
                //AudioAnalyzeRMS* newRms;
                bool ctrlHardware = false;
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
                    ctrlHardware = true;
                    break;
#endif
#ifdef NodeAudioOutputI2SQuad
                case NodeAudioOutputI2SQuad:
                    Serial.println("AudioOutputI2SQuad");
                    newNode = &static_output_i2s_quad;
                    ctrlHardware = true;
                    break;
#endif
                case NodeAudioEffectFreeverb:
                    {
                        newNode = new LibreDspEffectFreeverb();
                    }
                    break;
                case NodeAudioEffectFreeverbs:
                    {
                        newNode = new LibreDspEffectFreeverbStereo();
                    }
                    break;
                }
                Serial.println("Adding node");
                dynNodes[index++] = newNode;
                if (ctrlHardware) {
                    for (JsonPair ctrlpair : ctrl) {
                        controlBoard(classIdx, ctrlpair.key(), ctrlpair.value());
                    }
                }
                else {
                    for (JsonPair cp : ctrl) {
                        newNode->Control(cp.key(), cp.value());;
                    }
                }
            }
            JsonArray links = json["links"];
            index = 0;
            for (JsonArray link : links) {
                int snode = link[0];
                int dnode = link[2];
                auto src = dynNodes[snode]->Stream();
                auto dst = dynNodes[dnode]->Stream();
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
