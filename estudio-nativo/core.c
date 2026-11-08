#include "core.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *kEncode[] = {
    "-c:v", "libx264", "-profile:v", "baseline", "-level:v", "3.1",
    "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-tune", "zerolatency",
    "-bf", "0", "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
    "-b:v", "1800k", "-maxrate", "2400k", "-bufsize", "3600k",
    "-c:a", "aac", "-profile:a", "aac_low", "-ar", "48000", "-ac", "2", "-b:a", "128k"
};

void secure_wipe(void *ptr, size_t len) {
    volatile unsigned char *p = (volatile unsigned char *)ptr;
    size_t i;
    if (!p) return;
    for (i = 0; i < len; i++) p[i] = 0;
}

int args_push(ArgList *list, const char *text) {
    char *copy;
    char **next;
    if (!list || !text) return 0;
    copy = (char *)malloc(strlen(text) + 1);
    if (!copy) return 0;
    memcpy(copy, text, strlen(text) + 1);
    next = (char **)realloc(list->items, (size_t)(list->count + 1) * sizeof(char *));
    if (!next) { free(copy); return 0; }
    list->items = next;
    list->items[list->count++] = copy;
    return 1;
}

void args_free(ArgList *list) {
    int i;
    if (!list) return;
    for (i = 0; i < list->count; i++) {
        secure_wipe(list->items[i], strlen(list->items[i]));
        free(list->items[i]);
    }
    free(list->items);
    list->items = NULL;
    list->count = 0;
}

int args_contains(const ArgList *list, const char *text) {
    int i;
    if (!list || !text) return 0;
    for (i = 0; i < list->count; i++) if (strcmp(list->items[i], text) == 0) return 1;
    return 0;
}

char *args_join(const ArgList *list) {
    size_t n = 1;
    int i;
    char *out;
    if (!list) return NULL;
    for (i = 0; i < list->count; i++) n += strlen(list->items[i]) + 1;
    out = (char *)malloc(n);
    if (!out) return NULL;
    out[0] = 0;
    for (i = 0; i < list->count; i++) {
        if (i) strcat(out, " ");
        strcat(out, list->items[i]);
    }
    return out;
}

int url_encode(const char *in, char *out, size_t out_cap) {
    static const char *hex = "0123456789ABCDEF";
    size_t o = 0;
    if (!in || !out || out_cap == 0) return 0;
    for (; *in; in++) {
        unsigned char c = (unsigned char)*in;
        int safe = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
            || c == '-' || c == '_' || c == '.' || c == '~';
        if (safe) {
            if (o + 1 >= out_cap) return 0;
            out[o++] = (char)c;
        } else {
            if (o + 3 >= out_cap) return 0;
            out[o++] = '%';
            out[o++] = hex[c >> 4];
            out[o++] = hex[c & 15];
        }
    }
    out[o] = 0;
    return 1;
}

int remote_path_allowed(const char *path) {
    if (!path) return 0;
    return strcmp(path, ESTUDIO_PATH_PHONE) == 0 || strcmp(path, ESTUDIO_PATH_PC) == 0;
}

int build_rtmp_url(char *out, size_t out_cap, const char *host, int port, const char *path, const char *key) {
    char encoded[512];
    if (!out || !host || !*host || !remote_path_allowed(path) || port < 1 || port > 65535) return 0;
    if (strchr(host, '@') || strchr(host, ' ') || strchr(host, '/')) return 0;
    if (key && *key) {
        if (!url_encode(key, encoded, sizeof encoded)) return 0;
        if ((size_t)snprintf(out, out_cap, "rtmp://%s:%s@%s:%d/%s", ESTUDIO_USER, encoded, host, port, path) >= out_cap)
            return 0;
    } else if ((size_t)snprintf(out, out_cap, "rtmp://%s:%d/%s", host, port, path) >= out_cap) {
        return 0;
    }
    return 1;
}

LinkState link_from_ffmpeg_line(const char *line) {
    if (!line || !*line) return LINK_CONNECTING;
    if (strstr(line, "401") || strstr(line, "Unauthorized") || strstr(line, "auth")) return LINK_AUTH;
    if (strstr(line, "Connection refused") || strstr(line, "Error opening") || strstr(line, "I/O error")
        || strstr(line, "End of file") || strstr(line, "Connection timed out")) return LINK_DOWN;
    if (strstr(line, "frame=") || strstr(line, "Output #0")) return LINK_UP;
    return LINK_CONNECTING;
}

