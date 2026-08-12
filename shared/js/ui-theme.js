// Aplica la marca de un proyecto (colores + textos) a una página que usa las
// variables CSS --navy/--blue/--green/--amber/--red y elementos marcados con
// data-cfg="campo" (texto) o data-cfg-href="campo" (atributo href).
// Soporta rutas anidadas: data-cfg="horario.dias".
(function(){

function getPath(obj, path){
  return path.split('.').reduce((v,k)=> (v && v[k]!==undefined) ? v[k] : undefined, obj);
}

function applyTheme(cfg){
  const root = document.documentElement.style;
  if(cfg.colorNavy)  root.setProperty('--navy',  cfg.colorNavy);
  if(cfg.colorBlue)  root.setProperty('--blue',  cfg.colorBlue);
  if(cfg.colorGreen) root.setProperty('--green', cfg.colorGreen);
  if(cfg.colorAmber) root.setProperty('--amber', cfg.colorAmber);
  if(cfg.colorRed)   root.setProperty('--red',   cfg.colorRed);
}

function bindText(cfg){
  document.querySelectorAll('[data-cfg]').forEach(el=>{
    const val = getPath(cfg, el.getAttribute('data-cfg'));
    if(val!==undefined && val!=='') el.textContent = val;
  });
  document.querySelectorAll('[data-cfg-href]').forEach(el=>{
    const val = getPath(cfg, el.getAttribute('data-cfg-href'));
    if(val!==undefined && val!=='') el.setAttribute('href', val);
  });
}

window.UITheme = {
  init(cfg){
    cfg = cfg || window.PROJECT_CONFIG;
    if(!cfg) return;
    applyTheme(cfg);
    bindText(cfg);
  }
};

})();
