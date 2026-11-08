# HLS no iPhone — pacote para o notebook

Safari e Chrome no iPhone usam o reprodutor HLS do sistema. Os dois recusam áudio Opus. O envio WHIP atual continua H.264 + Opus em `/culto`. Este pacote cria `/culto-aac` com H.264 Baseline nível 3.1 e AAC-LC 48 kHz estéreo, sem trocar o publisher.

O site público já prefere `/culto-aac` quando o master anuncia `mp4a.40` e `avc1`. Dá para testar o telefone sem publicar este repositório. A transmissão ao vivo já foi encerrada. Nada aqui reinicia o MediaMTX nem o site.

Este pacote foi conferido com ffmpeg e ffprobe neste ambiente. Safari e Chrome no iPhone não foram abertos daqui. `RESULTADO: APTO` no verificador autoriza a tentativa no telefone; não significa que o telefone já passou.

## Requisitos

- Windows, na mesma máquina do MediaMTX.
- ffmpeg 6 ou mais novo, build GPL com `libx264` e o encoder AAC nativo. O build sem x264 não serve.
- ffprobe na mesma pasta. Ele confirma o segmento, não só o texto da playlist.
- Referência: <https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip>
- MediaMTX já instalado, HLS em `127.0.0.1:8888`, RTSP em `127.0.0.1:8554`, path de envio `/culto`.
- Não é necessário Node no notebook.

Conferência do ffmpeg, nesta ordem:

```powershell
ffmpeg -hide_banner -encoders | findstr libx264
ffmpeg -hide_banner -encoders | findstr " aac "
```

As duas linhas precisam aparecer. `libx264` é o vídeo. A linha do `aac` nativo é o áudio.

## Arquivos

Copiar esta pasta para:

`C:\Users\MARLO\Documents\Igreja-Promessas-Live-Server\relay\`

- `iniciar-relay-aac.ps1` — publica o relay.
- `verificar-hls.ps1` — lê a playlist e um segmento.
- `paths-culto-aac.yml` — só se o MediaMTX recusar o path novo.
- `hls-manifest.js` e o teste — ficam no Git. O notebook não precisa deles.

## Teste seguro, sem culto

1. Confirme que não há culto no ar.
2. Copie o yml atual para um arquivo ao lado, com a data no nome. Não edite essa cópia.
3. Deixe o MediaMTX como está. Não reinicie.
4. Numa janela:

```powershell
cd C:\Users\MARLO\Documents\Igreja-Promessas-Live-Server\relay
powershell -NoProfile -ExecutionPolicy Bypass -File .\iniciar-relay-aac.ps1 -PadraoTeste
```

`-PadraoTeste` gera barras 1280x720 e um tom. Não lê `/culto` e não usa a senha de publicação.

5. Noutra janela, com o padrão ainda rodando:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\verificar-hls.ps1
```

O resultado tem de terminar em `RESULTADO: APTO`. Qualquer `FALHA` interrompe o teste no telefone.

6. Só depois do APTO, no iPhone, abra nos dois navegadores:

- Safari: `https://marlon-tiffany.tail7759a9.ts.net/culto-aac`
- Chrome: a mesma URL

A página do site (`https://igrejapromessas.site/culto/`) também deve selecionar essa saída, porque o player já exige AAC anunciado. Repita Safari e Chrome nessa página.

