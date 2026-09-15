# Umbral 0 — Diseño de gestión de casos (ingreso → acompañamiento → egreso)

Este documento es el diseño de las pantallas de Umbral 0 que todavía no están
construidas: alta de caso (ingreso), pedido de derivación y acompañamiento
(seguimiento) hasta el egreso. Se basa en el documento institucional del
programa (Buenos Aires, 27/07/2026 — versión completa) y en el esquema ya
aplicado en Supabase (proyecto `qwnrdclaeaskoyskbqff`, cuenta
`a.jait@inclusioncaii.org`).

Lo que **ya está construido**: el modelo de datos completo (6 tablas +
`perfiles` de roles + políticas RLS + bucket de fotos) y la pantalla
`admin-duplas.html` (alta/edición de duplas, integrantes y choferes). Lo que
sigue acá es diseño, a construir en los próximos pasos.

> Esta versión reemplaza a la anterior: incorpora el texto completo del
> documento de Umbral 0 (objetivos, población, circuitos de CIS/Casas
> Vinculares/Micros con sus formularios exactos, glosario de herramientas y
> circuitos operativos) que antes estaba resumido. Las secciones 1 y 2 (ya
> construidas) no cambian.

## 0. Marco del programa (resumen)

**Por qué existe Umbral 0:** llegar a personas en situación de calle con alta
desvinculación de la Red de Atención — que no confían, no sostienen o
rechazan los dispositivos formales, aun en escenarios de alta vulnerabilidad
(indicadores de pulsión de muerte, conductas autodestructivas, desvinculación
de proyectos de vida y redes de sostén). El eje no es "captar demanda" sino
construir condiciones para que esa demanda exista con el tiempo: presencia
territorial sostenida, escucha activa, trato digno, sin condicionar la
escucha a aceptar recursos o derivaciones. Umbral 0 es un eslabón inicial de
la Red, no un reemplazo de los dispositivos existentes.

**Objetivo general:** incidir en las trayectorias de las personas en
situación de calle mediante acompañamiento que facilite su acceso y
permanencia en los dispositivos estatales de protección social.

**Objetivos específicos:** detectar/contactar población no vinculada;
sostener vínculo con presencia reiterada y trato digno; escucha activa y
contención emocional sin condicionalidad; identificar riesgos sociales,
sanitarios o de salud mental; orientar y acompañar gradualmente hacia
recursos (cuidando que la derivación sea posible y sostenible, no solo
informativa); y construir información territorial cualitativa que
retroalimente la planificación de la Red.

**Población destinataria:** mayores de 18 años en situación de calle o
extrema precariedad, fuera del alcance efectivo de las políticas públicas
(sin registro, sin vínculo, o con rechazos persistentes a la
institucionalidad). Se prioriza trayectorias de calle prolongadas, vínculo
institucional intermitente/inexistente, alta desorganización psicosocial, o
consumo activo.

**Zonas prioritarias:** C1A, C2, C14, C13 y "zona frontera" (límite de estas
comunas con C15, C5 y C3). También iglesias emplazadas en C2 y la población
que las frecuenta. El mapeo detallado de zona frontera + puntos flash está
pendiente (lo suma Flor Pedraza — ver sección 10).

Esto no se modela con una tabla nueva por ahora: `personas.zona` y
`personas.comuna` (ya en el modelo, sección 4) alcanzan para filtrar y
reportar. Si hace falta marcar explícitamente "está dentro de zona
prioritaria" como filtro de gestión, se agrega más adelante como campo
booleano o derivado de la comuna.

## 1. Autenticación y roles (ya implementado)

Umbral 0 no usa la contraseña compartida de Censo Flash. Cada persona tiene
una cuenta real de Supabase Auth (email + contraseña), y su rol vive en
`perfiles.rol`:

| Rol | Quién | Puede |
|---|---|---|
| `admin` | vos / equipo de plataforma | todo, en todos los proyectos |
| `coordinacion` | Gerencia Operativa de Primer Abordaje | alta/baja de duplas y equipo, carga y edición de todos los casos, ve todo |
| `dupla` | operador/a de un equipo territorial | carga casos e intervenciones, pero solo ve/edita lo de **su propia dupla** (`perfiles.dupla_id`) |
| `cliente` | GCBA / Dg Red de Atención | solo lectura de todos los casos (para reporting), no ve el roster de duplas/choferes |

**Corrección (sept/2026):** `personas` era la única tabla de casos sin este
scope aplicado de verdad — `intervenciones`/`derivaciones`/`seguimientos`
ya restringían a cada dupla a lo suyo, pero cualquier cuenta de dupla
podía ver y editar los casos (fichas de persona) de TODAS las demás.
Encontrado al revisar el acceso antes de habilitar el equipo completo.
Se agregó `personas.dupla_id` (quién dio de alta el caso) con el mismo
patrón que ya usaban las otras tablas (`schema-ajustes.sql`, migración
`personas_dupla_id_y_rls`). **Limitación conocida** que queda de esto: si
dos duplas distintas se cruzan con la misma persona (se mudó de zona,
cobertura de iglesia superpuesta), la segunda no la va a encontrar al
buscar por DNI/nombre y puede terminar dándola de alta de nuevo (caso
duplicado) — el plan de zonas exclusivas lo hace poco frecuente pero no
lo elimina. Ver sección 11.

Para `admin`/`coordinacion`, las cuentas propias se siguen creando desde el
**Supabase Dashboard → Authentication → Add user** (son pocas). Para las
duplas (una cuenta por dupla, compartida entre sus 2 integrantes — ver
sección 2) hay un flujo self-service: el botón **"🔑 Crear acceso"** en
`admin-duplas.html`, que da de alta el login sin pasar por el dashboard.
También existe **"⚡ Crear accesos faltantes"** (sept/2026) al lado de "+
Nueva dupla": hace lo mismo que "🔑 Crear acceso" pero para TODAS las
duplas activas sin login de una sola vez, con contraseña fija `123456`
para todas — pensado para el alta inicial del equipo completo. Muestra la
lista antes de confirmar y un resumen ✅/❌ al final (si una falla, sigue
con las demás).

**Primer login de una dupla** (`casos.html`, sept/2026): antes de entrar a
la app, si a algún integrante de la dupla le falta nombre, apellido, DNI
o teléfono (`integrantes.nombre`/`apellido`/`dni`/`telefono`), se le pide
completarlo — es obligatorio, no se puede pasar de largo, pero se
resuelve solo (una vez cargados los 4 datos de cada integrante, no vuelve
a aparecer). El alta masiva de accesos (arriba) crea 2 integrantes en
blanco por dupla nueva para que este gate siempre tenga algo concreto que
mostrar. Requirió agregar una política de RLS para que una cuenta de
dupla pueda actualizar (no solo leer) los integrantes de su propia dupla
— antes solo podía admin/coordinación (`schema-ajustes.sql`, migración
`integrantes_update_propia_dupla`). El test de onboarding (10 preguntas
sobre el protocolo) dejó de ser obligatorio en el primer login — ahora es
**opcional**, accesible desde "🎓 Test" en el topbar de `casos.html`
cuando la dupla quiera hacerlo.

## 2. Pantalla: Duplas y equipo — `admin-duplas.html` (ya construida)

Login con cuenta Supabase → si el rol es `admin`/`coordinacion`, lista de
duplas (código, zona, polígono, comuna, turno, mapa de My Maps, detalle,
si es referente de su turno) con sus hasta 2 integrantes editables inline,
más una sección aparte de choferes (sin zona fija). Todo contra las tablas
`duplas`/`integrantes`, protegido por RLS. Ordenada por turno y código.

**Turno/mapa/detalle/referente** (sept/2026, `Umbral0_Plan_Final.docx`):
plan fijo de 13 duplas (A a M) + 1 referente general sin dupla fija, en 4
turnos de 4hs (T1 6-10, T2 10-14, T3 14-18, T4 18-22) — cada dupla trabaja
un único turno, con su zona/iglesia y mapa de My Maps propios; una dupla
por turno además es "referente" (rol dentro de la misma dupla, no suma
gente). Estos 4 campos aparecen también del lado de la dupla: al loguearse
en `casos.html`, un panel "Mi turno de hoy" le muestra su zona, horario,
detalle (horarios de comedor/asistencia si es dupla de iglesia) y el botón
para abrir su mapa (`casos.html`, función `mostrarMiTurno()`). El "referente general"
(persona 27, sin dupla fija) no está modelado todavía — no hay dónde
cargarlo hasta que se defina si necesita su propia cuenta o alcanza con un
integrante suelto (`dupla_id = null`).

