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
// Color real de la dupla según zonasOperativas — el de su propio polígono
// de patrullaje, o si es una dupla "iglesias" (su zona asignada es un
// comedor puntual, no un polígono), el de ese comedor de referencia. null
// si no hay zonas cargadas o la dupla no matchea ninguna (queda el
// celeste genérico de siempre).
function _colorDupla(dupla, zonas){
  if(!zonas || !dupla) return null;
  if(zonas.porDupla && zonas.porDupla[dupla]) return zonas.porDupla[dupla].color || null;
  if(zonas.comedores && zonas.comedores[dupla] && zonas.comedores[dupla][0]) return zonas.comedores[dupla][0].color || null;
  return null;
}

// Punto-en-polígono (ray casting) — poly: [[lat,lng], ...]. Mismo
// algoritmo usado para el análisis a mano del Excel de KoBo (22/9/2026,
// antes de que existiera este cálculo en la plataforma).
function _puntoDentroPoligono(lat, lng, poly){
  let dentro = false;
  for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [latI, lngI] = poly[i];
    const [latJ, lngJ] = poly[j];
    if(((lngI > lng) !== (lngJ > lng)) &&
       (lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI + 1e-15) + latI)){
      dentro = !dentro;
    }
  }
  return dentro;
}

// true/false si la dupla tiene un POLÍGONO de patrullaje propio
// (porDupla) y el punto cae fuera de ese polígono; null si no hay forma
// de saberlo (sin zonas, sin dupla reconocida, o dupla "iglesias" — esas
// sí tienen zona asignada, pero es una dirección puntual, no un polígono
// de manzanas contra el que tenga sentido comparar un punto GPS, ver
// §10.1.39/§10.1.46).
function _fueraDeZona(dupla, lat, lng, zonas){
  if(!zonas || !dupla || !zonas.porDupla || !zonas.porDupla[dupla]) return null;
  const poly = zonas.porDupla[dupla].poly;
  if(!poly || poly.length < 3) return null;
  return !_puntoDentroPoligono(lat, lng, poly);
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
  // §10.1.45, bug real reportado por Agustina: "lo vi pero desapareció".
  // admin-duplas.html re-arma TODO el HTML del reporte (incluido este
  // <div>) cada vez que se toca "Generar reporte" — mismo id, pero un
  // nodo del DOM nuevo. La instancia de Leaflet vieja seguía apuntando al
  // nodo huérfano (ya no visible), mientras el <div> nuevo quedaba vacío.
  // Si el contenedor de la instancia guardada ya no está en el documento,
  // se descarta prolijo (map.remove()) y se crea de nuevo sobre el nodo
  // actual — dashboard.html no pisa su <div>, así que ahí nunca hace
  // falta recrear nada.
  if(inst && !document.body.contains(inst.map.getContainer())){
    inst.map.remove();
    delete _mapaPuntosInstancias[containerId];
    inst = null;
  }
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
  // §10.1.48, pedido de Agustina: "pero contabiliza los casos esos como
  // dentro de nuestra zona de cobertura, sí?" — sobre los puntos de las
  // duplas de comedores (C/F/I/L/M). Antes quedaban afuera de
  // conZonaCount/fueraDeZonaCount en silencio (ni a favor ni en contra);
  // ahora se cuentan EXPLÍCITAMENTE como cobertura propia en
  // coberturaCount — es su zona asignada (el comedor), solo que no hay un
  // polígono de manzanas para chequearlos geométricamente como al resto.
  let conZonaCount = 0, fueraDeZonaCount = 0, coberturaCount = 0; // para el resumen debajo del mapa
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
    if(colorDupla && p.dupla) coberturaCount++; // cualquier dupla reconocida (con polígono o con comedor) cuenta como cobertura propia
    // "Fuera de zona" (§10.1.46, pedido de Agustina: "necesito calcular
    // los puntos que se registraron fuera del territorio que tienen
    // marcadas las duplas") — punto-en-polígono contra la zona de SU
    // propia dupla. null para duplas "iglesias" (sin polígono real de
    // manzanas) — no participan de este chequeo geométrico puntual, pero
    // SÍ están contadas en coberturaCount de arriba.
    const fuera = _fueraDeZona(p.dupla, p.lat, p.lng, zonas);
    if(fuera !== null){ conZonaCount++; if(fuera) fueraDeZonaCount++; }
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 7,
      color: fuera === true ? '#111827' : color,
      weight: fuera === true ? 3 : 2,
      fillColor: color,
      fillOpacity: fuera === true ? 0.85 : 0.5,
    });
    const duplaTxt = p.dupla ? `<b>Dupla ${_escMapa(p.dupla)}</b>${esIglesia ? ' (iglesias)' : ''}<br>` : '';
    const fueraTxt = fuera === true ? '<b style="color:#b91c1c;">⚠️ Fuera de la zona asignada</b><br>' : '';
    if(duplaTxt || fueraTxt || fechaTxt || tipoTxt) marker.bindPopup(`${fueraTxt}${duplaTxt}${tipoTxt ? tipoTxt + '<br>' : ''}${fechaTxt}`);
    marker.addTo(inst.capa);
    bounds.push([p.lat, p.lng]);
  });

  // Sin puntos (28/9/2026, pedido de Agustina: "necesito ver acá" el mapa
  // de zonas solo — pestaña Cobertura / mapa-cobertura.html llaman a esta
  // función con puntos:[]): sin este fallback el mapa se quedaba en la
  // vista genérica inicial (zoom 11 centrado en CABA), demasiado alejada
  // para distinguir zonas vecinas — encuadra contra las zonas en vez de
  // dejarlo así.
  if(bounds.length){
    inst.map.fitBounds(bounds, { padding: [24,24], maxZoom: 15 });
  } else if(zonas){
    const boundsZonas = [];
    Object.values(zonas.porDupla||{}).forEach(z => { if(z.poly) boundsZonas.push(...z.poly); });
    Object.values(zonas.comedores||{}).forEach(lista => (lista||[]).forEach(c => { if(c.poly) boundsZonas.push(...c.poly); }));
    if(boundsZonas.length) inst.map.fitBounds(boundsZonas, { padding: [24,24] });
  }

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

  // Resumen "fuera de zona" — insertado DESPUÉS de la leyenda a propósito
  // (insertAdjacentElement('afterend', ...) sobre `cont` deja el último
  // insertado más cerca del mapa) para que quede arriba de la leyenda de
  // colores, como el dato más importante de esta comparación.
  const resumenId = containerId + '-resumen-zona';
  let resumen = document.getElementById(resumenId);
  if(coberturaCount > 0){
    if(!resumen){
      resumen = document.createElement('div');
      resumen.id = resumenId;
      resumen.style.cssText = 'margin-top:10px;font-size:0.8rem;';
      cont.insertAdjacentElement('afterend', resumen);
    }
    // §10.1.49, Agustina sobre la versión anterior de este texto: "no se
    // entiende esto y no es necesario, solo digo que las iglesias son
    // zona nuestra tb" — de vuelta a una sola frase corta con el número,
    // más una aclaración de una línea si hay duplas de iglesias en este
    // rango. Sin explicar polígonos ni geometría acá (eso queda en los
    // comentarios del código para quien lo edite, no en la pantalla).
    let texto = conZonaCount > 0
      ? (fueraDeZonaCount > 0
          ? `⚠️ <b style="color:#b91c1c;">${fueraDeZonaCount} de ${conZonaCount}</b> puntos quedaron fuera de la zona asignada a su dupla.`
          : `✅ Los ${conZonaCount} puntos están dentro de la zona asignada a su dupla.`)
      : `✅ Los ${coberturaCount} puntos están dentro de zona.`;
    const hayComedores = duplasVistas.size > [...duplasVistas.values()].filter(v => !v.esIglesia).length;
    if(hayComedores) texto += ' Las iglesias también son zona nuestra.';
    resumen.innerHTML = texto;
  } else if(resumen){
    resumen.remove();
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
