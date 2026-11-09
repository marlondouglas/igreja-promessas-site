#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "studio_pack.h"

static const wchar_t *kNeed[] = {
    L"culto\\studio.html",
    L"culto\\studio.css",
    L"culto\\studio.js",
    L"culto\\whip-video.js",
    L"culto\\transmitir.js",
    L"logo-promessas.svg",
    L"pix-promessas.svg",
    L"culto\\assets\\abertura-promessas-300s-R5.mp4",
    L"culto\\assets\\encerramento-promessas-120s-R5.mp4",
    L"culto\\assets\\tela-final-promessas-R5.png"
};

static wchar_t g_root[MAX_PATH];
static volatile LONG g_stop;
static SOCKET g_listen = INVALID_SOCKET;

static int is_smoke(const wchar_t *cmd) {
    return cmd && (wcsstr(cmd, L"--smoke-test") || wcsstr(cmd, L"--offline"));
}

static void exe_dir(wchar_t *dir, size_t cap) {
    GetModuleFileNameW(NULL, dir, (DWORD)cap);
    if (wcsrchr(dir, L'\\')) *wcsrchr(dir, L'\\') = 0;
}

static int files_ok(void) {
    size_t i;
    exe_dir(g_root, MAX_PATH);
    for (i = 0; i < sizeof kNeed / sizeof kNeed[0]; i++) {
        wchar_t path[MAX_PATH];
        _snwprintf(path, MAX_PATH, L"%s\\%s", g_root, kNeed[i]);
        if (GetFileAttributesW(path) == INVALID_FILE_ATTRIBUTES) return 0;
    }
    return 1;
}

static const wchar_t *find_browser(void) {
    static const wchar_t *cands[] = {
        L"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        L"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        L"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        L"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    };
    size_t i;
    for (i = 0; i < sizeof cands / sizeof cands[0]; i++) {
        if (GetFileAttributesW(cands[i]) != INVALID_FILE_ATTRIBUTES) return cands[i];
    }
    return NULL;
}

static const char *mime_of(const char *rel) {
    const char *dot = strrchr(rel, '.');
    if (!dot) return "application/octet-stream";
    if (_stricmp(dot, ".html") == 0) return "text/html; charset=utf-8";
    if (_stricmp(dot, ".css") == 0) return "text/css; charset=utf-8";
    if (_stricmp(dot, ".js") == 0) return "text/javascript; charset=utf-8";
    if (_stricmp(dot, ".svg") == 0) return "image/svg+xml";
    if (_stricmp(dot, ".png") == 0) return "image/png";
    if (_stricmp(dot, ".mp4") == 0) return "video/mp4";
    if (_stricmp(dot, ".json") == 0) return "application/json";
    return "application/octet-stream";
}

static void send_all(SOCKET s, const char *buf, size_t n) {
    size_t off = 0;
    while (off < n) {
        int w = send(s, buf + off, (int)(n - off), 0);
        if (w <= 0) return;
        off += (size_t)w;
    }
}

static void reply_status(SOCKET s, int code, const char *text) {
    char hdr[256];
    _snprintf(hdr, sizeof hdr, "HTTP/1.1 %d %s\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", code, text);
    send_all(s, hdr, strlen(hdr));
}