**Jornada de hoy (inicio/fin)** (sept/2026): debajo de "Mi turno de hoy",
un panel simple con un botón "▶️ Marcar inicio de jornada" y, una vez
tocado, "⏹️ Marcar fin de jornada" — una fila por dupla por día en la
tabla `jornadas` (`casos.html`, funciones `cargarJornadaHoy()` /
`mostrarJornada()` / `marcarInicioJornada()` / `marcarFinJornada()`). Como
el login sigue siendo por dupla y no por persona, alcanza con que
cualquiera de los dos integrantes lo marque desde esa cuenta compartida —
no hace falta modelar "quién de los dos" lo hizo. Sin uso todavía del
lado de admin/coordinación (no hay una vista que liste qué duplas ya
marcaron su jornada del día) — queda abierto en la sección 11 si se
necesita más adelante para seguimiento de asistencia.

**Acceso de la dupla (una cuenta por dupla, no por integrante):** cada card
de dupla tiene una sección de "Acceso" — si todavía no tiene login, un botón
"🔑 Crear acceso" abre un formulario con un email sugerido por convención
(`<código-en-minúscula>@umbral0.app`, ej. `u01@umbral0.app` — es un email
inventado, no recibe correo real, solo sirve para loguearse) y un campo de
contraseña que define quien administra. Al guardar:
1. Crea la cuenta en Supabase Auth (`SupabaseClient.crearCuenta`, usa un
   cliente secundario con storage aislado para no pisar la sesión de
   admin/coordinación que está haciendo el alta).
2. Inserta la fila en `perfiles` (`rol='dupla'`, `dupla_id`, `nombre`, `email`)
   con el cliente principal — esto requiere las políticas de RLS agregadas en
   `schema-ajustes.sql` que permiten a admin/coordinación escribir el perfil
   de otra cuenta (por defecto RLS solo deja a cada quien tocar su propio
   perfil).

Limitaciones conocidas de este flujo (por no usar la service_role key, que
nunca debe vivir en el cliente):
- **Hace falta desactivar "Confirm email" una sola vez** en el proyecto de
  Supabase (Authentication → Providers → Email), si no la cuenta queda creada
  pero no puede loguearse hasta confirmar un mail que, al ser inventado, nunca
  va a llegar. Ver el aviso en `schema-ajustes.sql`.
- **Resetear la contraseña de una dupla no se puede hacer desde esta
  pantalla** — hay que hacerlo desde el Supabase Dashboard directamente
  (Authentication → Users → el usuario → reset password), porque eso sí
  requiere permisos de administración que la anon key no tiene.

Pendiente sobre esto (no bloquea el resto): los **referentes de zona**
(Ilanit Álvarez, Natasha Forcinito, Luna Aloy) no están modelados todavía —
ver sección 10.

## 3. Glosario: herramientas de registro actuales y cómo conviven con la plataforma

El documento describe cuatro herramientas de registro que el equipo usa hoy,
por fuera de esta plataforma. Ninguna desaparece de un día para el otro — la
plataforma va absorbiendo funciones a medida que se construye:

| Herramienta actual | Qué es hoy | Rol en Umbral 0 (esta plataforma) |
|---|---|---|
| **Kobo** | Formulario de registro de intervenciones en territorio, **carácter obligatorio** según GOPA (documento 27/07/2026) — un envío por cada persona contactada en el recorrido | **Se mantiene en paralelo, no se reemplaza.** Es el registro crudo que ve gobierno directamente; el link (`config.koboFormLink`) está enganchado bien visible en el portal y en `casos.html`. La plataforma NO lee sus datos (no hay conexión por API todavía) — el reporte semanal (§9) se calcula de lo que la dupla carga acá, por eso hace falta cargar los dos. |
| **Grupo de WhatsApp de equipos territoriales** | Los operadores envían sus intervenciones ahí; coordinación y Gerencia Operativa ven en vivo qué pasa en territorio, despejan dudas, gestionan estrategias | No se reemplaza — es el canal de comunicación en caliente. La plataforma es el registro estructurado que **queda después** de esa conversación, no la reemplaza como canal. |
| **Planilla de seguimiento** | Coordinación consolida en una base de datos la info que le llega por WhatsApp, y arma a mano el reporte semanal para GOPA | Esto es lo que reemplaza esta plataforma: las tablas `personas`/`intervenciones`/`derivaciones`/`seguimientos` son la base de datos, y la pestaña "📊 Reporte semanal" de `admin-duplas.html` (§9) calcula el reporte semanal automático en vez de armarlo a mano. |
| **Cartas de soflex** | Instrumento que generan los operadores en una herramienta externa (no en esta plataforma) | No se migra ni se replica el formulario acá — se suma como **link directo** desde la ficha de persona (ver sección 4), para que el equipo salga a esa herramienta externa sin tener que buscarla. |

## 4. Pantalla: Nuevo ingreso / Ficha de persona

**Objetivo:** registrar a una persona en situación de calle la primera vez que
el equipo la contacta, y dejar un lugar único (la "ficha") donde se acumula
todo lo que pasa con ella en el tiempo.

**Flujo:**
1. **Buscar antes de crear** — campo de búsqueda por nombre/apellido/DNI contra
   `personas`, para no duplicar a alguien que ya está en seguimiento. Si
   aparece, va directo a su ficha (paso 3).
   - **Orden de la lista (sept/2026):** por `ultima_actividad` ascendente
     (el caso que hace más tiempo que nadie toca aparece primero), no
     alfabético — antes un caso cargado ayer quedaba mezclado
     alfabéticamente con el resto y era fácil perderlo de vista para el
     seguimiento del día siguiente. Sale de la vista `personas_actividad`
     (ver `schema-ajustes.sql`), que agrega `ultima_actividad` = lo más
     reciente entre el alta y cualquier intervención/seguimiento/
     derivación de esa persona. Los casos activos que llevan 1 día o más
     sin ningún movimiento muestran un badge "⏰ hace X días sin
     seguimiento" en la tarjeta.
   - **Badge "Dupla X" (sept/2026):** admin/coordinación ven las 13 duplas
     mezcladas en la misma lista de búsqueda (RLS les deja ver todos los
     casos) — la tarjeta les muestra de qué dupla es cada uno. Una cuenta
     de dupla no lo ve (siempre son los suyos, sería redundante).
   - **Filtro por dupla (sept/2026):** selector "Todas las duplas" al lado
     del buscador, mismo criterio que el badge de arriba — solo visible
     para admin/coordinación (`mostrarFiltroDupla()`), armado con las
     duplas activas (`duplas.activa = true`, para no listar duplas de
     prueba/dadas de baja). Filtra por `dupla_id` además del texto
     buscado — se puede combinar los dos (ej. "Dupla F" + "González").
2. **Si es nueva persona**, formulario de alta → inserta en `personas`:
   - Datos básicos: `nombre`, `apellido`, `dni` (o `dni_denuncia_extravio` si no
     tiene y hay que acompañar a hacer la denuncia — igual que el circuito de
     DNI del documento), `fecha_nacimiento`, `nacionalidad`, `telefono_contacto`.
   - **`sin_identificar`** (sept/2026): si la persona no quiere dar su nombre,
     este checkbox saca la obligatoriedad de `nombre`/`apellido` — a cambio
     exige `punto_contacto`, para que quede al menos dónde se la encontró.
     Sin esto, la dupla no tenía forma de registrar la intervención en la
     plataforma si la persona no se identificaba (situación esperada, no una
     excepción — el propio Nivel 1 del modelo de vínculo contempla que
     todavía no haya pasado eso). En listas/ficha se muestra como "Persona
     sin identificar" (`nombreDisplay()`) en vez de un nombre en blanco.
   - Ubicación: `punto_contacto` (dirección/referencia libre), `zona`
     (desplegable con `config.zonasOpciones` — hoy: C1A, C2, C14, C13, Zona
     frontera, las zonas prioritarias del documento; editable sin tocar
     código), `comuna`.
   - `foto_url` — subida al bucket privado `umbral0-fotos` (mismo patrón que
     Censo Flash con Drive, pero acá es un bucket de Supabase Storage).
   - `criticidad` — select con las opciones de `config.criticidadOpciones`
     (hoy: Baja/Media/Alta, editable sin tocar código).
   - `consumo_activo` (sí/no) — condiciona más adelante si puede ir a Micro o CIS.
   - `historia_breve` — texto libre.
   - Al guardar, además de la fila en `personas`, se crea automáticamente la
     primera fila en `intervenciones` (`tipo='contacto_espontaneo'` o
     `'seguimiento'`, `dupla_id` = la dupla logueada) — así el ingreso también
     queda como el primer evento del timeline.
   - **Contacto espontáneo con alta mínima:** el documento describe el caso de
     alguien que el equipo aborda por primera vez y pide ingreso a CIS *ahí
     mismo*, sin ser un seguimiento previo. Para ese caso el alta no tiene que
     estar completa — se cargan los campos que se puedan relevar en el momento
     (al menos nombre/apellido/DNI o denuncia) y se completa después. Un flag
     `es_seguimiento` (sí/no, o derivado de si tiene más de una intervención)
     distingue esto de un caso con vínculo sostenido, porque varios recursos
     (Casa Vincular, ver 5.2) solo están habilitados para seguimientos.
