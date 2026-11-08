#ifndef ESTUDIO_CORE_H
#define ESTUDIO_CORE_H

#include <stddef.h>
#include <stdint.h>

#define ESTUDIO_RTSP_PATH "/culto-aac"
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
} PublishSpec;

int args_push(ArgList *list, const char *text);
void args_free(ArgList *list);
int args_contains(const ArgList *list, const char *text);
char *args_join(const ArgList *list);
void secure_wipe(void *ptr, size_t len);

int url_encode(const char *in, char *out, size_t out_cap);
int build_rtsp_url(char *out, size_t out_cap, const char *host, int port, const char *key);
int publish_build(const PublishSpec *spec, ArgList *out, char *err, size_t err_cap);
char *redact_text(const char *text, const char *secret);

int dshow_collect(const char *text, char video[][160], int *video_count, int video_max,
                  char audio[][160], int *audio_count, int audio_max);
int hls_has_aac_video(const char *manifest);
int ini_read_paths(const char *text, int *rejected_secret);

int scene_seconds(SceneKind scene, int test_mode);
const char *scene_label(SceneKind scene);

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