int build_rtsp_url(char *out, size_t out_cap, const char *host, int port, const char *key) {
    char encoded[512];
    if (!out || !host || !*host || port < 1 || port > 65535) return 0;
    if (strchr(host, '@') || strchr(host, ' ') || strchr(host, '/')) return 0;
    if (key && *key) {
        if (!url_encode(key, encoded, sizeof encoded)) return 0;
        if ((size_t)snprintf(out, out_cap, "rtsp://%s:%s@%s:%d%s", ESTUDIO_USER, encoded, host, port, ESTUDIO_RTSP_PATH) >= out_cap)
            return 0;
    } else if ((size_t)snprintf(out, out_cap, "rtsp://%s:%d%s", host, port, ESTUDIO_RTSP_PATH) >= out_cap) {
        return 0;
    }
    return 1;
}

static int push_encode(ArgList *out) {
    size_t i;
    for (i = 0; i < sizeof kEncode / sizeof kEncode[0]; i++) {
        if (!args_push(out, kEncode[i])) return 0;
    }
    return 1;
}

static int push_tail(ArgList *out, const char *url) {
    return args_push(out, "-f") && args_push(out, "rtsp") && args_push(out, "-rtsp_transport")
        && args_push(out, "tcp") && args_push(out, url);
}

int publish_build(const PublishSpec *spec, ArgList *out, char *err, size_t err_cap) {
    char url[768];
    char duration[16];
    const char *host = spec && spec->host && *spec->host ? spec->host : "127.0.0.1";
    int port = spec && spec->port ? spec->port : 8554;
    if (!spec || !out) return 0;
    memset(out, 0, sizeof *out);
    if (!build_rtsp_url(url, sizeof url, host, port, spec->key)) {
        if (err && err_cap) snprintf(err, err_cap, "Endereço RTSP inválido.");
        return 0;
    }
    if (!args_push(out, "ffmpeg") || !args_push(out, "-hide_banner") || !args_push(out, "-loglevel")
        || !args_push(out, "warning") || !args_push(out, "-nostdin")) return 0;
    if (spec->scene == SCENE_COUNTDOWN) {
        snprintf(duration, sizeof duration, "%d", ESTUDIO_COUNTDOWN_SEC);
        if (!args_push(out, "-re") || !args_push(out, "-f") || !args_push(out, "lavfi")
            || !args_push(out, "-i") || !args_push(out, "color=c=0x101010:s=1280x720:r=24")
            || !args_push(out, "-f") || !args_push(out, "lavfi") || !args_push(out, "-i")
            || !args_push(out, "anullsrc=r=48000:cl=stereo") || !args_push(out, "-t")
            || !args_push(out, duration)) return 0;
    } else if (spec->scene == SCENE_OPENING || spec->scene == SCENE_CLOSING) {
        int sec = scene_seconds(spec->scene, spec->test_mode);
        if (!spec->media || !*spec->media) {
            if (err && err_cap) snprintf(err, err_cap, "Arquivo da cena não foi encontrado.");
            args_free(out);
            return 0;
        }
        snprintf(duration, sizeof duration, "%d", sec);
        if (!args_push(out, "-re") || !args_push(out, "-i") || !args_push(out, spec->media)
            || !args_push(out, "-t") || !args_push(out, duration)
            || !args_push(out, "-vf")
            || !args_push(out, "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p"))
            return 0;
    } else if (spec->scene == SCENE_FINAL) {
        snprintf(duration, sizeof duration, "%d", ESTUDIO_FINAL_SEC);
        if (!spec->media || !*spec->media) {
            if (err && err_cap) snprintf(err, err_cap, "Arte final não foi encontrada.");
            args_free(out);
            return 0;
        }
        if (!args_push(out, "-loop") || !args_push(out, "1") || !args_push(out, "-i") || !args_push(out, spec->media)
            || !args_push(out, "-f") || !args_push(out, "lavfi") || !args_push(out, "-i")
            || !args_push(out, "anullsrc=r=48000:cl=stereo") || !args_push(out, "-t")
            || !args_push(out, duration)) return 0;
    } else if (spec->scene == SCENE_CAMERA) {
        char input[400];
        if (!spec->camera || !*spec->camera) {
            if (err && err_cap) snprintf(err, err_cap, "Nenhuma câmera disponível. Atualize os dispositivos.");
            args_free(out);
            return 0;
        }
        if (spec->mic && *spec->mic) snprintf(input, sizeof input, "video=%s:audio=%s", spec->camera, spec->mic);
        else snprintf(input, sizeof input, "video=%s", spec->camera);
        if (!args_push(out, "-f") || !args_push(out, "dshow") || !args_push(out, "-rtbufsize")
            || !args_push(out, "100M") || !args_push(out, "-framerate") || !args_push(out, "24")
            || !args_push(out, "-i") || !args_push(out, input)) return 0;
        if (!spec->mic || !*spec->mic) {
            if (!args_push(out, "-f") || !args_push(out, "lavfi") || !args_push(out, "-i")
                || !args_push(out, "anullsrc=r=48000:cl=stereo")) return 0;
        }
        if (spec->overlay && !args_push(out, "-f") && !args_push(out, "rawvideo")) return 0;
        if (spec->overlay && (!args_push(out, "-f") || !args_push(out, "rawvideo") || !args_push(out, "-pixel_format")
            || !args_push(out, "bgra") || !args_push(out, "-video_size") || !args_push(out, "1280x720")
            || !args_push(out, "-framerate") || !args_push(out, "12") || !args_push(out, "-i")
            || !args_push(out, "pipe:0"))) return 0;
    } else if (spec->scene == SCENE_SCREEN) {
        if (!args_push(out, "-f") || !args_push(out, "gdigrab") || !args_push(out, "-framerate")
            || !args_push(out, "24") || !args_push(out, "-i") || !args_push(out, "desktop")) return 0;
        if (spec->mic && *spec->mic) {
            char input[300];
            snprintf(input, sizeof input, "audio=%s", spec->mic);
            if (!args_push(out, "-f") || !args_push(out, "dshow") || !args_push(out, "-i")
                || !args_push(out, input)) return 0;
        } else if (!args_push(out, "-f") || !args_push(out, "lavfi") || !args_push(out, "-i")
            || !args_push(out, "anullsrc=r=48000:cl=stereo")) return 0;
        if (spec->overlay && (!args_push(out, "-f") || !args_push(out, "rawvideo") || !args_push(out, "-pixel_format")
            || !args_push(out, "bgra") || !args_push(out, "-video_size") || !args_push(out, "1280x720")
            || !args_push(out, "-framerate") || !args_push(out, "12") || !args_push(out, "-i")
            || !args_push(out, "pipe:0"))) return 0;
    } else if (spec->scene == SCENE_PULL_PHONE || spec->scene == SCENE_PULL_PC) {
        char pull[256];
        const char *path = spec->scene == SCENE_PULL_PHONE ? ESTUDIO_PATH_PHONE : ESTUDIO_PATH_PC;
        snprintf(pull, sizeof pull, "rtsp://127.0.0.1:8554/%s", path);
        if (!args_push(out, "-rtsp_transport") || !args_push(out, "tcp") || !args_push(out, "-i") || !args_push(out, pull)
            || !args_push(out, "-vf")
            || !args_push(out, "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p"))
            return 0;
    } else if (spec->scene == SCENE_PUBLISH_PC) {
        char url_in[768];
        char input[400];
        if (!spec->camera || !*spec->camera) {
            if (err && err_cap) snprintf(err, err_cap, "Escolha a webcam.");
            args_free(out);
            return 0;
        }
        if (!build_rtmp_url(url_in, sizeof url_in, host, port ? port : 1935, ESTUDIO_PATH_PC, spec->key)) {
            if (err && err_cap) snprintf(err, err_cap, "IP do notebook inválido.");
            args_free(out);
            return 0;
        }
        if (spec->mic && *spec->mic) snprintf(input, sizeof input, "video=%s:audio=%s", spec->camera, spec->mic);
        else snprintf(input, sizeof input, "video=%s", spec->camera);
        if (!args_push(out, "-f") || !args_push(out, "dshow") || !args_push(out, "-framerate") || !args_push(out, "24")
            || !args_push(out, "-i") || !args_push(out, input)) return 0;
        if (!spec->mic || !*spec->mic) {
            if (!args_push(out, "-f") || !args_push(out, "lavfi") || !args_push(out, "-i")
                || !args_push(out, "anullsrc=r=48000:cl=stereo")) return 0;
        }
        if (!push_encode(out) || !args_push(out, "-f") || !args_push(out, "flv") || !args_push(out, url_in)) {
            args_free(out);
            return 0;
        }
        return 1;
    } else {
        if (err && err_cap) snprintf(err, err_cap, "Cena desconhecida.");
        args_free(out);
        return 0;
    }
    if (spec->overlay && (spec->scene == SCENE_CAMERA || spec->scene == SCENE_SCREEN)) {
        const char *graph = "[0:v]scale=1280:720,format=yuv420p[b];[1:v]format=bgra[o];[b][o]overlay=0:0:format=auto,format=yuv420p[v]";
        const char *amap = (spec->scene == SCENE_CAMERA && spec->mic && *spec->mic) ? "0:a" : "1:a";
        if (spec->scene == SCENE_SCREEN && spec->mic && *spec->mic) amap = "1:a";
        if (spec->scene == SCENE_CAMERA && spec->overlay && spec->mic && *spec->mic) amap = "0:a";
        if (!args_push(out, "-filter_complex") || !args_push(out, graph) || !args_push(out, "-map")
            || !args_push(out, "[v]") || !args_push(out, "-map") || !args_push(out, amap)) {
            args_free(out);
            return 0;
        }
    }
    if (!push_encode(out) || !push_tail(out, url)) {
        args_free(out);
        return 0;
    }
    return 1;
}

