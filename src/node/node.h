#pragma once
#include <ArduinoJson.h>

class Node {
public:
    Node() = default;
    virtual ~Node() = default;
    virtual void Control(ArduinoJson::JsonString name, ArduinoJson::JsonVariant value) = 0;
    virtual AudioStream* Stream();

    virtual bool Static() = 0;
};
