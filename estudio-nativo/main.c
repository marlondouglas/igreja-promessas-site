#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>
#include <shlobj.h>
#include <commctrl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "core.h"

enum {
    ID_TITLE = 100, ID_ADDRESS, ID_FMT_H, ID_FMT_V, ID_TEST,
    ID_SRC_CAM, ID_SRC_SCR, ID_CAM, ID_MIC, ID_REFRESH,
    ID_KEY, ID_CHANGE, ID_CLEAR, ID_CHECK, ID_TRANSMIT,
    ID_START, ID_SKIP, ID_END, ID_STOP, ID_LOG, ID_TIMER = 200
};

static HWND g_win, g_title, g_address, g_cam, g_mic, g_key, g_status, g_scene, g_clock, g_log, g_saved;
static HWND g_fmt_h, g_fmt_v, g_src_cam, g_src_scr, g_test, g_start;
static char g_keybuf[256];
static int g_have_key;
static wchar_t g_keypath[MAX_PATH];
static HANDLE g_proc;
static SceneKind g_scene_kind;
static ULONGLONG g_scene_start;
static int g_running;
static char g_camera_name[160], g_mic_name[160];
static char g_open_file[MAX_PATH], g_close_file[MAX_PATH], g_final_file[MAX_PATH];

static void wipe_key(void) {
    secure_wipe(g_keybuf, sizeof g_keybuf);
    g_have_key = 0;
}

static void key_file(void) {
    wchar_t base[MAX_PATH];
    g_keypath[0] = 0;
    if (FAILED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, base))) return;
    _snwprintf(g_keypath, MAX_PATH, L"%s\\IgrejaPromessas\\Estudio", base);
    CreateDirectoryW(g_keypath, NULL);
    _snwprintf(g_keypath, MAX_PATH, L"%s\\IgrejaPromessas\\Estudio\\stream-key.bin", base);
}

static void narrow_path(char *out, size_t cap) {
    WideCharToMultiByte(CP_UTF8, 0, g_keypath, -1, out, (int)cap, NULL, NULL);
}

static void set_status(const wchar_t *text) {
    SetWindowTextW(g_status, text);
}

static void log_line(const char *text) {
    char *safe = redact_text(text, g_have_key ? g_keybuf : NULL);
    wchar_t wide[1024];
    int len;
    if (!safe) return;
    MultiByteToWideChar(CP_UTF8, 0, safe, -1, wide, 1000);
    free(safe);
    len = GetWindowTextLengthW(g_log);
    SendMessageW(g_log, EM_SETSEL, len, len);
    SendMessageW(g_log, EM_REPLACESEL, FALSE, (LPARAM)wide);
    SendMessageW(g_log, EM_REPLACESEL, FALSE, (LPARAM)L"\r\n");
}

static void mark_saved(int saved) {
    SetWindowTextW(g_saved, saved ? L"Senha salva neste usuário do Windows" : L"Nenhuma senha salva");
    SendMessageW(g_key, 0x1501, TRUE, (LPARAM)(saved ? L"Senha salva — o campo permanece oculto" : L""));
}

static void load_assets(void) {
    wchar_t exe[MAX_PATH], dir[MAX_PATH];
    wchar_t path[MAX_PATH];
    GetModuleFileNameW(NULL, exe, MAX_PATH);
    wcscpy(dir, exe);
    if (wcsrchr(dir, L'\\')) *wcsrchr(dir, L'\\') = 0;
    _snwprintf(path, MAX_PATH, L"%s\\abertura-promessas-300s-R5.mp4", dir);
    if (GetFileAttributesW(path) != INVALID_FILE_ATTRIBUTES)
        WideCharToMultiByte(CP_UTF8, 0, path, -1, g_open_file, MAX_PATH, NULL, NULL);
    _snwprintf(path, MAX_PATH, L"%s\\encerramento-promessas-120s-R5.mp4", dir);
    if (GetFileAttributesW(path) != INVALID_FILE_ATTRIBUTES)
        WideCharToMultiByte(CP_UTF8, 0, path, -1, g_close_file, MAX_PATH, NULL, NULL);
    _snwprintf(path, MAX_PATH, L"%s\\tela-final-promessas-R5.png", dir);
    if (GetFileAttributesW(path) != INVALID_FILE_ATTRIBUTES)
        WideCharToMultiByte(CP_UTF8, 0, path, -1, g_final_file, MAX_PATH, NULL, NULL);
}

