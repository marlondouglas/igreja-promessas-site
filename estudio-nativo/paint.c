#include "paint.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#pragma GCC diagnostic ignored "-Wcast-qual"
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#endif
#define STB_TRUETYPE_IMPLEMENTATION
#include "third_party/stb_truetype.h"
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#include "third_party/stb_image.h"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

/* Caminho original de logo-promessas.svg, sem redesenho. */
static const char *kLogoPath =
    "M453,22 L420,25 L376,33 L344,42 L296,61 L251,85 L218,107 L171,146 L142,176 L122,200 L93,243 L73,280 L51,334 L42,365 L33,410 L29,450 L29,505 L34,549 L46,603 L56,633 L72,671 L88,702 L120,751 L151,788 L175,812 L206,838 L240,862 L269,879 L319,902 L368,918 L411,927 L462,932 L497,932 L539,928 L576,921 L609,912 L663,891 L701,871 L732,851 L774,818 L811,781 L835,752 L862,712 L883,673 L901,630 L913,591 L921,553 L927,499 L927,454 L923,412 L916,374 L900,320 L888,291 L864,245 L841,210 L813,175 L785,146 L746,113 L710,88 L664,63 L631,49 L587,35 L543,26 L505,22Z "
    "M470,46 L505,47 L547,52 L587,61 L621,72 L649,84 L687,104 L719,125 L758,157 L787,186 L814,219 L841,260 L861,299 L873,329 L887,376 L895,419 L898,449 L898,505 L895,534 L885,585 L873,623 L861,653 L843,689 L813,735 L786,768 L756,798 L719,828 L687,849 L647,870 L609,885 L571,896 L529,904 L487,907 L448,906 L408,901 L369,892 L335,881 L302,867 L265,847 L222,817 L194,793 L167,765 L138,729 L111,686 L95,654 L81,619 L68,574 L60,529 L57,496 L57,456 L63,403 L72,363 L85,323 L98,292 L124,245 L147,212 L178,176 L208,148 L237,125 L269,104 L318,79 L359,64 L393,55 L421,50Z "
    "M474,120 L466,135 L447,159 L405,200 L312,279 L287,304 L261,338 L249,358 L239,380 L227,416 L221,453 L221,492 L224,515 L231,544 L244,579 L259,607 L276,631 L288,645 L316,671 L337,686 L375,705 L380,710 L391,735 L405,757 L420,776 L445,801 L480,827 L520,847 L544,855 L571,861 L608,864 L611,857 L611,850 L608,846 L587,845 L554,836 L526,823 L504,808 L491,797 L476,780 L465,762 L462,751 L461,734 L463,718 L472,693 L484,672 L528,613 L540,589 L547,563 L547,535 L542,549 L527,576 L480,634 L464,661 L455,690 L453,727 L450,733 L445,727 L438,701 L435,683 L435,649 L441,619 L448,599 L459,577 L474,555 L502,525 L565,470 L594,441 L613,417 L616,417 L626,429 L641,457 L649,479 L654,505 L654,551 L649,577 L642,597 L631,619 L620,635 L591,666 L569,682 L541,696 L512,705 L489,708 L488,713 L491,721 L495,723 L512,722 L552,713 L594,695 L621,678 L639,664 L669,633 L687,608 L702,580 L718,535 L725,489 L724,449 L715,404 L703,372 L679,329 L650,291 L622,261 L588,232 L568,288 L545,325 L524,350 L495,379 L428,441 L401,475 L379,517 L367,555 L361,597 L361,638 L364,664 L362,666 L354,661 L343,650 L322,622 L306,588 L299,560 L297,519 L300,493 L309,462 L324,432 L349,400 L447,306 L479,266 L493,243 L500,227 L508,194 L506,170 L494,140 L477,120Z";

static const char *kPixHead[] = {
    "ABRA SEU BANCO", "ESCOLHA PIX", "LEIA O QR CODE", "CONFIRA O RECEBEDOR", "ENVIE SUA OFERTA"
};
static const char *kPixBody[] = {
    "Acesse o aplicativo do seu banco",
    "Toque na opção Pix",
    "Escaneie o código da igreja",
    "Igreja Evangélica Ministério Promessas",
    "Simulação: Pix enviado"
};

