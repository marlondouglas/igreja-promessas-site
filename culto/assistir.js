"use strict";
/* Igreja Promessas — player público HLS. A playlist existir não garante imagem:
   só marcar NO AR após o navegador receber um quadro decodificado.
   O estúdio/publicação WHIP não é alterado por este visualizador. */
(()=>{
  const isHome=!!document.getElementById("home-live-holder");
  const holder=document.getElementById(isHome?"home-live-holder":"watch-holder");
  if(!holder)return;
  const stage=document.getElementById(isHome?"home-live-stage":"video-stage");
  const waiting=document.getElementById(isHome?"home-live-wait":"wait-card");
  const label=document.getElementById(isHome?"home-live-badge":"watch-status");
  const note=document.getElementById("video-disclaimer");
  const nav=document.getElementById("nav-live-dot");
  const query=new URLSearchParams(location.search);
  const local=query.get("teste")==="notebook";
  let endpoint=null,active=false,confirmed=false,hls=null,video=null,checking=false,misses=0;
  let watchdog=null,attempt=0,started=0,lastFrame=0,lastPosition=-1,mode="",modesTried=new Set();
  const style=document.createElement("style");
  style.textContent=[
    ".live-load-hint{position:absolute;z-index:4;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:22px;background:linear-gradient(145deg,#10131cde,#12141fd9);color:#fff0d5;font:700 14px/1.55 system-ui,sans-serif;pointer-events:none}",
    ".live-load-hint[hidden],.live-recovery[hidden],.live-play-overlay[hidden]{display:none!important}",
    ".live-load-hint span{display:block;max-width:340px}",
    ".live-recovery{position:absolute;z-index:6;bottom:10px;left:10px;right:10px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:8px;border-radius:12px;background:#111724e8;color:#fff1d8;font:600 12px system-ui,sans-serif}",
    ".live-recovery a,.live-recovery button{border:1px solid #d7b77e;border-radius:9px;background:#2d2a2b;color:#fff2d9;padding:9px 12px;font:700 12px system-ui,sans-serif;text-decoration:none;cursor:pointer}",
    ".live-play-overlay{position:absolute;z-index:7;bottom:18px;left:50%;transform:translateX(-50%);padding:12px 18px;border:1px solid #e4c58d;border-radius:24px;background:#181d2bf2;color:#fff0d5;font:800 13px system-ui,sans-serif;white-space:nowrap;cursor:pointer}"
  ].join("\n");
  document.head.appendChild(style);
  function valid(value){
    if(typeof value!=="string")return null;
    try{
      const u=new URL(value);
      if(u.username||u.password||u.search||u.hash)return null;
      if(u.protocol!=="https:"&&!(local&&u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname)))return null;
      if(!u.pathname.endsWith("/culto"))return null;
      return u;
    }catch{return null;}
  }
  function status(state){
    const live=state==="live";
    label.textContent=live?"● NO AR":state==="connecting"?"CONECTANDO VÍDEO":state==="tap"?"TOQUE PARA ASSISTIR":state==="fallback"?"PLAYER ALTERNATIVO":"AGUARDANDO CULTO";
    label.classList.toggle("is-live",live);
    if(nav)nav.hidden=!live;
    document.body.classList.toggle("church-stream-live",live);
    if(note)note.textContent=live
      ?"Você está acompanhando o culto ao vivo. Para ouvir, toque no controle de áudio do vídeo."
      :state==="connecting"?"A transmissão foi localizada. Estamos carregando a imagem e o áudio."
      :state==="tap"?"O navegador bloqueou a reprodução automática. Toque no vídeo para iniciar."
      :state==="fallback"?"A transmissão foi encontrada, mas o vídeo não carregou neste navegador. Use o player alternativo ou tente novamente."
      :"Quando o culto começar, a transmissão aparecerá automaticamente nesta página.";
  }
  function clearPlayer(){
    attempt++;
    if(watchdog){clearInterval(watchdog);watchdog=null;}
    if(hls){try{hls.destroy();}catch(_){}hls=null;}
    if(video){try{video.pause();video.removeAttribute("src");video.load();}catch(_){}video=null;}
    stage.replaceChildren();
  }
  function showHint(message){
    let hint=stage.querySelector(".live-load-hint");
    if(!hint){hint=document.createElement("div");hint.className="live-load-hint";stage.appendChild(hint);}
    hint.replaceChildren();
    const span=document.createElement("span");
    span.textContent=message;
    hint.appendChild(span);
    hint.hidden=false;
    return hint;
  }
  function fallbackFrame(){
    if(!active)return;
    clearPlayer();
    mode="iframe";
    confirmed=false;
    status("fallback");
    const frame=document.createElement("iframe");
    frame.title="Player alternativo do culto ao vivo — Igreja Ministério Promessas";
    frame.src=endpoint.origin+endpoint.pathname+"?autoplay=true&muted=true&playsInline=true";
    frame.referrerPolicy="strict-origin-when-cross-origin";
    frame.allow="autoplay; fullscreen; picture-in-picture";
    frame.setAttribute("allowfullscreen","");
    stage.replaceChildren(frame);
    const recovery=document.createElement("div");
    recovery.className="live-recovery";
    const link=document.createElement("a");
    link.href=endpoint.origin+endpoint.pathname;
    link.target="_blank";
    link.rel="noopener noreferrer";
    link.textContent="Abrir player alternativo";
    const retry=document.createElement("button");
    retry.type="button";
    retry.textContent="↻ Tentar novamente";
    retry.addEventListener("click",()=>{modesTried.clear();startVideo();});
    recovery.append(link,retry);
    stage.appendChild(recovery);
  }
  function nextMode(){
    if(!active)return;
    const nativeSupported=!!document.createElement("video").canPlayType("application/vnd.apple.mpegurl");
    const hlsSupported=!!(window.Hls&&window.Hls.isSupported());
    const nativeFirst=/iPhone|iPad|iPod/.test(navigator.userAgent)||
      (/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
    const candidates=nativeFirst?["native","hls"]:["hls","native"];
    for(const next of candidates){
      if(modesTried.has(next))continue;
      if(next==="native"&&!nativeSupported)continue;
      if(next==="hls"&&!hlsSupported)continue;
      startVideo(next);
      return;
    }
    fallbackFrame();
  }
  function startVideo(preferred){
    if(!active||!endpoint)return;
    if(!preferred){modesTried.clear();nextMode();return;}
    clearPlayer();
    mode=preferred;
    modesTried.add(preferred);
    confirmed=false;
    started=Date.now();
    lastFrame=started;
    lastPosition=-1;
    status("connecting");
    video=document.createElement("video");
    const current=video;
    const token=attempt;
    video.setAttribute("playsinline","");
    video.setAttribute("webkit-playsinline","");
    video.setAttribute("aria-label","Transmissão ao vivo da Igreja Promessas");
    video.autoplay=true;
    video.muted=true;
    video.controls=true;
    video.preload="auto";
    const playButton=document.createElement("button");
    playButton.type="button";
    playButton.className="live-play-overlay";
    playButton.textContent="▶ Toque para assistir";
    playButton.hidden=true;
    const stillCurrent=()=>active&&token===attempt&&video===current;
    const confirmFrame=()=>{
      if(!stillCurrent()||current.videoWidth<1||current.readyState<2)return;
      const now=Date.now();
      lastFrame=now;
      if(!confirmed){
        confirmed=true;
        status("live");
        const hint=stage.querySelector(".live-load-hint");
        if(hint)hint.hidden=true;
      }
    };
    if(typeof current.requestVideoFrameCallback==="function"){
      const onFrame=()=>{
        if(!stillCurrent())return;
        confirmFrame();
        current.requestVideoFrameCallback(onFrame);
      };
      current.requestVideoFrameCallback(onFrame);
    }
    current.addEventListener("loadeddata",confirmFrame);
    current.addEventListener("timeupdate",()=>{
      if(!stillCurrent())return;
      if(current.currentTime!==lastPosition){
        lastPosition=current.currentTime;
        confirmFrame();
      }
    });
    current.addEventListener("playing",()=>{
      if(!stillCurrent())return;
      playButton.hidden=true;
      confirmFrame();
    });
    current.addEventListener("error",()=>{if(stillCurrent())nextMode();},{once:true});
    playButton.addEventListener("click",()=>{
      if(!stillCurrent())return;
      current.muted=false;
      current.play().then(()=>{if(stillCurrent())playButton.hidden=true;}).catch(()=>{
        if(stillCurrent()){playButton.hidden=false;status("tap");}
      });
    });
    const tryPlay=()=>{
      if(!stillCurrent())return;
      current.play().catch(()=>{
        if(stillCurrent()){playButton.hidden=false;status("tap");}
      });
    };
    stage.replaceChildren(current,playButton);
    showHint("Conectando à transmissão da Igreja Promessas…");
    const url=endpoint.origin+endpoint.pathname+"/index.m3u8";
    try{
      if(preferred==="hls"){
        hls=new window.Hls({
          enableWorker:true,lowLatencyMode:false,
          liveSyncDuration:8,liveMaxLatencyDuration:18,
          maxBufferLength:24,backBufferLength:20,
          capLevelToPlayerSize:true,autoStartLoad:true
        });
        const player=hls;
        player.on(window.Hls.Events.ERROR,(_event,data)=>{
          if(!stillCurrent()||!data.fatal)return;
          nextMode();
        });
        player.on(window.Hls.Events.MANIFEST_PARSED,tryPlay);
        player.attachMedia(current);
        player.loadSource(url);
      }else{
        current.src=url;
        current.addEventListener("loadedmetadata",tryPlay,{once:true});
        tryPlay();
      }
    }catch(_){if(stillCurrent())nextMode();return;}
    // A playlist may exist while the video is black. Switch player after a real timeout.
    watchdog=setInterval(()=>{
      if(!stillCurrent())return;
      const now=Date.now();
      if(!confirmed&&now-started>14000){nextMode();return;}
      if(confirmed&&current.readyState<2&&now-lastFrame>18000){nextMode();}
    },1100);
  }
  function show(){
    if(active)return;
    active=true;
    waiting.hidden=true;
    stage.hidden=false;
    status("connecting");
    startVideo();
  }
  function hide(){
    if(!active){status("offline");return;}
    active=false;
    confirmed=false;
    clearPlayer();
    modesTried.clear();
    mode="";
    stage.hidden=true;
    waiting.hidden=false;
    status("offline");
  }
  async function check(){
    if(!endpoint||checking)return;
    checking=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const url=endpoint.origin+endpoint.pathname+"/index.m3u8";
      const response=await fetch(url,{cache:"no-store",signal:controller.signal});
      const body=response.ok?await response.text():"";
      // A real media or master playlist, not a generic HTML/error response.
      const available=body.startsWith("#EXTM3U")&&
        (body.includes("#EXT-X-STREAM-INF")||body.includes("#EXTINF:")||body.includes("#EXT-X-PART:"));
      if(available){misses=0;show();}
      else if(++misses>=3)hide();
    }catch(_){if(++misses>=3)hide();}
    finally{clearTimeout(timeout);checking=false;}
  }
  async function boot(){
    status("offline");
    if(local)endpoint=valid("http://127.0.0.1:8888/culto");
    else{
      try{
        const response=await fetch("/culto/stream-config.json",{cache:"no-store"});
        if(!response.ok)return;
        const config=await response.json();
        if(config.enabled!==true)return;
        endpoint=valid(config.hlsPageUrl);
        if(config.format==="horizontal"||config.format==="vertical")holder.dataset.format=config.format;
      }catch(_){return;}
    }
    if(!endpoint)return;
    await check();
    setInterval(check,10000);
  }
  boot();
})();