char *redact_text(const char *text, const char *secret) {
    char *out;
    char *hit;
    size_t secret_n;
    if (!text) return NULL;
    out = (char *)malloc(strlen(text) + 1);
    if (!out) return NULL;
    memcpy(out, text, strlen(text) + 1);
    if (secret && *secret) {
        secret_n = strlen(secret);
        hit = out;
        while ((hit = strstr(hit, secret)) != NULL) {
            memset(hit, '*', secret_n);
            hit += secret_n;
        }
    }
    {
        const char *schemes[] = {"rtsp://", "rtmp://"};
        size_t s;
        for (s = 0; s < 2; s++) {
            hit = out;
            while ((hit = strstr(hit, schemes[s])) != NULL) {
                char *at = strchr(hit, '@');
                char *slash = strchr(hit + 7, '/');
                if (at && slash && at < slash) memmove(hit + 7, at + 1, strlen(at + 1) + 1);
                hit += 7;
            }
        }
    }
    return out;
}

int dshow_collect(const char *text, char video[][160], int *video_count, int video_max,
                  char audio[][160], int *audio_count, int audio_max) {
    const char *p = text;
    if (!text || !video_count || !audio_count) return 0;
    *video_count = 0;
    *audio_count = 0;
    while ((p = strchr(p, '"')) != NULL) {
        const char *end = strchr(p + 1, '"');
        char name[160];
        size_t n;
        int is_audio;
        if (!end) break;
        n = (size_t)(end - (p + 1));
        if (n > 0 && n < sizeof name) {
            memcpy(name, p + 1, n);
            name[n] = 0;
            is_audio = strstr(end, "(audio)") && (strstr(end, "(audio)") - end) < 24;
            if (is_audio && *audio_count < audio_max) {
                memcpy(audio[*audio_count], name, n + 1);
                (*audio_count)++;
            } else if (!is_audio && strstr(end, "(video)") && (strstr(end, "(video)") - end) < 24
                && *video_count < video_max) {
                memcpy(video[*video_count], name, n + 1);
                (*video_count)++;
            }
        }
        p = end + 1;
    }
    return 1;
}