3. **Ficha de la persona** (pantalla principal del caso): cabecera con los
   datos de arriba + foto, y debajo botones de acción:
   - **Legajo** (sept/2026, pedido de Agustina: "el caso tiene que tener
     info") — antes de esto, toda la info cargada (a mano o precargada
     desde KoBo — §4 más abajo, "KoBo pendientes") solo se podía ver
     abriendo "✏️ Editar" (un formulario) — así que una ficha con datos
     reales se veía prácticamente vacía a simple vista, con la cabecera
     y un timeline de una sola línea ("Ingreso inicial del caso."). Ahora
     hay una sección de solo lectura, `Casos._renderLegajo()`, agrupada
     igual que el formulario de alta (Datos básicos/Ubicación/Datos del
     caso/Salud/Informe social) — reusa los mismos `CAMPOS_PERSONA_*`
     (mismas etiquetas que el formulario, no hay que mantenerlas en dos
     lugares) y solo muestra los campos que tienen algo cargado, nunca
     una fila vacía. Nombre/apellido y los checkbox (ya son badges en la
     cabecera) no se repiten acá.
   - ➕ Registrar intervención (otro contacto en territorio)
   - 📨 Pedir derivación (abre el formulario dinámico de la sección 5)
   - 📝 Agregar seguimiento (comentario o ítem de checklist, sección 6)
   - 📄 Generar carta de soflex — **link externo**, no un formulario propio.
     Abre `config.cartasSoflexLink` en pestaña nueva (mismo patrón que los
     links de My Maps/KoBo en `index.html`). No queda registro automático en
     el timeline de que se generó una carta — si hace falta trazabilidad de
     esto más adelante, se agrega como un ítem de checklist manual (sección 6)
     o una intervención que el equipo carga a mano después de generarla.
   - 🚨 Avisar a coordinación (sept/2026) — 3 situaciones que necesitan un
     aviso inmediato por WhatsApp, no esperar al reporte semanal (pedido
     de Agustina). Abre un modal con hasta 3 botones, cada uno un link
     `wa.me` con el mensaje ya armado (dupla + nombre + zona/punto de
     contacto) — la dupla lo revisa y lo manda, no se envía solo:
     - **📟 Handy rojo** — contactos espontáneos (sin seguimiento previo)
       que piden ingreso a CIS ahí mismo. Número fijo
       (`config.contactosUrgentes.handyRojo`).
     - **🧠 Coordinación Umbral Cero — Salud Mental** y **👨‍👩‍👧 — Familias en
       riesgo** (para derivar al Mapa de Familias en Riesgo) — mismo
       destinatario para las dos, pero el número **rota por turno**
       (`config.contactosUrgentes.coordUmbral0Turnos`, `desde`/`hasta` en
       hora local — a diferencia de los turnos de las duplas, que son de
       a 4hs, T1-T4). Si todavía no está cargado el turno de esa hora, el
       botón queda deshabilitado con un aviso de "avisale a Agustina
       directo" en vez de fallar en silencio o mandar al número
       equivocado. Cargado hasta ahora: 6-14hs y 14-22hs (mismo número
       para las dos). **TODO:** falta confirmar si el turno 22-6hs lo
       cubre alguien y con qué número.
     - Visible para cualquier cuenta de dupla, en cualquier ficha (no
       solo la referente del turno) — son situaciones que puede encontrar
       cualquier equipo en el territorio, restringirlo agregaría demora
       justo en el momento urgente.
     - No queda registro en el timeline del caso — es un aviso puntual,
       no un tipo de intervención/derivación nuevo.

   Debajo, un **timeline cronológico** que mezcla `intervenciones` +
   `derivaciones` + `seguimientos` de esa persona (`order by fecha desc`). El
   timeline es también donde se ve el historial de derivaciones previas de la
   persona (egresos anteriores, rechazos) — relevante para Casa Vincular, que
   prioriza a quienes tuvieron reiterados egresos o egresos negativos de otros
   dispositivos (ver 5.2).

**Eliminar caso** (sept/2026, `casos.html`, botón "🗑️ Eliminar caso" en la
ficha) — solo visible para `admin` (coincide con la política de RLS: ni
`coordinacion` puede borrar `personas`/`intervenciones`/`derivaciones`/
`seguimientos`). Borra la persona y, por FK en cascada, todo su historial
— irreversible, por eso pide escribir el nombre completo tal cual para
confirmar, no un simple "¿estás segura?". Se corrigió de paso la FK de
`intervenciones.persona_id` (estaba en `SET NULL`, a diferencia de
derivaciones/seguimientos que ya eran `CASCADE`) — si no, borrar un caso
dejaba intervenciones huérfanas dando vueltas para siempre, sumando igual
en el conteo del reporte semanal (ver `schema-ajustes.sql`).

**"KoBo pendientes" — pre-completar el alta desde KoBo** (sept/2026,
`casos.html`, caja arriba del buscador, solo cuentas de dupla) — primer
paso para reducir la doble carga que pidió Agustina (cargar KoBo Y la
ficha acá). Al entrar, lee los envíos de KoBo de la propia dupla
(matcheo operador→dupla igual que en §10.1, pero acá restringido a los 2
integrantes de la cuenta logueada) y compara el DNI de cada envío contra
los DNI ya cargados como caso por esa dupla. Los que traen DNI y ese DNI
todavía no es un caso, aparecen como tarjetas "📥 envío pendiente" con un
botón "✅ Confirmar y cargar caso" que abre el alta de siempre con
nombre/apellido/DNI ya completos — la dupla revisa/completa el resto
(zona, criticidad, etc.) en vez de tipear todo de cero.

- **Por qué solo con DNI:** es el único dato que permite saber con
  confianza "esto ya es un caso" vs "esto es alguien nuevo" — matchear
  por nombre solo es demasiado arriesgado para automatizarlo (puede
  mezclar el historial de dos personas distintas). Los envíos sin DNI
  siguen cargándose a mano, como siempre — es la situación esperada de
  "sin identificar" (más arriba en esta sección).
- **No hace falta "descartar" nada:** apenas se confirma un pendiente, su
  DNI pasa a existir en `personas` y deja de aparecer en la lista — se
  resuelve solo, sin estado nuevo que mantener.
- Reusa `netlify/functions/kobo-proxy.js` (mismo proxy de CORS que la
  vista de dashboard.html, ver §10.1).
- **Prefill ampliado (sept/2026):** además de nombre/apellido/DNI, ahora
  también precarga `fecha_nacimiento` y `nacionalidad` cuando el envío es
  de tipo "Primer Acercamiento" (esa rama del formulario sí las pide). Un
  "Seguimiento" no vuelve a preguntar la fecha de nacimiento de una
  persona ya conocida, así que ahí ese campo queda vacío y se completa a
  mano, como siempre — no se inventa una fecha a partir de la edad
  aproximada.
- **Bug corregido de paso:** `parseUmbral0()` solo leía la identificación
  de la rama "Primer Acercamiento" (`nivel1_intro/nivel1_datos/...`) — un
  envío de tipo "Seguimiento" (que usa preguntas distintas,
  `nombre_segui`/`apellido_segui`/`dni_segui`) quedaba sin nombre ni DNI
  reconocidos, así que nunca aparecía en "KoBo pendientes" ni contaba
  bien en el dashboard de coordinación. Se agregó `campoSufijo()`, que
  matchea por el nombre corto de la pregunta en vez de por la ruta
  completa del grupo (confirmado contra un export real en formato
  "XML values", no adivinado) — cubre las dos ramas sin tener que
  duplicar la lógica.
