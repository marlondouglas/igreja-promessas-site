# Igreja Promessas — relay local H.264 + AAC-LC para o iPhone.
# Safari e Chrome no iPhone usam o mesmo reprodutor HLS. Opus não passa.
# Este script não reinicia o MediaMTX, não altera senha e não publica o site.
# Destino fixo: path culto-aac. O envio WHIP de /culto permanece como está.
param(
  [switch]$PadraoTeste,
  [switch]$AguardarCulto,
  [switch]$Parar,
  [string]$FfmpegPath = "",
  [string]$Origem = "",
  [string]$Destino = ""
)

$ErrorActionPreference = "Stop"

if (-not $Origem) {
  if ($env:PROMESSAS_RTSP_ORIGEM) { $Origem = $env:PROMESSAS_RTSP_ORIGEM }
  else { $Origem = "rtsp://127.0.0.1:8554/culto" }
}
if (-not $Destino) {
  if ($env:PROMESSAS_RTSP_DESTINO) { $Destino = $env:PROMESSAS_RTSP_DESTINO }
  else { $Destino = "rtsp://127.0.0.1:8554/culto-aac" }
}
$Origem = $Origem.TrimEnd("/")
$Destino = $Destino.TrimEnd("/")

function Hide-UserInfo([string]$url) {
  return ($url -replace "://[^/@\s]+@", "://")
}

function Find-Ffmpeg {
  if ($FfmpegPath -and (Test-Path -LiteralPath $FfmpegPath)) { return $FfmpegPath }
  $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  foreach ($candidate in @(
    "C:\ffmpeg\bin\ffmpeg.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\ffmpeg.exe"
  )) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

# ENCODE-BEGIN
$Encode = @(
  "-vf"
  "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p"
  "-c:v"
  "libx264"
  "-profile:v"
  "baseline"
  "-level:v"
  "3.1"
  "-pix_fmt"
  "yuv420p"
  "-preset"
  "ultrafast"
  "-tune"
  "zerolatency"
  "-b:v"
  "1800k"
  "-maxrate"
  "2400k"
  "-bufsize"
  "3600k"
  "-g"
  "48"
  "-keyint_min"
  "48"
  "-sc_threshold"
  "0"
  "-bf"
  "0"
  "-force_key_frames"
  "expr:gte(t,n_forced*2)"
  "-c:a"
  "aac"
  "-profile:a"
  "aac_low"
  "-ar"
  "48000"
  "-ac"
  "2"
  "-b:a"
  "128k"
  "-af"
  "aresample=async=1:first_pts=0"
)
# ENCODE-END

if ($Parar) {
  $stopped = 0
  Get-CimInstance Win32_Process -Filter "Name = 'ffmpeg.exe'" | ForEach-Object {
    if ($_.CommandLine -and $_.CommandLine -like "*culto-aac*") {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      $stopped++
    }
  }
  Write-Host "Relay culto-aac: processos ffmpeg encerrados: $stopped. O MediaMTX não foi reiniciado."
  exit 0
}

if ($PadraoTeste -and $AguardarCulto) {
  Write-Host "Use só um modo: -PadraoTeste ou -AguardarCulto."
  exit 2
}
if (-not $PadraoTeste -and -not $AguardarCulto) {
  Write-Host "Informe -PadraoTeste (barras, sem o culto) ou -AguardarCulto (lê /culto e republica)."
  Write-Host "-Parar encerra somente o ffmpeg deste relay."
  exit 2
}
if ($Destino -notmatch "/culto-aac$") {
  Write-Host "Destino recusado. O relay só pode publicar em /culto-aac."
  exit 2
}
if ($AguardarCulto -and $Origem -notmatch "/culto$") {
  Write-Host "Origem recusada. -AguardarCulto só lê o path /culto."
  exit 2
}

$ffmpeg = Find-Ffmpeg
if (-not $ffmpeg) {
  Write-Host "ffmpeg não encontrado. Instale um build Windows GPL com libx264 e o encoder AAC nativo (ffmpeg 6 ou mais novo)."
  Write-Host "Build de referência: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
  Write-Host "Descompacte e aponte -FfmpegPath C:\ffmpeg\bin\ffmpeg.exe"
  exit 2
}
$encoders = & $ffmpeg -hide_banner -encoders 2>&1 | Out-String
if ($encoders -notmatch "libx264") {
  Write-Host "Este ffmpeg não tem libx264. Use o build GPL, não o build sem x264."
  exit 2
}
if ($encoders -notmatch "(?m)^\s*\S+\s+aac\s") {
  Write-Host "Este ffmpeg não tem o encoder AAC nativo."
  exit 2
}

if ($PadraoTeste) {
  Write-Host "Padrão de teste 1280x720 + AAC para $(Hide-UserInfo $Destino). O path /culto não é lido."
  $inputArgs = @(
    "-hide_banner", "-loglevel", "warning", "-nostdin", "-re",
    "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=24",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-map", "0:v:0", "-map", "1:a:0"
  )
} else {
  Write-Host "Lendo $(Hide-UserInfo $Origem) e publicando AAC em $(Hide-UserInfo $Destino)."
  $inputArgs = @(
    "-hide_banner", "-loglevel", "warning", "-nostdin",
    "-rw_timeout", "15000000", "-rtsp_transport", "tcp",
    "-i", $Origem,
    "-map", "0:v:0", "-map", "0:a:0"
  )
}
$outputArgs = @("-f", "rtsp", "-rtsp_transport", "tcp", $Destino)
Write-Host "Ctrl+C interrompe. Se der 401, defina PROMESSAS_RTSP_DESTINO nesta janela, sem gravar a senha no arquivo."
Write-Host "Se o path for recusado, aplique paths-culto-aac.yml e reinicie o MediaMTX manualmente. Este script não reinicia o servidor."

while ($true) {
  & $ffmpeg @inputArgs @Encode @outputArgs
  $code = $LASTEXITCODE
  Write-Host "ffmpeg saiu com código $code. Nova tentativa em 3 segundos. Ctrl+C interrompe."
  Start-Sleep -Seconds 3
}
