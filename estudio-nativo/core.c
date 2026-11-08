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
    } else {
        if (err && err_cap) snprintf(err, err_cap, "Cena desconhecida.");
        args_free(out);
        return 0;
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
    hit = out;
    while ((hit = strstr(hit, "rtsp://")) != NULL) {
        char *at = strchr(hit, '@');
        char *slash = strchr(hit + 7, '/');
        if (at && slash && at < slash) {
            memmove(hit + 7, at + 1, strlen(at + 1) + 1);
        }
        hit += 7;
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