struct Paint {
    stbtt_fontinfo font;
    unsigned char *ttf;
    int font_ok;
    uint8_t *logo;
    int logo_w, logo_h;
    uint8_t *banner;
    int ban_w, ban_h;
};

static int cross_ray(float x, float y, float x0, float y0, float x1, float y1) {
    float xhit;
    if ((y0 > y) == (y1 > y)) return 0;
    xhit = x0 + (y - y0) * (x1 - x0) / (y1 - y0);
    return xhit > x;
}

static void raster_logo(Paint *p) {
    float xs[900], ys[900];
    int n = 0, i, y, x, inside;
    const char *s = kLogoPath;
    float sx = 0, sy = 0, cx = 0, cy = 0;
    int have = 0;
    p->logo_w = 240;
    p->logo_h = 240;
    p->logo = (uint8_t *)calloc((size_t)p->logo_w * (size_t)p->logo_h, 1);
    if (!p->logo) return;
    while (*s && n < 890) {
        if (*s == 'M' || *s == 'L') {
            char cmd = *s++;
            float px, py;
            if (sscanf(s, "%f,%f", &px, &py) != 2) break;
            if (cmd == 'M') {
                if (have && n + 1 < 890) { xs[n] = sx; ys[n] = sy; n++; }
                sx = px; sy = py; have = 1;
            }
            xs[n] = px; ys[n] = py; n++;
            cx = px; cy = py;
        } else if (*s == 'Z') {
            if (have && n + 1 < 890) { xs[n] = sx; ys[n] = sy; n++; }
            have = 0;
            s++;
        } else s++;
        (void)cx; (void)cy;
    }
    for (y = 0; y < p->logo_h; y++) {
        for (x = 0; x < p->logo_w; x++) {
            float fx = ((float)x + 0.5f) * 960.f / (float)p->logo_w;
            float fy = ((float)y + 0.5f) * 958.f / (float)p->logo_h;
            inside = 0;
            for (i = 0; i + 1 < n; i++) {
                if (xs[i] == xs[i + 1] && ys[i] == ys[i + 1]) continue;
                inside ^= cross_ray(fx, fy, xs[i], ys[i], xs[i + 1], ys[i + 1]);
            }
            p->logo[(size_t)y * (size_t)p->logo_w + (size_t)x] = inside ? 255 : 0;
        }
    }
}

Paint *paint_open(const char *font_path) {
    Paint *p = (Paint *)calloc(1, sizeof *p);
    FILE *f;
    long n;
    if (!p) return NULL;
    raster_logo(p);
    if (!font_path) return p;
    f = fopen(font_path, "rb");
    if (!f) return p;
    fseek(f, 0, SEEK_END);
    n = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (n > 0 && n < 8000000) {
        p->ttf = (unsigned char *)malloc((size_t)n);
        if (p->ttf && fread(p->ttf, 1, (size_t)n, f) == (size_t)n)
            p->font_ok = stbtt_InitFont(&p->font, p->ttf, stbtt_GetFontOffsetForIndex(p->ttf, 0));
    }
    fclose(f);
    return p;
}

void paint_close(Paint *p) {
    if (!p) return;
    free(p->ttf);
    free(p->logo);
    free(p->banner);
    free(p);
}

int paint_font_ok(const Paint *p) { return p && p->font_ok; }

int paint_logo_hit(const Paint *p, int x, int y) {
    if (!p || !p->logo || x < 0 || y < 0 || x >= p->logo_w || y >= p->logo_h) return 0;
    return p->logo[(size_t)y * (size_t)p->logo_w + (size_t)x] > 0;
}

int paint_logo_size(const Paint *p, int *w, int *h) {
    if (!p) return 0;
    if (w) *w = p->logo_w;
    if (h) *h = p->logo_h;
    return p->logo != NULL;
}

int paint_set_banner_rgba(Paint *p, const uint8_t *rgba, int w, int h) {
    size_t n;
    if (!p || !rgba || w < 1 || h < 1) return 0;
    n = (size_t)w * (size_t)h * 4;
    free(p->banner);
    p->banner = (uint8_t *)malloc(n);
    if (!p->banner) return 0;
    memcpy(p->banner, rgba, n);
    p->ban_w = w;
    p->ban_h = h;
    return 1;
}

