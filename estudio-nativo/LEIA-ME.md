# Estúdio nativo — Igreja Promessas

Programa Windows em Win32. Não é página web, Electron nem WebView. A captura usa DirectShow e a área de trabalho pelo ffmpeg (`dshow` e `gdigrab`). A saída é H.264 Baseline + AAC-LC para `rtsp://127.0.0.1:8554/culto-aac`. O estúdio do navegador e o relay continuam no repositório, sem serem substituídos.

## Arranque

Sem argumento, abrir o exe **não publica** e **não liga a câmera**. Faz só isto:

- cria a pasta `%LOCALAPPDATA%\IgrejaPromessas\Estudio` se ela não existir;
- se `stream-key.bin` já existir, lê a senha com DPAPI para a memória; se o arquivo estiver ilegível, apaga esse arquivo;
- confere se os três arquivos de mídia estão ao lado do exe;
- executa `ffmpeg -list_devices true -f dshow -i dummy` para listar câmera e microfone. Isso não envia nada ao MediaMTX. Pode tocar o dispositivo só para enumerar.

A transmissão de `/culto-aac` só começa no botão **Iniciar apresentação** ou **Conectar transmissão agora**. Enquanto o supervisor 15984 for o publicador de `/culto-aac`, não aperte esses botões.

`--camera` é outro modo. Ao abrir, além da lista, mostra a prévia da webcam. O envio para `camera-pc` só começa em **Iniciar envio**. Durante o envio a prévia continua no mesmo ffmpeg. Não consulta `/culto-aac`.

`--smoke-test` e `--offline` são o mesmo teste. Criam a janela oculta, procuram `ffmpeg.exe` ao lado do exe ou no PATH **deste processo**, conferem os três arquivos e saem. Não criam pasta, não leem nem apagam senha, não abrem câmera, microfone nem rede. O programa não altera o PATH do Windows.

Código de saída: `0` pronto; `1` a janela não abriu; `2` sem ffmpeg neste processo; `4` falta um arquivo de mídia. Os bits somam.

```
$env:PATH = "C:\caminho\do\ffmpeg9;" + $env:PATH
.\EstudioPromessas.exe --smoke-test
echo $LASTEXITCODE
```

Não use o exe antigo da pasta `teste-estudio-nativo-20261108-205731` para esse teste: ele não tem esta opção. Ao abrir, aquele arquivo cria a pasta da senha, pode apagar um `stream-key.bin` ilegível e lista os dispositivos.

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

A contagem dura 10 s, a abertura 5 min (15 s no teste), a câmera fica até Encerrar, o encerramento 2 min (12 s no teste) e a arte final 18 s. Cada troca de cena encerra o ffmpeg e abre outro. Há um intervalo curto.

## Câmeras remotas

O celular publica em `rtmp://IP-DO-NOTEBOOK:1935/camera-remota`. Outro PC, ou este mesmo em modo câmera, publica em `rtmp://IP:1935/camera-pc`. Nenhum dos dois grava em `/culto` nem em `/culto-aac`. O estúdio, com a opção Celular ou Outro PC, lê `rtsp://127.0.0.1:8554/` desse caminho e reencoda H.264 + AAC para `/culto-aac`. Não é uma cópia crua.

O IP não vem preenchido. Neste notebook, digite `127.0.0.1`. Em outro aparelho, use o IP que o Windows mostrar na rede. A configuração do MediaMTX não foi alterada. Se o servidor recusar o caminho novo, o aviso aparece no programa; não se abre autenticação nem firewall daqui.

Modo câmera deste PC: `EstudioPromessas.exe --camera`. A prévia sai do mesmo ffmpeg que publica em `camera-pc`, também enquanto envia. O estado “Conectado” só aparece quando o ffmpeg informa quadro ou saída. Esse modo não consulta `/culto-aac`. Recusa e senha errada aparecem como falha. O ffmpeg é procurado ao lado do exe e depois no PATH deste processo. O programa não grava PATH no sistema.

O app Android está em `camera-remota`. O comando é `gradle assembleDebug`. O APK desta máquina depende do Android SDK; o workflow `.github/workflows/camera-remota.yml` tenta o mesmo comando. Não foi instalado em telefone.
