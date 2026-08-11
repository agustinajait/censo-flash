// Motor genérico del dashboard unificado de la plataforma.
// Requiere que config/platform.js y config/projects.js ya se hayan cargado
// (window.PLATFORM_AUTH, window.PLATFORM_PROJECTS).
//
// Reemplaza el cálculo por dupla/comuna que en el dashboard viejo estaba
// hardcodeado con números de un operativo pasado (personasPorDupla, comunaVals):
// acá se agrupa en vivo por el campo `dupla` que cada parseRow() del config ya
// extrae de cada registro de KoBo, así que cualquier operativo nuevo (o
// proyecto nuevo) muestra sus cifras reales, no las de una carga anterior.
(function(){

let currentRole = null;       // 'admin' | 'client'
let lockedProjectId = null;   // si currentRole==='client', el único proyecto que puede ver
let charts = {};
let activeProjectId = null;   // id de proyecto activo, o '__global__'
let dataByProject = {};       // { [projectId]: allData }

const STORAGE_PREFIX = 'platform_data_';
const LEGACY_KEY = 'censoflash_v3'; // dashboard viejo de Censo Flash — se migra una vez
// Sesión en sessionStorage (no localStorage): sobrevive a un F5/refresh,
// pero se cierra sola si cerrás la pestaña o el navegador — no queda
// logueado para siempre en una compu compartida.
const SESSION_KEY = 'dash_session';

function getProject(id){
  return (window.PLATFORM_PROJECTS||[]).find(p=>p.id===id) || null;
}

// ── AUTH ──────────────────────────────────────────────────────────────
// La contraseña de admin (config/platform.js) ve todos los proyectos, la
// vista global y los controles de carga. Dentro de cada proyecto hay dos
// contraseñas más, ambas encerradas en ESE proyecto nada más (nunca ven
// otros proyectos ni entre sí):
//   - clientPassword → el cliente (rendición de cuentas): ve todo,
//     incluida la sección KoBo como referencia.
//   - coordPassword  → quien coordina el operativo día a día: ve todo lo
//     operativo (duplas activas, cierres, alertas) pero SIN la sección KoBo.
function togglePwd(){
  const input = document.getElementById('pwd-input');
  const btn = document.getElementById('pwd-toggle-btn');
  if(!input || !btn) return;
  const shown = input.type === 'text';
  input.type = shown ? 'password' : 'text';
  btn.textContent = shown ? '👁️' : '🙈';
  btn.setAttribute('aria-label', shown ? 'Mostrar contraseña' : 'Ocultar contraseña');
  input.focus();
}

function saveSession(){
  try{
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({role: currentRole, projectId: lockedProjectId}));
  }catch(e){ /* sessionStorage bloqueado (modo privado, etc.) — no pasa nada, solo no persiste */ }
}

function clearSession(){
  try{ sessionStorage.removeItem(SESSION_KEY); }catch(e){}
}

// Se llama sola al cargar la página: si hay una sesión guardada de un F5
// anterior, entra directo sin mostrar el login de nuevo.
function restoreSession(){
  let saved = null;
  try{ saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }catch(e){}
  if(!saved || !saved.role) return;

  if(saved.role === 'admin'){
    currentRole = 'admin';
    lockedProjectId = null;
    startApp();
    return;
  }
  if((saved.role === 'client' || saved.role === 'coordinador') && saved.projectId && getProject(saved.projectId)){
    currentRole = saved.role;
    lockedProjectId = saved.projectId;
    startApp();
    return;
  }
  clearSession(); // sesión guardada inválida (ej. proyecto que ya no existe)
}

function doLogin(){
  const pwd = document.getElementById('pwd-input').value;
  const auth = window.PLATFORM_AUTH || {};

  if(pwd && pwd === auth.admin){
    currentRole = 'admin';
    lockedProjectId = null;
    saveSession();
    startApp();
    return;
  }

  const clientProject = (window.PLATFORM_PROJECTS||[]).find(p => p.clientPassword && p.clientPassword === pwd);
  if(clientProject){
    currentRole = 'client';
    lockedProjectId = clientProject.id;
    saveSession();
    startApp();
    return;
  }

  const coordProject = (window.PLATFORM_PROJECTS||[]).find(p => p.coordPassword && p.coordPassword === pwd);
  if(coordProject){
    currentRole = 'coordinador';
    lockedProjectId = coordProject.id;
    saveSession();
    startApp();
    return;
  }

  document.getElementById('login-error').style.display = 'block';
}

function startApp(){
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  const navDate = document.getElementById('nav-date');
  if(navDate){
    const hoyLegible = new Date().toLocaleDateString('es-AR', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
    navDate.textContent = '📅 ' + hoyLegible.charAt(0).toUpperCase() + hoyLegible.slice(1);
  }

  if(currentRole === 'admin'){
    document.getElementById('nav-user').textContent = '👤 Administrador';
  } else {
    const proj = getProject(lockedProjectId);
    const icono = currentRole === 'coordinador' ? '🧭 Coordinación —' : '🏛️';
    document.getElementById('nav-user').textContent = icono + ' ' + (proj ? proj.nombre : 'Cliente');
  }

  // Migración única del localStorage del dashboard viejo de Censo Flash.
  const legacy = localStorage.getItem(LEGACY_KEY);
  if(legacy && !localStorage.getItem(STORAGE_PREFIX+'censo-flash')){
    localStorage.setItem(STORAGE_PREFIX+'censo-flash', legacy);
  }

  renderTabs();
  if(currentRole === 'admin'){
    const first = (window.PLATFORM_PROJECTS||[])[0];
    selectProject(first ? first.id : '__global__');
  } else {
    selectProject(lockedProjectId);
  }
}

function logout(){
  currentRole = null;
  lockedProjectId = null;
  clearSession();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('pwd-input').value = '';
  document.getElementById('login-error').style.display = 'none';
}

// ── TABS DE PROYECTO ─────────────────────────────────────────────────
// Un cliente (currentRole==='client') solo ve la pestaña de su propio
// proyecto — ni las de otros proyectos ni "Todos los proyectos".
function renderTabs(){
  const wrap = document.getElementById('project-tabs');
  wrap.innerHTML = '';

  if(currentRole !== 'admin'){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'flex';

  (window.PLATFORM_PROJECTS||[]).forEach(p=>{
    const b = document.createElement('button');
    b.className = 'tab-btn';
    b.dataset.project = p.id;
    b.textContent = (p.emoji ? p.emoji+' ' : '') + p.nombre;
    b.onclick = ()=>selectProject(p.id);
    wrap.appendChild(b);
  });
  const gb = document.createElement('button');
  gb.className = 'tab-btn';
  gb.dataset.project = '__global__';
  gb.textContent = '🌐 Todos los proyectos';
  gb.onclick = ()=>selectProject('__global__');
  wrap.appendChild(gb);
}

function markActiveTab(){
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.project===activeProjectId);
  });
}