- **Prefill ampliado a (casi) todo lo que pregunta KoBo** (sept/2026):
  además de identidad, "Confirmar y cargar caso" ahora también precarga
  — solo cuando el envío es "Primer Acercamiento", que es la rama que
  releva todo esto —:
  - `estado_salud`, `consumo_activo`, `acepta_entrevista` (campos
    directos de "Datos del caso"/"Salud").
  - `historia_breve`: combina la descripción física, la observación
    general, el motivo de calle en texto libre y las notas de cierre del
    equipo (características/observación/motivos/estrategias/devolución),
    como párrafos separados.
  - `situacion_habitacional`, `situacion_economica`, `situacion_educativa`,
    `redes_contencion`, `situacion_sanitaria`: cada una combina varias
    preguntas puntuales de KoBo en líneas "Pregunta: respuesta" (ver
    `lineasKobo()`/`parrafosKobo()` en casos.html) — no existe una
    pregunta de KoBo por cada campo de Casos, así que se arma un resumen
    legible en vez de mapear 1 a 1.
  - Las secciones colapsables "Salud y antecedentes" e "Informe social"
    del formulario de alta arrancan **abiertas** cuando vienen con datos
    precargados (para que no pase desapercibido que hay texto ahí
    adentro) — en una edición común siguen colapsadas, como siempre.
  - Nada de esto es definitivo: es un punto de partida que la dupla
    revisa y edita antes de guardar, no un dato ya validado.
  - En un "Seguimiento" casi todo esto queda vacío (esa rama solo
    re-confirma identidad de una persona ya conocida) — se completa a
    mano, como siempre.
- **Corrección de tipo de documento:** `documento_numero` de la rama
  "Primer Acercamiento" solo se toma como DNI cuando el tipo de
  documento elegido en KoBo (`tipo_doc`) efectivamente es DNI — antes se
  asumía siempre, aunque la persona hubiera dado otro tipo de documento
  (ej. pasaporte).
- **Todavía no cubre:** envíos sin DNI, ni zona/criticidad/nivel de
  vínculo (no hay pregunta de KoBo equivalente a estos, son criterio del
  equipo) — reducir eso más es la fase grande que sigue abierta (§11).

**Vista de solo lectura para admin/coordinación** (sept/2026,
`admin-duplas.html`, pestaña "Duplas y equipo") — mismo cálculo pero de
todas las duplas a la vez, para que Agustina pueda ver el estado general
sin entrar cuenta por cuenta. A propósito **no tiene botón de confirmar**:
el alta tiene que quedar con el `dupla_id` de la dupla que realmente hizo
el contacto, así que quien confirma sigue siendo cada dupla desde su
cuenta en Casos — esto es solo para detectar "hace días que esta dupla
tiene pendientes sin cargar" y poder avisarles. El chequeo de "¿ya es un
caso?" es correctamente por dupla (no global): si dos duplas distintas
cargan el mismo DNI a KoBo, cada una ve su propio pendiente — es el
mismo caso "duplicados entre duplas" ya documentado más abajo (§11), no
algo nuevo que esto introduzca.

## 5. Pantalla: Pedir derivación

Un botón "Pedir derivación" abre un selector de `tipo` (las opciones de
`config.derivacionOpciones`). Según el tipo elegido, el formulario cambia —
los campos van al `jsonb` `derivaciones.datos`, así no hace falta una tabla
con columnas que no aplican a todos los tipos. Al guardar: siempre
`derivaciones.estado = 'solicitado'`, y avanza manualmente
(`en_espera` → `aprobado`/`rechazado` → `efectivizado`) a medida que llega la
respuesta por los canales actuales del programa. Replicar esos canales
(Forms, grupo Derivaciones DIPA, documento de derivadoras, grupo de Casas
Vinculares) **dentro** de la plataforma es un paso futuro, no de esta
iteración — hoy coordinación/admin actualiza el estado a mano.

Nota sobre el listado de tipos: el config actual (`umbral-0.js`) tiene
`['DIPA', 'Micro', 'Hacer DNI', 'Médico', 'Centro de día', 'CIS']` — **le
falta `Casa Vincular`**, que está diseñado abajo (5.2) y ya tiene su propio
formulario. Sumarlo al array es un cambio de una línea, sin tocar el resto
del código.

### 5.1 CIS (Centro de Inclusión Social)

Es el recurso más armado del documento, con un circuito de varios pasos:

**Cuándo se usa:** dos escenarios, y el documento los describe de forma algo
contradictoria — vale la pena chequear con Agustina cuál es la regla real
(ver sección 10):
- *Contacto espontáneo:* el equipo aborda a alguien fuera de su seguimiento
  habitual, que pide ingresar a un CIS ahí mismo.
- *Seguimiento propio* que pide ingresar.
- En otra parte del documento (glosario) dice que "los ingresos a CIS... se
  realizan siempre y cuando la persona sea seguimiento del área" — lo cual
  parece contradecir el primer escenario. Diseñamos igual para ambos casos
  (con el flag `es_seguimiento` de la sección 4) hasta que se aclare.

**Campos del formulario** (`derivaciones.datos`, tipo `CIS`) — varios ya
están en `personas` y se auto-completan, el formulario solo pide lo que falta
o cambió:

- Punto de contacto (dirección exacta donde está la persona) — de `personas.punto_contacto`
- Nombre y apellido, fecha de nacimiento, edad — de `personas`
- Tiene DNI: sí / no (si no, denuncia de extravío) — de `personas.dni` / `dni_denuncia_extravio`
- Estado de salud
- Medicación (lo más detallado posible)
- Esquema (de medicación/tratamiento)
- Puede subir escaleras: sí / no
- Puede cama arriba: sí / no
- Estuvo en algún CIS antes: sí — ¿cuál? / no
- Resumen de la intervención: hace cuánto está en situación de calle, motivo,
  redes de contención socio-familiar, instituciones comunitarias con las que
  se relaciona
- **Foto del DNI o de la denuncia de extravío — obligatoria.** El documento es
  explícito: "no se realizan ingresos sin estos". Si la persona no tiene
  ninguno, el equipo primero acompaña a hacer la denuncia de extravío en la
  comisaría más cercana (esto se registra como intervención/seguimiento, no
  bloquea el resto de la ficha).

**Circuito** (fuera de la plataforma, referencia para las duplas — versión
actualizada, el documento ahora distingue quién recibe el aviso primero):
1. El equipo que contacta a la persona arma este formulario + la foto y le
   avisa a un **referente territorial** (no directamente a coordinación) —
   tanto si es un contacto espontáneo como si es un seguimiento propio que
   pide ingresar. En la plataforma: guardar la derivación
   (`estado='solicitado'`).
2. El referente territorial (GOPA) le avisa a la supervisión de la RED, que
   tiene los móviles en calle, y completa un Forms externo de solicitud de
   vacante, reenviando el mismo mensaje al grupo de WhatsApp **"Derivaciones
   DIPA"** (GOPA + derivadoras de los CIS).
3. Las derivadoras van actualizando el estado en un documento externo —
   coordinación/admin replica ese estado en `derivaciones.estado`
   (`en_espera` → `aprobado`/`rechazado` → `efectivizado`).
4. La RED informa un tiempo estimado de arribo. Si el equipo tiene que
   seguir su recorrido, se piden datos de vestimenta de la persona para que
   el equipo que la traslade pueda identificarla (campo opcional
   `vestimenta` en `derivaciones.datos` para ese caso).
5. Mientras se espera, se le ofrece a la persona esperar en uno de los dos
   DIPA. Si rechaza, el equipo evalúa si conviene quedarse dando contención en
   calle o seguir el recorrido y volver cuando la vacante se otorgue — esto
   se puede dejar registrado como un `seguimiento` tipo comentario.

**Mensaje listo para copiar (ya construido):** la plataforma todavía no le
manda el aviso al referente territorial por sí sola (sigue siendo un
WhatsApp real, paso 1 de arriba) — lo que sí hace es, al guardar la
derivación, armar el mensaje con el formato exacto que usa el equipo
(Punto de contacto / Nombre y apellido / Fecha de nacimiento / Edad / Tiene
DNI? / DNI / Estado de salud / Medicación / Esquema / Puede subir
escaleras / Puede cama arriba / Estuvo en algún CIS / Resumen de la
intervención) en una caja de texto con botón "Copiar", para pegarlo directo
en WhatsApp junto con la foto del DNI/denuncia que ya quedó adjunta. El
mismo mecanismo (`RESUMEN_DERIVACION_CONFIG` en `casos.html`) se reusa para
Casa Vincular (sección 5.2).

