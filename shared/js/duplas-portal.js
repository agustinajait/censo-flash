// Motor genérico del portal de duplas (home + pantalla de dupla + routing por
// ?dupla=NN). Usado por index.html (Censo Flash) y umbral-0/index.html.
// Requiere que config/<proyecto>.js ya haya seteado window.PROJECT_CONFIG.
(function(){

let CFG = null;

function getDuplaParam(){
  const s = new URLSearchParams(window.location.search);
  if(s.get('dupla')) return s.get('dupla').padStart(2,'0');
  return null;
}

function irHome(){
  history.pushState({}, '', '?');
  document.getElementById('dupla-screen').style.display = 'none';
  document.getElementById('home').style.display = 'block';
  window.scrollTo(0,0);
}

function mostrarDupla(d){
  document.getElementById('home').style.display = 'none';
  document.getElementById('dupla-screen').style.display = 'block';
  document.getElementById('d-num').textContent = d.id;
  document.getElementById('d-title').textContent = 'Dupla ' + d.id;
  document.getElementById('d-sub').textContent = d.poligono + ' · ' + d.zona;
  document.getElementById('d-mymaps').href = d.mymaps;
  document.getElementById('d-kobo').href = d.kobo;
  document.getElementById('cierre-link').href = './cierre.html?dupla=' + d.id;
  document.title = 'Dupla ' + d.id + ' — ' + d.zona;
  window.scrollTo(0,0);
}

function renderSinDuplas(){
  const grid = document.getElementById('dupla-grid');
  grid.outerHTML = '<div style="grid-column:1/-1;background:#fff;border:1.5px dashed var(--border);border-radius:12px;padding:20px;text-align:center;color:#6b7280;font-size:0.85rem;">Todavía no hay duplas cargadas para este proyecto.</div>';
}

function route(){
  const param = getDuplaParam();
  const d = (CFG.duplas||[]).find(x=>x.id===param);
  if(d) mostrarDupla(d);
  else document.getElementById('home').style.display = 'block';
}

function init(cfg){
  CFG = cfg || window.PROJECT_CONFIG;
  if(!CFG) return;

  const grid = document.getElementById('dupla-grid');
  if(!CFG.duplas || !CFG.duplas.length){
    renderSinDuplas();
  } else {
    CFG.duplas.forEach(d=>{
      const a = document.createElement('a');
      a.className = 'dupla-btn';
      a.href = '?dupla=' + d.id;
      a.onclick = e => { e.preventDefault(); history.pushState({}, '', '?dupla=' + d.id); mostrarDupla(d); };
      a.innerHTML = `<span class="dupla-num">${d.id}</span><span class="dupla-zona">${d.zona}</span>`;
      grid.appendChild(a);
    });
  }

  route();
  window.addEventListener('popstate', route);
}

window.DuplasPortal = { init, irHome };

})();
