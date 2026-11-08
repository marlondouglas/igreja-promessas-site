"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const hls = require("./hls-manifest.js");
const whip = require("../../culto/whip-video.js");

const dir = __dirname;
const relay = fs.readFileSync(path.join(dir, "iniciar-relay-aac.ps1"), "utf8");
const verifier = fs.readFileSync(path.join(dir, "verificar-hls.ps1"), "utf8");
const player = fs.readFileSync(path.join(dir, "../../culto/assistir.js"), "utf8");

const OPUS = "O sinal HLS anuncia áudio Opus. O iPhone pode exigir AAC; é preciso adequar o áudio no servidor de transmissão.";

function encodeArgs(source) {
  const block = source.split("# ENCODE-BEGIN")[1].split("# ENCODE-END")[0];
  return [...block.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

test("o player público continua preferindo AAC e conserva o aviso de Opus", () => {
  assert.match(player, /mp4a\.40/);
  assert.match(player, /avc1\./);
  assert.match(player, /\/culto-aac/);
  assert.ok(player.includes(OPUS));
  const crios = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1";
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
  const usesNative = (ua) => /iPad|iPhone|iPod/i.test(ua)
    || (/Safari/.test(ua) && !/Chrome|CriOS|Edg|FxiOS/.test(ua));
  assert.equal(usesNative(crios), true);
  assert.equal(usesNative(safari), true);
  assert.equal(hls.needsAppleHlsPipeline(crios, "", 0), true);
  assert.equal(hls.needsAppleHlsPipeline(safari, "", 0), true);
  assert.equal(hls.needsAppleHlsPipeline(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Win32",
    0
  ), false);
});

test("a playlist diagnosticada é recusada no pipeline da Apple e o aviso de Opus permanece", () => {
  const now = Date.parse("2026-11-08T18:50:02.000-03:00");
  const decision = hls.choose([{
    role: "original",
    href: "http://127.0.0.1:8888/culto/index.m3u8",
    masterText: [
      "#EXTM3U",
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS="avc1.42c00c,opus",RESOLUTION=320x180',
      "video_stream.m3u8"
    ].join("\n"),
    mediaText: [
      "#EXTM3U",
      "#EXT-X-TARGETDURATION:544",
      "#EXT-X-MEDIA-SEQUENCE:269",
      "#EXT-X-MAP:URI=\"init.mp4\"",
      "#EXTINF:2.0,",
      "seg269.mp4",
      "#EXT-X-PROGRAM-DATE-TIME:2026-11-08T18:48:05.741-03:00",
      "#EXTINF:4.0,",
      "seg270.mp4"
    ].join("\n")
  }], { apple: true, now });
  assert.equal(decision.play, false);
  assert.equal(decision.kind, "incompatible");
  assert.equal(decision.warning, OPUS);
  assert.ok(decision.message.startsWith(OPUS));
  assert.match(decision.message, /Safari e Chrome/);
  for (const reason of ["opus", "targetduration", "resolucao-baixa", "avc-level-baixo", "pdt-atrasado"]) {
    assert.ok(decision.reasons.includes(reason), reason);
  }
});

test("AAC saudável é escolhido mesmo quando /culto continua em Opus", () => {
  const now = Date.parse("2026-11-08T21:00:10.000Z");
  const decision = hls.choose([
    {
      role: "aac",
      href: "http://127.0.0.1:8888/culto-aac/index.m3u8",
      masterText: [
        "#EXTM3U",
        '#EXT-X-STREAM-INF:BANDWIDTH=2000000,CODECS="avc1.42001f,mp4a.40.2",RESOLUTION=1280x720',
        "media.m3u8"
      ].join("\n"),
      mediaText: [
        "#EXTM3U",
        "#EXT-X-TARGETDURATION:4",
        "#EXT-X-MEDIA-SEQUENCE:10",
        "#EXTINF:2.0,",
        "#EXT-X-PROGRAM-DATE-TIME:2026-11-08T21:00:08.000Z",
        "seg10.mp4"
      ].join("\n")
    },
    {
      role: "original",
      href: "http://127.0.0.1:8888/culto/index.m3u8",
      masterText: '#EXTM3U\n#EXT-X-STREAM-INF:CODECS="avc1.42c00c,opus",RESOLUTION=320x180\nvideo.m3u8\n',
      mediaText: "#EXTM3U\n#EXT-X-TARGETDURATION:544\n#EXT-X-MEDIA-SEQUENCE:269\n#EXTINF:2.0,\nseg.mp4\n"
    }
  ], { apple: true, now });
  assert.equal(decision.play, true);
  assert.equal(decision.role, "aac");
  assert.equal(decision.warning, "");
  assert.equal(decision.message.includes(OPUS), false);
});

test("TARGETDURATION 544 bloqueia o iPhone mesmo com AAC", () => {
  const decision = hls.assess(
    '#EXTM3U\n#EXT-X-STREAM-INF:CODECS="avc1.42001f,mp4a.40.2",RESOLUTION=1280x720\nmedia.m3u8\n',
    "#EXTM3U\n#EXT-X-TARGETDURATION:544\n#EXT-X-MEDIA-SEQUENCE:3\n#EXTINF:2.0,\nseg.mp4\n",
    { apple: true, now: Date.parse("2026-11-08T21:00:10.000Z") }
  );
  assert.equal(decision.play, false);
  assert.equal(decision.kind, "poisoned");
  assert.match(decision.notice, /544s/);
});

test("sequência parada não é tratada como ao vivo", () => {
  const decision = hls.assess(
    '#EXTM3U\n#EXT-X-STREAM-INF:CODECS="avc1.42001f,mp4a.40.2",RESOLUTION=1280x720\nmedia.m3u8\n',
    "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:269\n#EXT-X-PROGRAM-DATE-TIME:2026-11-08T21:00:08.000Z\n#EXTINF:2.0,\nseg.mp4\n",
    { apple: true, now: Date.parse("2026-11-08T21:00:10.000Z"), sequenceUnchangedMs: 20000 }
  );
  assert.equal(decision.play, false);
  assert.equal(decision.kind, "stalled");
});

test("o relay não reinicia o MediaMTX e só publica em culto-aac", () => {
  assert.match(relay, /libx264/);
  assert.match(relay, /baseline/);
  assert.match(relay, /aac_low/);
  assert.match(relay, /48000/);
  assert.match(relay, /force_key_frames/);
  assert.match(relay, /culto-aac/);
  assert.match(relay, /\$MaxTargetDuration|ultrafast/);
  assert.doesNotMatch(relay, /Stop-Process[^\n]*mediamtx/i);
  assert.doesNotMatch(relay, /Restart-Service|mediamtx\.exe/i);
  assert.doesNotMatch(relay, /senha\s*=|password\s*=/i);
  assert.doesNotMatch(relay, /rw_timeout/);
  assert.match(relay, /"-timeout", "30000000"/);
  assert.match(relay, /Nova leitura em/);
  assert.doesNotMatch(relay, /Start-Sleep -Seconds 3/);
  assert.match(verifier, /UTF8\.GetString/);
  assert.match(verifier, /EXT-X-MEDIA/);
  assert.match(verifier, /EXT-X-MAP/);
  assert.match(verifier, /\$MaxTargetDuration = 15/);
  assert.ok(verifier.includes(OPUS));
  assert.match(verifier, /RESULTADO: APTO/);
  assert.doesNotMatch(verifier, /Stop-Process|mediamtx\.exe/i);
  const args = encodeArgs(relay);
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("aac_low"));
  assert.ok(args.includes("2"));
  assert.equal(args.includes("-c copy") || args.includes("copy"), false);
});

test("os flags do relay geram H.264 1280x720 e AAC-LC estéreo", () => {
  const args = encodeArgs(relay);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "promessas-aac-"));
  const output = path.join(folder, "amostra.mp4");
  const run = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=24",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "1",
    "-map", "0:v:0", "-map", "1:a:0",
    ...args,
    output
  ], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const probe = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_name,profile,level,width,height,channels,sample_rate",
    "-of", "json",
    output
  ], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const streams = JSON.parse(probe.stdout).streams;
  const video = streams.find((stream) => stream.codec_name === "h264");
  const audio = streams.find((stream) => stream.codec_name === "aac");
  assert.ok(video);
  assert.equal(video.width, 1280);
  assert.equal(video.height, 720);
  assert.ok(video.level >= 31);
  assert.match(video.profile, /Baseline/);
  assert.ok(audio);
  assert.equal(audio.profile, "LC");
  assert.equal(String(audio.sample_rate), "48000");
  assert.equal(audio.channels, 2);
  assert.equal(streams.some((stream) => stream.codec_name === "opus"), false);
});

