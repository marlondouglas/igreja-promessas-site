#include "core.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int g_fail = 0;

static void expect(int cond, const char *name) {
    if (!cond) {
        fprintf(stderr, "falhou: %s\n", name);
        g_fail++;
    }
}

int main(void) {
    ArgList args;
    PublishSpec spec;
    char err[128];
    char url[256];
    char *joined;
    char *safe;
    char video[4][160], audio[4][160];
    int nv = 0, na = 0;
    const char *devices =
        "[dshow] DirectShow video devices\n"
        "[dshow]  \"Câmera do notebook\" (video)\n"
        "[dshow] DirectShow audio devices\n"
        "[dshow]  \"Microfone (Realtek)\" (audio)\n";
    const char *good =
        "#EXTM3U\n#EXT-X-STREAM-INF:CODECS=\"avc1.42c01f,mp4a.40.2\"\nmedia.m3u8\n"
        "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:2.0,\nseg.mp4\n";
    const char *opus = "#EXTM3U\n#EXT-X-STREAM-INF:CODECS=\"avc1.42c015,opus\"\nv.m3u8\n";
    uint8_t *blob = NULL, *plain = NULL;
    size_t bn = 0, pn = 0;
    char restored[128];
    const char *dummy = "dummy-key-not-real-0123456789";
    char path[256];
    int rejected = 0;
    snprintf(path, sizeof path, "estudio-key-test.bin");

    memset(&spec, 0, sizeof spec);
    spec.scene = SCENE_CAMERA;
    spec.camera = "Câmera do notebook";
    spec.mic = "Microfone (Realtek)";
    spec.host = "127.0.0.1";
    spec.port = 8554;
    spec.key = dummy;
    expect(publish_build(&spec, &args, err, sizeof err), "monta camera");
    expect(args_contains(&args, "libx264"), "h264");
    expect(args_contains(&args, "aac"), "aac");
    expect(args_contains(&args, "dshow"), "dshow");
    expect(!args_contains(&args, "whip"), "sem whip");
    joined = args_join(&args);
    expect(joined && strstr(joined, dummy) != NULL, "argv de processo leva a chave");
    safe = redact_text(joined, dummy);
    expect(safe && strstr(safe, dummy) == NULL, "log sem a chave");
    expect(safe && strstr(safe, "rtsp://promessas:") == NULL, "log sem usuario");
    expect(safe && strstr(safe, "rtsp://127.0.0.1:8554/culto-aac") != NULL, "log mostra so o destino");
    free(joined);
    free(safe);
    args_free(&args);

    spec.mic = NULL;
    expect(publish_build(&spec, &args, err, sizeof err), "camera sem microfone");
    expect(args_contains(&args, "anullsrc=r=48000:cl=stereo"), "silencio so sem microfone");
    args_free(&args);

    spec.scene = SCENE_OPENING;
    spec.test_mode = 1;
    spec.media = "abertura.mp4";
    spec.key = NULL;
    expect(publish_build(&spec, &args, err, sizeof err), "abertura");
    expect(scene_seconds(SCENE_OPENING, 1) == 15, "abertura curta");
    expect(scene_seconds(SCENE_OPENING, 0) == 300, "abertura cheia");
    expect(scene_seconds(SCENE_COUNTDOWN, 0) == 10, "contagem");
    args_free(&args);

    expect(!build_rtsp_url(url, sizeof url, "evil@host", 8554, NULL), "host rejeitado");
    expect(dshow_collect(devices, video, &nv, 4, audio, &na, 4), "lista");
    expect(nv == 1 && strcmp(video[0], "Câmera do notebook") == 0, "video");
    expect(na == 1 && strcmp(audio[0], "Microfone (Realtek)") == 0, "audio");
    expect(hls_has_aac_video(good), "hls aac");
    expect(!hls_has_aac_video(opus), "hls opus recusado");
    expect(ini_read_paths("abertura=a.mp4\nsenha=nao-guardar\n", &rejected) && rejected == 1, "ini ignora senha");

    expect(key_store(vault_test_protect, path, dummy), "grava blob");
    expect(key_restore(vault_test_unprotect, path, restored, sizeof restored) == 0, "restaura");
    expect(strcmp(restored, dummy) == 0, "valor igual");
    secure_wipe(restored, sizeof restored);
    {
        FILE *f = fopen(path, "wb");
        if (f) { fputs("lixo", f); fclose(f); }
    }
    expect(key_restore(vault_test_unprotect, path, restored, sizeof restored) == -1, "blob invalido");
    expect(restored[0] == 0, "nao devolve lixo");
    expect(vault_test_protect((const uint8_t *)dummy, strlen(dummy), &blob, &bn), "protege");
    blob[0] ^= 0xff;
    expect(!vault_test_unprotect(blob, bn, &plain, &pn), "corrupto falha");
    expect(plain == NULL, "sem texto claro");
    free(blob);
    expect(key_blob_clear(path), "limpa arquivo");
    expect(key_restore(vault_test_unprotect, path, restored, sizeof restored) == 1, "ausente depois de limpar");

    if (g_fail) {
        fprintf(stderr, "%d falhas\n", g_fail);
        return 1;
    }
    printf("ok\n");
    return 0;
}