function selectProject(id){
  // Defensa en profundidad: un cliente no puede navegar a otro proyecto ni
  // a la vista global aunque manipule el DOM — siempre queda en el suyo.
  if(currentRole !== 'admin' && id !== lockedProjectId){
    id = lockedProjectId;
  }

  activeProjectId = id;
  markActiveTab();

  if(id === '__global__'){
    document.getElementById('upload-section').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('no-data').style.display = 'none';
    document.getElementById('global-dashboard').style.display = 'block';
    renderGlobalView();
    return;
  }

  document.getElementById('global-dashboard').style.display = 'none';
  const project = getProject(id);
  if(!project) return;

  document.getElementById('upload-section').style.display = currentRole==='admin' ? 'block' : 'none';
  buildUploadFields(project);

  const cached = dataByProject[id] || loadFromStorage(id);
  if(cached){
    dataByProject[id] = cached;
    document.getElementById('no-data').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderDashboard(project, cached);
  } else {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('no-data').style.display = 'block';
  }

  // Si el proyecto tiene el Sheet conectado en vivo, no hace falta que nadie
  // suba nada: se refresca solo al abrir la pestaña (para admin Y cliente).
  if(project.sheetReadKey){
    autoRefreshSheet(project);
  }
}

function loadFromStorage(id){
  const raw = localStorage.getItem(STORAGE_PREFIX+id);
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch(e){ return null; }
}
function saveToStorage(id, data){
  localStorage.setItem(STORAGE_PREFIX+id, JSON.stringify(data));
}

// ── CAMPOS DE CARGA (dinámicos según los formularios KoBo del proyecto) ─
function fieldHtml(id, label){
  return `<div class="upload-field"><div class="upload-label">${label}</div><input type="file" class="file-inp" id="${id}" accept=".xlsx,.xls"></div>`;
}

function buildUploadFields(project){
  const wrapArchivo = document.getElementById('modo-archivo-files');
  const wrapApi = document.getElementById('modo-api-files');
  wrapArchivo.innerHTML = fieldHtml('file-sheet', 'Sheet de Cierres (.xlsx)') + fieldHtml('file-presentes', 'Sheet de Presentes (.xlsx)');
  (project.kobo.forms||[]).forEach((f,i)=>{
    wrapArchivo.innerHTML += fieldHtml('file-form-'+i, f.nombre + ' (.xlsx)');
  });

  wrapApi.innerHTML = '';
  if(project.sheetReadKey){
    wrapApi.innerHTML += '<div style="font-size:0.78rem;color:#065f46;max-width:300px;">✅ Cierres y Presentes se traen solos — no hace falta subir ni cargar nada, se actualiza cada vez que abrís esta pestaña. (KoBo no está conectado — se ve directo en KoBo.)</div>';
  } else {
    wrapApi.innerHTML += fieldHtml('file-sheet-api', 'Sheet de Cierres (.xlsx)') + fieldHtml('file-presentes-api', 'Sheet de Presentes (.xlsx)');
    if(!project.kobo.token || !(project.kobo.forms||[]).length){
      wrapApi.innerHTML += '<div style="font-size:0.78rem;color:#92400e;max-width:260px;">⚠️ Este proyecto todavía no tiene KoBo conectado.</div>';
    }
  }
}

// ── LECTURA EN VIVO (doGet del Apps Script — Cierres + Presentes + KoBo) ─
// El Apps Script le pide los datos a KoBo desde el servidor de Google, no
// desde el navegador — por eso acá no hay problema de CORS con KoBo.
async function fetchSheetData(project){
  const sep = project.appsScriptUrl.includes('?') ? '&' : '?';
  const url = project.appsScriptUrl + sep + 'key=' + encodeURIComponent(project.sheetReadKey);
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('HTTP '+resp.status);
  const json = await resp.json();
  if(json.error) throw new Error(json.error);
  return json; // { cierres:[...], presentes:[...], koboForms:[{id, rows}] }
}

// Arma el mismo `raw` que espera buildData(), pero con todo (Cierres,
// Presentes y KoBo) sacado del doGet del Apps Script en una sola pasada.
async function fetchLiveData(project, inicio, fin){
  const sheetData = await fetchSheetData(project);
  const raw = {
    sheet: sheetData.cierres || [],
    presentes: sheetData.presentes || [],
    ausencias: sheetData.ausencias || [],
    formRows: (project.kobo.forms||[]).map(form=>{
      const match = (sheetData.koboForms||[]).find(k=>k.id===form.id);
      return match ? match.rows : null;
    }),
    inicio: inicio||'', fin: fin||'',
    loaded: new Date().toISOString(),
  };
  return buildData(raw, project);
}

// Se llama sola al abrir la pestaña de un proyecto (admin o cliente) — no
// hace falta que nadie toque un botón. Si falla y ya había datos cacheados,
// no rompe la vista (se queda con lo último bueno); si no hay nada
// cacheado, avisa en upload-status (si existe, solo lo ve el admin).
async function autoRefreshSheet(project){
  try{
    const data = await fetchLiveData(project);
    if(activeProjectId !== project.id) return; // cambiaron de pestaña mientras cargaba
    dataByProject[project.id] = data;
    saveToStorage(project.id, data);
    document.getElementById('no-data').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderDashboard(project, data);
    hideLiveWarning();
  }catch(e){
    console.error('Auto-refresh falló', e);
    // Antes esto quedaba mudo si ya había algo cacheado — mostraba datos
    // viejos sin avisar. Ahora siempre se ve un aviso, para no confundir
    // una carga vieja con la realidad de ahora mismo.
    showLiveWarning('No se pudo actualizar en vivo ahora mismo (' + e.message + '). Esto que ves puede estar desactualizado.');
    if(!dataByProject[project.id]){
      const st = document.getElementById('upload-status');
      if(st) st.textContent = '⚠️ No se pudo conectar en vivo: '+e.message;
    }
  }
}

function showLiveWarning(msg){
  const el = document.getElementById('live-warning');
  if(!el) return;
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
}
function hideLiveWarning(){
  const el = document.getElementById('live-warning');
  if(el) el.style.display = 'none';
}

