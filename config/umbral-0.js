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
// Como opcionesMultiples(), pero sin pasar por legible() — para cuando
// hace falta el código interno tal cual (ej. mapearlo contra un
// diccionario de etiquetas propio, más prolijo que la conversión
// genérica de guiones bajos a espacios).
function opcionesCrudas(row, sufijo){
  const v = campoSufijo(row, sufijo);
  return v ? String(v).split(/\s+/).filter(Boolean) : [];
}

// Qué pasó al final de la intervención — pregunta select_multiple
// "termino_intervencion_diaria" de KoBo. Es la única fuente confiable de
// derivaciones/llamados de emergencia reales: `derivaciones` en Supabase
// depende de que la dupla use "Pedir derivación" en casos.html, que en
// la práctica no se está usando (confirmado sept/2026 — la tabla está
// vacía) — lo que pasa en el momento (llamado a SAME, contacto con
// policía/911, derivación a CIS/RED/Casa Vincular) se resuelve por
// teléfono/WhatsApp y solo queda registrado acá, porque KoBo es
// obligatorio. Etiquetas propias (no legible() genérico) para que se
// lean bien en el reporte semanal.
const TERMINO_INTERVENCION_LABELS = {
  entrevista_persona: 'Entrevista con la persona',
  derivacion_ciudadania_portena: 'Derivación a Ciudadanía Porteña',
  acompanamiento_afeccion_fisica: 'Acompañamiento por afección física',
  llamado_same_emergencia_medica: 'Llamado a SAME (emergencia médica)',
  llamado_same_emergencia_sm: 'Llamado a SAME (emergencia de salud mental)',
  traslado_efector_neuropsiquiatrico: 'Traslado a efector neuropsiquiátrico',
  derivacion_adicciones_ambulatoria: 'Derivación a adicciones (ambulatoria)',
  acompanamiento_cesac: 'Acompañamiento a CeSAC',
  traslado_centro_barrial: 'Traslado a centro barrial',
  traslado_dipa: 'Traslado a DIPA',
  derivacion_red: 'Derivación a la RED',
  derivacion_apoyo_familias: 'Derivación a apoyo a familias',
  hospital: 'Traslado/derivación a hospital',
  derivacion_internacion_asa: 'Derivación a internación (ASA)',
  derivacion_casa_vincular: 'Derivación a Casa Vincular',
  policia: 'Contacto con Policía / 911',
  otro: 'Otro',
};

// Qué hizo el operador con el caso, confirmado ACÁ en la plataforma (no
// en KoBo) — pedido de Agustina (sept/2026): "yo no manejo el kobo,
// manejo esta plataforma... el que hizo debe verse en el legajo". Es la
// versión NATIVA de TERMINO_INTERVENCION_LABELS de arriba — mismas
// categorías donde tiene sentido, más CIS y teléfono rojo (que KoBo no
// tiene como opción). Vive en `intervenciones.acciones` y
// `kobo_validaciones.acciones`, no depende de que KoBo pregunte bien.
// Única fuente: casos.html arma el checklist de "¿Qué hiciste con este
// caso?" a partir de esta lista, y admin-duplas.html/reporte-publico.html
// la usan para mostrar los conteos agregados del reporte semanal — ver
// calcularAccionesPlataforma() en admin-duplas.html.
const ACCIONES_INTERVENCION = [
  { key:'entrevista', label:'Entrevista con la persona' },
  { key:'rechazo_entrevista', label:'Se acercó, pero no aceptó hablar / se negó a la entrevista' },
  { key:'llamado_same_medica', label:'Llamado a SAME (emergencia médica)' },
  { key:'llamado_same_salud_mental', label:'Llamado a SAME (emergencia de salud mental)' },
  { key:'telefono_rojo', label:'Llamado al teléfono rojo' },
  { key:'policia', label:'Contacto con Policía / 911' },
  { key:'derivacion_cis', label:'Derivación a CIS' },
  // Demanda espontánea (21/9/2026, pedido de Agustina: "para casos que
  // cargan en KoBo, demanda espontánea son los casos de personas que en
  // el primer contacto quieren ir a un CIS") — distinta de "Derivación a
  // CIS" a secas: ese caso puede venir de un seguimiento; esta es
  // específicamente cuando la persona lo pide YA, en el primer contacto.
  // KoBo no tiene una pregunta propia para esto (mismo caso que CIS y
  // teléfono rojo, ver comentario de arriba), así que queda sin
  // pre-tildar en KOBO_TERMINO_A_ACCION — la dupla la tilda a mano.
  { key:'demanda_espontanea_cis', label:'Demanda espontánea — pidió ir a un CIS en el primer contacto' },
  { key:'derivacion_casa_vincular', label:'Derivación a Casa Vincular' },
  { key:'derivacion_red', label:'Derivación a la RED' },
  { key:'derivacion_ciudadania_portena', label:'Derivación a Ciudadanía Porteña' },
  { key:'hospital', label:'Traslado/derivación a hospital' },
  { key:'acompanamiento_salud', label:'Acompañamiento por afección física / CeSAC' },
  { key:'vuelve_manana', label:'Se acordó volver a verla' },
  { key:'otro', label:'Otro (detallar abajo)' },
];
const ACCIONES_INTERVENCION_LABELS = Object.fromEntries(ACCIONES_INTERVENCION.map(a => [a.key, a.label]));

// `intervenciones.tipo` — clasificación amplia de CUALQUIER intervención
// (¿fue un primer contacto o una visita de seguimiento sobre un caso ya
// conocido?), no tiene nada que ver con CIS. Reportado como confuso
// (21/9/2026, Agustina viendo el resumen diario): el valor crudo
// "contacto_espontaneo" se mostraba tal cual, y como "demanda espontánea"
// significa algo puntual y distinto en la jerga del equipo (ver
// ACCIONES_INTERVENCION.demanda_espontanea_cis arriba: alguien que en el
// primer contacto pide ir a un CIS), leerlo ahí daba a entender —
// incorrectamente— que esos casos "no son nuestra población". Se
// renombra la ETIQUETA a "Primer contacto" para sacar la ambigüedad; el
// valor guardado en la base (`contacto_espontaneo`) no cambia, sería una
// migración de datos históricos innecesaria para lo que es un problema
// de redacción, no de modelo.
const TIPO_INTERVENCION_LABELS = {
  contacto_espontaneo: 'Primer contacto',
  seguimiento: 'Seguimiento en territorio',
};

