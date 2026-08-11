// Config del proyecto "Umbral 0" — TODAVÍA EN CONFIGURACIÓN.
// Mismo esquema que config/censo-flash.js, más los campos propios de Umbral 0
// (gestión de casos: ingreso → acompañamiento → egreso/derivación).
//
// Completar cuando estén definidos:
//   1) las 16 duplas (zona/polígono + los 2 integrantes de cada una) y los
//      2 choferes — ver `duplas` y `choferes` más abajo.
//   2) el link de WhatsApp de la operadora y el horario del operativo,
//   3) la URL del Apps Script de cierres (Sheet + Drive) ya desplegado —
//      o, si Umbral 0 termina viviendo en Supabase (recomendado, dado que
//      necesita casos con estado que cambia en el tiempo, no solo un
//      cierre por noche), la conexión a esa base en su lugar.
//   4) el/los formulario(s) de KoBo, si Umbral 0 los termina usando para
//      el ingreso de casos.
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
  appsScriptUrl: '', // TODO: URL del Apps Script /exec de Umbral 0 (o reemplazar por Supabase)
  // TODO: contraseña de acceso al dashboard para el cliente de Umbral 0
  // (un área de GCBA distinta a la de Censo Flash — no reusar la misma
  // contraseña). Mientras esté vacía, nadie puede loguearse a este
  // proyecto como cliente (sí lo ve el admin, que ve todos los proyectos).
  clientPassword: '',
  comunas: {
    // TODO: 'C.X': 'Nombre de la comuna'
  },

  // ── DUPLAS (16) — equipo territorial + zona asignada ──────────────────
  // Cada dupla tiene 2 integrantes con sus datos personales (para el alta
  // administrativa) además de zona/polígono (para el portal de campo, una
  // vez que Umbral 0 tenga su propio flujo de recorrido como Censo Flash).
  // TODO: cargar las 16 duplas reales, formato:
  // { id:'U01', zona:'...', poligono:'...', comuna:'C.X',
  //   miembros: [
  //     { nombre:'', apellido:'', dni:'', telefono:'' },
  //     { nombre:'', apellido:'', dni:'', telefono:'' },
  //   ] }
  duplas: [
  ],

  // ── CHOFERES (2) — sin zona fija, rotan entre duplas ───────────────────
  // TODO: cargar los 2 choferes reales, formato:
  // { nombre:'', apellido:'', dni:'', telefono:'' }
  choferes: [
  ],

  // ── OPCIONES CUSTOMIZABLES DEL CICLO DE UN CASO ────────────────────────
  // Ambas listas son editables acá sin tocar el resto del código — agregar
  // o sacar opciones es solo agregar/sacar strings.

  // Nivel de criticidad del caso (ingreso). Sin escala definitiva todavía —
  // ajustar cuando la tengan (ej. cambiar a números 1-5, agregar niveles, etc.)
  criticidadOpciones: ['Baja', 'Media', 'Alta'],

  // Tipo de derivación (egreso del caso). Lista abierta — se va completando
  // con los programas de gobierno reales a medida que se definen.
  derivacionOpciones: [
    'DIPA',
    'Micro',
    'Hacer DNI',
    'Médico',
    'Centro de día',
    'CIS',
    // TODO: sumar más opciones de derivación acá
  ],

  kobo: {
    token: '', // TODO: token de KoBo Toolbox (si Umbral 0 lo termina usando)
    base: 'https://kf.kobotoolbox.org/api/v2/assets',
    forms: [
      // TODO: { id:'<asset id>', nombre:'<nombre del formulario>', parseRow: function(row){ ... } }
    ],
  },
};

})();