function toggleModo(){
  const modo = document.getElementById('modo-carga').value;
  document.getElementById('modo-api').style.display = modo==='api' ? 'flex' : 'none';
  document.getElementById('modo-archivo').style.display = modo==='archivo' ? 'flex' : 'none';
}

// ── EXCEL / FECHAS ───────────────────────────────────────────────────
function readExcel(file){
  return new Promise((res,rej)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      try{
        const wb = XLSX.read(e.target.result, {type:'array', cellDates:true});
        res(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {raw:false}));
      }catch(err){ rej(err); }
    };
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });
}
function toDateStr(v){
  if(!v) return '';
  let d = v instanceof Date ? v : new Date(v);
  if(isNaN(d.getTime())) return '';
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
// Antes, una fecha vacía/no reconocible "pasaba" cualquier filtro (por
// las dudas de no ocultar nada) — pero eso hacía que filas viejas con datos
// incompletos (sin Timestamp/Día usable) aparecieran en CUALQUIER rango que
// pusieras, incluido "hoy", aunque no fueran de hoy. Ahora una fecha
// desconocida solo entra cuando no se pidió ningún rango (desde/hasta
// vacíos = "mostrar todo", que es el estado de "✕ Limpiar").
//
// OJO acá: `dateVal` viene siempre de un campo `_fecha` que YA pasó por
// toDateStr() al armar la fila (parseCierreRow/parsePresenteRow/etc.) —
// ya es un string "YYYY-MM-DD", no una fecha cruda. Antes esta función lo
// volvía a mandar a toDateStr(), y `new Date("YYYY-MM-DD")` (sin hora) se
// interpreta como medianoche UTC — que en un huso horario negativo como
// Argentina (UTC-3) cae en el DÍA ANTERIOR al convertirla a hora local. Eso
// corría todos los cierres de hoy al filtro de "ayer" y hacía que "Hoy"
// apareciera vacío aunque hubiera cierres cargados esa misma tarde. Acá no
// hay que volver a parsear nada: ya es un string comparable tal cual.
function inRange(dateVal, desde, hasta){
  if(!desde && !hasta) return true;
  const ds = dateVal || '';
  if(!ds) return false;
  if(desde && ds<desde) return false;
  if(hasta && ds>hasta) return false;
  return true;
}
// Escapa texto libre cargado por las duplas (Sheet de cierres) antes de
// insertarlo con innerHTML — evita que un campo de texto con HTML/script
// se ejecute en el dashboard.
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// Normaliza cualquier forma de dupla ("5", "05", "Dupla 05"...) al mismo
// formato de 2 dígitos que usan los ids en config/<proyecto>.js.
function normDupla(x){
  if(x===null || x===undefined || x==='') return null;
  const n = parseInt(String(x).replace(/\D/g,''), 10);
  return isNaN(n) ? null : String(n).padStart(2,'0');
}

// ── PARSEO DE CIERRES (Sheet — mismo formato para todos los proyectos) ──
function parseCierreRow(r){
  const duplaRaw = r['Dupla']||r['dupla']||'';
  return {
    dupla: normDupla(duplaRaw) || String(duplaRaw).trim(),
    poligono: r['Polígono']||r['Poligono']||r['poligono']||'—',
    responsable: r['Responsable']||r['responsable']||'—',
    inicio: r['Inicio']||r['inicio']||'—',
    cierre: r['Cierre']||r['cierre']||'—',
    tiempo: r['Tiempo total']||r['tiempo_total']||'—',
    registros: parseInt(r['Registros']||r['registros']||0)||0,
    clima: r['Clima']||r['clima']||'—',
    inconvenientes: r['Inconvenientes']||r['inconvenientes']||'Ninguno',
    eventos: r['Eventos']||r['eventos']||'Ninguno',
    situaciones: String(r['Situaciones']||r['situaciones']||''),
    observaciones: String(r['Observaciones']||r['observaciones']||''),
    foto: String(r['Foto']||r['foto']||''),
    _fecha: toDateStr(r['Timestamp']||r['Dia']||r['dia']||''),
  };
}

// ── PARSEO DE "PRESENTES" (pestaña que llena el botón "Marcar inicio del
// recorrido" del portal de duplas — reemplaza el aviso por WhatsApp) ──
function parsePresenteRow(r){
  const duplaRaw = r['Dupla']||r['dupla']||'';
  return {
    dupla: normDupla(duplaRaw),
    hora: r['Hora']||r['hora']||'',
    _fecha: toDateStr(r['Timestamp']||r['timestamp']||''),
  };
}

// ── PARSEO DE "AUSENCIAS" (pestaña que llena el botón "Marcar ausente hoy"
// del portal de duplas) ──
function parseAusenteRow(r){
  const duplaRaw = r['Dupla']||r['dupla']||'';
  return {
    dupla: normDupla(duplaRaw),
    recupera: r['Recupera']||r['recupera']||'',
    motivo: r['Motivo']||r['motivo']||'',
    _fecha: toDateStr(r['Timestamp']||r['timestamp']||''),
  };
}

// ── BUILD DATA ────────────────────────────────────────────────────────
// Nota: NO se filtra por fecha acá — se carga todo lo que venga en el
// archivo/API. "Fecha inicio"/"Fecha fin" del formulario de carga son solo
// una sugerencia inicial para el filtro visual (filter-desde/filter-hasta),
// nunca una exclusión permanente: si se dejan vacías o mal puestas, no se
// pierden datos, y el filtro de arriba siempre puede ampliarse después.
function buildData(raw, project){
  const d = {inicio:raw.inicio, fin:raw.fin, loaded:raw.loaded, cierres:[], koboRows:[], presentes:[], ausencias:[]};
  if(raw.sheet) d.cierres = raw.sheet.map(parseCierreRow);
  if(raw.presentes) d.presentes = raw.presentes.map(parsePresenteRow).filter(p=>p.dupla);
  if(raw.ausencias) d.ausencias = raw.ausencias.map(parseAusenteRow).filter(a=>a.dupla);

  (project.kobo.forms||[]).forEach((form, idx)=>{
    const rows = (raw.formRows||[])[idx];
    if(!rows) return;
    rows.forEach(r=>{
      const startVal = r['start']||r['_submission_time'];
      let parsed;
      try{ parsed = form.parseRow(r); }catch(e){ parsed = null; }
      if(!parsed || !(parsed.personas>0)) return;
      const fecha = toDateStr(parsed.fecha || startVal);
      d.koboRows.push({
        personas: parsed.personas,
        situacion: parsed.situacion || '—',
        hora: parsed.hora!=null ? parsed.hora : (startVal ? new Date(startVal).getHours() : null),
        fecha, _fecha: fecha,
        formulario: parsed.formulario || form.nombre,
        dupla: normDupla(parsed.dupla),
      });
    });
  });

  d.koboTotal = d.koboRows.reduce((a,r)=>a+r.personas,0);

  // Si no se indicó un rango de fechas al cargar, lo derivamos de los datos
  // reales para que el banner y el filtro arranquen mostrando todo.
  if(!d.inicio || !d.fin){
    const fechas = d.koboRows.map(r=>r.fecha).filter(Boolean).sort();
    if(fechas.length){
      d.inicio = d.inicio || fechas[0];
      d.fin = d.fin || fechas[fechas.length-1];
    }
  }
  return d;
}

// ── CARGA: ARCHIVOS ──────────────────────────────────────────────────
async function processFiles(){
  const project = getProject(activeProjectId);
  if(!project) return;
  const fSheet = document.getElementById('file-sheet').files[0];
  const fPresentes = document.getElementById('file-presentes').files[0];
  const formFiles = (project.kobo.forms||[]).map((f,i)=>document.getElementById('file-form-'+i).files[0]);
  const inicio = document.getElementById('fecha-inicio').value;
  const fin = document.getElementById('fecha-fin').value;
  if(!fSheet && !fPresentes && !formFiles.some(Boolean)){ alert('Cargá al menos un archivo.'); return; }
  const st = document.getElementById('upload-status');
  st.textContent = '⏳ Procesando...';
  try{
    const raw = {sheet:null, presentes:null, formRows:[], inicio, fin, loaded:new Date().toISOString()};
    if(fSheet) raw.sheet = await readExcel(fSheet);
    if(fPresentes) raw.presentes = await readExcel(fPresentes);
    for(let i=0;i<formFiles.length;i++){
      raw.formRows[i] = formFiles[i] ? await readExcel(formFiles[i]) : null;
    }
    const data = buildData(raw, project);
    dataByProject[project.id] = data;
    saveToStorage(project.id, data);
    st.textContent = `✅ ${data.koboTotal} personas · ${data.koboRows.length} puntos KoBo · ${data.cierres.length} cierres`;
    document.getElementById('no-data').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderDashboard(project, data);
  }catch(e){ st.textContent = '❌ '+e.message; console.error(e); }
}

// ── CARGA: API DE KOBO ───────────────────────────────────────────────
async function fetchKoboAll(project, assetId){
  let results = [], next = `${project.kobo.base}/${assetId}/data/?format=json&limit=3000`;
  while(next){
    const resp = await fetch(next, {headers:{'Authorization':`Token ${project.kobo.token}`}});
    if(!resp.ok) throw new Error(`KoBo error ${resp.status} en ${assetId}`);
    const data = await resp.json();
    results = results.concat(data.results || []);
    next = data.next || null;
  }
  return results;
}

async function loadFromAPI(){
  const project = getProject(activeProjectId);
  if(!project) return;
  const inicio = document.getElementById('fecha-inicio').value;
  const fin = document.getElementById('fecha-fin').value;
  const st = document.getElementById('upload-status');

  // Camino normal (Censo Flash hoy): todo — Cierres, Presentes y KoBo —
  // sale del mismo doGet del Apps Script, sin CORS y sin subir nada.
  if(project.sheetReadKey){
    st.textContent = '⏳ Actualizando...';
    try{
      const data = await fetchLiveData(project, inicio, fin);
      dataByProject[project.id] = data;
      saveToStorage(project.id, data);
      st.textContent = `✅ ${data.koboTotal} personas · ${data.koboRows.length} puntos · ${data.cierres.length} cierres`;
      document.getElementById('no-data').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      renderDashboard(project, data);
      hideLiveWarning();
    }catch(e){
      st.textContent = '❌ Error: '+e.message;
      console.error(e);
      showLiveWarning('No se pudo actualizar en vivo (' + e.message + '). Esto que ves puede estar desactualizado.');
    }
    return;
  }

  // Camino de respaldo, para proyectos sin el Sheet en vivo todavía (hoy,
  // Umbral 0): KoBo directo desde el navegador (puede fallar por CORS) +
  // archivos subidos a mano.
  const tieneKobo = project.kobo.token && (project.kobo.forms||[]).length;
  if(!tieneKobo){
    st.textContent = '❌ Este proyecto no tiene KoBo ni el Sheet en vivo configurados todavía.';
    return;
  }

  const raw = {sheet:null, presentes:null, formRows:[], inicio, fin, loaded:new Date().toISOString()};
  let koboError = null;
  try{
    for(let i=0;i<project.kobo.forms.length;i++){
      const form = project.kobo.forms[i];
      st.textContent = `⏳ Descargando ${form.nombre}...`;
      raw.formRows[i] = await fetchKoboAll(project, form.id);
    }
  }catch(e){ koboError = e.message; }

  const fSheet = document.getElementById('file-sheet-api')?.files[0];
  const fPresentes = document.getElementById('file-presentes-api')?.files[0];
  if(fSheet) raw.sheet = await readExcel(fSheet);
  if(fPresentes) raw.presentes = await readExcel(fPresentes);

  const data = buildData(raw, project);
  dataByProject[project.id] = data;
  saveToStorage(project.id, data);
  st.textContent = (koboError ? `⚠️ KoBo falló (${koboError}) — ` : '✅ ') +
    `${data.koboTotal} personas · ${data.koboRows.length} puntos · ${data.cierres.length} cierres`;
  document.getElementById('no-data').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  renderDashboard(project, data);
}

// ── RENDER ────────────────────────────────────────────────────────────
function fmtDate(d){
  if(!d) return '—';
  const [y,m,day] = d.split('-');
  return `${parseInt(day)}/${parseInt(m)}/${y}`;
}
function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// Al abrir (o auto-refrescar) el dashboard te posiciona en el día de hoy en
// vez de mostrar todo el histórico junto — así se ve directo la actividad
// de la jornada actual (duplas activas, cierres de hoy). "✕ Limpiar" en el
// filtro sigue llevando a ver el rango completo si hace falta.
function renderDashboard(project, data){
  const hoy = todayStr();
  document.getElementById('filter-desde').value = hoy;
  document.getElementById('filter-hasta').value = hoy;
  document.getElementById('banner-title').textContent = project.nombre + ' — Ciudad de Buenos Aires';
  document.getElementById('banner-sub').textContent =
    'Operativo del '+fmtDate(data.inicio)+' al '+fmtDate(data.fin)+' · '+(project.kobo.forms||[]).map(f=>f.nombre).join(' + ');
  document.getElementById('last-update').textContent = 'Actualizado: '+new Date(data.loaded).toLocaleString('es-AR');

  const rows = data.koboRows.filter(r=>inRange(r._fecha, hoy, hoy));
  const cierres = data.cierres.filter(r=>inRange(r._fecha, hoy, hoy));
  const presentes = (data.presentes||[]).filter(r=>inRange(r._fecha, hoy, hoy));
  const ausencias = (data.ausencias||[]).filter(r=>inRange(r._fecha, hoy, hoy));
  const total = rows.reduce((a,r)=>a+r.personas, 0);
  document.getElementById('filter-info').textContent =
    `Hoy (${fmtDate(hoy)}) · ${total.toLocaleString('es-AR')} personas · ${rows.length} puntos · ${cierres.length} cierres`;
  renderWithData(project, cierres, rows, presentes, ausencias);
}

function applyFilter(){
  const project = getProject(activeProjectId);
  const data = dataByProject[activeProjectId];
  if(!project || !data) return;
  const desde = document.getElementById('filter-desde').value;
  const hasta = document.getElementById('filter-hasta').value;
  if(!desde && !hasta){ clearFilter(); return; }
  const rows = data.koboRows.filter(r=>inRange(r._fecha, desde, hasta));
  const cierres = data.cierres.filter(r=>inRange(r._fecha, desde, hasta));
  const presentes = (data.presentes||[]).filter(r=>inRange(r._fecha, desde, hasta));
  const ausencias = (data.ausencias||[]).filter(r=>inRange(r._fecha, desde, hasta));
  const total = rows.reduce((a,r)=>a+r.personas, 0);
  document.getElementById('filter-info').textContent =
    `${total.toLocaleString('es-AR')} personas · ${rows.length} puntos · ${cierres.length} cierres`;
  renderWithData(project, cierres, rows, presentes, ausencias);
}

function clearFilter(){
  const data = dataByProject[activeProjectId];
  document.getElementById('filter-desde').value = data?.inicio || '';
  document.getElementById('filter-hasta').value = data?.fin || '';
  document.getElementById('filter-info').textContent = '';
  const project = getProject(activeProjectId);
  if(project && data) renderWithData(project, data.cierres, data.koboRows, data.presentes||[], data.ausencias||[]);
}

function renderWithData(project, cierres, rows, presentes, ausencias){
  const total = rows.reduce((a,r)=>a+r.personas, 0);
  const puntos = rows.length;
  const fechas = new Set(rows.map(r=>r.fecha).filter(Boolean));
  const nnya = cierres.filter(r=>r.situaciones && r.situaciones.toLowerCase().match(/niño|menor|bebé|bebe|nnya/)).length;
  const incidentes = cierres.filter(r=>r.inconvenientes && r.inconvenientes!=='Ninguno' && r.inconvenientes.length>2).length;

  document.getElementById('m-personas').textContent = total.toLocaleString('es-AR');
  document.getElementById('m-puntos').textContent = puntos.toLocaleString('es-AR');
  document.getElementById('m-noches').textContent = fechas.size;
  document.getElementById('m-nnya').textContent = nnya;
  document.getElementById('m-duplas').textContent = new Set(cierres.map(r=>r.dupla)).size;
  document.getElementById('m-reg-sheet').textContent = cierres.reduce((a,r)=>a+r.registros, 0).toLocaleString('es-AR');
  document.getElementById('m-incidentes').textContent = incidentes;

  const tiempos = cierres.map(r=>r.tiempo).filter(t=>t && t.includes(':'));
  if(tiempos.length){
    const mins = tiempos.map(t=>{ const p=t.split(':'); return parseInt(p[0])*60+parseInt(p[1]); });
    const avg = Math.round(mins.reduce((a,b)=>a+b,0)/mins.length);
    document.getElementById('m-tiempo').textContent = `${Math.floor(avg/60)}h ${avg%60}m`;
  } else {
    document.getElementById('m-tiempo').textContent = '—';
  }

  renderKoboCharts(project, rows);
  renderTablaPoligono(project, rows, cierres);
  renderTablaDuplas(project, cierres, rows);
  renderAlertas(cierres);
  renderDuplasPresentes(project, presentes, ausencias);
  renderDuplasPendientes(project, cierres, ausencias);
  applyKoboVisibility();
}

function renderKoboCharts(project, rows){
  const clrs = ['#185FA5','#1D9E75','#BA7517','#888780','#D4537E','#534AB7','#059669'];
  const font = {family:'Montserrat', size:9};
  const base = {responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>c.parsed.y+' personas'}}},
    scales:{x:{grid:{display:false},ticks:{font,color:'#6b7280'}}, y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font,color:'#6b7280'}}}};
  Object.values(charts).forEach(c=>c.destroy()); charts = {};

  // Por día
  const byDia = {};
  rows.forEach(r=>{ if(r.fecha) byDia[r.fecha]=(byDia[r.fecha]||0)+r.personas; });
  const diaKeys = Object.keys(byDia).sort();
  charts.dia = new Chart(document.getElementById('diaChart'), {type:'bar',
    data:{labels:diaKeys.map(d=>fmtDate(d)), datasets:[{data:diaKeys.map(k=>byDia[k]), backgroundColor:['#185FA5','#1D9E75','#BA7517'], borderRadius:4, borderSkipped:false}]},
    options:base});

  // Por hora
  const byHora = {};
  rows.forEach(r=>{ if(r.hora!==null) byHora[r.hora]=(byHora[r.hora]||0)+r.personas; });
  const horaKeys = Object.keys(byHora).map(Number).sort((a,b)=>(a<8?a+24:a)-(b<8?b+24:b));
  charts.hora = new Chart(document.getElementById('horaChart'), {type:'bar',
    data:{labels:horaKeys.map(h=>h+'hs'), datasets:[{data:horaKeys.map(h=>byHora[h]||0), backgroundColor:'#378ADD', borderRadius:4, borderSkipped:false}]},
    options:base});

  // Por situación
  const bySit = {};
  rows.forEach(r=>{ if(r.situacion && r.situacion!=='—') bySit[r.situacion]=(bySit[r.situacion]||0)+r.personas; });
  const sitKeys = Object.keys(bySit).sort((a,b)=>bySit[b]-bySit[a]);
  charts.sit = new Chart(document.getElementById('sitChart'), {type:'bar',
    data:{labels:sitKeys.map(s=>s.replace('Vendiendo o mendigando','Vendiendo').replace('Circulando/moviéndose','Circulando').replace('Recolectando en tacho','Recolectando')),
          datasets:[{data:sitKeys.map(k=>bySit[k]), backgroundColor:clrs, borderRadius:4, borderSkipped:false}]},
    options:base});

  // Por comuna — calculado en vivo a partir de las duplas del proyecto (antes
  // era un array de números fijos de un operativo pasado)
  const duplaToComuna = {};
  (project.duplas||[]).forEach(d=>{ duplaToComuna[normDupla(d.id)] = d.comuna; });
  const byComuna = {};
  rows.forEach(r=>{
    const comuna = duplaToComuna[r.dupla];
    if(!comuna) return;
    byComuna[comuna] = (byComuna[comuna]||0) + r.personas;
  });
  const comunaKeys = Object.keys(byComuna).sort((a,b)=>byComuna[b]-byComuna[a]);
  charts.comuna = new Chart(document.getElementById('comunaChart'), {type:'bar',
    data:{labels:comunaKeys.map(c=>(project.comunas && project.comunas[c]) ? c+' — '+project.comunas[c] : c),
          datasets:[{data:comunaKeys.map(k=>byComuna[k]), backgroundColor:clrs, borderRadius:4, borderSkipped:false}]},
    options:{...base, plugins:{...base.plugins, tooltip:{callbacks:{label:c=>c.parsed.y+' personas'}}}}});

  // Por formulario de KoBo (antes asumía exactamente 2 formularios F1/F2 fijos)
  const byForm = {};
  rows.forEach(r=>{ if(r.formulario) byForm[r.formulario]=(byForm[r.formulario]||0)+r.personas; });
  const formKeys = Object.keys(byForm);
  charts.poligono = new Chart(document.getElementById('poligonoChart'), {type:'bar',
    data:{labels:formKeys, datasets:[{data:formKeys.map(k=>byForm[k]), backgroundColor:clrs, borderRadius:6, borderSkipped:false}]},
    options:{...base, plugins:{...base.plugins, tooltip:{callbacks:{label:c=>c.parsed.y+' personas'}}}}});
}

