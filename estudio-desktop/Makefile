CC ?= gcc
MINGW ?= x86_64-w64-mingw32-gcc
WINDRES ?= x86_64-w64-mingw32-windres
CFLAGS ?= -Wall -Wextra -O2

.PHONY: test win clean

test: test_pack
	./test_pack

test_pack: test_pack.c studio_pack.c studio_pack.h
	$(CC) $(CFLAGS) -o test_pack test_pack.c studio_pack.c

win: PromessasStudio.exe

promessas.o: app.rc promessas.ico
	$(WINDRES) app.rc -o promessas.o

PromessasStudio.exe: host.c studio_pack.c studio_pack.h promessas.o
	$(MINGW) $(CFLAGS) -municode -mwindows -o PromessasStudio.exe host.c studio_pack.c promessas.o -lws2_32 -luser32 -lshell32 -lgdi32

clean:
	rm -f test_pack PromessasStudio.exe promessas.o
