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

let currentRole = null;
let charts = {};
let activeProjectId = null;   // id de proyecto activo, o '__global__'
let dataByProject = {};       // { [projectId]: allData }

const STORAGE_PREFIX = 'platform_data_';
const LEGACY_KEY = 'censoflash_v3'; // dashboard viejo de Censo Flash — se migra una vez

function getProject(id){
  return (window.PLATFORM_PROJECTS||[]).find(p=>p.id===id) || null;
}

// ── AUTH ──────────────────────────────────────────────────────────────
function doLogin(){
  const pwd = document.getElementById('pwd-input').value;
  const auth = window.PLATFORM_AUTH || {};
  if(pwd === auth.admin){ currentRole='admin'; startApp(); }
  else if(pwd === auth.gov){ currentRole='gov'; startApp(); }
  else{ document.getElementById('login-error').style.display='block'; }
}

function startApp(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('nav-user').textContent = currentRole==='admin' ? '👤 Administrador' : '🏛️ Gobierno CABA';

  // Migración única del localStorage del dashboard viejo de Censo Flash.
  const legacy = localStorage.getItem(LEGACY_KEY);
  if(legacy && !localStorage.getItem(STORAGE_PREFIX+'censo-flash')){
    localStorage.setItem(STORAGE_PREFIX+'censo-flash', legacy);
  }

  renderTabs();
  const first = (window.PLATFORM_PROJECTS||[])[0];
  selectProject(first ? first.id : '__global__');
}

function logout(){
  currentRole = null;
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('app').style.display='none';
  document.getElementById('pwd-input').value='';
  document.getElementById('login-error').style.display='none';
}