function renderTablaPoligono(project, rows, cierres){
  const tbody = document.getElementById('poligono-tbody');
  tbody.innerHTML = '';

  const personasPorDupla = {};
  rows.forEach(r=>{ if(r.dupla) personasPorDupla[r.dupla]=(personasPorDupla[r.dupla]||0)+r.personas; });

  const puntosPorDupla = {};
  cierres.forEach(r=>{ const id=normDupla(r.dupla); if(id) puntosPorDupla[id]=(puntosPorDupla[id]||0)+(r.registros||0); });

  let totalPers=0, totalPts=0;
  (project.duplas||[]).forEach(d=>{
    const id = normDupla(d.id);
    const pers = personasPorDupla[id] || 0;
    const pts = puntosPorDupla[id] || 0;
    const prom = pts>0 ? (pers/pts).toFixed(1) : '—';
    const comunaNombre = (project.comunas && project.comunas[d.comuna]) || '—';
    totalPers += pers; totalPts += pts;
    tbody.innerHTML += `<tr>
      <td><b>${d.poligono || ('Polígono '+d.id)}</b></td>
      <td>Dupla ${d.id}</td>
      <td>${d.comuna||'—'} — ${comunaNombre}</td>
      <td><b>${pers}</b></td>
      <td>${pts}</td>
      <td>${prom}</td>
    </tr>`;
  });
  tbody.innerHTML += `<tr class="total-row-dark">
    <td colspan="3"><b>TOTAL</b></td>
    <td><b>${totalPers}</b></td>
    <td><b>${totalPts}</b></td>
    <td><b>${totalPts>0 ? (totalPers/totalPts).toFixed(1) : '—'}</b></td>
  </tr>`;
}