int paint_banner_size(const Paint *p, int *w, int *h) {
    if (!p || !p->banner) return 0;
    if (w) *w = p->ban_w;
    if (h) *h = p->ban_h;
    return 1;
}

int paint_load_banner(Paint *p, const char *path) {
    int w = 0, h = 0, ch = 0;
    unsigned char *px;
    if (!p || !path || !path[0]) return 0;
    px = stbi_load(path, &w, &h, &ch, 4);
    if (!px) return 0;
    free(p->banner);
    p->banner = px;
    p->ban_w = w;
    p->ban_h = h;
    return 1;
}

static void blend(uint8_t *px, int b, int g, int r, int a) {
    int inv;
    if (a <= 0) return;
    if (a >= 255) { px[0] = (uint8_t)b; px[1] = (uint8_t)g; px[2] = (uint8_t)r; px[3] = 255; return; }
    inv = 255 - a;
    px[0] = (uint8_t)((b * a + px[0] * inv) / 255);
    px[1] = (uint8_t)((g * a + px[1] * inv) / 255);
    px[2] = (uint8_t)((r * a + px[2] * inv) / 255);
    px[3] = (uint8_t)(a + px[3] * inv / 255);
}

static void fill(uint8_t *bgra, int w, int h, int x, int y, int rw, int rh, int b, int g, int r, int a) {
    int yy, xx;
    for (yy = 0; yy < rh; yy++) for (xx = 0; xx < rw; xx++) {
        int px = x + xx, py = y + yy;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        blend(bgra + ((size_t)py * (size_t)w + (size_t)px) * 4, b, g, r, a);
    }
}

static unsigned utf8_next(const char **s) {
    const unsigned char *p = (const unsigned char *)*s;
    unsigned c;
    if (!*p) return 0;
    if (*p < 0x80) { *s += 1; return *p; }
    if ((*p & 0xe0) == 0xc0 && p[1]) { c = (*p & 31u) << 6 | (p[1] & 63u); *s += 2; return c; }
    if ((*p & 0xf0) == 0xe0 && p[1] && p[2]) {
        c = (*p & 15u) << 12 | (p[1] & 63u) << 6 | (p[2] & 63u);
        *s += 3;
        return c;
    }
    *s += 1;
    return '?';
}

static void draw_text(Paint *p, uint8_t *bgra, int w, int h, int x, int y, float px, const char *text, int b, int g, int r, int alpha) {
    float scale, xpos;
    const char *s;
    if (!p || !p->font_ok || !text || !text[0] || alpha <= 0) return;
    scale = stbtt_ScaleForPixelHeight(&p->font, px);
    xpos = (float)x;
    s = text;
    while (*s) {
        unsigned cp = utf8_next(&s);
        int advance, lsb, gw, gh, gx, gy, ix, iy;
        unsigned char *bmp;
        if (!cp) break;
        if (cp == '\n') { xpos = (float)x; y += (int)px + 2; continue; }
        stbtt_GetCodepointHMetrics(&p->font, (int)cp, &advance, &lsb);
        bmp = stbtt_GetCodepointBitmap(&p->font, scale, scale, (int)cp, &gw, &gh, &gx, &gy);
        for (iy = 0; iy < gh; iy++) for (ix = 0; ix < gw; ix++) {
            int a = bmp ? bmp[iy * gw + ix] : 0;
            int dx = (int)xpos + gx + ix;
            int dy = y + gy + iy;
            if (a && dx >= 0 && dy >= 0 && dx < w && dy < h)
                blend(bgra + ((size_t)dy * (size_t)w + (size_t)dx) * 4, b, g, r, a * alpha / 255);
        }
        if (bmp) stbtt_FreeBitmap(bmp, NULL);
        xpos += advance * scale;
    }
}

static int text_width(Paint *p, float px, const char *text) {
    float scale, width = 0;
    const char *s = text;
    if (!p || !p->font_ok || !text) return 0;
    scale = stbtt_ScaleForPixelHeight(&p->font, px);
    while (*s) {
        unsigned cp = utf8_next(&s);
        int advance, lsb;
        if (!cp || cp == '\n') break;
        stbtt_GetCodepointHMetrics(&p->font, (int)cp, &advance, &lsb);
        width += advance * scale;
    }
    return (int)width;
}

