#include "analyze_lufs.h"
#include "utility/dspinst.h"

void AudioAnalyzeLUFS::update() {
    int64_t accum = 0;
    uint32_t count = 0;
    audio_block_t* block = receiveWritable();
    if (!block) {
        return;
    }

    int32_t b0, b1, b2, a1, a2, sum;
    uint32_t in2, out2, bprev, aprev;
    uint32_t *data, *end;

    end = (uint32_t*)(block->data) + AUDIO_BLOCK_SAMPLES / 2;

    // Run the two biquad stages for pre-filtering
    for (size_t stage = 0; stage < 2; stage++) {
        b0 = coeff[stage * 8 + 0];
        b1 = coeff[stage * 8 + 1];
        b2 = coeff[stage * 8 + 2];
        a1 = coeff[stage * 8 + 3];
        a2 = coeff[stage * 8 + 4];
        bprev = coeff[stage * 8 + 5];
        aprev = coeff[stage * 8 + 6];
        sum = coeff[stage * 8 + 7];
        data = end - AUDIO_BLOCK_SAMPLES / 2;
        do {
            in2 = *data;
            sum = signed_multiply_accumulate_32x16b(sum, b0, in2);
            sum = signed_multiply_accumulate_32x16t(sum, b1, bprev);
            sum = signed_multiply_accumulate_32x16b(sum, b2, bprev);
            sum = signed_multiply_accumulate_32x16t(sum, a1, aprev);
            sum = signed_multiply_accumulate_32x16b(sum, a2, aprev);
            out2 = signed_saturate_rshift(sum, 16, 14);
            sum = signed_multiply_accumulate_32x16t(sum, b0, in2);
            sum = signed_multiply_accumulate_32x16b(sum, b1, in2);
            sum = signed_multiply_accumulate_32x16t(sum, b2, bprev);
            sum = signed_multiply_accumulate_32x16b(sum, a1, out2);
            sum = signed_multiply_accumulate_32x16t(sum, a2, aprev);
            aprev = pack_16b_16b(
                signed_saturate_rshift(sum, 16, 14), out2);
            bprev = in2;
            *data++ = aprev;
        }
        while (data < end);
        coeff[stage * 8 + 7] = sum;
        coeff[stage * 8 + 6] = aprev;
        coeff[stage * 8 + 5] = bprev;
    }

    // Get the block RMS, but only the square part for now
    uint32_t* p = (uint32_t*)(block->data);
    int64_t rsum = accum;
    do {
        uint32_t n1 = *p++;
        uint32_t n2 = *p++;
        uint32_t n3 = *p++;
        uint32_t n4 = *p++;
        rsum = multiply_accumulate_16tx16t_add_16bx16b(rsum, n1, n1);
        rsum = multiply_accumulate_16tx16t_add_16bx16b(rsum, n2, n2);
        rsum = multiply_accumulate_16tx16t_add_16bx16b(rsum, n3, n3);
        rsum = multiply_accumulate_16tx16t_add_16bx16b(rsum, n4, n4);
    }
    while (p < end);
    count++;

    ringBuffer[ringIdx++] = rsum / (count * AUDIO_BLOCK_SAMPLES);;
    ringIdx %= ringSize;
    avail = true;

    release(block);
}

float AudioAnalyzeLUFS::readShort() {
    uint64_t sum = 0;
    __disable_irq();
    for (size_t i = 0; i < ringSize; i++) {
        sum += ringBuffer[i];
    }
    avail = false;
    __enable_irq();
    return sqrtf(sum / ringSize) / 32767.0;
}

float AudioAnalyzeLUFS::readRms() {
    __disable_irq();
    size_t prevIdx = ringIdx - 1;
    if (ringIdx < 0) {
        prevIdx = ringSize - 1;
    }
    avail = false;
    auto val = ringBuffer[ringIdx];
    __enable_irq();
    return sqrtf(val) / 32767.0;
}
