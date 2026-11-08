"use strict";
/* Public studio HTML contains NO publisher credentials.
   WHIP sends composed canvas and locally mixed audio to MediaMTX after the 10s countdown.
   When server has only loopback listeners it does NOT make a public stream. */
(()=>{
 const $=id=>document.getElementById(id);
 const pass=$("publish-secret"),endpoint=$("whip-url"),on=$("publish-enabled");
 let peer=null,resource=null,connection=false,attempting=false,stopping=false;
 let keepVideo=null,authHeader="",connectionTimeout=null;
 function report(s){$("publish-status").textContent=s;}
 function badge(s){$("server-badge").textContent=s;}
 function allowedURL(s){
  try{
   const u=new URL(s);
   // HTTP allowed for local testing only. Remote publishing requires HTTPS.
   if(u.protocol!=="https:"&&!(u.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(u.hostname)))return null;
   if(!u.pathname.endsWith("/culto/whip"))return null;
   if(u.username||u.password)return null;
   return u.toString();
  }catch{return null;}
 }
 function auth(){
   const pw=pass.value.trim();
   if(!pw||pw.length<20)throw new Error("Informe a senha privada de publicação no campo acima.");
   // publish password never stored in site, query string or browser localStorage.
   return "Basic "+btoa("promessas:"+pw);
 }
 async function probe(){
  const url=allowedURL(endpoint.value);
  if(!url){report("Endereço inválido. Em rede externa use HTTPS; HTTP é permitido somente em localhost.");return;}
  report("Verificando a conexão com MediaMTX no notebook...");
  try{
   const resp=await fetch(url.replace(/\/culto\/whip$/,"/culto/"),{method:"GET",mode:"cors",cache:"no-store",signal:AbortSignal.timeout(6000)});
   if([200,404].includes(resp.status)){report("Servidor MediaMTX acessível pelo navegador. A autenticação de envio será verificada ao iniciar.");badge("SERVIDOR LOCAL");}
   else report("Servidor respondeu HTTP "+resp.status+". Confira se o MediaMTX está iniciado.");
  }catch(e){report("Não consegui conectar ao notebook: "+(e.name==="TimeoutError"?"tempo esgotado":e.message));badge("SEM CONEXÃO");}
 }
 $("test-server").addEventListener("click",probe);
 on.addEventListener("change",()=>{
  if(!on.checked){stop();return;}
  const scene=$("scene-status")?.textContent||"";
  if(/ABERTURA|CÂMERA|PAUSA/i.test(scene)){start();return;}
  report("Envio habilitado. Preencha a senha e inicie a apresentação para conectar depois dos 10 segundos.");
 });
 $("reconnect-publish").addEventListener("click",async()=>{
  if(!on.checked){report("Primeiro marque 'Enviar o vídeo composto ao servidor do notebook'.");return;}
  if(attempting){report("Conexão em andamento. Aguarde alguns segundos.");return;}
  try{auth();}catch(e){report(e.message);return;}
  await stop();
  await start();
 });
 document.addEventListener("click",ev=>{
  if(ev.target?.id==="start"&&on.checked){
   try{
    if(!allowedURL(endpoint.value))throw new Error("Informe um endereço HTTPS do servidor ou localhost para teste.");
    auth();
   }catch(e){ev.preventDefault();ev.stopImmediatePropagation();report(e.message);}
  }
 },true);
 async function gather(pc,timeout=15000){
  if(pc.iceGatheringState==="complete")return;
  await new Promise((resolve,reject)=>{
   const tm=setTimeout(()=>{pc.removeEventListener("icegatheringstatechange",cb);reject(new Error("ICE demorou além do esperado"));},timeout);
   const cb=()=>{
    if(pc.iceGatheringState==="complete"){clearTimeout(tm);pc.removeEventListener("icegatheringstatechange",cb);resolve();}
   };
   pc.addEventListener("icegatheringstatechange",cb);
  });
 }
 async function start(){
  if(!on.checked||attempting||connection)return;
  const url=allowedURL(endpoint.value);
  if(!url){report("Servidor inválido. Use localhost no notebook, ou HTTPS quando publicar.");return;}
  try{authHeader=auth();}catch(err){report(err.message);return;}
  const canvas=$("program-canvas");
  if(!canvas?.captureStream||!window.RTCPeerConnection){
   report("Seu navegador não suporta captura de canvas e WebRTC para transmitir.");return;
  }
  attempting=true;badge("CONECTANDO");report("Estabelecendo o envio do vídeo composto para MediaMTX no notebook...");
  try{
   const videoTrack=canvas.captureStream(24).getVideoTracks()[0];
   if(!videoTrack)throw new Error("Não foi possível capturar a saída de vídeo.");
   keepVideo=videoTrack;
   const tracks=[videoTrack,...(window.PromessasAudioStream?.getAudioTracks()||[])];
   const stream=new MediaStream(tracks);
   const pc=new RTCPeerConnection({iceServers:[]});
   peer=pc;
   for(const t of tracks)pc.addTrack(t,stream);
   // On modest CPUs, a bounded H.264 bitrate gives consistent 720p without encoder spikes.
   // The MediaMTX fMP4 viewer will buffer three 2-second segments before playback.
   const vsender=pc.getSenders().find(s=>s.track?.kind==="video");
   if(vsender){
     try{
       const params=vsender.getParameters();
       if(!params.encodings?.length)params.encodings=[{}];
       params.encodings[0].maxBitrate=2400000;
       params.encodings[0].maxFramerate=24;
       await vsender.setParameters(params);
     }catch(_){/* Browser chooses safe defaults if sender parameters are unsupported. */}
   }
   // HLS viewers need H264; browser default VP8 cannot be repackaged into HLS by MediaMTX.
   const vcaps=RTCRtpSender.getCapabilities?.("video")?.codecs||[];
   const h264=vcaps.filter(c=>c.mimeType?.toLowerCase()==="video/h264");
   const videoTransceiver=pc.getTransceivers().find(t=>t.sender.track?.kind==="video");
   if(videoTransceiver&&h264.length)videoTransceiver.setCodecPreferences(h264);
   pc.addEventListener("connectionstatechange",()=>{
    if(pc!==peer)return;
    if(pc.connectionState==="connected"){
      connection=true;badge("NO AR · SERVIDOR LOCAL");
      report("✓ Sinal recebido pelo notebook. O site público está conectado por HTTPS. Confira imagem e áudio no celular.");
    } else if(["failed","disconnected"].includes(pc.connectionState)){
      badge("CONEXÃO INTERROMPIDA");
      report("Falha de conexão com MediaMTX. Verifique o notebook. A saída local continua disponível.");
    }
   });
   const offer=await pc.createOffer();
   await pc.setLocalDescription(offer);
   await gather(pc);
   const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/sdp","Authorization":authHeader},body:pc.localDescription.sdp,signal:AbortSignal.timeout(16000)});
   if(!res.ok){
    let detail="";
    try{detail=(await res.text()).slice(0,180);}catch(_){}
    throw new Error("Servidor recusou a publicação (HTTP "+res.status+"). "+(res.status===401?"Senha de publicação incorreta.":detail));
   }
   const where=res.headers.get("Location");
   if(where)resource=new URL(where,url).toString();
   const sdp=await res.text();
   await pc.setRemoteDescription({type:"answer",sdp});
   // Wait for the ICE connection; the status badge confirms real connectivity.
   connectionTimeout=setTimeout(()=>{
    if(!connection&&peer===pc){badge("SEM RECEPÇÃO");report("WHIP aceito, mas os pacotes de vídeo não chegaram. Verifique a rede e o firewall.");}
   },12000);
  }catch(error){
   const detail=String(error?.message||"erro desconhecido");
   const guidance=/HTTP 401|senha de publicação incorreta/i.test(detail)
     ?"Confira a senha privada: copie somente os caracteres após 'Senha de publicação:', sem o título."
     :/HTTP 409|already publishing|already in use|publisher already/i.test(detail)
     ?"Outra sessão já está enviando ao mesmo canal. Encerre a sessão anterior e tente novamente."
     :/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(detail)
     ?"Verifique a extensão de bloqueio do Chrome e a conexão com http://127.0.0.1:8889/culto. Não altere o endereço WHIP."
     :/ICE|timeout|tempo/i.test(detail)
     ?"O navegador demorou para conectar. Verifique câmera, microfone e consumo do notebook."
     :"Leia a mensagem completa abaixo e informe apenas o código do erro, nunca a senha.";
   badge(/HTTP 401|senha de publicação incorreta/i.test(detail)?"SENHA INVÁLIDA":"FALHA NO ENVIO");
   report("Falha ao publicar: "+detail+" "+guidance);
   $("publish-status").scrollIntoView({behavior:"smooth",block:"center"});
   if(peer){peer.close();peer=null;}
   if(keepVideo){keepVideo.stop();keepVideo=null;}
  }finally{attempting=false;}
 }
 async function stop(){
  if(connectionTimeout){clearTimeout(connectionTimeout);connectionTimeout=null;}
  const url=resource;resource=null;
  if(peer){try{peer.close();}catch(_){}peer=null;}
  if(keepVideo){keepVideo.stop();keepVideo=null;}
  connection=false;attempting=false;
  badge("SERVIDOR LOCAL");
  report("Transmissão local encerrada. O sinal no notebook foi fechado.");
  if(url){
   try{await fetch(url,{method:"DELETE",headers:{"Authorization":authHeader},signal:AbortSignal.timeout(3000)});}catch(_){}
  }
  authHeader="";
 }
 window.addEventListener("promessas-scene",e=>{
  const phase=e.detail?.phase;
  if(phase==="intro")start();
  else if(phase==="done"||phase==="waiting")stop();
 });
 window.addEventListener("beforeunload",()=>{
  if(peer){try{peer.close();}catch(_){}}
 });
})();
