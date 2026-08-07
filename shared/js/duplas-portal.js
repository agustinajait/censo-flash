// Motor genérico del portal de duplas (home + pantalla de dupla + routing por
// ?dupla=NN). Usado por index.html (Censo Flash) y umbral-0/index.html.
// Requiere que config/<proyecto>.js ya haya seteado window.PROJECT_CONFIG.
(function(){

let CFG = null;
let currentDupla = null;

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

// ── "Marcar presente" — reemplaza el aviso por WhatsApp de que la dupla
// arrancó el recorrido. Se guarda un registro local por dupla/día para que
// el botón recuerde que ya se avisó si se recarga la página, y se manda al
// mismo Apps Script que recibe los cierres (con tipo:'presente' para que el
// backend lo distinga y lo guarde aparte).
function presenteKey(duplaId){
  const hoy = new Date().toISOString().split('T')[0];
  return 'presente_' + (CFG ? CFG.id : '') + '_' + duplaId + '_' + hoy;
}

function pintarBotonPresente(duplaId){
  const btn = document.getElementById('presente-btn');
  if(!btn) return;
  const yaPresente = localStorage.getItem(presenteKey(duplaId));
  if(yaPresente){
    btn.disabled = true;
    btn.textContent = '✅ Diste presente a las ' + yaPresente;
  } else {
    btn.disabled = false;
    btn.textContent = '▶️ Marcar inicio del recorrido';
  }
}

async function marcarPresente(){
  if(!currentDupla) return;
  const btn = document.getElementById('presente-btn');
  if(!CFG.appsScriptUrl){
    alert('Este proyecto todavía no tiene conectado el backend de cierres. Avisá al administrador.');
    return;
  }
  const now = new Date();
  const hora = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';
  try{
    await fetch(CFG.appsScriptUrl, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ proyecto: CFG.id, dupla: currentDupla.id, tipo:'presente', hora, timestamp: now.toISOString() })
    });
    localStorage.setItem(presenteKey(currentDupla.id), hora);
    pintarBotonPresente(currentDupla.id);
  }catch(e){
    btn.disabled = false;
    btn.textContent = '▶️ Marcar inicio del recorrido';
    alert('Error al enviar. Verificá tu conexión e intentá nuevamente.');
  }
}

function mostrarDupla(d){
  currentDupla = d;
  document.getElementById('home').style.display = 'none';
  document.getElementById('dupla-screen').style.display = 'block';
  document.getElementById('d-num').textContent = d.id;
  document.getElementById('d-title').textContent = 'Dupla ' + d.id;
  document.getElementById('d-sub').textContent = d.poligono + ' · ' + d.zona;
  document.getElementById('d-mymaps').href = d.mymaps;
  document.getElementById('d-kobo').href = d.kobo;
  document.getElementById('cierre-link').href = './cierre.html?dupla=' + d.id;
  pintarBotonPresente(d.id);
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

window.DuplasPortal = { init, irHome, marcarPresente };

})();