int hls_has_aac_video(const char *manifest) {
    if (!manifest || !strstr(manifest, "#EXTM3U")) return 0;
    if (!strstr(manifest, "avc1")) return 0;
    if (!strstr(manifest, "mp4a.40")) return 0;
    if (strstr(manifest, "opus")) return 0;
    if (strstr(manifest, "#EXT-X-ENDLIST")) return 0;
    return strstr(manifest, "#EXTINF:") || strstr(manifest, "#EXT-X-STREAM-INF:") ? 1 : 0;
}

int ini_read_paths(const char *text, int *rejected_secret) {
    const char *p;
    if (rejected_secret) *rejected_secret = 0;
    if (!text) return 0;
    for (p = text; *p; ) {
        const char *eol = strchr(p, '\n');
        size_t n = eol ? (size_t)(eol - p) : strlen(p);
        if (n >= 6 && (strncmp(p, "senha=", 6) == 0 || strncmp(p, "password=", 9) == 0)) {
            if (rejected_secret) *rejected_secret = 1;
        }
        if (!eol) break;
        p = eol + 1;
    }
    return 1;
}

int scene_seconds(SceneKind scene, int test_mode) {
    if (scene == SCENE_COUNTDOWN) return ESTUDIO_COUNTDOWN_SEC;
    if (scene == SCENE_OPENING) return test_mode ? ESTUDIO_OPENING_TEST_SEC : ESTUDIO_OPENING_SEC;
    if (scene == SCENE_CLOSING) return test_mode ? ESTUDIO_CLOSING_TEST_SEC : ESTUDIO_CLOSING_SEC;
    if (scene == SCENE_FINAL) return ESTUDIO_FINAL_SEC;
    return 0;
}

