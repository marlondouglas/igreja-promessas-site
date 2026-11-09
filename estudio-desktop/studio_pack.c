#include "studio_pack.h"

#include <string.h>

int pack_map(const char *url, char *rel, size_t cap) {
    const char *q;
    size_t n, i, o;
    if (!url || !rel || cap < 2 || url[0] != '/') return 0;
    q = strchr(url, '?');
    n = q ? (size_t)(q - url) : strlen(url);
    if (n < 2 || n >= cap) return 0;
    o = 0;
    for (i = 1; i < n; i++) {
        char c = url[i];
        if (c == '\\' || c == ':' || c == '\0') return 0;
        if (c == '.' && i + 1 < n && url[i + 1] == '.') return 0;
        rel[o++] = c;
    }
    rel[o] = 0;
    if (!rel[0] || strstr(rel, "..")) return 0;
    return 1;
}