static void load_key(void) {
    char path[MAX_PATH * 3];
    int rc;
    narrow_path(path, sizeof path);
    wipe_key();
    rc = key_restore(vault_dpapi_unprotect, path, g_keybuf, sizeof g_keybuf);
    if (rc == 0 && g_keybuf[0]) {
        g_have_key = 1;
        SetWindowTextW(g_key, L"");
        mark_saved(1);
        set_status(L"Senha restaurada. Ela não aparece no campo.");
    } else if (rc < 0) {
        wipe_key();
        key_blob_clear(path);
        mark_saved(0);
        set_status(L"Não foi possível ler a senha salva. Digite de novo ou limpe.");
    } else {
        mark_saved(0);
        set_status(L"Informe a senha privada uma vez. Ela fica só neste usuário do Windows.");
    }
}

static int read_typed_key(char *out, size_t cap) {
    wchar_t tmp[256];
    int n = GetWindowTextW(g_key, tmp, 256);
    if (n <= 0) { out[0] = 0; return 0; }
    WideCharToMultiByte(CP_UTF8, 0, tmp, -1, out, (int)cap, NULL, NULL);
    secure_wipe(tmp, sizeof tmp);
    return out[0] ? 1 : 0;
}

static void save_current_key(const char *typed) {
    char path[MAX_PATH * 3];
    if (!typed || strlen(typed) < 8) {
        set_status(L"A senha precisa ter ao menos 8 caracteres. Nada foi gravado.");
        return;
    }
    narrow_path(path, sizeof path);
    if (!key_store(vault_dpapi_protect, path, typed)) {
        set_status(L"Não consegui proteger a senha com o DPAPI deste usuário.");
        return;
    }
    secure_wipe(g_keybuf, sizeof g_keybuf);
    memcpy(g_keybuf, typed, strlen(typed) + 1);
    g_have_key = 1;
    SetWindowTextW(g_key, L"");
    mark_saved(1);
    set_status(L"Senha salva para os próximos inícios. O texto não fica no disco em claro.");
}

static void on_change_key(void) {
    wipe_key();
    SetWindowTextW(g_key, L"");
    mark_saved(0);
    SetFocus(g_key);
    set_status(L"Digite a nova senha e clique em Transmitir para substituir a salva.");
}

static void on_clear_key(void) {
    char path[MAX_PATH * 3];
    narrow_path(path, sizeof path);
    key_blob_clear(path);
    wipe_key();
    SetWindowTextW(g_key, L"");
    mark_saved(0);
    set_status(L"Senha removida deste computador.");
}

