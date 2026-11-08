# Confere a saída /culto-aac antes de abrir o iPhone.
# Não altera MediaMTX, não publica e não declara o telefone como testado.
param(
  [string]$Url = "http://127.0.0.1:8888/culto-aac/index.m3u8",
  [string]$ResolucaoEsperada = "1280x720",
  [string]$FfprobePath = "",
  [switch]$SemAvanco
)

$ErrorActionPreference = "Stop"
$MaxTargetDuration = 15
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure([string]$message) {
  $script:failures.Add($message)
  Write-Host "FALHA: $message"
}

function Add-Ok([string]$message) {
  Write-Host "OK: $message"
}

function Get-Text([string]$uri) {
  $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 10 -Headers @{ "Cache-Control" = "no-cache" }
  if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode) em $uri" }
  return [string]$response.Content
}

function Get-Attr([string]$line, [string]$name) {
  $pattern = $name + '="([^"]*)"'
  if ($line -match $pattern) { return $Matches[1] }
  $pattern = $name + "=([^,\s]+)"
  if ($line -match $pattern) { return $Matches[1] }
  return ""
}

function Find-Ffprobe {
  if ($FfprobePath -and (Test-Path -LiteralPath $FfprobePath)) { return $FfprobePath }
  $cmd = Get-Command ffprobe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  if (Test-Path -LiteralPath "C:\ffmpeg\bin\ffprobe.exe") { return "C:\ffmpeg\bin\ffprobe.exe" }
  return $null
}

try {
  $master = Get-Text $Url
} catch {
  Add-Failure "Não li o master em $Url. O relay precisa estar publicando e o MediaMTX precisa estar no ar. $($_.Exception.Message)"
  Write-Host "RESULTADO: RECUSADO"
  exit 1
}

$lines = @($master -split "\r?\n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$variantLine = $lines | Where-Object { $_ -like "#EXT-X-STREAM-INF:*" } | Select-Object -First 1
$variantUri = ""
if ($variantLine) {
  $index = [array]::IndexOf($lines, $variantLine)
  for ($i = $index + 1; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -notlike "#*") { $variantUri = $lines[$i]; break }
  }
}
$codecs = ""
$resolution = ""
if ($variantLine) {
  $codecs = (Get-Attr $variantLine "CODECS").ToLower()
  $resolution = Get-Attr $variantLine "RESOLUTION"
} elseif ($master -match "#EXTINF:") {
  $variantUri = ""
}

if ($codecs -match "(^|[,])\s*opus\s*($|[,])") {
  Add-Failure "O sinal HLS anuncia áudio Opus. O iPhone pode exigir AAC; é preciso adequar o áudio no servidor de transmissão."
} else {
  Add-Ok "Master sem Opus."
}
if ($codecs -notmatch "avc1\.") { Add-Failure "Master sem H.264 (avc1)." } else { Add-Ok "Master anuncia H.264." }
if ($codecs -notmatch "mp4a\.40\.2") { Add-Failure "Master sem AAC-LC (mp4a.40.2). CODECS=$codecs" } else { Add-Ok "Master anuncia AAC-LC." }
if ($resolution -ne $ResolucaoEsperada) {
  Add-Failure "Resolução anunciada '$resolution'. O teste espera $ResolucaoEsperada. 320x180 com fragmento 1280x720 é o defeito já visto em /culto."
} else {
  Add-Ok "Resolução anunciada $resolution."
}