function renderTablaDuplas(project, cierres, rows){
  const personasPorDupla = {};
  rows.forEach(r=>{ if(r.dupla) personasPorDupla[r.dupla]=(personasPorDupla[r.dupla]||0)+r.personas; });

  const tbody = document.getElementById('duplas-tbody');
  tbody.innerHTML = '';
  const sorted = [...cierres].sort((a,b)=>(parseInt(a.dupla)||0)-(parseInt(b.dupla)||0));
  let totalSheet = 0;
  sorted.forEach(r=>{
    const id = normDupla(r.dupla);
    const pers = id ? (personasPorDupla[id]||0) : '—';
    const kb = r.clima==='Despejado' ? 'bg' : (r.clima && r.clima.match && r.clima.match(/tormenta|intenso/i)) ? 'br' : 'ba';
    const ib = (!r.inconvenientes || r.inconvenientes==='Ninguno') ? 'bg' : 'ba';
    const eb = (!r.eventos || r.eventos==='Ninguno') ? 'bg' : 'ba';
    const fotoUrl = /^https?:\/\//i.test(r.foto||'') ? r.foto : null;
    const fotoCell = fotoUrl
      ? `<button type="button" class="open-btn foto-ver-btn" data-foto="${esc(fotoUrl)}" style="padding:3px 9px;font-size:9px;border:none;cursor:pointer;font-family:'Montserrat',sans-serif;">📸 Ver</button>`
      : `<span class="badge bgr">Sin captura</span>`;
    totalSheet += r.registros || 0;
    tbody.innerHTML += `<tr>
      <td><b>D${esc(id || r.dupla)}</b></td>
      <td>${esc(r.poligono)}</td>
      <td>${fmtDate(r._fecha)}</td>
      <td>${esc(r.responsable)}</td>
      <td>${esc(r.inicio)}</td><td>${esc(r.cierre)}</td><td>${esc(r.tiempo)}</td>
      <td><b>${r.registros}</b></td>
      <td><b>${pers}</b></td>
      <td><span class="badge ${kb}">${esc(r.clima)}</span></td>
      <td><span class="badge ${eb}">${esc(r.eventos)}</span></td>
      <td><span class="badge ${ib}">${esc(r.inconvenientes)}</span></td>
      <td>${fotoCell}</td>
    </tr>`;
  });
  tbody.innerHTML += `<tr class="total-row"><td colspan="7"><b>TOTAL</b></td><td><b>${totalSheet}</b></td><td><b>${rows.reduce((a,r)=>a+r.personas,0)}</b></td><td colspan="3"></td></tr>`;
}