7. Encerre o padrão com Ctrl+C ou:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\iniciar-relay-aac.ps1 -Parar
```

`-Parar` encerra somente `ffmpeg.exe` cuja linha de comando contém `culto-aac`.

## Se o padrão for recusado

- `401`: o RTSP local está exigindo a mesma publicação do estúdio. Na janela, sem gravar em arquivo e sem colar em conversa:

```powershell
$env:PROMESSAS_RTSP_DESTINO = "rtsp://promessas:COLE_A_SENHA_AQUI@127.0.0.1:8554/culto-aac"
```

O usuário `promessas` é o do envio WHIP já público em `culto/transmitir.js`. A senha é a que o estúdio já usa.

- Path inexistente ou publicação negada: o único arquivo local necessário é

`C:\Users\MARLO\Documents\Igreja-Promessas-Live-Server\mediamtx\mediamtx-promessas.yml`

Antes de compartilhar, apague senhas, tokens e segredos WebRTC. Conservar `paths`, `hlsVariant`, `hlsAddress` e `rtspAddress`. Dentro do `paths:` que já existe, acrescente somente o bloco indicado em `paths-culto-aac.yml`. Restaure o servidor com a cópia se a edição falhar. O reinício do MediaMTX, nesse caso, é manual.

Não mude `hlsVariant` para obter AAC. O MediaMTX não transcodifica Opus.

## Culto de ensaio, depois do padrão APTO

Com o estúdio enviando para `/culto`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\iniciar-relay-aac.ps1 -AguardarCulto
```

Isso lê `/culto`, reencoda e publica em `/culto-aac`. O WHIP não muda. No ensaio em pé, a resolução esperada deixa de ser 1280x720:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\verificar-hls.ps1 -ResolucaoEsperada 720x1280
```

O hook automático do yml fica para depois desse ensaio. Ele está comentado em `paths-culto-aac.yml` e exige reinício manual do MediaMTX.

## Rollback

1. `iniciar-relay-aac.ps1 -Parar`
2. Feche a janela do relay se ela continuar.
3. Se o yml não foi editado, o MediaMTX permanece como estava. `/culto-aac` some quando o ffmpeg para.
4. Se o yml foi editado, devolva a cópia para `mediamtx-promessas.yml` e só então reinicie o MediaMTX manualmente.
5. Nenhuma senha foi gravada por estes scripts. Não há credencial para reverter.
6. O player volta sozinho para `/culto` quando `/culto-aac` deixa de anunciar AAC.

## Causa comprovada e hipótese

Comprovado no runtime de 8 nov 2026, sem alterar o processo:

- O master de `/culto` anuncia só `avc1.42c00c,opus`. Não há variante AAC.
- ffprobe dos fragmentos: H.264 Baseline 1280x720 e Opus 48000 Hz mono.
- O master anuncia `RESOLUTION=320x180`.
- `EXT-X-TARGETDURATION` 544 com segmentos de 2 a 4 s.
- A playlist ficou em sequência 269 e `PROGRAM-DATE-TIME` 18:48:05.741−03:00, sem `ENDLIST`.
- O remux AAC isolado decodificou no ffprobe. Não foi reproduzido no Safari nem no Chrome do iPhone.

Comprovado no código deste repositório e na documentação do MediaMTX / gohlslib:

- O WHIP pede H.264 e manda o áudio do WebRTC, que é Opus. Não há AAC nesse envio.
- O player só troca para `/culto-aac` quando o master contém `mp4a.40` e `avc1`. O aviso de Opus continua no texto do player.
- O Chrome no iPhone também cai nesse player nativo: o user agent contém `iPhone`. A falha é do sinal HLS, não de um navegador só.
- O gohlslib grava `TARGETDURATION` como o maior segmento já visto e não reduz esse valor. Um segmento longo deixa a playlist ruim para o iPhone até nascer outro muxer.
- A resolução do master sai do SPS guardado no muxer. O init fMP4 é gerado uma vez.

Hipótese, ainda sem o yml e sem o init original:

- O `320x180` e o nível `avc1.42c00c` (nível 1.2) podem ser o primeiro SPS congelado, enquanto os fragmentos seguintes já estavam em 1280x720. O relay novo escreve outro SPS, do quadro decodificado.
- O 544 s pode ter sido um intervalo longo sem IDR ou um salto de timestamp. Os segmentos atuais de 2–4 s combinam com o valor que não desce. O relay força keyframe a cada 2 s num path novo, com muxer novo.

O que este repositório executou: os flags do `iniciar-relay-aac.ps1` produziram, via ffmpeg/ffprobe, H.264 Constrained Baseline nível 3.1 em 1280x720 e AAC-LC 48000 Hz estéreo, sem Opus. Isso não é teste de Safari nem de Chrome no iPhone.
