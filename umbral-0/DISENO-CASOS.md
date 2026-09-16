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

**Bug real en producción — huso horario en `hoyStr()`** (sept/2026,
reportado por Agustina con capturas: dos duplas del turno T4 (18-22hs)
abrían Casos y veían "✅ Jornada de hoy completa" sin haber marcado nada
— un caso mostraba inicio y fin exactamente al mismo minuto). Causa: las
tres copias de `hoyStr()` (`casos.html`, `admin-duplas.html`,
`casos-en-vivo.html`) usaban `new Date().toISOString().slice(0,10)` —
`toISOString()` es **UTC**, y Buenos Aires es UTC-3. Desde las 21hs
locales en adelante, `toISOString()` ya muestra la fecha de MAÑANA. Una
dupla que marca "fin de jornada" en ese horario (justo el final del
turno T4) queda con esa fila guardada con la fecha del día SIGUIENTE; al
otro día, esa fecha "de mañana" ya coincide con "hoy" y la dupla se
encuentra la jornada marcada como completa sin haber tocado nada. El bug
es invisible el resto del día (solo se manifiesta entre las 21:00 y las
23:59 ART) — por eso pasó desapercibido hasta ahora. Arreglado
calculando la fecha con los getters locales (`getFullYear()`/
`getMonth()`/`getDate()`) en vez de `toISOString()`, en las tres copias.
**Importante:** el fix de código no corrige solo las filas ya mal
guardadas de esa noche — esas quedan con una fecha que, al día
siguiente, es indistinguible de un "hoy" legítimo. Hace falta corregir
a mano (`update jornadas set fin = null where fecha = current_date and
dupla_id = ...`) las filas de las duplas afectadas para desbloquearlas.

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
   - **Traba contra doble-tap (sept/2026):** `guardarPersona()` deshabilitaba
     el botón "Dar de alta" recién después de validar nombre/apellido — en
     una conexión lenta del celular, un doble-tap dispara dos clicks antes
     de que el primero llegue a deshabilitarlo, y los dos terminan
     insertando el mismo caso. Se detectó en producción (15/9): "Alejandro
     Castaño" DNI 38681714, Dupla K, quedó cargado dos veces con 8 segundos
     de diferencia. Fix: una traba sincrónica (`_guardandoPersona`) como
     primera línea de la función, antes de cualquier validación — el
     segundo click entra y sale sin hacer nada mientras el primero sigue en
     curso, y se libera en el `finally` (o en cada validación que corta el
     flujo) para no dejar el botón trabado si el guardado falla.
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

   - **Envíos de KoBo de esta persona, auto-completados** (sept/2026,
     pedido de Agustina: "no sé si [la dupla] aclara que le hizo la
     eximición de pago, o que va a volver mañana, o que llamó al 911...
     ¿cómo podemos mejorar la experiencia de la toma de acción del
     operador?"). El diagnóstico (§11 original) seguía en pie: "Pedir
     derivación"/"Registrar intervención" casi no se usan porque le piden
     a la dupla cargar DOS VECES lo mismo que ya contestó en la pregunta
     obligatoria de KoBo "¿Cómo terminó la intervención?". En vez de
     insistir con más carga manual, `cargarKoboDePersona()` trae **todos**
     los envíos de KoBo cuyo DNI matchea con el de esta persona (de
     cualquier dupla/operador, no solo la propia) y los suma al timeline
     como eventos de **solo lectura** — "📋 Envío de KoBo", con qué pasó
     (`termino_intervencion_diaria`, mismas etiquetas del reporte
     semanal), si sigue en seguimiento, y las notas de texto libre que
     haya (devolución, estrategias de abordaje, estado de salud, etc.) —
     "auto completa todo lo que puedas de KoBo", sin inventar nada nuevo.
     No escribe en `intervenciones` ni pisa ningún campo cargado a mano
     (mismo criterio de todo lo demás en esta sesión: nunca sobrescribir
     datos sin que alguien lo confirme) — es una vista de lo que ya existe
     en KoBo, sumada a lo que ya existe en la plataforma.
     - Requiere que la persona tenga DNI cargado (`sin_identificar` o
       DNI vacío/basura no matchea) — mismo límite que "KoBo pendientes".
     - No bloquea abrir la ficha: se pide en paralelo y se agrega al
       timeline en cuanto llega (la primera vez puede tardar unos
       segundos — trae y parsea ~3000 filas de KoBo — después queda en
       caché para el resto de la sesión, compartida con "KoBo
       pendientes" vía `obtenerKoboRowsParseadas()`).
   - **El operador como validador + envíos sin DNI** (sept/2026, siguiente
     vuelta del mismo pedido: "el operador actuaría de validador y de
     agregar datos extras... si mañana el operador vuelve a cargar el
     KoBo con el mismo nombre o DNI de la persona que vio ayer, tenemos
     que poder asociarlo al mismo caso"). Dos piezas nuevas, tabla
     `kobo_validaciones` (persona_id + kobo_submission_id, `unique`) de
     por medio — RLS calcada de `intervenciones`/`seguimientos`
     (dupla ve/escribe solo lo de su `dupla_id`, admin/coordinación todo,
     solo admin borra):
     1. **Validar / agregar nota** — cada tarjeta "📋 Envío de KoBo" del
        timeline tiene un botón para que la dupla confirme que está bien
        (queda un badge "✅ Validado por la dupla") y, si hace falta,
        agregue una aclaración que KoBo no preguntó. Es la nueva forma de
        "Registrar intervención" para lo que ya vino de KoBo — confirmar
        y comentar, no volver a tipear de cero. El botón viejo de
        "➕ Registrar intervención" (100% manual, sin KoBo de por medio —
        ej. un llamado telefónico) se deja **sin tocar** a propósito: el
        equipo lo está usando en producción y no hay necesidad de
        arriesgar esa carga mientras se valida esto nuevo en uso real.
        - **Siguiente paso guiado** (sept/2026, pedido de Agustina:
          "cuando termino de validar el caso, llevarlo a ¿querés agregar
          algo más? ¿querés registrar tu intervención? ¿o un comentario
          adicional?") — al guardar la validación, en vez de cerrar el
          modal derecho, `Casos._mostrarSiguientePasoValidacion()` ofrece
          tres botones: abrir "➕ Registrar tu intervención", abrir
          "💬 Agregar un comentario" (reusa los formularios existentes,
          nada nuevo que mantener), o "No, ya terminé". Mismo criterio de
          guiar al operador en vez de esperar que encuentre solo el resto
          de los botones de la ficha.
        - **"Qué hiciste con este caso" — nativo de la plataforma**
          (sept/2026, pedido de Agustina: "yo no manejo el kobo, manejo
          esta plataforma... el que hizo debe verse en el legajo"). El
          "qué se hizo" (llamado a SAME, derivación, contacto con
          policía, etc.) hasta ahora solo salía de la pregunta
          obligatoria de KoBo `termino_intervencion_diaria` — pero esa
          lista de opciones no la administra Agustina, la administra
          quien mantiene el formulario de KoBo, y le faltan opciones
          reales (confirmado con datos reales: no tiene "CIS" ni
          "teléfono rojo" como opciones, ver más abajo). Se agrega
          `ACCIONES_INTERVENCION` en `casos.html` — la misma idea pero
          NATIVA (columna `intervenciones.acciones text[]`, se completa
          al abrir "➕ Registrar intervención", que es justo una de las
          opciones del paso guiado de arriba): mismas categorías de
          KoBo donde tiene sentido, más "Derivación a CIS" y "Llamado
          al teléfono rojo" explícitos, y **"Se acercó, pero no aceptó
          hablar / se negó a la entrevista"** — pedido de Agustina en
          el mismo hilo: "si la persona no acepta la entrevista el
          operador no marca qué hizo", porque antes no había ninguna
          opción para ese caso tan común (sin entrevista, no hay KoBo,
          y sin KoBo no había ningún registro del intento de contacto).
          Se muestra en el timeline de la ficha, igual que el "Qué
          pasó:" de los envíos de KoBo ("Qué se hizo: ..."). No es
          obligatorio marcar nada (no hay validación que bloquee
          guardar sin tildar — mismo criterio de no arriesgar romper la
          carga en producción), es una lista visible y fácil de usar,
          no un gate.
        - **Movido adentro de "Validar envío de KoBo"** (sept/2026,
          pedido de Agustina, tras revisar un caso real en la
          plataforma: "sigo sin poder ver que hacen con la acción mis
          operadores"). El motivo: en el caso que revisamos, el
          checklist nunca se llegaba a completar porque vivía en
          "➕ Registrar intervención" — un paso opcional DESPUÉS de
          validar, al que casi nadie llegaba (en ese caso ni siquiera
          habían validado el envío todavía). Se agregó la MISMA lista
          `ACCIONES_INTERVENCION` directo adentro del modal de
          `Casos.abrirModalValidarKobo()` — el único paso que todas las
          duplas sí hacen — junto con la nota, en un solo guardado
          (`kobo_validaciones.acciones`, nueva columna). Al reabrir
          "✏️ Editar nota" sobre una validación ya hecha, los checkboxes
          quedan pre-tildados con lo que ya se había marcado. En el
          timeline se ve como una línea aparte, "Qué se hizo (cargado
          por la dupla): ...", distinta de "Qué pasó:" (que viene de la
          pregunta de KoBo) — no se pisan entre sí, son dos fuentes
          distintas mostradas juntas. "➕ Registrar intervención" se
          mantiene, pero pasa a ser para lo que pasa APARTE de esa
          visita puntual (ej. un llamado telefónico otro día) — ya no
          hace falta para que quede el "qué se hizo" de la visita en sí.
     2. **Envíos sin DNI que podrían ser un caso ya cargado** — nueva
        sección en "KoBo pendientes", separada de la de altas nuevas: si
        un envío sin DNI de la propia dupla tiene el mismo nombre
        (normalizado, exacto — no aproximado, para no arriesgar mezclar
        dos personas distintas) que un caso ya cargado por esa dupla, se
        le pregunta a la dupla "¿es la misma persona?" en vez de
        asociarlo solo. Un clic en "✅ Sí, es la misma" guarda la
        asociación en `kobo_validaciones` (de ahí en más ese envío
        aparece en el timeline de esa ficha, igual que un match por DNI);
        "No es ella" solo lo saca de la sesión actual, no queda guardado
        — no hace falta un registro permanente de un descarte.
     - Límite conocido: si no hay DNI Y el nombre no matchea exacto con
       nada ya cargado (ej. `sin_identificar`, o el nombre viene distinto
       entre visitas), ese envío no aparece en ningún lado todavía — no
       se resuelve con matching automático más agresivo (riesgo de
       mezclar historiales), sino identificando el caso de otra forma
       (punto de contacto, descripción física) si hace falta.
   - **Instructivo para las duplas** (sept/2026, pedido de Agustina:
     "armá un instructivo de onboarding así les paso a las duplas cómo
     funciona la validación, carga y seguimiento de casos") — nueva
     sección "Cómo usar Casos: carga, validación y seguimiento" en
     `umbral-0/instructivo.html` (§ "En esta página"), con el paso a paso
     completo (buscar antes de cargar → KoBo pendientes → alta manual →
     validar → posibles continuaciones sin DNI → seguimiento) y un mini
     FAQ. Va en el instructivo existente (no un documento aparte) porque
     ya es la página de referencia que las duplas conocen, no pide login,
     y tiene su propio link para mandar por WhatsApp
     (`.../umbral-0/instructivo.html#uso-casos`).
     - Al agregar tarjetas nuevas con la misma clase visual `.gcard` que
       el glosario de derivaciones, se corrigió de paso el buscador de la
       página (`filtrar()`) para que solo filtre `#glosario-grid .gcard`
       — sin el `id` de scope, las tarjetas nuevas (sin `data-nombre`)
       rompían la búsqueda en cuanto se escribía algo.
     - **Capturas reales, no mockups** (mismo pedido, siguiente vuelta:
       "no, yo quiero el instructivo con el producto real, con las
       pantallas reales") — `umbral-0/capturas/*.png`, 5 capturas de
       `casos.html` corriendo de verdad (mismo HTML/CSS/JS que producción).
       Como esta sesión no tiene salida de red hacia la Supabase real ni
       hacia `cdn.jsdelivr.net` (política de egress del entorno), no se
       pudo loguear de verdad ni pedir datos reales — en cambio se navegó
       la página con Playwright y se inyectó el estado directo en las
       mismas variables/funciones que usa la app (`miPerfil`,
       `personaActual`, `koboEventosActuales`, `Casos._renderTimeline()`,
       etc.), con **un caso de prueba explícitamente ficticio** ("Juana
       Ejemplo", DNI `00000000`) creado temporalmente en la base de
       producción (dupla `ZZ-DEMO` inactiva + integrante + cuenta auth +
       persona) **y borrado apenas se sacaron las capturas** — nunca se
       usó ni se mostró el dato de una persona real. El resultado es
       HTML/CSS real, pixel a pixel igual a lo que ve una dupla — solo
       cambia de dónde sale el dato en pantalla.

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
  - La sección colapsable "Salud y antecedentes" del formulario de alta
    arranca **abierta** cuando viene con datos precargados (para que no
    pase desapercibido que hay texto ahí adentro) — en una edición común
    sigue colapsada, como siempre. "Informe social" en cambio **arranca
    siempre abierta** (sept/2026, pedido de Agustina/GOPA: "esto tiene
    que ser en el primer contacto") — dejó de ser una sección opcional
    "para completar cuando corresponda", así que ya no tiene sentido que
    empiece escondida en un alta nueva, que es justo cuando más hace
    falta completarla.
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
  el reporte tenemos que poder ver los casos también") — cada caso nuevo
  o recontactado en el rango (mismas dos categorías que ya usa "b.
  Población abordada"): dupla, nombre (o "Persona sin identificar"), DNI,
  zona, criticidad, nivel, si acepta entrevista, e historia breve. Un
  badge "nuevo" distingue alta del período de recontacto. **Va también
  en el link público para GOPA** — a diferencia del resto de "datos" (que
  es agregado, sin identidad de nadie), esto sí incluye nombre/DNI;
  confirmado explícitamente con Agustina antes de sumarlo ahí, dado que
  ese link no tiene login.
  - **Tarjetas plegables, no tabla** (sept/2026, ajuste de Agustina: "que
    los casos se vean en cajas y si quieren abrirlos que los abran") —
    la tabla de 8 columnas era ilegible, sobre todo en celular. Cada caso
    es un `<details class="caso-card">`: la tarjeta cerrada muestra solo
    dupla + nombre + badge "nuevo" + criticidad (con color), y al tocarla
    se abre mostrando DNI/zona/nivel/acepta entrevista/historia breve.
    `renderListadoCasosCards()` (duplicada en `admin-duplas.html` y
    `reporte-publico.html`, mismo criterio de auto-contención de página
    que el resto).
  - **Bug de CSS en "Historia breve"** (encontrado sept/2026 por
    Agustina, vía captura del link público) — `.caso-detalle-lbl` trae
    `flex:0 0 130px` pensado para las filas horizontales (DNI/Zona/
    Nivel/...), pero `.caso-historia` fuerza `flex-direction:column`
    para apilar label+texto — sin resetear `flex` en ese contexto, el
    label heredaba 130px de **alto** (no de ancho) y quedaba separado
    del texto por un hueco enorme. Fix: `flex:none` en el selector ya
    scopeado `.caso-historia .caso-detalle-lbl`, en los dos archivos.
  - **Campos que pedía GOPA, sept/2026** (WhatsApp de la referente de
    gobierno: "estoy viendo las intervenciones... la info no está
    completa... nombre, DNI, fecha de nacimiento, edad, celular,
    situación habitacional/económica/educativa, redes de contención") —
    esos datos YA existían como columnas de `personas` (se cargan a mano
    o se precargan de KoBo en el alta) pero el listado nunca los
    mostraba. Se agregaron a `armarListadoCasos()` (nuevo `edadDesde()`
    calculado desde `fecha_nacimiento`, no se guarda como columna
    aparte) y a la tarjeta: Edad (con fecha entre paréntesis), Teléfono,
    y los 4 bloques de texto libre (situación habitacional/económica/
    educativa, redes de contención) con el mismo estilo apilado que
    "Historia breve". Van también al link público, mismo criterio ya
    aplicado a nombre/DNI — es justamente lo que pide el organismo de
    gobierno para su propio reporte.
  - **El "32 entrevistas" que preguntó GOPA es un dato real** — sale de
    `termino_intervencion_diaria` en KoBo (sección "e.", sept/2026),
    verificado contra el reporte ya publicado (`reportes_semanales`,
    período 9-15/9: `entrevista_persona: 32`). Es un conteo agregado de
    envíos, no vinculado a personas puntuales — por eso GOPA no
    encontraba el detalle: estaba en otra sección del mismo reporte
    (el listado de casos), que hasta este fix no traía los campos que
    pedían.
  - **Completitud de los datos, no solo visibilidad** — de 63 personas
    cargadas, situación habitacional/económica/educativa/redes de
    contención solo estaban en ~20-23 (32-36%), teléfono en 17 (27%).
    Pregunta de Agustina: "pero no creo que estén en KoBo, o ¿pueden
    estar y que no los hayamos levantado?" — en vez de asumir, se
    construyó una forma de verificarlo con certeza en vez de adivinar.
  - **Panel "🩺 Completar datos faltantes desde KoBo"** (`admin-duplas.html`,
    pestaña Duplas y equipo, on-demand con botón "🔍 Revisar" — no se
    carga solo al entrar, cruza contra ~3000 filas de KoBo) — para cada
    persona con DNI le faltan uno o más de los 4 campos de texto libre,
    busca en **todos** sus envíos de KoBo (no solo el de la dupla que la
    cargó) si esa pregunta se contestó alguna vez, usando el envío más
    reciente que tenga algo. Arma el mismo texto que ya arma
    `confirmarKoboPendiente()` al precargar una alta nueva (mismas
    etiquetas, mismo criterio, un solo lugar donde tocarlo si cambia el
    formulario). Separa el resultado en dos:
    - **Se puede completar** — el texto propuesto queda a la vista antes
      de guardar nada; un click en "✅ Completar estos campos" hace el
      `update` (solo de los campos que estaban vacíos, nunca pisa lo que
      ya había). Nunca automático ni silencioso.
    - **Sin dato en KoBo tampoco** — lista colapsable con nombre + DNI +
      qué falta, para saber a cuáles casos hay que preguntarles directo
      (no es un problema de la plataforma, es que nunca se contestó esa
      pregunta en el territorio).
    - `telefono_contacto` queda **afuera** a propósito: `parseUmbral0()`
      no tiene ninguna pregunta de celular mapeada del formulario de
      KoBo todavía — no hay nada para cruzar. Pendiente confirmar si el
      formulario real la pregunta bajo otro nombre (revisar contra un
      envío nuevo si hace falta mapearla).
    - Para **antes de ahora** (que a partir de ahora las duplas SÍ
      carguen esto en el alta): ya está resuelto en la práctica por
      "KoBo pendientes" → `confirmarKoboPendiente()`, que precarga estos
      mismos 4 campos automáticamente al confirmar un alta nueva — el
      hueco de completitud es sobre todo de casos previos a que ese
      flujo se usara de forma consistente, no un problema de diseño
      hacia adelante.
  - **Checklist de la entrevista (GOPA)** (sept/2026, Agustina pegó de
    nuevo la lista completa de GOPA — "sí, hace el checklist") —
    `Casos._renderChecklistEntrevista()`, arriba del Legajo en la ficha
    (`#checklist-entrevista-box`). No es un formulario nuevo: lee los
    mismos campos que ya muestra el Legajo, reordenados como lista de
    verificación (✅/⬜ por ítem + contador "X/Y") para que la dupla vea
    en el momento qué le falta preguntar, sin esperar al reporte
    semanal. "Documentación necesaria" y "Deseos de la persona" quedan
    marcados aparte (⚠️ "sin campo en la plataforma todavía") — no hay
    ninguna columna que los guarde hoy.
    - Agustina pasó el link del formulario real de KoBo
      (`https://ee.kobotoolbox.org/x/2agnZwzr`, el mismo de
      `config.koboFormLink`) para chequear si esas dos preguntas (más
      "¿tiene celular?", que tampoco está mapeada) ya están ahí bajo
      otro nombre. No se pudo abrir el link (`ee.kobotoolbox.org`
      bloqueado por la política de egress de esta sesión, mismo bloqueo
      que ya afectaba a `kf.kobotoolbox.org`), pero Agustina pegó el
      **texto completo del formulario** (todas las preguntas, tal como
      las muestra Enketo al completarlo) — con eso alcanzó para
      **confirmar, leyendo pregunta por pregunta, que ninguna de las
      tres existe en el formulario real**:
      - **¿Tiene celular de contacto?** — no hay ninguna pregunta de
        teléfono/celular en todo el formulario.
      - **Documentación necesaria** — solo está "Tipo de documento" +
        "Número de documento" (el DNI de la persona), nada sobre si le
        falta algún otro trámite/documento.
      - **Deseos de la persona** — lo más cercano es "Estrategias de
        abordaje (Objetivos)" y "Observaciones generales" en el bloque
        de Cierre, pero son notas del equipo, no lo que la persona dice
        que quiere.
      Conclusión: **no es un problema de la plataforma ni de cómo
      parseamos KoBo** — esas tres preguntas no se le hacen a la
      persona todavía. Si GOPA las necesita, hay que agregarlas al
      formulario de KoBo (decisión de Agustina/GOPA sobre el diseño del
      formulario, no algo que se resuelva en `parseUmbral0()`).
      - **Resuelto (sept/2026):** Agustina mandó dos exports reales de
        KoBo — primero uno en formato "labels" (270 columnas, útil para
        confirmar que celular/documentación/deseos tampoco aparecen ahí,
        con las etiquetas reales en vez del texto copiado a mano de
        Enketo) y después el mismo en formato **"XML values"**, que sí
        trae los nombres técnicos. Con eso se confirmaron y mapearon dos
        campos nuevos de "procedencia" para situación habitacional:
        - **`lugar_nacimiento`** ("¿Dónde naciste?") — no se cargaba
          nada, campo nuevo: `lugarNacimiento`.
        - **`lugar_vivienda_previa`** ("¿Dónde vivías antes de estar en
          calle por primera vez?") — ya se cargaba como
          `lugarViviendaPrevia`, pero con la etiqueta genérica "Vivienda
          previa"; se renombró a "De dónde vino antes de la calle" para
          que quede claro que es geográfico, no el tipo de vivienda
          (eso es `tenenciaViviendaPrevia`, campo aparte).
        - Los dos usan las mismas 5 opciones (confirmado contra los
          valores reales guardados, no contra la etiqueta):
          `caba`/`pba`/`otra_provincia`/`otro_pais`/`nsnc`. `legible()`
          genérico las dejaba como "Caba"/"Pba"/"Nsnc" — se agregó
          `LUGAR_GEOGRAFICO_LABELS` + `legibleLugar()` (mismo criterio
          que `TERMINO_INTERVENCION_LABELS`) para que se lean bien.
        - Sumados a los dos lugares que arman el texto de "Situación
          habitacional" desde KoBo: `confirmarKoboPendiente()` en
          `casos.html` (prefill del alta) y `CAMPOS_COMPLETAR_KOBO` en
          `admin-duplas.html` (el backfill de casos ya cargados).
- **Marca de Huehaci en toda la plataforma** (sept/2026, primero pedido de
  Agustina: "quiero agregar el logo de huehaci en el admin así cuando paso
  el reporte llega con nuestra marca también"; después ampliado: "le falta
  que nuestra marca, de consultora de innovación cívica y tecnológica
  tenga más impronta en el producto"). `assets/huehaci-logo.png` se agregó
  en las 11 páginas HTML de la plataforma (Censo Flash y Umbral 0, no solo
  Umbral 0 — el pedido fue "toda la plataforma"):
  - **Favicon** en el `<head>` de las 11 páginas.
  - **Logo + tagline** ("Consultora de innovación cívica y tecnológica")
    en el header/topbar de las pantallas principales: `plataforma.html`
    (el portal de entrada a los dos proyectos), `dashboard.html` (login y
    nav), `admin-duplas.html`, `casos.html` y `reporte-publico.html` (acá
    el más grande, porque es lo único que ve gente de afuera).
  - **Footer de crédito** ("Huehaci — Consultora de innovación cívica y
    tecnológica" + logo chico) agregado al pie de las 11 páginas — clase
    CSS `.huehaci-credit`, duplicada por página siguiendo el mismo
    criterio de auto-contención que el resto de la plataforma.

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
  - **Salvo cuando piden justo lo contrario** (sept/2026, pedido de
    Agustina: "necesito que gobierno o un coordinador puedan ver en
    línea cuando se suben los casos... ni el coordinador ni yo tenemos
    cuenta ellos, necesito que lo vea gobierno también") — para ESTE
    caso de uso (ver casos recién cargados, no el resumen agregado
    quincenal) sí hace falta que se actualice solo, así que se armó un
    segundo link, separado del reporte semanal: **`umbral-0/casos-en-vivo.html`**.
    Sin login (igual que `reporte-publico.html`), pero en vez de leer
    una foto guardada en `reportes_semanales`, pide en vivo a la vista
    `personas_listado_publico` (ver `schema-ajustes.sql`) cada vez que
    se abre o se toca "🔄 Actualizar". Tiene su propio filtro de fechas
    (por `fecha de alta`, con atajos hoy/semana/quincena/mes) y muestra
    las mismas tarjetas plegables que el reporte, con los mismos campos
    (incluido lo que pidió GOPA: edad, teléfono, las 4 situaciones).
    **Alcance actual:** solo altas nuevas (por `created_at`), no
    recontactos — es lo que pidió literalmente ("cuándo se suben los
    casos"); si hace falta ver recontactos también, es una vuelta más.
    Link desde el topbar de `admin-duplas.html` ("📥 Casos en vivo") para
    que Agustina lo encuentre y lo reenvíe.
    - **Ordenado por turno y dupla + perfil completo** (sept/2026, pedido
      de Agustina: "que este ordenado por turnos y duplas y que levante
      el perfil de la persona completo"). La vista `personas_listado_publico`
      ahora también trae `turno`/`es_referente` de la dupla (join a
      `duplas`) y el resto de los campos del legajo que faltaban
      (nacionalidad, situación sanitaria, estado de salud, medicación,
      esquema, movilidad — sube escaleras/cama arriba, paso previo por
      CIS, consumo activo). El listado se agrupa primero por turno (orden
      fijo T1→T2→T3→T4, un turno sin casos cargados no se muestra) y
      dentro de cada turno por dupla (orden alfabético de código), con la
      dupla referente del turno marcada. `create or replace view` no deja
      reordenar columnas existentes ("cannot change name of view column")
      — las columnas nuevas quedaron agregadas al final en vez de
      intercaladas con las relacionadas.
    - **Aviso de posibles duplicados** (sept/2026, pedido de Agustina:
      "revisa que hay duplicados de nombres tb"). Al revisar encontramos
      duplicados REALES en producción: 5 casos con el mismo DNI
      (94936973), otros 5 con el mismo DNI (96197764, uno de ellos sin
      DNI cargado), y 3 grupos más de 2-3 casos cada uno — 17 filas de
      `personas` en total que probablemente son la misma persona cargada
      más de una vez. Causa más probable: el alta manual
      (`Casos.guardarPersona()` en `casos.html`) no chequea si ya existe
      un caso con ese DNI antes de insertar, y la política de RLS de
      `personas` ("cada dupla ve solo sus propios casos") hace que una
      dupla no pueda ver si OTRA dupla (u otro turno) ya cargó a esa
      persona — dos duplas que ven a la misma persona en días distintos
      terminan creando dos legajos separados. `casos-en-vivo.html` ahora
      detecta esto en el cliente (mismo DNI, o mismo nombre normalizado
      cuando ninguno tiene DNI cargado) y muestra un aviso plegable
      arriba del listado con cada grupo y qué duplas cargaron cada caso,
      más una marca "⚠️ posible duplicado" en la tarjeta de cada caso
      involucrado. **A propósito NO fusiona ni borra nada automáticamente**
      — son legajos reales con intervenciones/derivaciones propias
      colgando, decidir cuál es el "bueno" y mergear a mano le
      corresponde a Agustina. Pendiente sugerido: si esto sigue pasando,
      agregar un chequeo de DNI repetido (buscando en TODAS las duplas,
      no solo la propia) como advertencia antes de guardar un alta nueva
      en `casos.html`.
    - **Chequeo preventivo al dar de alta — construido** (sept/2026,
      pedido de Agustina: "si hacelo", tras confirmar que el problema
      seguía activo: ese mismo día el DNI 94936973 pasó de 5 a 10
      casos cargados, en tandas de ~5 inserts seguidos segundos aparte,
      primero por la dupla C y después por la F). `Casos.guardarPersona()`
      en `casos.html` ahora, antes de insertar una persona NUEVA con DNI
      cargado (no aplica a "sin identificar" ni a ediciones), consulta la
      nueva vista `personas_dni_index` (`schema-ajustes.sql`) buscando ese
      DNI. Esa vista bypassea a propósito la RLS de `personas` (mismo
      patrón que `personas_listado_publico`, pero con grant a
      `authenticated` en vez de `anon` — es una herramienta operativa
      para duplas logueadas, no un link público) y expone SOLO lo mínimo
      para detectar el duplicado: DNI, nombre, apellido, dupla y fecha —
      no situación económica/salud/teléfono/etc. Si hay coincidencias, se
      muestra un aviso dentro del propio formulario (no se pierde lo ya
      tipeado) con quién cargó cada caso existente y dos botones: "Volver
      a editar" (saca el aviso, la dupla puede corregir el DNI o cerrar y
      buscar el caso existente) o "Crear de todas formas" (sigue con el
      alta — hay coincidencias legítimas, como un DNI mal tipeado en el
      caso anterior). **Es un aviso, no un bloqueo** — no hay unique
      constraint en `personas.dni` ni se agregó uno, a propósito: no
      queríamos arriesgar que un alta legítima falle en producción por
      un caso borde no previsto.
    - **Ocultar (no borrar) los duplicados ya cargados** (sept/2026,
      pedido de Agustina: "veo que la dupla c tiene muchos duplicados,
      como elimino los que no van?" → tras chequear que eran copias
      reales sin ninguna intervención/derivación/seguimiento propio más
      allá del alta automática — solo el mismo "Ingreso inicial del
      caso" repetido — pidió en vez de un DELETE: "podes ocultarlas
      mejor?"). Columna nueva `personas.oculto` (default `false`,
      reversible). `personas_listado_publico` y `personas_dni_index`
      dejan afuera los casos ocultos, y el reporte semanal / el panel de
      completitud de KoBo en `admin-duplas.html` también. Nuevo panel
      "⚠️ Posibles duplicados" en `admin-duplas.html` (botón "🔍
      Revisar"): trae TODAS las personas (admin bypassea el RLS
      por-dupla), agrupa por DNI repetido (o nombre normalizado sin
      DNI, misma lógica que el aviso de `casos-en-vivo.html`), muestra
      cada copia con dupla y fecha marcando la más vieja como sugerida
      para dejar, y un botón "🙈 Ocultar" por cada copia extra. Un
      desplegable aparte lista lo ya oculto con "👁️ Mostrar de nuevo"
      por si hace falta deshacerlo. Ya usado en producción: se ocultaron
      las 7 copias de más de los 3 duplicados reales de la dupla C
      (Mangel Sánchez x4, Jorge Alejo Medina Avalos x2, Nuñez Raul x1).
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

### 10.0 Un solo login para todo — construido sept/2026

Pedido de Agustina: "quiero ingresar una sola vez y ver todo sin tener
que volver a registrarme". Antes de esto, `dashboard.html` era un
sistema de login completamente aparte de `casos.html`/`admin-duplas.html`
— usaba la contraseña compartida de `PLATFORM_AUTH`
(`config/platform.js`), mientras que Casos usa cuentas reales de
Supabase Auth. Entrar primero a Casos y después al dashboard pedía
loguearse dos veces con dos sistemas distintos.

- **`intentarAutoLoginUmbral0()`** (`shared/js/dashboard-engine.js`): al
  cargar `dashboard.html`, si ya hay una sesión de Supabase activa
  (porque se entró primero por `casos.html`/`admin-duplas.html` — mismo
  proyecto de Supabase, mismo storage del navegador) entra directo según
  el rol real de esa cuenta, sin mostrar el login de contraseña:
  - `perfiles.rol = 'admin'` → admin completo del dashboard (ve Censo
    Flash también — coherente con que hoy es la misma persona
    administrando los dos operativos).
  - `perfiles.rol = 'coordinacion'` → rol `coordinador`, encerrado en
    Umbral 0 nada más (mismo alcance que `coordPassword`, que Umbral 0 ni
    siquiera tiene configurado todavía — esto de paso da una forma de
    entrar sin depender de esa contraseña).
  - Cualquier otro rol (ej. `dupla`) no dispara el auto-login — sigue
    mostrando el login de contraseña normal, una cuenta de dupla no
    tiene por qué ver el dashboard de coordinación.
  - Nunca pisa una sesión de `PLATFORM_AUTH` ya restaurada
    (`restoreSession()` sigue siendo lo primero que se intenta).
- **Navegación cruzada**: `casos.html`/`admin-duplas.html` ahora tienen
  un link "📈 Dashboard" en el topbar (admin/coordinación), y la vista
  "Umbral 0" del dashboard tiene un link de vuelta a "🗂️ Ir a Casos /
  Duplas" — antes había que escribir la URL a mano o tener la pestaña
  guardada.
- **Lo que queda afuera de esto (deliberado):** unificar el login del
  lado de Censo Flash (que no tiene cuentas de Supabase, solo
  contraseñas compartidas) es un cambio más grande, sin resolver
  todavía — quedó planteado para pensarlo aparte.

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

### 10.1.1 El mismo agujero en `admin-duplas.html` (incidente real, 16/9/2026)

El punto "Envíos sin dupla reconocida" de arriba solo estaba resuelto en
`dashboard.html` (vista de coordinación). La tabla "📥 KoBo pendientes" de
`admin-duplas.html` — la que de verdad importa para no perder un caso, porque
es la que un admin mira para saber qué falta confirmar — tenía el mismo
matching operador→dupla pero SIN el bucket de "sin reconocer": si el nombre
no matcheaba ningún integrante, el envío se descartaba en el mismo `forEach`
sin dejar ningún rastro visible, ni en esa tabla ni en el "KoBo pendientes"
propio de la dupla en `casos.html` (que matchea igual, contra sus propios
integrantes).

Pasó en producción: dupla C tuvo un reemplazo (Mia Cubero, no cargada como
integrante) que hizo 3 altas reales por KoBo. Ni la propia dupla C ni el
admin vieron nada — la dupla decía "cargué 3 casos" y en la plataforma
`personas` tenía 0 filas nuevas ese día. Se destrabó agregando a Mia (y de
paso a Pablo Daniel Carrizo, el otro fijo nuevo de dupla C) como integrantes
de dupla C — con eso el matching por nombre empieza a funcionar y sus envíos
aparecen como pendientes normales.

**Primer intento (revertido el mismo día):** se agregó a `admin-duplas.html`
la misma tabla "sin asignar" que ya tenía `dashboard.html`. En la práctica
resultó poco usable: el roster real tenía bastante más desactualización de
la esperada, así que la tabla se llenó de decenas de envíos de varios días
distintos sin ningún orden que ayudara a revisarlos uno por uno. Se sacó a
pedido de Agustina.

**Solución elegida:** en vez de una lista reactiva de "lo que ya se rompió",
una sección nueva "👥 Operadores por turno" en `admin-duplas.html` — el
roster completo (quién está cargado hoy en cada dupla activa, con DNI y
teléfono), ordenado por turno y dupla. Es una herramienta de revisión
proactiva: recorrerla turno por turno para detectar reemplazos no cargados
o nombres viejos ANTES de que generen un envío de KoBo invisible, en vez de
enterarse después por la tabla de "sin asignar". `cargarKoboPendientesAdmin()`
volvió a su comportamiento original (descarta en silencio lo que no
matchea) — la responsabilidad de que el roster esté al día pasó a ser
prevención (esta tabla), no detección reactiva.

No se tocó `casos.html`: agregar a la persona como integrante arregla el
matching ahí también, así que no hace falta ninguna vista adicional en la
cuenta de la propia dupla.

### 10.1.2 Filtro por fecha y duplicados directo en `casos.html` (16/9/2026)

Mismo día, pedido de Agustina viendo la lista de casos de dupla C (con los
duplicados de "Jorge Alejo Medina Avalos" a la vista):

- **Filtro por fecha de alta** en la barra de búsqueda de `casos.html`
  (`buscar-fecha`, junto a `buscar-input`/`buscar-dupla`) — a diferencia del
  selector de dupla, es visible para TODAS las cuentas (admin y dupla), no
  solo admin/coordinación. Filtra `personas.created_at` contra el rango UTC
  del día local elegido (Buenos Aires, UTC-3) — comparar contra el string de
  fecha a secas hubiera subcontado los casos cargados entre las 21:00 y las
  23:59 hora local, mismo bug de huso horario que ya se corrigió en
  `hoyStr()` en otras pantallas.
- **Posibles duplicados** directo en la pantalla de Casos
  (`duplicados-casos-box`, arriba de la lista de resultados) — mismo
  criterio y mismo mecanismo reversible (`personas.oculto`) que ya existía
  en `admin-duplas.html` (`revisarDuplicadosAdmin()`/`ocultarCasoAdmin()`),
  duplicado acá para no obligar a ir a otra pantalla. Respeta el RLS de cada
  cuenta: una dupla solo ve (y solo puede ocultar) sus propios duplicados.

### 10.1.3 Seguimiento de KoBo sin DNI no aparecía para validar (16/9/2026)

Reportado por Gastón Corrales (dupla E) por WhatsApp: cargó en KoBo un
"seguimiento" de un caso de ayer y, al entrar a Casos, no le apareció nada
para validar en la ficha de esa persona.

Causa: `cargarKoboDePersona()` matcheaba el envío contra la ficha SOLO por
DNI exacto (`p.persona.dni === persona.dni`). La rama de "Seguimiento" del
formulario de KoBo vuelve a preguntar el DNI (`dni_segui`, ver
`parseUmbral0()` en `config/umbral-0.js`) pero no es obligatorio — si la
dupla ya conoce a la persona y no lo vuelve a tipear (caso esperable: para
qué retipear un dato que la plataforma ya tiene), el envío queda sin DNI y
nunca iba a matchear contra ningún caso, quedando invisible para siempre.

Fix: se agregó un fallback por nombre normalizado, pero acotado — solo
aplica cuando el envío de KoBo no trae DNI, y solo dentro de la ficha de
UNA persona puntual ya abierta (no es una búsqueda global como
`cargarKoboPendientes()`, que sí necesita el paso extra de confirmación
manual de "posible continuación" por el riesgo de cruzar personas
distintas con nombres parecidos). Acá el riesgo es bajo y además la dupla
igual tiene que tocar "✅ Validar" a mano — el fallback solo hace que el
envío aparezca en la lista, no asocia nada solo.

### 10.1.4 "🔗 Asociar envío de KoBo" — matching manual cuando no hay nada estable (16/9/2026)

El caso real de Gastón/dupla E era Ariel Félix Sosa: nombre real cargado
(no un placeholder), pero sin DNI porque **lo perdió de verdad** (hay un
seguimiento que dice que lo iban a acompañar a hacer la denuncia de
extravío). El fallback por nombre de §10.1.3 en teoría podía matchear este
caso, pero es frágil: si en KoBo alguien tipea el nombre distinto a como
está cargado acá (ej. "Ariel Sosa" sin el segundo nombre "Félix"), el
string normalizado no coincide y no matchea. La dupla terminó cargando el
seguimiento a mano en la plataforma, antes de que este botón existiera.

Se agregó un botón "🔗 Asociar envío de KoBo" en la fila de acciones de la
ficha (`umbral-0/casos.html`, junto a "Registrar intervención"/"Pedir
derivación"). Abre un modal con los envíos de KoBo de los **últimos 14
días de la MISMA dupla** que todavía no están asociados a ningún caso
(ni automáticamente visibles en esta ficha, ni ya asociados a otra), para
que la dupla elija a mano cuál corresponde.

**Corrección el mismo día** (pregunta de Agustina: "¿además de asociar
debería poder marcar intervención o seguimiento?"): la primera versión
guardaba directo en `kobo_validaciones` al tocar "✅ Es este" — eso lo
marcaba como "ya validado" SIN pasar por el checklist de "¿qué hiciste con
este caso?", el mismo problema que motivó mover ese checklist adentro de
Validar en §10.1 (queda vacío para siempre salvo que alguien entre a mano
a "✏️ Editar nota", cosa que nadie hace). Se corrigió: "Asociar" ahora solo
agrega el envío al timeline en memoria y abre directo el modal de
"Validar envío de KoBo" de siempre — el guardado real (con el checklist y
la nota) pasa por ahí, igual que con cualquier otro envío.

Se mantiene el patrón de "posible continuación" que ya existía para la
lista general de pendientes, pero disponible desde CUALQUIER ficha — no
depende de que el caso ya tenga un nombre para sugerir la asociación, así
que también sirve para casos completamente sin identificar.

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
  KoBo en vez de `derivaciones`, y §4 ahora hace lo mismo por caso
  individual ("Envíos de KoBo de esta persona, auto-completados") — pero
  sigue sin resolverse **por qué** las duplas no usan esos dos botones:
  ¿el formulario es muy largo para cargarlo en el momento? ¿no saben que
  existe? ¿prefieren resolverlo por teléfono y ya está? Con el timeline
  ahora completándose solo desde KoBo, puede que directamente no haga
  falta que lo usen más — vale la pena preguntarles antes de invertir en
  rediseñar esos formularios.
- **Casos duplicados entre duplas** (sección 1): con `personas` ahora
  restringida por dupla, si una persona pasa por la zona de dos duplas
  distintas, la segunda no la encuentra al buscar y puede darla de alta
  de nuevo. Si en la práctica pasa seguido, la solución no es sacar el
  scope — sería algo más fino, como avisar "ya existe un caso con ese DNI
  en otra dupla, pedile acceso a tu referente" sin mostrar el detalle
  completo.
- **Casos duplicados DENTRO de la misma dupla, sin DNI para matchear**
  (encontrado 15/9 revisando la carga del día): además del doble-tap ya
  resuelto arriba, aparecieron altas de la misma persona repetidas en
  días distintos dentro de una misma dupla (ej. Dupla H) — el patrón es
  que el primer contacto queda sin DNI o con un valor basura escrito a
  mano en ese campo ("No responde", ".", "-" en vez de dejarlo vacío o
  usar `dni_denuncia_extravio`/`sin_identificar`), así que el buscador no
  lo encuentra en el contacto siguiente y la dupla termina dando de alta
  un caso nuevo para la misma persona. No es un bug de código — es un
  problema de qué se escribe en el campo DNI en el momento de la carga.
  Antes de tocar el formulario (¿bloquear texto no numérico en DNI?
  ¿advertencia si hay un nombre muy parecido ya cargado?), vale la pena
  preguntarle a las duplas por qué escriben eso en vez de dejarlo en
  blanco — puede ser que no sepan que pueden dejarlo vacío.
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
