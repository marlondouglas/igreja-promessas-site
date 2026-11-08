"use strict";
/* Igreja Promessas — player público HLS.
 * iOS: use reprodução HLS nativa; demais navegadores: hls.js com recuperação.
 * O selo NO AR só aparece após o início de quadros de vídeo, não após obter a playlist.
 */
(()=>{
  const isHome=!!document.getElementById("home-live-holder");
  const holder=document.getElementById(isHome?"home-live-holder":"watch-holder");
  if(!holder)return;
  const stage=document.getElementById(isHome?"home-live-stage":"video-stage");
  const waiting=document.getElementById(isHome?"home-live-wait":"wait-card");
  const label=document.getElementById(isHome?"home-live-badge":"watch-status");
  const note=document.getElementById("video-disclaimer");
  const nav=document.getElementById("nav-live-dot");
  const local=new URLSearchParams(location.search).get("teste")==="notebook";
  const ua=navigator.userAgent||"";
  const apple=/iPad|iPhone|iPod/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)||(/Safari/.test(ua)&&!/Chrome|CriOS|Edg|FxiOS/.test(ua));
  let endpoint=null,active=false,hls=null,video=null,checking=false,misses=0;
  let watchdog=0,startedAt=0,lastProgressAt=0,lastTime=-1,hasFrames=false,mode="none",loadNumber=0;
  function valid(value){
    if(typeof value!=="string")return null;
    try{
      const u=new URL(value);
      if(u.username||u.password||u.search||u.hash)return null;
      if(u.protocol!=="https:"&&!(local&&u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname)))return null;
      if(!u.pathname.endsWith("/culto"))return null;
      return u;
    }catch(_){return null;}
  }
  function status(kind){
    if(!label)return;
    const playing=kind==="live";
    const text=kind==="live"?"● NO AR":kind==="connecting"?"CONECTANDO VÍDEO":
      kind==="alternative"?"SINAL DETECTADO":kind==="failed"?"VÍDEO INDISPONÍVEL":"AGUARDANDO CULTO";
    label.textContent=text;
    label.classList.toggle("is-live",playing);
    if(nav)nav.hidden=!playing;
    document.body.classList.toggle("church-stream-live",playing);
    if(note){
      note.textContent=kind==="live"?
        "Você está acompanhando o culto ao vivo. Para ouvir, use o controle de áudio do vídeo.":
        kind==="connecting"?"Sinal ao vivo encontrado. Conectando à imagem; se necessário, toque em Assistir agora.":
        kind==="alternative"?"O sinal foi encontrado, mas não foi possível confirmar a imagem. Use o player alternativo ou tente novamente.":
        kind==="failed"?"O navegador não conseguiu reproduzir o sinal. Tente novamente; se persistir, verifique o formato de áudio e vídeo enviado pelo estúdio.":
        "Quando o culto começar, a transmissão aparecerá automaticamente nesta página.";
    }
  }
  function stopWatchdog(){
    if(watchdog){clearInterval(watchdog);watchdog=0;}
  }
  function destroy(){
    stopWatchdog();
    if(hls){try{hls.destroy();}catch(_){} hls=null;}
    if(video){try{video.pause();video.removeAttribute("src");video.load();}catch(_){} video=null;}
    stage.replaceChildren();
    mode="none";
  }
  function overlayButton(title,onClick){
    const button=document.createElement("button");
    button.type="button";button.className="live-play-overlay";
    button.textContent=title;
    button.addEventListener("click",onClick);
    return button;
  }
  function linkToPlayer(){
    const a=document.createElement("a");
    a.href=endpoint.origin+endpoint.pathname;
    a.target="_blank";a.rel="noopener noreferrer";
    a.textContent="Abrir transmissão em outra janela";
    a.style.cssText="position:absolute;z-index:7;bottom:10px;left:10px;padding:8px 12px;border-radius:10px;border:1px solid #dfbb80;background:#121823ed;color:#f3dab0;text-decoration:none;font:700 12px Arial,sans-serif";
    return a;
  }
  function alternative(){
    if(!active||!endpoint)return;
    destroy();
    mode="iframe";
    status("alternative");
    const frame=document.createElement("iframe");
    frame.title="Player alternativo ao vivo da Igreja Promessas";
    frame.src=endpoint.origin+endpoint.pathname+"?autoplay=true&muted=true&playsInline=true";
    frame.referrerPolicy="strict-origin-when-cross-origin";
    frame.allow="autoplay; fullscreen; picture-in-picture";
    frame.setAttribute("allowfullscreen","");
    const retry=overlayButton("↻ Tentar vídeo novamente",()=>startVideo());
    retry.style.cssText="position:absolute;z-index:7;bottom:10px;right:10px;left:auto;transform:none;white-space:normal;max-width:48%;font-size:11px";
    stage.replaceChildren(frame,linkToPlayer(),retry);
  }
  function startVideo(forceHls=false){
    if(!active||!endpoint)return;
    destroy();mode="native";hasFrames=false;lastTime=-1;
    status("connecting");
    const ticket=++loadNumber;
    startedAt=Date.now();lastProgressAt=startedAt;
    const url=endpoint.origin+endpoint.pathname+"/index.m3u8";
    const el=document.createElement("video");video=el;
    el.autoplay=true;el.muted=true;el.controls=true;el.preload="auto";
    el.setAttribute("playsinline","");el.setAttribute("webkit-playsinline","");
    el.setAttribute("aria-label","Transmissão ao vivo da Igreja Promessas");
    const manual=overlayButton("▶ Assistir agora",()=>{
      if(ticket!==loadNumber||!active)return;
      el.muted=false;
      el.play().then(()=>{}).catch(()=>{manual.hidden=false;});
    });
    const hint=document.createElement("span");
    hint.textContent="Conectando ao vídeo do culto…";
    hint.style.cssText="pointer-events:none;position:absolute;top:12px;left:12px;z-index:5;padding:7px 10px;border-radius:8px;color:#f9ecd6;background:#141821d9;font:700 12px Arial,sans-serif";
    stage.replaceChildren(el,hint,manual);
    function frameReady(){
      if(ticket!==loadNumber||!active||!el.videoWidth||!el.videoHeight)return;
      hasFrames=true;lastProgressAt=Date.now();
      hint.hidden=true;manual.hidden=true;status("live");
    }
    if(typeof el.requestVideoFrameCallback==="function"){
      const watchFrame=()=>{
        if(ticket!==loadNumber||!active||video!==el)return;
        frameReady();
        el.requestVideoFrameCallback(watchFrame);
      };
      el.requestVideoFrameCallback(watchFrame);
    }
    el.addEventListener("timeupdate",()=>{
      if(el.currentTime>lastTime+.08){
        lastTime=el.currentTime;
        lastProgressAt=Date.now();
        if(typeof el.requestVideoFrameCallback!=="function"&&el.videoWidth>0)frameReady();
      }
    });
    const autoPlay=()=>{
      if(ticket!==loadNumber||!active)return;
      el.play().catch(()=>{manual.hidden=false;});
    };
    el.addEventListener("playing",()=>{if(el.videoWidth>0&&typeof el.requestVideoFrameCallback!=="function")frameReady();});
    el.addEventListener("loadeddata",autoPlay,{once:true});
    el.addEventListener("error",()=>{if(ticket===loadNumber&&active)nextPlayback();},{once:true});
    let recoveries=0;
    function nextPlayback(){
      if(ticket!==loadNumber||!active)return;
      if(mode==="native"&&window.Hls&&window.Hls.isSupported()){
        startVideo(true);
      }else{
        alternative();
      }
    }
    const useNative=!forceHls&&apple&&!!el.canPlayType("application/vnd.apple.mpegurl");
    if(useNative){
      mode="native";el.src=url;el.load();autoPlay();
    }else if(window.Hls&&window.Hls.isSupported()){
      mode="hls";
      hls=new window.Hls({
        enableWorker:true,lowLatencyMode:false,
        liveSyncDuration:8,liveMaxLatencyDuration:20,
        maxBufferLength:20,backBufferLength:14,capLevelToPlayerSize:true
      });
      hls.on(window.Hls.Events.ERROR,(_event,data)=>{
        if(ticket!==loadNumber||!active||!data.fatal)return;
        if(recoveries++<1&&data.type===window.Hls.ErrorTypes.NETWORK_ERROR){hls.startLoad();return;}
        if(recoveries<2&&data.type===window.Hls.ErrorTypes.MEDIA_ERROR){hls.recoverMediaError();return;}
        nextPlayback();
      });
      hls.on(window.Hls.Events.MANIFEST_PARSED,autoPlay);
      hls.attachMedia(el);hls.loadSource(url);
    }else if(el.canPlayType("application/vnd.apple.mpegurl")){
      mode="native";el.src=url;el.load();autoPlay();
    }else{
      alternative();return;
    }
    stopWatchdog();
    watchdog=setInterval(()=>{
      if(ticket!==loadNumber||!active){stopWatchdog();return;}
      const now=Date.now();
      if(!hasFrames&&now-startedAt>16000){nextPlayback();return;}
      if(hasFrames&&!el.paused&&!el.seeking&&now-lastProgressAt>22000){nextPlayback();}
    },2000);
  }
  function show(){
    if(active)return;
    active=true;misses=0;
    waiting.hidden=true;stage.hidden=false;
    startVideo();
  }
  function hide(){
    if(!active){status("waiting");return;}
    active=false;loadNumber++;
    destroy();stage.hidden=true;waiting.hidden=false;status("waiting");
  }
  async function check(){
    if(!endpoint||checking)return;
    checking=true;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch(endpoint.origin+endpoint.pathname+"/index.m3u8",{cache:"no-store",signal:controller.signal});
      const manifest=response.ok?await response.text():"";
      if(manifest.trimStart().startsWith("#EXTM3U")&&(manifest.includes("#EXTINF")||manifest.includes("#EXT-X-STREAM-INF")||manifest.includes("#EXT-X-MAP"))){
        misses=0;show();
      }else if(++misses>=3)hide();
    }catch(_){if(++misses>=3)hide();}
    finally{clearTimeout(timer);checking=false;}
  }
  async function boot(){
    status("waiting");
    if(local)endpoint=valid("http://127.0.0.1:8888/culto");
    else{
      try{
        const response=await fetch("/culto/stream-config.json",{cache:"no-store"});
        if(!response.ok)return;
        const config=await response.json();
        if(config.enabled!==true)return;
        endpoint=valid(config.hlsPageUrl);
        if(["horizontal","vertical"].includes(config.format))holder.dataset.format=config.format;
      }catch(_){return;}
    }
    if(!endpoint)return;
    await check();
    setInterval(check,10000);
    document.addEventListener("visibilitychange",()=>{
      if(!document.hidden&&active&&mode==="native"&&video&&!hasFrames){
        video.play().catch(()=>{});
      }
    });
  }
  boot();
})();