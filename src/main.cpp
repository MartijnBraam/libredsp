#include <Arduino.h>
#include <Audio.h>

#include <QNEthernet.h>

#include "AsyncFSJson_Teensy41.h"
#include "nodemap.h"
using namespace qindesign::network;

#include <AsyncFSWebServer_Teensy41.h>
#include "web.h"

AsyncWebServer server(80);

static std::vector<AudioConnection*> dynLinks;
static std::vector<AudioStream*> dynNodes;

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

void setup() {
    Serial.begin(115200);
    AudioMemory(10);

    Ethernet.setHostname("libredsp");
    Ethernet.begin();

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

    auto handler = new AsyncCallbackJsonWebHandler(
        "/graph", [](AsyncWebServerRequest* request, JsonVariant& raw) {
            auto json = raw.as<JsonObject>();
            JsonObject nodes = json["nodes"];
            for (JsonPair nodepair : nodes) {
                JsonObject node = nodepair.value();
                int classIdx = node["class"].as<int>();
                AudioStream* newNode;
                switch (classIdx) {
                case NodeAudioInputUSB:
                    newNode = new AudioInputUSB();
                    break;
                case NodeAudioOutputUSB:
                    newNode = new AudioOutputUSB();
                    break;
                case NodeAsyncAudioInputSPDIF3:
                    newNode = new AudioInputSPDIF3();
                    break;
                }
                dynNodes.push_back(newNode);
            }
            JsonArray links = json["links"];
            for (JsonArray link : links) {
                auto src = dynNodes[link[0]];
                auto dst = dynNodes[link[2]];
                int spad = link[1];
                int dpad = link[3];
                auto l = new AudioConnection(*src, spad, *dst, dpad);
                dynLinks.push_back(l);
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
