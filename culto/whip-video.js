"use strict";
/* Limites do envio de vídeo WHIP.
 * Aplicar setParameters antes do offer pode deixar o encoding de vídeo inativo.
 * O áudio Opus segue, o SDP ainda anuncia H.264 e o RTSP fica sem quadros.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromessasWhipVideo = api;
})(typeof globalThis === "undefined" ? undefined : globalThis, function () {
  function liveAudioTracks(tracks) {
    return (tracks || []).filter(function (track) {
      return track && track.kind === "audio" && track.readyState !== "ended";
    });
  }

  function applyVideoSenderLimits(params) {
    const next = {};
    if (params && params.transactionId) next.transactionId = params.transactionId;
    const source = params && params.encodings && params.encodings.length ? params.encodings : [{}];
    next.encodings = source.map(function (encoding, index) {
      const copy = Object.assign({}, encoding);
      if (index === 0) {
        copy.active = true;
        copy.maxBitrate = 2400000;
        copy.maxFramerate = 24;
      }
      return copy;
    });
    return next;
  }

  return { applyVideoSenderLimits: applyVideoSenderLimits, liveAudioTracks: liveAudioTracks };
});