function renderAlertas(cierres){
  const an = cierres.filter(r=>r.situaciones && r.situaciones.length>3 && !r.situaciones.match(/^(no|ninguno|nada|nan|sin)$/i));
  const ao = cierres.filter(r=>r.observaciones && r.observaciones.length>5 && !r.observaciones.match(/^(ninguno|nada|sin|ok|nan|no)$/i));
  document.getElementById('nnya-content').innerHTML = an.length ?
    an.map(r=>`<div class="alert-item"><b>Dupla ${esc(r.dupla)}:</b> ${esc(r.situaciones)}</div>`).join('') :
    '<p style="font-size:12px;color:var(--gray);">Sin reportes de NNyA.</p>';
  document.getElementById('obs-content').innerHTML = ao.length ?
    ao.map(r=>`<div class="obs-item"><b>Dupla ${esc(r.dupla)}:</b> ${esc(r.observaciones)}</div>`).join('') :
    '<p style="font-size:12px;color:var(--gray);">Sin observaciones.</p>';
}

// ── CALENDARIO DE FECHAS DE SALIDA ───────────────────────────────────
// Dibuja un mini-calendario por cada mes entre project.calendario.desde y
// .hasta, marcando los días de la semana en diasSemana (2=martes, 3=miércoles
// por defecto). No depende de cierres/KoBo — es agenda fija del proyecto.
function buildMiniCalendar(year, month, diasSemana, hoy){
  const primerDia = new Date(year, month-1, 1);
  let nombreMes = primerDia.toLocaleDateString('es-AR', {month:'long', year:'numeric'});
  nombreMes = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
  const diasEnMes = new Date(year, month, 0).getDate();
  const offset = (primerDia.getDay()+6)%7; // semana arranca en lunes

  let html = `<div class="mini-cal"><div class="mini-cal-title">${esc(nombreMes)}</div><div class="mini-cal-grid">`;
  ['L','M','X','J','V','S','D'].forEach(d=>{ html += `<div class="mini-cal-dow">${d}</div>`; });
  for(let i=0;i<offset;i++) html += '<div class="mini-cal-day"></div>';
  for(let day=1; day<=diasEnMes; day++){
    const dow = new Date(year, month-1, day).getDay();
    const dateStr = year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    let cls = 'mini-cal-day';
    if(diasSemana.includes(dow)) cls += ' op';
    if(dateStr === hoy) cls += ' hoy';
    html += `<div class="${cls}">${day}</div>`;
  }
  html += '</div></div>';
  return html;
}

