// Config del proyecto "Umbral 0" — TODAVÍA EN CONFIGURACIÓN.
// A diferencia de Censo Flash (Google Sheets/Apps Script, un cierre por noche),
// Umbral 0 gestiona casos con estado que cambia en el tiempo (ingreso →
// acompañamiento → egreso/derivación), así que vive en Supabase:
//   - duplas/integrantes/choferes: tablas `duplas` e `integrantes` — se dan de
//     alta y se editan desde umbral-0/admin-duplas.html, NO acá en el config
//     (dejaron de ser un array hardcodeado a propósito, para que sean editables
//     sin tocar código).
//   - casos: tablas `personas`, `intervenciones`, `derivaciones`, `seguimientos`.
//   - acceso: cuentas reales de Supabase Auth (no contraseña compartida como
//     Censo Flash) + rol en la tabla `perfiles` (admin/coordinacion/dupla/cliente),
//     validado por políticas RLS en cada tabla. Ver umbral-0/DISENO-CASOS.md.
//
// Completar todavía:
//   1) el link de WhatsApp de la operadora y el horario del operativo,
//   2) el/los formulario(s) de KoBo, si Umbral 0 los termina usando además de
//      lo que se carga directo en Supabase.
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

  // Herramienta externa donde los operadores generan las "cartas de soflex"
  // (no se replica el formulario acá, solo se linkea). Ver DISENO-CASOS.md §4.
  cartasSoflexLink: '', // TODO: URL de la herramienta externa

  // Formulario de KoBo — de carácter OBLIGATORIO (así lo define GOPA en el
  // documento de rendición semanal): cada dupla lo completa cada vez que
  // contacta a una persona en el recorrido, sea o no la primera vez. Es el
  // registro crudo por intervención — independiente de la ficha de persona
  // en Casos, que es el seguimiento interno del equipo.
  koboFormLink: 'https://ee.kobotoolbox.org/x/2agnZwzr',

  // ── SUPABASE — proyecto dedicado (cuenta a.jait@inclusioncaii.org) ────────
  // La anon/publishable key es pública por diseño (se embebe en el cliente);
  // todo el acceso real lo controlan las políticas RLS de cada tabla, atadas
  // al rol de `perfiles` de la cuenta logueada. Nunca poner acá la service_role key.
  supabaseUrl: 'https://qwnrdclaeaskoyskbqff.supabase.co',
  supabaseAnonKey: 'sb_publishable_3fsj-u1CkxDhHTRgsI6Mjw_VyBcyP8t',

  appsScriptUrl: '', // sin uso por ahora — Umbral 0 vive en Supabase (ver arriba)
  // TODO: contraseña de acceso al dashboard para el cliente de Umbral 0
  // (un área de GCBA distinta a la de Censo Flash — no reusar la misma
  // contraseña). Mientras esté vacía, nadie puede loguearse a este
  // proyecto como cliente (sí lo ve el admin, que ve todos los proyectos).
  clientPassword: '',
  comunas: {
    // TODO: 'C.X': 'Nombre de la comuna'
  },

  // ── OPCIONES CUSTOMIZABLES DEL CICLO DE UN CASO ────────────────────────
  // Todas estas listas son editables acá sin tocar el resto del código —
  // agregar o sacar opciones es solo agregar/sacar strings.

  // Zonas prioritarias del operativo (documento 27/07/2026). Se usa como
  // desplegable en "Ubicación" de la ficha de persona, junto al punto de
  // contacto (dirección/referencia libre) y la comuna.
  zonasOpciones: ['C1A', 'C2', 'C14', 'C13', 'Zona frontera'],

  // Nivel de criticidad del caso (ingreso). Sin escala definitiva todavía —
  // ajustar cuando la tengan (ej. cambiar a números 1-5, agregar niveles, etc.)
  criticidadOpciones: ['Baja', 'Media', 'Alta'],

  // Tipo de derivación (egreso del caso). Lista abierta — se va completando
  // con los programas de gobierno reales a medida que se definen. Fuente:
  // documento "UMBRAL_0_1" (27/07/2026), circuitos y procedimientos.
  derivacionOpciones: [
    'DIPA',
    'Micro',
    'Hacer DNI',
    'Médico',
    'Centro de día',
    'CIS',
    'Casa Vincular', // solo habilitado para seguimientos — ver DISENO-CASOS.md §5.2
    'ASA (ex Centro de Admisión, Evaluación y Derivación)', // ídem, mismo informe social que Casa Vincular
    'Salud Mental', // incluye el protocolo de SAME/Brigada CER cuando surge DEL propio operativo de salud mental
    'SAME', // llamado directo a emergencia médica (107), independiente de Salud Mental
    'Brigada CER', // evaluación sanitaria de campo, independiente de Salud Mental
    'Mapa de Familias en Riesgo',
    'Policía de la Ciudad',
    'Programa Ciudadanía Porteña',
    'Sedes de Atención Social',
    'Derecho a la Identidad',
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
