#include "studio_pack.h"

#include <stdio.h>
#include <string.h>

static int g_fail;

static void expect(int cond, const char *name) {
    if (!cond) {
        fprintf(stderr, "falhou: %s\n", name);
        g_fail++;
    }
}

int main(void) {
    char rel[256];
    expect(pack_map("/culto/studio.html?v=1111", rel, sizeof rel) && strcmp(rel, "culto/studio.html") == 0, "pagina do estudio");
    expect(pack_map("/logo-promessas.svg", rel, sizeof rel) && strcmp(rel, "logo-promessas.svg") == 0, "logo");
    expect(pack_map("/culto/assets/abertura-promessas-300s-R5.mp4", rel, sizeof rel), "video");
    expect(!pack_map("/culto/../segredo", rel, sizeof rel), "recusa subir pasta");
    expect(!pack_map("/culto/studio.html\\..\\x", rel, sizeof rel), "recusa barra invertida");
    expect(!pack_map("culto/studio.html", rel, sizeof rel), "exige caminho absoluto");
    expect(!pack_map("/", rel, sizeof rel), "raiz vazia");
    if (g_fail) {
        fprintf(stderr, "%d falhas\n", g_fail);
        return 1;
    }
    printf("ok\n");
    return 0;
}