### 5.2 Casa Vincular

**Solo habilitado si `es_seguimiento = true`** — el documento dice
"únicamente para los seguimientos de los equipos territoriales", es decir
personas con vínculo ya establecido, y cuando se evaluó que es la mejor
opción luego de agotar el resto de las instancias. Se prioriza especialmente
a quienes no quieren ir a un CIS, o tuvieron reiterados egresos / egresos
negativos de otros dispositivos (visibles en el timeline de la ficha,
sección 4).

**Campos del formulario** ("informe social" — `derivaciones.datos`, tipo
`Casa Vincular`). Los datos de cabecera ya están en `personas` y se
pre-cargan; el resto son las columnas de informe social que ya existen en
`personas` (se pre-cargan también, se editan acá si cambiaron):

- Nombre y apellido, DNI, edad, fecha de nacimiento, nacionalidad, número de
  contacto telefónico — de `personas`
- **Situación habitacional:** hace cuánto está en situación de calle, motivo,
  dónde vivía antes, dónde pernocta, si estuvo antes en algún CIS (motivo de
  la salida, cuál)
- **Situación económica:** si cobra algún beneficio social-estatal (cuál,
  monto), si trabaja (de qué), si busca activamente, experiencia laboral
  previa (hace cuánto, cuál)
- **Situación sanitaria:** estado de salud general, último control (dónde,
  cuándo) o afección + medicación + dónde se atiende; sobre consumo
  problemático — si hizo tratamiento antes (dónde), o si no lo hizo, por qué y
  si le interesaría
- **Redes de contención:** familia/amigos, vínculo y frecuencia, o motivo de
  ausencia; si asiste a comedores, centros barriales, etc.
- **Situación educativa:** nivel más alto alcanzado, dónde, interés en
  terminarlo si quedó incompleto
- **Resumen de la intervención y posibles estrategias futuras:** principales
  necesidades identificadas, intervenciones posibles a futuro

**Circuito:**
1. El equipo arma el informe social de arriba y lo envía por WhatsApp a
   coordinación (en la plataforma: guardar la derivación,
   `estado='solicitado'`).
2. Coordinación lo reenvía a un grupo de WhatsApp donde están coordinación y
   los equipos profesionales de las Casas Vinculares, quienes determinan si
   es acertada la inclusión.
3. Confirmada la recepción, el equipo acompaña a la persona al **espacio
   diurno** — se recomienda que el equipo territorial permanezca ahí con la
   persona mientras sea posible.
4. **Muy importante comunicarle siempre a la persona que el pernocte NO está
   garantizado.** Primero asiste al espacio diurno (funciona como centro
   barrial) para construir vínculo con la institución; el pase a pernocte
   depende exclusivamente de la evaluación posterior del equipo profesional
   de la casa.

**Mensaje/PDF listo para enviar (ya construido):** al guardar la derivación
aparece el informe armado con el formato exacto de arriba, con dos botones:
"Copiar mensaje" (mismo mecanismo que CIS) y **"Descargar PDF"** (con
jsPDF, cargado por CDN — sin backend) para mandárselo directo a la
coordinadora.

**Corrector de redacción por IA (ya construido):** los 6 campos de texto
libre del informe (las 5 situaciones + el resumen de estrategias) tienen un
botón "✨ Corregir redacción" que le pide a Claude (Haiku, vía una función
serverless de Netlify — `netlify/functions/corregir-texto.js`) que mejore
ortografía/gramática/claridad sin inventar datos, y reemplaza el texto del
campo por la versión corregida. La clave de la API vive únicamente como
variable de entorno de Netlify (`ANTHROPIC_API_KEY`), nunca en el código —
sin esa variable configurada, el botón muestra un error claro en vez de
fallar en silencio. Por ahora solo está en este informe; sumarlo a otros
campos de texto libre (historia breve, resumen de intervención de CIS,
comentarios de seguimiento) es extender la misma función, no rehacer nada.

