// Config del proyecto "Censo Flash" — relevamiento nocturno de personas en
// situación de calle en CABA. Todo lo que hoy vive hardcodeado en index.html,
// cierre.html y dashboard.html se centraliza acá: duplas, comunas, formularios
// de KoBo y su parseo, colores de marca y el endpoint de cierres.
//
// Para sumar duplas nuevas (expansión a comunas 3, 5, 15 y resto de comuna 6):
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
  // Comunas sumadas con la expansión a 30 duplas (agosto 2026):
  'C.3':  'Balvanera',
  'C.5':  'Almagro/Boedo',
  'C.15': 'Chacarita/Villa Crespo',
};

const duplas = [
  { id:'01', zona:'Retiro',        poligono:'Polígono 01', comuna:'C.1',  kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1a2FJrvzxTjejMZycd4yX85kbU6v9lZo&usp=sharing' },
  { id:'02', zona:'Recoleta',      poligono:'Polígono 02', comuna:'C.2',  kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1sXihNejPqwBKYool5mpX4Pf-4lhBoh8&usp=sharing' },
  { id:'03', zona:'Recoleta',      poligono:'Polígono 03', comuna:'C.2',  kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1OJqz28eDr2_EjNBUCMUhlTaWOxbZr-c&usp=sharing' },
  { id:'04', zona:'Recoleta',      poligono:'Polígono 04', comuna:'C.2',  kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1ZuFmoze5nih1GbV8GZnRHRacS8bRMjA&usp=sharing' },
  { id:'05', zona:'Palermo',       poligono:'Polígono 05', comuna:'C.14', kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1nxOGoV9y06YwKQg2LzZlNSozTb8_CU8&usp=sharing' },
  { id:'06', zona:'Palermo',       poligono:'Polígono 06', comuna:'C.14', kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1q8BoHfgzOks30289L7yKSGWdT25G7Rw&usp=sharing' },
  { id:'07', zona:'Palermo',       poligono:'Polígono 07', comuna:'C.14', kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1om67m3Smp5GOPG__nApgxgevHO0ILZ4&usp=sharing' },
  { id:'08', zona:'Palermo',       poligono:'Polígono 08', comuna:'C.14', kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1GeNWSaCubKktLOKlSfESLjspFxchark&usp=sharing' },
  { id:'09', zona:'Colegiales',    poligono:'Polígono 09', comuna:'C.13', kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=134Xwm4lM6tqPOTqgoIroM52YJF8onhI&usp=sharing' },
  { id:'10', zona:'Belgrano',      poligono:'Polígono 10', comuna:'C.13', kobo:'https://ee.kobotoolbox.org/x/gaWzj9F4', mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1VF9579XAK0tVz2zh1YElGZmdWzlYpsM&usp=sharing' },
  { id:'11', zona:'Belgrano',      poligono:'Polígono 11', comuna:'C.13', kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1U5V1iNZUgm2OYWt5Y2ZYBddVIkHGvt8&usp=sharing' },
  { id:'12', zona:'Belgrano R',    poligono:'Polígono 12', comuna:'C.13', kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1NchByiiqydfmU5yIz3eb_UusG9FQXgg&usp=sharing' },
  { id:'13', zona:'Núñez',         poligono:'Polígono 13', comuna:'C.13', kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1mihs63JT7RzERJ8-fdflkDsUGdWdB_M&usp=sharing' },
  { id:'14', zona:'Nuñez',         poligono:'Polígono 14', comuna:'C.13', kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1nEbG0R4KElShILaJtFNaCZ0rlwqoMcQ&usp=sharing' },
  { id:'15', zona:'Saavedra',      poligono:'Polígono 15', comuna:'C.12', kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1gInJRL0HoScU6t8IkKHR6qnHQzhAagE&usp=sharing' },
  { id:'16', zona:'Saavedra',      poligono:'Polígono 16', comuna:'C.12', kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1kV8CwYixCNEuT3sxNmHHUqEyDNF5gfw&usp=sharing' },
  { id:'17', zona:'Villa Urquiza', poligono:'Polígono 17', comuna:'C.12', kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1FHllQyYYHent3QvNJvvg_5QTgu4zhV8&usp=sharing' },
  { id:'18', zona:'Villa Urquiza', poligono:'Polígono 18', comuna:'C.12', kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=10jjGAK6OXaWAIxdlJ3Hw5FBDVqLm8N0&usp=sharing' },
  { id:'19', zona:'Villa Urquiza', poligono:'Polígono 19', comuna:'C.12', kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1jr5_-GOEeANTI5SAT4RKeSSuL9huJw4&usp=sharing' },
  { id:'20', zona:'Caballito',     poligono:'Polígono 20', comuna:'C.6',  kobo:'https://ee.kobotoolbox.org/x/cI937u6G',  mymaps:'https://www.google.com/maps/d/u/2/edit?mid=1vF2VXSgQfMga2hRbNKogLmgVBuLIykE&usp=sharing' },

  // ── Expansión a 30 duplas (agosto 2026) ──────────────────────────────
  // TODO: falta el link de KoBo de cada una — puede que haga falta un
  // formulario "Flash 3" nuevo en KoBo Toolbox (todavía no confirmado
  // con Agustina). Mientras
  // kobo quede vacío, el dashboard no va a poder cruzar las cargas de
  // estas duplas contra KoBo, pero el resto (portal, cierre, mapa) ya
  // funciona igual.
  { id:'21', zona:'Microcentro + Macrocentro', poligono:'Polígono 21', comuna:'C.1',  kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=1BTx5bqg-jN3Iig-SQ28M7z5snsexxnI' },
  { id:'22', zona:'Caballito Sur',             poligono:'Polígono 22', comuna:'C.6',  kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=1AZQuRGvfPVXkQHHxOIaJfCA662UTGwQ' },
  { id:'23', zona:'Caballito Norte',           poligono:'Polígono 23', comuna:'C.6',  kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=1vNPwuSGyvU3SIVpxqIlNnM-p0sjpJjE' },
  { id:'24', zona:'Almagro Norte',             poligono:'Polígono 24', comuna:'C.5',  kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=1WNAFbuZeAwgHxTwFSKMYocXAwZfW6qA' },
  { id:'25', zona:'Almagro Sur',               poligono:'Polígono 25', comuna:'C.5',  kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=1PTdr8m1Q1aW5kZJokxzfEREIMhghAkM' },
  { id:'26', zona:'Villa Crespo',              poligono:'Polígono 26', comuna:'C.15', kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=1Y5-QKnPRqLvVQlqOHjeHbJP6OMGlKJk' },
  { id:'27', zona:'Once',                      poligono:'Polígono 27', comuna:'C.3',  kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=1vpaKauq8MKfhQ7j5MNJFqpQgrNUT4mU' },
  { id:'28', zona:'Chacarita',                 poligono:'Polígono 28', comuna:'C.15', kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=16zz_Ns9avN3ni92oTIcEu2dF2xveFDg' },
  { id:'29', zona:'Agronomía',                 poligono:'Polígono 29', comuna:'C.15', kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=1T4noPhcGo8Be-84jQEb14iMY-ij8kFk' },
  { id:'30', zona:'Boedo',                     poligono:'Polígono 30', comuna:'C.5',  kobo:'', mymaps:'https://www.google.com/maps/d/viewer?mid=13nTcHf5x79TlEsq85YYu393URmJ4MyQ' },
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

// Flash 2 = duplas 01–10
function parseFlash2(row){
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
  return { personas, situacion:'—', hora: start? new Date(start).getHours(): null, fecha:start, dupla: extractDupla(row), formulario:'Flash 2' };
}

// Flash 1 = duplas 11–20
function parseFlash1(row){
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
  return { personas, situacion: sit, hora: start? new Date(start).getHours(): null, fecha:start, dupla: extractDupla(row), formulario:'Flash 1' };
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
    forms: [
      { id:'aPou2eJThDtn45mdmfrbaA', nombre:'Flash 2 (duplas 01–10)', parseRow: parseFlash2 },
      { id:'aH2SygyBTRCkqCgBtu4m3R', nombre:'Flash 1 (duplas 11–20)', parseRow: parseFlash1 },
    ],
  },
};

window.PROJECT_CONFIG = window.PROJECT_CONFIG_CENSO_FLASH;

})();