const char *scene_label(SceneKind scene) {
    if (scene == SCENE_COUNTDOWN) return "10s Contagem";
    if (scene == SCENE_OPENING) return "Abertura";
    if (scene == SCENE_CAMERA) return "Câmera";
    if (scene == SCENE_SCREEN) return "Tela";
    if (scene == SCENE_PULL_PHONE) return "Celular";
    if (scene == SCENE_PULL_PC) return "Câmera do PC";
    if (scene == SCENE_PUBLISH_PC) return "Enviando webcam";
    if (scene == SCENE_CLOSING) return "Encerramento";
    if (scene == SCENE_FINAL) return "Arte final";
    return "Em espera";
}

int key_blob_save(const uint8_t *blob, size_t n, const char *path) {
    FILE *f;
    if (!blob || !n || !path) return 0;
    f = fopen(path, "wb");
    if (!f) return 0;
    if (fwrite(blob, 1, n, f) != n) { fclose(f); remove(path); return 0; }
    fclose(f);
    return 1;
}

int key_blob_load(uint8_t **blob, size_t *n, const char *path) {
    FILE *f;
    long sz;
    uint8_t *buf;
    if (!blob || !n || !path) return 0;
    *blob = NULL;
    *n = 0;
    f = fopen(path, "rb");
    if (!f) return 0;
    if (fseek(f, 0, SEEK_END) != 0) { fclose(f); return 0; }
    sz = ftell(f);
    if (sz <= 0 || sz > 65536) { fclose(f); return 0; }
    rewind(f);
    buf = (uint8_t *)malloc((size_t)sz);
    if (!buf || fread(buf, 1, (size_t)sz, f) != (size_t)sz) {
        free(buf);
        fclose(f);
        return 0;
    }
    fclose(f);
    *blob = buf;
    *n = (size_t)sz;
    return 1;
}

int key_blob_clear(const char *path) {
    return path && remove(path) == 0;
}

int vault_test_protect(const uint8_t *plain, size_t n, uint8_t **out, size_t *out_n) {
    size_t i;
    uint8_t *buf;
    if (!plain || !n || n > 400 || !out || !out_n) return 0;
    buf = (uint8_t *)malloc(n + 8);
    if (!buf) return 0;
    memcpy(buf, "IPTEST1", 7);
    buf[7] = (uint8_t)n;
    for (i = 0; i < n; i++) buf[8 + i] = (uint8_t)(plain[i] ^ 0x5Au);
    *out = buf;
    *out_n = n + 8;
    return 1;
}

int vault_test_unprotect(const uint8_t *blob, size_t n, uint8_t **out, size_t *out_n) {
    size_t len, i;
    uint8_t *buf;
    if (!blob || n < 9 || !out || !out_n) return 0;
    if (memcmp(blob, "IPTEST1", 7) != 0) return 0;
    len = blob[7];
    if (len != n - 8 || len == 0) return 0;
    buf = (uint8_t *)malloc(len + 1);
    if (!buf) return 0;
    for (i = 0; i < len; i++) buf[i] = (uint8_t)(blob[8 + i] ^ 0x5Au);
    buf[len] = 0;
    *out = buf;
    *out_n = len;
    return 1;
}

int key_store(VaultProtectFn protect, const char *path, const char *key) {
    uint8_t *blob = NULL;
    size_t n = 0;
    int ok;
    if (!protect || !path || !key || strlen(key) < 8) return 0;
    if (!protect((const uint8_t *)key, strlen(key), &blob, &n)) return 0;
    ok = key_blob_save(blob, n, path);
    secure_wipe(blob, n);
    free(blob);
    return ok;
}

int key_restore(VaultUnprotectFn unprotect, const char *path, char *key, size_t key_cap) {
    uint8_t *blob = NULL, *plain = NULL;
    size_t n = 0, pn = 0;
    if (!unprotect || !path || !key || key_cap < 9) return -1;
    key[0] = 0;
    if (!key_blob_load(&blob, &n, path)) return 1;
    if (!unprotect(blob, n, &plain, &pn) || pn + 1 > key_cap) {
        secure_wipe(blob, n);
        free(blob);
        if (plain) { secure_wipe(plain, pn); free(plain); }
        return -1;
    }
    memcpy(key, plain, pn);
    key[pn] = 0;
    secure_wipe(blob, n);
    secure_wipe(plain, pn);
    free(blob);
    free(plain);
    return 0;
}

