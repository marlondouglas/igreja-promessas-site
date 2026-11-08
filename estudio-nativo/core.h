#ifndef ESTUDIO_CORE_H
#define ESTUDIO_CORE_H

#include <stddef.h>
#include <stdint.h>

#define ESTUDIO_RTSP_PATH "/culto-aac"
#define ESTUDIO_PATH_PHONE "camera-remota"
#define ESTUDIO_PATH_PC "camera-pc"
#define ESTUDIO_USER "promessas"
#define ESTUDIO_COUNTDOWN_SEC 10
#define ESTUDIO_OPENING_SEC 300
#define ESTUDIO_OPENING_TEST_SEC 15
#define ESTUDIO_CLOSING_SEC 120
#define ESTUDIO_CLOSING_TEST_SEC 12
#define ESTUDIO_FINAL_SEC 18

typedef enum {
    SCENE_COUNTDOWN = 1,
    SCENE_OPENING,
    SCENE_CAMERA,
    SCENE_SCREEN,
    SCENE_PULL_PHONE,
    SCENE_PULL_PC,
    SCENE_PUBLISH_PC,
    SCENE_CLOSING,
    SCENE_FINAL
} SceneKind;

typedef struct {
    char **items;
    int count;
} ArgList;

typedef struct {
    SceneKind scene;
    int test_mode;
    const char *camera;
    const char *mic;
    const char *media;
    const char *host;
    int port;
    const char *key;
    int overlay;
} PublishSpec;

int args_push(ArgList *list, const char *text);
void args_free(ArgList *list);
int args_contains(const ArgList *list, const char *text);
char *args_join(const ArgList *list);
void secure_wipe(void *ptr, size_t len);

int url_encode(const char *in, char *out, size_t out_cap);
int build_rtsp_url(char *out, size_t out_cap, const char *host, int port, const char *key);
int remote_path_allowed(const char *path);
int build_rtmp_url(char *out, size_t out_cap, const char *host, int port, const char *path, const char *key);
typedef enum { LINK_IDLE = 0, LINK_CONNECTING, LINK_UP, LINK_DOWN, LINK_AUTH } LinkState;
LinkState link_from_ffmpeg_line(const char *line);
int publish_build(const PublishSpec *spec, ArgList *out, char *err, size_t err_cap);
char *redact_text(const char *text, const char *secret);

int dshow_collect(const char *text, char video[][160], int *video_count, int video_max,
                  char audio[][160], int *audio_count, int audio_max);
int hls_has_aac_video(const char *manifest);
int ini_read_paths(const char *text, int *rejected_secret);

int scene_seconds(SceneKind scene, int test_mode);
const char *scene_label(SceneKind scene);

typedef enum { CARD_LOWER = 0, CARD_FULL = 1, CARD_MINI = 2 } CardPlace;
typedef enum { CARD_SERVICE = 0, CARD_MESSAGE = 1 } CardLayer;
typedef enum { RATIO_SQUARE = 0, RATIO_WIDE = 1, RATIO_TALL = 2 } RatioClass;

typedef struct {
    char type[24];
    char heading[80];
    char message[400];
    char reference[96];
    char banner[260];
    int banner_w, banner_h;
    CardPlace place;
    int seconds;
    int transition_sound;
    char style[16];
} CardDoc;

typedef struct {
    int active;
    int started_ms;
    int until_ms;
    CardDoc doc;
} CardLive;

typedef struct {
    CardLayer layer;
    CardPlace place;
    float alpha;
    int x, y, w, h;
    int media_x, media_y, media_w, media_h;
    int finished;
    RatioClass ratio;
} CardView;

void card_doc_init(CardDoc *doc);
int card_duration_ok(int seconds);
void card_apply(const CardDoc *draft, CardLive *live, int now_ms);
void card_stop(CardLive *live, int now_ms);
void card_compose(const CardDoc *draft, const CardLive *live, int now_ms, int canvas_w, int canvas_h,
                  CardView *preview, CardView *on_air);
RatioClass banner_ratio(int w, int h);
void banner_contain(int img_w, int img_h, int box_w, int box_h, int *dw, int *dh);
void audio_gains(const CardView *on_air, int music_on, int transition_sound, float *program, float *music, float *sting);
void mix_s16(int16_t *dst, const int16_t *program, const int16_t *music, int samples, float program_gain, float music_gain);
void render_card(uint8_t *bgra, int w, int h, const CardView *view, const CardDoc *doc);
int card_settings_write(const char *path, const CardDoc *doc);
int card_settings_read(const char *text, CardDoc *doc, int *rejected_secret);

int key_blob_save(const uint8_t *blob, size_t n, const char *path);
int key_blob_load(uint8_t **blob, size_t *n, const char *path);
int key_blob_clear(const char *path);

int vault_test_protect(const uint8_t *plain, size_t n, uint8_t **out, size_t *out_n);
int vault_test_unprotect(const uint8_t *blob, size_t n, uint8_t **out, size_t *out_n);

typedef int (*VaultProtectFn)(const uint8_t *plain, size_t n, uint8_t **out, size_t *out_n);
typedef int (*VaultUnprotectFn)(const uint8_t *blob, size_t n, uint8_t **out, size_t *out_n);

int key_store(VaultProtectFn protect, const char *path, const char *key);
int key_restore(VaultUnprotectFn unprotect, const char *path, char *key, size_t key_cap);

#ifdef _WIN32
int vault_dpapi_protect(const uint8_t *plain, size_t n, uint8_t **out, size_t *out_n);
int vault_dpapi_unprotect(const uint8_t *blob, size_t n, uint8_t **out, size_t *out_n);
#endif

#endif