$mediaUrl = $Url
if ($variantUri) { $mediaUrl = ([Uri]::new([Uri]$Url, $variantUri)).AbsoluteUri }
try {
  $media = Get-Text $mediaUrl
} catch {
  Add-Failure "Não li a playlist de segmentos. $($_.Exception.Message)"
  Write-Host "RESULTADO: RECUSADO"
  exit 1
}
$mediaLines = @($media -split "\r?\n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$target = $null
$sequence = $null
$endList = $false
$durations = @()
$pending = $null
$segmentUri = ""
foreach ($line in $mediaLines) {
  if ($line -like "#EXT-X-TARGETDURATION:*") { $target = [int]($line.Split(":")[1]) }
  elseif ($line -like "#EXT-X-MEDIA-SEQUENCE:*") { $sequence = [int]($line.Split(":")[1]) }
  elseif ($line -like "#EXT-X-ENDLIST*") { $endList = $true }
  elseif ($line -like "#EXTINF:*") { $pending = [double]($line.Substring(8).Split(",")[0]) }
  elseif ($line -notlike "#*" -and $null -ne $pending) {
    $durations += $pending
    if (-not $segmentUri) { $segmentUri = $line }
    $pending = $null
  }
}
if ($null -eq $target -or $target -gt $MaxTargetDuration) {
  Add-Failure "EXT-X-TARGETDURATION=$target. O iPhone recebe até 15s neste verificador. 544s faz o aparelho esperar demais."
} else {
  Add-Ok "TARGETDURATION $target dentro de $MaxTargetDuration s."
}
if ($endList) { Add-Failure "A playlist tem EXT-X-ENDLIST. Isso é arquivo, não transmissão ao vivo." } else { Add-Ok "Playlist sem ENDLIST." }
if ($durations.Count -lt 1) { Add-Failure "Playlist sem segmentos." } else { Add-Ok "$($durations.Count) segmentos, o maior com $([math]::Round(($durations | Measure-Object -Maximum).Maximum, 2))s." }

if (-not $SemAvanco -and $null -ne $sequence) {
  Start-Sleep -Seconds 8
  try {
    $again = Get-Text $mediaUrl
    $next = $null
    foreach ($line in ($again -split "\r?\n")) {
      $trim = $line.Trim()
      if ($trim -like "#EXT-X-MEDIA-SEQUENCE:*") { $next = [int]($trim.Split(":")[1]) }
    }
    if ($null -eq $next -or $next -le $sequence) {
      Add-Failure "A sequência não avançou ($sequence para $next) em 8s. Playlist no ar não significa sinal ao vivo."
    } else {
      Add-Ok "Sequência avançou de $sequence para $next."
    }
  } catch {
    Add-Failure "A segunda leitura da playlist falhou. $($_.Exception.Message)"
  }
}

$ffprobe = Find-Ffprobe
if (-not $ffprobe) {
  Add-Failure "ffprobe não encontrado. Ele vem na mesma pasta do ffmpeg e é obrigatório para ver o codec real do segmento."
} elseif (-not $segmentUri) {
  Add-Failure "Não há segmento para o ffprobe."
} else {
  $segmentUrl = ([Uri]::new([Uri]$mediaUrl, $segmentUri)).AbsoluteUri
  $temp = Join-Path $env:TEMP ("promessas-aac-" + [guid]::NewGuid().ToString("n") + ".mp4")
  try {
    Invoke-WebRequest -Uri $segmentUrl -UseBasicParsing -TimeoutSec 10 -OutFile $temp
    $json = & $ffprobe -v error -show_entries "stream=codec_name,profile,width,height,channels,sample_rate" -of json $temp
    $probe = $json | Out-String | ConvertFrom-Json
    $video = $probe.streams | Where-Object { $_.codec_name -eq "h264" } | Select-Object -First 1
    $audio = $probe.streams | Where-Object { $_.codec_name -eq "aac" } | Select-Object -First 1
    $opus = $probe.streams | Where-Object { $_.codec_name -eq "opus" } | Select-Object -First 1
    if ($opus) { Add-Failure "O segmento ainda contém Opus." }
    if (-not $video) { Add-Failure "ffprobe não encontrou H.264 no segmento." }
    else {
      $seen = "$($video.width)x$($video.height)"
      if ($seen -ne $ResolucaoEsperada) { Add-Failure "ffprobe leu $seen e a playlist anuncia $ResolucaoEsperada." }
      else { Add-Ok "ffprobe confirma H.264 $seen, perfil $($video.profile)." }
    }
    if (-not $audio) { Add-Failure "ffprobe não encontrou AAC no segmento." }
    elseif ([string]$audio.sample_rate -ne "48000" -or [int]$audio.channels -ne 2 -or [string]$audio.profile -ne "LC") {
      Add-Failure "Áudio ffprobe: perfil=$($audio.profile) canais=$($audio.channels) taxa=$($audio.sample_rate). O iPhone precisa de AAC-LC, 48000 Hz, estéreo."
    } else {
      Add-Ok "ffprobe confirma AAC-LC 48000 Hz estéreo."
    }
  } catch {
    Add-Failure "ffprobe do segmento falhou. $($_.Exception.Message)"
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
  }
}

if ($failures.Count) {
  Write-Host "RESULTADO: RECUSADO ($($failures.Count))"
  exit 1
}
Write-Host "RESULTADO: APTO para tentativa no iPhone. Abra a mesma URL no Safari e no Chrome. Este verificador não substitui o telefone."
exit 0
