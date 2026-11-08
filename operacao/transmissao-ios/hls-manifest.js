"use strict";
/* Verificador de playlist HLS da Igreja Promessas.
 * Não entra no player público: o site já prefere /culto-aac quando o master anuncia AAC.
 * iPhone (Safari, Chrome e os demais navegadores) e o Safari de mesa
 * reproduzem HLS pelo stack de vídeo da Apple. Esse stack aceita H.264 + AAC
 * e recusa Opus. A troca de navegador no iPhone não muda o pipeline.
 * O aviso de Opus permanece quando o sinal escolhido ainda anuncia Opus.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromessasHlsManifest = api;
})(typeof globalThis === "undefined" ? undefined : globalThis, function () {
  const OPUS_WARNING = "O sinal HLS anuncia áudio Opus. O iPhone pode exigir AAC; é preciso adequar o áudio no servidor de transmissão.";
  const IOS_PIPELINE_NOTE = "No iPhone, Safari e Chrome usam o reprodutor de vídeo do sistema. Trocar de navegador não altera o áudio Opus.";
  const MAX_TARGET_DURATION = 15;
  const STALE_PROGRAM_DATE_MS = 45000;
  const STALE_SEQUENCE_MS = 15000;
  const MIN_LONG_SIDE = 640;

  function isIosDevice(ua, platform, maxTouchPoints) {
    const text = String(ua || "");
    if (/iPad|iPhone|iPod/i.test(text)) return true;
    return platform === "MacIntel" && Number(maxTouchPoints) > 1;
  }

  function needsAppleHlsPipeline(ua, platform, maxTouchPoints) {
    if (isIosDevice(ua, platform, maxTouchPoints)) return true;
    const text = String(ua || "");
    const safari = /Safari\//.test(text);
    const otherEngine = /Chrome\/|CriOS|Edg\/|EdgiOS|FxiOS|Firefox\/|OPR\/|OPiOS/.test(text);
    return safari && !otherEngine;
  }

  function stripBom(text) {
    return String(text || "").replace(/^\uFEFF/, "");
  }

  function linesOf(text) {
    return stripBom(text).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function parseAttributes(line) {
    const attrs = {};
    const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
    let match;
    while ((match = re.exec(line))) {
      attrs[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, "").trim();
    }
    return attrs;
  }

  function parseMaster(text) {
    const lines = linesOf(text);
    if (!lines.length || lines[0].indexOf("#EXTM3U") !== 0) return null;
    const variants = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
      const attrs = parseAttributes(lines[i]);
      let uri = "";
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].charAt(0) !== "#") { uri = lines[j]; break; }
      }
      variants.push({
        codecs: String(attrs.CODECS || "").toLowerCase(),
        resolution: attrs.RESOLUTION || "",
        bandwidth: Number(attrs.BANDWIDTH || 0),
        uri: uri
      });
    }
    return {
      variants: variants,
      isMedia: lines.some(function (line) { return line.indexOf("#EXTINF:") === 0; })
    };
  }

  function parseMedia(text) {
    const lines = linesOf(text);
    if (!lines.length || lines[0].indexOf("#EXTM3U") !== 0) return null;
    const media = {
      targetDuration: null,
      mediaSequence: null,
      endList: false,
      map: false,
      segments: []
    };
    let pendingDuration = null;
    let pendingDate = null;
    lines.forEach(function (line) {
      if (line.indexOf("#EXT-X-TARGETDURATION:") === 0) {
        media.targetDuration = Number(line.slice("#EXT-X-TARGETDURATION:".length).trim());
      } else if (line.indexOf("#EXT-X-MEDIA-SEQUENCE:") === 0) {
        media.mediaSequence = Number(line.slice("#EXT-X-MEDIA-SEQUENCE:".length).trim());
      } else if (line.indexOf("#EXT-X-ENDLIST") === 0) {
        media.endList = true;
      } else if (line.indexOf("#EXT-X-MAP:") === 0) {
        media.map = true;
      } else if (line.indexOf("#EXT-X-PROGRAM-DATE-TIME:") === 0) {
        pendingDate = line.slice("#EXT-X-PROGRAM-DATE-TIME:".length).trim();
      } else if (line.indexOf("#EXTINF:") === 0) {
        pendingDuration = Number(line.slice("#EXTINF:".length).split(",")[0]);
      } else if (line.charAt(0) !== "#" && pendingDuration != null && Number.isFinite(pendingDuration)) {
        media.segments.push({ duration: pendingDuration, programDateTime: pendingDate, uri: line });
        pendingDuration = null;
        pendingDate = null;
      }
    });
    return media;
  }

  function hasOpus(codecs) {
    return /(^|[,])\s*opus\s*($|[,])/.test(codecs);
  }

  function hasAac(codecs) {
    return /mp4a\.40\.(?:2|5|29)\b/.test(codecs) || /mp4a\.40\b(?!\.)/.test(codecs);
  }

  function hasAvc(codecs) {
    return codecs.indexOf("avc1.") !== -1;
  }

  function hasBadVideo(codecs) {
    return /(^|[,])\s*(?:vp09|vp9|vp8|vp08|av01)\b/.test(codecs);
  }

  function avcLevelByte(codecs) {
    const match = /avc1\.([0-9a-f]{6})/.exec(codecs);
    if (!match) return null;
    return parseInt(match[1].slice(4, 6), 16);
  }

  function parseResolution(value) {
    const match = /^(\d+)x(\d+)$/.exec(value || "");
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  function preferredVariant(master) {
    if (!master || !master.variants.length) return null;
    return master.variants.slice().sort(function (a, b) {
      return scoreVariant(b) - scoreVariant(a);
    })[0];
  }

  function scoreVariant(variant) {
    const codecs = variant.codecs || "";
    let score = 0;
    if (hasAvc(codecs) && hasAac(codecs) && !hasOpus(codecs)) score += 10;
    if (hasOpus(codecs)) score -= 5;
    if (hasBadVideo(codecs)) score -= 5;
    return score;
  }

  function maxDuration(segments) {
    return segments.reduce(function (max, segment) {
      return Math.max(max, segment.duration);
    }, 0);
  }

  function lastProgramDate(segments) {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].programDateTime) return segments[i].programDateTime;
    }
    return "";
  }

  function assess(masterText, mediaText, context) {
    const now = context && context.now ? context.now : Date.now();
    const apple = !!(context && context.apple);
    const sequenceUnchangedMs = context && context.sequenceUnchangedMs ? context.sequenceUnchangedMs : 0;
    const master = parseMaster(masterText);
    const reasons = [];
    if (!master) {
      return result({ kind: "invalid", reasons: ["playlist-invalida"], apple: apple });
    }
    const variant = preferredVariant(master);
    const codecs = variant ? variant.codecs : "";
    const resolution = variant ? variant.resolution : "";
    const media = parseMedia(master.isMedia ? masterText : (mediaText || ""));
    if (hasOpus(codecs)) reasons.push("opus");
    if (hasBadVideo(codecs)) reasons.push("video-incompativel");
    if (!hasAvc(codecs)) reasons.push("sem-avc");
    if (!hasAac(codecs)) reasons.push("sem-aac");
    const level = avcLevelByte(codecs);
    if (level != null && level > 0 && level < 30) reasons.push("avc-level-baixo");
    const size = parseResolution(resolution);
    if (size && Math.max(size.width, size.height) < MIN_LONG_SIDE) reasons.push("resolucao-baixa");
    if (!media) reasons.push("midia-ilegivel");
    let targetDuration = null;
    let mediaSequence = null;
    let lastPdt = "";
    if (media) {
      targetDuration = media.targetDuration;
      mediaSequence = media.mediaSequence;
      lastPdt = lastProgramDate(media.segments);
      if (media.endList) reasons.push("endlist");
      if (!media.segments.length) reasons.push("sem-segmentos");
      if (targetDuration == null || !Number.isFinite(targetDuration)) reasons.push("targetduration-ausente");
      else if (targetDuration > MAX_TARGET_DURATION) reasons.push("targetduration");
      else if (media.segments.some(function (segment) { return Math.round(segment.duration) > targetDuration; })) reasons.push("targetduration");
      if (lastPdt) {
        const stamp = Date.parse(lastPdt);
        if (Number.isFinite(stamp) && now - stamp > STALE_PROGRAM_DATE_MS) reasons.push("pdt-atrasado");
      }
      if (sequenceUnchangedMs >= STALE_SEQUENCE_MS) reasons.push("sequencia-parada");
    }
    const stalled = reasons.indexOf("pdt-atrasado") !== -1 || reasons.indexOf("sequencia-parada") !== -1;
    const ended = reasons.indexOf("endlist") !== -1;
    const starting = reasons.indexOf("sem-segmentos") !== -1 && !ended;
    const poisoned = reasons.indexOf("targetduration") !== -1 || reasons.indexOf("targetduration-ausente") !== -1;
    const opus = reasons.indexOf("opus") !== -1;
    const badVideo = reasons.indexOf("video-incompativel") !== -1;
    const appleReady = hasAvc(codecs) && hasAac(codecs) && !opus && !badVideo && !poisoned && !stalled && !ended && !starting && reasons.indexOf("midia-ilegivel") === -1;
    const desktopReady = hasAvc(codecs) && (hasAac(codecs) || opus) && !badVideo && !stalled && !ended && !starting && reasons.indexOf("midia-ilegivel") === -1;
    const unverifiedApple = !media && hasAvc(codecs) && hasAac(codecs) && !opus && !badVideo;
    const unverifiedDesktop = !media && hasAvc(codecs) && (hasAac(codecs) || opus) && !badVideo;
    let play = apple ? appleReady || unverifiedApple : desktopReady || unverifiedDesktop;
    let kind = "invalid";
    if (play && !media) kind = "unverified";
    else if (play) kind = "ready";
    else if (opus || badVideo || reasons.indexOf("sem-avc") !== -1) kind = "incompatible";
    else if (ended) kind = "ended";
    else if (stalled) kind = "stalled";
    else if (poisoned) kind = "poisoned";
    else if (starting) kind = "starting";
    return result({
      play: play,
      kind: kind,
      reasons: reasons,
      codecs: codecs,
      resolution: resolution,
      targetDuration: targetDuration,
      mediaSequence: mediaSequence,
      lastProgramDateTime: lastPdt,
      maxSegment: media ? maxDuration(media.segments) : 0,
      apple: apple
    });
  }

  function sentenceFor(info) {
    const notes = [];
    const reasons = info.reasons;
    if (reasons.indexOf("targetduration") !== -1 || reasons.indexOf("targetduration-ausente") !== -1) {
      const shown = Number.isFinite(info.targetDuration) ? info.targetDuration + "s" : "ausente";
      const segment = info.maxSegment ? " para segmentos de até " + info.maxSegment.toFixed(1) + "s" : "";
      notes.push("A playlist anuncia EXT-X-TARGETDURATION " + shown + segment + ". O reprodutor do iPhone pode esperar tempo demais. É preciso gerar a saída HLS de novo, com segmentos curtos.");
    }
    if (reasons.indexOf("pdt-atrasado") !== -1) {
      notes.push("A playlist HLS parou de avançar. O último PROGRAM-DATE-TIME está em " + info.lastProgramDateTime + ". O sinal do estúdio não está ao vivo.");
    } else if (reasons.indexOf("sequencia-parada") !== -1) {
      notes.push("A playlist HLS parou na sequência " + info.mediaSequence + ". O sinal do estúdio não está ao vivo.");
    }
    if (reasons.indexOf("endlist") !== -1) notes.push("A transmissão foi encerrada no servidor.");
    if (reasons.indexOf("resolucao-baixa") !== -1) {
      notes.push("A playlist anuncia resolução " + info.resolution + ", menor que o quadro 1280x720 medido nos fragmentos do estúdio.");
    }
    if (reasons.indexOf("avc-level-baixo") !== -1) {
      notes.push("O codec de vídeo anunciado (" + info.codecs + ") está em nível baixo demais para 720p.");
    }
    if (reasons.indexOf("video-incompativel") !== -1) {
      notes.push("O sinal anuncia um codec de vídeo incompatível com o reprodutor do iPhone. O envio precisa ser H.264.");
    }
    if (reasons.indexOf("midia-ilegivel") !== -1) {
      notes.push("A playlist de segmentos não pôde ser lida. A decisão usou só o anúncio de codecs.");
    }
    return notes.join(" ");
  }

  function result(info) {
    const warning = info.reasons && info.reasons.indexOf("opus") !== -1 ? OPUS_WARNING : "";
    const notice = sentenceFor(info);
    const decision = {
      play: !!info.play,
      kind: info.kind || "invalid",
      warning: warning,
      notice: notice,
      reasons: info.reasons || [],
      codecs: info.codecs || "",
      resolution: info.resolution || "",
      targetDuration: info.targetDuration == null ? null : info.targetDuration,
      mediaSequence: info.mediaSequence == null ? null : info.mediaSequence,
      lastProgramDateTime: info.lastProgramDateTime || ""
    };
    decision.message = playerMessage(decision);
    return decision;
  }

  function playerMessage(decision) {
    const parts = [];
    if (decision.warning) {
      parts.push(decision.warning);
      parts.push(IOS_PIPELINE_NOTE);
    }
    if (decision.notice) parts.push(decision.notice);
    return parts.join(" ");
  }

  function choose(candidates, context) {
    const apple = !!(context && context.apple);
    const now = context && context.now ? context.now : Date.now();
    const assessed = (candidates || []).map(function (candidate) {
      return {
        role: candidate.role,
        href: candidate.href,
        assessment: assess(candidate.masterText, candidate.mediaText, {
          now: now,
          apple: apple,
          sequenceUnchangedMs: candidate.sequenceUnchangedMs || 0
        })
      };
    }).filter(function (candidate) { return candidate.assessment; });
    const readyAac = assessed.filter(function (candidate) { return candidate.role === "aac" && candidate.assessment.play; })[0];
    if (readyAac) return chosen(readyAac);
    const readyOriginal = assessed.filter(function (candidate) { return candidate.role === "original" && candidate.assessment.play; })[0];
    if (readyOriginal) return chosen(readyOriginal);
    const rank = { incompatible: 0, poisoned: 1, stalled: 2, ended: 3, starting: 4, unverified: 5, invalid: 6 };
    const failing = assessed.slice().sort(function (a, b) {
      return (rank[a.assessment.kind] == null ? 9 : rank[a.assessment.kind]) - (rank[b.assessment.kind] == null ? 9 : rank[b.assessment.kind]);
    });
    const top = failing[0] ? failing[0].assessment : result({ kind: "offline", reasons: ["sem-sinal"] });
    const warning = failing.map(function (candidate) { return candidate.assessment.warning; }).filter(Boolean)[0] || "";
    const notice = failing.map(function (candidate) { return candidate.assessment.notice; }).filter(Boolean).filter(function (noticeText, index, list) {
      return list.indexOf(noticeText) === index;
    }).join(" ");
    const reasons = [];
    failing.forEach(function (candidate) {
      candidate.assessment.reasons.forEach(function (reason) {
        if (reasons.indexOf(reason) === -1) reasons.push(reason);
      });
    });
    const decision = {
      play: false,
      role: null,
      href: null,
      kind: failing.length ? top.kind : "offline",
      warning: warning,
      notice: notice,
      reasons: reasons,
      codecs: top.codecs || "",
      resolution: top.resolution || "",
      targetDuration: top.targetDuration == null ? null : top.targetDuration,
      mediaSequence: top.mediaSequence == null ? null : top.mediaSequence,
      lastProgramDateTime: top.lastProgramDateTime || ""
    };
    decision.message = playerMessage(decision);
    return decision;
  }

  function chosen(candidate) {
    const decision = candidate.assessment;
    decision.role = candidate.role;
    decision.href = candidate.href;
    decision.message = playerMessage(decision);
    return decision;
  }

  return {
    OPUS_WARNING: OPUS_WARNING,
    IOS_PIPELINE_NOTE: IOS_PIPELINE_NOTE,
    MAX_TARGET_DURATION: MAX_TARGET_DURATION,
    STALE_PROGRAM_DATE_MS: STALE_PROGRAM_DATE_MS,
    STALE_SEQUENCE_MS: STALE_SEQUENCE_MS,
    MIN_LONG_SIDE: MIN_LONG_SIDE,
    isIosDevice: isIosDevice,
    needsAppleHlsPipeline: needsAppleHlsPipeline,
    parseMaster: parseMaster,
    parseMedia: parseMedia,
    preferredVariant: preferredVariant,
    assess: assess,
    choose: choose,
    playerMessage: playerMessage
  };
});
