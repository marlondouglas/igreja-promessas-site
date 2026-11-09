CC ?= gcc
MINGW ?= x86_64-w64-mingw32-gcc
CFLAGS ?= -Wall -Wextra -O2

.PHONY: test win clean

test: test_core
	./test_core

test_core: test_core.c core.c paint.c core.h paint.h
	$(CC) $(CFLAGS) -o test_core test_core.c core.c paint.c -lm

win: EstudioPromessas.exe

EstudioPromessas.exe: main.c core.c core.h
	$(MINGW) $(CFLAGS) -municode -mwindows -o EstudioPromessas.exe main.c core.c paint.c -lwinhttp -lcrypt32 -luser32 -lgdi32 -lcomctl32 -lshell32 -lcomdlg32 -lm

clean:
	rm -f test_core EstudioPromessas.exe estudio-key-test.bin
