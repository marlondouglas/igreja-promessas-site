
(function(){
  if(!navigator.userAgent.includes("IgrejaPromessasApp/"))return;
  document.documentElement.classList.add("promessas-native-app");
  function init(){
    const menu=document.querySelector(".links");
    if(menu && !menu.querySelector(".app-native-site-link")){
      const link=document.createElement("a");
      link.className="app-native-site-link";
      link.href="https://igrejapromessas.site/?abrir-no-navegador=1";
      link.textContent="Abrir site oficial ↗";
      link.setAttribute("aria-label","Abrir o site oficial no navegador");
      menu.appendChild(link);
    }
    document.querySelectorAll('a[href*="/downloads/Igreja-Promessas-Android"]').forEach(a=>{
      a.hidden=true;
      const container=a.closest(".app-download-inline");
      if(container) container.hidden=true;
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else init();
})();
