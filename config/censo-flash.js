// Config del proyecto "Censo Flash" — relevamiento nocturno de personas en
// situación de calle en CABA. Todo lo que hoy vive hardcodeado en index.html,
// cierre.html y dashboard.html se centraliza acá: duplas, comunas, formularios
// de KoBo y su parseo, colores de marca y el endpoint de cierres.
//
// Para sumar duplas nuevas (expansión a comunas 1, 3, 5, 6, 7 y 15):
// agregar entradas al array `duplas` de abajo, con su `comuna` correspondiente
// (agregando la comuna a `comunas` si todavía no existe).
(function(){

const comunas = {
  'C.1':  'Retiro',
  'C.2':  'Recoleta',
  'C.14': 'Palermo',
  'C.13': 'Belgrano/Núñez',
  'C.12': 'Villa Urquiza',
  'C.6':  'Caballito',
  // Comunas sumadas con la expansión a 33 duplas (agosto 2026):
  'C.3':  'Balvanera',
  'C.5':  'Almagro/Boedo',
  'C.15': 'Chacarita/Villa Crespo',
  'C.7':  'Parque Chacabuco',
};

// ── Asignación de KoBo desde el 1° de septiembre 2026 ────────────────
// Gobierno reorganizó los formularios en 3 grupos (Norte/Centro/Sur) que
// NO respetan rangos contiguos de dupla — cada dupla puede caer en
// cualquiera de los 3. Los links de "Norte" y "Centro" son LOS MISMOS
// formularios de KoBo que ya veníamos usando (los que antes se llamaban
// "Flash 2" y "Flash 1"), solo que ahora los usa un grupo distinto de
// duplas. "Sur" es el único formulario realmente nuevo.
const KOBO_NORTE  = 'https://ee.kobotoolbox.org/x/gaWzj9F4'; // = ex "Flash 2"
const KOBO_CENTRO = 'https://ee.kobotoolbox.org/x/cI937u6G'; // = ex "Flash 1"
const KOBO_SUR    = 'https://ee.kobotoolbox.org/x/HcanGFj5'; // formulario nuevo

const duplas = [
  { id:'01', zona:'Retiro',        poligono:'Polígono 01', comuna:'C.1',  kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1a2FJrvzxTjejMZycd4yX85kbU6v9lZo&usp=sharing' },
  { id:'02', zona:'Recoleta',      poligono:'Polígono 02', comuna:'C.2',  kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1sXihNejPqwBKYool5mpX4Pf-4lhBoh8&usp=sharing' },
  { id:'03', zona:'Recoleta',      poligono:'Polígono 03', comuna:'C.2',  kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1OJqz28eDr2_EjNBUCMUhlTaWOxbZr-c&usp=sharing' },
  { id:'04', zona:'Recoleta',      poligono:'Polígono 04', comuna:'C.2',  kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1ZuFmoze5nih1GbV8GZnRHRacS8bRMjA&usp=sharing' },
  { id:'05', zona:'Palermo',       poligono:'Polígono 05', comuna:'C.14', kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1nxOGoV9y06YwKQg2LzZlNSozTb8_CU8&usp=sharing' },
  { id:'06', zona:'Palermo',       poligono:'Polígono 06', comuna:'C.14', kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1q8BoHfgzOks30289L7yKSGWdT25G7Rw&usp=sharing' },
  { id:'07', zona:'Palermo',       poligono:'Polígono 07', comuna:'C.14', kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1om67m3Smp5GOPG__nApgxgevHO0ILZ4&usp=sharing' },
  { id:'08', zona:'Palermo',       poligono:'Polígono 08', comuna:'C.14', kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1GeNWSaCubKktLOKlSfESLjspFxchark&usp=sharing' },
  { id:'09', zona:'Colegiales',    poligono:'Polígono 09', comuna:'C.13', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/u/2/edit?mid=134Xwm4lM6tqPOTqgoIroM52YJF8onhI&usp=sharing' },
  { id:'10', zona:'Belgrano',      poligono:'Polígono 10', comuna:'C.13', kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1VF9579XAK0tVz2zh1YElGZmdWzlYpsM&usp=sharing' },
  { id:'11', zona:'Belgrano',      poligono:'Polígono 11', comuna:'C.13', kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1U5V1iNZUgm2OYWt5Y2ZYBddVIkHGvt8&usp=sharing' },
  { id:'12', zona:'Belgrano R',    poligono:'Polígono 12', comuna:'C.13', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1NchByiiqydfmU5yIz3eb_UusG9FQXgg&usp=sharing' },
  { id:'13', zona:'Núñez',         poligono:'Polígono 13', comuna:'C.13', kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1mihs63JT7RzERJ8-fdflkDsUGdWdB_M&usp=sharing' },
  { id:'14', zona:'Nuñez',         poligono:'Polígono 14', comuna:'C.13', kobo:KOBO_NORTE,  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1nEbG0R4KElShILaJtFNaCZ0rlwqoMcQ&usp=sharing' },
  { id:'15', zona:'Saavedra',      poligono:'Polígono 15', comuna:'C.12', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1gInJRL0HoScU6t8IkKHR6qnHQzhAagE&usp=sharing' },
  { id:'16', zona:'Saavedra',      poligono:'Polígono 16', comuna:'C.12', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1kV8CwYixCNEuT3sxNmHHUqEyDNF5gfw&usp=sharing' },
  { id:'17', zona:'Villa Urquiza', poligono:'Polígono 17', comuna:'C.12', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1FHllQyYYHent3QvNJvvg_5QTgu4zhV8&usp=sharing' },
  { id:'18', zona:'Villa Urquiza', poligono:'Polígono 18', comuna:'C.12', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/u/2/edit?mid=10jjGAK6OXaWAIxdlJ3Hw5FBDVqLm8N0&usp=sharing' },
  { id:'19', zona:'Villa Urquiza', poligono:'Polígono 19', comuna:'C.12', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1jr5_-GOEeANTI5SAT4RKeSSuL9huJw4&usp=sharing' },
  // La Dupla 20 (Caballito, Polígono 20) se dio de baja con la expansión:
  // su zona quedó cubierta por las nuevas Caballito Sur (26) y Caballito
  // Norte (27), con recorrido propio. El número 20 no se reutiliza.

  // ── Expansión a 33 duplas (agosto 2026) ──────────────────────────────
  // `grupo:'nueva'` es lo que hace que el portal (index.html) las separe
  // en su propia pestaña "Duplas nuevas" en vez de mezclarlas con las
  // 01-19 — todavía no está confirmado si la agencia que coordina hoy el
  // censo las va a poner en territorio. Sacar ese campo (o ponerlo en
  // 'actual') las vuelve a mezclar en la pestaña principal.
  { id:'21', zona:'Microcentro',               poligono:'Polígono 21', comuna:'C.1',  kobo:KOBO_SUR,    mymaps:'https://www.google.com/maps/d/viewer?mid=1fAbAstJwu-8gcmMGdRRdgymJTalnt4E', grupo:'nueva' },
  { id:'22', zona:'Macrocentro',               poligono:'Polígono 22', comuna:'C.1',  kobo:KOBO_SUR,    mymaps:'https://www.google.com/maps/d/viewer?mid=1BTx5bqg-jN3Iig-SQ28M7z5snsexxnI', grupo:'nueva' },
  { id:'23', zona:'Almagro Norte',             poligono:'Polígono 23', comuna:'C.5',  kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/viewer?mid=1WNAFbuZeAwgHxTwFSKMYocXAwZfW6qA', grupo:'nueva' },
  { id:'24', zona:'Almagro Sur',               poligono:'Polígono 24', comuna:'C.5',  kobo:KOBO_SUR,    mymaps:'https://www.google.com/maps/d/viewer?mid=1PTdr8m1Q1aW5kZJokxzfEREIMhghAkM', grupo:'nueva' },
  { id:'25', zona:'Boedo',                     poligono:'Polígono 25', comuna:'C.5',  kobo:KOBO_SUR,    mymaps:'https://www.google.com/maps/d/viewer?mid=13nTcHf5x79TlEsq85YYu393URmJ4MyQ', grupo:'nueva' },
  { id:'26', zona:'Caballito Sur',             poligono:'Polígono 26', comuna:'C.6',  kobo:KOBO_SUR,    mymaps:'https://www.google.com/maps/d/viewer?mid=1AZQuRGvfPVXkQHHxOIaJfCA662UTGwQ', grupo:'nueva' },
  // mymaps actualizado 16/9/2026: el mapa viejo (mid=1vNPwuSGyvU3SIVpxqIlNnM-p0sjpJjE)
  // resultó tener un número interno de My Maps ("Dupla 27") que no
  // correspondía a esta zona en nuestra numeración actual — confusión real
  // en producción, Agustina terminó creando un mapa nuevo desde cero para
  // no arriesgarse a pisar el contenido de otra dupla por el desfasaje de
  // numeración. Ver DISENO-CASOS.md (Censo Flash) para más contexto si se
  // repite con otra dupla del grupo 'nueva' (21-33).
  { id:'27', zona:'Caballito Norte',           poligono:'Polígono 27', comuna:'C.6',  kobo:KOBO_SUR,    mymaps:'https://www.google.com/maps/d/viewer?mid=1w9FuYUSoMOfDtPC02a67h63zvj8kNyA', grupo:'nueva' },
  // mymaps actualizado 16/9/2026: el mapa viejo (mid=1vpaKauq8MKfhQ7j5MNJFqpQgrNUT4mU)
  // quedó con el polígono de Caballito Norte pisado por encima del de Once
  // (mismo incidente de numeración cruzada que dupla 27, ver esa entrada
  // más arriba). Se recuperó el límite original de Once desde el mapa
  // maestro "Recorridos flash agosto" (capa "Once", intacta ahí) y se
  // armó un mapa nuevo con ese polígono.
  { id:'28', zona:'Once',                      poligono:'Polígono 28', comuna:'C.3',  kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/viewer?mid=16TqFFI88VB48VnqN1Hs9pWJDNfZYabo', grupo:'nueva' },
  // mymaps actualizado 16/9/2026: recorte grande (no el ajuste de borde de
  // 0.15km de antes) — dupla 29 reportó que no llegaban a cubrir el
  // recorrido. Confirmado con el mapa maestro: Villa Crespo (3.80 km²) era
  // la zona más grande de las 13 nuevas (21-33), bastante por encima del
  // promedio (~2.9 km²). Se le sacó una franja de 0.34 km² (compartida con
  // Almagro Norte, dupla 23) y quedó en ~3.19 km², parejo con sus vecinas.
  // Ver también dupla 23 más abajo (recibió esa misma franja).
  { id:'29', zona:'Villa Crespo',              poligono:'Polígono 29', comuna:'C.15', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/viewer?mid=160RF1O-1fxTGIQdaYQ4PDlxA4-LH3pE', grupo:'nueva' },
  { id:'30', zona:'Agronomía',                 poligono:'Polígono 30', comuna:'C.15', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/viewer?mid=1T4noPhcGo8Be-84jQEb14iMY-ij8kFk', grupo:'nueva' },
  { id:'31', zona:'Chacarita',                 poligono:'Polígono 31', comuna:'C.15', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/viewer?mid=16zz_Ns9avN3ni92oTIcEu2dF2xveFDg', grupo:'nueva' },
  { id:'32', zona:'San Telmo-Constitución',    poligono:'Polígono 32', comuna:'C.1',  kobo:KOBO_SUR,    mymaps:'https://www.google.com/maps/d/viewer?mid=10cAIOzUsfhKN_LC9VxhnzB7alqL7XBE', grupo:'nueva' },
  { id:'33', zona:'Parque Chacabuco',          poligono:'Polígono 33', comuna:'C.7',  kobo:KOBO_SUR,    mymaps:'https://www.google.com/maps/d/viewer?mid=1iDsGxMAY81nsb2gJxuPQAoLcXktl2u4', grupo:'nueva' },
];

// ── Parseo de envíos de KoBo ──────────────────────────────────────────
// Cada formulario de KoBo tiene sus propios nombres de columna. parseRow()
// recibe una fila cruda (del Excel exportado o de la API de KoBo, tienen
// claves parecidas) y devuelve {personas, situacion, hora, fecha, dupla,
// formulario} o null si la fila no tiene una persona registrada.

const SIT_MAP = {
  'Durmiendo/sentado':'Durmiendo/sentado','Circulando/Moviéndose':'Circulando/moviéndose',
  'Cocinando/Comiendo':'Cocinando/comiendo',
  'Vendiendo o mendigando (en puerta de comercio, en semaforo, en la vereda, etc)':'Vendiendo o mendigando',
  'Recolectando en tacho de basura':'Recolectando en tacho',
  4:'Durmiendo/sentado',5:'Cocinando/comiendo',6:'Circulando/moviéndose',
  7:'Vendiendo o mendigando',8:'Recolectando en tacho',9:'Otro',
  '4':'Durmiendo/sentado','5':'Cocinando/comiendo','6':'Circulando/moviéndose',
  '7':'Vendiendo o mendigando','8':'Recolectando en tacho','9':'Otro',
};

// ── Identificación de dupla por geografía (22-23/9/2026) ────────────────
// Bug real en producción: "extractDupla()" (abajo) identificaba la dupla
// leyendo un número de dentro del nombre de usuario de KoBo. Eso dejó de
// funcionar — confirmado con una exportación real de Flash Centro (9395
// filas): el 100% de los envíos vienen de 4 cuentas GENÉRICAS compartidas
// ("delsueloencuestador", "flash_complementario", etc.), ninguna trae un
// número de dupla. El total general de personas contaba bien (esa cuenta
// no depende de la dupla), pero el desglose por dupla daba 0 en TODAS —
// Agustina: "no podemos levantar los datos de kobo reales" / "Pers.
// (KoBo) da 0 en toda la tabla".
//
// Agustina planteó el problema real: "a veces las duplas cambian" — un
// padrón fijo de "esta persona es de tal dupla" se desactualiza solo. La
// zona que cubre cada dupla, en cambio, NO cambia con la gente — así que
// en vez de identificar por PERSONA, se identifica por UBICACIÓN: cada
// envío de KoBo ya trae su punto GPS (`_geo_punto_latitude/longitude` o
// equivalente, KoBo siempre sufija así el nombre de la pregunta de tipo
// geopoint, sea cual sea) — si ese punto cae dentro del polígono
// operativo de una dupla, es de esa dupla, sin importar quién lo cargó.
//
// POLIGONOS_DUPLA sale de un KML real exportado de My Maps
// ("censo_flash_master_30.kml", + duplas 21-24 sueltas, provisto por
// Agustina) — 29 de las 32 duplas reales (`duplas` de abajo va de 01 a
// 33 salteando el 20: no existe una dupla "20" en el operativo actual).
// El KML master SÍ trae una carpeta "Dupla 20" (zona cerca de
// -34.62,-58.44) que no corresponde a ningún id de `duplas` — se
// descartó a propósito, para no atribuirle puntos reales a una dupla
// que no existe. Faltan mapear 31, 32 y 33.
// Cada entrada es un MultiPolígono: un array de anillos [lat,lng], uno
// por sub-área (la mayoría de las duplas son un solo anillo "peine" que
// traza el barrido en zigzag de la cuadrícula que recorren; duplas con
// zonas separadas por una calle ancha o una vía, como la 21, tienen más
// de un anillo). Validado contra 9395 puntos GPS reales de Flash Centro:
// ~52% cae dentro de alguna de estas 29 zonas (esperable — hay datos
// viejos de antes de que existiera esta división en 32 zonas, y algunos
// puntos son GPS con error grosero, ej. un envío ubicado frente a las
// costas de Florida). Ninguna de las 29 quedó en cero.
const POLIGONOS_DUPLA = {
  '01': [[[-34.602391,-58.381255],[-34.602391,-58.369597],[-34.600844,-58.369951],[-34.600844,-58.381411],[-34.599297,-58.381485],[-34.599297,-58.370377],[-34.597750,-58.370999],[-34.597750,-58.381504],[-34.596203,-58.381523],[-34.596203,-58.371814],[-34.594656,-58.372481],[-34.594656,-58.381541],[-34.593109,-58.381560],[-34.593109,-58.373972],[-34.591562,-58.375920],[-34.591562,-58.381012],[-34.590015,-58.380928],[-34.590015,-58.377038],[-34.602391,-58.381255]]],
  '02': [[[-34.591463,-58.390319],[-34.591463,-58.382189],[-34.590023,-58.381926],[-34.590023,-58.393717],[-34.588584,-58.395708],[-34.588584,-58.381869],[-34.587144,-58.384595],[-34.587144,-58.397698],[-34.585705,-58.399688],[-34.585705,-58.387320],[-34.584265,-58.390046],[-34.584265,-58.401679],[-34.582826,-58.403669],[-34.582826,-58.392772],[-34.581386,-58.395498],[-34.581386,-58.403291],[-34.579947,-58.402120],[-34.579947,-58.398224],[-34.591463,-58.390319]]],
  '03': [[[-34.603454,-58.404405],[-34.603454,-58.392853],[-34.603454,-58.392304],[-34.603454,-58.381891],[-34.601681,-58.381980],[-34.601681,-58.392504],[-34.601681,-58.392954],[-34.601681,-58.403841],[-34.599907,-58.403278],[-34.599907,-58.393055],[-34.599907,-58.392703],[-34.599907,-58.382069],[-34.598134,-58.382158],[-34.598134,-58.392903],[-34.598134,-58.393157],[-34.598134,-58.402715],[-34.596361,-58.402152],[-34.596361,-58.393258],[-34.596361,-58.393102],[-34.596361,-58.382247],[-34.594588,-58.382336],[-34.594588,-58.393302],[-34.594588,-58.393360],[-34.594588,-58.401588],[-34.592815,-58.401025],[-34.592815,-58.392770],[-34.592815,-58.392714],[-34.592815,-58.388728],[-34.592815,-58.384663],[-34.592815,-58.382425],[-34.591042,-58.390814],[-34.591042,-58.391002],[-34.591042,-58.392624],[-34.591042,-58.400462],[-34.589268,-58.399899],[-34.589268,-58.394924],[-34.603454,-58.404405]]],
  '04': [[[-34.602232,-58.416288],[-34.602232,-58.405186],[-34.600156,-58.404358],[-34.600156,-58.415479],[-34.598080,-58.414669],[-34.598080,-58.403530],[-34.596004,-58.402702],[-34.596004,-58.413860],[-34.593928,-58.413050],[-34.593928,-58.401875],[-34.591852,-58.401047],[-34.591852,-58.412240],[-34.589776,-58.410724],[-34.589776,-58.400219],[-34.587700,-58.397823],[-34.587700,-58.409164],[-34.585624,-58.407604],[-34.585624,-58.399641],[-34.602232,-58.416288]]],
  '05': [[[-34.601120,-58.434392],[-34.601120,-58.416788],[-34.599047,-58.416196],[-34.599047,-58.437046],[-34.596975,-58.433928],[-34.596975,-58.415604],[-34.594902,-58.414525],[-34.594902,-58.430810],[-34.592830,-58.427691],[-34.592830,-58.413191],[-34.590757,-58.411696],[-34.590757,-58.424573],[-34.588684,-58.421356],[-34.588684,-58.410091],[-34.586612,-58.408487],[-34.586612,-58.409117],[-34.586612,-58.409197],[-34.586612,-58.417906],[-34.584539,-58.414455],[-34.584539,-58.407221],[-34.584539,-58.407055],[-34.584539,-58.406883],[-34.601120,-58.434392]]],
  '06': [[[-34.579888,-58.419152],[-34.579888,-58.402371],[-34.576968,-58.401653],[-34.576968,-58.425125],[-34.574048,-58.424534],[-34.574048,-58.405681],[-34.571127,-58.410147],[-34.571127,-58.423943],[-34.568207,-58.428853],[-34.568207,-58.414105],[-34.565287,-58.418055],[-34.565287,-58.434225],[-34.562366,-58.439598],[-34.562366,-58.422194],[-34.559446,-58.426368],[-34.559446,-58.443202],[-34.556526,-58.438959],[-34.556526,-58.430542],[-34.579888,-58.419152]]],
  '07': [[[-34.597814,-58.441002],[-34.597814,-58.435162],[-34.595719,-58.431981],[-34.595719,-58.443206],[-34.593624,-58.444340],[-34.593624,-58.428801],[-34.591529,-58.425620],[-34.591529,-58.441622],[-34.589434,-58.438904],[-34.589434,-58.422439],[-34.587340,-58.419258],[-34.587340,-58.435915],[-34.585245,-58.431280],[-34.585245,-58.416078],[-34.583150,-58.412897],[-34.583150,-58.430123],[-34.581055,-58.427733],[-34.581055,-58.420219],[-34.597814,-58.441002]]],
  '08': [[[-34.591911,-58.447945],[-34.591911,-58.443126],[-34.590071,-58.440807],[-34.590071,-58.449545],[-34.588230,-58.450239],[-34.588230,-58.438487],[-34.586389,-58.436168],[-34.586389,-58.448003],[-34.584548,-58.445767],[-34.584548,-58.433848],[-34.582707,-58.431529],[-34.582707,-58.443636],[-34.580867,-58.441653],[-34.580867,-58.429209],[-34.579026,-58.426890],[-34.579026,-58.439670],[-34.577185,-58.437687],[-34.577185,-58.430487],[-34.591911,-58.447945]]],
  '09': [[[-34.586294,-58.452799],[-34.586294,-58.447898],[-34.584464,-58.444974],[-34.584464,-58.454594],[-34.582635,-58.456340],[-34.582635,-58.443390],[-34.580806,-58.441805],[-34.580806,-58.457959],[-34.578977,-58.459578],[-34.578977,-58.440221],[-34.577148,-58.438637],[-34.577148,-58.461324],[-34.575318,-58.463166],[-34.575318,-58.443044],[-34.573489,-58.447818],[-34.573489,-58.461780],[-34.571660,-58.459992],[-34.571660,-58.452209],[-34.586294,-58.452799]]],
  '10': [[[-34.572075,-58.434103],[-34.572075,-58.428599],[-34.570001,-58.430725],[-34.570001,-58.436112],[-34.570001,-58.440143],[-34.570001,-58.444328],[-34.567926,-58.448287],[-34.567926,-58.430661],[-34.565852,-58.433269],[-34.565852,-58.451843],[-34.563777,-58.453804],[-34.563777,-58.436868],[-34.561703,-58.442157],[-34.561703,-58.455765],[-34.559628,-58.457726],[-34.559628,-58.447301],[-34.557554,-58.451648],[-34.557554,-58.459687],[-34.555479,-58.461648],[-34.555479,-58.454810],[-34.572075,-58.434103]]],
  '11': [[[-34.574208,-58.444573],[-34.574208,-58.437936],[-34.572164,-58.441717],[-34.572164,-58.449775],[-34.570120,-58.454977],[-34.570120,-58.445499],[-34.568075,-58.449280],[-34.568075,-58.458266],[-34.566031,-58.460229],[-34.566031,-58.452860],[-34.563987,-58.454531],[-34.563987,-58.462193],[-34.561942,-58.463846],[-34.561942,-58.456202],[-34.559898,-58.458109],[-34.559898,-58.465481],[-34.557853,-58.466294],[-34.557853,-58.460423],[-34.574208,-58.444573]]],
  '12': [[[-34.574620,-58.474951],[-34.574620,-58.471042],[-34.573103,-58.468295],[-34.573103,-58.476312],[-34.571587,-58.477674],[-34.571587,-58.465664],[-34.570070,-58.463134],[-34.570070,-58.478958],[-34.568554,-58.478710],[-34.568554,-58.460583],[-34.567037,-58.459492],[-34.567037,-58.474449],[-34.565521,-58.471554],[-34.565521,-58.460804],[-34.564004,-58.462094],[-34.564004,-58.469173],[-34.562488,-58.466792],[-34.562488,-58.463399],[-34.574620,-58.474951]]],
  '13': [[[-34.557392,-58.450306],[-34.557392,-58.441957],[-34.555016,-58.438124],[-34.555016,-58.454998],[-34.552641,-58.458189],[-34.552641,-58.435736],[-34.550266,-58.438661],[-34.550266,-58.460883],[-34.547890,-58.462625],[-34.547890,-58.455496],[-34.547890,-58.450001],[-34.547890,-58.441587],[-34.545515,-58.457777],[-34.545515,-58.464203],[-34.543140,-58.465112],[-34.543140,-58.460057],[-34.540764,-58.462338],[-34.540764,-58.466020],[-34.538389,-58.466928],[-34.538389,-58.464619],[-34.557392,-58.450306]]],
  '14': [[[-34.555644,-58.468916],[-34.555644,-58.462815],[-34.553522,-58.459150],[-34.553522,-58.463816],[-34.553522,-58.464485],[-34.553522,-58.470575],[-34.551399,-58.472234],[-34.551399,-58.466156],[-34.551399,-58.465502],[-34.551399,-58.460244],[-34.549277,-58.461999],[-34.549277,-58.467187],[-34.549277,-58.467826],[-34.549277,-58.474373],[-34.547155,-58.475409],[-34.547155,-58.469496],[-34.547155,-58.468873],[-34.547155,-58.463753],[-34.545033,-58.464881],[-34.545033,-58.470558],[-34.545033,-58.471167],[-34.545033,-58.476445],[-34.542911,-58.477481],[-34.542911,-58.472837],[-34.542911,-58.472244],[-34.542911,-58.465797],[-34.540788,-58.466713],[-34.540788,-58.473929],[-34.540788,-58.474507],[-34.540788,-58.478517],[-34.538666,-58.473308],[-34.538666,-58.467421],[-34.555644,-58.468916]]],
  '15': [[[-34.565086,-58.489025],[-34.565086,-58.481377],[-34.562372,-58.476098],[-34.562372,-58.476608],[-34.562372,-58.476645],[-34.562372,-58.491164],[-34.559658,-58.492888],[-34.559658,-58.479139],[-34.559658,-58.478697],[-34.559658,-58.470888],[-34.556944,-58.467950],[-34.556944,-58.480786],[-34.556944,-58.480987],[-34.556944,-58.494594],[-34.554229,-58.496375],[-34.554229,-58.483023],[-34.554229,-58.482899],[-34.554229,-58.470235],[-34.551515,-58.472521],[-34.551515,-58.485029],[-34.551515,-58.485060],[-34.551515,-58.487600],[-34.551515,-58.490997],[-34.551515,-58.498707],[-34.548801,-58.497332],[-34.548801,-58.493169],[-34.548801,-58.484631],[-34.548801,-58.474606],[-34.546087,-58.475931],[-34.546087,-58.486662],[-34.543372,-58.484130],[-34.543372,-58.477256],[-34.565086,-58.489025]]],
  '16': [[[-34.572427,-58.499891],[-34.572427,-58.495736],[-34.570920,-58.492829],[-34.570920,-58.501139],[-34.569413,-58.502359],[-34.569413,-58.489782],[-34.567906,-58.486732],[-34.567906,-58.503549],[-34.566399,-58.502096],[-34.566399,-58.487771],[-34.564892,-58.488932],[-34.564892,-58.498991],[-34.563385,-58.495942],[-34.563385,-58.490093],[-34.561878,-58.491254],[-34.561878,-58.493289],[-34.560371,-58.492516],[-34.560371,-58.492416],[-34.572427,-58.499891]]],
  '17': [[[-34.583297,-58.490537],[-34.583297,-58.486004],[-34.581727,-58.483411],[-34.581727,-58.492477],[-34.580157,-58.494416],[-34.580157,-58.480819],[-34.578587,-58.478030],[-34.578587,-58.493727],[-34.577017,-58.491186],[-34.577017,-58.475104],[-34.575447,-58.474289],[-34.575447,-58.488645],[-34.573877,-58.486627],[-34.573877,-58.475733],[-34.572307,-58.477128],[-34.572307,-58.484627],[-34.570737,-58.482626],[-34.570737,-58.478440],[-34.583297,-58.490537]]],
  '18': [[[-34.576656,-58.496542],[-34.576656,-58.491408],[-34.574557,-58.487737],[-34.574557,-58.498244],[-34.572458,-58.495362],[-34.572458,-58.484791],[-34.570360,-58.482164],[-34.570360,-58.491148],[-34.568261,-58.487314],[-34.568261,-58.478410],[-34.566162,-58.473077],[-34.566162,-58.483221],[-34.564063,-58.479159],[-34.564063,-58.469469],[-34.561964,-58.466036],[-34.561964,-58.475191],[-34.559865,-58.471224],[-34.559865,-58.465394],[-34.576656,-58.496542]]],
  '19': [[[-34.591300,-58.505809],[-34.591300,-58.499135],[-34.588636,-58.494799],[-34.588636,-58.508147],[-34.585972,-58.510484],[-34.585972,-58.490462],[-34.583309,-58.490435],[-34.583309,-58.512822],[-34.580645,-58.513576],[-34.580645,-58.504157],[-34.580645,-58.501369],[-34.580645,-58.493726],[-34.577981,-58.495467],[-34.577981,-58.512828],[-34.575317,-58.511569],[-34.575317,-58.497628],[-34.572654,-58.499713],[-34.572654,-58.510308],[-34.569990,-58.509061],[-34.569990,-58.501842],[-34.591300,-58.505809]]],
  '21': [[[-34.603081,-58.370428],[-34.603612,-58.381257],[-34.617639,-58.380584],[-34.617131,-58.369292],[-34.609846,-58.369684],[-34.608784,-58.369726],[-34.609107,-58.373233],[-34.608045,-58.373388],[-34.607884,-58.371227],[-34.607491,-58.370526],[-34.606360,-58.369909],[-34.603081,-58.370428]],[[-34.617593,-58.380976],[-34.603923,-58.381706],[-34.604484,-58.394118],[-34.604497,-58.393728],[-34.613987,-58.393325],[-34.618217,-58.393381],[-34.617593,-58.380976]]],
  '22': [[[-34.627979,-58.433419],[-34.630502,-58.451623],[-34.627699,-58.452922],[-34.624288,-58.454644],[-34.623478,-58.452536],[-34.620207,-58.444927],[-34.620775,-58.444787],[-34.623088,-58.443736],[-34.622753,-58.442534],[-34.622841,-58.440710],[-34.623212,-58.436762],[-34.623011,-58.434564],[-34.627979,-58.433419]]],
  '23': [[[-34.623334,-58.455100],[-34.607434,-58.462231],[-34.604629,-58.458402],[-34.606711,-58.450112],[-34.607636,-58.446248],[-34.605988,-58.440030],[-34.608966,-58.440030],[-34.614261,-58.438217],[-34.614595,-58.439359],[-34.614718,-58.440560],[-34.616361,-58.443157],[-34.617279,-58.445646],[-34.619439,-58.445115],[-34.623334,-58.455100]]],
  '24': [[[-34.608908,-58.439925],[-34.605814,-58.439960],[-34.602755,-58.443092],[-34.601050,-58.440289],[-34.600017,-58.438657],[-34.601354,-58.434347],[-34.601939,-58.432551],[-34.603188,-58.421215],[-34.603657,-58.416734],[-34.604185,-58.412968],[-34.604045,-58.408937],[-34.604596,-58.405558],[-34.607430,-58.406101],[-34.608781,-58.406081],[-34.608841,-58.406751],[-34.607900,-58.406807],[-34.608507,-58.415549],[-34.609843,-58.422041],[-34.611019,-58.425944],[-34.612927,-58.430154],[-34.610885,-58.430290],[-34.614206,-58.438028],[-34.614215,-58.438058],[-34.608908,-58.439925]]],
  '25': [[[-34.609736,-58.420989],[-34.608947,-58.416158],[-34.608960,-58.409303],[-34.609093,-58.409033],[-34.619619,-58.408142],[-34.619927,-58.408879],[-34.623123,-58.434452],[-34.623003,-58.434477],[-34.622983,-58.434252],[-34.622044,-58.427755],[-34.615227,-58.429179],[-34.615419,-58.429988],[-34.613701,-58.430102],[-34.609736,-58.420989]]],
  '26': [[[-34.605350,-58.473826],[-34.601919,-58.469105],[-34.604409,-58.458482],[-34.604651,-58.457634],[-34.607505,-58.446163],[-34.605752,-58.440184],[-34.605821,-58.439954],[-34.602755,-58.443176],[-34.599885,-58.438343],[-34.593114,-58.446605],[-34.595815,-58.454938],[-34.596416,-58.457804],[-34.596491,-58.459958],[-34.596454,-58.464162],[-34.600796,-58.477441],[-34.605350,-58.473826]]],
  '27': [[[-34.618131,-58.393426],[-34.613966,-58.393325],[-34.604538,-58.393753],[-34.604484,-58.394118],[-34.604700,-58.404538],[-34.604648,-58.405532],[-34.605481,-58.405695],[-34.606731,-58.405912],[-34.607630,-58.406060],[-34.608775,-58.405988],[-34.608850,-58.405843],[-34.608833,-58.406000],[-34.608909,-58.406871],[-34.609025,-58.408909],[-34.619554,-58.408048],[-34.619465,-58.406881],[-34.629148,-58.405295],[-34.628571,-58.401053],[-34.627175,-58.391132],[-34.618190,-58.391759],[-34.618131,-58.393426]]],
  '28': [[[-34.578137,-58.477180],[-34.579125,-58.476165],[-34.579884,-58.475381],[-34.581860,-58.473720],[-34.587237,-58.470728],[-34.588352,-58.471605],[-34.592310,-58.475772],[-34.592457,-58.473779],[-34.595076,-58.471787],[-34.595100,-58.475801],[-34.596594,-58.476218],[-34.599678,-58.477675],[-34.596277,-58.465298],[-34.592559,-58.464084],[-34.590653,-58.466551],[-34.585402,-58.460534],[-34.590052,-58.451882],[-34.596184,-58.458611],[-34.595544,-58.455266],[-34.594222,-58.450355],[-34.592253,-58.448018],[-34.580555,-58.457920],[-34.577661,-58.460954],[-34.575088,-58.463447],[-34.572318,-58.467052],[-34.578137,-58.477180]]],
  '29': [[[-34.578707,-58.478057],[-34.579190,-58.478947],[-34.593613,-58.503431],[-34.594157,-58.503071],[-34.594453,-58.503431],[-34.596630,-58.497363],[-34.597619,-58.483124],[-34.599671,-58.478618],[-34.599580,-58.478597],[-34.596765,-58.477407],[-34.595859,-58.476902],[-34.595272,-58.476783],[-34.595149,-58.476842],[-34.592138,-58.475801],[-34.588419,-58.471884],[-34.587155,-58.470808],[-34.581249,-58.474275],[-34.578023,-58.477180],[-34.578707,-58.478057]]],
  '30': [[[-34.620103,-58.411824],[-34.620285,-58.412524],[-34.623184,-58.434452],[-34.627843,-58.433364],[-34.627069,-58.426928],[-34.640225,-58.423737],[-34.638162,-58.411436],[-34.635627,-58.410256],[-34.633139,-58.411584],[-34.630240,-58.411602],[-34.629178,-58.405406],[-34.619465,-58.407066],[-34.619830,-58.409463],[-34.620103,-58.411824]]],
};

// Ray casting estándar (par/impar) — mismo algoritmo que ya usa
// shared/js/mapa-puntos.js para las zonas de Umbral 0.
function puntoDentroPoligono(lat, lng, poly){
  let dentro = false;
  for(let i=0, j=poly.length-1; i<poly.length; j=i++){
    const yi=poly[i][0], xi=poly[i][1], yj=poly[j][0], xj=poly[j][1];
    const interseca = ((yi>lat) !== (yj>lat)) && (lng < (xj-xi)*(lat-yi)/(yj-yi)+xi);
    if(interseca) dentro = !dentro;
  }
  return dentro;
}

// Distancia mínima (en metros) de un punto al BORDE de un polígono —
// proyecta al segmento más cercano de cada lado, no solo al vértice más
// cercano (un vértice puede estar lejos aunque el punto esté pegado a la
// mitad de un lado largo). Conversión lat/lng -> metros aproximada con un
// plano local centrado en el propio punto (suficiente a esta escala,
// unos pocos km).
function _distanciaBordePoligono(lat, lng, poly){
  const toXY = (la, ln) => [ ln * 111320 * Math.cos(lat * Math.PI / 180), la * 111320 ];
  const p = toXY(lat, lng);
  let min = Infinity;
  for(let i=0; i<poly.length; i++){
    const a = toXY(poly[i][0], poly[i][1]);
    const b = toXY(poly[(i+1)%poly.length][0], poly[(i+1)%poly.length][1]);
    const dx = b[0]-a[0], dy = b[1]-a[1];
    const len2 = dx*dx + dy*dy;
    let t = len2 ? ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + t*dx, cy = a[1] + t*dy;
    const d = Math.hypot(p[0]-cx, p[1]-cy);
    if(d < min) min = d;
  }
  return min;
}

// Margen de tolerancia para identificar dupla por GPS (14/10/2026,
// Agustina: "dupla 17 tiene flash centro y tiene muchos registros en kobo
// y nada en la plataforma"). Las zonas de las duplas 01-19 son corredores
// angostos en zigzag ("peine") que calcan la calle exacta — algunas de
// pocos metros de ancho. Confirmado con coordenadas reales de dupla 17
// (14/10/2026): sus 7 envíos más recientes caían TODOS afuera del
// polígono exacto, a entre 0.7 y 76 metros del borde — nunca lejos (el
// polígono está bien puesto, el corte sin margen es lo que fallaba). 80m
// cubre ese rango real con margen de sobra (el error de GPS típico en
// una calle con edificios ronda 20-70m). No confundir con el caso de un
// punto de verdad fuera de cobertura (ej. Flash Sur sin validar — un
// envío real de esa dupla dio 155m al polígono mapeado más cercano, muy
// por encima de este margen, y con razón: esa dupla hoy no tiene
// polígono cargado en absoluto).
const MARGEN_DUPLA_METROS = 80;

// Devuelve el id de dupla (string "01".."33") cuyo polígono contiene el
// punto (con margen de tolerancia si no cae exacto adentro), o null si no
// cae ni cerca de ninguna de las mapeadas todavía. Primero prueba
// contención exacta en todos los polígonos (gratis, como antes); solo si
// ninguno lo contiene, busca el polígono más cercano dentro del margen —
// así un punto adentro de verdad nunca se ve afectado por este cambio, y
// uno "cerca" ya no se pierde.
function duplaPorGeo(lat, lng){
  if(lat==null || lng==null || isNaN(lat) || isNaN(lng)) return null;
  for(const id of Object.keys(POLIGONOS_DUPLA)){
    for(const sub of POLIGONOS_DUPLA[id]){
      if(puntoDentroPoligono(lat, lng, sub)) return id;
    }
  }
  let mejorId = null, mejorDist = MARGEN_DUPLA_METROS;
  for(const id of Object.keys(POLIGONOS_DUPLA)){
    for(const sub of POLIGONOS_DUPLA[id]){
      const d = _distanciaBordePoligono(lat, lng, sub);
      if(d <= mejorDist){ mejorDist = d; mejorId = id; }
    }
  }
  return mejorId;
}

// KoBo sufija SIEMPRE `_latitude`/`_longitude` al nombre de la pregunta
// de tipo geopoint, sea cual sea ese nombre (Centro usa "geo_punto",
// Norte puede usar otro) — buscar por sufijo evita hardcodear el nombre
// exacto de la pregunta de cada formulario.
// Bug real en producción (23/9/2026): con datos en vivo (API de KoBo,
// vía fetchKoboAll) esta función no encontraba NUNCA el punto — daba
// "Pers. (KoBo)" en 0 en todas las duplas, aunque el total general sí
// contaba bien (personas no depende de esto). Causa: solo probaba el
// formato de columnas separadas `<pregunta>_latitude`/`_longitude`, que
// es como KoBo arma el Excel EXPORTADO — pero la respuesta cruda de la
// API (lo que trae fetchKoboAll en vivo) no lo separa así; el punto
// viaja en `_geolocation` como array `[lat, lng]` (mismo campo que ya
// usa parseUmbral0() en config/umbral-0.js) o, según el formulario,
// como un string "lat lng alt precisión" en el campo de la propia
// pregunta. Se prueban los tres formatos, en ese orden.
function extractLatLng(row){
  if(Array.isArray(row['_geolocation']) && row['_geolocation'].length >= 2){
    const lat = parseFloat(row['_geolocation'][0]), lng = parseFloat(row['_geolocation'][1]);
    if(!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  for(const key of Object.keys(row)){
    if(!key.endsWith('_latitude')) continue;
    const lngKey = key.slice(0, -'_latitude'.length) + '_longitude';
    if(row[lngKey] === undefined) continue;
    const lat = parseFloat(row[key]), lng = parseFloat(row[lngKey]);
    if(!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  for(const key of Object.keys(row)){
    const v = row[key];
    if(typeof v !== 'string') continue;
    const m = v.trim().match(/^(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
    if(m){
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if(!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
  }
  return null;
}

// Geografía primero (confiable, no depende de quién cargó); si el punto
// no cae en ninguna de las 30 zonas mapeadas (duplas 31/32 todavía sin
// polígono, o el GPS falló), se prueba con el nombre de usuario como
// respaldo — no hace daño dejarlo, por si alguna vez vuelve a haber
// cuentas por dupla.
// Devuelve SIEMPRE con cero a la izquierda ('01', no 1) — mismo formato
// que `d.id` en `duplas` y que normDupla() en dashboard-engine.js. Antes
// perdía el padding acá (parseInt('01')===1), lo que rompía en
// silencio el desglose por polígono/comuna para las duplas 01-09: la
// tabla guardaba la suma bajo la clave "1" pero la buscaba bajo "01",
// así que esas 9 duplas siempre mostraban 0 aunque tuvieran datos
// reales — bug real, no reportado explícitamente pero encontrado al
// conectar el mapa (28/9/2026).
function resolverDupla(row){
  const geo = extractLatLng(row);
  if(geo){
    const porGeo = duplaPorGeo(geo.lat, geo.lng);
    if(porGeo) return porGeo;
  }
  return extractDupla(row);
}

function extractDupla(row){
  const user = String(row['username'] || row['_submitted_by'] || '');
  const n = parseInt(user.replace(/\D/g,''), 10);
  return isNaN(n) ? null : String(n).padStart(2,'0');
}

// Techo de sensatez para "cantidad de personas" de UN punto de censo — bug
// real en producción (22-23/9/2026, Agustina: "no podemos levantar los
// datos de kobo reales", el dashboard mostraba "1.908.286.156 personas").
// Confirmado contra una exportación real de Flash Centro (9395 filas): 10
// de esas filas tenían un valor absurdo cargado en `cant_pers` (hasta
// 95.944.098 en una sola) — error de carga o de dispositivo, no algo que
// una dupla haya tipeado a propósito. Las otras 9385 filas son totalmente
// razonables (mediana 1 persona, percentil 99 = 5). Sin este techo,
// `parseInt()` confía ciegamente en el número crudo y una sola fila
// corrupta vuela el total de todo el operativo. 50 es generoso (10x el
// percentil 99 real) — si algún día un punto real junta más gente que
// eso (un campamento grande, por ejemplo), conviene subir el número, no
// sacarlo.
const PERSONAS_MAX_PLAUSIBLE = 50;
function personasValidas(n){
  return (n > 0 && n <= PERSONAS_MAX_PLAUSIBLE) ? n : 0;
}

// Formulario "Flash Norte" (desde sept/2026) — es el mismo asset de KoBo
// que antes se llamaba "Flash 2", solo cambió qué duplas lo usan.
//
// Bug real encontrado 29/9/2026 (Agustina, comparando contra el Excel
// exportado real de KoBo porque "temo que la plataforma no los esta
// contabilizando bien"): la columna con la cantidad de personas en Flash
// Norte se llama literalmente `cant_pers` — igual que en Flash Centro —,
// pero esta función buscaba una columna que contuviera "cantidad" o
// "person", que "cant_pers" no matchea de ninguna de las dos formas.
// Resultado: TODOS los envíos de Flash Norte volvían con personas=0 y se
// descartaban en silencio (return null más abajo) — el 78% del volumen
// real del operativo (Norte tiene muchas más filas que Centro) no se
// contaba en "Total personas observadas" ni en "Puntos registrados".
// Confirmado contra la exportación real: sobre 9.510 envíos de Flash
// Norte en el rango 1/6-30/8/2026, esta función encontraba personas>0 en
// CERO de ellos. Se corrige probando `cant_pers` directo primero (mismo
// campo, mismo criterio que parseCentro), y se deja el barrido genérico
// como respaldo por si alguna vez cambia el nombre del campo.
function parseNorte(row){
  let personas = personasValidas(parseInt(row['cant_pers']||0)||0);
  if(personas<=0){
    for(const key of Object.keys(row)){
      const k = key.toLowerCase();
      if(k.includes('cantidad') || (k.includes('person') && !k.includes('_by'))){
        const v = personasValidas(parseInt(row[key]||0)||0);
        if(v>0){ personas=v; break; }
      }
    }
  }
  if(personas<=0) return null;
  const start = row['start'] || row['_submission_time'];
  const geo = extractLatLng(row);
  return { personas, situacion:'—', hora: start? new Date(start).getHours(): null, fecha:start, dupla: resolverDupla(row), formulario:'Flash Norte', lat: geo?geo.lat:null, lng: geo?geo.lng:null };
}

// Formulario "Flash Centro" (desde sept/2026) — es el mismo asset de KoBo
// que antes se llamaba "Flash 1", solo cambió qué duplas lo usan.
function parseCentro(row){
  let personas = personasValidas(parseInt(row['cant_pers']||0)||0);
  if(personas<=0){
    for(const key of Object.keys(row)){
      const k=key.toLowerCase();
      if(k.includes('cant') && k.includes('pers')){ personas=personasValidas(parseInt(row[key]||0)||0); if(personas>0) break; }
    }
  }
  if(personas<=0) return null;
  const start = row['start'] || row['_submission_time'];
  const sit = SIT_MAP[row['sit_calle']] || row['sit_calle'] || 'Otro';
  const geo = extractLatLng(row);
  return { personas, situacion: sit, hora: start? new Date(start).getHours(): null, fecha:start, dupla: resolverDupla(row), formulario:'Flash Centro', lat: geo?geo.lat:null, lng: geo?geo.lng:null };
}

// Formulario "Flash Sur" (nuevo desde sept/2026) — ID de KoBo ya
// confirmado (30/9/2026), pero todavía no hay una muestra real de sus
// columnas (a diferencia de Norte/Centro, que se validaron contra
// exportaciones reales — ver el bug real de parseNorte más abajo). Uso
// el mismo parseo que "Flash Centro" como punto de partida razonable
// (misma familia de formulario Flash), pero HAY QUE VALIDARLO contra el
// primer envío real y ajustar si hace falta (columnas distintas, campo
// de situación con otro nombre, etc. — exactamente el tipo de cosa que
// hizo fallar a parseNorte en silencio).
function parseSur(row){
  const r = parseCentro(row);
  return r ? { ...r, formulario:'Flash Sur' } : null;
}

// zonasOperativas — mismo formato que ZONAS_OPERATIVAS_UMBRAL_0 (ver
// config/umbral-0.js) para poder reusar renderMapaPuntos() de
// shared/js/mapa-puntos.js tal cual, sin duplicar lógica de mapa.
// Pedido de Agustina (29/9/2026): "hacer de censo flash el mismo mapa
// que hacemos en umbral 0". Se arma en vivo a partir de POLIGONOS_DUPLA
// (KML real) — no hay que mantenerlo a mano.
// Nota: cada entrada de POLIGONOS_DUPLA es un MultiPolígono (array de
// anillos); acá se usa solo el primer anillo (el principal) para cada
// dupla — solo la dupla 21 tiene un segundo anillo (zona separada por
// una vía), que queda afuera del dibujo por ahora.
const PALETA_CENSO_FLASH = ['#1a56db','#dc2626','#059669','#7c3aed','#ea580c','#0891b2','#db2777','#65a30d','#9333ea','#0d9488','#e11d48','#4f46e5','#ca8a04'];
function colorParaDupla(id){
  const idx = parseInt(id, 10) % PALETA_CENSO_FLASH.length;
  return PALETA_CENSO_FLASH[idx];
}
const ZONAS_OPERATIVAS_CENSO_FLASH = { porDupla: {} };
duplas.forEach(d => {
  const anillos = POLIGONOS_DUPLA[d.id];
  if(!anillos || !anillos.length) return; // duplas 31/32/33 todavía sin polígono
  ZONAS_OPERATIVAS_CENSO_FLASH.porDupla[d.id] = {
    nombre: `${d.zona} — ${d.poligono}`,
    poly: anillos[0],
    color: colorParaDupla(d.id),
  };
});

window.PROJECT_CONFIG_CENSO_FLASH = {
  id: 'censo-flash',
  nombre: 'Releva Flash',
  emoji: '🏙️',
  descripcion: 'Relevamiento nocturno de personas en situación de calle en la Ciudad de Buenos Aires.',
  badge: 'Operativo oficial',
  colorNavy:'#0f1f3d', colorBlue:'#1a56db', colorGreen:'#10b981', colorAmber:'#f59e0b', colorRed:'#ef4444',
  whatsappNumero: '+54 9 11 5049-5440',
  whatsappLink: 'https://wa.me/5491150495440',
  horario: { dias:'📅 Martes y miércoles', franja:'🕙 22:00 a 02:00' },
  // Calendario de fechas de salida para el dashboard: todos los martes (2) y
  // miércoles (3) entre "desde" y "hasta" (getDay(): domingo=0 ... sábado=6).
  calendario: { desde:'2026-08-01', hasta:'2026-12-31', diasSemana:[2,3] },
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyqqp7fEA-A0jAtMHr7x5KaWkkxQzQ7EJVdGcC7l4PQPN2wTpEyVssTnji8-skojO1Esg/exec',
  // Clave para leer Cierres+Presentes en vivo desde el Apps Script (doGet).
  // Tiene que coincidir EXACTO con la constante KEY del doGet en el script.
  // No es un secreto fuerte (viaja en el JS del navegador, como el resto de
  // las credenciales de este proyecto) — solo evita que cualquiera que
  // adivine la URL del Apps Script pueda leer los datos sin este parámetro.
  sheetReadKey: '5wMd3KXaZVSYItilU_6QRWjZ_xriEgba',
  // Contraseña de acceso al dashboard para el cliente de ESTE proyecto
  // (área de GCBA a cargo de Censo Flash). Un cliente que entra con esto
  // solo ve este proyecto — nunca los demás. La contraseña de admin
  // (config/platform.js) sigue viendo todos los proyectos.
  clientPassword: 'Censoflash2026#',
  // Contraseña de coordinación: ve todo lo operativo de este proyecto
  // (duplas activas, cierres, alertas) igual que el cliente, pero SIN la
  // sección de KoBo — pensada para quien coordina el operativo día a día,
  // no para rendición de cuentas.
  coordPassword: 'Coordinacion2026#',
  comunas,
  duplas,
  zonasOperativas: ZONAS_OPERATIVAS_CENSO_FLASH,
  kobo: {
    token: '685fc2e5a79995c816b2652530a9fc520387a630',
    base: 'https://kf.kobotoolbox.org/api/v2/assets',
    // Desde sept/2026 el link público (el que usan las duplas para cargar,
    // ver `kobo` en cada dupla arriba) ya no corre en rangos contiguos —
    // por eso el nombre de cada formulario acá ya no dice qué duplas
    // cubre. `extractDupla()` sigue resolviendo la dupla correcta desde el
    // username de cada envío sin importar en qué formulario haya entrado.
    forms: [
      { id:'aPou2eJThDtn45mdmfrbaA', nombre:'Flash Norte (ex Flash 2)', parseRow: parseNorte },
      { id:'aH2SygyBTRCkqCgBtu4m3R', nombre:'Flash Centro (ex Flash 1)', parseRow: parseCentro },
      // ID real confirmado por Agustina 30/9/2026 (antes pendiente, ver
      // kf.kobotoolbox.org/#/forms/aBVmBrbhxVuujtx2254vGT/landing).
      // parseSur() por ahora es una copia de parseCentro (misma familia
      // de formulario) — falta validarla contra un envío real de este
      // form específico (columnas podrían diferir, ver nota en parseSur()).
      { id:'aBVmBrbhxVuujtx2254vGT', nombre:'Flash Sur', parseRow: parseSur },
    ],
  },
};

window.PROJECT_CONFIG = window.PROJECT_CONFIG_CENSO_FLASH;

})();