test("o limite de vídeo fica ativo e só é aplicado depois da resposta WHIP", () => {
  const limited = whip.applyVideoSenderLimits({
    codecs: [{ mimeType: "video/H264" }],
    headerExtensions: [{}],
    encodings: [{ active: false, scaleResolutionDownBy: 1 }]
  });
  assert.equal(limited.encodings[0].active, true);
  assert.equal(limited.encodings[0].scaleResolutionDownBy, 1);
  assert.equal(limited.encodings[0].maxBitrate, 2400000);
  assert.equal(limited.codecs, undefined);
  assert.equal(limited.headerExtensions, undefined);
  assert.equal(limited.degradationPreference, "maintain-resolution");
  const player = fs.readFileSync(path.join(dir, "../../culto/assistir.js"), "utf8");
  assert.match(player, /iosBlocksOpus/);
  assert.match(player, /não troca para o Opus/);
  const publisher = fs.readFileSync(path.join(dir, "../../culto/transmitir.js"), "utf8");
  const scene = publisher.slice(publisher.indexOf("promessas-scene"), publisher.indexOf("beforeunload"));
  assert.match(scene, /phase==="intro"\)start\(\)/);
  assert.match(scene, /phase==="waiting"\)stop\(\)/);
  assert.equal(scene.includes('phase==="live")stop'), false);
  const audio = whip.liveAudioTracks([
    { kind: "audio", readyState: "live" },
    { kind: "audio", readyState: "ended" },
    { kind: "video", readyState: "live" }
  ]);
  assert.equal(audio.length, 1);
  const src = fs.readFileSync(path.join(dir, "../../culto/transmitir.js"), "utf8");
  const between = src.slice(src.indexOf("pc.addTrack(videoTrack)"), src.indexOf("pc.createOffer"));
  assert.equal(between.includes("setParameters"), false);
  assert.equal(between.includes("new MediaStream"), false);
  assert.ok(src.includes("for(const t of audioTracks) pc.addTrack(t)"));
  const answer = src.indexOf("setRemoteDescription");
  assert.ok(src.indexOf("await limitVideo(pc)", answer) > answer);
});

