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

// Algunas duplas (H, I desde el 29/9/2026: Once-Balvanera y Almagro no
// son contiguas, las separa el corredor de frontera de K) patrullan dos
// zonas separadas en vez de una sola. z.poly admite entonces un anillo
// simple [[lat,lng],...] o una lista de anillos [[[lat,lng],...], [...]]
// cuando son varios pedazos desconectados. _anillosDe() normaliza
// siempre a "lista de anillos".
function _anillosDe(poly){
  if(!poly || !poly.length) return [];
  return (typeof poly[0][0] === 'number') ? [poly] : poly;
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
  const anillos = _anillosDe(zonas.porDupla[dupla].poly);
  if(!anillos.length) return null;
  return !anillos.some(anillo => anillo.length >= 3 && _puntoDentroPoligono(lat, lng, anillo));
}

// ── Clasificador geográfico (12/10/2026, pedido de gobierno vía Agustina:
// point-in-polygon con 30m de margen contra las 3 sub-zonas, "en su
// zona"/"en otra sub-zona"/"fuera del corredor"/"en iglesia") ───────────
// Distancia en metros entre dos puntos [lat,lng] (Haversine — de sobra de
// precisión para radios de 30-100m, no hace falta geometría proyectada).
function _distanciaMetros(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// true si el punto cae DENTRO del polígono o a <= margenMetros de su
// borde. No calcula el buffer geométrico exacto del polígono (innecesario
// para un margen de 30m a esta escala) — si no cayó adentro, prueba el
// punto desplazado `margenMetros` en 8 direcciones; si alguno de esos
// desplazamientos SÍ entra, el punto original estaba a esa distancia o
// menos del borde.
function _dentroConMargen(lat, lng, anillo, margenMetros){
  if(_puntoDentroPoligono(lat, lng, anillo)) return true;
  if(!margenMetros) return false;
  const gradosLat = margenMetros / 111320;
  const gradosLng = margenMetros / (111320 * Math.cos(lat * Math.PI / 180) || 1);
  for(let i = 0; i < 8; i++){
    const ang = i * Math.PI / 4;
    const lat2 = lat + gradosLat * Math.sin(ang);
    const lng2 = lng + gradosLng * Math.cos(ang);
    if(_puntoDentroPoligono(lat2, lng2, anillo)) return true;
  }
  return false;
}

const MARGEN_SUBZONA_METROS = 30;

// Clasifica un punto GPS contra el esquema de 3 sub-zonas (P1 este/P1
// oeste/P2) vigente desde el 12/10/2026 — devuelve 'iglesia' (cae en el
// comedor/iglesia de CUALQUIER dupla, sin importar cuál — el operativo
// pasa por ahí, no por su polígono, en ese horario), 'en_zona' (dentro de
// la sub-zona asignada a esa dupla, con margen), 'en_otra_subzona'
// (dentro de otra de las 3, no la propia) o 'fuera_corredor' (ninguna).
// null si falta algo para poder calcularlo (sin coordenadas, sin zonas
// cargadas, o `zonas` todavía es el esquema histórico sin `.subzonas`).
function clasificarPuntoVsZonas(dupla, lat, lng, zonas){
  if(lat == null || lng == null || !zonas || !zonas.subzonas) return null;
  const todasIglesias = Object.values(zonas.comedores || {}).flat();
  for(const igl of todasIglesias){
    if(igl.poly && _anillosDe(igl.poly).some(an => _puntoDentroPoligono(lat, lng, an))) return 'iglesia';
  }
  const poligonoAsignado = dupla && zonas.porDupla && zonas.porDupla[dupla] ? zonas.porDupla[dupla].poligono : null;
  if(poligonoAsignado && zonas.subzonas[poligonoAsignado]){
    const propio = zonas.subzonas[poligonoAsignado];
    if(propio.poly && _anillosDe(propio.poly).some(an => _dentroConMargen(lat, lng, an, MARGEN_SUBZONA_METROS))) return 'en_zona';
  }
  for(const [nombrePoligono, sub] of Object.entries(zonas.subzonas)){
    if(nombrePoligono === poligonoAsignado) continue;
    if(sub.poly && _anillosDe(sub.poly).some(an => _dentroConMargen(lat, lng, an, MARGEN_SUBZONA_METROS))) return 'en_otra_subzona';
  }
  return 'fuera_corredor';
}

// Para cada punto neurálgico marcado por gobierno (zonas.puntosNeuralgicos
// — ver config/umbral-0.js), cuenta cuántos `puntos` (de
// calcularOutcomesKobo().puntos, o cualquier lista {lat,lng}) cayeron
// dentro del radio (si es un Point) o dentro del polígono (si es una
// franja, ver "Franja Av. Pueyrredón – Ecuador", tipoGeom:'Polygon') —
// pedido de gobierno: "contar registros por punto neurálgico (100m
// alrededor de cada punto, y dentro de la franja) por turno".
const RADIO_PUNTO_NEURALGICO_METROS = 100;
function contarPorPuntoNeuralgico(puntos, zonas){
  if(!zonas || !zonas.puntosNeuralgicos) return [];
  return zonas.puntosNeuralgicos.map(pn => {
    let cantidad = 0;
    (puntos || []).forEach(p => {
      if(p.lat == null || p.lng == null) return;
      if(pn.tipoGeom === 'Polygon'){
        if(_puntoDentroPoligono(p.lat, p.lng, pn.geom)) cantidad++;
      } else {
        if(_distanciaMetros(p.lat, p.lng, pn.geom[0], pn.geom[1]) <= RADIO_PUNTO_NEURALGICO_METROS) cantidad++;
      }
    });
    return { nombre: pn.nombre, poligono: pn.poligono, cantidad, confirmarUbicacionGobierno: !!pn.confirmarUbicacionGobierno };
  });
}

// focusCod (opcional): pedido de Agustina, 29/9/2026 ("el mapa que les
// muestro no tiene nombres de calles, ¿no podemos embeber el de
// MyMaps?") — en vez de mantener un My Maps aparte sincronizado a mano,
// resumen-zonas.html?dupla=X reusa este mismo mapa real (con calles de
// OpenStreetMap) y le pasa el código de su dupla para resaltar solo esa
// zona.
//
// Con foco, las demás duplas NO se dibujan (antes quedaban insinuadas en
// gris de fondo) — pedido de Agustina, 30/9/2026, sobre la Dupla F: "es
// confuso el mapa, quiero darle una zona sola y bien marcada". Muchas
// zonas de turnos distintos ocupan prácticamente el mismo territorio
// (ver Retiro-San Telmo: F, M e I se superponen bastante ahí, cada una
// en su turno), así que mostrarlas todas juntas —aunque sea tenues—
// generaba justo la confusión que se quería evitar. Sin foco (el mapa
// general, todas las duplas) se siguen mostrando todas.
function _dibujarZonas(capa, zonas, focusCod){
  if(!zonas) return;
  if(zonas.zonaFrontera && zonas.zonaFrontera.length){
    L.polygon(zonas.zonaFrontera, {
      color:'#94a3b8', weight:2, dashArray:'6 6', fill:false, interactive:false,
    }).addTo(capa);
  }
  Object.entries(zonas.porDupla||{}).forEach(([codigo, z]) => {
    if(!z.poly || !z.poly.length) return;
    if(focusCod && codigo !== focusCod) return; // con foco, no se dibujan las demás duplas
    const color = z.color || '#1e50a2';
    _anillosDe(z.poly).forEach(anillo => {
      L.polygon(anillo, {
        color, weight: focusCod ? 4 : 2, fillOpacity: focusCod ? 0.4 : 0.06, fillColor: color,
      }).bindTooltip(`Dupla ${_escMapa(codigo)}${z.nombre ? ' — ' + _escMapa(z.nombre) : ''}`, { sticky:true, permanent: !!focusCod }).addTo(capa);
    });
  });
  Object.entries(zonas.comedores||{}).forEach(([codigo, lista]) => {
    if(focusCod && codigo !== focusCod) return; // con foco, no se muestran las iglesias de otras duplas
    (lista||[]).forEach(c => {
      if(!c.poly || !c.poly.length) return;
      L.polygon(c.poly, {
        color: c.color || '#a21caf', weight: focusCod ? 3 : 1.5, fillOpacity: focusCod ? 0.45 : 0.12, fillColor: c.color || '#a21caf',
      }).bindTooltip(`Dupla ${_escMapa(codigo)} — ${_escMapa(c.nombre||'')} (comedor de referencia)`, { sticky:true, permanent: !!focusCod }).addTo(capa);
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
async function renderMapaPuntos(containerId, puntos, zonas, focusCod){
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
    _dibujarZonas(inst.capaZonas, zonas, focusCod);
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
    // Con foco en una dupla (resumen-zonas.html?dupla=X), encuadra solo
    // contra SU zona (más cerca) en vez de las 13 juntas.
    if(focusCod && zonas.porDupla && zonas.porDupla[focusCod] && zonas.porDupla[focusCod].poly){
      _anillosDe(zonas.porDupla[focusCod].poly).forEach(anillo => boundsZonas.push(...anillo));
      (zonas.comedores && zonas.comedores[focusCod] || []).forEach(c => { if(c.poly) boundsZonas.push(...c.poly); });
    } else {
      Object.values(zonas.porDupla||{}).forEach(z => { if(z.poly) _anillosDe(z.poly).forEach(anillo => boundsZonas.push(...anillo)); });
      Object.values(zonas.comedores||{}).forEach(lista => (lista||[]).forEach(c => { if(c.poly) boundsZonas.push(...c.poly); }));
    }
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
