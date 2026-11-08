"use strict";
/* Igreja Promessas: visualizador público e mini-player da página inicial.
   Apenas o sinal HLS público é acessado; credenciais de publicação não entram aqui. */
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
  let endpoint=null,playing=false,hls=null,video=null,checking=false,misses=0;
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
  function status(live){
    label.textContent=live?"● NO AR":"AGUARDANDO CULTO";
    label.classList.toggle("is-live",live);
    if(nav)nav.hidden=!live;
    document.body.classList.toggle("church-stream-live",live);
    if(note)note.textContent=live
      ?"Você está acompanhando o culto ao vivo. Para ouvir, toque no controle de áudio do vídeo."
      :"Quando o culto começar, a transmissão aparecerá automaticamente nesta página.";
  }
  function destroy(){
    if(hls){hls.destroy();hls=null;}
    if(video){video.pause();video.removeAttribute("src");video.load();video=null;}
    stage.replaceChildren();
  }
  function fallbackFrame(){
    if(!endpoint)return;
    destroy();
    const frame=document.createElement("iframe");
    frame.title="Culto ao vivo — Igreja Ministério Promessas";
    frame.src=endpoint.origin+endpoint.pathname+"?autoplay=true&muted=true&playsInline=true";
    frame.referrerPolicy="strict-origin-when-cross-origin";
    frame.allow="autoplay; fullscreen; picture-in-picture";
    frame.setAttribute("allowfullscreen","");
    stage.replaceChildren(frame);
  }
  function attachVideo(){
    const url=endpoint.origin+endpoint.pathname+"/index.m3u8";
    video=document.createElement("video");
    video.setAttribute("playsinline","");
    video.setAttribute("webkit-playsinline","");
    video.setAttribute("aria-label","Transmissão ao vivo da Igreja Promessas");
    video.autoplay=true;
    video.muted=true; // Autoplay permitido; visitante pode ativar o som.
    video.controls=true;
    video.preload="auto";
    video.addEventListener("error",()=>{if(playing)fallbackFrame();},{once:true});
    const playButton=document.createElement("button");
    playButton.type="button";
    playButton.className="live-play-overlay";
    playButton.textContent="▶ Toque para assistir";
    playButton.hidden=true;
    playButton.addEventListener("click",()=>{
      if(!video)return;
      video.muted=false;
      video.play().then(()=>{playButton.hidden=true;}).catch(()=>{playButton.hidden=false;});
    });
    video.addEventListener("playing",()=>{playButton.hidden=true;});
    const tryPlay=()=>video?.play().catch(()=>{playButton.hidden=false;});
    stage.replaceChildren(video,playButton);
    if(window.Hls&&window.Hls.isSupported()){
      hls=new window.Hls({
        enableWorker:true,lowLatencyMode:false,
        liveSyncDuration:8,liveMaxLatencyDuration:18,
        maxBufferLength:24,backBufferLength:20,
        capLevelToPlayerSize:true,autoStartLoad:true
      });
      hls.on(window.Hls.Events.ERROR,(_event,data)=>{
        if(data.fatal&&playing)fallbackFrame();
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED,tryPlay);
    }else if(video.canPlayType("application/vnd.apple.mpegurl")){
      video.src=url;
      tryPlay();
    }else{
      fallbackFrame();
    }
  }
  function show(){
    if(playing)return;
    playing=true;
    waiting.hidden=true;
    stage.hidden=false;
    status(true);
    attachVideo();
  }
  function hide(){
    if(!playing)return;
    playing=false;
    destroy();
    stage.hidden=true;
    waiting.hidden=false;
    status(false);
  }
  async function check(){
    if(!endpoint||checking)return;
    checking=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),7000);
    try{
      const url=endpoint.origin+endpoint.pathname+"/index.m3u8";
      const response=await fetch(url,{cache:"no-store",signal:controller.signal});
      const validPlaylist=response.ok&&(await response.text()).includes("#EXTM3U");
      if(validPlaylist){misses=0;show();}
      else if(++misses>=3)hide();
    }catch(_){if(++misses>=3)hide();}
    finally{clearTimeout(timeout);checking=false;}
  }
  async function boot(){
    status(false);
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
