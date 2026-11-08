"use strict";
(function(){
 const audio=document.getElementById("vinheta-audio");
 const play=document.getElementById("play-btn");
 const icon=document.getElementById("play-icon");
 const card=document.querySelector(".player-card");
 const current=document.getElementById("current-time");
 const duration=document.getElementById("total-time");
 const seek=document.getElementById("seek");
 const status=document.getElementById("player-status");
 const time=t=>{if(!Number.isFinite(t))return"0:00";return Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0")};
 function update(){
   const isPlaying=!audio.paused&&!audio.ended;
   play.setAttribute("aria-label",isPlaying?"Pausar vinheta":"Reproduzir vinheta");
   icon.innerHTML=isPlaying?'<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>':'<path d="m9 5 11 7-11 7z"/>';
   card.classList.toggle("playing",isPlaying);
   current.textContent=time(audio.currentTime);
   if(Number.isFinite(audio.duration)){duration.textContent=time(audio.duration);seek.value=audio.duration?100*audio.currentTime/audio.duration:0;}
 }
 play.addEventListener("click",async()=>{
   try{if(audio.paused)await audio.play();else audio.pause();}
   catch(e){status.textContent="Não foi possível reproduzir agora. Verifique sua conexão e tente novamente.";}
   update();
 });
 audio.addEventListener("loadedmetadata",update);
 audio.addEventListener("timeupdate",update);
 audio.addEventListener("play",update);
 audio.addEventListener("pause",update);
 audio.addEventListener("ended",update);
 audio.addEventListener("error",()=>{status.textContent="A vinheta está temporariamente indisponível. Confira sua conexão.";update()});
 seek.addEventListener("input",()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=(Number(seek.value)/100)*audio.duration;});
 update();
})();
