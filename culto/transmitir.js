"use strict";
/* WHIP publishing: credentials stay in memory; viewer/HLS configuration is unchanged. */
(() => {
  const $ = id => document.getElementById(id);
  const { isLoopback, validateEndpoint, sessionURL, parseIceServers } = window.PromessasPublisherConfig;
  const pass = $("publish-secret"), endpoint = $("whip-url"), enabled = $("publish-enabled"), mode = $("publish-location");
  const localEndpoint = "http://127.0.0.1:8889/culto/whip";
  let remoteEndpoint = "", current = null, doneHoldTimeout = null, endpointEdited = false;
  const report = text => { $("publish-status").textContent = text; };
  const badge = text => { $("server-badge").textContent = text; };
  const sceneActive = () => /ABERTURA|CÂMERA|PAUSA|ENCERRAMENTO/i.test($("scene-status")?.textContent || "");

  function controls() {
    const busy = Boolean(current);
    mode.disabled = busy; endpoint.disabled = busy; pass.disabled = busy;
    $("test-server").disabled = busy;
    $("reconnect-publish").disabled = Boolean(current && !current.connected);
  }
  function environmentReady() {
    if (!window.isSecureContext) {
      $("publish-environment").textContent = "Abra o estúdio em https://igrejapromessas.site/culto/studio.html. Câmera, microfone e compartilhamento precisam de HTTPS (ou localhost no próprio servidor).";
      return false;
    }
    if (!window.RTCPeerConnection || !$("program-canvas")?.captureStream || !navigator.mediaDevices?.getUserMedia) {
      $("publish-environment").textContent = "Use uma versão atual do Chrome ou Edge no notebook e autorize câmera e microfone.";
      return false;
    }
    $("publish-environment").textContent = "Este navegador permite preparar a transmissão. A conexão com o servidor será verificada separadamente.";
    return true;
  }
  function applyMode() {
    const local = mode.value === "local";
    endpoint.value = local ? localEndpoint : remoteEndpoint;
    $("local-signal-link").hidden = !local;
    $("publisher-guidance").textContent = local
      ? "Use esta opção somente no computador que executa o MediaMTX. 127.0.0.1 sempre aponta para o próprio notebook."
      : "Use a entrada WHIP HTTPS fornecida pelo administrador da igreja. O endereço de assistir à live não é a entrada de publicação. O servidor precisa continuar ligado.";
    badge(local ? "SERVIDOR LOCAL" : "SERVIDOR REMOTO");
    report(local ? "Envio desativado. Prepare o culto antes de conectar ao servidor deste notebook."
      : remoteEndpoint ? "Entrada remota preenchida. Informe sua senha privada e verifique o servidor antes de transmitir."
        : "Informe a entrada WHIP HTTPS. A publicação pela internet depende de configuração no servidor da igreja.");
  }
  mode.value = isLoopback(window.location.hostname) ? "local" : "remote";
  applyMode(); environmentReady(); controls();
  endpoint.addEventListener("input", () => {
    endpointEdited = true;
    if (mode.value === "remote") remoteEndpoint = endpoint.value;
  });
  mode.addEventListener("change", applyMode);
  fetch("/culto/publisher-config.json", { cache: "no-store", signal: AbortSignal.timeout(5000) })
    .then(r => { if (!r.ok) throw new Error("config unavailable"); return r.json(); })
    .then(config => {
      const url = validateEndpoint(config.remoteWhipUrl, "remote");
      if (url && !endpointEdited && !current && !enabled.checked) {
        remoteEndpoint = url;
        if (mode.value === "remote") applyMode();
      }
    }).catch(() => { /* Manual entry remains available; no localhost fallback in remote mode. */ });

  function auth() {
    const password = pass.value.trim();
    if (password.length < 20) throw new Error("Informe a senha privada de publicação fornecida pelo responsável da igreja.");
    try { return "Basic " + btoa("promessas:" + password); }
    catch (_) { throw new Error("A senha informada tem caracteres incompatíveis. Confira a chave de publicação com o responsável."); }
  }
  function selectedEndpoint() {
    const url = validateEndpoint(endpoint.value, mode.value);
    if (!url) throw new Error(mode.value === "remote"
      ? "Informe uma entrada HTTPS terminada em /culto/whip, sem senha na URL. Não use localhost ou 127.0.0.1 em outro notebook."
      : "Informe uma entrada HTTPS ou o endereço HTTP de localhost, terminado em /culto/whip.");
    return url;
  }
  function serverError(status) {
    if (status === 401 || status === 403) return "Servidor recusou a autenticação (HTTP " + status + "). Confira a senha privada; não envie a senha nesta conversa.";
    if (status === 404 || status === 405) return "Entrada WHIP não encontrada (HTTP " + status + "). O endereço de assistir à live não substitui a entrada de publicação.";
    if (status === 409) return "O canal já está em uso (HTTP 409). Preserve a transmissão atual; não tente assumir o canal.";
    return "Servidor recusou a solicitação (HTTP " + status + "). Peça ao responsável para verificar a entrada WHIP.";
  }
  async function discover(url, authorization, signal) {
    const response = await fetch(url, { method: "OPTIONS", mode: "cors", credentials: "omit", redirect: "error", cache: "no-store",
      headers: { Authorization: authorization }, signal });
    if (!response.ok) throw new Error(serverError(response.status));
    return parseIceServers(response.headers.get("Link"));
  }
  function failureMessage(error) {
    const text = String(error?.message || "Falha desconhecida.");
    if (error?.name === "AbortError" || error?.name === "TimeoutError") return "A conexão demorou demais ou foi cancelada. Verifique a entrada HTTPS e a rede do servidor.";
    if (/Failed to fetch|NetworkError|Load failed|fetch failed|redirect/i.test(text)) return "Não consegui acessar a entrada WHIP. Confira HTTPS, endereço e permissões CORS no servidor. Um túnel para assistir à live não garante entrada de vídeo.";
    return text;
  }
  $("test-server").addEventListener("click", async () => {
    if (current || !environmentReady()) return;
    $("test-server").disabled = true;
    report("Verificando a entrada WHIP sem enviar vídeo...");
    try {
      const ice = await discover(selectedEndpoint(), auth(), AbortSignal.timeout(7000));
      badge("ENDEREÇO RESPONDEU");
      report("A entrada respondeu à consulta. " + (ice.some(s => /^turns?:/i.test(s.urls[0])) ? "O servidor anunciou retransmissão TURN. " : "Nenhum TURN foi anunciado. Redes restritas podem impedir o envio. ")
        + "Isso ainda não confirma a senha, o envio de vídeo nem a reprodução pública.");
    } catch (error) { badge("SEM CONEXÃO"); report(failureMessage(error)); }
    finally { controls(); }
  });
  async function gather(pc, signal) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (pc.iceGatheringState === "complete") return;
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer); pc.removeEventListener("icegatheringstatechange", changed); signal.removeEventListener("abort", aborted);
        error ? reject(error) : resolve();
      };
      const changed = () => { if (pc.iceGatheringState === "complete") finish(); };
      const aborted = () => finish(new DOMException("Cancelled", "AbortError"));
      const timer = setTimeout(() => finish(new Error("A descoberta de rede ICE demorou demais. Verifique STUN/TURN no servidor.")), 15000);
      pc.addEventListener("icegatheringstatechange", changed); signal.addEventListener("abort", aborted, { once: true });
    });
  }
  async function deleteSession(session) {
    const resource = session.resource; session.resource = null;
    if (!resource) return;
    try {
      await fetch(resource, { method: "DELETE", mode: "cors", credentials: "omit", redirect: "error",
        headers: { Authorization: session.authorization }, signal: AbortSignal.timeout(3000) });
    } catch (_) { /* Closing the peer also releases media; never retry another session. */ }
  }
  async function release(session) {
    session.controller.abort(); clearTimeout(session.timer);
    try { session.peer?.close(); } catch (_) {}
    session.video?.stop(); // Audio belongs to the studio mixer and stays available.
    await deleteSession(session);
  }
  async function stop(silent = false) {
    if (doneHoldTimeout) { clearTimeout(doneHoldTimeout); doneHoldTimeout = null; }
    const session = current; current = null; controls();
    if (!silent && session) { badge("ENVIO ENCERRADO"); report("O envio deste navegador foi encerrado. Confira a página do público."); }
    if (session) await release(session);
  }
  async function start() {
    if (!enabled.checked || current || !environmentReady()) return;
    let url, authorization;
    try { url = selectedEndpoint(); authorization = auth(); }
    catch (error) { report(error.message); return; }
    const session = { peer: null, video: null, resource: null, authorization, controller: new AbortController(), connected: false, timer: null };
    current = session; controls(); badge("CONECTANDO"); report("Conectando a saída de vídeo ao servidor da igreja...");
    const active = () => current === session && !session.controller.signal.aborted;
    try {
      const iceServers = await discover(url, authorization, AbortSignal.any([session.controller.signal, AbortSignal.timeout(7000)]));
      if (!active()) return;
      const video = $("program-canvas").captureStream(24).getVideoTracks()[0];
      if (!video) throw new Error("Não foi possível capturar a saída de vídeo.");
      session.video = video;
      const tracks = [video, ...(window.PromessasAudioStream?.getAudioTracks() || [])];
      if (tracks.length === 1) throw new Error("O áudio do estúdio não está preparado. Inicie a apresentação e tente conectar novamente.");
      const stream = new MediaStream(tracks), pc = new RTCPeerConnection({ iceServers });
      session.peer = pc;
      for (const track of tracks) pc.addTrack(track, stream);
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) {
        try {
          const parameters = sender.getParameters();
          if (!parameters.encodings?.length) parameters.encodings = [{}];
          parameters.encodings[0].maxBitrate = 2400000; parameters.encodings[0].maxFramerate = 24;
          await sender.setParameters(parameters);
        } catch (_) { /* Browser defaults are still usable. */ }
      }
      if (!active()) return;
      const h264 = (RTCRtpSender.getCapabilities?.("video")?.codecs || []).filter(c => c.mimeType?.toLowerCase() === "video/h264");
      const transceiver = pc.getTransceivers().find(t => t.sender.track?.kind === "video");
      if (!h264.length || !transceiver?.setCodecPreferences) throw new Error("Este navegador não oferece H.264 compatível com o site. Use Chrome ou Edge atualizado.");
      transceiver.setCodecPreferences(h264);
      pc.addEventListener("connectionstatechange", () => {
        if (!active()) return;
        if (pc.connectionState === "connected") {
          session.connected = true; clearTimeout(session.timer); controls(); badge("SINAL CONECTADO");
          report("✓ Conexão de vídeo estabelecida com o servidor. Confirme imagem e áudio na página do público usando outro dispositivo e outra rede.");
        } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          session.connected = false; current = null; controls();
          badge("CONEXÃO INTERROMPIDA"); report("O envio foi interrompido. Confira a rede e o STUN/TURN do servidor. A prévia local continua disponível; reconecte quando estiver pronto.");
          void release(session);
        }
      });
      await pc.setLocalDescription(await pc.createOffer());
      await gather(pc, session.controller.signal);
      if (!active()) return;
      const response = await fetch(url, { method: "POST", mode: "cors", credentials: "omit", redirect: "error",
        headers: { "Content-Type": "application/sdp", Authorization: authorization }, body: pc.localDescription.sdp,
        signal: AbortSignal.any([session.controller.signal, AbortSignal.timeout(16000)]) });
      if (response.status !== 201) throw new Error(serverError(response.status));
      session.resource = sessionURL(response.headers.get("Location"), url);
      if (!session.resource) throw new Error("O servidor não expôs uma sessão WHIP válida. Verifique o header Location e o proxy HTTPS; a conexão foi encerrada.");
      if (!active()) { await deleteSession(session); return; }
      const sdp = await response.text();
      if (!active()) { await deleteSession(session); return; }
      await pc.setRemoteDescription({ type: "answer", sdp });
      if (!active()) return;
      session.timer = setTimeout(() => {
        if (active() && !session.connected) {
          current = null; controls(); badge("SEM RECEPÇÃO");
          report("O servidor aceitou WHIP, mas a conexão de mídia não se completou. Verifique candidatos ICE, portas de mídia e TURN; HTTPS sozinho não transporta o vídeo.");
          void release(session);
        }
      }, 15000);
    } catch (error) {
      if (active()) { current = null; controls(); badge("FALHA NO ENVIO"); report(failureMessage(error)); }
      await release(session);
    }
  }
  enabled.addEventListener("change", () => {
    if (!enabled.checked) { void stop(); return; }
    // Checking this box alone must never start a live, even during a rehearsal.
    report(sceneActive() ? "Envio habilitado. Clique em Conectar transmissão agora para publicar a apresentação em andamento."
      : "Envio habilitado. Ao iniciar a apresentação, o vídeo será enviado após a contagem de 10 segundos. Modo de teste também publica se o envio estiver habilitado.");
  });
  $("reconnect-publish").addEventListener("click", async () => {
    if (!enabled.checked) { report("Primeiro marque 'Enviar o vídeo para o servidor da igreja'."); return; }
    if (!sceneActive()) { report("Inicie a apresentação antes de conectar o vídeo. Para apenas verificar o endereço, use Verificar servidor."); return; }
    await stop(true); await start();
  });
  document.addEventListener("click", event => {
    if (event.target?.closest?.("#start") && enabled.checked) {
      try { if (!environmentReady()) throw new Error("Abra o estúdio em HTTPS num navegador compatível."); selectedEndpoint(); auth(); }
      catch (error) { event.preventDefault(); event.stopImmediatePropagation(); report(error.message); }
    }
  }, true);
  window.addEventListener("promessas-scene", event => {
    const phase = event.detail?.phase;
    if (doneHoldTimeout) { clearTimeout(doneHoldTimeout); doneHoldTimeout = null; }
    if (phase === "intro") void start();
    else if (phase === "done") doneHoldTimeout = setTimeout(() => { doneHoldTimeout = null; void stop(); }, 18000);
    else if (phase === "waiting") void stop();
  });
  window.addEventListener("beforeunload", () => {
    current?.controller.abort(); current?.peer?.close(); current?.video?.stop();
  });
})();