void card_doc_init(CardDoc *doc) {
    if (!doc) return;
    memset(doc, 0, sizeof *doc);
    memcpy(doc->type, "verse", 6);
    memcpy(doc->heading, "PALAVRA DE DEUS", 16);
    memcpy(doc->style, "gold", 5);
    doc->place = CARD_LOWER;
    doc->seconds = 20;
    doc->transition_sound = 0;
}

int card_duration_ok(int seconds) {
    return seconds > 0 && seconds <= 600;
}

void card_apply(const CardDoc *draft, CardLive *live, int now_ms) {
    if (!draft || !live) return;
    if (!card_duration_ok(draft->seconds) && draft->seconds != 0) return;
    if (!draft->heading[0] && !draft->message[0]) return;
    live->doc = *draft;
    live->active = 1;
    live->started_ms = now_ms;
    live->until_ms = draft->seconds > 0 ? now_ms + draft->seconds * 1000 : 0;
}

void card_stop(CardLive *live, int now_ms) {
    if (!live) return;
    live->active = 0;
    live->until_ms = now_ms;
}

static float fade(int now_ms, int started_ms, int until_ms, int active) {
    const int intro = 450, outro = 450;
    int held;
    if (!active) {
        held = now_ms - until_ms;
        if (held < 0) return 0;
        if (held >= outro) return 0;
        return 1.f - (float)held / (float)outro;
    }
    held = now_ms - started_ms;
    if (held < intro) return (float)held / (float)intro;
    return 1.f;
}

void card_compose(const CardDoc *draft, const CardLive *live, int now_ms, int canvas_w, int canvas_h,
                  CardView *preview, CardView *on_air) {
    CardView blank;
    int bw, bh, bx, by;
    memset(&blank, 0, sizeof blank);
    blank.layer = CARD_SERVICE;
    blank.place = CARD_LOWER;
    blank.alpha = 1.f;
    if (canvas_w < 2) canvas_w = 1280;
    if (canvas_h < 2) canvas_h = 720;
    bw = canvas_w * 90 / 100;
    bh = canvas_h * 16 / 100;
    bx = (canvas_w - bw) / 2;
    by = canvas_h - bh - canvas_h / 40;
    blank.x = bx; blank.y = by; blank.w = bw; blank.h = bh;
    if (preview) {
        *preview = blank;
        if (draft && (draft->heading[0] || draft->message[0] || draft->banner[0])) {
            preview->layer = CARD_MESSAGE;
            preview->place = draft->place;
            preview->alpha = 1.f;
            preview->ratio = banner_ratio(draft->banner_w, draft->banner_h);
            if (draft->place == CARD_FULL) {
                preview->x = canvas_w / 12; preview->y = canvas_h / 10;
                preview->w = canvas_w - 2 * preview->x; preview->h = canvas_h - 2 * preview->y;
            }
            banner_contain(draft->banner_w, draft->banner_h, preview->w * 2 / 5, preview->h * 3 / 5,
                           &preview->media_w, &preview->media_h);
            preview->media_x = preview->x + preview->w - preview->media_w - 16;
            preview->media_y = preview->y + (preview->h - preview->media_h) / 2;
        }
    }
    if (!on_air) return;
    *on_air = blank;
    if (!live || (!live->active && now_ms - live->until_ms >= 450)) return;
    on_air->layer = live->active || now_ms < live->until_ms + 450 ? CARD_MESSAGE : CARD_SERVICE;
    if (!live->active && now_ms - live->until_ms >= 450) on_air->layer = CARD_SERVICE;
    if (live->doc.heading[0] || live->doc.message[0] || live->doc.banner[0]) {
        if (live->active || now_ms - live->until_ms < 450) {
            on_air->layer = CARD_MESSAGE;
            on_air->place = live->doc.place;
            on_air->alpha = fade(now_ms, live->started_ms, live->active ? live->until_ms : live->until_ms, live->active);
            if (live->doc.place == CARD_FULL) {
                on_air->x = canvas_w / 12; on_air->y = canvas_h / 10;
                on_air->w = canvas_w - 2 * on_air->x; on_air->h = canvas_h - 2 * on_air->y;
            }
            on_air->ratio = banner_ratio(live->doc.banner_w, live->doc.banner_h);
            banner_contain(live->doc.banner_w, live->doc.banner_h, on_air->w * 2 / 5, on_air->h * 3 / 5,
                           &on_air->media_w, &on_air->media_h);
            on_air->media_x = on_air->x + on_air->w - on_air->media_w - 16;
            on_air->media_y = on_air->y + (on_air->h - on_air->media_h) / 2;
            if (!live->active && on_air->alpha <= 0.02f) {
                *on_air = blank;
                on_air->finished = 1;
            }
        }
    }
    if (live->active && live->until_ms && now_ms >= live->until_ms) on_air->finished = 1;
}

