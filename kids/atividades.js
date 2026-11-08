"use strict";
(()=>{
 const videos=[
  {id:"5rEPzpDkVOY",title:"A Arca de Noé",channel:"Canal da Sarah • 3 Palavrinhas",desc:"Uma historinha bíblica de Noé, contada para crianças.",cat:"biblia",a:"A Arca de",b:"Noé"},
  {id:"6t8-rZ1FbkA",title:"Coletânea de Histórias Bíblicas",channel:"3 Palavrinhas • Oficial",desc:"Histórias bíblicas de Noé, Davi, Daniel e muitos outros.",cat:"biblia",a:"Coletânea de",b:"Histórias Bíblicas"},
  {id:"AS3HHJX0Ekc",title:"Adão e Eva",channel:"3 Palavrinhas • Canal da Sarah",desc:"Uma historinha sobre escolhas, consequências e o amor de Deus.",cat:"valores",a:"Adão e",b:"Eva"}
 ];
 let chosen=0;
 const grid=document.getElementById("cartoon-grid"),videoFrame=document.getElementById("video-frame"),cover=document.getElementById("player-cover");
 function renderGallery(){
  grid.replaceChildren();
  const active=document.querySelector(".video-filter.active")?.dataset.category||"todos";
  videos.forEach((v,i)=>{
   if(active!=="todos"&&v.cat!==active)return;
   const card=document.createElement("article");card.className="cartoon-card"+(i===chosen?" current":"");
   const pic=document.createElement("img");pic.className="cartoon-thumb";pic.src="https://i.ytimg.com/vi/"+v.id+"/hqdefault.jpg";pic.loading="lazy";pic.alt="Capa do vídeo "+v.title;
   const body=document.createElement("div");body.className="cartoon-card-copy";
   const channel=document.createElement("small");channel.textContent=v.channel;
   const title=document.createElement("h4");title.textContent=v.title;
   const desc=document.createElement("p");desc.textContent=v.desc;
   const button=document.createElement("button");button.type="button";button.className="cartoon-pick";button.textContent=i===chosen?"▶ Selecionado":"▶ Escolher desenho";
   button.addEventListener("click",()=>selectVideo(i));
   body.append(channel,title,desc,button);card.append(pic,body);grid.append(card);
  });
 }
 function setTitle(id,a,b){
  const target=document.getElementById(id);target.replaceChildren(document.createTextNode(a+" "));
  const strong=document.createElement("em");strong.textContent=b;target.append(strong);
 }
 function selectVideo(i){
  chosen=i;const v=videos[i];
  window.PromessasKidsVideoId=v.id;
  window.PromessasKidsVideoTitle=v.title;
  const coverTitle=document.getElementById("cover-title");
  coverTitle.replaceChildren(document.createTextNode(v.a),document.createElement("br"));
  const accent=document.createElement("em");accent.textContent=v.b;coverTitle.append(accent);
  document.getElementById("cover-summary").textContent=v.desc;
  document.getElementById("featured-channel").textContent=v.channel.toUpperCase();
  setTitle("featured-title",v.a,v.b);
  document.getElementById("featured-summary").textContent=v.desc;
  document.getElementById("external-watch").href="https://www.youtube.com/watch?v="+v.id;
  videoFrame.replaceChildren();videoFrame.hidden=true;
  cover.hidden=false;cover.style.display="";
  renderGallery();document.getElementById("cineminha").scrollIntoView({behavior:"smooth",block:"start"});
 }
 document.querySelectorAll(".video-filter").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".video-filter").forEach(b=>{const current=b===btn;b.classList.toggle("active",current);b.setAttribute("aria-pressed",String(current));});renderGallery();
 }));
 window.PromessasKidsVideoId=videos[0].id;window.PromessasKidsVideoTitle=videos[0].title;
 renderGallery();

 const tabs=[...document.querySelectorAll(".game-tab")];
 tabs.forEach(btn=>btn.addEventListener("click",()=>{
  tabs.forEach(b=>{const active=b===btn;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
  document.querySelectorAll(".game-panel").forEach(el=>{const active=el.id==="game-"+btn.dataset.game;el.hidden=!active;el.classList.toggle("active",active);});
 }));
 function shuffle(arr){arr=arr.slice();for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
 const pairs=[["🚢","Arca"],["🦁","Leões"],["🌈","Promessa"],["⭐","Estrela"],["🐟","Peixe"],["📖","Bíblia"]];
 const mg=document.getElementById("memory-grid"),mf=document.getElementById("memory-feedback"),ms=document.getElementById("memory-score");
 let flipped=[],found=0,locked=false,timer=null;
 function resetMemory(){
  if(timer)clearTimeout(timer);timer=null;found=0;flipped=[];locked=false;mg.replaceChildren();
  ms.textContent="0 de 6 pares";mf.textContent="Escolha duas cartas para começar. 💜";
  shuffle(pairs.flatMap(([emoji,label],id)=>[{emoji,label,id},{emoji,label,id}])).forEach(item=>{
   const b=document.createElement("button");b.className="memory-card";b.type="button";b.textContent="✦";b.setAttribute("aria-label","Carta fechada");
   b.addEventListener("click",()=>{
    if(locked||b.disabled||b.classList.contains("revealed"))return;
    b.textContent=item.emoji;b.classList.add("revealed");b.setAttribute("aria-label",item.label);flipped.push({b,id:item.id});
    if(flipped.length!==2)return;
    const [x,y]=flipped;locked=true;
    if(x.id===y.id){
     for(const z of [x,y]){z.b.classList.add("matched");z.b.disabled=true;}
     found++;ms.textContent=found+" de 6 pares";mf.textContent=found===6?"Parabéns! Você achou todos os pares! 🎉":"Encontrou um par! Muito bem! ⭐";
     flipped=[];locked=false;
    }else{
     mf.textContent="Vamos tentar outra dupla! 😊";
     timer=setTimeout(()=>{for(const z of [x,y]){z.b.textContent="✦";z.b.classList.remove("revealed");z.b.setAttribute("aria-label","Carta fechada");}flipped=[];locked=false;timer=null;},900);
    }
   });
   mg.append(b);
  });
 }
 document.getElementById("memory-restart").addEventListener("click",resetMemory);resetMemory();

 const palette=["#f29a9d","#f5bb64","#ffe181","#83d3aa","#6cbfe2","#8e7be2","#caa2e8","#ffffff","#a97256","#3d477d"];
 let selectedColor=palette[0];
 const paletteEl=document.getElementById("paint-palette");
 for(const [i,color] of palette.entries()){
  const b=document.createElement("button");b.type="button";b.className="paint-color"+(i===0?" active":"");b.style.backgroundColor=color;b.setAttribute("aria-label","Cor "+(i+1));
  b.addEventListener("click",()=>{selectedColor=color;paletteEl.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));});paletteEl.append(b);
 }
 const paintArt=document.getElementById("paint-art"),initialArt=paintArt.innerHTML;
 paintArt.addEventListener("click",e=>{const x=e.target.closest("[data-paint]");if(!x||!paintArt.contains(x))return;x.setAttribute("fill",selectedColor);document.getElementById("paint-feedback").textContent="Que arte bonita! Continue colorindo! 🎨";});
 document.getElementById("paint-reset").addEventListener("click",()=>{paintArt.innerHTML=initialArt;document.getElementById("paint-feedback").textContent="Tudo pronto para pintar novamente!";});
 document.getElementById("paint-download").addEventListener("click",()=>{
  const copy=paintArt.cloneNode(true);copy.setAttribute("xmlns","http://www.w3.org/2000/svg");
  const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="promessas-kids-arca-de-noe.svg";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  document.getElementById("paint-feedback").textContent="Seu desenho está pronto para salvar! 💜";
 });
 const verses=[
  {ref:"1 João 4:8",words:["Deus","é","amor"]},
  {ref:"Salmo 23:1",words:["O","Senhor","é","meu","pastor"]},
  {ref:"João 11:35",words:["Jesus","chorou"]}
 ];
 let verseIndex=0,chosenWords=[];
 const answer=document.getElementById("words-answer"),bank=document.getElementById("words-bank"),feedback=document.getElementById("words-feedback"),next=document.getElementById("words-next");
 function drawAnswer(){
  answer.replaceChildren();if(!chosenWords.length){answer.textContent="Toque nas palavras abaixo ↓";return;}
  chosenWords.forEach(t=>{const x=document.createElement("button");x.type="button";x.className="word-token selected";x.textContent=t.word;x.title="Remover palavra";x.addEventListener("click",()=>{chosenWords=chosenWords.filter(w=>w.index!==t.index);t.btn.disabled=false;feedback.textContent="";drawAnswer();});answer.append(x);});
 }
 function startWords(){
  const v=verses[verseIndex];chosenWords=[];bank.replaceChildren();feedback.textContent="";
  document.getElementById("words-reference").textContent=v.ref;document.getElementById("words-progress").textContent="Desafio "+(verseIndex+1)+" de "+verses.length;
  document.getElementById("words-check").hidden=false;next.hidden=true;
  shuffle(v.words.map((word,index)=>({word,index}))).forEach(t=>{
   const b=document.createElement("button");b.type="button";b.className="word-token";b.textContent=t.word;
   b.addEventListener("click",()=>{b.disabled=true;chosenWords.push({...t,btn:b});feedback.textContent="";drawAnswer();});bank.append(b);
  });drawAnswer();
 }
 document.getElementById("words-reset").addEventListener("click",startWords);
 document.getElementById("words-check").addEventListener("click",()=>{
  const v=verses[verseIndex];
  if(chosenWords.length!==v.words.length){feedback.textContent="Escolha todas as palavras primeiro!";return;}
  if(chosenWords.every((x,i)=>x.word===v.words[i])){
   feedback.textContent="Muito bem! Você acertou o versículo! 🌟";document.getElementById("words-check").hidden=true;
   next.textContent=verseIndex===verses.length-1?"Jogar novamente ↻":"Próxima frase →";next.hidden=false;
  }else feedback.textContent="Quase! Toque em uma palavra para removê-la e tentar de novo. 💜";
 });
 next.addEventListener("click",()=>{verseIndex=(verseIndex+1)%verses.length;startWords();});startWords();
})();
