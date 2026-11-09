#ifndef ESTUDIO_PAINT_H
#define ESTUDIO_PAINT_H

#include "core.h"
#include <stdint.h>

typedef struct Paint Paint;

Paint *paint_open(const char *font_path);
void paint_close(Paint *p);
int paint_font_ok(const Paint *p);
int paint_logo_hit(const Paint *p, int x, int y);
int paint_logo_size(const Paint *p, int *w, int *h);
int paint_load_banner(Paint *p, const char *path);
int paint_banner_size(const Paint *p, int *w, int *h);
int paint_set_banner_rgba(Paint *p, const uint8_t *rgba, int w, int h);
void paint_frame(Paint *p, uint8_t *bgra, int w, int h, const CardView *view, const CardDoc *doc,
                 const char *service_title, int now_ms, int live_started_ms, int badge);
void sting_fill(int16_t *stereo, int frames, int rate);
void mix_stereo(int16_t *dst, const int16_t *program, const int16_t *music, int frames,
                float program_gain, float music_gain, const int16_t *sting, float sting_gain);

#endif