RatioClass banner_ratio(int w, int h) {
    if (w < 1 || h < 1) return RATIO_WIDE;
    if (w * 5 < h * 4) return RATIO_TALL;
    if (h * 5 < w * 4) return RATIO_WIDE;
    return RATIO_SQUARE;
}

void banner_contain(int img_w, int img_h, int box_w, int box_h, int *dw, int *dh) {
    if (!dw || !dh) return;
    *dw = 0; *dh = 0;
    if (img_w < 1 || img_h < 1 || box_w < 1 || box_h < 1) return;
    if (img_w * box_h > img_h * box_w) {
        *dw = box_w;
        *dh = box_w * img_h / img_w;
    } else {
        *dh = box_h;
        *dw = box_h * img_w / img_h;
    }
    if (*dw < 1) *dw = 1;
    if (*dh < 1) *dh = 1;
}

void audio_gains(const CardView *on_air, int music_on, int transition_sound, float *program, float *music, float *sting) {
    float a = on_air && on_air->layer == CARD_MESSAGE ? on_air->alpha : 0.f;
    if (program) *program = 1.f - 0.55f * a;
    if (music) *music = music_on ? 0.35f * a : 0.f;
    if (sting) *sting = transition_sound ? 0.2f * a * (1.f - a) * 4.f : 0.f;
    if (sting && *sting > 0.2f) *sting = 0.2f;
}

void mix_s16(int16_t *dst, const int16_t *program, const int16_t *music, int samples, float program_gain, float music_gain) {
    int i;
    if (!dst || samples < 1) return;
    for (i = 0; i < samples; i++) {
        int v = 0;
        if (program) v += (int)(program[i] * program_gain);
        if (music) v += (int)(music[i] * music_gain);
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        dst[i] = (int16_t)v;
    }
}

static void put_px(uint8_t *bgra, int w, int h, int x, int y, uint8_t b, uint8_t g, uint8_t r, uint8_t a) {
    uint8_t *p;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    p = bgra + ((size_t)y * (size_t)w + (size_t)x) * 4;
    p[0] = b; p[1] = g; p[2] = r; p[3] = a;
}

static void fill_rect(uint8_t *bgra, int w, int h, int x, int y, int rw, int rh, uint8_t b, uint8_t g, uint8_t r, uint8_t a) {
    int yy, xx;
    for (yy = 0; yy < rh; yy++) for (xx = 0; xx < rw; xx++) put_px(bgra, w, h, x + xx, y + yy, b, g, r, a);
}

static void blit_text(uint8_t *bgra, int w, int h, int x, int y, const char *text, uint8_t a) {
    int col = 0;
    if (!text) return;
    for (; *text && col < 80; text++, col++) {
        int gx, gy;
        for (gy = 0; gy < 8; gy++) for (gx = 0; gx < 5; gx++) {
            if (((*text + gx + gy) & 3) == 0) put_px(bgra, w, h, x + col * 6 + gx, y + gy, 232, 214, 168, a);
        }
    }
}

void render_card(uint8_t *bgra, int w, int h, const CardView *view, const CardDoc *doc) {
    uint8_t a;
    if (!bgra || w < 1 || h < 1) return;
    memset(bgra, 0, (size_t)w * (size_t)h * 4);
    if (!view || view->alpha <= 0.02f) return;
    a = (uint8_t)(view->alpha * 230.f);
    if (view->layer == CARD_SERVICE) {
        fill_rect(bgra, w, h, view->x, view->y, view->w, view->h, 11, 19, 33, a);
        fill_rect(bgra, w, h, view->x, view->y, 4, view->h, 229, 193, 138, a);
        blit_text(bgra, w, h, view->x + 12, view->y + 8, "CULTO", a);
        return;
    }
    if (view->place == CARD_FULL) fill_rect(bgra, w, h, 0, 0, w, h, 16, 23, 37, a);
    fill_rect(bgra, w, h, view->x, view->y, view->w, view->h, 13, 20, 32, a);
    fill_rect(bgra, w, h, view->x, view->y, 4, view->h, 229, 193, 138, a);
    if (view->media_w > 0 && view->media_h > 0)
        fill_rect(bgra, w, h, view->media_x, view->media_y, view->media_w, view->media_h, 255, 255, 255, a);
    if (doc) {
        blit_text(bgra, w, h, view->x + 12, view->y + 10, doc->heading, a);
        blit_text(bgra, w, h, view->x + 12, view->y + 24, doc->message, a);
        blit_text(bgra, w, h, view->x + 12, view->y + view->h - 16, doc->reference, a);
    }
}