**ASA (ex Centro de Admisión, Evaluación y Derivación) usa el mismo
informe social** — el documento lo dice explícitamente ("con el mismo
formato que el adjuntado anteriormente para las Casas Vinculares"). En
`casos.html`, `CAMPOS_INFORME_SOCIAL`/`CAMPOS_INFORME_SOCIAL_RESUMEN` están
factorizados una sola vez y los usan los dos tipos de derivación —
`'Casa Vincular'` y `'ASA (ex Centro de Admisión, Evaluación y
Derivación)'` — cada uno con su propio título/ayuda pero mismos campos.
También **solo habilitado para seguimientos**: el documento pide que haya
vínculo previo y diálogo sobre la conciencia del consumo antes de proponer
ASA, igual criterio que Casa Vincular. El circuito difiere en el
destinatario: el informe de ASA lo viabiliza la referencia territorial con
la coordinación de Umbral Cero (no va directo a un grupo de Casas
Vinculares), y de ahí se gestiona la entrevista para el posible ingreso a
una comunidad terapéutica.

### 5.3 Micro

Estrategia de los equipos de turno vespertino: acceso a pernocte en micros
para que la persona empiece a sostener el espacio y genere una rutina que su
trayectoria en calle no le da.

**Campos:** datos duros ya en `personas` (nombre, apellido, DNI, edad,
situación de salud) — no requiere formulario nuevo, se auto-completan.

**Requisito bloqueante:** checkbox obligatorio **"confirmo que la persona no
presenta signos de consumo activo al momento del ingreso"** — sin marcarlo no
se puede enviar la derivación. El documento es explícito: aunque el encuadre
del micro es más flexible que el de un CIS, con signos de consumo activo al
momento del ingreso no se puede acceder.

**Circuito:** se envían los datos a la coordinación de micros para reservar
un espacio; el equipo acompaña a la persona hasta el punto de partida del
micro (según dónde se encuentren). La persona **siempre** debe tener DNI o
denuncia de extravío — mismo requisito que CIS.

**Puntos espontáneos (variante):** el documento menciona también la
derivación a micro como respuesta a una detección espontánea en territorio de
alguien que no quiere ir a CIS, o para cuando no hay vacantes de CIS al
momento de la solicitud — mismo formulario, sin requerir seguimiento previo.

**Mensaje/PDF listo para enviar (ya construido):** igual que CIS/Casa
Vincular — `RESUMEN_DERIVACION_CONFIG['Micro']` arma el mensaje con nombre,
DNI, edad y situación de salud, listo para copiar o descargar en PDF y
mandarle a la coordinación de Umbral Cero, que es quien articula con la
coordinación de micros para reservar el espacio.

### 5.4 Salud Mental, Mapa de Familias en Riesgo, Policía de la Ciudad

Tres circuitos de emergencia/derivación sumados en una vuelta posterior del
diseño (no estaban en el documento original de julio). Los tres usan el
mismo mecanismo de mensaje-para-copiar + PDF que CIS/Casa Vincular
(`RESUMEN_DERIVACION_CONFIG`), y sus campos de resumen libre son
`corregible:true` (corrector de redacción por IA, sección 5.2).

**Salud Mental:** para personas con indicadores de alguna problemática de
salud mental. Campos: punto de contacto (detallado si la persona no da
datos — área que frecuenta, referencias del lugar), datos básicos,
vestimenta y apariencia (para que el equipo de Salud Mental pueda
identificar a la persona), y la evaluación de orientación en tiempo/espacio
que define la derivación (¿sabe qué día es? ¿mes y año? ¿vestimenta acorde
al clima? ¿conductas de riesgo?).

**Brigada CER y SAME también viven adentro de este formulario** como
protocolo de escalamiento durante una evaluación de salud mental: si hay
riesgo para sí o terceros, el equipo llama al SAME (107) y permanece en el
lugar hasta que llegue; alternativamente puede pedir Brigada CER para una
evaluación sanitaria de campo. El formulario tiene checkboxes para cada
llamado + un campo para los datos de quien arriba (médico, matrícula,
institución, móvil, patente, hospital de traslado si corresponde) — esos
datos "se adjuntan a la devolución que realiza el equipo", que es
exactamente lo que este mensaje/PDF ya resuelve.

**SAME y Brigada CER además existen como tipos de derivación propios**
(`TIPOS_DERIVACION_CONFIG['SAME']` / `['Brigada CER']`) — el documento los
describe también como circuitos independientes: cualquier urgencia médica
general (no solo derivada de una evaluación de salud mental) pasa por
"Articulación con SAME", y cualquier pedido de evaluación sanitaria de
campo —incluido como apoyo cuando el SAME ya fue solicitado y demora— pasa
por "Articulación con Brigada CER". Los campos son básicamente los mismos
que la versión embebida en Salud Mental (motivo, operador que recepcionó,
datos de quien arriba), sin las preguntas de orientación en tiempo/espacio
que son específicas de la evaluación de salud mental.

**Mapa de Familias en Riesgo:** para grupos familiares en calle con
niños/niñas/adolescentes. El modelo de una-persona-por-caso no encaja del
todo con un grupo familiar — por ahora los integrantes se cargan en un
campo de texto libre (nombre/DNI/fecha de nacimiento/edad/vínculo de cada
uno), no como filas separadas. Tiene los checkboxes del protocolo urgente
si hay NNyA solos/as: SAME, Policía (911) y Línea 102 (Consejo de Derechos
de NNyA).

**Policía de la Ciudad:** para llamados al 911 por violencia, amenazas o
comportamientos que requieran intervención policial. Campos: motivo del
llamado, si el equipo aguardó el móvil, y los datos del personal
interviniente (nombre, LP, comisaría, móvil) que también van a la
devolución del equipo.

### 5.5 DNI, Médico/Salud, DIPA, Centro de día, Sedes de Atención Social, Derecho a la Identidad

Formulario simple (observaciones libres por ahora), enriquecible más
adelante:

- **Hacer DNI:** derivación de eximición de pago + acompañamiento en
  territorio a hacer el trámite (o la denuncia de extravío en comisaría, si
  corresponde).
- **Médico:** acompañamiento a hospitales/CESACs — incluye búsqueda de
  medicación y vinculación con la institución para controles médicos. El
  documento también menciona la gestión de turnos por la línea 147
  (Hospitales/Centros de Salud y Acción Comunitaria) y la importancia de
  dialogar con el servicio social de la institución.
- **DIPA** (Combate de los Pozos 1280 — Dispositivo de Primer Acercamiento):
  recurso de trámites (Ciudadanía Porteña, 690), baños, duchas,
  desayuno/merienda y oferta programática. Cada 15 días se acerca Derecho a
  la Identidad al dispositivo para gestión de trámites de esa área. También
  es el lugar donde se ofrece esperar mientras se gestiona un ingreso a CIS
  (ver 5.1).
- **Centro de día:** sin detalle adicional en el documento — formulario
  simple hasta que se defina más.
- **Sedes de Atención Social** (agregado, doc jul/2026): abordaje integral
  por comuna — consumo problemático, derecho a la identidad, derecho de la
  mujer, discapacidad, y asistencia social a NNyA/familias/personas
  mayores. Incluye la gestión de DNI con eximición de pago (documento
  adjunto de ejemplo) y asesoramiento sobre el Certificado Único de
  Discapacidad. El documento no pide datos estructurados propios más allá
  de la derivación en sí — queda como tipo simple.
- **Derecho a la Identidad** (agregado, doc jul/2026): asesoramiento,
  derivación asistida y seguimiento social en la tramitación del DNI para
  personas sin inscripción registral (NN) o extranjeras con dificultades de
  documentación (Rodríguez Peña 780). También tipo simple — el documento
  solo describe el papel de derivación que se le entrega a la persona.

**Programa Ciudadanía Porteña** (agregado, doc jul/2026) sí tiene campos
propios (`TIPOS_DERIVACION_CONFIG['Programa Ciudadanía Porteña']`), porque
el documento define requisitos concretos a confirmar antes de avanzar: DNI
con domicilio en CABA, negativa de ANSES, y si el DNI tiene menos de 2 años
de emisión, un informe social adicional de otra institución. La modalidad
puede ser acompañamiento por el equipo o derivación para que la persona
vaya por sus propios medios — en el primer caso, el "formulario integral"
lo recibe la referencia territorial para hacerlo llegar al Área de Demanda
Externa (Jerónimo Salguero 979); la derivación en papel siempre se le
entrega a la persona.

### 5.6 Espacios de contención — aclaración, no es una derivación

El documento lista "espacios de contención" junto con las herramientas
territoriales, pero conceptualmente **no es una derivación a un recurso
externo** — es una actividad propia del equipo con las personas que ya tiene
en seguimiento, para sostener el vínculo que facilita el resto de las
gestiones. Por eso no tiene formulario de derivación: se registra como
`seguimiento` (sección 6), no como `derivacion`.

### 5.7 Tipo nuevo

Cualquier tipo que se agregue a `derivacionOpciones` cae en el formulario
genérico (solo observaciones) hasta que se le diseñe uno propio.

## 6. Pantalla: Acompañamiento (seguimiento)

Lista simple, ordenada por fecha, de:
- **Comentarios libres** (`seguimientos.tipo='comentario'`) — texto + quién y
  cuándo. Acá van también los espacios de contención (5.5) y cualquier nota
  de proceso que no sea ni una intervención puntual ni una derivación.
- **Ítems de checklist** (`tipo='checklist_item'`) — texto corto +
  `checklist_completado` (para cosas tipo "acompañar a control médico",
  "retirar medicación", "acompañar a comisaría a hacer denuncia de
  extravío", que se marcan hechas con el tiempo).

No hay una lista fija de ítems de checklist todavía (el documento no la
define) — se cargan libres por ahora, igual que `criticidadOpciones`.

## 7. Egreso

El **egreso equivale a la derivación** (así lo definiste vos): cuando una
`derivacion` pasa a `estado='efectivizado'` y es la que cierra el caso, se
marca `personas.estado='egresado'`. No hay una pantalla separada de "egreso" —
es una consecuencia de actualizar el estado de la derivación correspondiente.

Un egreso no es necesariamente el final: el documento contempla reingresos
(p.ej. alguien con un egreso de CIS que después es evaluado para Casa
Vincular). Por eso `personas.estado` tiene que poder volver a `'activo'` si
aparece una nueva intervención o derivación después de un egreso, y el
timeline (sección 4) es lo que permite ver ese historial completo de
egresos/reingresos al evaluar, por ejemplo, elegibilidad para Casa Vincular.

## 8. Circuitos operativos y responsables (referencia, no forma parte del modelo de datos por ahora)

Esto es información operativa que las duplas necesitan saber, pero que hoy no
tiene una tabla propia — se deja documentado acá y se decide más adelante si
se modela:

- **Pedidos a CIS:** se hacen por un handy de supervisión RED (definir cuál)
  → RED informa al equipo territorial y envía el móvil de traslado.
- **Pedidos a Casas Vinculares:** los centraliza **Agustina Ramos** — el
  equipo territorial arma el informe y ella gestiona el traslado.
- **Traslados** a casas vinculares, centros barriales, hospitales: mecanismo
  sin definir (transit / master / móvil de la Red — a confirmar).
- **Referentes por zona:**
  - **Ilanit Álvarez** — referente de zona frontera, turno mañana.
  - **Natasha Forcinito + Luna Aloy** — ATS que se traspasan de RED.
  - Sus polígonos y con qué equipos trabajan todavía no están definidos.
- **Espacios de reporte y seguimiento:** reunión semanal (con quién, inicio y
  cierre de semana — a definir) + monitoreo mensual (sumar a Flor Pedraza).

## 9. Pestaña: Reporte semanal — dentro de `admin-duplas.html` (ya construida, sept/2026)

GOPA pide un reporte semanal (documentos "UMBRAL_0_1" 27/07/2026 y "Reporte
Zona de frontera") que **no se basa en KoBo** — es el reporte del trabajo de
las duplas en territorio, calculado desde lo que se carga en esta
plataforma (`personas`/`intervenciones`/`derivaciones`), no desde un export
de KoBo. Por eso es clave que las duplas carguen diariamente en la
plataforma lo mismo que cargan en el KoBo obligatorio (ver §3).

**Acceso:** solo admin/coordinación (mismo patrón de login que
`admin-duplas.html`). Selector de rango de fechas (default: últimos 7
días) + botón "Generar reporte" — con atajos "Última semana" / "Últimos
14 días" / "Este mes" / "Mes pasado" (sept/2026, `setRangoReporte()`)
para no tener que elegir las dos fechas a mano cada vez.

**Dos campos nuevos en el modelo de datos** para que esto sea calculable:
- `intervenciones.datos` (jsonb) — mismo patrón que `derivaciones.datos`.
  Guarda `zona`, `turno`, `tipo_punto` (calle/iglesia/plaza/otro) y
  `punto_nuevo` para las intervenciones de tipo `'recorrida'` (ver abajo).
- `personas.nivel_actual` (smallint, 1 a 5, default 1) — nivel de vínculo
  según el documento institucional (identificación / construcción del
  vínculo / monitoreo territorial / anclaje comunitario / proyecto de
  inclusión). Editable desde la ficha de persona, sección "Datos del caso".
  **Limitación conocida:** no se guarda el historial de cambios de nivel,
  solo el valor actual — "evolución de casos" en el reporte es una foto
  del momento (personas por nivel, al cierre del período elegido), no un
  delta calculado sobre el período. Si hace falta esa precisión, hay que
  sumar una tabla de historial (`personas_nivel_historico` o similar).

**"📍 Registrar recorrida" (sept/2026, sacada):** existió brevemente como
acción en `casos.html` (junto a "Nuevo ingreso") para cuando la dupla
pasaba por un punto sin nadie a quien dar de alta — creaba una fila en
`intervenciones` con `persona_id = null`, `tipo = 'recorrida'`, guardando
zona/turno/tipo de punto/punto nuevo en `intervenciones.datos`. Se sacó
por confundir a las duplas en el uso diario. Consecuencia: la cobertura de
"pasé por un punto y no encontré a nadie" ya no queda registrada en
ningún lado de la plataforma (sigue estando en el KoBo, que es
obligatorio en cada contacto — ver §3). El reporte semanal se ajustó para
no mostrar en cero los indicadores que dependían solo de esto (iglesias
abordadas, puntos nuevos, franjas horarias) — ver abajo.

**Qué calcula el reporte** (las 4 secciones + tablero que pide GOPA):
- **a) Cobertura territorial** — zonas recorridas, puntos visitados,
  intervenciones registradas, días con presencia. "Puntos que requieren
  más frecuencia" es juicio de coordinación, no un cálculo — queda como
  campo de texto libre. ("Iglesias abordadas", "puntos nuevos" y "franjas
  horarias" se sacaron del reporte al sacar "Registrar recorrida" — sin
  esa fuente, quedaban siempre en cero.)
- **b) Población abordada** — personas nuevas, recontactadas, con
  seguimiento activo, y (sept/2026) **personas que aceptan entrevista**
  — dato que ya se cargaba en la ficha (`personas.acepta_entrevista`)
  pero el reporte nunca lo miraba, hasta que Agustina lo notó revisando
  el reporte contra la realidad del territorio. "Incorporadas al
  seguimiento" y "con las que se perdió contacto" no son calculables con
  precisión todavía (ver limitación de arriba) — se marcan explícitas en
  pantalla, no se inventa un número.
- **c) Evolución de casos** — cantidad de personas por nivel (1 a 5),
  snapshot de las personas con seguimiento activo.
