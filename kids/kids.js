"use strict";
/* Área Kids Promessas — no data collection, no analytics, no storage, official YouTube embed only on click. */
(() => {
  const PLAYLIST_ID="PLRfwXwAZ_xLe2WVZqMYuFuvZjCmkWtWFu";
  const playerButton=document.getElementById("load-player");
  const videoFrame=document.getElementById("video-frame");
  const videoCover=document.getElementById("player-cover");
  playerButton.addEventListener("click",()=>{
    if(videoFrame.querySelector("iframe"))return;
    // Privacy-enhanced official YouTube player: no autoplay, initiated by an actual viewer click.
    const iframe=document.createElement("iframe");
    iframe.title="Playlist Marcelino Pão e Vinho — YouTube";
    iframe.src="https://www.youtube-nocookie.com/embed/videoseries?list="+PLAYLIST_ID+"&playsinline=1&rel=0";
    iframe.allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy="strict-origin-when-cross-origin";
    iframe.allowFullscreen=true;
    iframe.setAttribute("loading","eager");
    videoFrame.replaceChildren(iframe);
    videoFrame.hidden=false;
    videoCover.hidden=true;
    videoCover.style.display="none";
  });
  // Stop embedded playback on navigation away so it never keeps talking over the app.
  window.addEventListener("pagehide",()=>{
    const iframe=videoFrame.querySelector("iframe");
    if(iframe)iframe.src="about:blank";
  });

  const quiz=[
   {question:"Quem construiu uma grande arca para proteger os animais?",answers:["Moisés","Noé","Daniel","Davi"],correct:1,explain:"Muito bem! Noé construiu a arca. 🛶"},
   {question:"Quem venceu o gigante Golias com fé e coragem?",answers:["Davi","José","Pedro","Jonas"],correct:0,explain:"Isso mesmo! Davi confiou em Deus. 🌟"},
   {question:"Em que cidade Jesus nasceu?",answers:["Jerusalém","Nazaré","Belém","Jericó"],correct:2,explain:"Acertou! Jesus nasceu em Belém. ⭐"},
   {question:"O que Jesus nos ensina sobre as pessoas?",answers:["Deixar de ajudar","Brigar sempre","Amar e cuidar","Nunca perdoar"],correct:2,explain:"Muito bem! Amar e cuidar das pessoas é um gesto especial. 💛"}
  ];
  let questionIndex=0,score=0,answered=false;
  const progress=document.getElementById("quiz-progress");
  const question=document.getElementById("quiz-question");
  const choices=document.getElementById("quiz-choices");
  const feedback=document.getElementById("quiz-feedback");
  const next=document.getElementById("quiz-next");
  const restart=document.getElementById("quiz-restart");
  const stage=document.getElementById("quiz-stage");
  function render(){
    answered=false;choices.replaceChildren();
    const current=quiz[questionIndex];
    progress.textContent=(questionIndex+1)+" de "+quiz.length;
    question.textContent=current.question;
    feedback.textContent="";
    next.hidden=true;restart.hidden=true;
    current.answers.forEach((answer,i)=>{
      const b=document.createElement("button");
      b.type="button";b.className="quiz-option";b.textContent=answer;
      b.addEventListener("click",()=>{
        if(answered)return;
        answered=true;
        if(i===current.correct){score++;feedback.textContent=current.explain;}
        else feedback.textContent="Boa tentativa! A resposta é "+current.answers[current.correct]+". Vamos aprender juntos! 💜";
        choices.querySelectorAll("button").forEach((option,j)=>{
          option.disabled=true;
          if(j===current.correct)option.classList.add("correct");
          if(j===i&&i!==current.correct)option.classList.add("wrong");
        });
        next.hidden=false;
        next.textContent=questionIndex===quiz.length-1?"Ver meu resultado →":"Próxima pergunta →";
      });
      choices.appendChild(b);
    });
  }
  next.addEventListener("click",()=>{
    if(!answered)return;
    questionIndex++;
    if(questionIndex<quiz.length){render();return;}
    choices.replaceChildren();question.textContent="Você concluiu o Quiz da Alegria! 🎉";
    feedback.textContent="Você acertou "+score+" de "+quiz.length+" perguntas. Continue aprendendo com alegria!";
    progress.textContent="Parabéns!";next.hidden=true;restart.hidden=false;
  });
  restart.addEventListener("click",()=>{questionIndex=0;score=0;render();});
  render();

  const missions=[
    ["🌟","Faça um elogio sincero para alguém da sua família."],
    ["💛","Ajude alguém em uma pequena tarefa de casa."],
    ["🌻","Diga uma palavra gentil para uma pessoa hoje."],
    ["🫶","Separe um brinquedo ou livro em bom estado para compartilhar."],
    ["🙏","Faça uma oração agradecendo pelas pessoas que cuidam de você."],
    ["😊","Ofereça um sorriso e um abraço, se a pessoa gostar."]
  ];
  let mission=0;
  const missionContent=document.getElementById("mission-content");
  document.getElementById("new-mission").addEventListener("click",()=>{
    mission=(mission+1)%missions.length;
    const [symbol,message]=missions[mission];
    const emoji=document.createElement("span");emoji.setAttribute("aria-hidden","true");emoji.textContent=symbol;
    const text=document.createElement("strong");text.textContent=message;
    missionContent.replaceChildren(emoji,text);
  });
})();
