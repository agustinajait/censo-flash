// Mapa de puntos visitados por las duplas — reusado en dashboard.html (en
// vivo), admin-duplas.html (reporte) y reporte-publico.html (link para
// gobierno). Fuente: _geolocation de KoBo, ya parseada como lat/lng por
// parseUmbral0() (config/umbral-0.js) — no agrega ningún dato nuevo.
// §10.1.24, pedido de Agustina: "un mapa con los puntos que visitaron los
// operadores".
//
// §10.1.24 usaba un solo color de marcador para todos los puntos — con
// ~13 duplas eso está muy por encima de las 2-3 categorías que un mapa
// puede sostener con colores distinguibles para daltonismo (ver skill de
// dataviz). §10.1.40 lo cambia a propósito, pedido explícito de Agustina
// ("quiero que se vea tb con los colores para cada dupla"): no son
// colores categóricos elegidos acá, son LOS MISMOS colores reales que ya
// usa el equipo en su My Maps operativo (uno por zona, ver
// zonasOperativas en config/umbral-0.js) — la referencia visual ya
// existe y la conoce el equipo, así que reusarla pesa más que la regla
// general de la skill.

let _leafletPromise = null;
function _cargarLeaflet(){
  if(window.L) return Promise.resolve();
  if(_leafletPromise) return _leafletPromise;
  _leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Leaflet'));
    document.head.appendChild(script);
  });
  return _leafletPromise;
}

const _mapaPuntosInstancias = {}; // containerId -> { map, capa, capaZonas, zonasDibujadas }

// Dibuja las zonas operativas (una vez por instancia de mapa — no cambian
// con el filtro de fecha, así que no hace falta recalcularlas en cada
// render de puntos). §10.1.39, pedido de Agustina: "quiero que en el mapa
// en vivo de mi plataforma esté el mapa que debemos recorrer nosotros
// delimitado, así podemos comparar si estamos en zona o no" — zonas viene
// de config/umbral-0.js (PROJECT_CONFIG_UMBRAL_0.zonasOperativas),
// extraídas del KML del My Maps real del equipo.
// Color real de la dupla según zonasOperativas — el de su propia zona de
// patrullaje, o si es una dupla "iglesias" (sin zona fija), el de su
// comedor de referencia. null si no hay zonas cargadas o la dupla no
// matchea ninguna (queda el celeste genérico de siempre).
function _colorDupla(dupla, zonas){
  if(!zonas || !dupla) return null;
  if(zonas.porDupla && zonas.porDupla[dupla]) return zonas.porDupla[dupla].color || null;
  if(zonas.comedores && zonas.comedores[dupla] && zonas.comedores[dupla][0]) return zonas.comedores[dupla][0].color || null;
  return null;
}

function _dibujarZonas(capa, zonas){
  if(!zonas) return;
  if(zonas.zonaFrontera && zonas.zonaFrontera.length){
    L.polygon(zonas.zonaFrontera, {
      color:'#94a3b8', weight:2, dashArray:'6 6', fill:false, interactive:false,
    }).addTo(capa);
  }
  Object.entries(zonas.porDupla||{}).forEach(([codigo, z]) => {
    if(!z.poly || !z.poly.length) return;
    L.polygon(z.poly, {
      color: z.color || '#1e50a2', weight:2, fillOpacity:0.06, fillColor: z.color || '#1e50a2',
    }).bindTooltip(`Dupla ${_escMapa(codigo)}${z.nombre ? ' — ' + _escMapa(z.nombre) : ''}`, { sticky:true }).addTo(capa);
  });
  Object.entries(zonas.comedores||{}).forEach(([codigo, lista]) => {
    (lista||[]).forEach(c => {
      if(!c.poly || !c.poly.length) return;
      L.polygon(c.poly, {
        color: c.color || '#a21caf', weight:1.5, fillOpacity:0.12, fillColor: c.color || '#a21caf',
      }).bindTooltip(`Dupla ${_escMapa(codigo)} — ${_escMapa(c.nombre||'')} (comedor de referencia)`, { sticky:true }).addTo(capa);
    });
  });
}

