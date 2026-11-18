#pragma once

#include "nodemap.h"
#include "ArduinoJson/Strings/JsonString.hpp"
#include "ArduinoJson/Variant/JsonVariant.hpp"
#include "codec/sgtl5000.h"

inline LibreDspControlSGTL5000 sgtl5000_1;
inline LibreDspControlSGTL5000 sgtl5000_2;

inline void setupBoard() {
    sgtl5000_1.enable();
    sgtl5000_1.inputSelect(AUDIO_INPUT_LINEIN);
    sgtl5000_1.volume(0.5);
    sgtl5000_1.lineOutLevel(13);
    sgtl5000_1.lineInLevel(0, 0);
    sgtl5000_1.adcHighPassFilterDisable();
    sgtl5000_1.muteHeadphone();

    sgtl5000_2.setWire(1);

    sgtl5000_2.enable();
    sgtl5000_2.inputSelect(AUDIO_INPUT_LINEIN);
    sgtl5000_2.volume(0.5);
    sgtl5000_2.lineOutLevel(13);
    sgtl5000_2.lineInLevel(0, 0);
    sgtl5000_2.adcHighPassFilterDisable();
}

inline void controlBoard(int type, ArduinoJson::JsonString key, ArduinoJson::JsonVariant val) {
    if (strcmp(key.c_str(), "hpgain") == 0) {
        float gain = val;
        sgtl5000_2.volume(gain);
    }
}