// Puente KoBo → plataforma (sept/2026, pedido de Agustina): al validar un
// envío, la casilla "¿Qué hiciste con este caso?" arrancaba siempre en
// blanco aunque KoBo ya había preguntado algo muy parecido
// (termino_intervencion_diaria) — la dupla terminaba re-tildando lo mismo
// dos veces. Este mapeo pre-tilda solo los casos donde el código de KoBo
// tiene un equivalente directo y sin ambigüedad en ACCIONES_INTERVENCION
// (ver abrirModalValidarKobo() en casos.html); los que no tienen
// equivalente claro (ej. traslado_dipa, derivacion_internacion_asa)
// quedan sin pre-tildar a propósito, para no inventar una equivalencia
// dudosa — la dupla los agrega a mano si corresponde.
const KOBO_TERMINO_A_ACCION = {
  entrevista_persona: 'entrevista',
  derivacion_ciudadania_portena: 'derivacion_ciudadania_portena',
  acompanamiento_afeccion_fisica: 'acompanamiento_salud',
  acompanamiento_cesac: 'acompanamiento_salud',
  llamado_same_emergencia_medica: 'llamado_same_medica',
  llamado_same_emergencia_sm: 'llamado_same_salud_mental',
  derivacion_red: 'derivacion_red',
  hospital: 'hospital',
  derivacion_casa_vincular: 'derivacion_casa_vincular',
  policia: 'policia',
  otro: 'otro',
};

// Puente checklist → "Pedir derivación" (sept/2026, pedido de Agustina:
// "a veces hay que hacer una instancia más después de KoBo que es pedir
// la derivación a un CIS o llamar a SAME, y eso hay que registrarlo").
// Cuando la dupla tilda una de estas acciones al validar, casos.html le
// sugiere completar el formulario formal de "Pedir derivación" con el
// tipo ya preseleccionado — porque ESE es el feature que tiene los
// campos obligatorios por tipo (ej. foto de DNI para CIS) y el que
// alimenta el reporte semanal (secciones d./f., ver DISENO-CASOS.md
// §10.1.11). Solo se mapean los tipos que existen tal cual en
// derivacionOpciones (arriba) — evita registrar "que hizo algo" sin
// completar los datos que ese tipo de derivación necesita de verdad.
const ACCION_A_TIPO_DERIVACION = {
  derivacion_cis: 'CIS',
  demanda_espontanea_cis: 'CIS',
  derivacion_casa_vincular: 'Casa Vincular',
  derivacion_ciudadania_portena: 'Programa Ciudadanía Porteña',
  llamado_same_medica: 'SAME',
  llamado_same_salud_mental: 'Salud Mental',
  policia: 'Policía de la Ciudad',
};

