"use strict";
/* Embed only a validated church-shared YouTube video link.
   No untrusted HTML, streams or secret keys are processed here. */
(()=>{
 const q=new URLSearchParams(location.search);
 const id=q.get("video")||"";
 const aspect=q.get("formato")==="vertical"?"vertical":"horizontal";
 const holder=document.getElementById("watch-holder");
 holder.dataset.format=aspect;
 if(!/^[A-Za-z0-9_-]{11}$/.test(id))return;
 const frame=document.createElement("iframe");
 frame.src="https://www.youtube-nocookie.com/embed/"+id+"?playsinline=1&rel=0";
 frame.title="Transmissão da Igreja Ministério Promessas pelo YouTube";
 frame.allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share";
 frame.referrerPolicy="strict-origin-when-cross-origin";
 frame.setAttribute("allowfullscreen","");
 const stage=document.getElementById("video-stage");
 stage.append(frame);stage.hidden=false;
 document.getElementById("wait-card").hidden=true;
 document.getElementById("watch-status").textContent="VÍDEO DO CANAL DA IGREJA";
 document.getElementById("wait-description").textContent="Transmissão disponível pelo player oficial do YouTube.";
 document.getElementById("video-disclaimer").textContent="O vídeo pertence ao canal que originou a transmissão. A live estará em tempo real somente se o canal realmente estiver transmitindo.";
})();