static void refresh_devices(void) {
    SECURITY_ATTRIBUTES sa = {sizeof(sa), NULL, TRUE};
    HANDLE rd = NULL, wr = NULL;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    wchar_t cmd[] = L"ffmpeg -hide_banner -list_devices true -f dshow -i dummy";
    char dump[8192];
    char video[8][160], audio[8][160];
    int nv = 0, na = 0, i, got = 0;
    DWORD n = 0;
    CreatePipe(&rd, &wr, &sa, 0);
    SetHandleInformation(rd, HANDLE_FLAG_INHERIT, 0);
    ZeroMemory(&si, sizeof si);
    si.cb = sizeof si;
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdError = wr;
    si.hStdOutput = wr;
    if (!CreateProcessW(NULL, cmd, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        set_status(L"ffmpeg não encontrado. Instale o build GPL e deixe ffmpeg no PATH.");
        CloseHandle(rd); CloseHandle(wr);
        return;
    }
    CloseHandle(wr);
    while (got < (int)sizeof dump - 1 && ReadFile(rd, dump + got, (DWORD)(sizeof dump - 1 - got), &n, NULL) && n)
        got += (int)n;
    dump[got] = 0;
    WaitForSingleObject(pi.hProcess, 8000);
    CloseHandle(pi.hProcess); CloseHandle(pi.hThread); CloseHandle(rd);
    dshow_collect(dump, video, &nv, 8, audio, &na, 8);
    SendMessageW(g_cam, CB_RESETCONTENT, 0, 0);
    SendMessageW(g_mic, CB_RESETCONTENT, 0, 0);
    for (i = 0; i < nv; i++) {
        wchar_t w[160];
        MultiByteToWideChar(CP_UTF8, 0, video[i], -1, w, 160);
        SendMessageW(g_cam, CB_ADDSTRING, 0, (LPARAM)w);
    }
    for (i = 0; i < na; i++) {
        wchar_t w[160];
        MultiByteToWideChar(CP_UTF8, 0, audio[i], -1, w, 160);
        SendMessageW(g_mic, CB_ADDSTRING, 0, (LPARAM)w);
    }
    if (nv) SendMessageW(g_cam, CB_SETCURSEL, 0, 0);
    if (na) SendMessageW(g_mic, CB_SETCURSEL, 0, 0);
    if (!nv && !na) set_status(L"Nenhuma câmera ou microfone apareceu no DirectShow. Confira o ffmpeg GPL.");
    else set_status(L"Dispositivos lidos do DirectShow.");
}

static void selected_name(HWND combo, char *out, size_t cap) {
    int i = (int)SendMessageW(combo, CB_GETCURSEL, 0, 0);
    wchar_t w[160];
    out[0] = 0;
    if (i < 0) return;
    SendMessageW(combo, CB_GETLBTEXT, i, (LPARAM)w);
    WideCharToMultiByte(CP_UTF8, 0, w, -1, out, (int)cap, NULL, NULL);
}

static void stop_ffmpeg(void) {
    if (g_proc) {
        TerminateProcess(g_proc, 0);
        CloseHandle(g_proc);
        g_proc = NULL;
    }
    g_running = 0;
}

static int start_scene(SceneKind scene) {
    PublishSpec spec;
    ArgList args;
    char err[160];
    wchar_t cmd[4096];
    char *joined;
    char *safe;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    char typed[256];
    const char *key = NULL;
    if (read_typed_key(typed, sizeof typed)) {
        save_current_key(typed);
        key = g_keybuf;
        secure_wipe(typed, sizeof typed);
    } else if (g_have_key) {
        key = g_keybuf;
    }
    stop_ffmpeg();
    memset(&spec, 0, sizeof spec);
    spec.scene = scene;
    spec.test_mode = (int)SendMessageW(g_test, BM_GETCHECK, 0, 0) == BST_CHECKED;
    spec.camera = g_camera_name;
    spec.mic = g_mic_name;
    spec.host = "127.0.0.1";
    spec.port = 8554;
    spec.key = key;
    if (scene == SCENE_OPENING) spec.media = g_open_file;
    else if (scene == SCENE_CLOSING) spec.media = g_close_file;
    else if (scene == SCENE_FINAL) spec.media = g_final_file;
    else if (scene == SCENE_SCREEN) spec.scene = SCENE_SCREEN;
    else if (SendMessageW(g_src_scr, BM_GETCHECK, 0, 0) == BST_CHECKED && scene == SCENE_CAMERA)
        spec.scene = SCENE_SCREEN;
    selected_name(g_cam, g_camera_name, sizeof g_camera_name);
    selected_name(g_mic, g_mic_name, sizeof g_mic_name);
    spec.camera = g_camera_name;
    spec.mic = g_mic_name;
    if (!publish_build(&spec, &args, err, sizeof err)) {
        wchar_t w[200];
        MultiByteToWideChar(CP_UTF8, 0, err, -1, w, 200);
        set_status(w);
        return 0;
    }
    joined = args_join(&args);
    safe = redact_text(joined ? joined : "", key);
    log_line(safe ? safe : "ffmpeg");
    free(safe);
    if (!joined || (size_t)MultiByteToWideChar(CP_UTF8, 0, joined, -1, cmd, 4096) == 0) {
        free(joined);
        args_free(&args);
        set_status(L"Não montei a linha do ffmpeg.");
        return 0;
    }
    secure_wipe(joined, strlen(joined));
    free(joined);
    args_free(&args);
    ZeroMemory(&si, sizeof si);
    si.cb = sizeof si;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    if (!CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        secure_wipe(cmd, sizeof cmd);
        set_status(L"Não iniciei o ffmpeg. Verifique se ele está no PATH.");
        return 0;
    }
    secure_wipe(cmd, sizeof cmd);
    CloseHandle(pi.hThread);
    g_proc = pi.hProcess;
    g_scene_kind = spec.scene;
    g_scene_start = GetTickCount64();
    g_running = 1;
    {
        wchar_t label[64];
        MultiByteToWideChar(CP_UTF8, 0, scene_label(spec.scene), -1, label, 64);
        SetWindowTextW(g_scene, label);
    }
    set_status(L"Publicando H.264 + AAC em /culto-aac. O NO AR só aparece se o HLS responder.");
    return 1;
}

static void poll_health(void) {
    HINTERNET ses, con, req;
    char buf[4096];
    DWORD n = 0, got = 0;
    if (!g_running) return;
    ses = WinHttpOpen(L"EstudioPromessas", WINHTTP_ACCESS_TYPE_NO_PROXY, NULL, NULL, 0);
    if (!ses) return;
    con = WinHttpConnect(ses, L"127.0.0.1", 8888, 0);
    req = con ? WinHttpOpenRequest(con, L"GET", L"/culto-aac/index.m3u8", NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0) : NULL;
    if (req && WinHttpSendRequest(req, WINHTTP_NO_ADDITIONAL_HEADERS, 0, NULL, 0, 0, 0) && WinHttpReceiveResponse(req, NULL)) {
        while (got < sizeof buf - 1 && WinHttpReadData(req, buf + got, (DWORD)(sizeof buf - 1 - got), &n) && n) got += n;
        buf[got] = 0;
        if (hls_has_aac_video(buf)) set_status(L"NO AR · HLS anuncia H.264 e AAC. Confira o iPhone.");
        else if (strstr(buf, "opus")) set_status(L"O HLS ainda anuncia Opus. Esta saída não deve ir ao iPhone.");
        else set_status(L"ffmpeg está ativo, mas /culto-aac ainda não entregou playlist AAC.");
    }
    if (req) WinHttpCloseHandle(req);
    if (con) WinHttpCloseHandle(con);
    if (ses) WinHttpCloseHandle(ses);
}

static void advance_scene(void) {
    DWORD code = 0;
    int limit;
    ULONGLONG elapsed;
    if (!g_running || !g_proc) return;
    if (WaitForSingleObject(g_proc, 0) == WAIT_OBJECT_0) {
        GetExitCodeProcess(g_proc, &code);
        CloseHandle(g_proc);
        g_proc = NULL;
        g_running = 0;
        set_status(L"O ffmpeg encerrou. Veja o registro abaixo. A senha não é escrita nele.");
        log_line("ffmpeg encerrou");
        return;
    }
    if (g_scene_kind == SCENE_CAMERA || g_scene_kind == SCENE_SCREEN) return;
    limit = scene_seconds(g_scene_kind, (int)SendMessageW(g_test, BM_GETCHECK, 0, 0) == BST_CHECKED);
    elapsed = (GetTickCount64() - g_scene_start) / 1000;
    if (limit && elapsed >= (ULONGLONG)limit) {
        if (g_scene_kind == SCENE_COUNTDOWN) start_scene(SCENE_OPENING);
        else if (g_scene_kind == SCENE_OPENING) start_scene(SCENE_CAMERA);
        else if (g_scene_kind == SCENE_CLOSING) start_scene(SCENE_FINAL);
        else if (g_scene_kind == SCENE_FINAL) { stop_ffmpeg(); set_status(L"Apresentação encerrada."); }
    }
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_CREATE:
        g_title = CreateWindowW(L"EDIT", L"Culto da Família", WS_CHILD | WS_VISIBLE | WS_BORDER, 0, 0, 10, 10, hwnd, (HMENU)ID_TITLE, NULL, NULL);
        g_address = CreateWindowW(L"EDIT", L"Rua Pascoal de Souza Lima, 507 — Santa Terezinha, Governador Valadares — MG", WS_CHILD | WS_VISIBLE | WS_BORDER | ES_MULTILINE, 0, 0, 10, 10, hwnd, (HMENU)ID_ADDRESS, NULL, NULL);
        g_fmt_h = CreateWindowW(L"BUTTON", L"Deitado  16:9", WS_CHILD | WS_VISIBLE | BS_AUTORADIOBUTTON | WS_GROUP, 0, 0, 10, 10, hwnd, (HMENU)ID_FMT_H, NULL, NULL);
        g_fmt_v = CreateWindowW(L"BUTTON", L"Em pé  9:16", WS_CHILD | WS_VISIBLE | BS_AUTORADIOBUTTON, 0, 0, 10, 10, hwnd, (HMENU)ID_FMT_V, NULL, NULL);
        g_test = CreateWindowW(L"BUTTON", L"Modo de teste (abertura acelerada)", WS_CHILD | WS_VISIBLE | BS_AUTOCHECKBOX, 0, 0, 10, 10, hwnd, (HMENU)ID_TEST, NULL, NULL);
        g_src_cam = CreateWindowW(L"BUTTON", L"Câmera", WS_CHILD | WS_VISIBLE | BS_AUTORADIOBUTTON | WS_GROUP, 0, 0, 10, 10, hwnd, (HMENU)ID_SRC_CAM, NULL, NULL);
        g_src_scr = CreateWindowW(L"BUTTON", L"Tela", WS_CHILD | WS_VISIBLE | BS_AUTORADIOBUTTON, 0, 0, 10, 10, hwnd, (HMENU)ID_SRC_SCR, NULL, NULL);
        g_cam = CreateWindowW(L"COMBOBOX", L"", WS_CHILD | WS_VISIBLE | CBS_DROPDOWNLIST, 0, 0, 10, 200, hwnd, (HMENU)ID_CAM, NULL, NULL);
        g_mic = CreateWindowW(L"COMBOBOX", L"", WS_CHILD | WS_VISIBLE | CBS_DROPDOWNLIST, 0, 0, 10, 200, hwnd, (HMENU)ID_MIC, NULL, NULL);
        CreateWindowW(L"BUTTON", L"Atualizar dispositivos", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, (HMENU)ID_REFRESH, NULL, NULL);
        g_key = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_BORDER | ES_PASSWORD | ES_AUTOHSCROLL, 0, 0, 10, 10, hwnd, (HMENU)ID_KEY, NULL, NULL);
        g_saved = CreateWindowW(L"STATIC", L"", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, NULL, NULL, NULL);
        CreateWindowW(L"BUTTON", L"Trocar senha", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, (HMENU)ID_CHANGE, NULL, NULL);
        CreateWindowW(L"BUTTON", L"Limpar senha salva", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, (HMENU)ID_CLEAR, NULL, NULL);
        CreateWindowW(L"BUTTON", L"Verificar servidor", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, (HMENU)ID_CHECK, NULL, NULL);
        CreateWindowW(L"BUTTON", L"Conectar transmissão agora", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, (HMENU)ID_TRANSMIT, NULL, NULL);
        g_start = CreateWindowW(L"BUTTON", L"Iniciar apresentação", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, (HMENU)ID_START, NULL, NULL);
        CreateWindowW(L"BUTTON", L"Adiantar para a câmera", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, (HMENU)ID_SKIP, NULL, NULL);
        CreateWindowW(L"BUTTON", L"Encerrar", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, (HMENU)ID_END, NULL, NULL);
        CreateWindowW(L"BUTTON", L"Parar", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, (HMENU)ID_STOP, NULL, NULL);
        g_scene = CreateWindowW(L"STATIC", L"EM ESPERA", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, NULL, NULL, NULL);
        g_clock = CreateWindowW(L"STATIC", L"00:00", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, NULL, NULL, NULL);
        g_status = CreateWindowW(L"STATIC", L"", WS_CHILD | WS_VISIBLE, 0, 0, 10, 10, hwnd, NULL, NULL, NULL);
        g_log = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"", WS_CHILD | WS_VISIBLE | ES_MULTILINE | ES_AUTOVSCROLL | ES_READONLY | WS_VSCROLL, 0, 0, 10, 10, hwnd, (HMENU)ID_LOG, NULL, NULL);
        SendMessageW(g_fmt_h, BM_SETCHECK, BST_CHECKED, 0);
        SendMessageW(g_src_cam, BM_SETCHECK, BST_CHECKED, 0);
        SetTimer(hwnd, ID_TIMER, 1000, NULL);
        return 0;
    case WM_SIZE: {
        int w = LOWORD(lp), h = HIWORD(lp);
        int left = 24, col = 460, y = 24, x = left;
        if (w < 900) w = 900;
        MoveWindow(g_title, x, y, col - 40, 28, TRUE);
        MoveWindow(g_address, x, y + 64, col - 40, 48, TRUE);
        MoveWindow(g_fmt_h, x, y + 130, 160, 28, TRUE);
        MoveWindow(g_fmt_v, x + 170, y + 130, 140, 28, TRUE);
        MoveWindow(g_test, x, y + 168, 280, 24, TRUE);
        MoveWindow(g_src_cam, x, y + 210, 120, 28, TRUE);
        MoveWindow(g_src_scr, x + 130, y + 210, 120, 28, TRUE);
        MoveWindow(g_cam, x, y + 250, col - 40, 200, TRUE);
        MoveWindow(g_mic, x, y + 290, col - 40, 200, TRUE);
        MoveWindow(GetDlgItem(hwnd, ID_REFRESH), x, y + 330, 200, 30, TRUE);
        MoveWindow(g_key, x, y + 390, col - 40, 28, TRUE);
        MoveWindow(g_saved, x, y + 422, col - 40, 20, TRUE);
        MoveWindow(GetDlgItem(hwnd, ID_CHANGE), x, y + 448, 140, 30, TRUE);
        MoveWindow(GetDlgItem(hwnd, ID_CLEAR), x + 150, y + 448, 170, 30, TRUE);
        MoveWindow(GetDlgItem(hwnd, ID_CHECK), x, y + 488, 160, 32, TRUE);
        MoveWindow(GetDlgItem(hwnd, ID_TRANSMIT), x + 170, y + 488, 240, 32, TRUE);
        MoveWindow(g_scene, col + 20, 24, 220, 28, TRUE);
        MoveWindow(g_clock, col + 250, 24, 120, 28, TRUE);
        MoveWindow(g_start, col + 20, h - 230, 200, 36, TRUE);
        MoveWindow(GetDlgItem(hwnd, ID_SKIP), col + 230, h - 230, 200, 36, TRUE);
        MoveWindow(GetDlgItem(hwnd, ID_END), col + 440, h - 230, 140, 36, TRUE);
        MoveWindow(GetDlgItem(hwnd, ID_STOP), col + 590, h - 230, 100, 36, TRUE);
        MoveWindow(g_status, col + 20, h - 180, w - col - 40, 36, TRUE);
        MoveWindow(g_log, 24, h - 130, w - 48, 100, TRUE);
        InvalidateRect(hwnd, NULL, TRUE);
        return 0;
    }
    case WM_TIMER:
        if (g_running) {
            ULONGLONG sec = (GetTickCount64() - g_scene_start) / 1000;
            wchar_t clock[16];
            _snwprintf(clock, 16, L"%02u:%02u", (unsigned)(sec / 60), (unsigned)(sec % 60));
            SetWindowTextW(g_clock, clock);
            advance_scene();
            if ((sec % 5) == 0) poll_health();
        }
        return 0;
    case WM_COMMAND:
        switch (LOWORD(wp)) {
        case ID_REFRESH: refresh_devices(); break;
        case ID_CHANGE: on_change_key(); break;
        case ID_CLEAR: on_clear_key(); break;
        case ID_CHECK: poll_health(); if (!g_running) set_status(L"Sem envio ativo. O servidor só confirma NO AR depois do ffmpeg publicar."); break;
        case ID_TRANSMIT:
        case ID_START: start_scene(SCENE_COUNTDOWN); break;
        case ID_SKIP: if (g_running) start_scene(SCENE_CAMERA); break;
        case ID_END: if (g_running) start_scene(SCENE_CLOSING); break;
        case ID_STOP: stop_ffmpeg(); SetWindowTextW(g_scene, L"EM ESPERA"); set_status(L"Envio parado. O MediaMTX não foi reiniciado."); break;
        default: break;
        }
        return 0;
    case WM_DESTROY:
        stop_ffmpeg();
        wipe_key();
        PostQuitMessage(0);
        return 0;
    default:
        return DefWindowProcW(hwnd, msg, wp, lp);
    }
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, wchar_t *cmd, int show) {
    WNDCLASSW wc;
    MSG msg;
    (void)prev; (void)cmd;
    key_file();
    ZeroMemory(&wc, sizeof wc);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = CreateSolidBrush(RGB(18, 20, 26));
    wc.lpszClassName = L"EstudioPromessas";
    RegisterClassW(&wc);
    g_win = CreateWindowExW(0, L"EstudioPromessas", L"Igreja Promessas — Central de Transmissão",
        WS_OVERLAPPEDWINDOW | WS_VISIBLE, 40, 30, 1280, 820, NULL, NULL, inst, NULL);
    load_key();
    load_assets();
    refresh_devices();
    ShowWindow(g_win, show);
    while (GetMessageW(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return 0;
}
