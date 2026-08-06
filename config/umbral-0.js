// Config del proyecto "Umbral 0" — TODAVÍA EN CONFIGURACIÓN.
// Mismo esquema que config/censo-flash.js. Completar cuando estén definidos:
//   1) las duplas/equipos y su comuna,
//   2) el link de WhatsApp de la operadora y el horario del operativo,
//   3) la URL del Apps Script de cierres (Sheet + Drive) ya desplegado,
//   4) el/los formulario(s) de KoBo: id del asset + una función parseRow()
//      que sepa leer las columnas específicas de ESE formulario (copiar el
//      patrón de parseFlash1/parseFlash2 en config/censo-flash.js).
// Hasta completar esto, el proyecto aparece en la plataforma pero con el
// portal de duplas vacío y el dashboard mostrando "sin datos".
(function(){

window.PROJECT_CONFIG_UMBRAL_0 = {
  id: 'umbral-0',
  nombre: 'Umbral 0',
  emoji: '🌒',
  descripcion: 'Relevamiento territorial nocturno — Umbral 0. Proyecto en configuración.',
  badge: 'En configuración',
  colorNavy:'#0f1f3d', colorBlue:'#7c3aed', colorGreen:'#10b981', colorAmber:'#f59e0b', colorRed:'#ef4444',
  whatsappNumero: '', // TODO: número de la operadora, formato "+54 9 11 ...."
  whatsappLink: '',   // TODO: link https://wa.me/...
  horario: { dias:'A definir', franja:'A definir' },
  appsScriptUrl: '', // TODO: URL del Apps Script /exec de Umbral 0
  comunas: {
    // TODO: 'C.X': 'Nombre de la comuna'
  },
  duplas: [
    // TODO: { id:'01', zona:'...', poligono:'Polígono 01', comuna:'C.X',
    //         kobo:'https://ee.kobotoolbox.org/x/...', mymaps:'https://...' }
  ],
  kobo: {
    token: '', // TODO: token de KoBo Toolbox
    base: 'https://kf.kobotoolbox.org/api/v2/assets',
    forms: [
      // TODO: { id:'<asset id>', nombre:'<nombre del formulario>', parseRow: function(row){ ... } }
    ],
  },
};

})();
