"use strict";
/* CENTRAL DE TRANSMISSÃO — estúdio de ensaio privado NO NAVEGADOR.
   Sem servidor de ingestão/YouTube configurado: NENHUM vídeo é publicado por estes controles.
   A saída do canvas pode ser capturada por um encoder externo autorizado. */
(()=>{
 const $=id=>document.getElementById(id);
 const canvas=$("program-canvas"),ctx=canvas.getContext("2d",{alpha:false});
 const logo=new Image();logo.src="/logo-promessas.svg";
  const vid=document.createElement("video");vid.autoplay=true;vid.muted=true;vid.playsInline=true;
  const displayVid=document.createElement("video");displayVid.autoplay=true;displayVid.muted=true;displayVid.playsInline=true;
  let displayStream=null,activeSource="camera",displayAudioSource=null,displayAudioGain=null;
  let lowerThirdMode="service",lowerThirdPrevious="service",lowerThirdSwitchedAt=0;
  const transitionDuration=950;
  let chosenMessageMode="lower";
  function playPromessasSound(){
    // Original discreet 0.65s signature; fully silent unless the operator opts in.
    if(!$("card-sound")?.checked||phase!=="live"||!ac)return;
    try{
      if(ac.state==="suspended")return;
      const startAt=ac.currentTime+.015;
      const master=ac.createGain();
      master.gain.setValueAtTime(.0001,startAt);
      master.gain.exponentialRampToValueAtTime(.045,startAt+.10);
      master.gain.exponentialRampToValueAtTime(.0001,startAt+.73);
      master.connect(ac.destination);
      if(mediaDest)master.connect(mediaDest);
      [392,493.88,587.33].forEach((hz,i)=>{
        const osc=ac.createOscillator(),gain=ac.createGain();
        osc.type="sine";
        osc.frequency.setValueAtTime(hz,startAt);
        osc.frequency.exponentialRampToValueAtTime(hz*1.012,startAt+.55);
        gain.gain.value=[.47,.23,.16][i];
        osc.connect(gain);gain.connect(master);
        osc.start(startAt+i*.045);osc.stop(startAt+.73);
      });
      setTimeout(()=>{try{master.disconnect();}catch(_){}},1100);
    }catch(_){}
  }
  function selectMessageMode(mode){
    const isAnimatedPix=$("card-type").value==="pix_animation";
    chosenMessageMode=mode==="full"?"full":mode==="mini"&&isAnimatedPix?"mini":"lower";
    document.querySelectorAll(".message-mode").forEach(b=>{
      const selected=b.dataset.mode===chosenMessageMode;
      b.classList.toggle("selected",selected);
      b.setAttribute("aria-pressed",String(selected));
    });
    cardFeedback(chosenMessageMode==="mini"
      ?"Animação pequena selecionada: QR Code fixo e tutorial em cinco passos, com repetição suave. O botão mostrado no vídeo é ilustrativo."
      :chosenMessageMode==="full"
        ?"Tela completa selecionada. A transição de ida e volta será automática."
        :"Tarja inferior selecionada. A identificação do culto será substituída temporariamente.");
  }
  document.querySelectorAll(".message-mode").forEach(b=>b.addEventListener("click",()=>selectMessageMode(b.dataset.mode)));
  function updatePixAnimationOption(){
    const animation=$("card-type").value==="pix_animation";
    $("card-mode-mini").hidden=!animation;
    $("pix-animation-help").hidden=!animation;
    document.querySelector(".message-mode-picker").classList.toggle("has-mini",animation);
    if(!animation&&chosenMessageMode==="mini")selectMessageMode("lower");
  }
 const music=$("music-bed");
 const introMotion=document.createElement("video");
 introMotion.src="/culto/assets/contagem-cinematica-licenca-igreja.mp4";
 introMotion.muted=true;
 introMotion.playsInline=true;
 introMotion.loop=true;
 introMotion.preload="none";
 introMotion.crossOrigin="anonymous";
 // Abertura R5 e encerramento R5: video e voz/musica embutidos.
 // Audio dos videos e capturado no mesmo MediaStream da transmissao via Web Audio.
 const openingFilm=document.createElement("video");
 const endingFilm=document.createElement("video");
 for(const [film,src] of [
   [openingFilm,"/culto/assets/abertura-promessas-300s-R5.mp4"],
   [endingFilm,"/culto/assets/encerramento-promessas-120s-R5.mp4"]
 ]){
   film.src=src;film.preload="auto";film.playsInline=true;
   film.crossOrigin="anonymous";film.muted=false;film.volume=1;
 }
 const finalCard=new Image();
 finalCard.src="/culto/assets/tela-final-promessas-R5.png";
 function pauseFilms(){
   openingFilm.pause();endingFilm.pause();
 }
 function startFilm(film){
   pauseFilms();
   try{film.currentTime=0;}catch(_){}
   film.play().catch(e=>{
     $("record-status").textContent="Falha ao iniciar audio/video R5: "+(e?.name||"bloqueado");
     status("O video com som nao iniciou. Toque no estúdio e tente novamente.");
   });
 }
 let format="horizontal",phase="waiting",phaseStart=performance.now(),lastDraw=0;
 let cameraStream=null,camReady=false,recording=null,recordChunks=[],recordStream=null;
 let ac=null,mediaDest=null,musicSource=null,micSource=null,micGain=null;
 let filmMonitorGain=null;
 let filmMonitorEnabled=true; // Ao começar o ensaio, o operador deve ouvir os videos R5.
 function updateMonitorButton(){
   const btn=$("monitor-audio");
   if(!btn)return;
   btn.textContent=filmMonitorEnabled?"🔊 Som dos vídeos: ligado":"🔇 Som dos vídeos: desligado";
   btn.setAttribute("aria-pressed",String(filmMonitorEnabled));
   if(filmMonitorGain&&ac)filmMonitorGain.gain.setTargetAtTime(filmMonitorEnabled?.92:0,ac.currentTime,.025);
 }
 $("monitor-audio")?.addEventListener("click",async()=>{
   filmMonitorEnabled=!filmMonitorEnabled;
   if(filmMonitorEnabled&&ac?.state==="suspended")await ac.resume().catch(()=>{});
   updateMonitorButton();
 });
 updateMonitorButton();
 let lastUserMessage="",reason="manual",introSeconds=300,outroSeconds=35;
 let tabWasHidden=false,lastStatus="",recordSize=0;
 const church="IGREJA MINISTÉRIO PROMESSAS";
 const motto="Resgatar almas e restaurar famílias";
 const fields={title:$("service-name"),address:$("address")};
 const fonts="Manrope, DM Sans, Arial, sans-serif";
 const pixQR=new Image();pixQR.src="/pix-promessas.svg";
 // Cards informativos renderizados dentro do canvas da apresentação.
 // Texto do operador vai apenas para o Canvas, sem injeção HTML ou envio de dados.
 const cardPresets={
   verse:["PALAVRA DE DEUS","O Senhor é o meu pastor; nada me faltará.","Salmo 23:1"],
   notice:["AVISOS DA IGREJA","Seja bem-vindo! Confira nossa programação de cultos no site e aplicativo.","Igreja Ministério Promessas"],
   prayer:["MOMENTO DE ORAÇÃO","Apresente a Deus seu pedido de oração. Estamos unidos em fé.","Orando por sua família"],
   event:["PRÓXIMO CULTO","Acompanhe os dias e os horários dos próximos cultos em nosso site.","igrejapromessas.site"],
   pix:["OFERTAS E DÍZIMOS","Sua generosidade ajuda a transformar vidas e abençoar famílias.","PIX: iemp.promessas@gmail.com"],
   pix_animation:["COMO OFERTAR COM PIX","Abra o app do banco, escolha Pix e leia o QR Code.","PIX: iemp.promessas@gmail.com"]
 };
 let cardState={active:false,started:0,until:0,config:null};
  function setLowerThird(mode){
    if(lowerThirdMode===mode)return;
    lowerThirdPrevious=lowerThirdMode;
    lowerThirdMode=mode;
    lowerThirdSwitchedAt=performance.now();
    playPromessasSound();
  }
  function cardInput(){
   return {
     type:$("card-type").value,
     heading:$("card-heading").value.trim().slice(0,65),
     message:$("card-message").value.trim().slice(0,380),
     reference:$("card-reference").value.trim().slice(0,80),
      position:"lower",
     style:$("card-style").value,
     duration:Math.max(0,Number($("card-duration").value)||0)
   };
 }
 function cardFeedback(message){$("card-feedback").textContent=message;}
 function updateCardControls(){
    $("card-show").textContent=cardState.active?"✦ Atualizar mensagem":"✦ Exibir mensagem";
   $("card-hide").disabled=!cardState.active;
 }
 $("card-type").addEventListener("change",()=>{
   const data=cardPresets[$("card-type").value]||cardPresets.verse;
   $("card-heading").value=data[0];$("card-message").value=data[1];$("card-reference").value=data[2];
   updatePixAnimationOption();
   cardFeedback("Modelo preparado. Edite o conteúdo e clique em Exibir card.");
 });
 updatePixAnimationOption();
 $("card-show").addEventListener("click",()=>{
   const config=cardInput();
   if(!config.heading&&!config.message){
     cardFeedback("Digite um título ou uma mensagem para exibir.");
     $("card-message").focus();return;
   }
    cardState={active:true,started:phase==="intro"||phase==="countdown"?0:performance.now(),until:0,config};
    setLowerThird(chosenMessageMode==="full"?"full":chosenMessageMode==="mini"&&config.type==="pix_animation"?"mini":"message");
   if(cardState.started&&config.duration>0)cardState.until=cardState.started+config.duration*1000;
   cardFeedback(phase==="waiting"?"Card visível no monitor de ensaio. Ele também aparecerá na cena da câmera.":phase==="live"?"Card inserido na imagem da câmera, com animação suave.":"Card preparado. Ele aparecerá na câmera depois da abertura.");
   updateCardControls();
 });
 $("card-hide").addEventListener("click",()=>{
    cardState.active=false;
    setLowerThird("service");
    cardFeedback("Mensagem encerrada. A câmera e a identificação do culto retornam automaticamente com a transição Promessas.");
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

  // Layout grid: all text is positioned in non-overlapping zones and measured before drawing.
  function churchWatermark(x,y,size,opacity=.28){
    if(!logo.complete||!logo.naturalWidth)return;
    ctx.save();ctx.globalAlpha*=opacity;
    ctx.drawImage(logo,x,y,size,size);
    ctx.restore();
  }
  function fittedCardLines(value,width,maxHeight,base,minSize,maxLines){
    let font=base,lines=[];
    for(;font>=minSize;font-=2){
      ctx.font="700 "+font+"px "+fonts;
      lines=cardLines(value,width,maxLines);
      if(lines.length*font*1.32<=maxHeight)break;
    }
    return {font:Math.max(minSize,font),lines};
  }


  function drawChurchLowerThird(opacity=1,shift=0){
    const v=format==="vertical",w=canvas.width,h=canvas.height;
    const bw=w*(v?.93:.90),bh=h*(v?.146:.165);
    const bx=(w-bw)/2,by=h*(v?.968:.964)-bh;
    const pal=cardThemes.gold,margin=v?20:26,logoSize=bh*(v?.79:.84);
    const left=bx+logoSize+margin+18,available=bw-(left-bx)-margin;
    ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,opacity));ctx.translate(0,shift);
    ctx.shadowColor="#000b";ctx.shadowBlur=21;ctx.shadowOffsetY=6;
    roundRect(bx,by,bw,bh,19,"rgba(11,19,33,.95)");
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    roundRect(bx,by,6,bh,3,pal.line);
    churchWatermark(bx+17,by+(bh-logoSize)/2,logoSize,.33);
    text(fields.title.value.trim()||"Culto da Família",left,by+bh*.34,v?31:36,"#fff4e2",800,"left",available);
    ctx.font="600 "+(v?17:18)+"px "+fonts;
    const addr=fields.address.value.replace(/[\r\n]+/g," ").trim();
    text(clampCanvasText(addr,available),left,by+bh*.74,v?17:18,"#cfbdac",600,"left",available);
    ctx.restore();
  }


  function drawMessageLowerThird(now,opacity=1,shift=0){
    const c=cardState.config;if(!c)return;
    const v=format==="vertical",w=canvas.width,h=canvas.height;
    const pal=cardThemes[c.style]||cardThemes.gold;
    const isPix=c.type==="pix"||c.type==="pix_animation";
    const bw=w*(v?.93:.91),bh=h*(v?.200:.285);
    const bx=(w-bw)/2,by=h*(v?.966:.963)-bh;
    const wmSize=bh*(v?.53:.74);
    const wmX=bx+(v?9:17),wmY=by+(bh-wmSize)/2;
    const left=bx+(v?114:181);
    const qrSize=isPix?Math.min(bh*.68,v?157:152):0;
    const contentRight=bx+bw-(isPix?qrSize+33:29);
    const width=Math.max(150,contentRight-left);
    const tutorial=c.type==="pix_animation"?pixTutorialStep(now):null;
    const heading=tutorial?tutorial.label:(c.heading||"PALAVRA DE DEUS").toUpperCase();
    const body=tutorial?tutorial.detail:c.message;
    const headSize=v?18:20,bodySize=v?24:27;
    const linesLimit=v?3:2;
    ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,opacity));ctx.translate(0,shift);
    ctx.shadowColor="rgba(0,0,0,.66)";ctx.shadowBlur=26;ctx.shadowOffsetY=8;
    roundRect(bx,by,bw,bh,19,pal.bg);
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    roundRect(bx,by,6,bh,3,pal.line);
    churchWatermark(wmX,wmY,wmSize,.34);
    // The header, message, and reference have dedicated vertical bands.
    text(heading,left,by+bh*(v?.185:.195),headSize,pal.title,800,"left",width);
    const maxMessageH=bh*(v?.36:.345);
    const fit=fittedCardLines(body,width,maxMessageH,bodySize,v?19:21,linesLimit);
    const centerY=by+bh*(v?.525:.535);
    const rowH=fit.font*1.28;
    const msgTop=centerY-(fit.lines.length-1)*rowH/2;
    fit.lines.forEach((line,i)=>text(line,left,msgTop+i*rowH,fit.font,pal.body,700,"left",width));
    if(c.reference){
      const ref=String(c.reference).trim();
      ctx.font="700 "+(v?16:18)+"px "+fonts;
      text(clampCanvasText(ref,width),left,by+bh*(v?.865:.865),v?16:18,pal.small,700,"left",width);
    }
    if(isPix){
      const qx=bx+bw-qrSize-18,qy=by+(bh-qrSize)/2;
      roundRect(qx-7,qy-7,qrSize+14,qrSize+14,10,"#fff");
      if(pixQR.complete&&pixQR.naturalWidth)ctx.drawImage(pixQR,qx,qy,qrSize,qrSize);
    }
    ctx.restore();
  }



  function drawFullBrand(w,h,v){
    // Keep this brand zone identical on ALL full-screen card types.
    const size=v?161:123;
    logoAt(w/2,h*(v?.135:.160),size);
    text("IGREJA MINISTÉRIO PROMESSAS",w/2,h*(v?.257:.299),v?23:22,"#e7d2ae",800,"center",w*.94);
  }


  function drawFullMessage(now,opacity=1){
    const c=cardState.config;if(!c)return;
    const w=canvas.width,h=canvas.height,v=format==="vertical";
    const pal=cardThemes[c.style]||cardThemes.gold;
    const pix=c.type==="pix"||c.type==="pix_animation";
    ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,opacity));
    const grad=ctx.createLinearGradient(0,0,w,h);
    grad.addColorStop(0,c.style==="purple"?"#171427":"#101725");
    grad.addColorStop(.68,c.style==="blue"?"#11293c":"#1a2232");
    grad.addColorStop(1,c.style==="purple"?"#292039":"#171a27");
    ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    const ambient=ctx.createRadialGradient(w*.50,h*.53,0,w*.50,h*.53,w*.58);
    ambient.addColorStop(0,"rgba(210,167,101,.075)");
    ambient.addColorStop(1,"rgba(210,167,101,0)");
    ctx.fillStyle=ambient;ctx.fillRect(0,0,w,h);
    drawFullBrand(w,h,v);
    if(pix){
      const tutorial=c.type==="pix_animation"?pixTutorialStep(now):null;
      text("OFERTAS E DÍZIMOS",w/2,h*(v?.337:.393),v?39:41,pal.title,800,"center",w*.90);
      if(v){
        // Portrait: QR in a reserved central square; no text is allowed to cross it.
        const cx=w/2;
        text(tutorial?tutorial.label:"Sua generosidade transforma vidas.",cx,h*.411,22,"#f7efe4",650,"center",w*.90);
        const q=Math.min(w*.455,h*.255),qx=(w-q)/2,qy=h*.47;
        roundRect(qx-16,qy-16,q+32,q+32,17,"#fff");
        if(pixQR.complete&&pixQR.naturalWidth)ctx.drawImage(pixQR,qx,qy,q,q);
        text("PIX: iemp.promessas@gmail.com",cx,h*.775,23,"#ffefd1",800,"center",w*.92);
        text("Recebedor: Igreja Evangélica",cx,h*.834,18,"#d8c8ad",700,"center",w*.93);
        text("Ministério Promessas",cx,h*.866,18,"#d8c8ad",700,"center",w*.93);
        text("Confira o nome no banco antes de confirmar.",cx,h*.941,16,"#d0bb9d",550,"center",w*.95);
      }else{
        // Landscape: QR lives on the right, bank instructions/recipient on the left.
        const tx=w*.09,tw=w*.45;
        const hint=tutorial?tutorial.label:"Sua generosidade ajuda a transformar vidas.";
        const hintSize=28;
        ctx.font="700 "+hintSize+"px "+fonts;
        const hintLines=cardLines(hint,tw,2);
        hintLines.forEach((line,i)=>text(line,tx,h*(.505+i*.057),hintSize,"#faf0e5",700,"left",tw));
        text(tutorial?tutorial.detail:"Abra seu banco e escolha Pix.",tx,h*.661,21,"#dfcebb",600,"left",tw);
        text("PIX: iemp.promessas@gmail.com",tx,h*.761,20,"#ffeccd",800,"left",tw);
        text("Recebedor: Igreja Evangélica Ministério Promessas",tx,h*.829,17,"#d5c6b1",700,"left",tw);
        text("Confira o recebedor antes de confirmar.",tx,h*.902,16,"#c4b5a1",550,"left",tw);
        const q=Math.min(w*.265,h*.45),qx=w*.648,qy=h*.473;
        roundRect(qx-16,qy-16,q+32,q+32,16,"#fff");
        if(pixQR.complete&&pixQR.naturalWidth)ctx.drawImage(pixQR,qx,qy,q,q);
      }
      ctx.restore();return;
    }
    // Other cards use exactly the same centered logo and ministry name.
    const heading=String(c.heading||"PALAVRA DE DEUS").toUpperCase();
    const hWidth=w*.87,hFont=v?33:34;
    ctx.font="800 "+hFont+"px "+fonts;
    const hLines=cardLines(heading,hWidth,v?3:2);
    const hLineH=hFont*1.35,headingMid=h*(v?.373:.410);
    hLines.forEach((line,i)=>text(line,w/2,headingMid+(i-(hLines.length-1)/2)*hLineH,hFont,pal.title,800,"center",hWidth));
    const width=w*(v?.84:.79);
    const fit=fittedCardLines(c.message,width,h*(v?.24:.26),v?43:48,v?28:30,v?7:5);
    const lineHeight=fit.font*1.42,mid=h*(v?.615:.655);
    fit.lines.forEach((line,i)=>text(line,w/2,mid+(i-(fit.lines.length-1)/2)*lineHeight,fit.font,"#fff7ed",700,"center",width));
    if(c.reference){
      text(String(c.reference).trim(),w/2,h*(v?.835:.864),v?23:22,"#e9d0ab",700,"center",w*.88);
    }
    text(motto,w/2,h*(v?.942:.943),v?17:16,"#b6ada4",500,"center",w*.88);
    ctx.restore();
  }

  function drawPromessasSweep(now,mix,full){
    // Brief logo + light sweep synchronized to the fullscreen transition.
    const p=Math.max(0,Math.min(1,mix)),w=canvas.width,h=canvas.height;
    const brightness=Math.sin(p*Math.PI);
    if(brightness<=.015)return;
    ctx.save();ctx.globalAlpha=brightness*(full?.66:.31);
    const centerX=w*(.08+.84*p);
    const g=ctx.createLinearGradient(centerX-w*.26,0,centerX+w*.26,0);
    g.addColorStop(0,"rgba(241,199,128,0)");
    g.addColorStop(.47,"rgba(244,214,164,.28)");
    g.addColorStop(.50,"rgba(255,241,217,.72)");
    g.addColorStop(.53,"rgba(244,214,164,.28)");
    g.addColorStop(1,"rgba(241,199,128,0)");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.restore();
  }


  const pixTutorialSteps=[
    {label:"ABRA SEU BANCO",detail:"Acesse o aplicativo do seu banco",kind:"bank"},
    {label:"ESCOLHA PIX",detail:"Toque na opção Pix",kind:"select"},
    {label:"LEIA O QR CODE",detail:"Escaneie o código da igreja",kind:"scan"},
    {label:"CONFIRA O RECEBEDOR",detail:"Igreja Evangélica Ministério Promessas",kind:"confirm"},
    {label:"ENVIE SUA OFERTA",detail:"Simulação: Pix enviado ✓",kind:"sent"}
  ];
  const PIX_STEP_MS=3250;
  function pixTutorialStep(now){
    const started=cardState.started||now;
    return pixTutorialSteps[Math.floor(Math.max(0,now-started)/PIX_STEP_MS)%pixTutorialSteps.length];
  }
  function drawMiniPhone(x,y,w,h,step,progress,pulse){
    const ink="#e8e2d7",mint="#b1efd0",gold="#e7c38b";
    ctx.save();
    // Phone outline and screen; all steps are 2-D drawings, not fake payment processing.
    roundRect(x,y,w,h,Math.min(12,w*.12),"#ddd7d4");
    roundRect(x+3,y+4,w-6,h-8,Math.min(10,w*.09),"#142339");
    roundRect(x+w*.38,y+6,w*.24,2,1,"#b4c0c4");
    const cx=x+w*.5,font=Math.max(8,w*.115);
    if(step.kind==="bank"){
      text("BANCO",cx,y+h*.23,font,ink,800,"center",w*.80);
      roundRect(x+w*.16,y+h*.39,w*.68,h*.25,5,"#304864");
      text("ENTRAR",cx,y+h*.52,font*.86,"#e5f9f1",800,"center",w*.64);
      text("›",cx,y+h*.82,font*2,gold,700);
    }else if(step.kind==="select"){
      text("MENU",cx,y+h*.21,font,ink,800);
      roundRect(x+w*.13,y+h*.36,w*.74,h*.28,5,"rgba(233,196,138,"+(.22+.30*pulse)+")");
      text("PIX",cx,y+h*.50,font*1.28,"#ffe7bc",800);
      ctx.strokeStyle="rgba(249,224,165,"+(.80-.40*pulse)+")";ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(cx,y+h*.50,w*(.27+.07*pulse),0,Math.PI*2);ctx.stroke();
    }else if(step.kind==="scan"){
      text("LER QR",cx,y+h*.18,font,ink,800);
      const s=w*.44,left=cx-s/2,top=y+h*.36;
      ctx.strokeStyle=mint;ctx.lineWidth=2;
      ctx.strokeRect(left,top,s,s);
      const lineY=top+2+progress*(s-4);
      ctx.beginPath();ctx.moveTo(left+3,lineY);ctx.lineTo(left+s-3,lineY);ctx.stroke();
      text("ESCANEAR",cx,y+h*.88,font*.70,mint,800);
    }else if(step.kind==="confirm"){
      text("RECEBEDOR",cx,y+h*.18,font*.85,ink,800,"center",w*.84);
      text("IGREJA",cx,y+h*.37,font*.91,gold,800,"center",w*.83);
      text("MINISTÉRIO",cx,y+h*.51,font*.76,"#f3ecdf",700,"center",w*.91);
      text("PROMESSAS",cx,y+h*.65,font*.74,"#f3ecdf",700,"center",w*.89);
      roundRect(x+w*.17,y+h*.77,w*.66,h*.12,4,"#386855");
      text("CONFIRMAR",cx,y+h*.83,font*.62,"#edfff5",800,"center",w*.62);
    }else{
      ctx.strokeStyle=mint;ctx.lineWidth=Math.max(3,w*.055);
      ctx.beginPath();ctx.arc(cx,y+h*.39,w*.22,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx-w*.11,y+h*.40);ctx.lineTo(cx-w*.025,y+h*.48);ctx.lineTo(cx+w*.15,y+h*.30);ctx.stroke();
      text("PIX ENVIADO",cx,y+h*.70,font*.76,mint,800,"center",w*.90);
      text("SIMULAÇÃO",cx,y+h*.87,font*.66,"#b8cad4",700,"center",w*.90);
    }
    // A soft tap marker indicates simulated user interaction.
    if(["bank","select","confirm"].includes(step.kind)){
      const tx=x+w*.74,ty=y+h*.64;
      ctx.beginPath();ctx.arc(tx,ty,4+6*pulse,0,Math.PI*2);
      ctx.strokeStyle="rgba(235,190,117,"+(1-.65*pulse)+")";ctx.lineWidth=2;ctx.stroke();
    }
    ctx.restore();
  }
  function drawPixMiniAnimation(now,opacity=1,shift=0){
    const v=format==="vertical",w=canvas.width,h=canvas.height;
    const pal=cardThemes[cardState.config?.style]||cardThemes.gold;
    // Deliberately smaller than the old promo card, so the preacher remains visible.
    const bw=w*(v?.82:.43),bh=h*(v?.155:.238);
    const bx=w-bw-w*(v?.049:.029),by=h-bh-h*(v?.038:.044);
    const elapsed=Math.max(0,now-(cardState.started||now));
    const n=Math.floor(elapsed/PIX_STEP_MS)%pixTutorialSteps.length;
    const step=pixTutorialSteps[n];
    const progress=(elapsed%PIX_STEP_MS)/PIX_STEP_MS;
    const pulse=.5+.5*Math.sin(elapsed*.006);
    const qrSize=Math.min(bh*.65,bw*.20),qx=bx+bw-qrSize-15,qy=by+(bh-qrSize)/2+10;
    const phoneW=Math.min(bh*.42,bw*.145),phoneH=bh*.79;
    const phoneX=qx-phoneW-(v?24:14),phoneY=by+(bh-phoneH)/2+7;
    const left=bx+17,contentW=Math.max(124,phoneX-left-14);
    ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,opacity));ctx.translate(0,shift);
    ctx.shadowColor="#000a";ctx.shadowBlur=22;ctx.shadowOffsetY=7;
    roundRect(bx,by,bw,bh,18,"rgba(11,18,31,.96)");
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    roundRect(bx,by,5,bh,3,pal.line);
    // Compact centered brand at left; the full-screen version carries the large identity.
    const logoSize=Math.min(bh*.38,v?73:64),logoCx=left+contentW*.42;
    if(logo.complete&&logo.naturalWidth)ctx.drawImage(logo,logoCx-logoSize/2,by+8,logoSize,logoSize);
    text("MINISTÉRIO PROMESSAS",logoCx,by+logoSize+17,v?13:12,pal.title,800,"center",contentW*.98);
    text("COMO OFERTAR",left,by+bh*.625,v?17:16,"#ffefdb",800,"left",contentW);
    const label=step.kind==="sent"?"PIX ENVIADO ✓":step.label;
    text(label,left,by+bh*.785,v?16:15,step.kind==="sent"?"#b8f4da":"#ffffff",800,"left",contentW);
    text(step.kind==="sent"?"EXEMPLO ILUSTRATIVO":step.detail,left,by+bh*.914,v?12:11,"#d2c8bb",600,"left",contentW);
    drawMiniPhone(phoneX,phoneY,phoneW,phoneH,step,progress,pulse);
    roundRect(qx-5,qy-5,qrSize+10,qrSize+10,8,"#fff");
    if(pixQR.complete&&pixQR.naturalWidth)ctx.drawImage(pixQR,qx,qy,qrSize,qrSize);
    text("LEIA O QR",qx+qrSize/2,qy-14,v?13:12,pal.title,800,"center",qrSize+10);
    for(let i=0;i<pixTutorialSteps.length;i++){
      const dotx=bx+bw*.49+i*11;
      ctx.beginPath();ctx.arc(dotx,by+bh-8,2.3,0,Math.PI*2);
      ctx.fillStyle=i===n?pal.line:"rgba(255,255,255,.23)";ctx.fill();
    }
    ctx.restore();
  }

  function drawLowerThird(now){
    if(cardState.active && cardState.config && cardState.started===0 && phase==="live"){
      cardState.started=now;
      if(cardState.config.duration)cardState.until=now+cardState.config.duration*1000;
    }
    if(cardState.active&&cardState.until&&now>=cardState.until){
      cardState.active=false;setLowerThird("service");updateCardControls();
      cardFeedback("A mensagem terminou. A câmera e o título do culto voltaram automaticamente.");
    }
    const elapsed=Math.max(0,now-lowerThirdSwitchedAt);
    const inMotion=elapsed<transitionDuration&&lowerThirdPrevious!==lowerThirdMode;
    const drawMode=(mode,alpha,shift)=>{
      if(alpha<=0.005)return;
      if(mode==="full")drawFullMessage(now,alpha);
      else if(mode==="mini")drawPixMiniAnimation(now,alpha,shift);
      else if(mode==="message")drawMessageLowerThird(now,alpha,shift);
      else drawChurchLowerThird(alpha,shift);
    };
    if(inMotion){
      const p=elapsed/transitionDuration,ease=p*p*(3-2*p);
      const full=lowerThirdPrevious==="full"||lowerThirdMode==="full";
      drawMode(lowerThirdPrevious,1-ease,-38*ease);
      drawMode(lowerThirdMode,ease,38*(1-ease));
      drawPromessasSweep(now,p,full);
    }else{
      drawMode(lowerThirdMode,1,0);
    }
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
    if(p==="outro"||p==="done"){cardState.active=false;setLowerThird("service");updateCardControls();}
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
    applySourceAudio();
   introMotion.pause();
   musicOff(); // Nunca sobrepor a antiga trilha aos videos R5.
   if(p==="intro")startFilm(openingFilm);
   else if(p==="outro")startFilm(endingFilm);
   else pauseFilms();
   window.dispatchEvent(new CustomEvent("promessas-scene",{detail:{phase:p}}));
   const messages={
    waiting:"Pronto para preparar a câmera. Nenhum vídeo será enviado para a internet.",
    countdown:"Contagem regressiva de 10 segundos em andamento. Você ainda pode cancelar.",
    intro:"Abertura Promessas R5 (5 minutos), com narração e música integradas. Após o vídeo, entra a câmera.",
    live:"Câmera no monitor de programação. Para o público assistir, é necessário um encoder/transmissão conectado.",
    paused:"Imagem de pausa no monitor de programação. A câmera está oculta da saída.",
    outro:"Encerramento Promessas R5 (2 minutos), com áudio original. A arte final aparecerá ao terminar.",
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
   if(phase==="intro")label="CULTO EM "+mmss(Math.max(0,introSeconds-($("test-mode").checked?elapsed:openingFilm.currentTime)));
   if(phase==="outro")label="ENCERRAMENTO "+mmss(Math.max(0,outroSeconds-($("test-mode").checked?elapsed:endingFilm.currentTime)));
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
   // A orientação da apresentação é definida pelo estúdio.
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
  function sourceStatus(message){$("screen-feedback").textContent=message;}
  function setActiveSource(mode){
    activeSource=mode==="screen"?"screen":"camera";
    const isScreen=activeSource==="screen";
    $("source-camera").classList.toggle("selected",!isScreen);
    $("source-screen").classList.toggle("selected",isScreen);
    $("source-camera").setAttribute("aria-pressed",String(!isScreen));
    $("source-screen").setAttribute("aria-pressed",String(isScreen));
    applySourceAudio();
  }
  function applySourceAudio(){
    const live=phase==="live";
    if(micGain)micGain.gain.value=live&&(activeSource==="camera"||(activeSource==="screen"&&$("screen-mic").checked))?1:0;
    if(displayAudioGain)displayAudioGain.gain.value=live&&activeSource==="screen"?1:0;
  }
  function attachDisplayAudio(){
    if(!ac||!mediaDest||!displayStream?.getAudioTracks().length||displayAudioSource)return;
    try{
      displayAudioSource=ac.createMediaStreamSource(displayStream);
      displayAudioGain=ac.createGain();displayAudioGain.gain.value=0;
      displayAudioSource.connect(displayAudioGain);displayAudioGain.connect(mediaDest);
      applySourceAudio();
    }catch(e){sourceStatus("A tela foi selecionada, mas não foi possível incluir o áudio: "+e.message);}
  }
  function stopScreen(){
    const had=!!displayStream;
    if(displayStream){for(const track of displayStream.getTracks())track.stop();}
    displayStream=null;displayVid.srcObject=null;
    if(displayAudioSource){try{displayAudioSource.disconnect();}catch(e){}displayAudioSource=null;}
    if(displayAudioGain){try{displayAudioGain.disconnect();}catch(e){}displayAudioGain=null;}
    $("stop-share").hidden=true;
    if(activeSource==="screen"){
      setActiveSource("camera");
      if(phase==="live"&&!camReady){reason="camera";setPhase("paused");}
    }
    if(had)sourceStatus("Compartilhamento encerrado. A fonte voltou para a câmera.");
  }
  async function shareScreen(){
    if(!navigator.mediaDevices?.getDisplayMedia){
      sourceStatus("Compartilhamento de tela indisponível. Use o Chrome/Edge no notebook em HTTPS ou localhost.");return false;
    }
    try{
      // getDisplayMedia must be called synchronously from the operator's direct click.
      const stream=await navigator.mediaDevices.getDisplayMedia({
        video:{frameRate:{ideal:24,max:30}},
        audio:{echoCancellation:false,noiseSuppression:false},
        preferCurrentTab:false,
        selfBrowserSurface:"exclude",
        surfaceSwitching:"include"
      });
      if(displayStream)stopScreen();
      displayStream=stream;
      displayVid.srcObject=stream;
      displayVid.muted=true;displayVid.playsInline=true;
      await displayVid.play();
      const track=stream.getVideoTracks()[0];
      if(track)track.addEventListener("ended",stopScreen,{once:true});
      setActiveSource("screen");
      attachDisplayAudio();
      $("stop-share").hidden=false;
      const audio=stream.getAudioTracks().length>0;
      sourceStatus(audio
        ?"✓ Tela/aba selecionada COM áudio. O culto transmitirá esta fonte com a tarja da igreja."
        :"✓ Tela/aba selecionada SEM áudio. Para enviar o som do YouTube, compartilhe a guia marcando o áudio.");
      return true;
    }catch(error){
      sourceStatus(error?.name==="NotAllowedError"?"Você cancelou a seleção. Nenhuma tela está sendo transmitida.":"Não foi possível compartilhar: "+(error?.message||"erro"));
      return false;
    }
  }
  $("source-camera").addEventListener("click",()=>setActiveSource("camera"));
  $("source-screen").addEventListener("click",()=>{
    if(displayStream)setActiveSource("screen");
    else shareScreen();
  });
  $("choose-screen").addEventListener("click",shareScreen);
  $("stop-share").addEventListener("click",stopScreen);
  $("screen-mic").addEventListener("change",applySourceAudio);

 async function audioSetup(){
   // Composition audio for local rehearsal only. Microphone is never looped to speakers.
   if(ac)return;
   const AudioCtx=window.AudioContext||window.webkitAudioContext;
   if(!AudioCtx)return;
   try{
     ac=new AudioCtx();mediaDest=ac.createMediaStreamDestination();
     window.PromessasAudioStream=mediaDest.stream;
     // Som original R5 segue para a live E para o monitor do notebook.
     // O monitor nao recebe microfone ou audio da aba compartilhada, para evitar eco.
     filmMonitorGain=ac.createGain();
     filmMonitorGain.gain.value=filmMonitorEnabled?.92:0;
     filmMonitorGain.connect(ac.destination);
     for(const film of [openingFilm,endingFilm]){
       const source=ac.createMediaElementSource(film);
       const gain=ac.createGain();gain.gain.value=1;
       source.connect(gain);
       gain.connect(mediaDest);         // Audio da transmissao/gravação.
       gain.connect(filmMonitorGain);   // Som audivel no notebook, com volume controlavel.
     }
     updateMonitorButton();
     if(cameraStream?.getAudioTracks().length){
       micSource=ac.createMediaStreamSource(cameraStream);
       micGain=ac.createGain();micGain.gain.value=0;
       micSource.connect(micGain);micGain.connect(mediaDest);
     }
      attachDisplayAudio();
      applySourceAudio();
    }catch(err){
     $("record-status").textContent="Falha no áudio dos vídeos R5: "+(err?.message||"erro desconhecido");
     status("Não foi possível ativar o áudio. Verifique as permissões de som do navegador.");
   }
 }
 window.PromessasPreparePublishAudio = async function(){
   await audioSetup();
   if(ac?.state==="suspended") await ac.resume().catch(()=>{});
   return mediaDest?.stream?.getAudioTracks?.() || [];
 };
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
    if(activeSource==="screen"){
      if(!displayStream||displayStream.getVideoTracks().every(t=>t.readyState!=="live")){
        status("Selecione primeiro a aba, janela ou tela que deseja transmitir.");return;
      }
    }else if(!(await prepareCamera())){
      status("Prepare a câmera e o microfone antes de iniciar. A prévia permanece local.");return;
    }
   introSeconds=$("test-mode").checked?15:300;
   outroSeconds=$("test-mode").checked?12:120;
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
   // A mesma arte oficial do site aparece antes e depois de cada transmissao.
   drawDone(t);
 }
 function drawCountdown(t){
   // Somente os segundos regressivos na tela: sem logo, titulo, tarja ou textos.
   // Nao altera os videos R5, que incluem audio e narracao originais.
   const w=canvas.width,h=canvas.height;
   ctx.fillStyle="#101010";
   ctx.fillRect(0,0,w,h);
   const n=Math.max(1,Math.ceil(10-t));
   text(String(n),w/2,h/2,Math.min(w*.32,h*.31),"#fff7e7",800);
 }
 function drawFilm(film,label){
   const w=canvas.width,h=canvas.height;
   if(film.readyState>=2&&film.videoWidth>0&&film.videoHeight>0){
     // Conter o quadro inteiro, preservando textos/logo do video em 9:16.
     ctx.fillStyle="#101010";ctx.fillRect(0,0,w,h);
     const scale=Math.min(w/film.videoWidth,h/film.videoHeight);
     const fw=film.videoWidth*scale,fh=film.videoHeight*scale;
     ctx.drawImage(film,(w-fw)/2,(h-fh)/2,fw,fh);
   }else{
     ctx.fillStyle="#101010";ctx.fillRect(0,0,w,h);
     text("CARREGANDO "+label+"…",w/2,h/2,Math.min(26,w*.042),"#e8c58e",700,"center",w*.88);
   }
 }
 function drawIntro(t){
   drawFilm(openingFilm,"ABERTURA");
   return;
   const w=canvas.width,h=canvas.height,v=format==="vertical";
   // A real, licensed motion backdrop; blur intentionally masks the source's embedded English timer.
   // All church identity, clock, graphics and typography are drawn fresh into our transmitted canvas.
   if(introMotion.readyState>=2&&introMotion.videoWidth>0){
     const sw=introMotion.videoWidth,sh=introMotion.videoHeight,zoom=1.045+.018*Math.sin(t*.12);
     const sc=Math.max(w/sw,h/sh)*zoom,dw=sw*sc,dh=sh*sc;
     ctx.save();
     ctx.filter="blur("+Math.max(19,w*.024)+"px) brightness(.45) saturate(1.45)";
     ctx.drawImage(introMotion,(w-dw)/2,(h-dh)/2,dw,dh);
     ctx.restore();
   }else background(t);
   // Layered midnight-blue/light-gold finish to make the 5-minute time the focus.
   const veil=ctx.createLinearGradient(0,0,w,h);
   veil.addColorStop(0,"#070b15b8");
   veil.addColorStop(.54,"#0f122e95");
   veil.addColorStop(1,"#060b17df");
   ctx.fillStyle=veil;ctx.fillRect(0,0,w,h);
   const golden=ctx.createRadialGradient(w*.47,h*.33,5,w*.48,h*.37,w*.71);
   golden.addColorStop(0,"#e9b86452");golden.addColorStop(.48,"#9577d32b");
   golden.addColorStop(1,"#0f183100");
   ctx.fillStyle=golden;ctx.fillRect(0,0,w,h);
   const phaseTime=t*(introSeconds===15?20:1);
   const beat=Math.max(0,Math.sin(t*2.4));
   const border=Math.max(12,w*.019);
   ctx.save();
   ctx.globalAlpha=.64;
   ctx.strokeStyle="#dbb77a95";ctx.lineWidth=Math.max(2,w*.002);
   ctx.strokeRect(border,border,w-2*border,h-2*border);
   // Subtle moving beams.
   ctx.translate(w*.5,h*.39);ctx.rotate(Math.sin(t*.09)*.055);
   for(let i=0;i<3;i++){
      ctx.beginPath();ctx.ellipse(0,0,w*(.23+i*.11),h*(.16+i*.075),-.17,0,Math.PI*2);
      ctx.strokeStyle="rgba(240,190,116,"+(.30-i*.07)+")";ctx.lineWidth=Math.max(2,w*.002);ctx.stroke();
   }
   ctx.restore();
   // A gleaming large church logo takes visual priority.
   logoAt(w/2,h*(v?.235:.228),Math.min(w*(v?.43:.30),h*(v?.25:.35)));
   const sloganY=h*(v?.372:.43);
   text("IGREJA MINISTÉRIO PROMESSAS",w/2,sloganY,v?24:28,"#f5dbb1",800,"center",w*.88);
   ctx.globalAlpha=.6;
   roundRect(w*.35,sloganY+(v?22:23),w*.30,Math.max(3,h*.0028),8,"#e0b26c");
   ctx.globalAlpha=1;
   const phrasesCount=phrases.length;
   const idx=Math.min(phrasesCount-1,Math.floor(t/introSeconds*phrasesCount));
   const phrase=phrases[idx];
   const segment=(t/(introSeconds/phrasesCount))%1;
   const easeIn=Math.min(1,segment*5),easeOut=Math.min(1,(1-segment)*5),textOpacity=Math.max(.07,Math.min(easeIn,easeOut));
   ctx.save();
   ctx.globalAlpha=textOpacity;
   text(phrase[0],w/2,h*(v?.458:.525),v?33:45,"#fff4e6",800,"center",w*.89);
   text(phrase[1],w/2,h*(v?.505:.602),v?21:27,"#d7b88c",700,"center",w*.89);
   ctx.restore();
   // Always count five minutes; the test runs the five-minute sequence in fifteen seconds.
   const remain=Math.max(0,Math.ceil(300*(1-t/introSeconds)));
   const clock=String(Math.floor(remain/60)).padStart(2,"0")+":"+String(remain%60).padStart(2,"0");
   const clockX=w/2,clockY=h*(v?.706:.757);
   const timerWidth=w*(v?.64:.40),timerHeight=h*(v?.105:.16);
   roundRect(clockX-timerWidth/2,clockY-timerHeight*.62,timerWidth,timerHeight,Math.min(28,w*.023),"rgba(9,13,24,.76)");
   ctx.strokeStyle="#d9b68088";ctx.lineWidth=Math.max(2,w*.002);ctx.strokeRect(clockX-timerWidth/2+2,clockY-timerHeight*.62+2,timerWidth-4,timerHeight-4);
   text("O CULTO COMEÇA EM",w/2,clockY-timerHeight*.84,v?17:21,"#e5bf82",800,"center",w*.75);
   text(clock,clockX,clockY+timerHeight*.075,v?82:108,"#ffefd3",800,"center",timerWidth*.88);
   const nearEnd=remain<=15,flash=nearEnd?Math.abs(Math.sin(t*5))*.26:0;
   if(flash>0){ctx.fillStyle="rgba(255,213,136,"+flash+")";ctx.fillRect(0,0,w,h);}
   text(motto,w/2,h*(v?.846:.922),v?18:22,"#e1ca9f",700,"center",w*.88);
   // Visible progress follows the true 300s clock; latest seconds resolve into the camera.
   const progressWidth=w*.70,progressTop=h*(v?.925:.969);
   roundRect((w-progressWidth)/2,progressTop,progressWidth,Math.max(5,h*.006),7,"#fff3d244");
   roundRect((w-progressWidth)/2,progressTop,progressWidth*Math.min(1,t/introSeconds),Math.max(5,h*.006),7,"#f1c884");
 }
 function drawLiveBrand(t){
   // Rendered into the program canvas, so viewers see this branding as part of the signal.
   const w=canvas.width,v=format==="vertical";
   const badgeW=v?123:148,badgeH=40,badgeX=w-badgeW-19,badgeY=24;
   const cx=v?55:59,cy=53,diameter=v?63:69;
   const labelX=v?105:111,brandW=v?435:510;
   ctx.save();
   roundRect(18,18,brandW,73,15,"rgba(7,13,24,.75)");
   ctx.strokeStyle="rgba(230,193,128,.30)";
   ctx.lineWidth=1;
   ctx.beginPath();ctx.roundRect(18.5,18.5,brandW-1,72,15);ctx.stroke();
   logoAt(cx,cy,diameter);
   // Gentle orbiting highlights and glow, preserving the church's original mark.
   const pulse=.5+.5*Math.sin(t*1.55),orbit=t*.48;
   ctx.save();
   ctx.shadowColor="rgba(241,204,141,.75)";
   ctx.shadowBlur=5+4*pulse;
   ctx.lineWidth=2.1;ctx.lineCap="round";
   ctx.strokeStyle="rgba(246,210,147,"+(.52+.34*pulse)+")";
   ctx.beginPath();ctx.arc(cx,cy,diameter*.62,orbit,orbit+Math.PI*.72);ctx.stroke();
   ctx.lineWidth=1.25;
   ctx.strokeStyle="rgba(253,231,177,"+(.29+.3*pulse)+")";
   ctx.beginPath();ctx.arc(cx,cy,diameter*.67,-orbit*.7,-orbit*.7+Math.PI*.48);ctx.stroke();
   ctx.restore();
   if(v){
     text("IGREJA MINISTÉRIO",labelX,47,17,"#fff2de",800,"left",brandW-(labelX-18)-13);
     text("PROMESSAS",labelX,70,20,"#f2d49b",800,"left",brandW-(labelX-18)-13);
   }else{
     text(church,labelX,56,20,"#fff2de",800,"left",brandW-(labelX-18)-13);
   }
   ctx.shadowColor="rgba(0,0,0,.30)";ctx.shadowBlur=9;
   roundRect(badgeX,badgeY,badgeW,badgeH,12,"rgba(144,31,43,.95)");
   ctx.shadowBlur=0;
   ctx.fillStyle="rgba(255,255,255,"+(.80+.20*pulse)+")";
   ctx.beginPath();ctx.arc(badgeX+23,badgeY+badgeH*.5,5.1,0,Math.PI*2);ctx.fill();
   text("NO AR",badgeX+(badgeW+18)/2,badgeY+badgeH*.51,v?16:17,"#fff9ee",800,"center",badgeW-45);
   ctx.restore();
 }
 function drawCamera(t){
    const w=canvas.width,h=canvas.height,v=format==="vertical";
    const shared=activeSource==="screen";
    const source=shared?displayVid:vid;
    if(source.readyState>=2&&source.videoWidth){
      const sw=source.videoWidth,sh=source.videoHeight;
      if(shared){
        background(t,"pause");
        const scale=Math.min(w/sw,h/sh);
        const dw=sw*scale,dh=sh*scale;
        ctx.drawImage(source,(w-dw)/2,(h-dh)/2,dw,dh);
      }else{
        const scale=Math.max(w/sw,h/sh),cw=w/scale,ch=h/scale;
        ctx.drawImage(source,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,w,h);
      }
    }else{
      background(t,"pause");
      text(shared?"Aguardando a tela compartilhada…":"Preparando a imagem da câmera…",w/2,h/2,v?23:28,"#d9c194",600,"center",w*.91);
    }
    const grad=ctx.createLinearGradient(0,h*.62,0,h);
    grad.addColorStop(0,"rgba(10,15,24,0)");grad.addColorStop(1,"rgba(5,10,17,.77)");
    ctx.fillStyle=grad;ctx.fillRect(0,h*.65,w,h*.35);
    drawLiveBrand(t);
    drawLowerThird(performance.now());
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
   drawFilm(endingFilm,"ENCERRAMENTO");
   return;
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
   if(finalCard.complete&&finalCard.naturalWidth){
     ctx.fillStyle="#101010";ctx.fillRect(0,0,w,h);
     const scale=Math.min(w/finalCard.naturalWidth,h/finalCard.naturalHeight);
     const fw=finalCard.naturalWidth*scale,fh=finalCard.naturalHeight*scale;
     ctx.drawImage(finalCard,(w-fw)/2,(h-fh)/2,fw,fh);
     return;
   }
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
   if(phase==="intro"&&(
      ($("test-mode").checked&&t>=introSeconds)||
      (!$("test-mode").checked&&(openingFilm.ended||openingFilm.currentTime>=299.94||t>=introSeconds+35))
   )){setPhase("live");t=0;}
   if(phase==="outro"&&(
      ($("test-mode").checked&&t>=outroSeconds)||
      (!$("test-mode").checked&&(endingFilm.ended||endingFilm.currentTime>=119.94||t>=outroSeconds+35))
   )){setPhase("done");t=0;if(cameraStream){for(const tr of cameraStream.getTracks())tr.stop();cameraStream=null;camReady=false;}}
   if(phase==="waiting")drawWaiting(now/1000);
   else if(phase==="countdown")drawCountdown(t);
   else if(phase==="intro")drawIntro(t);
   else if(phase==="live")drawCamera(t);
   else if(phase==="paused")drawPause(t);
   else if(phase==="outro")drawOutro(t);
   else drawDone(t);
    // A mensagem substitui a identificação do culto dentro de drawCamera().
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
   if(displayStream)displayStream.getTracks().forEach(t=>t.stop());
 });
})();