static void serve(SOCKET s) {
    char req[4096];
    char rel[512];
    wchar_t path[MAX_PATH];
    char line[256];
    HANDLE file;
    LARGE_INTEGER size;
    unsigned long long start = 0, end = 0, total;
    int n, i, have_range = 0;
    const char *sp, *mime;
    memset(req, 0, sizeof req);
    n = recv(s, req, (int)sizeof req - 1, 0);
    if (n <= 0) return;
    if (strncmp(req, "GET ", 4) != 0) { reply_status(s, 405, "Method Not Allowed"); return; }
    sp = req + 4;
    while (*sp == ' ') sp++;
    i = 0;
    while (sp[i] && sp[i] != ' ' && i < 500) { line[i] = sp[i]; i++; }
    line[i] = 0;
    if (!pack_map(line, rel, sizeof rel)) { reply_status(s, 404, "Not Found"); return; }
        if (MultiByteToWideChar(CP_UTF8, 0, rel, -1, path, MAX_PATH) <= 0) { reply_status(s, 404, "Not Found"); return; }
    {
        wchar_t full[MAX_PATH];
        wchar_t *p;
        _snwprintf(full, MAX_PATH, L"%s\\%s", g_root, path);
        for (p = full; *p; p++) if (*p == L'/') *p = L'\\';
        file = CreateFileW(full, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    }
    if (file == INVALID_HANDLE_VALUE) { reply_status(s, 404, "Not Found"); return; }
    if (!GetFileSizeEx(file, &size) || size.QuadPart < 0) { CloseHandle(file); reply_status(s, 500, "Error"); return; }
    total = (unsigned long long)size.QuadPart;
    end = total ? total - 1 : 0;
    {
        const char *range = strstr(req, "\r\nRange: bytes=");
        if (range) {
            unsigned long long a = 0, b = end;
            range += 15;
            if (sscanf(range, "%llu-%llu", &a, &b) >= 1 && a < total) {
                if (b >= total) b = total - 1;
                if (b >= a) { start = a; end = b; have_range = 1; }
            }
        }
    }
    mime = mime_of(rel);
    {
        char hdr[512];
        unsigned long long len = total ? end - start + 1 : 0;
        LARGE_INTEGER pos;
        pos.QuadPart = (LONGLONG)start;
        if (have_range)
            _snprintf(hdr, sizeof hdr,
                "HTTP/1.1 206 Partial Content\r\nContent-Type: %s\r\nAccept-Ranges: bytes\r\nContent-Range: bytes %llu-%llu/%llu\r\nContent-Length: %llu\r\nConnection: close\r\n\r\n",
                mime, start, end, total, len);
        else
            _snprintf(hdr, sizeof hdr,
                "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nAccept-Ranges: bytes\r\nContent-Length: %llu\r\nConnection: close\r\n\r\n",
                mime, total);
        send_all(s, hdr, strlen(hdr));
        if (len && SetFilePointerEx(file, pos, NULL, FILE_BEGIN)) {
            unsigned long long left = len;
            char buf[65536];
            while (left) {
                DWORD got = 0, chunk = left > sizeof buf ? (DWORD)sizeof buf : (DWORD)left;
                if (!ReadFile(file, buf, chunk, &got, NULL) || !got) break;
                send_all(s, buf, got);
                left -= got;
            }
        }
    }
    CloseHandle(file);
}

static DWORD WINAPI client_thread(LPVOID arg) {
    SOCKET s = (SOCKET)(UINT_PTR)arg;
    serve(s);
    closesocket(s);
    return 0;
}

static DWORD WINAPI listen_thread(LPVOID arg) {
    (void)arg;
    while (!g_stop) {
        SOCKET s = accept(g_listen, NULL, NULL);
        if (s == INVALID_SOCKET) break;
        CloseHandle(CreateThread(NULL, 0, client_thread, (LPVOID)(UINT_PTR)s, 0, NULL));
    }
    return 0;
}

static int listen_loopback(int *port_out) {
    WSADATA wsa;
    struct sockaddr_in addr;
    int port;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 0;
    for (port = 8097; port < 8120; port++) {
        SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        int yes = 1;
        if (s == INVALID_SOCKET) continue;
        setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (char *)&yes, sizeof yes);
        memset(&addr, 0, sizeof addr);
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        addr.sin_port = htons((unsigned short)port);
        if (bind(s, (struct sockaddr *)&addr, sizeof addr) == 0 && listen(s, 16) == 0) {
            g_listen = s;
            *port_out = port;
            return 1;
        }
        closesocket(s);
    }
    return 0;
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, wchar_t *cmd, int show) {
    int smoke = is_smoke(cmd);
    (void)inst; (void)prev; (void)show;
    if (!files_ok()) return 4;
    if (smoke) return 0;
    {
        const wchar_t *browser = find_browser();
        int port = 0;
        wchar_t profile[MAX_PATH], url[256], launch[2000];
        STARTUPINFOW si;
        PROCESS_INFORMATION pi;
        HANDLE job, thread;
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION info;
        if (!browser) {
            MessageBoxW(NULL, L"Não encontrei o Microsoft Edge nem o Chrome. O estúdio abre na janela do Edge, sem barra de endereço.", L"Igreja Promessas", MB_ICONWARNING);
            return 2;
        }
        if (!listen_loopback(&port)) {
            MessageBoxW(NULL, L"Não abri o servidor local. Nada foi publicado.", L"Igreja Promessas", MB_ICONWARNING);
            return 3;
        }
        thread = CreateThread(NULL, 0, listen_thread, NULL, 0, NULL);
        {
            wchar_t base[MAX_PATH];
            SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, base);
            _snwprintf(profile, MAX_PATH, L"%s\\IgrejaPromessas", base);
            CreateDirectoryW(profile, NULL);
            _snwprintf(profile, MAX_PATH, L"%s\\IgrejaPromessas\\PromessasStudio", base);
            CreateDirectoryW(profile, NULL);
            _snwprintf(profile, MAX_PATH, L"%s\\IgrejaPromessas\\PromessasStudio\\edge", base);
            CreateDirectoryW(profile, NULL);
        }
        _snwprintf(url, 256, L"http://127.0.0.1:%d/culto/studio.html", port);
        _snwprintf(launch, 2000, L"\"%s\" --user-data-dir=\"%s\" --app=%s --new-window --window-size=1440,900 --no-first-run", browser, profile, url);
        ZeroMemory(&si, sizeof si);
        si.cb = sizeof si;
        if (!CreateProcessW(NULL, launch, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
            g_stop = 1;
            closesocket(g_listen);
            MessageBoxW(NULL, L"Não abri a janela do Edge.", L"Igreja Promessas", MB_ICONWARNING);
            return 2;
        }
        job = CreateJobObjectW(NULL, NULL);
        memset(&info, 0, sizeof info);
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info, sizeof info);
        AssignProcessToJobObject(job, pi.hProcess);
        WaitForSingleObject(pi.hProcess, INFINITE);
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        CloseHandle(job);
        g_stop = 1;
        closesocket(g_listen);
        if (thread) { WaitForSingleObject(thread, 2000); CloseHandle(thread); }
        WSACleanup();
    }
    return 0;
}