// puntos: [{lat, lng, fecha, tipo, dupla}] — fecha (ISO), tipo y dupla son
// opcionales. fecha/tipo se muestran en el popup si están. Sin puntos con
// geolocalización: el mapa igual se muestra (centrado en CABA), con un
// aviso al pie.
// zonas (opcional): PROJECT_CONFIG_UMBRAL_0.zonasOperativas — si se pasa,
// dibuja los polígonos de zona por debajo de los puntos (una sola vez), y
// además colorea cada punto con el color real de SU dupla (si el punto
// trae `dupla` y zonas la reconoce) en vez del celeste genérico.
async function renderMapaPuntos(containerId, puntos, zonas){
  const cont = document.getElementById(containerId);
  if(!cont) return;
  try{
    await _cargarLeaflet();
  }catch(e){
    cont.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:0.85rem;">⚠️ No se pudo cargar el mapa (¿sin conexión?).</div>';
    console.error('No se pudo cargar Leaflet', e);
    return;
  }

  let inst = _mapaPuntosInstancias[containerId];
  if(!inst){
    const map = L.map(containerId, { scrollWheelZoom: false }).setView([-34.61, -58.44], 11); // CABA
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    // capaZonas se agrega ANTES que capa — así los polígonos de zona
    // quedan siempre por debajo de los puntos en el dibujo de Leaflet.
    const capaZonas = L.layerGroup().addTo(map);
    const capa = L.layerGroup().addTo(map);
    inst = _mapaPuntosInstancias[containerId] = { map, capa, capaZonas, zonasDibujadas:false };
  }

  if(zonas && !inst.zonasDibujadas){
    _dibujarZonas(inst.capaZonas, zonas);
    inst.zonasDibujadas = true;
  }

  inst.capa.clearLayers();
  const validos = (puntos||[]).filter(p => p.lat != null && p.lng != null);
  const bounds = [];
  const duplasVistas = new Map(); // codigo -> { color, esIglesia }, para la leyenda
  validos.forEach(p => {
    const fechaTxt = p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR') : '';
    const tipoTxt = p.tipo ? _escMapa(p.tipo) : '';
    const colorDupla = _colorDupla(p.dupla, zonas);
    const color = colorDupla || '#1a56db';
    // "Iglesias" (§10.1.42, pedido de Agustina: "aclara que esta la zona
    // de las iglesias") — duplas C/F/I/L/M no tienen zona de patrullaje
    // propia, solo un comedor de referencia (ver zonasOperativas.comedores
    // en config/umbral-0.js) — se marca en el popup y la leyenda para que
    // no se confundan con una dupla de zona fija sin más info.
    const esIglesia = !!(colorDupla && zonas && p.dupla && !(zonas.porDupla && zonas.porDupla[p.dupla]));
    if(colorDupla && p.dupla) duplasVistas.set(p.dupla, { color: colorDupla, esIglesia });
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 7, color, weight: 2, fillColor: color, fillOpacity: 0.5,
    });
    const duplaTxt = p.dupla ? `<b>Dupla ${_escMapa(p.dupla)}</b>${esIglesia ? ' (iglesias)' : ''}<br>` : '';
    if(duplaTxt || fechaTxt || tipoTxt) marker.bindPopup(`${duplaTxt}${tipoTxt ? tipoTxt + '<br>' : ''}${fechaTxt}`);
    marker.addTo(inst.capa);
    bounds.push([p.lat, p.lng]);
  });

  if(bounds.length) inst.map.fitBounds(bounds, { padding: [24,24], maxZoom: 15 });

  // Leyenda de colores por dupla — solo si hay al menos un punto coloreado
  // por zona real (si no hay zonas o ningún punto trae dupla reconocida,
  // no tiene sentido mostrarla). Las duplas "iglesias" (sin zona de
  // patrullaje fija, solo un comedor de referencia) se marcan aparte.
  const leyendaId = containerId + '-leyenda';
  let leyenda = document.getElementById(leyendaId);
  if(duplasVistas.size){
    if(!leyenda){
      leyenda = document.createElement('div');
      leyenda.id = leyendaId;
      leyenda.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:0.76rem;color:#64748b;';
      cont.insertAdjacentElement('afterend', leyenda);
    }
    leyenda.innerHTML = [...duplasVistas.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([codigo, info]) =>
      `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:${_escMapa(info.color)};display:inline-block;"></span>Dupla ${_escMapa(codigo)}${info.esIglesia ? ' <i>(iglesias)</i>' : ''}</span>`
    ).join('');
  } else if(leyenda){
    leyenda.remove();
  }

  // Aviso de "sin puntos" al pie — no reemplaza el mapa (se ve igual la
  // ciudad de fondo, sirve de referencia visual aunque esté vacío).
  const avisoId = containerId + '-aviso';
  let aviso = document.getElementById(avisoId);
  if(!validos.length){
    if(!aviso){
      aviso = document.createElement('div');
      aviso.id = avisoId;
      aviso.style.cssText = 'margin-top:8px;font-size:0.78rem;color:#94a3b8;text-align:center;';
      cont.insertAdjacentElement('afterend', aviso);
    }
    aviso.textContent = 'Ningún envío de KoBo en este rango trajo ubicación.';
  } else if(aviso){
    aviso.remove();
  }

  // Leaflet necesita el tamaño real del contenedor — si se inicializó
  // oculto o recién se hizo visible, el mosaico de fondo sale con el
  // tamaño viejo hasta que se le avisa.
  setTimeout(() => inst.map.invalidateSize(), 50);
}

function _escMapa(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

window.renderMapaPuntos = renderMapaPuntos;