// ── TABS DE PROYECTO ─────────────────────────────────────────────────
function renderTabs(){
  const wrap = document.getElementById('project-tabs');
  wrap.innerHTML = '';
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
  wrapArchivo.innerHTML = fieldHtml('file-sheet', 'Sheet de Cierres (.xlsx)');
  (project.kobo.forms||[]).forEach((f,i)=>{
    wrapArchivo.innerHTML += fieldHtml('file-form-'+i, f.nombre + ' (.xlsx)');
  });
  wrapApi.innerHTML = fieldHtml('file-sheet-api', 'Sheet de Cierres (.xlsx)');
  if(!project.kobo.token || !(project.kobo.forms||[]).length){
    wrapApi.innerHTML += '<div style="font-size:0.78rem;color:#92400e;max-width:260px;">⚠️ Este proyecto todavía no tiene KoBo conectado.</div>';
  }
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
function inRange(dateVal, desde, hasta){
  const ds = toDateStr(dateVal);
  if(!ds) return true;
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

// ── BUILD DATA ────────────────────────────────────────────────────────
function buildData(raw, project){
  const d = {inicio:raw.inicio, fin:raw.fin, loaded:raw.loaded, cierres:[], koboRows:[]};
  if(raw.sheet) d.cierres = raw.sheet.map(parseCierreRow);

  (project.kobo.forms||[]).forEach((form, idx)=>{
    const rows = (raw.formRows||[])[idx];
    if(!rows) return;
    rows.forEach(r=>{
      const startVal = r['start']||r['_submission_time'];
      if(!inRange(startVal, raw.inicio, raw.fin)) return;
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
  return d;
}

// ── CARGA: ARCHIVOS ──────────────────────────────────────────────────
async function processFiles(){
  const project = getProject(activeProjectId);
  if(!project) return;
  const fSheet = document.getElementById('file-sheet').files[0];
  const formFiles = (project.kobo.forms||[]).map((f,i)=>document.getElementById('file-form-'+i).files[0]);
  const inicio = document.getElementById('fecha-inicio').value;
  const fin = document.getElementById('fecha-fin').value;
  if(!fSheet && !formFiles.some(Boolean)){ alert('Cargá al menos un archivo.'); return; }
  const st = document.getElementById('upload-status');
  st.textContent = '⏳ Procesando...';
  try{
    const raw = {sheet:null, formRows:[], inicio, fin, loaded:new Date().toISOString()};
    if(fSheet) raw.sheet = await readExcel(fSheet);
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
  const fSheet = document.getElementById('file-sheet-api').files[0];
  const st = document.getElementById('upload-status');

  if(!inicio || !fin){ alert('Seleccioná fecha inicio y fin.'); return; }
  if(!project.kobo.token || !(project.kobo.forms||[]).length){
    st.textContent = '❌ Este proyecto no tiene KoBo configurado todavía.';
    return;
  }

  st.textContent = '⏳ Conectando a KoBo...';
  try{
    const raw = {sheet:null, formRows:[], inicio, fin, loaded:new Date().toISOString()};
    for(let i=0;i<project.kobo.forms.length;i++){
      const form = project.kobo.forms[i];
      st.textContent = `⏳ Descargando ${form.nombre}...`;
      raw.formRows[i] = await fetchKoboAll(project, form.id);
    }
    if(fSheet) raw.sheet = await readExcel(fSheet);
    const data = buildData(raw, project);
    dataByProject[project.id] = data;
    saveToStorage(project.id, data);
    st.textContent = `✅ KoBo: ${data.koboTotal} personas · ${data.koboRows.length} puntos · ${data.cierres.length} cierres`;
    document.getElementById('no-data').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderDashboard(project, data);
  }catch(e){ st.textContent = '❌ Error: '+e.message; console.error(e); }
}

// ── RENDER ────────────────────────────────────────────────────────────
function fmtDate(d){
  if(!d) return '—';
  const [y,m,day] = d.split('-');
  return `${parseInt(day)}/${parseInt(m)}/${y}`;
}

function renderDashboard(project, data){
  if(data.inicio) document.getElementById('filter-desde').value = data.inicio;
  if(data.fin)    document.getElementById('filter-hasta').value = data.fin;
  document.getElementById('banner-title').textContent = project.nombre + ' — Ciudad de Buenos Aires';
  document.getElementById('banner-sub').textContent =
    'Operativo del '+fmtDate(data.inicio)+' al '+fmtDate(data.fin)+' · '+(project.kobo.forms||[]).map(f=>f.nombre).join(' + ');
  document.getElementById('last-update').textContent = 'Actualizado: '+new Date(data.loaded).toLocaleString('es-AR');
  document.getElementById('filter-info').textContent = '';
  renderWithData(project, data.cierres, data.koboRows);
}

function applyFilter(){
  const project = getProject(activeProjectId);
  const data = dataByProject[activeProjectId];
  if(!project || !data) return;
  const desde = document.getElementById('filter-desde').value;
  const hasta = document.getElementById('filter-hasta').value;
  if(!desde && !hasta){ clearFilter(); return; }
  const rows = data.koboRows.filter(r=>inRange(r._fecha, desde, hasta));
  const cierres = data.cierres.filter(r=>inRange(r._fecha, desde, hasta) || !r._fecha);
  const total = rows.reduce((a,r)=>a+r.personas, 0);
  document.getElementById('filter-info').textContent =
    `${total.toLocaleString('es-AR')} personas · ${rows.length} puntos · ${cierres.length} cierres`;
  renderWithData(project, cierres, rows);
}

function clearFilter(){
  const data = dataByProject[activeProjectId];
  document.getElementById('filter-desde').value = data?.inicio || '';
  document.getElementById('filter-hasta').value = data?.fin || '';
  document.getElementById('filter-info').textContent = '';
  const project = getProject(activeProjectId);
  if(project && data) renderWithData(project, data.cierres, data.koboRows);
}

function renderWithData(project, cierres, rows){
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
      ? `<a href="${esc(fotoUrl)}" target="_blank" class="open-btn" style="padding:3px 9px;font-size:9px;">📸 Ver</a>`
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

window.DashboardEngine = {
  doLogin, logout, toggleModo, processFiles, loadFromAPI, applyFilter, clearFilter,
};

})();