// "¿Dónde naciste?" / "¿Dónde vivías antes de estar en calle por primera
// vez?" — mismas opciones geográficas en las dos preguntas (confirmado
// contra un export real en formato "XML values", sept/2026: los valores
// guardados son 'caba'/'pba'/'otra_provincia'/'otro_pais'/'nsnc').
// legible() genérico las deja como "Caba"/"Pba"/"Nsnc" — etiquetas
// propias para que se lean bien en el reporte, mismo criterio que
// TERMINO_INTERVENCION_LABELS.
const LUGAR_GEOGRAFICO_LABELS = {
  caba: 'CABA',
  pba: 'Provincia de Buenos Aires',
  otra_provincia: 'Otra provincia',
  otro_pais: 'Otro país',
  nsnc: 'No sabe / no contesta',
};
function legibleLugar(codigo){
  if(!codigo) return codigo;
  return LUGAR_GEOGRAFICO_LABELS[codigo] || legible(codigo);
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
    // "¿Es población objetivo?" — solo se pregunta en "Primer
    // Acercamiento". 'no' (no es población objetivo) y 'no_es' ("No se
    // encontró a nadie") dejan TODO el bloque de identidad vacío a
    // propósito: no hay ninguna persona que identificar. Confirmado
    // 24/9/2026 contra un export real: de los envíos de "Primer
    // Acercamiento", ~40% son 'no'/'no_es' — sin este campo, la app los
    // mostraba igual como "envíos sin nombre ni DNI, sin caso cargado",
    // haciendo parecer que se perdían nombres que en realidad nunca
    // existieron (no hubo persona con quien hablar).
    poblacionObjetivo: campoSufijo(row, 'poblacion_objetivo'),
    fecha,
    hora: fecha ? new Date(fecha).getHours() : null,
    lat: geo ? geo[0] : null,
    lng: geo ? geo[1] : null,
    // Qué pasó al final (derivaciones/llamados de emergencia realmente
    // hechos en el territorio) — ver TERMINO_INTERVENCION_LABELS arriba.
    terminoIntervencionDiaria: opcionesCrudas(row, 'termino_intervencion_diaria'),
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
      // "De dónde proviene" que pedía GOPA (sept/2026) — dos preguntas
      // distintas del formulario, mismas opciones geográficas: dónde
      // nació (lugarNacimiento, no se cargaba todavía) y de dónde vino
      // justo antes de la calle (lugarViviendaPrevia, ya se cargaba,
      // pero con legible() genérico en vez de LUGAR_GEOGRAFICO_LABELS).
      lugarNacimiento: legibleLugar(campoSufijo(row, 'lugar_nacimiento')),
      lugarViviendaPrevia: legibleLugar(campoSufijo(row, 'lugar_vivienda_previa')),
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
  descripcion: 'Relevamiento territorial nocturno — Umbral 0.',
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
      { desde: 14, hasta: 22, numero: '+5491160542484' },
      // TODO: falta el turno de 22 a 6 del día siguiente (si lo cubre
      // alguien — confirmar con Agustina).
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

// Expuesto aparte (no adentro del objeto de arriba) para que admin-duplas.html
// pueda armar etiquetas legibles al mostrar terminoIntervencionDiaria en el
// reporte semanal, sin tener que duplicar el diccionario.
window.PROJECT_CONFIG_UMBRAL_0.terminoIntervencionLabels = TERMINO_INTERVENCION_LABELS;
// Idem — casos.html arma el checklist "¿Qué hiciste con este caso?" a
// partir de accionesIntervencion (necesita key+label); admin-duplas.html
// y reporte-publico.html solo necesitan las etiquetas para el reporte.
window.PROJECT_CONFIG_UMBRAL_0.accionesIntervencion = ACCIONES_INTERVENCION;
window.PROJECT_CONFIG_UMBRAL_0.accionesIntervencionLabels = ACCIONES_INTERVENCION_LABELS;
window.PROJECT_CONFIG_UMBRAL_0.tipoIntervencionLabels = TIPO_INTERVENCION_LABELS;
// Idem — usados solo por casos.html (abrirModalValidarKobo /
// _mostrarSiguientePasoValidacion), ver los mapeos arriba.
window.PROJECT_CONFIG_UMBRAL_0.koboTerminoAAccion = KOBO_TERMINO_A_ACCION;
window.PROJECT_CONFIG_UMBRAL_0.accionATipoDerivacion = ACCION_A_TIPO_DERIVACION;

// Zonas operativas — polígono asignado a cada dupla (turnos 1 a 4), los
// comedores/instituciones de referencia de las duplas "iglesias" (que no
// patrullan una zona fija, sino que visitan un lugar en un horario fijo:
// C/F/I/L/M) y el contorno general "Zona Frontera" del reporte DGREA
// (pedido de Agustina, 22/9/2026: "quiero que en el mapa en vivo de mi
// plataforma esté el mapa que debemos recorrer nosotros delimitado, así
// podemos comparar si estamos en zona o no"). Extraído del KML exportado
// desde el My Maps del equipo (mid=17rIU9xQLt-di5U-caHpcdEQhMQO1rMA) —
// coordenadas redondeadas a 5 decimales (~1m de precisión, de sobra para
// referencia visual). Si el My Maps cambia, hay que volver a exportar el
// KML y regenerar este bloque a mano — no hay sincronización automática.
const ZONAS_OPERATIVAS_UMBRAL_0 = {"porDupla":{"A":{"nombre":"Once - Balvanera · Sub-zona A","poly":[[-34.60619,-58.3999],[-34.60619,-58.3995],[-34.60619,-58.39945],[-34.60599,-58.39385],[-34.60599,-58.39381],[-34.60589,-58.39221],[-34.60587,-58.39207],[-34.60584,-58.39192],[-34.6058,-58.39179],[-34.60575,-58.39166],[-34.60568,-58.39153],[-34.6056,-58.39141],[-34.60551,-58.3913],[-34.60541,-58.3912],[-34.6053,-58.39111],[-34.60518,-58.39103],[-34.60505,-58.39096],[-34.60492,-58.3909],[-34.60478,-58.39086],[-34.60464,-58.39083],[-34.6045,-58.39081],[-34.60436,-58.39081],[-34.60422,-58.39082],[-34.60182,-58.39112],[-34.60181,-58.39112],[-34.59951,-58.39142],[-34.59937,-58.39144],[-34.59923,-58.39148],[-34.5991,-58.39153],[-34.59897,-58.3916],[-34.59885,-58.39167],[-34.59874,-58.39176],[-34.59863,-58.39186],[-34.59854,-58.39196],[-34.59846,-58.39208],[-34.59838,-58.3922],[-34.59832,-58.39233],[-34.59827,-58.39246],[-34.59824,-58.3926],[-34.59822,-58.39274],[-34.59821,-58.39288],[-34.59811,-58.40038],[-34.59811,-58.40053],[-34.59814,-58.40069],[-34.59817,-58.40084],[-34.59823,-58.40098],[-34.5983,-58.40113],[-34.5988,-58.40203],[-34.59887,-58.40215],[-34.59896,-58.40226],[-34.59906,-58.40237],[-34.59917,-58.40247],[-34.59929,-58.40255],[-34.59941,-58.40263],[-34.59954,-58.40268],[-34.59968,-58.40273],[-34.59982,-58.40277],[-34.59997,-58.40279],[-34.60011,-58.40279],[-34.60026,-58.40278],[-34.60306,-58.40248],[-34.60319,-58.40246],[-34.60332,-58.40243],[-34.60344,-58.40239],[-34.60356,-58.40234],[-34.60368,-58.40227],[-34.60548,-58.40117],[-34.6056,-58.40109],[-34.60572,-58.40099],[-34.60583,-58.40088],[-34.60592,-58.40076],[-34.606,-58.40063],[-34.60607,-58.40049],[-34.60612,-58.40035],[-34.60616,-58.4002],[-34.60618,-58.40005],[-34.60619,-58.3999]],"color":"#FF0000","turno":"TURNO 1 · 6-10hs","nota":"Comparte Once-Balvanera con la Dupla K (mitad oeste), mismo turno — K se sumó acá por pedido de gobierno (29/9/2026) para reforzar la zona de frontera."},"B":{"nombre":"Retiro - San Telmo · Sector 1 (mitad oeste)","poly":[[-34.60569,-58.38835],[-34.60561,-58.38878],[-34.60541,-58.38918],[-34.60497,-58.38958],[-34.60457,-58.38975],[-34.59972,-58.39048],[-34.59927,-58.39048],[-34.59885,-58.39034],[-34.5986,-58.39019],[-34.59838,-58.38999],[-34.59814,-58.38961],[-34.59804,-58.38933],[-34.59779,-58.3871],[-34.60562,-58.3871],[-34.60569,-58.38835]],"color":"#D62B2B","turno":"TURNO 1 · 6-10hs","nota":"Comparte la zona con la Dupla C (mitad este, cerca de sus iglesias), mismo turno."},"D":{"nombre":"Once-Balvanera (zona completa)","poly":[[-34.60618,-58.40005],[-34.60607,-58.40049],[-34.60571,-58.401],[-34.60609,-58.40156],[-34.60619,-58.40214],[-34.60609,-58.40592],[-34.60559,-58.41192],[-34.60543,-58.41248],[-34.60496,-58.41302],[-34.6043,-58.41328],[-34.6006,-58.41378],[-34.60015,-58.41377],[-34.59973,-58.41363],[-34.59839,-58.41278],[-34.59698,-58.41148],[-34.59673,-58.41109],[-34.59661,-58.41049],[-34.59663,-58.40452],[-34.59719,-58.40308],[-34.59786,-58.40214],[-34.5985,-58.4015],[-34.59817,-58.40084],[-34.59811,-58.40038],[-34.59821,-58.39288],[-34.59832,-58.39233],[-34.59863,-58.39186],[-34.59897,-58.3916],[-34.59937,-58.39144],[-34.60422,-58.39082],[-34.60492,-58.3909],[-34.60551,-58.3913],[-34.60575,-58.39166],[-34.60589,-58.39221],[-34.60618,-58.40005]],"color":"#A5830C","turno":"TURNO 2 · 10-14hs","calles":"Entre Av. Rivadavia (sur), Av. Pueyrredón (norte), Av. Córdoba (oeste) y Av. Entre Ríos/Callao (este).","tipo":"frontera","nota":"Ex Chacarita/Villa Crespo, sin prioridad. Zona completa en este turno — la Dupla F se corrió a Retiro-San Telmo, mucho más cerca de su iglesia."},"E":{"nombre":"Almagro - Boedo","poly":[[-34.60527,-58.41511],[-34.60407,-58.41231],[-34.604,-58.41217],[-34.60392,-58.41204],[-34.60383,-58.41192],[-34.60372,-58.41181],[-34.6036,-58.41171],[-34.60347,-58.41162],[-34.60334,-58.41155],[-34.6032,-58.41149],[-34.60305,-58.41145],[-34.60055,-58.41085],[-34.6004,-58.41082],[-34.60025,-58.41081],[-34.6001,-58.41081],[-34.59995,-58.41083],[-34.5998,-58.41086],[-34.59965,-58.41091],[-34.59952,-58.41097],[-34.59939,-58.41105],[-34.59926,-58.41114],[-34.59915,-58.41124],[-34.59905,-58.41135],[-34.59896,-58.41147],[-34.59796,-58.41297],[-34.59792,-58.41304],[-34.59661,-58.41524],[-34.59655,-58.41537],[-34.59649,-58.41551],[-34.59645,-58.41565],[-34.59642,-58.4158],[-34.59641,-58.41595],[-34.59631,-58.41885],[-34.59631,-58.41897],[-34.59632,-58.4191],[-34.59672,-58.4221],[-34.59762,-58.4288],[-34.59765,-58.42895],[-34.59769,-58.42909],[-34.59775,-58.42923],[-34.59782,-58.42936],[-34.5979,-58.42949],[-34.59799,-58.4296],[-34.5981,-58.42971],[-34.6011,-58.43241],[-34.60122,-58.4325],[-34.60134,-58.43258],[-34.60147,-58.43265],[-34.6016,-58.43271],[-34.60175,-58.43275],[-34.60189,-58.43278],[-34.60204,-58.43279],[-34.60218,-58.43279],[-34.60233,-58.43277],[-34.60247,-58.43274],[-34.60261,-58.4327],[-34.60275,-58.43264],[-34.60288,-58.43257],[-34.603,-58.43249],[-34.60311,-58.4324],[-34.60321,-58.43229],[-34.60331,-58.43218],[-34.60339,-58.43205],[-34.60346,-58.43192],[-34.60351,-58.43179],[-34.60355,-58.43165],[-34.60358,-58.4315],[-34.60418,-58.4271],[-34.60418,-58.42706],[-34.60538,-58.41586],[-34.60539,-58.41571],[-34.60538,-58.41555],[-34.60536,-58.4154],[-34.60532,-58.41526],[-34.60527,-58.41511]],"color":"#2D5B8A","turno":"TURNO 2 · 10-14hs"},"G":{"nombre":"Retiro - San Telmo · Sector 2","poly":[[-34.60602,-58.39189],[-34.60579,-58.38927],[-34.60577,-58.38912],[-34.60573,-58.38898],[-34.60568,-58.38884],[-34.60562,-58.38871],[-34.60555,-58.38858],[-34.60546,-58.38846],[-34.60536,-58.38835],[-34.60525,-58.38825],[-34.60514,-58.38816],[-34.60501,-58.38809],[-34.60488,-58.38802],[-34.60474,-58.38797],[-34.60344,-58.38757],[-34.60328,-58.38753],[-34.60313,-58.38751],[-34.60297,-58.38751],[-34.60281,-58.38752],[-34.60265,-58.38755],[-34.60015,-58.38815],[-34.60002,-58.38819],[-34.5999,-58.38824],[-34.59978,-58.3883],[-34.59887,-58.3888],[-34.59875,-58.38887],[-34.59864,-58.38896],[-34.59853,-58.38906],[-34.59844,-58.38916],[-34.59835,-58.38928],[-34.59828,-58.3894],[-34.59822,-58.38954],[-34.59817,-58.38967],[-34.59814,-58.38981],[-34.59801,-58.39047],[-34.59799,-58.39059],[-34.59798,-58.39072],[-34.59792,-58.3927],[-34.59792,-58.39285],[-34.59794,-58.393],[-34.59797,-58.39314],[-34.59801,-58.39328],[-34.59807,-58.39341],[-34.59814,-58.39354],[-34.59823,-58.39366],[-34.59832,-58.39377],[-34.59842,-58.39387],[-34.59854,-58.39396],[-34.59866,-58.39404],[-34.59879,-58.39411],[-34.59893,-58.39416],[-34.59907,-58.3942],[-34.59921,-58.39423],[-34.59936,-58.39424],[-34.60075,-58.39429],[-34.60093,-58.39429],[-34.6011,-58.39426],[-34.60484,-58.39348],[-34.60498,-58.39344],[-34.60511,-58.39339],[-34.60524,-58.39333],[-34.60536,-58.39326],[-34.60548,-58.39317],[-34.60559,-58.39307],[-34.60568,-58.39297],[-34.60577,-58.39285],[-34.60584,-58.39273],[-34.60591,-58.3926],[-34.60596,-58.39246],[-34.60599,-58.39232],[-34.60601,-58.39218],[-34.60602,-58.39203],[-34.60602,-58.39189]],"color":"#D65B5B","turno":"TURNO 3 · 14-18hs"},"H":{"nombre":"Once-Balvanera · mitad oeste","poly":[[-34.60458,-58.40061],[-34.60473,-58.40061],[-34.60488,-58.40062],[-34.60502,-58.40064],[-34.60516,-58.40068],[-34.6053,-58.40073],[-34.60543,-58.4008],[-34.60556,-58.40088],[-34.60567,-58.40097],[-34.60578,-58.40107],[-34.60588,-58.40118],[-34.60596,-58.4013],[-34.60603,-58.40143],[-34.60609,-58.40156],[-34.60614,-58.4017],[-34.60617,-58.40185],[-34.60619,-58.40199],[-34.60619,-58.40214],[-34.60609,-58.40584],[-34.60609,-58.40592],[-34.60559,-58.41192],[-34.60557,-58.41207],[-34.60554,-58.41221],[-34.60549,-58.41234],[-34.60543,-58.41248],[-34.60536,-58.4126],[-34.60528,-58.41272],[-34.60518,-58.41283],[-34.60508,-58.41293],[-34.60496,-58.41302],[-34.60484,-58.41309],[-34.60471,-58.41316],[-34.60458,-58.41321],[-34.60444,-58.41325],[-34.6043,-58.41328],[-34.6006,-58.41378],[-34.60045,-58.41379],[-34.6003,-58.41379],[-34.60015,-58.41377],[-34.60001,-58.41374],[-34.59987,-58.41369],[-34.59973,-58.41363],[-34.5996,-58.41356],[-34.5985,-58.41286],[-34.59839,-58.41278],[-34.59829,-58.41269],[-34.59709,-58.41159],[-34.59698,-58.41148],[-34.59688,-58.41136],[-34.5968,-58.41123],[-34.59673,-58.41109],[-34.59668,-58.41094],[-34.59664,-58.4108],[-34.59662,-58.41064],[-34.59661,-58.41049],[-34.59661,-58.4048],[-34.59661,-58.40466],[-34.59663,-58.40452],[-34.59667,-58.40438],[-34.59671,-58.40425],[-34.59711,-58.40325],[-34.59719,-58.40308],[-34.59729,-58.40293],[-34.59779,-58.40223],[-34.59786,-58.40214],[-34.59795,-58.40205],[-34.59855,-58.40145],[-34.59866,-58.40134],[-34.59878,-58.40125],[-34.59891,-58.40118],[-34.59904,-58.40111],[-34.59919,-58.40107],[-34.59933,-58.40103],[-34.59948,-58.40101],[-34.60458,-58.40061]],"color":"#C5A014","turno":"TURNO 3 · 14-18hs","calles":"Entre Av. Rivadavia (sur), Av. Pueyrredón (norte), Av. Córdoba (oeste) y cerca de Av. Corrientes (este).","tipo":"frontera","nota":"Comparte Once-Balvanera con la Dupla I (mitad este), mismo turno. Ex Chacarita/Villa Crespo, sin prioridad."},"J":{"nombre":"Once-Balvanera (zona completa)","poly":[[-34.60618,-58.40005],[-34.60607,-58.40049],[-34.60571,-58.401],[-34.60609,-58.40156],[-34.60619,-58.40214],[-34.60609,-58.40592],[-34.60559,-58.41192],[-34.60543,-58.41248],[-34.60496,-58.41302],[-34.6043,-58.41328],[-34.6006,-58.41378],[-34.60015,-58.41377],[-34.59973,-58.41363],[-34.59839,-58.41278],[-34.59698,-58.41148],[-34.59673,-58.41109],[-34.59661,-58.41049],[-34.59663,-58.40452],[-34.59719,-58.40308],[-34.59786,-58.40214],[-34.5985,-58.4015],[-34.59817,-58.40084],[-34.59811,-58.40038],[-34.59821,-58.39288],[-34.59832,-58.39233],[-34.59863,-58.39186],[-34.59897,-58.3916],[-34.59937,-58.39144],[-34.60422,-58.39082],[-34.60492,-58.3909],[-34.60551,-58.3913],[-34.60575,-58.39166],[-34.60589,-58.39221],[-34.60618,-58.40005]],"color":"#FF0000","turno":"TURNO 4 · 18-22hs","nota":"Zona completa en este turno — la Dupla M se corrió a Retiro-San Telmo, mucho más cerca de su iglesia."},"K":{"nombre":"Once-Balvanera · mitad oeste (frontera, pedido de gobierno)","poly":[[-34.60458,-58.40061],[-34.60473,-58.40061],[-34.60488,-58.40062],[-34.60502,-58.40064],[-34.60516,-58.40068],[-34.6053,-58.40073],[-34.60543,-58.4008],[-34.60556,-58.40088],[-34.60567,-58.40097],[-34.60578,-58.40107],[-34.60588,-58.40118],[-34.60596,-58.4013],[-34.60603,-58.40143],[-34.60609,-58.40156],[-34.60614,-58.4017],[-34.60617,-58.40185],[-34.60619,-58.40199],[-34.60619,-58.40214],[-34.60609,-58.40584],[-34.60609,-58.40592],[-34.60559,-58.41192],[-34.60557,-58.41207],[-34.60554,-58.41221],[-34.60549,-58.41234],[-34.60543,-58.41248],[-34.60536,-58.4126],[-34.60528,-58.41272],[-34.60518,-58.41283],[-34.60508,-58.41293],[-34.60496,-58.41302],[-34.60484,-58.41309],[-34.60471,-58.41316],[-34.60458,-58.41321],[-34.60444,-58.41325],[-34.6043,-58.41328],[-34.6006,-58.41378],[-34.60045,-58.41379],[-34.6003,-58.41379],[-34.60015,-58.41377],[-34.60001,-58.41374],[-34.59987,-58.41369],[-34.59973,-58.41363],[-34.5996,-58.41356],[-34.5985,-58.41286],[-34.59839,-58.41278],[-34.59829,-58.41269],[-34.59709,-58.41159],[-34.59698,-58.41148],[-34.59688,-58.41136],[-34.5968,-58.41123],[-34.59673,-58.41109],[-34.59668,-58.41094],[-34.59664,-58.4108],[-34.59662,-58.41064],[-34.59661,-58.41049],[-34.59661,-58.4048],[-34.59661,-58.40466],[-34.59663,-58.40452],[-34.59667,-58.40438],[-34.59671,-58.40425],[-34.59711,-58.40325],[-34.59719,-58.40308],[-34.59729,-58.40293],[-34.59779,-58.40223],[-34.59786,-58.40214],[-34.59795,-58.40205],[-34.59855,-58.40145],[-34.59866,-58.40134],[-34.59878,-58.40125],[-34.59891,-58.40118],[-34.59904,-58.40111],[-34.59919,-58.40107],[-34.59933,-58.40103],[-34.59948,-58.40101],[-34.60458,-58.40061]],"color":"#D68B8B","turno":"TURNO 1 · 6-10hs","nota":"Pedido de gobierno (29/9/2026, tras reunión): reforzar la zona de frontera Almagro-Once en el turno de mayor presencia de personas en situación de calle. Se corrió de Retiro-San Telmo (18-22hs) a este turno. Comparte Once-Balvanera con la Dupla A (mitad este).","tipo":"frontera","calles":"Entre Av. Rivadavia (sur), Av. Pueyrredón (norte), Av. Córdoba (oeste) y cerca de Av. Corrientes (este)."},"C":{"nombre":"Retiro - San Telmo (mitad este)","poly":[[-34.59771,-58.38589],[-34.59772,-58.38535],[-34.59782,-58.38492],[-34.59796,-58.38466],[-34.59815,-58.38444],[-34.59838,-58.38425],[-34.59865,-58.38412],[-34.59908,-58.38401],[-34.60268,-58.38371],[-34.6031,-58.38374],[-34.60349,-58.38388],[-34.60384,-58.38413],[-34.60513,-58.38563],[-34.60533,-58.38593],[-34.60554,-58.38641],[-34.60562,-58.3871],[-34.59779,-58.3871],[-34.59771,-58.38589]],"color":"#8B5CF6","turno":"TURNO 1 · 6-10hs","pico":"El Socorro (desayuno 8hs) + San Nicolás de Bari (lun 9-11 mujeres / jue 9-11 hombres)","tipo":"iglesia","nota":"Comparte Retiro-San Telmo con la Dupla B (mitad oeste), mismo turno — mucho más cerca de sus iglesias que Almagro."},"F":{"nombre":"Retiro - San Telmo","poly":[[-34.60602,-58.39203],[-34.60596,-58.39246],[-34.60577,-58.39285],[-34.60548,-58.39317],[-34.60511,-58.39339],[-34.6011,-58.39426],[-34.59907,-58.3942],[-34.59854,-58.39396],[-34.59814,-58.39354],[-34.59797,-58.39314],[-34.59792,-58.3927],[-34.59799,-58.39059],[-34.59817,-58.38967],[-34.59804,-58.38933],[-34.59782,-58.38759],[-34.59771,-58.3855],[-34.59782,-58.38492],[-34.5982,-58.3844],[-34.59792,-58.38407],[-34.59775,-58.38364],[-34.59751,-58.38151],[-34.59755,-58.38085],[-34.59768,-58.38044],[-34.59792,-58.38009],[-34.59824,-58.37981],[-34.59891,-58.37959],[-34.60118,-58.37941],[-34.60255,-58.37939],[-34.60399,-58.37953],[-34.60427,-58.37962],[-34.60465,-58.37985],[-34.60502,-58.3803],[-34.60519,-58.38087],[-34.60549,-58.38469],[-34.60542,-58.38526],[-34.60518,-58.3857],[-34.60549,-58.38627],[-34.60559,-58.3867],[-34.60569,-58.3882],[-34.60563,-58.38872],[-34.60579,-58.38927],[-34.60602,-58.39203]],"color":"#059669","turno":"TURNO 2 · 10-14hs","pico":"Esclavas (L-V 10-12hs, olla/vianda)","tipo":"iglesia","nota":"Nadie más patrulla Retiro-San Telmo en este turno — zona libre, mucho más cerca de Esclavas que Once-Balvanera."},"I":{"nombre":"Once-Balvanera · mitad este","poly":[[-34.60619,-58.3999],[-34.60618,-58.40005],[-34.60616,-58.4002],[-34.60612,-58.40035],[-34.60607,-58.40049],[-34.606,-58.40063],[-34.60592,-58.40076],[-34.60583,-58.40088],[-34.60572,-58.40099],[-34.6056,-58.40109],[-34.60548,-58.40117],[-34.60368,-58.40227],[-34.60356,-58.40234],[-34.60344,-58.40239],[-34.60332,-58.40243],[-34.60319,-58.40246],[-34.60306,-58.40248],[-34.60026,-58.40278],[-34.60011,-58.40279],[-34.59997,-58.40279],[-34.59982,-58.40277],[-34.59968,-58.40273],[-34.59954,-58.40268],[-34.59941,-58.40263],[-34.59929,-58.40255],[-34.59917,-58.40247],[-34.59906,-58.40237],[-34.59896,-58.40226],[-34.59887,-58.40215],[-34.5988,-58.40203],[-34.5983,-58.40113],[-34.59823,-58.40098],[-34.59817,-58.40084],[-34.59814,-58.40069],[-34.59811,-58.40053],[-34.59811,-58.40038],[-34.59821,-58.39288],[-34.59822,-58.39274],[-34.59824,-58.3926],[-34.59827,-58.39246],[-34.59832,-58.39233],[-34.59838,-58.3922],[-34.59846,-58.39208],[-34.59854,-58.39196],[-34.59863,-58.39186],[-34.59874,-58.39176],[-34.59885,-58.39167],[-34.59897,-58.3916],[-34.5991,-58.39153],[-34.59923,-58.39148],[-34.59937,-58.39144],[-34.59951,-58.39142],[-34.60181,-58.39112],[-34.60182,-58.39112],[-34.60422,-58.39082],[-34.60436,-58.39081],[-34.6045,-58.39081],[-34.60464,-58.39083],[-34.60478,-58.39086],[-34.60492,-58.3909],[-34.60505,-58.39096],[-34.60518,-58.39103],[-34.6053,-58.39111],[-34.60541,-58.3912],[-34.60551,-58.3913],[-34.6056,-58.39141],[-34.60568,-58.39153],[-34.60575,-58.39166],[-34.6058,-58.39179],[-34.60584,-58.39192],[-34.60587,-58.39207],[-34.60589,-58.39221],[-34.60599,-58.39381],[-34.60599,-58.39385],[-34.60619,-58.39945],[-34.60619,-58.3995],[-34.60619,-58.3999]],"color":"#6D28D9","turno":"TURNO 3 · 14-18hs","pico":"San Agustín (asistente social L-J 16:30-18:30; comida mar/mié 16:30-18:30)","calles":"Entre Av. Rivadavia (sur), Av. Pueyrredón (norte), cerca de Av. Corrientes (oeste) y Av. Entre Ríos/Callao (este).","tipo":"iglesia","nota":"Comparte Once-Balvanera con la Dupla H (mitad oeste), mismo turno — más cerca de San Agustín que Almagro."},"L":{"nombre":"Almagro","poly":[[-34.60527,-58.41511],[-34.60538,-58.41586],[-34.60418,-58.4271],[-34.60358,-58.4315],[-34.60339,-58.43205],[-34.603,-58.43249],[-34.60247,-58.43274],[-34.60189,-58.43278],[-34.60147,-58.43265],[-34.6011,-58.43241],[-34.5981,-58.42971],[-34.59769,-58.42909],[-34.59632,-58.4191],[-34.59642,-58.4158],[-34.59661,-58.41524],[-34.59796,-58.41297],[-34.59896,-58.41147],[-34.59952,-58.41097],[-34.6001,-58.41081],[-34.60055,-58.41085],[-34.60305,-58.41145],[-34.6036,-58.41171],[-34.60383,-58.41192],[-34.60407,-58.41231],[-34.60527,-58.41511]],"color":"#A78BFA","turno":"TURNO 4 · 18-22hs","pico":"La Redonda (L-Sáb 18hs, comedor varones)","calles":"Entre Av. Rivadavia (sur), Av. Pueyrredón (norte), Av. Díaz Vélez/Áng. Gallardo (oeste) y Av. Córdoba (este).","tipo":"iglesia"},"M":{"nombre":"Retiro - San Telmo · Sector 3 (zona completa)","poly":[[-34.60549,-58.38469],[-34.60549,-58.38483],[-34.60548,-58.38498],[-34.60546,-58.38512],[-34.60542,-58.38526],[-34.60537,-58.3854],[-34.60531,-58.38552],[-34.60523,-58.38565],[-34.60514,-58.38576],[-34.60504,-58.38587],[-34.60493,-58.38596],[-34.60482,-58.38605],[-34.60469,-58.38612],[-34.60456,-58.38618],[-34.60443,-58.38623],[-34.60429,-58.38626],[-34.60414,-58.38629],[-34.604,-58.38629],[-34.6028,-58.38629],[-34.60266,-58.38629],[-34.60252,-58.38627],[-34.60239,-58.38623],[-34.59959,-58.38544],[-34.59943,-58.38538],[-34.59929,-58.38531],[-34.59915,-58.38522],[-34.59902,-58.38512],[-34.59822,-58.38442],[-34.59811,-58.38432],[-34.59801,-58.3842],[-34.59792,-58.38407],[-34.59785,-58.38393],[-34.59779,-58.38379],[-34.59775,-58.38364],[-34.59772,-58.38349],[-34.59762,-58.38269],[-34.59762,-58.38267],[-34.59752,-58.38177],[-34.59751,-58.38164],[-34.59751,-58.38151],[-34.59754,-58.38099],[-34.59755,-58.38085],[-34.59758,-58.38071],[-34.59763,-58.38058],[-34.59768,-58.38044],[-34.59775,-58.38032],[-34.59783,-58.3802],[-34.59792,-58.38009],[-34.59801,-58.37999],[-34.59812,-58.37989],[-34.59824,-58.37981],[-34.59837,-58.37974],[-34.5985,-58.37969],[-34.59863,-58.37964],[-34.59877,-58.37961],[-34.59891,-58.37959],[-34.60118,-58.37941],[-34.60127,-58.37941],[-34.60238,-58.37939],[-34.60255,-58.37939],[-34.60384,-58.37951],[-34.60399,-58.37953],[-34.60413,-58.37957],[-34.60427,-58.37962],[-34.6044,-58.37968],[-34.60453,-58.37976],[-34.60465,-58.37985],[-34.60476,-58.37995],[-34.60486,-58.38006],[-34.60494,-58.38018],[-34.60502,-58.3803],[-34.60508,-58.38043],[-34.60513,-58.38058],[-34.60516,-58.38072],[-34.60519,-58.38087],[-34.60529,-58.38197],[-34.60529,-58.38199],[-34.60549,-58.38469]],"color":"#34D399","turno":"TURNO 4 · 18-22hs","pico":"San Nicolás de Bari (mié/vie 19hs a cierre, mixto)","tipo":"iglesia","nota":"Comparte Retiro-San Telmo con la Dupla K, mismo turno — mucho más cerca que Once-Balvanera. Zona completa: K se corrió a Once-Balvanera (T1) por pedido de gobierno, así que ya no hay que repartir esta con nadie."}},"comedores":{"C":[{"nombre":"El Socorro","poly":[[-34.59284,-58.38178],[-34.59423,-58.38173],[-34.5941,-58.37945],[-34.59416,-58.37759],[-34.59284,-58.37702],[-34.59276,-58.37892],[-34.59265,-58.3816],[-34.59284,-58.38178]],"color":"#C542D6"},{"nombre":"San Nicolás de Bari","poly":[[-34.59587,-58.3884],[-34.59717,-58.38826],[-34.59687,-58.38417],[-34.59568,-58.38429],[-34.59543,-58.38429],[-34.59548,-58.38598],[-34.59557,-58.3882],[-34.5956,-58.38855],[-34.59587,-58.3884]],"color":"#C542D6"}],"F":[{"nombre":"Esclavas","poly":[[-34.59366,-58.39222],[-34.59502,-58.39208],[-34.59513,-58.38989],[-34.59389,-58.38997],[-34.5932,-58.38994],[-34.5925,-58.38891],[-34.59166,-58.38996],[-34.59275,-58.39106],[-34.59366,-58.39222]],"color":"#C542D6"}],"I":[{"nombre":"San Agustín","poly":[[-34.58516,-58.40025],[-34.58593,-58.40128],[-34.58663,-58.4002],[-34.58795,-58.39807],[-34.58759,-58.39728],[-34.58513,-58.39995],[-34.58516,-58.40025]],"color":"#C542D6"}],"L":[{"nombre":"La Redonda","poly":[[-34.5611,-58.45768],[-34.56253,-58.45645],[-34.56403,-58.45526],[-34.56335,-58.45403],[-34.56111,-58.45592],[-34.56045,-58.45651],[-34.5611,-58.45768]],"color":"#C542D6"}],"M":[{"nombre":"San Nicolás de Bari","poly":[[-34.59587,-58.3884],[-34.59717,-58.38826],[-34.59687,-58.38417],[-34.59568,-58.38429],[-34.59543,-58.38429],[-34.59548,-58.38598],[-34.59557,-58.3882],[-34.5956,-58.38855],[-34.59587,-58.3884]],"color":"#C542D6"}]},"zonaFrontera":[[-34.58502,-58.45442],[-34.58677,-58.45289],[-34.58893,-58.45082],[-34.59195,-58.44771],[-34.59448,-58.44494],[-34.59673,-58.44259],[-34.59847,-58.44086],[-34.59949,-58.43993],[-34.60027,-58.43814],[-34.60099,-58.43635],[-34.60192,-58.43358],[-34.60247,-58.43066],[-34.6028,-58.42748],[-34.60303,-58.42461],[-34.60334,-58.42128],[-34.60361,-58.41852],[-34.60398,-58.41612],[-34.60435,-58.41368],[-34.60431,-58.41164],[-34.6042,-58.40986],[-34.60455,-58.40699],[-34.6049,-58.40412],[-34.60492,-58.40154],[-34.60488,-58.39901],[-34.60469,-58.39374],[-34.60456,-58.39177],[-34.60446,-58.39025],[-34.60429,-58.38771],[-34.6042,-58.38625],[-34.60413,-58.38486],[-34.60405,-58.38314],[-34.60393,-58.38071],[-34.5988,-58.38102],[-34.59907,-58.38714],[-34.59934,-58.3913],[-34.59943,-58.39601],[-34.59951,-58.39855],[-34.59915,-58.40198],[-34.59784,-58.40431],[-34.59779,-58.40577],[-34.59783,-58.40824],[-34.59777,-58.41069],[-34.59761,-58.41342],[-34.59756,-58.41608],[-34.59755,-58.41911],[-34.59745,-58.42192],[-34.59738,-58.42359],[-34.5969,-58.42483],[-34.59621,-58.42651],[-34.59532,-58.42805],[-34.59461,-58.4291],[-34.59408,-58.43008],[-34.59189,-58.43341],[-34.59129,-58.43433],[-34.58937,-58.43715],[-34.58789,-58.43939],[-34.5866,-58.44126],[-34.58587,-58.4424],[-34.58467,-58.44407],[-34.5838,-58.44569],[-34.58346,-58.44664],[-34.58283,-58.44812],[-34.58246,-58.44909],[-34.58212,-58.45],[-34.58184,-58.45098],[-34.58134,-58.45133],[-34.58057,-58.4501],[-34.58021,-58.45143],[-34.5797,-58.45268],[-34.57914,-58.45457],[-34.57868,-58.45618],[-34.57823,-58.45751],[-34.57799,-58.45963],[-34.57834,-58.46038],[-34.57921,-58.4598],[-34.58189,-58.45731],[-34.58502,-58.45442]]};
window.PROJECT_CONFIG_UMBRAL_0.zonasOperativas = ZONAS_OPERATIVAS_UMBRAL_0;

})();
