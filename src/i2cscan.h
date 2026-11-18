#pragma once
#include "Wire.h"

inline void scanI2C(int busnum, TwoWire& wire = Wire) {
    Serial.printf("Scanning i2c%d...\n", busnum);
    wire.begin();
    for (uint8_t address = 1; address < 127; address++) {
        // The i2c_scanner uses the return value of
        // the Write.endTransmisstion to see if
        // a device did acknowledge to the address.
        wire.beginTransmission(address);
        uint8_t error = wire.endTransmission();

        if (error == 0) {
            Serial.print("Device found at address 0x");
            if (address < 16) {
                Serial.print("0");
            }
            Serial.println(address,HEX);
        }
        else if (error == 4) {
            Serial.print(F("Unknown error at address 0x"));
            if (address < 16) {
                Serial.print("0");
            }
            Serial.println(address,HEX);
        }
    }
}
