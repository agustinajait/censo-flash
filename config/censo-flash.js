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
  { id:'29', zona:'Villa Crespo',              poligono:'Polígono 29', comuna:'C.15', kobo:KOBO_CENTRO, mymaps:'https://www.google.com/maps/d/viewer?mid=1Y5-QKnPRqLvVQlqOHjeHbJP6OMGlKJk', grupo:'nueva' },
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

function extractDupla(row){
  const user = String(row['username'] || row['_submitted_by'] || '');
  const n = parseInt(user.replace(/\D/g,''), 10);
  return isNaN(n) ? null : n;
}

// Formulario "Flash Norte" (desde sept/2026) — es el mismo asset de KoBo
// que antes se llamaba "Flash 2", solo cambió qué duplas lo usan.
function parseNorte(row){
  let personas = 0;
  for(const key of Object.keys(row)){
    const k = key.toLowerCase();
    if(k.includes('cantidad') || (k.includes('person') && !k.includes('_by'))){
      const v = parseInt(row[key]||0)||0;
      if(v>0){ personas=v; break; }
    }
  }
  if(personas<=0) return null;
  const start = row['start'] || row['_submission_time'];
  return { personas, situacion:'—', hora: start? new Date(start).getHours(): null, fecha:start, dupla: extractDupla(row), formulario:'Flash Norte' };
}

// Formulario "Flash Centro" (desde sept/2026) — es el mismo asset de KoBo
// que antes se llamaba "Flash 1", solo cambió qué duplas lo usan.
function parseCentro(row){
  let personas = parseInt(row['cant_pers']||0)||0;
  if(personas<=0){
    for(const key of Object.keys(row)){
      const k=key.toLowerCase();
      if(k.includes('cant') && k.includes('pers')){ personas=parseInt(row[key]||0)||0; if(personas>0) break; }
    }
  }
  if(personas<=0) return null;
  const start = row['start'] || row['_submission_time'];
  const sit = SIT_MAP[row['sit_calle']] || row['sit_calle'] || 'Otro';
  return { personas, situacion: sit, hora: start? new Date(start).getHours(): null, fecha:start, dupla: extractDupla(row), formulario:'Flash Centro' };
}

// Formulario "Flash Sur" (nuevo desde sept/2026) — todavía no tenemos el
// ID interno de KoBo (el `.../forms/aXXXXXXX/` que se ve en la URL al
// abrir el formulario en kf.kobotoolbox.org) ni una muestra real de sus
// columnas. Uso el mismo parseo que "Flash Centro" como punto de partida
// razonable (misma familia de formulario Flash), pero HAY QUE
// VALIDARLO contra el primer envío real del martes y ajustar si hace
// falta (columnas distintas, campo de situación con otro nombre, etc.).
function parseSur(row){
  const r = parseCentro(row);
  return r ? { ...r, formulario:'Flash Sur' } : null;
}

window.PROJECT_CONFIG_CENSO_FLASH = {
  id: 'censo-flash',
  nombre: 'Censo Flash',
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
      // TODO: falta el ID interno de "Flash Sur" (formulario nuevo, sin
      // reemplazo previo) — sin esto el dashboard no puede traer sus
      // envíos. Conseguirlo en kf.kobotoolbox.org → abrir el formulario →
      // copiar el ID de la URL (.../forms/aXXXXXXXXXXXXXXXXXXX/...).
      // { id:'PENDIENTE', nombre:'Flash Sur (nuevo)', parseRow: parseSur },
    ],
  },
};

window.PROJECT_CONFIG = window.PROJECT_CONFIG_CENSO_FLASH;

})();