static void draw_wrapped(Paint *p, uint8_t *bgra, int w, int h, int x, int y, int max_w, float px, const char *text, int b, int g, int r, int alpha) {
    char line[180];
    const char *s = text;
    int n = 0, line_y = y;
    if (!text) return;
    line[0] = 0;
    while (*s) {
        char word[80];
        int wn = 0;
        while (*s == ' ') s++;
        if (!*s) break;
        while (*s && *s != ' ' && wn < 78) word[wn++] = *s++;
        word[wn] = 0;
        if (n && text_width(p, px, line) + text_width(p, px, word) + 8 > max_w) {
            draw_text(p, bgra, w, h, x, line_y, px, line, b, g, r, alpha);
            line_y += (int)px + 4;
            n = 0;
            line[0] = 0;
        }
        if (n) line[n++] = ' ';
        memcpy(line + n, word, (size_t)wn);
        n += wn;
        line[n] = 0;
        if (line_y > y + (int)px * 4) break;
    }
    if (n) draw_text(p, bgra, w, h, x, line_y, px, line, b, g, r, alpha);
}

static void blit_logo(Paint *p, uint8_t *bgra, int w, int h, int cx, int cy, int diameter) {
    int y, x;
    if (!p || !p->logo || diameter < 2) return;
    for (y = 0; y < diameter; y++) for (x = 0; x < diameter; x++) {
        int sx = x * p->logo_w / diameter;
        int sy = y * p->logo_h / diameter;
        int a = p->logo[(size_t)sy * (size_t)p->logo_w + (size_t)sx];
        int dx = cx - diameter / 2 + x;
        int dy = cy - diameter / 2 + y;
        if (a && dx >= 0 && dy >= 0 && dx < w && dy < h)
            blend(bgra + ((size_t)dy * (size_t)w + (size_t)dx) * 4, 255, 255, 255, a);
    }
}

static void draw_orbit(uint8_t *bgra, int w, int h, int cx, int cy, int radius, int now_ms) {
    float a0 = (float)now_ms / 1000.f * 0.22f;
    int i;
    for (i = 0; i < 48; i++) {
        float a = a0 + (float)i / 48.f * 1.73f;
        int x = cx + (int)(cosf(a) * (float)radius);
        int y = cy + (int)(sinf(a) * (float)radius);
        if (x >= 0 && y >= 0 && x < w && y < h)
            blend(bgra + ((size_t)y * (size_t)w + (size_t)x) * 4, 147, 210, 246, 180);
    }
}

static void blit_banner(Paint *p, uint8_t *bgra, int w, int h, int x, int y, int dw, int dh, int alpha) {
    int yy, xx;
    if (!p || !p->banner || dw < 1 || dh < 1 || alpha <= 0) return;
    for (yy = 0; yy < dh; yy++) for (xx = 0; xx < dw; xx++) {
        int sx = xx * p->ban_w / dw;
        int sy = yy * p->ban_h / dh;
        const uint8_t *s = p->banner + ((size_t)sy * (size_t)p->ban_w + (size_t)sx) * 4;
        int dx = x + xx, dy = y + yy;
        int a = s[3] * alpha / 255;
        if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
        blend(bgra + ((size_t)dy * (size_t)w + (size_t)dx) * 4, s[2], s[1], s[0], a);
    }
}

