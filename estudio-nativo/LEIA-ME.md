# Estúdio nativo — Igreja Promessas

Programa Windows em Win32. Não é página web, Electron nem WebView. A captura usa DirectShow e a área de trabalho pelo ffmpeg (`dshow` e `gdigrab`). A saída é H.264 Baseline + AAC-LC para `rtsp://127.0.0.1:8554/culto-aac`. O estúdio do navegador e o relay continuam no repositório, sem serem substituídos.

Este executável foi compilado neste ambiente Linux com mingw. Não foi aberto no Windows. Não há teste de câmera, DPAPI real, nem iPhone a partir daqui.

## O que a tela repete do estúdio atual

A ordem é a mesma: título, endereço, formato, modo de teste, câmera ou tela, dispositivos, senha, verificar servidor, conectar transmissão, monitor com cena e relógio, iniciar, adiantar, encerrar, parar e o registro do ffmpeg. Não há medidor falso. O texto NO AR só muda depois que `http://127.0.0.1:8888/culto-aac/index.m3u8` anuncia H.264 e AAC.

## Senha

A senha fica em `%LOCALAPPDATA%\IgrejaPromessas\Estudio\stream-key.bin`, cifrada com DPAPI do usuário do Windows (`CryptProtectData`). O campo volta vazio e mascarado; a frase ao lado diz que há senha salva. Trocar e limpar estão na mesma faixa. Se o arquivo não abrir, a senha é apagada da memória e o programa pede outra. Ela não entra no registro da tela.

Enquanto o ffmpeg publica, a linha de comando do processo contém a URL `rtsp://promessas:…@127.0.0.1:8554/culto-aac`. O Gerenciador de Tarefas pode mostrar isso. Não há como o ffmpeg receber a senha de outro modo sem colocá-la nessa linha. O programa não grava essa linha em arquivo nem a repete no registro.

## Compilar no notebook

É preciso o gcc do mingw-w64 (WinLibs ou MSYS2, cerca de algumas centenas de MB) e o ffmpeg GPL já usado no relay, no PATH. Na pasta `estudio-nativo`:

```
x86_64-w64-mingw32-gcc -Wall -O2 -municode -mwindows -o EstudioPromessas.exe main.c core.c -lwinhttp -lcrypt32 -luser32 -lgdi32 -lcomctl32 -lshell32
```

Não instala nada no sistema além de gerar o exe nesta pasta.

## Usar

Coloque ao lado do exe, copiados da pasta do site, sem alterar a logo:

- `abertura-promessas-300s-R5.mp4`
- `encerramento-promessas-120s-R5.mp4`
- `tela-final-promessas-R5.png`

Não rode este programa junto com `iniciar-relay-aac.ps1`: os dois publicam em `/culto-aac`. O WHIP do navegador em `/culto` pode continuar como reserva, sem ser ligado ao mesmo tempo que este envio.

A contagem dura 10 s, a abertura 5 min (15 s no teste), a câmera fica até Encerrar, o encerramento 2 min (12 s no teste) e a arte final 18 s. Cada troca de cena encerra o ffmpeg e abre outro. Há um intervalo curto. O atraso de cerca de 20 s do player público não é uma espera inicial: o hls.js segura 20 s atrás da borda; no iPhone o player nativo só consegue ir até o fim da janela que o MediaMTX já guarda. Isso não foi medido no telefone nesta alteração. A marca menor está só no `drawLiveBrand` do vídeo do estúdio web, não no cabeçalho do site.