- **d) Intervenciones y derivaciones (cargadas en la plataforma)** — por
  tipo de derivación (reusa `TIPOS_DERIVACION_CONFIG`/§5 completo),
  contando total/efectivizadas/rechazadas por tipo. Es 100% preciso
  respecto de `derivaciones.tipo`/`estado` — **pero esa tabla depende de
  que la dupla use "Pedir derivación"**, que en la práctica casi no se
  usa (sept/2026: 0 filas en `derivaciones`, y `intervenciones` con un
  solo tipo real usado — el que se crea solo al dar de alta el caso). Lo
  que pasa en el momento (derivación espontánea a CIS, llamado a SAME,
  contacto con policía/911) se resuelve por teléfono/WhatsApp y no queda
  cargado ahí — por eso se agregó la sección **e.** de abajo.
- **e) Derivaciones y contactos según KoBo — terreno** (sept/2026,
  pedido de Agustina: "necesito poder dar un mapa real de situación").
  Sale de la pregunta obligatoria de KoBo `termino_intervencion_diaria`
  (select_multiple: llamado a SAME médico/salud mental, contacto con
  policía, derivación a CIS/RED/Casa Vincular/ASA/apoyo a familias,
  traslado a hospital/centro barrial/DIPA, etc. — ver
  `TERMINO_INTERVENCION_LABELS` en `config/umbral-0.js`) — como KoBo es
  obligatorio, esto SÍ refleja lo que realmente pasó en el territorio,
  independiente de si quedó cargado en la ficha del caso. Mismo
  matching operador→dupla que la vista de `dashboard.html` (§10.1),
  filtrado al rango de fechas del reporte. Aparece con su fuente
  aclarada en el título — no se mezcla con "d." como si viniera de la
  misma tabla, para no confundir "lo que se tipeó en Casos" con "lo que
  pasó de verdad".
- **Tablero de indicadores** — los 11 indicadores que pide el documento;
  los que no son calculables (Vínculo, Sostenimiento, Gestión, Resultado —
  requieren historial de nivel o una tabla de alertas que no existe;
  Territorialidad — dependía de "Registrar recorrida", ver arriba) quedan
  marcados "—" en vez de inventados.
- **Reporte de alertas y desvíos** — sin tabla propia todavía, campo de
  texto libre.
