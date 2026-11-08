"use strict";
/* CENTRAL DE TRANSMISSÃO — estúdio de ensaio privado NO NAVEGADOR.
   Sem servidor de ingestão/YouTube configurado: NENHUM vídeo é publicado por estes controles.
   A saída do canvas pode ser capturada por um encoder externo autorizado. */
(()=>{
 const $=id=>document.getElementById(id);
 const canvas=$("program-canvas"),ctx=canvas.getContext("2d",{alpha:false});
 const logo=new Image();logo.src="/logo-promessas.svg";
 const vid=document.createElement("video");vid.autoplay=true;vid.muted=true;vid.playsInline=true;
 const music=$("music-bed");
 let format="horizontal",phase="waiting",phaseStart=performance.now(),lastDraw=0;
 let cameraStream=null,camReady=false,recording=null,recordChunks=[],recordStream=null;
 let ac=null,mediaDest=null,musicSource=null,micSource=null,micGain=null;
 let lastUserMessage="",reason="manual",introSeconds=300,outroSeconds=35;
 let tabWasHidden=false,lastStatus="",recordSize=0;
 const church="IGREJA MINISTÉRIO PROMESSAS";
 const motto="Resgatar almas e restaurar famílias";
 const fields={title:$("service-name"),address:$("address")};
 const fonts="Manrope, DM Sans, Arial, sans-serif";
 // Cards informativos renderizados dentro do canvas da apresentação.
 // Texto do operador vai apenas para o Canvas, sem injeção HTML ou envio de dados.
 const cardPresets={
   verse:["PALAVRA DE DEUS","O Senhor é o meu pastor; nada me faltará.","Salmo 23:1"],
   notice:["AVISOS DA IGREJA","Seja bem-vindo! Confira nossa programação de cultos no site e aplicativo.","Igreja Ministério Promessas"],
   prayer:["MOMENTO DE ORAÇÃO","Apresente a Deus seu pedido de oração. Estamos unidos em fé.","Orando por sua família"],
   event:["PRÓXIMO CULTO","Acompanhe os dias e os horários dos próximos cultos em nosso site.","igrejapromessas.site"]
 };
 let cardState={active:false,started:0,until:0,config:null};
 function cardInput(){
   return {
     type:$("card-type").value,
     heading:$("card-heading").value.trim().slice(0,65),
     message:$("card-message").value.trim().slice(0,380),
     reference:$("card-reference").value.trim().slice(0,80),
     position:$("card-position").value,
     style:$("card-style").value,
     duration:Math.max(0,Number($("card-duration").value)||0)
   };
 }
 function cardFeedback(message){$("card-feedback").textContent=message;}
 function updateCardControls(){
   $("card-show").textContent=cardState.active?"✦ Atualizar card na imagem":"✦ Exibir card na imagem";
   $("card-hide").disabled=!cardState.active;
 }
 $("card-type").addEventListener("change",()=>{
   const data=cardPresets[$("card-type").value]||cardPresets.verse;
   $("card-heading").value=data[0];$("card-message").value=data[1];$("card-reference").value=data[2];
   cardFeedback("Modelo preparado. Edite o conteúdo e clique em Exibir card.");
 });
 $("card-show").addEventListener("click",()=>{
   const config=cardInput();
   if(!config.heading&&!config.message){
     cardFeedback("Digite um título ou uma mensagem para exibir.");
     $("card-message").focus();return;
   }
   cardState={active:true,started:phase==="intro"||phase==="countdown"?0:performance.now(),until:0,config};
   if(cardState.started&&config.duration>0)cardState.until=cardState.started+config.duration*1000;
   cardFeedback(phase==="waiting"?"Card visível no monitor de ensaio. Ele também aparecerá na cena da câmera.":phase==="live"?"Card inserido na imagem da câmera, com animação suave.":"Card preparado. Ele aparecerá na câmera depois da abertura.");
   updateCardControls();
 });
 $("card-hide").addEventListener("click",()=>{
   cardState.active=false;
   cardFeedback("Card ocultado. A imagem voltou sem essa informação.");
   updateCardControls();
 });
 const cardThemes={
   gold:{bg:"rgba(13,20,32,.91)",line:"#e5c18a",title:"#f4d79c",body:"#fff7e9",small:"#dfc4a0"},
   purple:{bg:"rgba(30,19,58,.93)",line:"#cba4ff",title:"#d8bdff",body:"#fffaff",small:"#d7c6ee"},
   blue:{bg:"rgba(10,34,60,.93)",line:"#7fc6f4",title:"#abdfff",body:"#f7fbff",small:"#bbdaed"}
 };
 function clampCanvasText(value,maxWidth){
   let str=String(value||"");
   if(ctx.measureText(str).width<=maxWidth)return str;
   while(str.length>1 && ctx.measureText(str+"…").width>maxWidth)str=str.slice(0,-1);
   return str+"…";
 }
 function cardLines(value,maxWidth,maxLines){
   const words=String(value||"").replace(/\s+/g," ").trim().split(" ").filter(Boolean);
   const lines=[];let line="";
   for(let i=0;i<words.length;i++){
     const candidate=line?line+" "+words[i]:words[i];
     if(ctx.measureText(candidate).width<=maxWidth){line=candidate;continue;}
     if(line){lines.push(line);line="";}
     if(lines.length>=maxLines){
       lines[maxLines-1]=clampCanvasText(lines[maxLines-1]+" "+words.slice(i).join(" "),maxWidth);
       return lines;
     }
     line=clampCanvasText(words[i],maxWidth);
   }
   if(line&&lines.length<maxLines)lines.push(line);
   return lines;
 }
 function drawInformationCard(now){
   if(!cardState.active||!cardState.config)return;
   if(cardState.started===0){
     cardState.started=now;
     if(cardState.config.duration>0)cardState.until=now+cardState.config.duration*1000;
   }
   const elapsed=Math.max(0,(now-cardState.started)/1000);
   if(cardState.until&&now>=cardState.until){
     cardState.active=false;updateCardControls();
     cardFeedback("O tempo de exibição terminou. Você pode mostrar esse card novamente.");
     return;
   }
   const c=cardState.config,palette=cardThemes[c.style]||cardThemes.gold;
   const v=format==="vertical",w=canvas.width,h=canvas.height;
   const bw=w*(v?.90:.86),bx=(w-bw)/2;
   const padding=v?24:30;
   const titleFont=v?20:19;
   const bodyFont=v?28:30;
   const subFont=v?17:18;
   const contentWidth=bw-2*padding-14;
   ctx.save();
   ctx.font="700 "+bodyFont+"px "+fonts;
   const lines=cardLines(c.message,contentWidth,v?4:3);
   const lineHeight=bodyFont*1.33;
   const showTitle=!!c.heading,showReference=!!c.reference;
   const height=padding+(showTitle?titleFont+21:0)+(lines.length?lines.length*lineHeight:0)+(showReference?subFont+23:0)+padding;
   let y;
   if(c.position==="upper")y=h*(v?.165:.18);
   else if(c.position==="middle")y=h*.48-height/2;
   else y=h*(v?.755:.775)-height; // Above the fixed church lower-third.
   y=Math.max(h*.11,Math.min(y,h-height-h*.12));
   const opacity=Math.min(1,elapsed/.5,cardState.until?Math.max(0,(cardState.until-now)/480):1);
   ctx.globalAlpha=opacity;
   ctx.shadowColor="rgba(0,0,0,.42)";ctx.shadowBlur=24;ctx.shadowOffsetY=10;
   roundRect(bx,y,bw,height,Math.min(22,w*.024),palette.bg);
   ctx.shadowColor="transparent";ctx.shadowBlur=0;ctx.shadowOffsetY=0;
   roundRect(bx,y,Math.max(6,w*.006),height,4,palette.line);
   let cursor=y+padding;
   if(showTitle){
     ctx.font="800 "+titleFont+"px "+fonts;
     text(clampCanvasText(c.heading.toUpperCase(),contentWidth-65),bx+padding,cursor+titleFont*.45,titleFont,palette.title,800,"left");
     if(logo.complete&&logo.naturalWidth>0){
       const iconSize=v?37:42;
       ctx.drawImage(logo,bx+bw-padding-iconSize,cursor-11,iconSize,iconSize);
     }
     cursor+=titleFont+21;
   }
   for(const line of lines){
     text(line,bx+padding,cursor+bodyFont*.5,bodyFont,palette.body,700,"left",contentWidth);
     cursor+=lineHeight;
   }
   if(showReference){
     cursor+=8;
     ctx.font="700 "+subFont+"px "+fonts;
     text(clampCanvasText(c.reference,contentWidth),bx+padding,cursor+subFont*.4,subFont,palette.small,700,"left");
   }
   ctx.restore();
 }

 const transitions={countdown:"PREPARAÇÃO",intro:"ABERTURA",live:"CÂMERA",paused:"PAUSA",outro:"ENCERRAMENTO",waiting:"EM ESPERA",done:"FINALIZADO"};
 const phrases=[
   ["SEJA BEM-VINDO","À IGREJA MINISTÉRIO PROMESSAS"],
   ["UMA NOITE DE FÉ","EM COMUNHÃO COM SUA FAMÍLIA"],
   ["RESGATAR ALMAS","E RESTAURAR FAMÍLIAS"],
   ["PREPARE O CORAÇÃO","NOSSO CULTO COMEÇA EM INSTANTES"],
   ["O AMOR DE DEUS","NOS REÚNE AQUI"],
   ["É TEMPO DE ADORAR","O CULTO ESTÁ QUASE COMEÇANDO"]
 ];
 const outroPhrases=[
   ["OBRIGADO PELA SUA PRESENÇA","QUE DEUS ABENÇOE VOCÊ E SUA FAMÍLIA"],
   ["VOLTE SEMPRE","ESPERAMOS VOCÊ NO PRÓXIMO CULTO"],
   ["FIQUE COM A GENTE","IGREJAPROMESSAS.SITE"],
   ["LEVE A IGREJA COM VOCÊ","BAIXE NOSSO APLICATIVO NO SITE"]
 ];
 function safeStored(key,fallback){
   try{return localStorage.getItem("culto."+key)||fallback;}catch{return fallback;}
 }
 fields.title.value=safeStored("title",fields.title.value);
 fields.address.value=safeStored("address",fields.address.value);
 function saveSettings(){
   try{localStorage.setItem("culto.title",fields.title.value);localStorage.setItem("culto.address",fields.address.value);localStorage.setItem("culto.format",format);}catch(_){}
 }
 fields.title.addEventListener("input",saveSettings);
 fields.address.addEventListener("input",saveSettings);
 function status(s){lastStatus=s;$("stream-notice").textContent=s;}
 function setPhase(p){
   phase=p;phaseStart=performance.now();
   if(p==="outro"||p==="done"){cardState.active=false;updateCardControls();}
   if(p==="live"&&cardState.active&&cardState.started===0){
     cardState.started=performance.now();
     if(cardState.config?.duration>0)cardState.until=cardState.started+cardState.config.duration*1000;
   }
   $("scene-status").textContent=transitions[p]||"EM ESPERA";
   $("current-scene").textContent="Cena: "+(transitions[p]||"Em espera");
   $("studio-badge").textContent="● ENSAIO LOCAL · "+(transitions[p]||"EM ESPERA");
   $("cancel").hidden=p!=="countdown";
   $("skip-intro").hidden=p!=="intro"||!$("test-mode").checked;
   $("skip-outro").hidden=p!=="outro"||!$("test-mode").checked;
   $("start").hidden=!["waiting","done"].includes(p);
   $("start").textContent=p==="done"?"↻ Iniciar novo ensaio":"▶ Iniciar apresentação";
   $("pause").disabled=p!=="live";
   $("pause").hidden=p==="paused";
   $("resume").hidden=p!=="paused";
   $("end").disabled=!["live","paused","intro"].includes(p);
   $("end").hidden=p==="outro";
   if(micGain)micGain.gain.value=(p==="live")?1:0;
   if(p==="intro"||p==="outro")musicOn();
   else musicOff();
   window.dispatchEvent(new CustomEvent("promessas-scene",{detail:{phase:p}}));
   const messages={
    waiting:"Pronto para preparar a câmera. Nenhum vídeo será enviado para a internet.",
    countdown:"Contagem regressiva de 10 segundos em andamento. Você ainda pode cancelar.",
    intro:"Abertura original iniciada. A câmera entrará após a contagem de 5 minutos.",
    live:"Câmera no monitor de programação. Para o público assistir, é necessário um encoder/transmissão conectado.",
    paused:"Imagem de pausa no monitor de programação. A câmera está oculta da saída.",
    outro:"Créditos de encerramento no ar. A câmera já saiu da apresentação.",
    done:"Apresentação encerrada com a tela final. Nenhuma transmissão foi enviada à internet."
   };
   status(messages[p]||"");
   updateIndicator();
 }
 function updateIndicator(){
   const elapsed=(performance.now()-phaseStart)/1000;
   let label="00:00";
   const mmss=secs=>String(Math.floor(Math.max(0,secs)/60)).padStart(2,"0")+":"+String(Math.floor(Math.max(0,secs)%60)).padStart(2,"0");
   if(phase==="countdown")label="PREPARANDO "+String(Math.max(0,Math.ceil(10-elapsed)))+"s";
   if(phase==="intro")label="CULTO EM "+mmss(introSeconds-elapsed);
   if(phase==="outro")label="CRÉDITOS "+mmss(outroSeconds-elapsed);
   if(phase==="live"||phase==="paused")label=mmss(elapsed);
   $("timer-label").textContent=label;
 }
 function setFormat(name){
   if(phase!=="waiting"&&phase!=="done")return;
   format=name==="vertical"?"vertical":"horizontal";
   $("preview-box").dataset.format=format;
   canvas.width=format==="vertical"?720:1280;
   canvas.height=format==="vertical"?1280:720;
   $("format-label").textContent=format==="vertical"?"9:16 • Vertical":"16:9 • Horizontal";
   for(const b of document.querySelectorAll(".format-option")){
     const yes=b.dataset.format===format;
     b.classList.toggle("selected",yes);
     b.setAttribute("aria-pressed",String(yes));
   }
   $("viewer-layout").value="auto";
   saveSettings();
 }
 for(const b of document.querySelectorAll(".format-option"))b.addEventListener("click",()=>setFormat(b.dataset.format));
 setFormat(safeStored("format","horizontal"));
 function timeSince(){return Math.max(0,(performance.now()-phaseStart)/1000);}
 async function prepareCamera(){
   if(camReady&&cameraStream&&cameraStream.getVideoTracks().some(t=>t.readyState==="live"))return true;
   if(!navigator.mediaDevices?.getUserMedia){
     $("camera-note").textContent="Este navegador não oferece acesso à câmera. Use Chrome/Edge atualizado em HTTPS ou localhost.";
     return false;
   }
   $("prepare-camera").disabled=true;
   $("camera-note").textContent="Aguardando permissão para câmera e microfone…";
   try{
     const mobile=/Android|iPhone|iPad/i.test(navigator.userAgent);
     const constraints={
       audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
       video:{facingMode:mobile?"environment":"user",width:{ideal:format==="horizontal"?1280:720},height:{ideal:format==="horizontal"?720:1280},frameRate:{ideal:24,max:30}}
     };
     const stream=await navigator.mediaDevices.getUserMedia(constraints);
     cameraStream=stream;vid.srcObject=stream;vid.muted=true;
     await vid.play();
     camReady=true;
     for(const track of stream.getVideoTracks()){
       track.addEventListener("ended",()=>{camReady=false;if(phase==="live"){reason="camera";setPhase("paused");}});
       track.addEventListener("mute",()=>{if(phase==="live"){reason="camera";setPhase("paused");}});
     }
     $("camera-note").textContent="✓ Câmera e microfone autorizados. Vídeo usado somente nesta prévia local.";
     return true;
   }catch(error){
     const kind=error?.name||"";
     $("camera-note").textContent=kind==="NotAllowedError"?"Permissão recusada. Libere câmera e microfone nas configurações do navegador.":"Não foi possível preparar a câmera: "+kind;
     return false;
   }finally{$("prepare-camera").disabled=false;}
 }
 $("prepare-camera").addEventListener("click",prepareCamera);
 async function audioSetup(){
   // Composition audio for local rehearsal only. Microphone is never looped to speakers.
   if(ac)return;
   const AudioCtx=window.AudioContext||window.webkitAudioContext;
   if(!AudioCtx)return;
   try{
     ac=new AudioCtx();mediaDest=ac.createMediaStreamDestination();
     window.PromessasAudioStream=mediaDest.stream;
     musicSource=ac.createMediaElementSource(music);
     const gain=ac.createGain();gain.gain.value=.31;
     musicSource.connect(gain);gain.connect(ac.destination);gain.connect(mediaDest);
     if(cameraStream?.getAudioTracks().length){
       micSource=ac.createMediaStreamSource(cameraStream);
       micGain=ac.createGain();micGain.gain.value=0;
       micSource.connect(micGain);micGain.connect(mediaDest);
     }
   }catch(err){$("record-status").textContent="Áudio de gravação indisponível";}
 }
 async function musicOn(){
   if(!music)return;
   try{
     await audioSetup();
     if(ac?.state==="suspended")await ac.resume();
     music.volume=ac?.state==="running"?1:.30;
     await music.play();
   }catch(e){$("record-status").textContent="Música bloqueada pelo navegador. Toque na página para ativá-la.";}
 }
 function musicOff(){if(music){music.pause();}}
 async function start(){
   if(!["waiting","done"].includes(phase))return;
   if(!(await prepareCamera())){
     status("Prepare a câmera e o microfone antes de iniciar. A prévia permanece local.");
     return;
   }
   introSeconds=$("test-mode").checked?15:300;
   outroSeconds=$("test-mode").checked?12:35;
   await audioSetup();
   if(ac?.state==="suspended")await ac.resume().catch(()=>{});
   setPhase("countdown");
 }
 $("start").addEventListener("click",start);
 $("cancel").addEventListener("click",()=>{if(phase==="countdown")setPhase("waiting");});
 $("skip-intro").addEventListener("click",()=>{if(phase==="intro"&&$("test-mode").checked)setPhase("live");});
 $("pause").addEventListener("click",()=>{if(phase==="live"){reason="manual";setPhase("paused");}});
 $("resume").addEventListener("click",()=>{if(phase==="paused"){reason="manual";setPhase("live");}});
 $("end").addEventListener("click",()=>{if(["live","paused","intro"].includes(phase))setPhase("outro");});
 $("skip-outro").addEventListener("click",()=>{if(phase==="outro"&&$("test-mode").checked)setPhase("done");});
 window.addEventListener("offline",()=>{if(phase==="live"){reason="connection";setPhase("paused");}});
 window.addEventListener("online",()=>{if(phase==="paused"&&reason==="connection"){status("Conexão do dispositivo restaurada. Confira a imagem e toque em Retomar.");}});
 document.addEventListener("visibilitychange",()=>{tabWasHidden=document.hidden;if(!document.hidden&&phase==="countdown")phaseStart=performance.now()-(Math.min(9.8,timeSince())*1000);});
 function roundRect(x,y,w,h,r,fill){
   ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
 }
 function text(s,x,y,size,color="#fff",weight=700,align="center",limit=null){
   ctx.save();ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline="middle";
   ctx.font=weight+" "+Math.floor(size)+"px "+fonts;
   if(limit)ctx.fillText(s,x,y,limit);else ctx.fillText(s,x,y);
   ctx.restore();
 }
 function logoAt(cx,cy,size,alpha=1){
   ctx.save();ctx.globalAlpha=alpha;
   ctx.beginPath();ctx.arc(cx,cy,size*.61,0,Math.PI*2);
   ctx.fillStyle="#111823ba";ctx.fill();
   ctx.lineWidth=size*.013;ctx.strokeStyle="#e8c897a1";ctx.stroke();
   if(logo.complete&&logo.naturalWidth>0)ctx.drawImage(logo,cx-size*.46,cy-size*.46,size*.92,size*.92);
   else text("✦",cx,cy,size*.55,"#f1d49e");
   ctx.restore();
 }
 function background(t,kind="normal"){
   const w=canvas.width,h=canvas.height;
   const grad=ctx.createLinearGradient(0,0,w,h);
   if(kind==="pause"){grad.addColorStop(0,"#101722");grad.addColorStop(1,"#0b1119");}
   else {grad.addColorStop(0,"#080e17");grad.addColorStop(.50,"#141b2a");grad.addColorStop(1,"#1e1820");}
   ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
   const glow=ctx.createRadialGradient(w*.67,h*.22,0,w*.59,h*.28,w*.74);
   glow.addColorStop(0,"#c3a06532");glow.addColorStop(1,"#c3a06500");
   ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
   ctx.save();
   ctx.translate(w*.52,h*.50);ctx.rotate(t*.01);
   for(let i=0;i<5;i++){
     ctx.beginPath();ctx.ellipse(0,0,w*(.37+i*.09),h*(.31+i*.11),i*.035,0,Math.PI*2);
     ctx.strokeStyle="rgba(234,194,125,"+(.18/(i+1))+")";ctx.lineWidth=2;ctx.stroke();
   }
   ctx.restore();
   for(let i=0;i<42;i++){
     const x=(Math.sin(i*78.93)*43758.5453%1+1)%1*w;
     const y=(Math.sin(i*27.73)*12017.992%1+1)%1*h;
     const flicker=.3+.25*Math.sin(t*1.1+i*.9);
     ctx.fillStyle="rgba(241,207,155,"+flicker+")";
     ctx.beginPath();ctx.arc(x,y,Math.max(1,w*.0013),0,Math.PI*2);ctx.fill();
   }
   const fade=ctx.createLinearGradient(0,h*.76,0,h);
   fade.addColorStop(0,"#0b0e1600");fade.addColorStop(1,"#0b0e16bb");
   ctx.fillStyle=fade;ctx.fillRect(0,h*.72,w,h*.28);
 }
 function topMark(){
   const w=canvas.width,h=canvas.height,v=format==="vertical";
   text(church,w/2,h*(v?.095:.105),v?22:24,"#e8d0a7",800,"center",w*.91);
   text("TRANSMISSÃO DE CULTOS",w/2,h*(v?.126:.144),v?13:14,"#c2a57e",600,"center",w*.9);
 }
 function progress(x,y,r,ratio){
   ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);
   ctx.lineWidth=Math.max(6,r*.075);ctx.strokeStyle="#d8c09426";ctx.stroke();
   ctx.beginPath();ctx.arc(x,y,r,-Math.PI/2,-Math.PI/2+2*Math.PI*Math.max(0,Math.min(1,ratio)));
   ctx.lineCap="round";ctx.strokeStyle="#eec88d";ctx.stroke();
 }
 function drawWaiting(t){
   const w=canvas.width,h=canvas.height,v=format==="vertical";
   background(t);topMark();
   logoAt(w/2,h*(v?.36:.37),Math.min(w*.27,h*.25));
   text("CENTRAL DE TRANSMISSÃO",w/2,h*(v?.57:.65),v?28:42,"#fff4df",800,"center",w*.95);
   text("Prévia local • aguarde a abertura",w/2,h*(v?.62:.72),v?18:23,"#d8bf95",600,"center",w*.91);
   text(motto,w/2,h*(v?.81:.85),v?17:21,"#b2a99c",600,"center",w*.91);
 }
 function drawCountdown(t){
   const w=canvas.width,h=canvas.height,v=format==="vertical";
   background(t);topMark();
   const n=Math.max(1,Math.ceil(10-t)),cy=h*(v?.47:.49),r=Math.min(w,h)*(v?.23:.27);
   progress(w/2,cy,r,t/10);
   text(String(n),w/2,cy,Math.min(w*.27,h*.27),"#fff4df",800);
   text("A APRESENTAÇÃO COMEÇA EM",w/2,cy-r-50,v?20:25,"#e0c18e",800,"center",w*.88);
   text("Toque em cancelar para interromper",w/2,cy+r+43,v?17:19,"#dfd9cf",500,"center",w*.90);
   text(motto,w/2,h*.89,v?16:20,"#b3a99b",600,"center",w*.90);
 }
 function drawIntro(t){
   const w=canvas.width,h=canvas.height,v=format==="vertical";
   background(t);topMark();
   const idx=Math.floor(t/Math.max(3,introSeconds/6))%phrases.length;
   const phrase=phrases[idx];
   const top=h*(v?.29:.31);
   logoAt(w/2,top,Math.min(w*.24,h*.23));
   const scale=v?.68:1;
   text(phrase[0],w/2,h*(v?.51:.60),Math.min(w*.075,53)*scale,"#fff1d5",800,"center",w*.91);
   text(phrase[1],w/2,h*(v?.566:.70),Math.min(w*.047,30)*scale,"#edc78e",700,"center",w*.89);
   const remain=Math.max(0,Math.ceil(introSeconds-t));
   const mm=String(Math.floor(remain/60)).padStart(2,"0"),ss=String(remain%60).padStart(2,"0");
   text("O CULTO COMEÇA EM",w/2,h*(v?.75:.83),v?19:19,"#d7d0c5",700,"center",w*.88);
   text(mm+":"+ss,w/2,h*(v?.804:.90),v?51:36,"#f6d8a1",800);
   const barW=w*.58;roundRect((w-barW)/2,h*.951,barW,Math.max(4,h*.006),8,"#c6ab7945");
   roundRect((w-barW)/2,h*.951,barW*Math.min(1,t/introSeconds),Math.max(4,h*.006),8,"#e8c486");
 }
 function drawCamera(t){
   const w=canvas.width,h=canvas.height,v=format==="vertical";
   if(vid.readyState>=2&&vid.videoWidth){
     const sw=vid.videoWidth,sh=vid.videoHeight,scale=Math.max(w/sw,h/sh);
     const cw=w/scale,ch=h/scale;
     ctx.drawImage(vid,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,w,h);
   }else{background(t,"pause");text("A câmera está preparando a imagem…",w/2,h/2,v?22:27,"#d9c194",600);}
   const grad=ctx.createLinearGradient(0,h*.65,0,h);
   grad.addColorStop(0,"rgba(10,15,24,0)");grad.addColorStop(1,"rgba(5,10,17,.94)");
   ctx.fillStyle=grad;ctx.fillRect(0,h*.63,w,h*.37);
   const badgeW=v?170:145;roundRect(w-badgeW-25,25,badgeW,38,12,"#6c1e27df");
   text("● EM PRODUÇÃO",w-badgeW/2-25,44,v?15:14,"#fff7f2",800);
   const bottom=h*(v?.86:.845);
   const bx=w*(v?.045:.065),by=bottom-h*(v?.055:.035);
   const bandW=w*(v?.91:.86),bandH=h*(v?.13:.14);
   roundRect(bx,by,bandW,bandH,Math.min(26,w*.021),"rgba(11,16,26,.86)");
   roundRect(bx,by,Math.max(5,w*.006),bandH,4,"#e2b56a");
   const logoS=v?66:72,logoX=bx+(v?45:68),logoY=by+bandH/2;
   if(logo.complete&&logo.naturalWidth)ctx.drawImage(logo,logoX-logoS*.45,logoY-logoS*.45,logoS*.9,logoS*.9);
   const tx=logoX+logoS*.78;
   text(fields.title.value.trim()||"Culto da Família",tx,by+bandH*.36,v?29:40,"#fff0d6",800,"left",bandW-(tx-bx)-22);
   text(fields.address.value.replace(/[\r\n]+/g," ").trim(),tx,by+bandH*.73,v?16:19,"#c8bcab",600,"left",bandW-(tx-bx)-17);
   text(church,w*.04,h*.06,v?15:18,"#ffffff",800,"left",w*.73);
 }
 function drawPause(t){
   const w=canvas.width,h=canvas.height,v=format==="vertical";
   background(t,"pause");topMark();
   logoAt(w/2,h*(v?.39:.39),Math.min(w*.28,h*.29));
   const heading=reason==="connection"?"A CONEXÃO FOI INTERROMPIDA":reason==="camera"?"AJUSTANDO NOSSA CÂMERA":"UM INSTANTE, POR FAVOR";
   text(heading,w/2,h*(v?.59:.64),v?30:43,"#f7ddb0",800,"center",w*.91);
   text("Já estamos resolvendo. Voltamos em instantes.",w/2,h*(v?.66:.73),v?18:24,"#e6e0d4",600,"center",w*.91);
   text("Agradecemos sua compreensão.",w/2,h*(v?.83:.88),v?16:19,"#ada9a1",500,"center",w*.9);
 }
 function drawOutro(t){
   const w=canvas.width,h=canvas.height,v=format==="vertical";
   background(t);topMark();
   const k=Math.min(outroPhrases.length-1,Math.floor(t/(outroSeconds/outroPhrases.length)));
   const [head,sub]=outroPhrases[k];
   logoAt(w/2,h*(v?.31:.30),Math.min(w*.24,h*.23));
   text(head,w/2,h*(v?.51:.60),v?34:48,"#fff0d1",800,"center",w*.89);
   text(sub,w/2,h*(v?.59:.71),v?20:27,"#e9c58e",700,"center",w*.9);
   text("Rua Pascoal de Souza Lima, 507 • Santa Terezinha",w/2,h*(v?.77:.84),v?15:20,"#cbc3b5",600,"center",w*.91);
   text("Governador Valadares • MG",w/2,h*(v?.80:.89),v?15:17,"#b5afa5",500,"center",w*.90);
   text("SITE • IGREJAPROMESSAS.SITE      APP • IGREJAPROMESSAS.SITE/APP",w/2,h*.94,v?13:16,"#e8cb9c",700,"center",w*.96);
 }
 function drawDone(t){
   const w=canvas.width,h=canvas.height,v=format==="vertical";
   background(t);logoAt(w/2,h*.40,Math.min(w*.23,h*.24));
   text("ATÉ O PRÓXIMO CULTO",w/2,h*(v?.58:.65),v?36:49,"#f1d4a5",800,"center",w*.9);
   text(motto,w/2,h*(v?.66:.75),v?19:25,"#d4c0a2",600,"center",w*.9);
   text("igrejapromessas.site",w/2,h*.89,v?19:20,"#e0dacd",600);
 }
 function render(now){
   requestAnimationFrame(render);
   if(now-lastDraw<33)return;
   lastDraw=now;
   let t=timeSince();
   if(phase==="countdown"&&t>=10){setPhase("intro");t=0;}
   if(phase==="intro"&&t>=introSeconds){setPhase("live");t=0;}
   if(phase==="outro"&&t>=outroSeconds){setPhase("done");t=0;if(cameraStream){for(const tr of cameraStream.getTracks())tr.stop();cameraStream=null;camReady=false;}}
   if(phase==="waiting")drawWaiting(now/1000);
   else if(phase==="countdown")drawCountdown(t);
   else if(phase==="intro")drawIntro(t);
   else if(phase==="live")drawCamera(t);
   else if(phase==="paused")drawPause(t);
   else if(phase==="outro")drawOutro(t);
   else drawDone(t);
   if((phase==="live"||phase==="waiting")&&cardState.active)drawInformationCard(now);
   // Short crossfade at every scene change, avoid abrupt cut. Program output remains full-frame.
   const elapsed=timeSince(),fade=Math.max(0,1-elapsed/.65);
   if(fade>0){
     ctx.fillStyle="rgba(4,8,15,"+(fade*.78)+")";
     ctx.fillRect(0,0,canvas.width,canvas.height);
   }
   updateIndicator();
 }
 logo.onload=()=>{$("preview-loading").hidden=true;};
 logo.onerror=()=>{$("preview-loading").hidden=true;};
 requestAnimationFrame(render);
 setTimeout(()=>{$("preview-loading").hidden=true;},1200);

 $("fullscreen").addEventListener("click",async()=>{
   try{if(document.fullscreenElement)await document.exitFullscreen();
   else await canvas.requestFullscreen();}
   catch(e){status("Não foi possível ativar tela cheia neste navegador.");}
 });
 async function beginRecord(){
   if(recording&&recording.state==="recording")return;
   if(typeof canvas.captureStream!=="function"||typeof MediaRecorder==="undefined"){
     $("record-status").textContent="Gravação do navegador indisponível neste aparelho.";return;
   }
   try{
     await audioSetup();
     const vstream=canvas.captureStream(24);
     recordStream=new MediaStream([...vstream.getVideoTracks(),...(mediaDest?.stream.getAudioTracks()||[])]);
     const candidates=["video/webm;codecs=vp8,opus","video/webm","video/mp4"];
     const mime=candidates.find(x=>MediaRecorder.isTypeSupported(x));
     if(!mime){$("record-status").textContent="Formato de gravação não suportado.";return;}
     recording=new MediaRecorder(recordStream,{mimeType:mime,videoBitsPerSecond:2600000});
     recordChunks=[];recordSize=0;
     recording.ondataavailable=e=>{
       if(e.data.size){recordSize+=e.data.size;recordChunks.push(e.data);}
       if(recordSize>250*1024*1024&&recording.state==="recording"){
         status("Gravação local chegou a 250 MB; salvando o trecho para proteger a memória.");
         recording.stop();
       }
     };
     recording.onstop=()=>{
       const blob=new Blob(recordChunks,{type:recording.mimeType});
       const ext=recording.mimeType.startsWith("video/mp4")?"mp4":"webm";
       if(blob.size>1000){
         const url=URL.createObjectURL(blob),a=document.createElement("a");
         a.href=url;a.download="igreja-promessas-ensaio-"+new Date().toISOString().slice(0,10)+"."+ext;
         document.body.appendChild(a);a.click();a.remove();
         setTimeout(()=>URL.revokeObjectURL(url),45000);
         $("record-status").textContent="✓ Prévia salva no dispositivo ("+(blob.size/1024/1024).toFixed(1)+" MB)";
       }else $("record-status").textContent="Gravação curta demais.";
       recordStream?.getVideoTracks().forEach(t=>t.stop());
       recordStream=null;recordChunks=[];$("stop-clip").hidden=true;$("save-clip").hidden=false;
     };
     recording.start(1000);
     $("save-clip").hidden=true;$("stop-clip").hidden=false;
     $("record-status").textContent="● Gravando prévia local — não é transmissão";
   }catch(error){$("record-status").textContent="Não foi possível gravar: "+(error?.name||"erro");}
 }
 $("save-clip").addEventListener("click",beginRecord);
 $("stop-clip").addEventListener("click",()=>{
   if(recording&&recording.state==="recording")recording.stop();
 });
 window.addEventListener("beforeunload",()=>{
   musicOff();
   if(cameraStream)cameraStream.getTracks().forEach(t=>t.stop());
 });
})();
