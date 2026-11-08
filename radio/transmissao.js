"use strict";
/* Rádio Promessas: player do sinal externo Rádio Infinita Graça.
   Sem controles visuais de seleção musical. Navegadores podem restringir o autoplay:
   nesse caso, qualquer gesto real do usuário libera a reprodução. */
(function(){
 const audio=document.getElementById("promessas-radio");
 if(!audio)return;
 const status=document.getElementById("radio-play-status")||document.getElementById("player-status");
 const container=document.querySelector(".home-radio")||document.querySelector(".player-card");
 let blocked=false,lastError="",pending=false;
 function message(text){if(status)status.textContent=text;}
 function visual(on){if(container)container.classList.toggle("is-playing",on);if(container)container.classList.toggle("playing",on);}
 function play(){
  if(pending||!audio.paused)return;
  pending=true;
  try{
   const result=audio.play();
   if(result&&typeof result.then==="function"){
    result.then(()=>{
     pending=false;blocked=false;visual(true);
     message("Louvores 24 horas • transmissão da Rádio Infinita Graça, sem intervalos comerciais conforme a emissora.");
    }).catch(error=>{
     pending=false;
     blocked=error&&error.name==="NotAllowedError";
     lastError=error?.message||"";
     if(blocked)message("Toque uma vez na tela para liberar o som. O navegador impede a reprodução automática sem interação.");
     else message("Sinal indisponível no momento. Confira a conexão e tente novamente.");
    });
   } else {pending=false;}
  }catch(error){
   pending=false;blocked=error?.name==="NotAllowedError";
   message(blocked?"Toque na tela para liberar o som.":"Não foi possível iniciar a transmissão.");
  }
 }
 function gesture(){if(audio.paused&&!pending)play();}
 document.addEventListener("pointerdown",gesture,{capture:true});
 document.addEventListener("click",gesture,{capture:true});
 document.addEventListener("touchend",gesture,{capture:true,passive:true});
 document.addEventListener("keydown",gesture,{capture:true});
 audio.addEventListener("playing",()=>{
  blocked=false;visual(true);
  message("Louvores 24 horas • Rádio Infinita Graça no ar.");
 });
 audio.addEventListener("pause",()=>visual(false));
 audio.addEventListener("waiting",()=>{if(!blocked)message("Sintonizando o sinal de louvores...");});
 audio.addEventListener("stalled",()=>{if(!blocked)message("Aguardando o sinal da emissora...");});
 audio.addEventListener("error",()=>{
  pending=false;visual(false);
  message("O sinal da emissora está temporariamente indisponível. Tente atualizar a página.");
 });
 audio.addEventListener("ended",()=>{audio.load();play();});
 window.addEventListener("pageshow",()=>{if(audio.paused)play();});
 // Autoplay is best-effort: no fake guarantee that every device accepts it.
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",play,{once:true});
 else play();
})();
