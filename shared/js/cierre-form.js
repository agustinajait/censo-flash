// Motor genérico del formulario de cierre de operativo. Usado por cierre.html
// (Censo Flash) y umbral-0/cierre.html. Requiere que config/<proyecto>.js ya
// haya seteado window.PROJECT_CONFIG.
(function(){

let CFG = null;

function getDuplaId(){
  return new URLSearchParams(window.location.search).get('dupla') || '??';
}

function calcTime(){
  const ini = document.getElementById('f_inicio').value;
  const fin = document.getElementById('f_cierre').value;
  if(!ini || !fin) return;
  const [h1,m1] = ini.split(':').map(Number);
  const [h2,m2] = fin.split(':').map(Number);
  let mins = (h2*60+m2) - (h1*60+m1);
  if(mins < 0) mins += 1440;
  const hh = String(Math.floor(mins/60)).padStart(2,'0');
  const mm = String(mins%60).padStart(2,'0');
  document.getElementById('f_tiempo').value = hh + ':' + mm + ' hs';
  document.getElementById('tiempo-wrap').style.display = 'block';
}

function compressImage(file){
  return new Promise(resolve=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        const maxW = 800;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function previewFoto(input){
  if(!input.files[0]) return;
  compressImage(input.files[0]).then(compressed=>{
    window._fotoComprimida = compressed;
    document.getElementById('foto-img').src = compressed;
    document.getElementById('foto-preview').style.display = 'block';
    const kb = Math.round(compressed.length * 0.75 / 1024);
    document.querySelector('.foto-ok').textContent = '✓ Imagen lista (' + kb + ' KB)';
  });
}

async function enviar(){
  if(!CFG.appsScriptUrl){
    alert('Este proyecto todavía no tiene conectado el backend de cierres. Avisá al administrador.');
    return;
  }

  const dupla         = getDuplaId();
  const dia            = document.getElementById('f_dia').value;
  const responsable    = document.getElementById('f_responsable').value;
  const inicio         = document.getElementById('f_inicio').value;
  const cierre         = document.getElementById('f_cierre').value;
  const tiempo         = document.getElementById('f_tiempo').value || '';
  const registros      = document.getElementById('f_registros').value;
  const inconvenientes = document.getElementById('f_inconvenientes').value;
  const clima          = document.getElementById('f_clima').value;
  const eventos        = document.getElementById('f_eventos').value;
  const situaciones    = document.getElementById('f_situaciones').value;
  const observaciones  = document.getElementById('f_observaciones').value;
  const fotoFile       = document.getElementById('f_foto').files[0];

  if(!dia || !responsable || !inicio || !cierre || !registros){
    alert('Por favor completá fecha, responsable, horarios y cantidad de registros.');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Enviando...';

  let fotoBase64 = 'Sin captura';
  if(fotoFile && window._fotoComprimida){
    fotoBase64 = window._fotoComprimida;
  } else if(fotoFile){
    fotoBase64 = await compressImage(fotoFile);
  }

  const payload = {
    proyecto: CFG.id, dupla, dia, responsable,
    horario_inicio: inicio, horario_cierre: cierre, tiempo_total: tiempo,
    registros, inconvenientes, clima, eventos, situaciones, observaciones,
    foto: fotoBase64
  };

  try{
    await fetch(CFG.appsScriptUrl, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    document.getElementById('form-area').style.display = 'none';
    document.getElementById('status').style.display = 'block';
    window.scrollTo(0,0);
  }catch(e){
    btn.disabled = false;
    btn.innerHTML = '📤 Enviar cierre del operativo';
    alert('Error al enviar. Verificá tu conexión e intentá nuevamente.');
  }
}

function init(cfg){
  CFG = cfg || window.PROJECT_CONFIG;
  const dupla = getDuplaId();
  document.getElementById('cover-dupla').textContent = 'Dupla ' + dupla;
  document.getElementById('back-link').href = './index.html?dupla=' + dupla;
  document.getElementById('f_dia').value = new Date().toISOString().split('T')[0];
}

window.CierreForm = { init, calcTime, previewFoto, enviar };

})();
