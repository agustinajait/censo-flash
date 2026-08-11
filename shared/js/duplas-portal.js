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

function hoyStr(){
  return new Date().toISOString().split('T')[0];
}

// ── "Marcar presente" — reemplaza el aviso por WhatsApp de que la dupla
// arrancó el recorrido. Se guarda un registro local por dupla/día para que
// el botón recuerde que ya se avisó si se recarga la página, y se manda al
// mismo Apps Script que recibe los cierres (con tipo:'presente' para que el
// backend lo distinga y lo guarde aparte).
function presenteKey(duplaId){
  return 'presente_' + (CFG ? CFG.id : '') + '_' + duplaId + '_' + hoyStr();
}
function ausenteKey(duplaId){
  return 'ausente_' + (CFG ? CFG.id : '') + '_' + duplaId + '_' + hoyStr();
}

function pintarEstadoAsistencia(duplaId){
  const btnPresente = document.getElementById('presente-btn');
  const ausenteForm = document.getElementById('ausente-form');
  const ausenteOk = document.getElementById('ausente-ok');
  const yaAusente = localStorage.getItem(ausenteKey(duplaId));
  const yaPresente = localStorage.getItem(presenteKey(duplaId));

  if(yaAusente){
    // Marcó ausencia: el botón de "marcar inicio" queda deshabilitado (no
    // va a salir hoy) y se muestra la confirmación en vez del formulario.
    if(btnPresente){ btnPresente.disabled = true; btnPresente.textContent = '🚫 No salís hoy (marcaste ausencia)'; }
    if(ausenteForm) ausenteForm.style.display = 'none';
    if(ausenteOk){
      ausenteOk.style.display = 'block';
      let texto = '✅ Marcaste ausencia por hoy';
      try{
        const info = JSON.parse(yaAusente);
        if(info.recupera) texto += ' — recuperás el ' + fmtDDMM(info.recupera);
      }catch(e){}
      ausenteOk.textContent = texto;
    }
    return;
  }

  if(ausenteForm) ausenteForm.style.display = 'block';
  if(document.getElementById('ausente-ok')) document.getElementById('ausente-ok').style.display = 'none';

  if(!btnPresente) return;
  if(yaPresente){
    btnPresente.disabled = true;
    btnPresente.textContent = '✅ Diste presente a las ' + yaPresente;
  } else {
    btnPresente.disabled = false;
    btnPresente.textContent = '▶️ Marcar inicio del recorrido';
  }
}

function fmtDDMM(dateStr){
  const [y,m,d] = String(dateStr).split('-');
  return d && m ? `${parseInt(d)}/${parseInt(m)}` : dateStr;
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
    pintarEstadoAsistencia(currentDupla.id);
  }catch(e){
    btn.disabled = false;
    btn.textContent = '▶️ Marcar inicio del recorrido';
    alert('Error al enviar. Verificá tu conexión e intentá nuevamente.');
  }
}

// ── "Marcar ausente" — para cuando la dupla no sale esa noche. Pide el día
// que recupera (obligatorio, para que quede registrado el acuerdo) y un
// motivo opcional. Mismo Apps Script, con tipo:'ausente'.
async function marcarAusente(){
  if(!currentDupla) return;
  if(!CFG.appsScriptUrl){
    alert('Este proyecto todavía no tiene conectado el backend de cierres. Avisá al administrador.');
    return;
  }
  const recupera = (document.getElementById('ausente-recupera')||{}).value || '';
  const motivo = (document.getElementById('ausente-motivo')||{}).value || '';
  if(!recupera){
    alert('Elegí qué día vas a recuperar antes de marcar la ausencia.');
    return;
  }
  const btn = document.getElementById('ausente-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';
  try{
    await fetch(CFG.appsScriptUrl, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ proyecto: CFG.id, dupla: currentDupla.id, tipo:'ausente', recupera, motivo, timestamp: new Date().toISOString() })
    });
    localStorage.setItem(ausenteKey(currentDupla.id), JSON.stringify({recupera, motivo}));
    pintarEstadoAsistencia(currentDupla.id);
  }catch(e){
    btn.disabled = false;
    btn.textContent = '🚫 Marcar ausente hoy';
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
  pintarEstadoAsistencia(d.id);
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

window.DuplasPortal = { init, irHome, marcarPresente, marcarAusente };

})();
