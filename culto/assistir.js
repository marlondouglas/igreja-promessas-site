"use strict";
/* Direct-stream viewer for the church's OWN notebook server.
   The configured endpoint must be HTTPS for public viewing. When offline/unconfigured,
   keep the branded waiting screen instead of claiming the video is live.
*/
(()=>{
 const stage=document.getElementById("video-stage");
 const waiting=document.getElementById("wait-card");
 const watch=document.getElementById("watch-holder");
 const label=document.getElementById("watch-status");
 const desc=document.getElementById("video-disclaimer");
 const query=new URLSearchParams(location.search);
 let endpoint=null,active=false;
 const local=query.get("teste")==="notebook";
 function valid(v){
  if(typeof v!=="string")return null;
  try{
   const u=new URL(v);
   if(u.username||u.password||u.search||u.hash)return null;
   if(u.protocol!=="https:"&&!(local&&u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname)))return null;
   if(!u.pathname.endsWith("/culto"))return null;
   return u;
  }catch{return null;}
 }
 function player(url){
  if(stage.querySelector("iframe"))return;
  const frame=document.createElement("iframe");
  frame.title="Transmissão da Igreja Ministério Promessas — servidor próprio";
  frame.src=url.origin+url.pathname+"?autoplay=true&muted=false&playsInline=true";
  frame.referrerPolicy="strict-origin-when-cross-origin";
  frame.allow="autoplay; fullscreen; picture-in-picture";
  frame.setAttribute("allowfullscreen","");
  stage.replaceChildren(frame);
  stage.hidden=false;waiting.hidden=true;
  label.textContent=local?"TRANSMISSÃO LOCAL · TESTE":"TRANSMISSÃO DA IGREJA";
  desc.textContent=local?"Você está visualizando o sinal do notebook neste dispositivo. Ainda não existe acesso público.":"Sinal enviado pelo servidor próprio da igreja. O áudio pode exigir um toque inicial.";
  active=true;
 }
 async function check(){
  if(!endpoint)return;
  try{
   const url=new URL(endpoint.toString()+"/index.m3u8");
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),6500);
   const response=await fetch(url,{signal:controller.signal,cache:"no-store"});
   clearTimeout(timer);
   if(response.ok&&(await response.text()).includes("#EXTM3U")){
      if(!active)player(endpoint);
   } else if(active){stage.replaceChildren();stage.hidden=true;waiting.hidden=false;active=false;label.textContent="AGUARDANDO TRANSMISSÃO";}
  }catch(e){
   if(active){stage.replaceChildren();stage.hidden=true;waiting.hidden=false;active=false;label.textContent="AGUARDANDO TRANSMISSÃO";}
  }
 }
 async function boot(){
  if(local){endpoint=valid("http://127.0.0.1:8888/culto");}
  else{
   try{
     const r=await fetch("/culto/stream-config.json",{cache:"no-store"});
     if(!r.ok)return;
     const cfg=await r.json();
     if(cfg.enabled!==true)return;
     endpoint=valid(cfg.hlsPageUrl);
     if(cfg.format==="vertical"||cfg.format==="horizontal")watch.dataset.format=cfg.format;
   }catch(_){return;}
  }
  if(!endpoint)return;
  await check();
  setInterval(check,13000);
 }
 boot();
})();