void paint_frame(Paint *p, uint8_t *bgra, int w, int h, const CardView *view, const CardDoc *doc,
                 const char *service_title, int now_ms, int live_started_ms, int badge) {
    int diameter = h >= 1000 ? 64 : 48;
    int cx = 38, cy = 34;
    int alpha = 255;
    const char *head = doc ? doc->heading : "";
    const char *body = doc ? doc->message : "";
    const char *ref = doc ? doc->reference : "";
    if (!bgra || w < 16 || h < 16) return;
    memset(bgra, 0, (size_t)w * (size_t)h * 4);
    fill(bgra, w, h, 12, 12, 320, 46, 24, 13, 7, 190);
    blit_logo(p, bgra, w, h, cx, cy, diameter);
    draw_orbit(bgra, w, h, cx, cy, (int)(diameter * 0.62f), now_ms);
    draw_text(p, bgra, w, h, 70, 32, 16, service_title && service_title[0] ? service_title : "IGREJA MINISTÉRIO PROMESSAS", 222, 242, 255, 255);
    if (badge) {
        fill(bgra, w, h, w - 122, 14, 108, 28, 43, 31, 144, 240);
        draw_text(p, bgra, w, h, w - 78, 32, 13, "NO AR", 238, 249, 255, 255);
    }
    if (!view) return;
    alpha = (int)(view->alpha * 255.f);
    if (alpha < 8) alpha = view->layer == CARD_SERVICE ? 230 : 0;
    if (view->layer == CARD_MESSAGE && doc && strcmp(doc->type, "pix_animation") == 0 && live_started_ms) {
        int step = (int)((now_ms - live_started_ms) / 3250);
        if (step < 0) step = 0;
        head = kPixHead[step % 5];
        body = kPixBody[step % 5];
        ref = "PIX: iemp.promessas@gmail.com";
    }
    if (view->place == CARD_FULL && view->layer == CARD_MESSAGE)
        fill(bgra, w, h, 0, 0, w, h, 37, 23, 16, alpha * 200 / 255);
    if (view->w > 0 && view->h > 0 && alpha > 0) {
        fill(bgra, w, h, view->x, view->y, view->w, view->h, 32, 20, 13, alpha * 220 / 255);
        fill(bgra, w, h, view->x, view->y, 4, view->h, 138, 193, 229, alpha);
        if (view->layer == CARD_MESSAGE) {
            if (p && p->banner && view->media_w > 0 && view->media_h > 0)
                blit_banner(p, bgra, w, h, view->media_x, view->media_y, view->media_w, view->media_h, alpha);
            draw_text(p, bgra, w, h, view->x + 16, view->y + 28, 22, head, 176, 221, 247, alpha);
            draw_wrapped(p, bgra, w, h, view->x + 16, view->y + 58, view->w - view->media_w - 48, 18, body, 212, 224, 230, alpha);
            draw_text(p, bgra, w, h, view->x + 16, view->y + view->h - 22, 15, ref, 155, 197, 233, alpha);
        } else {
            draw_text(p, bgra, w, h, view->x + 16, view->y + view->h / 2 + 6, 20, service_title && service_title[0] ? service_title : "CULTO", 222, 242, 255, alpha);
        }
    }
}

void sting_fill(int16_t *stereo, int frames, int rate) {
    static const float hz[3] = {392.f, 493.88f, 587.33f};
    static const float gain[3] = {0.47f, 0.23f, 0.16f};
    int i, k;
    if (!stereo || frames < 1 || rate < 1) return;
    for (i = 0; i < frames; i++) {
        float t = (float)i / (float)rate;
        float env, sample = 0;
        if (t < 0.10f) env = 0.0001f + (0.045f - 0.0001f) * (t / 0.10f);
        else if (t < 0.73f) env = 0.045f + (0.0001f - 0.045f) * ((t - 0.10f) / 0.63f);
        else env = 0;
        for (k = 0; k < 3; k++) {
            float tk = t - k * 0.045f;
            if (tk > 0 && tk < 0.73f) sample += sinf(2.f * 3.1415926f * hz[k] * tk) * gain[k];
        }
        sample = sample * env * 32767.f;
        if (sample > 32767.f) sample = 32767.f;
        if (sample < -32767.f) sample = -32767.f;
        stereo[i * 2] = stereo[i * 2 + 1] = (int16_t)sample;
    }
}

void mix_stereo(int16_t *dst, const int16_t *program, const int16_t *music, int frames,
                float program_gain, float music_gain, const int16_t *sting, float sting_gain) {
    int i;
    if (!dst || frames < 1) return;
    for (i = 0; i < frames * 2; i++) {
        float v = 0;
        if (program) v += program[i] * program_gain;
        if (music) v += music[i] * music_gain;
        if (sting) v += sting[i] * sting_gain;
        if (v > 32767.f) v = 32767.f;
        if (v < -32768.f) v = -32768.f;
        dst[i] = (int16_t)v;
    }
}