int card_settings_write(const char *path, const CardDoc *doc) {
    FILE *f;
    if (!path || !doc) return 0;
    f = fopen(path, "wb");
    if (!f) return 0;
    fprintf(f, "type=%s\nheading=%s\nmessage=%s\nreference=%s\nbanner=%s\nplace=%d\nseconds=%d\nsound=%d\nstyle=%s\nbanner_w=%d\nbanner_h=%d\n",
            doc->type, doc->heading, doc->message, doc->reference, doc->banner, (int)doc->place, doc->seconds,
            doc->transition_sound, doc->style, doc->banner_w, doc->banner_h);
    fclose(f);
    return 1;
}

int card_settings_read(const char *text, CardDoc *doc, int *rejected_secret) {
    const char *p;
    if (rejected_secret) *rejected_secret = 0;
    if (!text || !doc) return 0;
    card_doc_init(doc);
    for (p = text; *p; ) {
        const char *eol = strchr(p, '\n');
        char line[512];
        size_t n = eol ? (size_t)(eol - p) : strlen(p);
        if (n >= sizeof line) n = sizeof line - 1;
        memcpy(line, p, n);
        line[n] = 0;
        if (strncmp(line, "senha=", 6) == 0 || strncmp(line, "password=", 9) == 0 || strncmp(line, "pix_key=", 8) == 0) {
            if (rejected_secret) *rejected_secret = 1;
        } else if (strncmp(line, "heading=", 8) == 0) snprintf(doc->heading, sizeof doc->heading, "%s", line + 8);
        else if (strncmp(line, "message=", 8) == 0) snprintf(doc->message, sizeof doc->message, "%s", line + 8);
        else if (strncmp(line, "reference=", 10) == 0) snprintf(doc->reference, sizeof doc->reference, "%s", line + 10);
        else if (strncmp(line, "type=", 5) == 0) snprintf(doc->type, sizeof doc->type, "%s", line + 5);
        else if (strncmp(line, "seconds=", 8) == 0) doc->seconds = atoi(line + 8);
        else if (strncmp(line, "place=", 6) == 0) doc->place = atoi(line + 6) == 1 ? CARD_FULL : CARD_LOWER;
        else if (strncmp(line, "sound=", 6) == 0) doc->transition_sound = atoi(line + 6) ? 1 : 0;
        else if (strncmp(line, "banner_w=", 9) == 0) doc->banner_w = atoi(line + 9);
        else if (strncmp(line, "banner_h=", 9) == 0) doc->banner_h = atoi(line + 9);
        if (!eol) break;
        p = eol + 1;
    }
    return 1;
}

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincrypt.h>

int vault_dpapi_protect(const uint8_t *plain, size_t n, uint8_t **out, size_t *out_n) {
    DATA_BLOB in, blob;
    uint8_t *buf;
    if (!plain || !n || !out || !out_n) return 0;
    in.pbData = (BYTE *)plain;
    in.cbData = (DWORD)n;
    if (!CryptProtectData(&in, L"Igreja Promessas estudio", NULL, NULL, NULL, CRYPTPROTECT_UI_FORBIDDEN, &blob))
        return 0;
    buf = (uint8_t *)malloc(blob.cbData);
    if (!buf) { LocalFree(blob.pbData); return 0; }
    memcpy(buf, blob.pbData, blob.cbData);
    *out = buf;
    *out_n = blob.cbData;
    LocalFree(blob.pbData);
    return 1;
}

int vault_dpapi_unprotect(const uint8_t *blob, size_t n, uint8_t **out, size_t *out_n) {
    DATA_BLOB in, plain;
    uint8_t *buf;
    if (!blob || !n || !out || !out_n) return 0;
    in.pbData = (BYTE *)blob;
    in.cbData = (DWORD)n;
    if (!CryptUnprotectData(&in, NULL, NULL, NULL, NULL, CRYPTPROTECT_UI_FORBIDDEN, &plain))
        return 0;
    buf = (uint8_t *)malloc(plain.cbData + 1);
    if (!buf) { LocalFree(plain.pbData); return 0; }
    memcpy(buf, plain.pbData, plain.cbData);
    buf[plain.cbData] = 0;
    *out = buf;
    *out_n = plain.cbData;
    LocalFree(plain.pbData);
    return 1;
}
#endif
