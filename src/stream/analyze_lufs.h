#pragma once

#define LUFS_SHORT_TIME (0.4)

#include <Arduino.h>
#include <AudioStream.h>

class AudioAnalyzeLUFS : public AudioStream {
private:
    audio_block_t* inputQueueArray[1];
    int32_t coeff[16]; // 2 biquads
    size_t ringSize;
    size_t ringIdx;
    uint32_t ringBuffer[int(AUDIO_SAMPLE_RATE * LUFS_SHORT_TIME / AUDIO_BLOCK_SAMPLES)];
    bool avail;

    void setHighpass(float frequency, float q = 0.7071) {
        double w0 = frequency * (2.0f * 3.141592654f / AUDIO_SAMPLE_RATE_EXACT);
        double sinW0 = sin(w0);
        double alpha = sinW0 / ((double)q * 2.0);
        double cosW0 = cos(w0);
        double scale = 1073741824.0 / (1.0 + alpha);
        coeff[0] = ((1.0 + cosW0) / 2.0) * scale;
        coeff[1] = -(1.0 + cosW0) * scale;
        coeff[2] = coeff[0];
        coeff[3] = (-2.0 * cosW0) * scale * -1;
        coeff[4] = (1.0 - alpha) * scale * -1;
        coeff[5] = 0;
        coeff[6] = 0;
        coeff[7] = 0;
    }

    void setHighShelf(float frequency, float gain, float slope = 1.0f) {
        double a = pow(10.0, gain / 40.0f);
        double w0 = frequency * (2.0f * 3.141592654f / AUDIO_SAMPLE_RATE_EXACT);
        double sinW0 = sin(w0);
        double cosW0 = cos(w0);
        double sinsq = sinW0 * sqrt((pow(a, 2.0) + 1.0) * (1.0 / (double)slope - 1.0) + 2.0 * a);
        double aMinus = (a - 1.0) * cosW0;
        double aPlus = (a + 1.0) * cosW0;
        double scale = 1073741824.0 / ((a + 1.0) - aMinus + sinsq);
        coeff[8] = a * ((a + 1.0) + aMinus + sinsq) * scale;
        coeff[9] = -2.0 * a * ((a - 1.0) + aPlus) * scale;
        coeff[10] = a * ((a + 1.0) + aMinus - sinsq) * scale;
        coeff[11] = 2.0 * ((a - 1.0) - aPlus) * scale * -1;
        coeff[12] = ((a + 1.0) - aMinus - sinsq) * scale * -1;
        coeff[13] = 0;
        coeff[14] = 0;
        coeff[15] = 0;
    }

public:
    AudioAnalyzeLUFS(void) : AudioStream(1, inputQueueArray) {
        ringIdx = 0;
        ringSize = std::size(ringBuffer);
        avail = false;
        setHighpass(37.5, 0.5);
        setHighShelf(1500, 4.0);
    };

    bool available(void) {
        return avail;
    }

    float readShort(void);
    float readRms(void);
    virtual void update(void);
};