function renderCalendario(project){
  const el = document.getElementById('calendario-content');
  if(!el) return;
  const cal = project.calendario;
  if(!cal || !cal.desde || !cal.hasta){
    el.innerHTML = '<p style="font-size:12px;color:var(--gray);">Este proyecto todavía no tiene calendario de operativos cargado.</p>';
    return;
  }
  const diasSemana = cal.diasSemana || [2,3];
  const hoy = todayStr();
  const [ y0, m0 ] = cal.desde.split('-').map(Number);
  const [ y1, m1 ] = cal.hasta.split('-').map(Number);

  let html = '';
  let year = y0, month = m0;
  while(year < y1 || (year === y1 && month <= m1)){
    html += buildMiniCalendar(year, month, diasSemana, hoy);
    month++;
    if(month > 12){ month = 1; year++; }
  }
  el.innerHTML = html;
}

// El botón "📅 Calendario" del nav abre esto como modal — funciona para el
// proyecto activo (no tiene sentido en la pestaña "Todos los proyectos",
// que no es un proyecto puntual).
function abrirCalendario(){
  const project = getProject(activeProjectId);
  const el = document.getElementById('calendario-content');
  if(!project){
    if(el) el.innerHTML = '<p style="font-size:12px;color:var(--gray);">Elegí la pestaña de un proyecto puntual para ver su calendario.</p>';
  } else {
    renderCalendario(project);
  }
  const modal = document.getElementById('calendario-modal');
  if(modal) modal.classList.add('open');
}

function cerrarCalendario(){
  const modal = document.getElementById('calendario-modal');
  if(modal) modal.classList.remove('open');
}