- **Listado de casos del período** (sept/2026, pedido de Agustina: "en
  el reporte tenemos que poder ver los casos también") — tabla con cada
  caso nuevo o recontactado en el rango (mismas dos categorías que ya usa
  "b. Población abordada"): dupla, nombre (o "Persona sin identificar"),
  DNI, zona, criticidad, nivel, si acepta entrevista, e historia breve.
  Un badge "nuevo" distingue alta del período de recontacto. **Va también
  en el link público para GOPA** — a diferencia del resto de "datos" (que
  es agregado, sin identidad de nadie), esto sí incluye nombre/DNI;
  confirmado explícitamente con Agustina antes de sumarlo ahí, dado que
  ese link no tiene login.

**Botón "Armar mensaje"**: junta todo lo de arriba en un texto plano listo
para copiar y mandar a GOPA (mismo mecanismo de copiar-mensaje que las
derivaciones de §5).

**Reporte público — link para compartir** (sept/2026, pedido de Agustina:
"necesito mejorar cómo enviar el reporte semanal" → "¿puede ser que se
vea tipo dashboard?"): en vez de mandar solo el bloque de texto plano,
botón "🔗 Publicar y generar link" que guarda una **foto** del reporte ya
calculado (los mismos números, sin nombres/DNI de personas — es un
resumen agregado) en la tabla `reportes_semanales`, y arma un link a
`umbral-0/reporte-publico.html?id=...` — una página sin login, con el
mismo estilo visual de tarjetas/tablas que ve admin/coordinación, para
que GOPA la abra directo sin necesitar cuenta.

- **Por qué es una foto y no un link "en vivo":** si después se cargan
  más casos, el reporte que ya se mandó no debería cambiar — GOPA tiene
  que ver siempre el número que se publicó ese día, no una cifra que se
  corre sola.
- Tabla `reportes_semanales` (RLS: admin/coordinación insertan y leen,
  solo admin puede borrar un reporte publicado por error) + vista
  `reportes_semanales_publico` (anon, solo lectura, mismo patrón que
  `duplas_publico`/`integrantes_publico` — ver `schema-ajustes.sql`).
- El botón de WhatsApp por ahora manda **al número de Agustina**
  (`REPORTE_WA_APROBACION` en `admin-duplas.html`), a propósito — pidió
  aprobarlo antes de que vaya a GOPA. **TODO:** cambiar al número/mail
  real de GOPA una vez que lo confirme, y agregar el botón de mail (mail
  de GOPA todavía no está).

## 10. Vista de coordinación / cliente (dashboard)

Reusa el patrón visual de `dashboard.html` (tabs por proyecto): listado de
casos activos con filtros por zona/comuna/estado/tipo de derivación pendiente,
y algún gráfico simple (derivaciones por tipo, casos por criticidad) — mismo
estilo que ya existe para Censo Flash. El rol `cliente` ve esto en modo
solo-lectura; no ve el roster de duplas/choferes (privacidad del equipo).
Complementa a la pestaña de reporte (§9): esto es exploración de casos individuales,
la pestaña de reporte es el consolidado cuantitativo para GOPA.

### 10.1 KoBo del equipo (envíos en vivo) — construido sept/2026

Además del listado de casos de arriba, `dashboard.html` tiene una pestaña
"Umbral 0" propia (no reusa el render de Censo Flash, que espera filas
`{personas, situacion, dupla, formulario}` — acá cada fila de KoBo es una
intervención sobre una persona puntual). Lee en vivo la API de KoBo del
formulario compartido "GOPA" (`config/umbral-0.js` → `kobo.forms[0]`,
`parseUmbral0()`), filtra por `identificacion/equipo === 'umbral_0'`, y
después matchea el operador de cada envío contra las 13 duplas reales
(no todo lo tageado "umbral_0" es del equipo — el asset lo comparten otros
equipos de GOPA).

- **Matching operador → dupla:** por nombre y apellido normalizado (sin
  acentos/mayúsculas/orden de palabras — ver `normalizarNombre()` en
  `shared/js/dashboard-engine.js`), contra la vista `integrantes_publico`
  (Supabase, sólo nombre/apellido/dupla, sin DNI/teléfono — `dashboard.html`
  no tiene login de Supabase, así que necesita una vista con grant a `anon`,
  mismo patrón que `duplas_publico`; ver `schema-ajustes.sql`).
- **Proxy de CORS:** el navegador no puede llamar a la API de KoBo
  directo (`kf.kobotoolbox.org` no habilita CORS para dominios
  arbitrarios — falla en silencio con "Failed to fetch", como pasó al
  conectar esta vista). `fetchKoboAll()` pasa por
  `netlify/functions/kobo-proxy.js`, que sí puede llamar a KoBo
  server-to-server.
- **No es en vivo-en-vivo:** se actualiza sola al abrir/volver a la
  pestaña "Umbral 0" (no hay un timer refrescando de fondo mientras la
  tenés abierta — mismo comportamiento que el resto del dashboard, nada
  se refresca solo en segundo plano). El botón "🔄 Actualizar" del nav sí
  la refresca a pedido sin tener que salir de la pestaña.
- **Envíos sin dupla reconocida:** si el operador de un envío "umbral_0" no
  matchea contra ningún integrante cargado, no se cuenta como del equipo —
  queda listado aparte ("⚠️ Operadores sin dupla reconocida") para poder
  distinguir un typo real del equipo propio de gente de otro equipo de GOPA.
- Muestra: 4 métricas (intervenciones, personas distintas, duplas con envíos,
  días con actividad), tabla por dupla, y últimas 30 intervenciones con
  fecha/dupla/operador/tipo/persona.
- **Filtro por fecha** (sept/2026, pedido de Agustina): barra "🔍 Filtrar
  por fecha" arriba de las métricas, mismo componente que ya usa Censo
  Flash. Filtra en el navegador sobre lo último que se trajo de KoBo (no
  vuelve a pedirle nada a la API al cambiar el rango) — ver
  `umbral0Crudo`/`aplicarFiltroUmbral0()` en `dashboard-engine.js`. El
  filtro se recalcula solo también al tocar "🔄 Actualizar".
- **Todavía NO alimenta la pestaña de Reporte semanal** (§9) — hoy son dos
  vistas separadas (esta lee KoBo en vivo, el reporte lee `intervenciones`
  de Supabase). Sumar los números de KoBo al cálculo del reporte queda para
  una próxima iteración.
- **Reducir la doble carga de los operadores** (cargar KoBo Y la ficha en
  Casos) sigue siendo el objetivo de fondo, pero es una fase más grande y
  no diseñada todavía (pre-completar o importar el envío de KoBo directo a
  una ficha de `personas`) — ver también §11.

## 11. Lo que queda abierto

Estos puntos no bloquean construir lo de arriba, pero van a afectar el modelo
más adelante — quedan pendientes de definir con Agustina:

- **"Pedir derivación"/"Registrar intervención" casi no se usan**
  (encontrado sept/2026, revisando por qué el reporte no reflejaba la
  situación real): `derivaciones` está vacía y `intervenciones` tiene un
  solo tipo real (`contacto_espontaneo`, el que se crea solo al dar de
  alta el caso). Lo que pasa en el territorio (derivaciones espontáneas,
  llamados a SAME/policía) se resuelve por teléfono/WhatsApp, no por la
  plataforma. La sección **e.** del reporte (§9) tapa el agujero leyendo
  KoBo en vez de `derivaciones` — pero sigue sin resolverse **por qué**
  las duplas no usan esos dos botones: ¿el formulario es muy largo para
  cargarlo en el momento? ¿no saben que existe? ¿prefieren resolverlo por
  teléfono y ya está? Vale la pena preguntarles directo antes de asumir
  que hace falta cambiar algo del formulario.
- **Casos duplicados entre duplas** (sección 1): con `personas` ahora
  restringida por dupla, si una persona pasa por la zona de dos duplas
  distintas, la segunda no la encuentra al buscar y puede darla de alta
  de nuevo. Si en la práctica pasa seguido, la solución no es sacar el
  scope — sería algo más fino, como avisar "ya existe un caso con ese DNI
  en otra dupla, pedile acceso a tu referente" sin mostrar el detalle
  completo.
- **Contradicción sobre CIS y seguimiento** (5.1): el documento en un lugar
  describe pedidos espontáneos de CIS (sin vínculo previo) y en otro dice que
  el ingreso a CIS "se realiza siempre y cuando la persona sea seguimiento
  del área". Confirmar cuál es la regla real.
- **Mapeo zona frontera + puntos flash:** lo suma Flor Pedraza — sin definir
  todavía si esto se traduce en un campo/tabla o queda como mapa externo
  (My Maps, como en Censo Flash).
- **URL de cartas de soflex:** falta el link real de la herramienta externa
  para completar `config.cartasSoflexLink` (sección 4) — se lo pasás cuando
  lo tengas a mano, es un cambio de una línea en `config/umbral-0.js`.
- **Referentes por zona/polígono** (Ilanit Álvarez, Natasha Forcinito, Luna
  Aloy) — no están modelados todavía; si terminan siendo un rol más
  (`perfiles.rol='referente'`) o simplemente un campo en `duplas`, se define
  cuando digas con qué equipos trabaja cada una y cuáles son sus polígonos.
- **Traslados** a casas vinculares/centros barriales/hospitales: ¿se
  coordinan por handy/móvil de la RED (transit/master), o pasan a
  registrarse también en la plataforma? Hoy no hay tabla para esto.
- **Reporting semanal/mensual:** reunión semanal de inicio/cierre (con
  quién) y monitoreo mensual (con Flor Pedraza) — en algún momento esto puede
  automatizarse (igual que quedó pendiente para Censo Flash) una vez que haya
  datos reales cargados.
- **Handy de supervisión RED** para pedidos a CIS: cuál es, si hace falta
  dejarlo documentado en algún lado de la plataforma para las duplas nuevas.
- ~~Vista de "jornadas" para admin/coordinación~~ — resuelto (sept/2026):
  panel "🕒 Jornada de hoy" en `admin-duplas.html` (pestaña "Duplas y
  equipo", función `cargarJornadaHoyAdmin()`), tabla con inicio/fin/estado
  del día por dupla activa. Queda abierto si en algún momento hace falta
  ver un día pasado (hoy solo muestra el día de hoy, sin selector de
  fecha) — se puede sumar cuando se necesite.
- **KoBo → Reporte semanal:** la vista "Umbral 0" de `dashboard.html`
  (§10.1) ya lee los envíos de KoBo del equipo en vivo, pero todavía no
  suma esos números al cálculo del Reporte semanal de `admin-duplas.html`
  (§9) — hoy son dos fuentes separadas.
- **Reducir doble carga (KoBo + Casos):** primer paso hecho (sept/2026):
  "KoBo pendientes" en `casos.html` (§4) pre-completa nombre/apellido/DNI
  del alta cuando el envío de KoBo trae DNI y todavía no es un caso.
  Sigue abierto: los envíos sin DNI (la mayoría de los "sin identificar")
  siguen siendo carga manual completa, y no se pre-completa nada más allá
  de la identidad (zona, criticidad, historia, etc.) — para eso hace
  falta mapear más preguntas de KoBo en `parseUmbral0()`.

## 12. Próximo paso sugerido

Con este diseño ya con el detalle completo de CIS, Casa Vincular y Micro, el
orden natural para construir es:

1. **Nuevo ingreso / Ficha de persona** (sección 4) — es la puerta de entrada
   de todo el resto.
2. **Pedir derivación → CIS** (5.1) — es el circuito más armado y el que más
   se usa según el documento, con el requisito bloqueante de la foto de DNI.
3. El resto de los tipos de derivación (Casa Vincular, Micro, simples) y
   Acompañamiento (sección 6) pueden salir después, reusando el mismo
   patrón de formulario dinámico.

Aviso cuando quieras que arme la pantalla de ingreso.