test("fMP4 com EXT-X-MAP e áudio separado continua AAC utilizável", () => {
  const master = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="audio",DEFAULT=YES,URI="audio_stream.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=2000000,CODECS="avc1.42001f,mp4a.40.2",RESOLUTION=1280x720,AUDIO="audio"',
    "video_stream.m3u8"
  ].join("\n");
  const plan = hls.probePlan(master);
  assert.equal(plan.videoUri, "video_stream.m3u8");
  assert.equal(plan.audioUri, "audio_stream.m3u8");
  const media = hls.parseMedia("#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:1\n#EXT-X-MAP:URI=\"video_init.mp4\"\n#EXTINF:2.0,\nvideo_1.mp4\n");
  assert.equal(media.mapUri, "video_init.mp4");
  assert.equal(media.segments[0].uri, "video_1.mp4");
  const decision = hls.choose([{
    role: "aac",
    href: "http://127.0.0.1:8888/culto-aac/index.m3u8",
    masterText: master,
    mediaText: "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:1\n#EXT-X-MAP:URI=\"video_init.mp4\"\n#EXT-X-PROGRAM-DATE-TIME:2026-11-08T21:00:08.000Z\n#EXTINF:2.0,\nvideo_1.mp4\n"
  }], { apple: true, now: Date.parse("2026-11-08T21:00:10.000Z") });
  assert.equal(decision.play, true);
  assert.equal(decision.warning, "");
});