// Reemplazo del "dupla 1 activa, dupla 2 presente" del grupo de WhatsApp:
// qué duplas ya tocaron "Marcar inicio del recorrido" (pestaña "Presentes"
// del Sheet) dentro del rango mostrado, cuáles avisaron ausencia (no se
// cuentan como "faltan", ya están justificadas), y cuáles todavía no
// arrancaron ni avisaron nada.
function renderDuplasPresentes(project, presentes, ausencias){
  const el = document.getElementById('presentes-content');
  if(!el) return;
  const duplas = project.duplas || [];
  if(!duplas.length){
    el.innerHTML = '<p style="font-size:12px;color:var(--gray);">Este proyecto todavía no tiene duplas cargadas.</p>';
    return;
  }
  const horaPorDupla = {};
  presentes.forEach(p=>{ if(p.dupla && !horaPorDupla[p.dupla]) horaPorDupla[p.dupla] = p.hora; });
  const ausentePorDupla = {};
  (ausencias||[]).forEach(a=>{ if(a.dupla && !ausentePorDupla[a.dupla]) ausentePorDupla[a.dupla] = a; });

  const llegaron = duplas.filter(d=>horaPorDupla[normDupla(d.id)]);
  const ausentes = duplas.filter(d=>!horaPorDupla[normDupla(d.id)] && ausentePorDupla[normDupla(d.id)]);
  const faltan = duplas.filter(d=>!horaPorDupla[normDupla(d.id)] && !ausentePorDupla[normDupla(d.id)]);

  const esperadas = duplas.length - ausentes.length;
  const pct = esperadas ? Math.round((llegaron.length/esperadas)*100) : 0;

  let html = `
    <div class="presentes-counter">
      <div class="presentes-counter-num">${llegaron.length}<span class="presentes-counter-sep">/</span><span class="presentes-counter-total">${esperadas}</span></div>
      <div class="presentes-counter-bar-wrap">
        <div class="presentes-counter-bar"><div class="presentes-counter-fill" style="width:${pct}%;"></div></div>
        <div class="presentes-counter-lbl">${pct}% de las duplas que salen hoy ya marcaron inicio${ausentes.length ? ' · '+ausentes.length+' avisaron ausencia' : ''}</div>
      </div>
    </div>`;
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
  llegaron.forEach(d=>{
    const hora = horaPorDupla[normDupla(d.id)];
    html += `<span class="badge bg">D${esc(d.id)} · ${esc(hora)}</span>`;
  });
  ausentes.forEach(d=>{
    const a = ausentePorDupla[normDupla(d.id)];
    const recuperaTxt = a && a.recupera ? ' · recupera '+esc(fmtDate(a.recupera)) : '';
    html += `<span class="badge ba">D${esc(d.id)} · ausente${recuperaTxt}</span>`;
  });
  faltan.forEach(d=>{
    html += `<span class="badge bgr">D${esc(d.id)} · sin marcar</span>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

// Seguimiento de operadores: qué duplas (de las cargadas en el proyecto)
// todavía no mandaron su cierre dentro del rango de fechas que se está
// mostrando. Las que avisaron ausencia no se cuentan como pendientes — ya
// está justificado que no cierren ese día.
function renderDuplasPendientes(project, cierres, ausencias){
  const el = document.getElementById('pendientes-content');
  if(!el) return;
  const duplas = project.duplas || [];
  if(!duplas.length){
    el.innerHTML = '<p style="font-size:12px;color:var(--gray);">Este proyecto todavía no tiene duplas cargadas.</p>';
    return;
  }
  const cerraron = new Set(cierres.map(r=>normDupla(r.dupla)).filter(Boolean));
  const ausentesSet = new Set((ausencias||[]).map(a=>a.dupla).filter(Boolean));
  const pendientes = duplas.filter(d=>!cerraron.has(normDupla(d.id)) && !ausentesSet.has(normDupla(d.id)));
  const ausentesCount = duplas.filter(d=>!cerraron.has(normDupla(d.id)) && ausentesSet.has(normDupla(d.id))).length;

  if(!pendientes.length){
    el.innerHTML = '<p style="font-size:12px;color:#065f46;font-weight:700;">✅ Todas las duplas esperadas cerraron el operativo en el rango mostrado.</p>' +
      (ausentesCount ? `<p style="font-size:11px;color:var(--gray);margin-top:6px;">${ausentesCount} dupla(s) avisaron ausencia y no cuentan como pendientes.</p>` : '');
    return;
  }
  el.innerHTML =
    `<p style="font-size:11px;color:var(--gray);margin-bottom:8px;">${pendientes.length} de ${duplas.length} duplas todavía no registraron su cierre en el rango mostrado${ausentesCount ? ' (sin contar '+ausentesCount+' que avisaron ausencia)' : ''}:</p>` +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
    pendientes.map(d=>`<span class="badge ba">D${esc(d.id)} · ${esc(d.zona||'')}</span>`).join('') +
    '</div>';
}

// ── VISTA GLOBAL (todos los proyectos) ──────────────────────────────
function renderGlobalView(){
  const projects = window.PLATFORM_PROJECTS || [];
  const tbody = document.getElementById('global-tbody');
  tbody.innerHTML = '';
  let gPersonas=0, gPuntos=0, gCierres=0, gConDatos=0;

  projects.forEach(p=>{
    let data = dataByProject[p.id];
    if(!data) data = loadFromStorage(p.id);
    if(data) dataByProject[p.id] = data;

    const personas = data ? data.koboTotal||0 : 0;
    const puntos = data ? data.koboRows.length : 0;
    const cierresN = data ? data.cierres.length : 0;
    const noches = data ? new Set(data.koboRows.map(r=>r.fecha).filter(Boolean)).size : 0;
    if(data){ gPersonas+=personas; gPuntos+=puntos; gCierres+=cierresN; gConDatos++; }

    tbody.innerHTML += `<tr>
      <td><b>${p.emoji||''} ${p.nombre}</b></td>
      <td>${data ? personas.toLocaleString('es-AR') : '—'}</td>
      <td>${data ? puntos.toLocaleString('es-AR') : '—'}</td>
      <td>${data ? noches : '—'}</td>
      <td>${data ? cierresN : '—'}</td>
      <td>${data ? '<span class="badge bg">Con datos</span>' : '<span class="badge bgr">Sin datos</span>'}</td>
    </tr>`;
  });

  document.getElementById('g-personas').textContent = gPersonas.toLocaleString('es-AR');
  document.getElementById('g-puntos').textContent = gPuntos.toLocaleString('es-AR');
  document.getElementById('g-cierres').textContent = gCierres.toLocaleString('es-AR');
  document.getElementById('g-proyectos').textContent = gConDatos + ' / ' + projects.length;
}

// ── SECCIÓN KOBO COLAPSABLE ─────────────────────────────────────────────
const KOBO_HIDDEN_KEY = 'kobo_section_hidden';

function applyKoboVisibility(){
  const header = document.getElementById('kobo-section-header');
  const body = document.getElementById('kobo-section-body');
  const btn = document.getElementById('kobo-toggle-btn');
  if(!header || !body || !btn) return;

  // El rol "coordinador" no tiene sección KoBo, ni siquiera colapsada —
  // directamente no existe para ese login.
  if(currentRole === 'coordinador'){
    header.style.display = 'none';
    body.style.display = 'none';
    return;
  }

  header.style.display = 'flex';
  const hidden = localStorage.getItem(KOBO_HIDDEN_KEY) === '1';
  body.style.display = hidden ? 'none' : 'block';
  btn.textContent = hidden ? '▼ Mostrar' : '▲ Ocultar';
}

function toggleKobo(){
  const hidden = localStorage.getItem(KOBO_HIDDEN_KEY) === '1';
  localStorage.setItem(KOBO_HIDDEN_KEY, hidden ? '0' : '1');
  applyKoboVisibility();
}

// ── MODAL DE FOTO (captura de GeoTracker) — se ve adentro de la plataforma,
// sin salir a Drive. Convertimos el link de "ver" de Drive a una URL de
// imagen directa (funciona porque el Apps Script comparte el archivo como
// "cualquiera con el link puede ver").
function driveFileId(url){
  const m = String(url||'').match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function verFoto(url){
  const id = driveFileId(url);
  const img = document.getElementById('foto-modal-img');
  const link = document.getElementById('foto-modal-link');
  if(!img || !link) return;
  img.src = id ? `https://lh3.googleusercontent.com/d/${id}=w1200` : url;
  link.href = url;
  document.getElementById('foto-modal').classList.add('open');
}

function cerrarFoto(){
  const modal = document.getElementById('foto-modal');
  if(modal) modal.classList.remove('open');
  const img = document.getElementById('foto-modal-img');
  if(img) img.src = '';
}

// Delegado: los botones "📸 Ver" se generan dinámicamente en la tabla de
// duplas, así que escuchamos en document en vez de armar un onclick con la
// URL adentro (evita líos de comillas/escaping con URLs raras).
document.addEventListener('click', function(ev){
  const btn = ev.target.closest('.foto-ver-btn');
  if(btn) verFoto(btn.dataset.foto);
});

window.DashboardEngine = {
  doLogin, logout, toggleModo, processFiles, loadFromAPI, applyFilter, clearFilter,
  toggleKobo, verFoto, cerrarFoto, togglePwd, abrirCalendario, cerrarCalendario,
};

restoreSession();

})();
