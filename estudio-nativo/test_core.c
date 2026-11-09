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

    spec.scene = SCENE_PUBLISH_PC;
    spec.camera = "Webcam";
    spec.mic = NULL;
    spec.host = "127.0.0.1";
    spec.port = 1935;
    spec.key = NULL;
    expect(publish_build(&spec, &args, err, sizeof err), "publica webcam");
    joined = args_join(&args);
    expect(joined && strstr(joined, "rtmp://127.0.0.1:1935/camera-pc") != NULL, "caminho camera-pc");
    expect(joined && strstr(joined, "culto-aac") == NULL, "webcam nao publica a saida final");
    expect(joined && strstr(joined, "camera-remota") == NULL, "webcam nao usa o caminho do celular");
    free(joined);
    args_free(&args);
    spec.scene = SCENE_PULL_PHONE;
    spec.key = NULL;
    expect(publish_build(&spec, &args, err, sizeof err), "estudio puxa celular");
    joined = args_join(&args);
    expect(joined && strstr(joined, "rtsp://127.0.0.1:8554/camera-remota") != NULL, "le camera-remota");
    expect(joined && strstr(joined, "libx264") != NULL && strstr(joined, "/culto-aac") != NULL, "recodeia para a saida");
    expect(joined && strstr(joined, "-c copy") == NULL, "nao repassa o celular cru");
    free(joined);
    args_free(&args);
    expect(!build_rtmp_url(url, sizeof url, "127.0.0.1", 1935, "culto-aac", NULL), "rtmp recusa saida final");
    expect(!build_rtmp_url(url, sizeof url, "", 1935, "camera-pc", NULL), "rtmp exige IP");
    expect(link_from_ffmpeg_line("frame= 12 fps=24") == LINK_UP, "indicador sobe com quadro");
    expect(link_from_ffmpeg_line("Connection refused") == LINK_DOWN, "indicador cai sem servidor");
    expect(link_from_ffmpeg_line("") == LINK_CONNECTING, "ainda conectando");
    args_free(&args);
    args_push(&args, "ffmpeg");
    args_push(&args, "video=Integrated Camera");
    joined = args_join(&args);
    expect(joined && strstr(joined, "\"video=Integrated Camera\"") != NULL, "nome da webcam com espaco");
    free(joined);
    args_free(&args);
    expect(launch_is_smoke("--smoke-test") && launch_is_smoke("--offline"), "teste sem transmissao");
    expect(!launch_is_camera("--smoke-test --camera"), "teste nao abre a webcam");
    expect(launch_is_camera("--camera") && !launch_is_smoke("--camera"), "modo camera separado");
    spec.scene = SCENE_PUBLISH_PC;
    spec.camera = "Webcam";
    spec.mic = "Mic";
    spec.host = "127.0.0.1";
    spec.port = 1935;
    spec.key = NULL;
    spec.preview_pipe = 1;
    expect(publish_build(&spec, &args, err, sizeof err), "previa durante o envio");
    joined = args_join(&args);
    expect(joined && strstr(joined, "pipe:1") && strstr(joined, "rtmp://127.0.0.1:1935/camera-pc")
        && strstr(joined, "culto-aac") == NULL, "previa no mesmo ffmpeg sem a saida final");
    free(joined);
    args_free(&args);
    {
        CardDoc draft, loaded;
        CardLive live;
        CardView preview, on_air;
        uint8_t *frame;
        int dw = 0, dh = 0, rejected_card = 0;
        float program = 0, music = 0, sting = 0;
        card_doc_init(&draft);
        snprintf(draft.heading, sizeof draft.heading, "Versiculo");
        snprintf(draft.message, sizeof draft.message, "O Senhor e o meu pastor");
        snprintf(draft.reference, sizeof draft.reference, "Salmo 23:1");
        draft.seconds = 10;
        draft.place = CARD_LOWER;
        draft.banner_w = 1000;
        draft.banner_h = 1000;
        memset(&live, 0, sizeof live);
        card_compose(&draft, &live, 0, 1280, 720, &preview, &on_air);
        expect(preview.layer == CARD_MESSAGE && on_air.layer == CARD_SERVICE, "rascunho nao vai ao vivo");
        expect(!card_duration_ok(0) && !card_duration_ok(601) && card_duration_ok(20), "duracao");
        card_apply(&draft, &live, 1000);
        card_compose(&draft, &live, 1000, 1280, 720, &preview, &on_air);
        expect(live.active && on_air.layer == CARD_MESSAGE, "exibir publica o card");
        draft.place = CARD_FULL;
        card_compose(&draft, &live, 1200, 1280, 720, &preview, &on_air);
        expect(preview.place == CARD_FULL && on_air.place == CARD_LOWER, "editar nao troca o que esta no ar");
        card_compose(&draft, &live, 1000 + 10000, 1280, 720, NULL, &on_air);
        expect(on_air.finished, "duracao pede retorno");
        card_stop(&live, 1000 + 10000);
        card_compose(&draft, &live, 1000 + 10000 + 500, 1280, 720, NULL, &on_air);
        expect(on_air.layer == CARD_SERVICE, "volta a tarja depois da saida");
        expect(banner_ratio(1000, 1000) == RATIO_SQUARE, "banner quadrado");
        banner_contain(1000, 500, 200, 200, &dw, &dh);
        expect(dw == 200 && dh == 100, "banner cabe sem esticar");
        audio_gains(&on_air, 0, 0, &program, &music, &sting);
        expect(program > 0.99f && music == 0.f, "musica desligada restaura o programa");
        frame = (uint8_t *)calloc((size_t)1280 * 180 * 4, 1);
        card_compose(&draft, &live, 0, 1280, 180, &preview, NULL);
        render_card(frame, 1280, 180, &preview, &draft);
        expect(frame[3] != 0, "texto do card pinta pixel");
        free(frame);
        expect(card_settings_write("card-test.ini", &draft), "grava card");
        expect(card_settings_read("type=verse\nheading=A\nmessage=B\nreference=C\nseconds=20\nplace=1\nsound=0\nsenha=segredo\n", &loaded, &rejected_card), "le card");
        expect(rejected_card && loaded.place == CARD_FULL && strcmp(loaded.heading, "A") == 0, "rejeita senha e aplica so no rascunho");
        remove("card-test.ini");
    }

    if (g_fail) {
        fprintf(stderr, "%d falhas\n", g_fail);
        return 1;
    }
    printf("ok\n");
    return 0;
}
