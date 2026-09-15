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

// ── FORMULARIO KOBO ("GOPA") ──────────────────────────────────────────
// Un solo asset de KoBo compartido por varios equipos de GOPA (no solo
// Umbral 0, también "Salud Mental" y otros) — se filtra por
// `identificacion/equipo === 'umbral_0'`. Tiene ~270 preguntas con lógica
// condicional (cambia según el tipo de intervención: Primer Acercamiento
// / Primer Acercamiento con derivación de la RED / Seguimiento /
// Recontacto). Se mapea la identidad básica + la mayoría de lo que se usa
// para precargar el alta de un caso en casos.html (ver
// confirmarKoboPendiente()) — no las 270 preguntas completas (queda la
// evaluación semiológica/clínica detallada, los "términos de
// intervención" de cierre de jornada, y las preguntas de derivación
// puntual, que están en `_raw` por si hacen falta más adelante). Nombres
// de campo confirmados sept/2026 contra tres fuentes: un export en
// formato "Labels" (preguntas en español), un export en formato
// "XML values" (nombres técnicos + valores reales de ejemplo, así se
// supo que las Sí/No usan 'si'/'no' en minúscula) y una muestra de la
// API en vivo en JSON — si KoBo cambia el formulario, hay que revalidar
// esto contra un envío nuevo.
//
// `campo()` busca la primera clave que EXISTA (no vacía) entre varias
// alternativas — la misma pregunta puede vivir bajo grupos distintos
// según qué rama del formulario se haya disparado.
function campo(row, claves){
  for(const k of claves){
    const v = row[k];
    if(v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

// Como `campo()`, pero matchea por el nombre CORTO de la pregunta (sin el
// grupo que la contiene) en vez de una clave exacta. Hace falta para los
// campos de identidad: viven repetidos bajo dos ramas del formulario con
// nombres de grupo que no confirmamos contra la API en vivo (a diferencia
// de identificacion/operador_nombre y identificacion/tipo_intervencion,
// que sí vienen de una muestra real) — pero SÍ confirmamos el nombre corto
// de cada pregunta contra un export en formato "XML values" (sept/2026),
// y KoBo arma la clave de la API siempre como "grupo/.../nombre_corto",
// así que alcanza con matchear el final de la clave.
function campoSufijo(row, sufijo){
  for(const k in row){
    if(k === sufijo || k.endsWith('/' + sufijo)){
      const v = row[k];
      if(v !== undefined && v !== null && v !== '') return v;
    }
  }
  return null;
}

// Preguntas Sí/No — confirmado contra datos reales (sept/2026) que KoBo
// guarda el valor como 'si'/'no' en minúscula, no como boolean nativo.
function campoSufijoBool(row, sufijo){
  const v = campoSufijo(row, sufijo);
  if(v === 'si') return true;
  if(v === 'no') return false;
  return null; // no contestada — NO es lo mismo que "no" (ver dónde se usa)
}

// select_multiple: KoBo devuelve las opciones elegidas como un solo
// string separado por espacios (ej. "pareja hijos padre"), con el
// nombre interno de cada opción — que en este formulario ya es legible
// en español (confirmado contra datos reales), solo hace falta
// reemplazar guiones bajos por espacios y capitalizar.
function legible(s){
  s = String(s||'').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function opcionesMultiples(row, sufijo){
  const v = campoSufijo(row, sufijo);
  if(!v) return [];
  return String(v).split(/\s+/).filter(Boolean).map(legible);
}

function parseUmbral0(row){
  if(row['identificacion/equipo'] !== 'umbral_0') return null; // este asset lo comparten otros equipos de GOPA

  const fecha = row['_submission_time'] || row['start'] || row['today'] || null;
  // `_geolocation` ya viene parseado por KoBo como [lat, lng] — más
  // confiable que parsear a mano el string crudo de "georreferenciacion".
  const geo = Array.isArray(row['_geolocation']) ? row['_geolocation'] : null;

  // La identidad de la persona vive en DOS bloques distintos según la
  // rama del formulario que se haya disparado (confirmado contra un
  // export real, sept/2026) — cada envío completa solo UNA de las dos,
  // así que no hay ambigüedad en cuál de las dos alternativas usar:
  //  - "Primer Acercamiento": preguntas nivel1_fecha_nacimiento/
  //    nivel1_edad_aproximada/nivel1_nacionalidad/persona_nombre/
  //    persona_apellido/documento_numero — trae fecha de nacimiento real.
  //  - "Seguimiento": preguntas nombre_segui/apellido_segui/alias_segui/
  //    dni_segui — solo re-confirma la identidad de una persona ya
  //    conocida, no vuelve a pedir fecha de nacimiento (por eso acá NO
  //    hay un equivalente a nivel1_fecha_nacimiento para esta rama).
  // Antes de esto el parser solo leía la rama de Primer Acercamiento —
  // un envío de Seguimiento quedaba sin nombre/DNI reconocidos.
  return {
    operador: campo(row, ['identificacion/operador_nombre']),
    tipo: campo(row, ['identificacion/tipo_intervencion']),
    fecha,
    hora: fecha ? new Date(fecha).getHours() : null,
    lat: geo ? geo[0] : null,
    lng: geo ? geo[1] : null,
    persona: {
      nombre: campoSufijo(row, 'persona_nombre') || campoSufijo(row, 'nombre_segui'),
      apellido: campoSufijo(row, 'persona_apellido') || campoSufijo(row, 'apellido_segui'),
      // `documento_numero` no siempre es DNI — el formulario tiene un
      // selector de tipo de documento separado (confirmado contra datos
      // reales: 'tipo_doc' puede no ser 'dni', ej. pasaporte). Solo se
      // toma como DNI cuando el tipo elegido efectivamente es DNI, para
      // no matchear "casos ya cargados" contra un número que en realidad
      // es de otro documento.
      dni: (campoSufijo(row, 'tipo_doc') === 'dni' ? campoSufijo(row, 'documento_numero') : null) || campoSufijo(row, 'dni_segui'),
      alias: campoSufijo(row, 'nombre_autopercibido_alias') || campoSufijo(row, 'nivel1_alias') || campoSufijo(row, 'alias_segui'),
      edad: campoSufijo(row, 'nivel1_edad_aproximada'),
      // Fecha de nacimiento REAL (no aproximada) — solo existe cuando se
      // disparó la rama de Primer Acercamiento. No se inventa a partir de
      // la edad aproximada: si no está, queda null y se carga a mano.
      fechaNacimiento: campoSufijo(row, 'nivel1_fecha_nacimiento'),
      nacionalidad: campoSufijo(row, 'nivel1_nacionalidad'),
      generoAutopercibido: campoSufijo(row, 'genero_autopercibido'),
      generoDni: campoSufijo(row, 'genero_dni'),

      // ── Resto de los datos que releva el formulario (sept/2026) — se
      // usan para precargar más campos del alta en casos.html además de
      // la identidad básica (ver confirmarKoboPendiente() en casos.html).
      // Solo lo que el formulario pregunta directo — nada se infiere ni
      // se calcula acá, eso queda para quien arma el texto final a partir
      // de estos datos.
      estadoSalud: campoSufijo(row, 'salud_estado'),
      observacionPersona: campoSufijo(row, 'observacion_persona'),
      caracteristicas: campoSufijo(row, 'nivel1_caracteristicas'), // descripción física — útil antes de tener foto
      aceptaEntrevistaProlongada: campoSufijoBool(row, 'acepta_entrevista_prolongada'),
      identificoConsumosProblematicos: campoSufijoBool(row, 'identifico_consumos_problematicos'),
      consumosCuales: campoSufijo(row, 'consumos_cuales'),
      motivoCalle: opcionesMultiples(row, 'motivo_calle'),
      infoCualitativaMotivos: campoSufijo(row, 'info_cualitativa_motivos'),
      estrategiasAbordaje: campoSufijo(row, 'estrategias_abordaje'),
      notaDevolucion: campoSufijo(row, 'nota_devolucion'),

      // Situación habitacional
      lugarHabitual: legible(campoSufijo(row, 'lugar_habitual')) || campoSufijo(row, 'otro_lugar'),
      tiempoEnCalle: legible(campoSufijo(row, 'tiempo_en_calle')),
      lugarViviendaPrevia: legible(campoSufijo(row, 'lugar_vivienda_previa')),
      tenenciaViviendaPrevia: legible(campoSufijo(row, 'tenencia_vivienda_previa')),
      conQuienVivias: opcionesMultiples(row, 'con_quien_vivias'),

      // Situación económica
      actividad: campoSufijoBool(row, 'actividad'),
      tipoActividad: legible(campoSufijo(row, 'tipo_act')),
      prestaciones: opcionesMultiples(row, 'prestaciones'),
      notaIngresosMonetarios: campoSufijo(row, 'nota_ingresos_monetarios'),

      // Situación educativa
      asisteEducativo: legible(campoSufijo(row, 'asiste_educativo')),
      maxNivelEducativo: legible(campoSufijo(row, 'max_nivel_educativo')),

      // Redes de contención
      vinculos: legible(campoSufijo(row, 'vinculos')), // select (ej. "solo"), NO es Sí/No — confirmado contra datos reales
      tipoVinculos: opcionesMultiples(row, 'tipo_vinculos'),
      asisteInstitucionComunitaria: campoSufijoBool(row, 'asiste_institucion_comunitaria'),
      institucionComunitariaCual: campoSufijo(row, 'institucion_comunitaria_cual'),
      notaRelacionesVinculos: campoSufijo(row, 'nota_relaciones_vinculos'),

      // Situación sanitaria
      embarazo: campoSufijoBool(row, 'embarazo'),
      seAtiendeHospital: campoSufijoBool(row, 'se_atiende_hospital'),
      seAtiendeHospitalCual: campoSufijo(row, 'se_atiende_hospital_cual'),
      discapacidad: campoSufijoBool(row, 'discapacidad'),
      discapacidadCual: campoSufijo(row, 'discapacidad_cual'),
      dificultadPara: opcionesMultiples(row, 'dificultad_para'),
    },
    nivelContinuaSeguimiento: campo(row, ['cierre/nivel_continua_seguimiento']),
    // Fila cruda completa, por si hace falta leer algún campo puntual más
    // adelante (ej. los indicadores de vínculo del Nivel 2, o el detalle
    // de la entrevista completa) sin tener que reescribir el parser.
    _raw: row,
  };
}

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

  // ── AVISOS RÁPIDOS A COORDINACIÓN (sept/2026) ──────────────────────────
  // Botón "🚨 Avisar a coordinación" en la ficha de casos.html — situaciones
  // que necesitan un aviso inmediato por WhatsApp, no esperar al reporte
  // semanal. NO es lo mismo que `whatsappNumero`/`whatsappLink` de arriba
  // (ese es el contacto de "la operadora" para quien todavía no es un
  // caso, en index.html) — esto es interno, para la dupla en territorio.
  contactosUrgentes: {
    // Fijo, no cambia por turno. Uso: contactos espontáneos (sin
    // seguimiento previo) que piden ingreso a CIS ahí mismo.
    handyRojo: {
      numero: '+5491134253902',
      motivo: 'CIS espontáneo',
      descripcion: 'Contactos espontáneos que solicitan ingreso a CIS — coordinación de la organización.',
    },
    // La coordinación de Umbral Cero rota por turno, así que el número
    // cambia según la hora — ver coordinadorUmbral0Ahora() en casos.html.
    // TODO: completar los turnos que falten (Agustina los va pasando).
    // `desde`/`hasta` en hora local (0-23), turno que empieza en `desde`
    // y termina (sin incluir) `hasta`.
    coordUmbral0Turnos: [
      { desde: 6, hasta: 14, numero: '+5491160542484' },
      // TODO: falta el/los turno/s de 14 a 6 del día siguiente.
    ],
  },

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

  // Zonas del operativo — mismas 13 zonas asignadas a las duplas A-M
  // (Umbral0_Plan_Final.docx, cargadas en la tabla `duplas`), para que al
  // cargar una persona se elija la zona real donde se la encontró en vez
  // de escribirla a mano. Se usa como desplegable en "Ubicación" de la
  // ficha, junto al punto de contacto (dirección/referencia libre).
  // OJO: si se reasignan zonas a las duplas en admin-duplas.html, hay que
  // actualizar esta lista a mano — no se lee en vivo desde `duplas` para
  // no depender de Supabase en cada carga de este config.
  zonasOpciones: [
    'Once-Balvanera · F3a',
    'Once-Balvanera · F3b',
    'Retiro - San Telmo · Sector 1',
    'Retiro - San Telmo · Sector 2',
    'Retiro - San Telmo · Sector 3',
    'Chacarita · Sector 1',
    'Chacarita · Sector 2',
    'Almagro - Boedo',
    'Iglesias mañana',
    'Iglesias mediodía',
    'Iglesias tarde',
    'Iglesias noche 1',
    'Iglesias noche 2',
  ],

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

  // Misma cuenta de KoBo que Censo Flash (agustinajait@gmail.com) — por eso
  // el token es igual, no es un error de copiar/pegar.
  kobo: {
    token: '685fc2e5a79995c816b2652530a9fc520387a630',
    base: 'https://kf.kobotoolbox.org/api/v2/assets',
    // Asset id del formulario "GOPA" (uno solo, a diferencia de Censo
    // Flash que tiene Norte/Centro/Sur) — compartido con otros equipos,
    // ver parseUmbral0() arriba.
    forms: [
      { id:'ap8VHRKKybWZ9bh7UYEd3w', nombre:'Umbral 0 (GOPA)', parseRow: parseUmbral0 },
    ],
  },
};

})();
