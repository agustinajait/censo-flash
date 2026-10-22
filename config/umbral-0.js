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
  entrevista_persona: 'Diálogo con la persona',
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
  // Pedido de Agustina (21/10/2026): este tilde simple (sin preguntas
  // asociadas) se confundía con "entrevista en profundidad" (el campo
  // acepta_entrevista_prolongada/tiene_entrevista de KoBo, que SÍ
  // dispara un bloque largo de preguntas) — se renombra a "Diálogo con
  // la persona" para que quede claro que son dos cosas distintas. La
  // `key` ('entrevista') no cambia: ya hay datos guardados con ese
  // código en intervenciones.acciones/kobo_validaciones.acciones.
  { key:'entrevista', label:'Diálogo con la persona' },
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

// "Direcciones priorizadas" (22/10/2026) — tendencia de cada dirección en
// la planilla semanal de gobierno (tabla direcciones_priorizadas, ver
// schema-ajustes.sql). Mismo diccionario usado por admin-duplas.html (para
// cargarlas) y casos.html (para mostrárselas a las duplas), así los dos
// quedan sincronizados si se agrega/cambia una tendencia.
const TENDENCIA_DIRECCION = {
  nuevo:   { label:'Nuevo',   color:'#1a56db' },
  empeora: { label:'Empeora', color:'#ef4444' },
  mejora:  { label:'Mejora',  color:'#10b981' },
  igual:   { label:'Igual',   color:'#64748b' },
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
      // 'tiene_entrevista' es el equivalente de 'acepta_entrevista_prolongada'
      // pero del lado de la rama de Seguimiento (confirmado contra datos
      // reales: ambas preguntas solo se completan cuando tipo_intervencion
      // es 'seguimiento', nunca en Primer Acercamiento) — juntas arman
      // "¿esta visita terminó en una entrevista en profundidad?" sin
      // importar si la persona ya estaba en seguimiento o no. 21/10/2026,
      // pedido de Agustina: sumar esto al resumen diario del admin.
      tieneEntrevista: campoSufijoBool(row, 'tiene_entrevista'),
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
  nombre: 'Releva Umbral',
  emoji: '🌒',
  descripcion: 'Relevamiento territorial nocturno — Releva Umbral.',
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
window.PROJECT_CONFIG_UMBRAL_0.tendenciaDireccion = TENDENCIA_DIRECCION;

// Zonas operativas — ESQUEMA HISTÓRICO (vigente 5/10/2026 al 11/10/2026,
// polígonos P1-P4). Reemplazado el 12/10/2026 por ZONAS_OPERATIVAS_UMBRAL_0
// (más abajo) con las 3 sub-zonas P1 este/P1 oeste/P2. Se conserva (no se
// borra) solo para poder consultar a qué polígono correspondía un registro
// cargado antes del 12/10 — no está conectado a ningún código vivo.
const ZONAS_OPERATIVAS_UMBRAL_0_HISTORICO_5OCT2026 = {"porDupla":{"A":{"nombre":"Frontera — P2","poly":[[-34.597599,-58.404445],[-34.598073,-58.403638],[-34.598672,-58.402784],[-34.598912,-58.401441],[-34.59917,-58.400852],[-34.5996,-58.396836],[-34.599586,-58.396344],[-34.599511,-58.395],[-34.604641,-58.395],[-34.60463,-58.396965],[-34.604785,-58.399621],[-34.604866,-58.400639],[-34.6053,-58.40073],[-34.604897,-58.401027],[-34.604883,-58.402205],[-34.604748,-58.40592],[-34.604716,-58.406125],[-34.604712,-58.406435],[-34.604539,-58.4075],[-34.597715,-58.4075],[-34.597599,-58.404445]],"color":"#6B4FA0","turno":"TURNO 1 · 6-10hs","nota":"Zona final (5/10/2026): Polígono 2 completo.","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1ze-2Ib1bJBalRf7waYP8KQFY0nKqbHc&usp=sharing"},"B":{"nombre":"Frontera — P1 oeste","poly":[[-34.599379,-58.392593],[-34.599324,-58.392142],[-34.599337,-58.391737],[-34.599213,-58.391495],[-34.599352,-58.391446],[-34.59927,-58.39048],[-34.599345,-58.390403],[-34.599332,-58.389904],[-34.599368,-58.389],[-34.599256,-58.388],[-34.604274,-58.388],[-34.604563,-58.391782],[-34.604617,-58.391962],[-34.604639,-58.392199],[-34.604629,-58.392232],[-34.604654,-58.392768],[-34.604641,-58.395],[-34.599511,-58.395],[-34.599379,-58.392593]],"color":"#D62B2B","turno":"TURNO 1 · 6-10hs","nota":"Zona final (5/10/2026): Cubre Esclavas en el turno mañana (alerta 5 de gobierno) y patrulla la mitad oeste del Polígono 1 (Paraná → Ayacucho, aprox.).","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1pLEj2MRgKMlt76hrMd5zq2oCzC46mKY&usp=sharing","tipo":"iglesia"},"D":{"nombre":"Frontera — P2 + P3","poly":[[-34.597617,-58.418035],[-34.597632,-58.417057],[-34.597611,-58.41625],[-34.59767,-58.415669],[-34.597778,-58.415046],[-34.597726,-58.414909],[-34.597908,-58.414001],[-34.59792,-58.41304],[-34.5982,-58.41261],[-34.598151,-58.412458],[-34.597616,-58.411738],[-34.59779,-58.411305],[-34.597705,-58.41049],[-34.597387,-58.409546],[-34.597715,-58.407505],[-34.597599,-58.404445],[-34.598073,-58.403638],[-34.598672,-58.402784],[-34.598912,-58.401441],[-34.59917,-58.400852],[-34.5996,-58.396836],[-34.599586,-58.396344],[-34.599511,-58.395],[-34.604641,-58.395],[-34.60463,-58.396965],[-34.604785,-58.399621],[-34.604866,-58.400639],[-34.6053,-58.40073],[-34.604897,-58.401027],[-34.604883,-58.402205],[-34.604748,-58.40592],[-34.604716,-58.406125],[-34.604712,-58.406435],[-34.604304,-58.408936],[-34.604177,-58.410611],[-34.60407,-58.41231],[-34.6042,-58.413047],[-34.604284,-58.413159],[-34.6043,-58.41328],[-34.604274,-58.41347],[-34.604299,-58.413608],[-34.604241,-58.413714],[-34.604048,-58.415146],[-34.604048,-58.415453],[-34.60401,-58.415429],[-34.603683,-58.417852],[-34.603623,-58.4185],[-34.597487,-58.4185],[-34.597617,-58.418035]],"color":"#C2553F","turno":"TURNO 2 · 10-14hs","nota":"Zona final (5/10/2026): Polígonos 2 y 3.","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1pWZBWz2U1d4GOmllDCNykqjD3bXqOeA&usp=sharing"},"E":{"nombre":"Frontera — P4","poly":[[-34.602039,-58.432318],[-34.601981,-58.432192],[-34.601785,-58.432235],[-34.601488,-58.43192],[-34.601171,-58.43168],[-34.600976,-58.431487],[-34.600693,-58.431156],[-34.599706,-58.430073],[-34.599488,-58.429754],[-34.59886,-58.429034],[-34.598555,-58.42842],[-34.598041,-58.427849],[-34.597961,-58.427729],[-34.597777,-58.427578],[-34.597778,-58.427406],[-34.597827,-58.427309],[-34.597778,-58.42703],[-34.597718,-58.424618],[-34.597621,-58.422744],[-34.597634,-58.421843],[-34.597656,-58.421842],[-34.597686,-58.420557],[-34.597662,-58.4191],[-34.597476,-58.418541],[-34.597487,-58.4185],[-34.603623,-58.4185],[-34.602838,-58.427081],[-34.602706,-58.427622],[-34.602485,-58.429848],[-34.602291,-58.431478],[-34.602339,-58.431772],[-34.602202,-58.431868],[-34.602039,-58.432318]],"color":"#2D5B8A","turno":"TURNO 2 · 10-14hs","nota":"Zona final (5/10/2026): Polígono 4 completo (recupera la mitad que se le había dado a la K).","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1sKYbMhHdezWDho-u03r37j5lYrak-xc&usp=sharing"},"G":{"nombre":"Frontera — P3 + P4","poly":[[-34.602039,-58.432318],[-34.601981,-58.432192],[-34.601785,-58.432235],[-34.601488,-58.43192],[-34.601171,-58.43168],[-34.600976,-58.431487],[-34.600693,-58.431156],[-34.599706,-58.430073],[-34.599488,-58.429754],[-34.59886,-58.429034],[-34.598555,-58.42842],[-34.598041,-58.427849],[-34.597961,-58.427729],[-34.597777,-58.427578],[-34.597778,-58.427406],[-34.597827,-58.427309],[-34.597778,-58.42703],[-34.597718,-58.424618],[-34.597621,-58.422744],[-34.597634,-58.421843],[-34.597656,-58.421842],[-34.597686,-58.420557],[-34.597662,-58.4191],[-34.597476,-58.418541],[-34.597617,-58.418035],[-34.597632,-58.417057],[-34.597611,-58.41625],[-34.59767,-58.415669],[-34.597778,-58.415046],[-34.597726,-58.414909],[-34.597908,-58.414001],[-34.59792,-58.41304],[-34.5982,-58.41261],[-34.598151,-58.412458],[-34.597616,-58.411738],[-34.59779,-58.411305],[-34.597705,-58.41049],[-34.597387,-58.409546],[-34.597715,-58.407505],[-34.597715,-58.4075],[-34.604539,-58.4075],[-34.604304,-58.408936],[-34.604177,-58.410611],[-34.60407,-58.41231],[-34.6042,-58.413047],[-34.604284,-58.413159],[-34.6043,-58.41328],[-34.604274,-58.41347],[-34.604299,-58.413608],[-34.604241,-58.413714],[-34.604048,-58.415146],[-34.604048,-58.415453],[-34.60401,-58.415429],[-34.603683,-58.417852],[-34.602838,-58.427081],[-34.602706,-58.427622],[-34.602485,-58.429848],[-34.602291,-58.431478],[-34.602339,-58.431772],[-34.602202,-58.431868],[-34.602039,-58.432318]],"color":"#6B4FA0","turno":"TURNO 1 · 6-10hs","nota":"Zona final (5/10/2026): Pasó del Turno 2 al Turno 1 (6 a 10). Cubre los polígonos 3 y 4, los de menor demanda, en el turno con más llamados.","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1BxBP7VoUB7UorGcqUUGBaE08ZMpOPfs&usp=sharing"},"H":{"nombre":"Frontera — P1","poly":[[-34.599379,-58.392593],[-34.599324,-58.392142],[-34.599337,-58.391737],[-34.599213,-58.391495],[-34.599352,-58.391446],[-34.59927,-58.39048],[-34.599345,-58.390403],[-34.599332,-58.389904],[-34.599368,-58.389],[-34.599168,-58.387207],[-34.599233,-58.387208],[-34.599128,-58.385203],[-34.59902,-58.38512],[-34.599031,-58.384632],[-34.598768,-58.383984],[-34.599044,-58.384026],[-34.599128,-58.38334],[-34.598998,-58.382348],[-34.598892,-58.381135],[-34.59906,-58.380862],[-34.599001,-58.380863],[-34.599167,-58.380687],[-34.59906,-58.380862],[-34.601251,-58.380826],[-34.601782,-58.380976],[-34.602851,-58.38084],[-34.603398,-58.380626],[-34.603446,-58.380946],[-34.603766,-58.380558],[-34.603618,-58.380922],[-34.603755,-58.380902],[-34.603657,-58.381119],[-34.603672,-58.381281],[-34.603877,-58.381755],[-34.603827,-58.382924],[-34.604136,-58.386195],[-34.604563,-58.391782],[-34.604617,-58.391962],[-34.604639,-58.392199],[-34.604629,-58.392232],[-34.604654,-58.392768],[-34.604641,-58.395],[-34.599511,-58.395],[-34.599379,-58.392593]],"color":"#C5A014","turno":"TURNO 3 · 14-18hs","nota":"Zona final (5/10/2026): Polígono 1 completo, el de más demanda (1.801 llamados ago-sep).","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1nvb1JddtLS5yQhyHkhK-j9-M_CVjHHU&usp=sharing"},"J":{"nombre":"Frontera — P2 + P3","poly":[[-34.597617,-58.418035],[-34.597632,-58.417057],[-34.597611,-58.41625],[-34.59767,-58.415669],[-34.597778,-58.415046],[-34.597726,-58.414909],[-34.597908,-58.414001],[-34.59792,-58.41304],[-34.5982,-58.41261],[-34.598151,-58.412458],[-34.597616,-58.411738],[-34.59779,-58.411305],[-34.597705,-58.41049],[-34.597387,-58.409546],[-34.597715,-58.407505],[-34.597599,-58.404445],[-34.598073,-58.403638],[-34.598672,-58.402784],[-34.598912,-58.401441],[-34.59917,-58.400852],[-34.5996,-58.396836],[-34.599586,-58.396344],[-34.599511,-58.395],[-34.604641,-58.395],[-34.60463,-58.396965],[-34.604785,-58.399621],[-34.604866,-58.400639],[-34.6053,-58.40073],[-34.604897,-58.401027],[-34.604883,-58.402205],[-34.604748,-58.40592],[-34.604716,-58.406125],[-34.604712,-58.406435],[-34.604304,-58.408936],[-34.604177,-58.410611],[-34.60407,-58.41231],[-34.6042,-58.413047],[-34.604284,-58.413159],[-34.6043,-58.41328],[-34.604274,-58.41347],[-34.604299,-58.413608],[-34.604241,-58.413714],[-34.604048,-58.415146],[-34.604048,-58.415453],[-34.60401,-58.415429],[-34.603683,-58.417852],[-34.603623,-58.4185],[-34.597487,-58.4185],[-34.597617,-58.418035]],"color":"#9B6FC9","turno":"TURNO 4 · 18-22hs","nota":"Zona final (5/10/2026): Polígonos 2 y 3.","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1YGzRSLNJHS0SiukTuM0IgP1giT7awcI&usp=sharing"},"K":{"nombre":"Frontera — P4","poly":[[-34.602039,-58.432318],[-34.601981,-58.432192],[-34.601785,-58.432235],[-34.601488,-58.43192],[-34.601171,-58.43168],[-34.600976,-58.431487],[-34.600693,-58.431156],[-34.599706,-58.430073],[-34.599488,-58.429754],[-34.59886,-58.429034],[-34.598555,-58.42842],[-34.598041,-58.427849],[-34.597961,-58.427729],[-34.597777,-58.427578],[-34.597778,-58.427406],[-34.597827,-58.427309],[-34.597778,-58.42703],[-34.597718,-58.424618],[-34.597621,-58.422744],[-34.597634,-58.421843],[-34.597656,-58.421842],[-34.597686,-58.420557],[-34.597662,-58.4191],[-34.597476,-58.418541],[-34.597487,-58.4185],[-34.603623,-58.4185],[-34.602838,-58.427081],[-34.602706,-58.427622],[-34.602485,-58.429848],[-34.602291,-58.431478],[-34.602339,-58.431772],[-34.602202,-58.431868],[-34.602039,-58.432318]],"color":"#D68B8B","turno":"TURNO 4 · 18-22hs","nota":"Zona final (5/10/2026): Lunes, miércoles y viernes: comedor de La Redonda desde las 18. Martes y jueves: recorre el Polígono 4 todo el turno.","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1sw7mr5HbMe8C8dIX05G8DFKr4BVUbjg&usp=sharing","tipo":"iglesia"},"C":{"nombre":"Frontera — P1 este","poly":[[-34.599168,-58.387207],[-34.599233,-58.387208],[-34.599128,-58.385203],[-34.59902,-58.38512],[-34.599031,-58.384632],[-34.598768,-58.383984],[-34.599044,-58.384026],[-34.599128,-58.38334],[-34.598998,-58.382348],[-34.598892,-58.381135],[-34.59906,-58.380862],[-34.599001,-58.380863],[-34.599167,-58.380687],[-34.59906,-58.380862],[-34.601251,-58.380826],[-34.601782,-58.380976],[-34.602851,-58.38084],[-34.603398,-58.380626],[-34.603446,-58.380946],[-34.603766,-58.380558],[-34.603618,-58.380922],[-34.603755,-58.380902],[-34.603657,-58.381119],[-34.603672,-58.381281],[-34.603877,-58.381755],[-34.603827,-58.382924],[-34.604136,-58.386195],[-34.604274,-58.388],[-34.599256,-58.388],[-34.599168,-58.387207]],"color":"#8B5CF6","turno":"TURNO 1 · 6-10hs","pico":"El Socorro (desayuno 8hs) + San Nicolás de Bari (lun 9-11 mujeres / jue 9-11 hombres)","tipo":"iglesia","nota":"Zona final (5/10/2026): Pasa por sus iglesias y después patrulla la mitad este del Polígono 1 (Carlos Pellegrini → Paraná, aprox.). El P1 es el de más demanda (1.801 llamados ago-sep), por eso a la mañana tiene dos duplas.","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1vSo1v45x-QHvoHFta72QtkWDKW2yJRg&usp=sharing"},"F":{"nombre":"Frontera — P1","poly":[[-34.599379,-58.392593],[-34.599324,-58.392142],[-34.599337,-58.391737],[-34.599213,-58.391495],[-34.599352,-58.391446],[-34.59927,-58.39048],[-34.599345,-58.390403],[-34.599332,-58.389904],[-34.599368,-58.389],[-34.599168,-58.387207],[-34.599233,-58.387208],[-34.599128,-58.385203],[-34.59902,-58.38512],[-34.599031,-58.384632],[-34.598768,-58.383984],[-34.599044,-58.384026],[-34.599128,-58.38334],[-34.598998,-58.382348],[-34.598892,-58.381135],[-34.59906,-58.380862],[-34.599001,-58.380863],[-34.599167,-58.380687],[-34.59906,-58.380862],[-34.601251,-58.380826],[-34.601782,-58.380976],[-34.602851,-58.38084],[-34.603398,-58.380626],[-34.603446,-58.380946],[-34.603766,-58.380558],[-34.603618,-58.380922],[-34.603755,-58.380902],[-34.603657,-58.381119],[-34.603672,-58.381281],[-34.603877,-58.381755],[-34.603827,-58.382924],[-34.604136,-58.386195],[-34.604563,-58.391782],[-34.604617,-58.391962],[-34.604639,-58.392199],[-34.604629,-58.392232],[-34.604654,-58.392768],[-34.604641,-58.395],[-34.599511,-58.395],[-34.599379,-58.392593]],"color":"#059669","turno":"TURNO 2 · 10-14hs","pico":"Esclavas (L-V 10-12hs, olla/vianda)","tipo":"iglesia","nota":"Zona final (5/10/2026): Pasa por Esclavas y patrulla el Polígono 1 completo.","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1Fhvkamki2P3WkXmwaObcLuwcVM5do60&usp=sharing"},"I":{"nombre":"Frontera — P2","poly":[[-34.597599,-58.404445],[-34.598073,-58.403638],[-34.598672,-58.402784],[-34.598912,-58.401441],[-34.59917,-58.400852],[-34.5996,-58.396836],[-34.599586,-58.396344],[-34.599511,-58.395],[-34.604641,-58.395],[-34.60463,-58.396965],[-34.604785,-58.399621],[-34.604866,-58.400639],[-34.6053,-58.40073],[-34.604897,-58.401027],[-34.604883,-58.402205],[-34.604748,-58.40592],[-34.604716,-58.406125],[-34.604712,-58.406435],[-34.604539,-58.4075],[-34.597715,-58.4075],[-34.597599,-58.404445]],"color":"#2F7D6B","turno":"TURNO 3 · 14-18hs","pico":"San Agustín (asistente social L-J 16:30-18:30; comida mar/mié 16:30-18:30)","tipo":"iglesia","nota":"Zona final (5/10/2026): Patrulla el Polígono 2 y sube a San Agustín (Las Heras 2560, ~1,4 km del corredor por Pueyrredón) en su horario.","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1L8A8UlO3rQA--B0vPEQ22pQcZtDKjfY&usp=sharing"},"L":{"nombre":"Frontera — P3 + P4","poly":[[-34.602039,-58.432318],[-34.601981,-58.432192],[-34.601785,-58.432235],[-34.601488,-58.43192],[-34.601171,-58.43168],[-34.600976,-58.431487],[-34.600693,-58.431156],[-34.599706,-58.430073],[-34.599488,-58.429754],[-34.59886,-58.429034],[-34.598555,-58.42842],[-34.598041,-58.427849],[-34.597961,-58.427729],[-34.597777,-58.427578],[-34.597778,-58.427406],[-34.597827,-58.427309],[-34.597778,-58.42703],[-34.597718,-58.424618],[-34.597621,-58.422744],[-34.597634,-58.421843],[-34.597656,-58.421842],[-34.597686,-58.420557],[-34.597662,-58.4191],[-34.597476,-58.418541],[-34.597617,-58.418035],[-34.597632,-58.417057],[-34.597611,-58.41625],[-34.59767,-58.415669],[-34.597778,-58.415046],[-34.597726,-58.414909],[-34.597908,-58.414001],[-34.59792,-58.41304],[-34.5982,-58.41261],[-34.598151,-58.412458],[-34.597616,-58.411738],[-34.59779,-58.411305],[-34.597705,-58.41049],[-34.597387,-58.409546],[-34.597715,-58.407505],[-34.597715,-58.4075],[-34.604539,-58.4075],[-34.604304,-58.408936],[-34.604177,-58.410611],[-34.60407,-58.41231],[-34.6042,-58.413047],[-34.604284,-58.413159],[-34.6043,-58.41328],[-34.604274,-58.41347],[-34.604299,-58.413608],[-34.604241,-58.413714],[-34.604048,-58.415146],[-34.604048,-58.415453],[-34.60401,-58.415429],[-34.603683,-58.417852],[-34.602838,-58.427081],[-34.602706,-58.427622],[-34.602485,-58.429848],[-34.602291,-58.431478],[-34.602339,-58.431772],[-34.602202,-58.431868],[-34.602039,-58.432318]],"color":"#A78BFA","turno":"TURNO 3 · 14-18hs","pico":"La Redonda (L-Sáb 18hs, comedor varones)","nota":"Zona final (5/10/2026): Polígonos 3 y 4 completos, todo el turno.","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1_HnRKO6affIc-NfX0UUnq0fM-LeIzyQ&usp=sharing"},"M":{"nombre":"Frontera — P1","poly":[[-34.599379,-58.392593],[-34.599324,-58.392142],[-34.599337,-58.391737],[-34.599213,-58.391495],[-34.599352,-58.391446],[-34.59927,-58.39048],[-34.599345,-58.390403],[-34.599332,-58.389904],[-34.599368,-58.389],[-34.599168,-58.387207],[-34.599233,-58.387208],[-34.599128,-58.385203],[-34.59902,-58.38512],[-34.599031,-58.384632],[-34.598768,-58.383984],[-34.599044,-58.384026],[-34.599128,-58.38334],[-34.598998,-58.382348],[-34.598892,-58.381135],[-34.59906,-58.380862],[-34.599001,-58.380863],[-34.599167,-58.380687],[-34.59906,-58.380862],[-34.601251,-58.380826],[-34.601782,-58.380976],[-34.602851,-58.38084],[-34.603398,-58.380626],[-34.603446,-58.380946],[-34.603766,-58.380558],[-34.603618,-58.380922],[-34.603755,-58.380902],[-34.603657,-58.381119],[-34.603672,-58.381281],[-34.603877,-58.381755],[-34.603827,-58.382924],[-34.604136,-58.386195],[-34.604563,-58.391782],[-34.604617,-58.391962],[-34.604639,-58.392199],[-34.604629,-58.392232],[-34.604654,-58.392768],[-34.604641,-58.395],[-34.599511,-58.395],[-34.599379,-58.392593]],"color":"#34D399","turno":"TURNO 4 · 18-22hs","pico":"San Nicolás de Bari (mié/vie 19hs a cierre, mixto)","tipo":"iglesia","nota":"Zona final (5/10/2026): Polígono 1 completo; mié y vie pasa por San Nicolás.","mymaps":"https://www.google.com/maps/d/u/3/edit?mid=1QNfX4LQYDEkpO17kjRsx9fHDKvc_jYU&usp=sharing"}},"comedores":{"C":[{"nombre":"El Socorro","poly":[[-34.59284,-58.38178],[-34.59265,-58.3816],[-34.59276,-58.37892],[-34.59284,-58.37702],[-34.59416,-58.37759],[-34.5941,-58.37945],[-34.59423,-58.38173],[-34.59284,-58.38178]],"color":"#C542D6"},{"nombre":"San Nicolás de Bari","poly":[[-34.59587,-58.3884],[-34.5956,-58.38855],[-34.59557,-58.3882],[-34.59548,-58.38598],[-34.59543,-58.38429],[-34.59568,-58.38429],[-34.59687,-58.38417],[-34.59717,-58.38826],[-34.59587,-58.3884]],"color":"#C542D6"}],"M":[{"nombre":"San Nicolás de Bari","poly":[[-34.59587,-58.3884],[-34.5956,-58.38855],[-34.59557,-58.3882],[-34.59548,-58.38598],[-34.59543,-58.38429],[-34.59568,-58.38429],[-34.59687,-58.38417],[-34.59717,-58.38826],[-34.59587,-58.3884]],"color":"#C542D6"}],"B":[{"nombre":"Esclavas","poly":[[-34.59366,-58.39222],[-34.59275,-58.39106],[-34.59166,-58.38996],[-34.5925,-58.38891],[-34.5932,-58.38994],[-34.59389,-58.38997],[-34.59513,-58.38989],[-34.59502,-58.39208],[-34.59366,-58.39222]],"color":"#C542D6"}],"F":[{"nombre":"Esclavas","poly":[[-34.59366,-58.39222],[-34.59275,-58.39106],[-34.59166,-58.38996],[-34.5925,-58.38891],[-34.5932,-58.38994],[-34.59389,-58.38997],[-34.59513,-58.38989],[-34.59502,-58.39208],[-34.59366,-58.39222]],"color":"#C542D6"}],"I":[{"nombre":"San Agustín","poly":[[-34.58516,-58.40025],[-34.58513,-58.39995],[-34.58759,-58.39728],[-34.58795,-58.39807],[-34.58663,-58.4002],[-34.58593,-58.40128],[-34.58516,-58.40025]],"color":"#C542D6"}],"K":[{"nombre":"La Redonda","poly":[[-34.5611,-58.45768],[-34.56045,-58.45651],[-34.56111,-58.45592],[-34.56335,-58.45403],[-34.56403,-58.45526],[-34.56253,-58.45645],[-34.5611,-58.45768]],"color":"#C542D6"}]},"zonaFrontera":[[-34.58502,-58.45442],[-34.58677,-58.45289],[-34.58893,-58.45082],[-34.59195,-58.44771],[-34.59448,-58.44494],[-34.59673,-58.44259],[-34.59847,-58.44086],[-34.59949,-58.43993],[-34.60027,-58.43814],[-34.60099,-58.43635],[-34.60192,-58.43358],[-34.60247,-58.43066],[-34.6028,-58.42748],[-34.60303,-58.42461],[-34.60334,-58.42128],[-34.60361,-58.41852],[-34.60398,-58.41612],[-34.60435,-58.41368],[-34.60431,-58.41164],[-34.6042,-58.40986],[-34.60455,-58.40699],[-34.6049,-58.40412],[-34.60492,-58.40154],[-34.60488,-58.39901],[-34.60469,-58.39374],[-34.60456,-58.39177],[-34.60446,-58.39025],[-34.60429,-58.38771],[-34.6042,-58.38625],[-34.60413,-58.38486],[-34.60405,-58.38314],[-34.60393,-58.38071],[-34.5988,-58.38102],[-34.59907,-58.38714],[-34.59934,-58.3913],[-34.59943,-58.39601],[-34.59951,-58.39855],[-34.59915,-58.40198],[-34.59784,-58.40431],[-34.59779,-58.40577],[-34.59783,-58.40824],[-34.59777,-58.41069],[-34.59761,-58.41342],[-34.59756,-58.41608],[-34.59755,-58.41911],[-34.59745,-58.42192],[-34.59738,-58.42359],[-34.5969,-58.42483],[-34.59621,-58.42651],[-34.59532,-58.42805],[-34.59461,-58.4291],[-34.59408,-58.43008],[-34.59189,-58.43341],[-34.59129,-58.43433],[-34.58937,-58.43715],[-34.58789,-58.43939],[-34.5866,-58.44126],[-34.58587,-58.4424],[-34.58467,-58.44407],[-34.5838,-58.44569],[-34.58346,-58.44664],[-34.58283,-58.44812],[-34.58246,-58.44909],[-34.58212,-58.45],[-34.58184,-58.45098],[-34.58134,-58.45133],[-34.58057,-58.4501],[-34.58021,-58.45143],[-34.5797,-58.45268],[-34.57914,-58.45457],[-34.57868,-58.45618],[-34.57823,-58.45751],[-34.57799,-58.45963],[-34.57834,-58.46038],[-34.57921,-58.4598],[-34.58189,-58.45731],[-34.58502,-58.45442]]};

// Zonas operativas vigentes desde el 12/10/2026 — 3 sub-zonas (P1 este,
// P1 oeste, P2; P3 y P4 salieron del operativo), puntos neurálgicos
// marcados por gobierno y contornos reales de iglesias (capa "iglesia",
// ya no radio de 700m). Fuente: Umbral0_MAPA_MADRE_9-10-2026.geojson
// (carpeta raíz del proyecto) — exportado del My Maps madre, mid en
// `mapaMadre` más abajo. Si el My Maps cambia, hay que re-exportar el
// GeoJSON y regenerar este bloque (no hay sync automático) — ver
// scratchpad del 12/10/2026 para el script de conversión.
// `poly`/`subzonas[x].poly`: anillo de [lat,lng] (igual convención que el
// esquema histórico). `puntosNeuralgicos[i].geom` es [lat,lng] si es un
// punto, o un anillo de [lat,lng] si el punto neurálgico es en realidad
// una franja (ver "Franja Av. Pueyrredón – Ecuador"). `tipoGeom` dice cuál
// de los dos es. `confirmarUbicacionGobierno:true` marca el único punto
// (Av. Córdoba 1148) cuya ubicación gobierno todavía no confirmó.
// Dupla E: no llegó el link de su My Maps individual — `mymaps` queda sin
// esa clave a propósito, falta completarlo cuando Agustina lo pase.
const ZONAS_OPERATIVAS_UMBRAL_0 = {"porDupla":{"C":{"nombre":"P1 este — Dupla C","poly":[[-34.5991677,-58.3872073],[-34.5992334,-58.3872081],[-34.5991278,-58.3852029],[-34.59902,-58.38512],[-34.5990308,-58.384632],[-34.5987678,-58.3839842],[-34.5990441,-58.384026],[-34.5991277,-58.3833396],[-34.5989977,-58.3823481],[-34.5988923,-58.381135],[-34.5990595,-58.3808621],[-34.5990009,-58.3808631],[-34.5991667,-58.3806873],[-34.5990595,-58.3808621],[-34.6012506,-58.3808262],[-34.6017822,-58.3809764],[-34.6028509,-58.3808404],[-34.6033984,-58.3806258],[-34.6034463,-58.3809459],[-34.603766,-58.3805575],[-34.6036183,-58.3809216],[-34.6037554,-58.3809021],[-34.6036569,-58.3811189],[-34.6036722,-58.3812813],[-34.6038771,-58.3817554],[-34.6038272,-58.3829238],[-34.6041359,-58.3861954],[-34.604274,-58.388],[-34.5992563,-58.388],[-34.5991677,-58.3872073]],"color":"#2563EB","turno":"TURNO 1 · 6-10hs","poligono":"P1 este","nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Av. Córdoba 1148 · Libertad 500 · Uruguay 659. Pasa por sus iglesias y recorre el P1 este (Carlos Pellegrini → Paraná). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea. | Iglesia: El Socorro (desayuno 8hs) + San Nicolás de Bari (lun 9-11 mujeres / jue 9-11 hombres)","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1AbUjWe5Ptw8FZAdRtK3cMp1Xdvq5e1M&usp=sharing","pico":"El Socorro (desayuno 8hs) + San Nicolás de Bari (lun 9-11 mujeres / jue 9-11 hombres)","tipo":"iglesia"},"B":{"nombre":"P1 oeste — Dupla B","poly":[[-34.5993788,-58.3925934],[-34.5993241,-58.3921422],[-34.5993375,-58.3917373],[-34.5992129,-58.3914952],[-34.5993519,-58.3914464],[-34.59927,-58.39048],[-34.5993446,-58.3904028],[-34.5993323,-58.3899035],[-34.5993681,-58.3890003],[-34.5992563,-58.388],[-34.604274,-58.388],[-34.6045635,-58.3917822],[-34.6046167,-58.3919617],[-34.604639,-58.3921989],[-34.6046291,-58.3922324],[-34.6046537,-58.3927679],[-34.6046413,-58.395],[-34.5995115,-58.395],[-34.5993788,-58.3925934]],"color":"#DB2777","turno":"TURNO 1 · 6-10hs","poligono":"P1 oeste","nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Uruguay 659. Pasa por Esclavas y recorre el P1 oeste (Paraná → Ayacucho). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea. | Iglesia: Esclavas (mañana)","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1-Yt_epLPNfnkxJXj9brAYnT3-BUwrM4&usp=sharing","pico":"Esclavas (mañana)","tipo":"iglesia"},"A":{"nombre":"P2 — Dupla A","poly":[[-34.5975991,-58.4044454],[-34.5980732,-58.4036379],[-34.5986725,-58.4027837],[-34.5989118,-58.4014408],[-34.5991698,-58.4008521],[-34.5996001,-58.3968362],[-34.5995855,-58.396344],[-34.5995115,-58.395],[-34.6046413,-58.395],[-34.6046303,-58.3969646],[-34.6047847,-58.3996208],[-34.6048659,-58.4006386],[-34.6053,-58.40073],[-34.6048969,-58.4010271],[-34.6048831,-58.4022046],[-34.6047477,-58.40592],[-34.6047162,-58.4061247],[-34.6047124,-58.406435],[-34.6045387,-58.4075],[-34.597715,-58.4075],[-34.5975991,-58.4044454]],"color":"#059669","turno":"TURNO 1 · 6-10hs","poligono":["P2 este","P2 oeste"],"nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Av. Córdoba e/ Pte. Uriburu y Dr. Luis Pasteur · Franja Av. Pueyrredón – Ecuador (entre Córdoba y Corrientes). Recorre el P2 (Ayacucho → Ecuador). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea.","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1hn8hz7K1zZQSMWRiDwhUszQUNKjTGDE&usp=sharing"},"G":{"nombre":"P1 este — Dupla G","poly":[[-34.5991677,-58.3872073],[-34.5992334,-58.3872081],[-34.5991278,-58.3852029],[-34.59902,-58.38512],[-34.5990308,-58.384632],[-34.5987678,-58.3839842],[-34.5990441,-58.384026],[-34.5991277,-58.3833396],[-34.5989977,-58.3823481],[-34.5988923,-58.381135],[-34.5990595,-58.3808621],[-34.5990009,-58.3808631],[-34.5991667,-58.3806873],[-34.5990595,-58.3808621],[-34.6012506,-58.3808262],[-34.6017822,-58.3809764],[-34.6028509,-58.3808404],[-34.6033984,-58.3806258],[-34.6034463,-58.3809459],[-34.603766,-58.3805575],[-34.6036183,-58.3809216],[-34.6037554,-58.3809021],[-34.6036569,-58.3811189],[-34.6036722,-58.3812813],[-34.6038771,-58.3817554],[-34.6038272,-58.3829238],[-34.6041359,-58.3861954],[-34.604274,-58.388],[-34.5992563,-58.388],[-34.5991677,-58.3872073]],"color":"#60A5FA","turno":"TURNO 1 · 6-10hs","poligono":"P1 este","nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Av. Córdoba 1148 · Libertad 500 · Uruguay 659. Recorre el P1 este (Carlos Pellegrini → Paraná) junto con la Dupla C, y lo cubre mientras la C está en El Socorro o San Nicolás. Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea.","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1xIj5XFuAtls77dLwlwYT0hXYNnc0DSQ&usp=sharing"},"D":{"nombre":"P1 este — Dupla D","poly":[[-34.5991677,-58.3872073],[-34.5992334,-58.3872081],[-34.5991278,-58.3852029],[-34.59902,-58.38512],[-34.5990308,-58.384632],[-34.5987678,-58.3839842],[-34.5990441,-58.384026],[-34.5991277,-58.3833396],[-34.5989977,-58.3823481],[-34.5988923,-58.381135],[-34.5990595,-58.3808621],[-34.5990009,-58.3808631],[-34.5991667,-58.3806873],[-34.5990595,-58.3808621],[-34.6012506,-58.3808262],[-34.6017822,-58.3809764],[-34.6028509,-58.3808404],[-34.6033984,-58.3806258],[-34.6034463,-58.3809459],[-34.603766,-58.3805575],[-34.6036183,-58.3809216],[-34.6037554,-58.3809021],[-34.6036569,-58.3811189],[-34.6036722,-58.3812813],[-34.6038771,-58.3817554],[-34.6038272,-58.3829238],[-34.6041359,-58.3861954],[-34.604274,-58.388],[-34.5992563,-58.388],[-34.5991677,-58.3872073]],"color":"#1D4ED8","turno":"TURNO 2 · 10-14hs","poligono":"P1 este","nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Av. Córdoba 1148 · Libertad 500 · Uruguay 659. Recorre el P1 este (Carlos Pellegrini → Paraná). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea.","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1HpBqfpoxMHfka_6vUktdxurCscYYxkw&usp=sharing"},"F":{"nombre":"P1 oeste — Dupla F","poly":[[-34.5993788,-58.3925934],[-34.5993241,-58.3921422],[-34.5993375,-58.3917373],[-34.5992129,-58.3914952],[-34.5993519,-58.3914464],[-34.59927,-58.39048],[-34.5993446,-58.3904028],[-34.5993323,-58.3899035],[-34.5993681,-58.3890003],[-34.5992563,-58.388],[-34.604274,-58.388],[-34.6045635,-58.3917822],[-34.6046167,-58.3919617],[-34.604639,-58.3921989],[-34.6046291,-58.3922324],[-34.6046537,-58.3927679],[-34.6046413,-58.395],[-34.5995115,-58.395],[-34.5993788,-58.3925934]],"color":"#BE185D","turno":"TURNO 2 · 10-14hs","poligono":"P1 oeste","nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Uruguay 659. Pasa por Esclavas y recorre el P1 oeste (Paraná → Ayacucho). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea. | Iglesia: Esclavas (olla/vianda L-V 10-12)","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=15ERmUZaMhEHcgxu_eXU-wkLlgdar928&usp=sharing","pico":"Esclavas (olla/vianda L-V 10-12)","tipo":"iglesia"},"E":{"nombre":"P2 — Dupla E","poly":[[-34.5975991,-58.4044454],[-34.5980732,-58.4036379],[-34.5986725,-58.4027837],[-34.5989118,-58.4014408],[-34.5991698,-58.4008521],[-34.5996001,-58.3968362],[-34.5995855,-58.396344],[-34.5995115,-58.395],[-34.6046413,-58.395],[-34.6046303,-58.3969646],[-34.6047847,-58.3996208],[-34.6048659,-58.4006386],[-34.6053,-58.40073],[-34.6048969,-58.4010271],[-34.6048831,-58.4022046],[-34.6047477,-58.40592],[-34.6047162,-58.4061247],[-34.6047124,-58.406435],[-34.6045387,-58.4075],[-34.597715,-58.4075],[-34.5975991,-58.4044454]],"color":"#047857","turno":"TURNO 2 · 10-14hs","poligono":["P2 este","P2 oeste"],"nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Av. Córdoba e/ Pte. Uriburu y Dr. Luis Pasteur · Franja Av. Pueyrredón – Ecuador (entre Córdoba y Corrientes). Recorre el P2 (Ayacucho → Ecuador). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea.","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1yU1AQx5Eg-slYnURjl6P3GlRR1-DfCg&usp=sharing"},"H":{"nombre":"P1 este — Dupla H","poly":[[-34.5991677,-58.3872073],[-34.5992334,-58.3872081],[-34.5991278,-58.3852029],[-34.59902,-58.38512],[-34.5990308,-58.384632],[-34.5987678,-58.3839842],[-34.5990441,-58.384026],[-34.5991277,-58.3833396],[-34.5989977,-58.3823481],[-34.5988923,-58.381135],[-34.5990595,-58.3808621],[-34.5990009,-58.3808631],[-34.5991667,-58.3806873],[-34.5990595,-58.3808621],[-34.6012506,-58.3808262],[-34.6017822,-58.3809764],[-34.6028509,-58.3808404],[-34.6033984,-58.3806258],[-34.6034463,-58.3809459],[-34.603766,-58.3805575],[-34.6036183,-58.3809216],[-34.6037554,-58.3809021],[-34.6036569,-58.3811189],[-34.6036722,-58.3812813],[-34.6038771,-58.3817554],[-34.6038272,-58.3829238],[-34.6041359,-58.3861954],[-34.604274,-58.388],[-34.5992563,-58.388],[-34.5991677,-58.3872073]],"color":"#1E40AF","turno":"TURNO 3 · 14-18hs","poligono":"P1 este","nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Av. Córdoba 1148 · Libertad 500 · Uruguay 659. Recorre el P1 este (Carlos Pellegrini → Paraná). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea.","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1CCYM7pKq_BRf5gHUpNiacz38cWhDdzc&usp=sharing"},"L":{"nombre":"P1 oeste — Dupla L","poly":[[-34.5993788,-58.3925934],[-34.5993241,-58.3921422],[-34.5993375,-58.3917373],[-34.5992129,-58.3914952],[-34.5993519,-58.3914464],[-34.59927,-58.39048],[-34.5993446,-58.3904028],[-34.5993323,-58.3899035],[-34.5993681,-58.3890003],[-34.5992563,-58.388],[-34.604274,-58.388],[-34.6045635,-58.3917822],[-34.6046167,-58.3919617],[-34.604639,-58.3921989],[-34.6046291,-58.3922324],[-34.6046537,-58.3927679],[-34.6046413,-58.395],[-34.5995115,-58.395],[-34.5993788,-58.3925934]],"color":"#9D174D","turno":"TURNO 3 · 14-18hs","poligono":"P1 oeste","nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Uruguay 659. Recorre el P1 oeste (Paraná → Ayacucho). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea.","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1v5x_xZRcBc4fmjb0EuXZ302c7qjqffE&usp=sharing"},"I":{"nombre":"P2 — Dupla I","poly":[[-34.5975991,-58.4044454],[-34.5980732,-58.4036379],[-34.5986725,-58.4027837],[-34.5989118,-58.4014408],[-34.5991698,-58.4008521],[-34.5996001,-58.3968362],[-34.5995855,-58.396344],[-34.5995115,-58.395],[-34.6046413,-58.395],[-34.6046303,-58.3969646],[-34.6047847,-58.3996208],[-34.6048659,-58.4006386],[-34.6053,-58.40073],[-34.6048969,-58.4010271],[-34.6048831,-58.4022046],[-34.6047477,-58.40592],[-34.6047162,-58.4061247],[-34.6047124,-58.406435],[-34.6045387,-58.4075],[-34.597715,-58.4075],[-34.5975991,-58.4044454]],"color":"#065F46","turno":"TURNO 3 · 14-18hs","poligono":["P2 este","P2 oeste"],"nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Av. Córdoba e/ Pte. Uriburu y Dr. Luis Pasteur · Franja Av. Pueyrredón – Ecuador (entre Córdoba y Corrientes). Recorre el P2 (Ayacucho → Ecuador) y sube a San Agustín en su horario. Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea. | Iglesia: San Agustín (asistente social L-J 16:30-18:30; merienda mar 16:30-18 mujeres / mié 16:30-18 hombres)","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1xrCUSd_ebRfRHY8TNGbwx9XVu2YBHcs&usp=sharing","pico":"San Agustín (asistente social L-J 16:30-18:30; merienda mar 16:30-18 mujeres / mié 16:30-18 hombres)","tipo":"iglesia"},"M":{"nombre":"P1 este — Dupla M","poly":[[-34.5991677,-58.3872073],[-34.5992334,-58.3872081],[-34.5991278,-58.3852029],[-34.59902,-58.38512],[-34.5990308,-58.384632],[-34.5987678,-58.3839842],[-34.5990441,-58.384026],[-34.5991277,-58.3833396],[-34.5989977,-58.3823481],[-34.5988923,-58.381135],[-34.5990595,-58.3808621],[-34.5990009,-58.3808631],[-34.5991667,-58.3806873],[-34.5990595,-58.3808621],[-34.6012506,-58.3808262],[-34.6017822,-58.3809764],[-34.6028509,-58.3808404],[-34.6033984,-58.3806258],[-34.6034463,-58.3809459],[-34.603766,-58.3805575],[-34.6036183,-58.3809216],[-34.6037554,-58.3809021],[-34.6036569,-58.3811189],[-34.6036722,-58.3812813],[-34.6038771,-58.3817554],[-34.6038272,-58.3829238],[-34.6041359,-58.3861954],[-34.604274,-58.388],[-34.5992563,-58.388],[-34.5991677,-58.3872073]],"color":"#1E3A8A","turno":"TURNO 4 · 18-22hs","poligono":"P1 este","nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Av. Córdoba 1148 · Libertad 500 · Uruguay 659. Recorre el P1 este (Carlos Pellegrini → Paraná); mié y vie pasa por San Nicolás. Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea. | Iglesia: San Nicolás de Bari (mié/vie 19hs a cierre)","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1CpFwal1adIf1jQRfVkGd3p0GcptEqHU&usp=sharing","pico":"San Nicolás de Bari (mié/vie 19hs a cierre)","tipo":"iglesia"},"J":{"nombre":"P1 oeste + P2 este — Dupla J","poly":[[-34.5995855,-58.396344],[-34.5995115,-58.395],[-34.5993788,-58.3925934],[-34.5993241,-58.3921422],[-34.5993375,-58.3917373],[-34.5992129,-58.3914952],[-34.5993519,-58.3914464],[-34.59927,-58.39048],[-34.5993446,-58.3904028],[-34.5993323,-58.3899035],[-34.5993681,-58.3890003],[-34.5992563,-58.388],[-34.604274,-58.388],[-34.6045635,-58.3917822],[-34.6046167,-58.3919617],[-34.604639,-58.3921989],[-34.6046291,-58.3922324],[-34.6046537,-58.3927679],[-34.6046413,-58.395],[-34.6046303,-58.3969646],[-34.6047847,-58.3996208],[-34.604791,-58.3997],[-34.5992932,-58.3997],[-34.5996001,-58.3968362],[-34.5995855,-58.396344]],"color":"#831843","turno":"TURNO 4 · 18-22hs","poligono":["P1 oeste","P2 este"],"nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Av. Córdoba e/ Pte. Uriburu y Dr. Luis Pasteur. Recorre el P1 oeste (Paraná → Ayacucho) y el P2 este (Ayacucho → Dr. Luis Pasteur, incluye la cuadra de Córdoba entre Uriburu y Pasteur). Los miércoles pasa por San Agustín (comida 20:30 hs). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea. | Iglesia: San Agustín (miércoles, comida 20:30 hs)","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1m3-_jF-eBmXnnnasuRxPUH1zSQNHOBo&usp=sharing","pico":"San Agustín (miércoles, comida 20:30 hs)","tipo":"iglesia"},"K":{"nombre":"P2 oeste — Dupla K","poly":[[-34.5980732,-58.4036379],[-34.5986725,-58.4027837],[-34.5989118,-58.4014408],[-34.5991698,-58.4008521],[-34.5992932,-58.3997],[-34.604791,-58.3997],[-34.6048659,-58.4006386],[-34.6053,-58.40073],[-34.6048969,-58.4010271],[-34.6048831,-58.4022046],[-34.6047477,-58.40592],[-34.6047162,-58.4061247],[-34.6047124,-58.406435],[-34.6045387,-58.4075],[-34.597715,-58.4075],[-34.5975991,-58.4044454],[-34.5980732,-58.4036379]],"color":"#064E3B","turno":"TURNO 4 · 18-22hs","poligono":"P2 oeste","nota":"SIEMPRE arrancar el recorrido de cada turno por el punto neurálgico: Franja Av. Pueyrredón – Ecuador (entre Córdoba y Corrientes). Lunes a jueves: recorre el P2 oeste (Dr. Luis Pasteur → Ecuador) todo el turno, incluida la franja Pueyrredón – Ecuador. Viernes: va a La Redonda (ese día su zona no se recorre) desde las 18 (solo atienden a mayores de 40 con DNI). Visita los puntos neurálgicos de su sub-zona y aborda a las personas que vea. | Iglesia: La Redonda (comida L-V 18-19:30, solo mayores de 40 con DNI) — Dupla K: solo viernes — Belgrano, Vuelta de Obligado 2042","mymaps":"https://www.google.com/maps/d/u/2/edit?mid=1c7_eerIl0jCega-QGKxRH2uhh8O5eyI&usp=sharing","pico":"La Redonda (comida L-V 18-19:30, solo mayores de 40 con DNI) — Dupla K: solo viernes — Belgrano, Vuelta de Obligado 2042","tipo":"iglesia"}},"comedores":{"C":[{"nombre":"El Socorro","poly":[[-34.59284,-58.38178],[-34.59265,-58.3816],[-34.59276,-58.37892],[-34.59284,-58.37702],[-34.59416,-58.37759],[-34.5941,-58.37945],[-34.59423,-58.38173],[-34.59284,-58.38178]],"color":"#C542D6","horario":"Desayuno 8hs"},{"nombre":"San Nicolás de Bari","poly":[[-34.59587,-58.3884],[-34.5956,-58.38855],[-34.59557,-58.3882],[-34.59548,-58.38598],[-34.59543,-58.38429],[-34.59568,-58.38429],[-34.59687,-58.38417],[-34.59717,-58.38826],[-34.59587,-58.3884]],"color":"#C542D6","horario":"Lun 9-11 mujeres · jue 9-11 hombres (C) · mié y vie 19hs a cierre (M)"}],"M":[{"nombre":"San Nicolás de Bari","poly":[[-34.59587,-58.3884],[-34.5956,-58.38855],[-34.59557,-58.3882],[-34.59548,-58.38598],[-34.59543,-58.38429],[-34.59568,-58.38429],[-34.59687,-58.38417],[-34.59717,-58.38826],[-34.59587,-58.3884]],"color":"#C542D6","horario":"Lun 9-11 mujeres · jue 9-11 hombres (C) · mié y vie 19hs a cierre (M)"}],"B":[{"nombre":"Esclavas","poly":[[-34.59366,-58.39222],[-34.59275,-58.39106],[-34.59166,-58.38996],[-34.5925,-58.38891],[-34.5932,-58.38994],[-34.59389,-58.38997],[-34.59513,-58.38989],[-34.59502,-58.39208],[-34.59366,-58.39222]],"color":"#C542D6","horario":"Mañana (B) · olla/vianda L-V 10-12 (F)"}],"F":[{"nombre":"Esclavas","poly":[[-34.59366,-58.39222],[-34.59275,-58.39106],[-34.59166,-58.38996],[-34.5925,-58.38891],[-34.5932,-58.38994],[-34.59389,-58.38997],[-34.59513,-58.38989],[-34.59502,-58.39208],[-34.59366,-58.39222]],"color":"#C542D6","horario":"Mañana (B) · olla/vianda L-V 10-12 (F)"}],"I":[{"nombre":"San Agustín","poly":[[-34.58516,-58.40025],[-34.58513,-58.39995],[-34.58759,-58.39728],[-34.58795,-58.39807],[-34.58663,-58.4002],[-34.58593,-58.40128],[-34.58516,-58.40025]],"color":"#C542D6","horario":"Asistente social L-J 16:30-18:30 · merienda mar 16:30-18 mujeres / mié 16:30-18 hombres (toman datos y traen lo pedido a las 2 semanas) (I) · comida mié 20:30 (J)"}],"J":[{"nombre":"San Agustín","poly":[[-34.58516,-58.40025],[-34.58513,-58.39995],[-34.58759,-58.39728],[-34.58795,-58.39807],[-34.58663,-58.4002],[-34.58593,-58.40128],[-34.58516,-58.40025]],"color":"#C542D6","horario":"Asistente social L-J 16:30-18:30 · merienda mar 16:30-18 mujeres / mié 16:30-18 hombres (toman datos y traen lo pedido a las 2 semanas) (I) · comida mié 20:30 (J)"}],"K":[{"nombre":"La Redonda","poly":[[-34.5611,-58.45768],[-34.56045,-58.45651],[-34.56111,-58.45592],[-34.56335,-58.45403],[-34.56403,-58.45526],[-34.56253,-58.45645],[-34.5611,-58.45768]],"color":"#C542D6","horario":"Comida L-V 18 a 19:30 aprox. · domingos vianda en plaza del Ombú (Barrancas). Solo mayores de 40 años, con DNI. Dupla K: solo viernes. Está en Belgrano."}]},"subzonas":{"P1 este":{"nombre":"P1 este · Carlos Pellegrini (9 de Julio incluida) → Paraná","poly":[[-34.5991677,-58.3872073],[-34.5992334,-58.3872081],[-34.5991278,-58.3852029],[-34.59902,-58.38512],[-34.5990308,-58.384632],[-34.5987678,-58.3839842],[-34.5990441,-58.384026],[-34.5991277,-58.3833396],[-34.5989977,-58.3823481],[-34.5988923,-58.381135],[-34.5990595,-58.3808621],[-34.5990009,-58.3808631],[-34.5991667,-58.3806873],[-34.5990595,-58.3808621],[-34.6012506,-58.3808262],[-34.6017822,-58.3809764],[-34.6028509,-58.3808404],[-34.6033984,-58.3806258],[-34.6034463,-58.3809459],[-34.603766,-58.3805575],[-34.6036183,-58.3809216],[-34.6037554,-58.3809021],[-34.6036569,-58.3811189],[-34.6036722,-58.3812813],[-34.6038771,-58.3817554],[-34.6038272,-58.3829238],[-34.6041359,-58.3861954],[-34.604274,-58.388],[-34.5992563,-58.388],[-34.5991677,-58.3872073]],"tramo":"Carlos Pellegrini (9 de Julio incluida) → Paraná"},"P1 oeste":{"nombre":"P1 oeste · Paraná → Ayacucho","poly":[[-34.5993788,-58.3925934],[-34.5993241,-58.3921422],[-34.5993375,-58.3917373],[-34.5992129,-58.3914952],[-34.5993519,-58.3914464],[-34.59927,-58.39048],[-34.5993446,-58.3904028],[-34.5993323,-58.3899035],[-34.5993681,-58.3890003],[-34.5992563,-58.388],[-34.604274,-58.388],[-34.6045635,-58.3917822],[-34.6046167,-58.3919617],[-34.604639,-58.3921989],[-34.6046291,-58.3922324],[-34.6046537,-58.3927679],[-34.6046413,-58.395],[-34.5995115,-58.395],[-34.5993788,-58.3925934]],"tramo":"Paraná → Ayacucho"},"P2":{"nombre":"P2 · Ayacucho → Ecuador","poly":[[-34.5975991,-58.4044454],[-34.5980732,-58.4036379],[-34.5986725,-58.4027837],[-34.5989118,-58.4014408],[-34.5991698,-58.4008521],[-34.5996001,-58.3968362],[-34.5995855,-58.396344],[-34.5995115,-58.395],[-34.6046413,-58.395],[-34.6046303,-58.3969646],[-34.6047847,-58.3996208],[-34.6048659,-58.4006386],[-34.6053,-58.40073],[-34.6048969,-58.4010271],[-34.6048831,-58.4022046],[-34.6047477,-58.40592],[-34.6047162,-58.4061247],[-34.6047124,-58.406435],[-34.6045387,-58.4075],[-34.597715,-58.4075],[-34.5975991,-58.4044454]],"tramo":"Ayacucho → Ecuador"},"P2 este":{"nombre":"P2 este · Ayacucho → Dr. Luis Pasteur (turno noche)","poly":[[-34.5996001,-58.3968362],[-34.5995855,-58.396344],[-34.5995115,-58.395],[-34.6046413,-58.395],[-34.6046303,-58.3969646],[-34.6047847,-58.3996208],[-34.604791,-58.3997],[-34.5992932,-58.3997],[-34.5996001,-58.3968362]],"tramo":"Ayacucho → Dr. Luis Pasteur (turno noche)"},"P2 oeste":{"nombre":"P2 oeste · Dr. Luis Pasteur → Ecuador (turno noche)","poly":[[-34.5980732,-58.4036379],[-34.5986725,-58.4027837],[-34.5989118,-58.4014408],[-34.5991698,-58.4008521],[-34.5992932,-58.3997],[-34.604791,-58.3997],[-34.6048659,-58.4006386],[-34.6053,-58.40073],[-34.6048969,-58.4010271],[-34.6048831,-58.4022046],[-34.6047477,-58.40592],[-34.6047162,-58.4061247],[-34.6047124,-58.406435],[-34.6045387,-58.4075],[-34.597715,-58.4075],[-34.5975991,-58.4044454],[-34.5980732,-58.4036379]],"tramo":"Dr. Luis Pasteur → Ecuador (turno noche)"}},"puntosNeuralgicos":[{"nombre":"Av. Córdoba 1148","poligono":"P1","geom":[-34.5995,-58.3845],"tipoGeom":"Point","confirmarUbicacionGobierno":true},{"nombre":"Libertad 500","poligono":"P1","geom":[-34.6021,-58.3838],"tipoGeom":"Point"},{"nombre":"Uruguay 659","poligono":"P1","geom":[-34.601,-58.3864],"tipoGeom":"Point"},{"nombre":"Av. Córdoba e/ Pte. Uriburu y Dr. Luis Pasteur","poligono":"P2","geom":[-34.5998,-58.3982],"tipoGeom":"Point"},{"nombre":"Franja Av. Pueyrredón – Ecuador (entre Córdoba y Corrientes)","poligono":"P2","geom":[[-34.6047477,-58.40592],[-34.6047162,-58.4061247],[-34.6047124,-58.406435],[-34.6045387,-58.4075],[-34.597715,-58.4075],[-34.5976277,-58.4052],[-34.6047739,-58.4052],[-34.6047477,-58.40592]],"tipoGeom":"Polygon"}],"mapaMadre":"https://www.google.com/maps/d/u/2/edit?mid=1gPHndH1niMfG12t2vIOWNBD0zHvGU-k&usp=sharing"};
window.PROJECT_CONFIG_UMBRAL_0.zonasOperativas = ZONAS_OPERATIVAS_UMBRAL_0;

})();
