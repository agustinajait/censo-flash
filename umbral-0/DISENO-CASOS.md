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

### 10.1.5 Filtros por fecha: `ultima_actividad`, no `created_at` (16/9/2026)

Reportado por Agustina: "cuando veo los casos por fecha o en vivo, no se
reflejan los casos de seguimiento, entonces parece que el operador no hizo
nada en su jornada". Tanto el filtro por fecha de `casos.html` (§10.1.2)
como el de `casos-en-vivo.html` filtraban por `created_at` (fecha de
ALTA) — un seguimiento sobre un caso de días atrás no tocaba ese campo,
así que un operador que solo hizo seguimientos (sin altas nuevas) en su
jornada parecía no haber hecho nada al filtrar por "hoy".

Fix: se agregó `ultima_actividad` a la vista `personas_listado_publico`
(mismo cálculo `GREATEST()` que ya usaba `personas_actividad` para
`casos.html` — alta + el más reciente entre intervenciones/seguimientos/
derivaciones) y ambas pantallas pasaron a filtrar por ahí en vez de por
`created_at`. `casos-en-vivo.html` de paso corrigió el mismo cuidado de
huso horario que ya se aplicó en otros lados (comparar el string de fecha
a secas contra un timestamp UTC subcuenta lo que pasó entre las 21:00 y
las 23:59 hora local) — antes comparaba `created_at.slice(0,10)` contra el
string de fecha del filtro directo, sin ese ajuste.

`casos-en-vivo.html` también suma una fila "Última actividad" en el
detalle de cada caso, al lado de "Cargado" (fecha de alta), para que se
entienda por qué un caso con alta vieja aparece en un rango reciente.

### 10.1.6 ⚠️ Incidente real: una dupla veía casos de otras duplas (16/9/2026)

Después de sumar `kobo_validaciones` al cálculo de `ultima_actividad`
(migración `ultima_actividad_incluye_kobo_validaciones`, para que validar
un envío de KoBo también cuente como actividad — pedido real: "dupla B
validó 4 casos hoy y ninguno se reflejaba"), varias duplas empezaron a
reportar casi al mismo tiempo: **"me aparecen casos de otras duplas"**.

Causa: la migración recreó `personas_actividad` con `CREATE OR REPLACE
VIEW ... AS SELECT ...`, pero sin repetir `WITH (security_invoker =
true)` — la cláusula que tenía la vista original (ver
`personas_actividad_para_seguimiento`, sept/2026: "la vista es
security_invoker") y que hace que corra con los permisos del usuario
logueado, respetando el RLS por-dupla de `personas`. Un `CREATE OR
REPLACE VIEW` que no repite esa cláusula la pierde silenciosamente,
aunque el resto de la definición sea idéntica — no tira ningún error.
Sin ella, la vista pasó a correr con los privilegios del owner, así que
el filtro `dupla_id = mi_dupla_id()` de la política RLS de `personas`
dejaba de aplicarse: cualquier dupla que buscara un caso en `casos.html`
veía las de las 13 duplas mezcladas, no solo la suya.

Estuvo así en producción **~17 minutos** (14:37 a 14:54 UTC) hasta que
las duplas lo reportaron y se corrigió con `ALTER VIEW ... SET
(security_invoker = true)` (no hace falta recrear toda la vista para
resetear una sola opción). Verificado después con `pg_class.reloptions`.

`personas_listado_publico` (la que usa `casos-en-vivo.html` con la anon
key) NO tiene este problema — a propósito NUNCA tuvo `security_invoker`,
porque su función es justamente bypasear el RLS por-dupla para mostrar
las 13 duplas mezcladas en una vista pública de coordinación. El
incidente fue solo en `personas_actividad`, la vista de uso interno
logueado.

**Lección para cualquier `CREATE OR REPLACE VIEW` futuro sobre una vista
ya existente**: revisar primero si la definición original tenía `WITH
(security_invoker = true)` (buscar en `schema-ajustes.sql`) y repetirlo
siempre en el reemplazo — perderlo no da ningún error, así que hay que
acordarse a propósito.

### 10.1.7 `integrantes.activo` — de columna muerta a baja lógica real (16/9/2026)

Otro incidente real encadenado con el de dupla C: al reemplazar a Rocio
Puebla Zabala y Marina Zabala por Pablo Daniel Carrizo y Mia Cubero (pedido
de Agustina, "van a ser fijos de dupla C"), se las sacó con un `DELETE`
real de `integrantes`. Resultado: dupla C dejó de ver como pendientes los
3 envíos de KoBo de ayer, porque el matching operador→dupla
(`misNombres`/`duplaPorNombre`, ver §10.1) los compara contra los
integrantes CARGADOS ACTUALMENTE — al borrar a Rocio y Marina, sus
nombres dejaron de matchear contra nada, ni en dupla C ni en ningún lado.

La columna `integrantes.activo` ya existía en el esquema (default `true`)
pero **no la usaba ningún lado del código** — ni un toggle en la UI, ni
ningún filtro en ninguna query. El único mecanismo real para sacar a
alguien del equipo era el botón 🗑️ "Eliminar", que hacía un `DELETE`
literal.

Fix: se recuperó a Rocio y Marina como integrantes de dupla C
(`activo=false`, para destrabar el matching de los 3 envíos viejos) y se
terminó de conectar `activo` en todo el código:

- **"Eliminar" ahora es baja lógica** (`update({activo:false})`, no
  `delete()`) — en `admin-duplas.html`, tanto para integrantes de dupla
  como para choferes (misma función `renderIntegranteRow`).
- **Las pantallas de ROSTER filtran por activo** (para que una persona
  dada de baja deje de aparecer como si siguiera en el equipo): el listado
  editable de "Duplas territoriales" (client-side, el embed de Supabase no
  filtra fácil un recurso anidado), "👥 Operadores por turno" (§10.1.1), la
  lista de choferes, y el gate obligatorio de "completá tus datos" de
  `casos.html` (si no, una persona dada de baja sin DNI/teléfono cargado
  podía quedar bloqueando el ingreso de la dupla para siempre).
- **El matching de KoBo (operador→dupla) NO filtra por activo, a
  propósito** — sigue comparando contra TODOS los integrantes que haya
  habido alguna vez en esa dupla, activos o no. Es la única forma de que
  un envío viejo hecho por alguien que ya no está en el equipo se pueda
  seguir reconociendo y confirmando.

### 10.1.8 Flash del login al navegar entre páginas (17/9/2026)

Reportado por Agustina: loggeada en `admin-duplas.html`, al tocar "Casos"
(o "Reporte") la llevaba de nuevo a la pantalla de login — "me toma
igualmente como ya estoy registrada pero tiene que ser como una sección
dentro del admin, no como una página aparte".

Causa: cada página de Umbral 0 es un HTML separado (no es una SPA), así
que navegar entre ellas es un reload completo — `casos.html`/
`admin-duplas.html` vuelven a arrancar de cero y `boot()` tiene que volver
a chequear la sesión con `getSession()` (async). El CSS tenía
`#app-screen, #denied-screen, ...` con `display:none` por defecto pero
**no incluía a `#login-screen`** — así que mientras `getSession()`
resolvía (aunque sea rápido), se veía el formulario de login un instante,
aunque la sesión siguiera siendo válida y `boot()` terminara mostrando
`app-screen` enseguida. No era un logout real ni pedía credenciales de
nuevo (por eso "me toma igual"), pero se sentía como volver a loguearse.

Fix: se agrega `#login-screen` a la lista de pantallas ocultas por CSS por
defecto, y una pantalla nueva `#loading-screen` ("Cargando…") que SÍ es
visible por defecto — es la única que se ve mientras `boot()` no resolvió
todavía. `showScreen()` la agrega a la lista que gestiona. De paso se
envuelve el `boot()` inicial en un `.catch()`: si falla (ej. error de red),
cae al login con el error a la vista en vez de quedar trabado en
"Cargando…" para siempre.

Aplicado en `casos.html` y `admin-duplas.html` (las dos páginas con
login). `casos-en-vivo.html` no tiene este problema — no tiene login,
usa la anon key directo.

### 10.1.9 Posibles duplicados: sacar el "el más viejo — sugerido para dejar" (17/9/2026)

Feedback de Agustina viendo duplicados reales (Mangel Sánchez x5, Elías
Simón Hernández x2): "no me convence que sugieras que el correcto es el
más viejo". Tenía razón — `revisarDuplicadosCasos()`/`revisarDuplicadosAdmin()`
marcaban el primer caso cargado (por fecha) con 🟢 y el texto "sugerido
para dejar", asumiendo que la carga más vieja era la más confiable. No
hay ninguna razón real para asumir eso — el caso más viejo puede tener
menos datos cargados que uno posterior.

Se sacó esa marca en las dos pantallas (`casos.html` y
`admin-duplas.html`): ahora los `N` casos de un grupo se muestran todos
con el mismo peso, cada uno con su propio botón "🙈 Ocultar" — ninguno
pre-señalado como "el bueno". En `casos.html` se agregó además "👁️ Ver
ficha" en cada uno, para poder revisar el contenido de cada caso antes de
decidir cuál ocultar (en `admin-duplas.html` no hay ficha propia — la
ficha vive en `casos.html` — así que ese botón no se agregó ahí).

### 10.1.10 "Ocultar" no sacaba el caso de la búsqueda + refuerzo del aviso de DNI duplicado (17/9/2026)

Reportado por Agustina: "oculté a Luciano Romero y sigue apareciendo".

Causa: `buscarPersonas()` (la búsqueda principal de `casos.html`) consulta
la vista `personas_actividad`, que **nunca filtraba `personas.oculto`** —
a diferencia de `personas_listado_publico`, que sí lo hacía desde que se
creó. Ocultar guardaba bien la marca en la base, pero esta vista la
ignoraba, así que el caso seguía apareciendo en la búsqueda (aunque ya no
en el cartel de "Posibles duplicados", que sí filtra `oculto` del lado
del cliente). Fix: se agrega `where coalesce(oculto,false)=false` a la
vista — manteniendo `security_invoker=true` explícito (ver incidente de
seguridad del 16/9, §10.1.6).

De paso, investigando el caso real de Luciano Romero (duplicado por DNI,
dupla F 15/9 y dupla C 17/9), se encontró que el aviso preventivo de "ya
existe este DNI" al dar de alta (existente de antes) tenía dos huecos:

- Si la consulta a `personas_dni_index` fallaba (red, permisos), el
  código lo atrapaba y dejaba guardar igual **sin avisar nada** — un
  fallo silenciaba justo la protección que se supone que evita
  duplicados. Ahora frena y pide reintentar en vez de seguir de largo.
- El botón "Crear de todas formas" era un solo click, fácil de apretar
  sin leer. Ahora hay que tildar primero una casilla ("Confirmo que es
  una persona distinta a la de arriba") para que el botón se habilite —
  mismo espíritu que el "escribí el nombre para confirmar" de "Eliminar
  caso", pero más liviano porque acá no es una acción destructiva.

También se encontró (achaque aparte, mismo patrón que `duplas_publico` en
su momento) que `personas_dni_index` tenía privilegios de escritura de
más para `anon`/`authenticated` heredados por default al crearse la
vista — revocados, queda solo `authenticated: SELECT` (esta vista expone
DNI real de todas las duplas, nunca debería ser legible sin login).

### 10.1.11 Reporte semanal — sección "f." con lo que confirman las duplas en la plataforma (17/9/2026)

Pregunta de Agustina revisando por qué "d. Intervenciones y derivaciones"
del reporte estaba en cero: "pero no les pregunta qué hiciste vos? y ese
dato cómo lo tomamos?" — refiriéndose a la casilla "¿Qué hiciste con este
caso?" que aparece al validar un envío de KoBo o registrar una
intervención en `casos.html` (`ACCIONES_INTERVENCION`, guardada en
`intervenciones.acciones` / `kobo_validaciones.acciones`).

Encontrado: ese dato existía desde hace rato y se mostraba caso por caso
en el Historial de cada ficha ("Qué se hizo — cargado por la dupla"),
pero **no se agregaba en ningún reporte** — ni en "d." (que depende de
`derivaciones`, la tabla que llena "Pedir derivación" y que sigue vacía)
ni en "e." (que lee directo la respuesta cruda de KoBo,
`termino_intervencion_diaria`). Es, en teoría, la fuente más confiable de
las tres: la confirma la propia dupla en la plataforma, con categorías
más completas que las de KoBo (suma CIS y teléfono rojo).

Se agrega como sección nueva **"f. Qué hicieron las duplas — confirmado
en la plataforma"**, en `admin-duplas.html` (pantalla y mensaje de
WhatsApp), `reporte-publico.html` y el JSON que se guarda en
`reportes_semanales.datos`. Fuente: `intervenciones.acciones` (ya
filtrado por `fecha` en el período, no hace falta re-consultar) +
`kobo_validaciones.acciones` (filtrado por `created_at`, con el mismo
criterio de límites de día local→UTC que `casos-en-vivo.html`, porque
esta tabla no tiene columna `fecha`).

De paso, `ACCIONES_INTERVENCION`/`ACCIONES_INTERVENCION_LABELS` — que
vivían solo adentro de `casos.html` — se movieron a
`config/umbral-0.js` (`accionesIntervencion`/`accionesIntervencionLabels`)
para que `admin-duplas.html`/`reporte-publico.html` no tuvieran que
duplicar el diccionario, mismo criterio que ya se usaba para
`terminoIntervencionLabels`.

**Sigue abierto** (explícito en el `section-hint` de la pantalla): no
está claro todavía si "f." termina reemplazando a "d." — si las duplas
nunca terminan usando "Pedir derivación" (§11, primer punto), puede que
"f." sea, en la práctica, el reemplazo real y "d." quede para sacar. Por
ahora se muestran las tres secciones por separado para poder comparar
con datos reales antes de decidir.

### 10.1.12 Puente KoBo ↔ checklist ↔ "Pedir derivación" (17/9/2026)

Charlando §10.1.11, Agustina confirmó dos cosas sobre cómo tiene que
funcionar el puente entre KoBo y la casilla "¿Qué hiciste con este
caso?": (1) el dato tiene que seguir levantándose como etiqueta propia
(no colapsar en texto libre, "porque necesitamos saber qué hace la
dupla"), y (2) a veces hace falta una instancia más después de KoBo —
pedir la derivación de verdad a un CIS o llamar a SAME — "y eso hay que
registrarlo porque además dentro de nuestro feature de derivación está
lo que tienen que completar para cada caso" (foto de DNI, informe
social, etc., según el tipo — ver glosario).

Dos cambios en `casos.html`, con las tablas de mapeo movidas a
`config/umbral-0.js` (únca fuente, no duplicar):

1. **Pre-tildado del checklist desde KoBo** (`KOBO_TERMINO_A_ACCION`):
   al abrir "Validar envío de KoBo" por primera vez (todavía sin fila en
   `kobo_validaciones`), se pre-tilda lo que tiene equivalente directo
   y sin ambigüedad con lo que la dupla ya contestó en
   `termino_intervencion_diaria` de KoBo — evita reescribir dos veces
   lo mismo. Los códigos de KoBo sin equivalente claro en el listado de
   la plataforma (`traslado_dipa`, `derivacion_internacion_asa`,
   `traslado_centro_barrial`, `derivacion_apoyo_familias`,
   `traslado_efector_neuropsiquiatrico`, `derivacion_adicciones_ambulatoria`)
   quedan **sin pre-tildar a propósito** — mejor no marcar nada que
   inventar una equivalencia dudosa. Si ya existe una validación previa,
   no se vuelve a pre-tildar encima (se respeta lo que la dupla eligió).
2. **Sugerencia de "Pedir derivación" al validar** (`ACCION_A_TIPO_DERIVACION`):
   si lo que se tilda en el checklist incluye algo con tipo de
   derivación formal equivalente (CIS, Casa Vincular, Programa
   Ciudadanía Porteña, SAME, Salud Mental, Policía de la Ciudad),
   `_mostrarSiguientePasoValidacion()` ofrece un botón puntual
   ("📨 Completar derivación a CIS") arriba de las opciones genéricas,
   que abre `abrirModalDerivacion(tipo)` con el tipo ya preseleccionado
   — reutiliza el mismo formulario/campos obligatorios de siempre, no
   crea un circuito paralelo. Tildar la casilla del checklist **no**
   reemplaza pedir la derivación de verdad — son dos registros
   distintos a propósito (uno es "qué pasó", el otro es "la solicitud
   formal con sus datos").

Validado con un script de Node que carga `config/umbral-0.js` en un
sandbox y verifica que ambos mapeos solo apunten a claves/tipos que
existen de verdad (`accionesIntervencion`/`derivacionOpciones`), más
casos simulados de pre-tildado y sugerencia.

### 10.1.13 "Pedir derivación" estaba roto para TODAS las cuentas de dupla desde el 3/9 (17/9/2026)

Encontrado en vivo: una dupla usó el botón nuevo de "Completar
derivación" (§10.1.12) y le saltó `No se pudo enviar la derivación: new
row violates row-level security policy for table "derivaciones"`.

**Causa raíz — esto reescribe lo que se había asumido en §11 ("Pedir
derivación"/"Registrar intervención" casi no se usan"):** el 3/9/2026 se
corrigió la FK `derivaciones.solicitado_por` para apuntar a `perfiles`
(la cuenta logueada real) en vez de `integrantes` — pero las tres
policies de RLS (`derivaciones_select`/`insert`/`update`) **nunca se
actualizaron para el mismo cambio**: seguían comparando `solicitado_por`
contra `integrantes.id`. Como `guardarDerivacion()` en `casos.html`
siempre guardó `solicitado_por: miPerfil.id` (un id de `perfiles`, no de
`integrantes`), esa condición no podía ser verdadera nunca para una
cuenta de dupla — **cualquier intento de "Pedir derivación" desde una
cuenta de dupla estaba bloqueado desde el 3/9/2026**, sin excepción.
Recién ahora, probando el botón nuevo de "Completar derivación", quedó
al descubierto — antes nadie había insistido lo suficiente con el error
silencioso/no reportado como para que se investigara.

O sea: **no era un problema de adopción** ("las duplas no usan el
botón"), era un bug de backend que lo rompía para todas. El § anterior
que especulaba sobre por qué las duplas no usaban el formulario queda
desactualizado en ese punto — sí lo intentaban, y fallaba.

Fix: las tres policies ahora comparan `solicitado_por` contra
`perfiles.id` con `dupla_id = mi_dupla_id()`, igual que ya usa
internamente la función `mi_dupla_id()`. Efecto secundario bueno: ahora
toda la dupla ve las derivaciones pedidas por cualquiera de sus
compañeros (no solo las propias) — que es lo que la UI ya esperaba (el
timeline distingue "vos" vs "equipo", ver `_renderTimelineItem` en
`casos.html`). Ya aplicado en producción — `derivaciones` va a empezar a
sumar filas reales a partir de ahora.

### 10.1.14 "KoBo sin identificar" — pendientes sin nombre ni DNI dejaban de existir para la plataforma (17/9/2026)

Reportado por dupla F: "Marcelo Gissi cargó 5 casos en KoBo (Primer
Acercamiento) pero no los veo en la plataforma". Confirmado con
Agustina: los 5 envíos no tenían nombre ni DNI (la persona no quiso
identificarse). Respuesta de Agustina al plantear el problema: "si la
persona no da nombre no es su culpa, tienen que aparecer y hacerle el
seguimiento".

Causa: "KoBo pendientes" (tanto `cargarKoboPendientes()` en `casos.html`
como `cargarKoboPendientesAdmin()` en `admin-duplas.html`) solo mostraba
envíos **con DNI** (`porDni`/`porDuplaYDni`). Un envío sin DNI solo se
mostraba si el nombre matcheaba un caso YA cargado (`posiblesContinuaciones`,
§4). Para un Primer Acercamiento sin nombre NI DNI no había ningún
mecanismo — el envío quedaba invisible para siempre, sin ningún aviso.
De paso se encontró un caso similar: un envío sin DNI **con** nombre
pero que no matcheaba ningún caso existente (persona nueva sin DNI)
tampoco se mostraba en ningún lado — mismo agujero, bonus fix.

Fix — nueva sección **"🙈 X envíos de KoBo sin nombre ni DNI"** en
`casos.html` (arriba de la búsqueda, junto a "KoBo pendientes") y
**"🙈 KoBo sin identificar"** en `admin-duplas.html` (solo lectura,
mismo criterio que la tabla de pendientes con DNI):

- `casos.html` (`koboSinIdentificarActuales`): envíos de mi dupla sin DNI
  y sin nombre que matchee un caso ya cargado (cubre tanto los
  completamente anónimos como los que sí tienen nombre pero son
  persona nueva). Botón **"➕ Cargar como 'Sin identificar'"** abre el
  alta con esa casilla ya tildada y el resto del prefill de KoBo
  (situación habitacional/económica/educativa/redes, igual que
  `confirmarKoboPendiente()` — se extrajo un helper común,
  `_prefillDesdeKobo()`). Un envío deja de aparecer acá en cuanto queda
  vinculado a un caso vía `kobo_validaciones` (por ejemplo, usando
  "🔗 Asociar envío de KoBo" desde la ficha recién creada — ver
  §10.1.9/§10.1.10 del "Asociar" original).
- `admin-duplas.html` (`cargarKoboPendientesAdmin()`, ahora calcula
  ambas tablas en el mismo fetch de KoBo para no duplicar la carga de
  ~3000 filas): mismo criterio pero simplificado a "sin DNI y sin
  nombre" (no trae el padrón de nombres por dupla que sí tiene
  `casos.html`) — cubre el caso real reportado. Muestra dupla/tipo/
  fecha/operador/detalle (`características` de KoBo si está), sin botón
  de acción — sigue siendo solo lectura, cada dupla resuelve los suyos
  desde Casos.

### 10.1.15 "Jornada de hoy completa" no tenía forma de reabrirse (17/9/2026)

Reportado por dupla K: "no puede iniciar jornada". Revisando la fila de
`jornadas` de hoy: marcó inicio a las 18:15 y fin a las 18:57 (42
minutos) — un "fin de jornada" claramente prematuro, seguramente sin
querer. El problema: `mostrarJornada()` en `casos.html` solo mostraba
el texto **"✅ Jornada de hoy completa"** cuando `jornadaHoy.fin` está
seteado — sin ningún botón. Con el turno todavía en curso y sin forma
de volver atrás desde la UI, la dupla quedó bloqueada hasta que alguien
lo arreglara a mano en la base.

Fix aplicado en caliente (Supabase, `jornadas.fin = null` en la fila de
hoy de dupla K, sin tocar `inicio`) y en el código: nuevo botón
**"↩️ Reabrir jornada"** junto al texto de "Jornada de hoy completa" —
`reabrirJornada()` vuelve a poner `fin = null` (conserva la hora real
de inicio) y la jornada pasa a "en curso" de nuevo, lista para marcar
fin cuando termine de verdad. Mismas policies de RLS que ya usaba
`marcarFinJornada()` (`jornadas_propia_dupla`, scope por `dupla_id`),
sin cambios de permisos necesarios.

### 10.1.16 Alta "Sin identificar" usa la geolocalización de KoBo (18/9/2026)

Agustina, revisando fichas reales de "sin identificar" (ej. Tomás
García, dupla K, varios "primer_acercamiento" seguidos con "No quiso
hablar" y nada más): "si cargó KoBo, alguna latitud tenemos que tener.
Y además si cargan en KoBo pero no les dan el DNI o la entrevista,
aunque sea el nombre o una descripción de la persona tiene que haber."

Confirmado: KoBo geolocaliza automáticamente **cada** envío (permiso de
ubicación del celular — no depende de que el operador cargue nada),
`parseUmbral0()` ya lo trae parseado como `lat`/`lng` (§10.1, campo
`_geolocation` de KoBo), pero nada del flujo de alta lo estaba usando
— el punto de contacto (único campo obligatorio en "Sin identificar")
quedaba en blanco a pesar de tener la coordenada disponible.

Fix en `_prefillDesdeKobo()` (`casos.html`), solo para el flujo "Sin
identificar" (`confirmarKoboSinIdentificar()`):

- `punto_contacto` se precarga con un link a Google Maps
  (`https://www.google.com/maps?q=lat,lng`) cuando el envío trae
  geolocalización — la dupla lo revisa/reemplaza por una dirección real
  si la tiene, pero ya no arranca vacío.
- `historia_breve` suma la ubicación (o aclara "sin ubicación en el
  envío" si KoBo no la trajo) y, si no hay `características` ni
  `observación de la persona`, un aviso pidiendo completar a mano
  alguna descripción (vestimenta, edad aproximada) para la próxima vez.
- El link al mapa también se agrega como columna nueva ("Ubicación") en
  la tabla de solo lectura de `admin-duplas.html` y como enlace extra
  en el recordatorio de `casos.html` — mismo dato, visible antes de
  siquiera abrir el alta.

El flujo "con DNI" (`confirmarKoboPendiente()`) no cambia — ese ya
tiene DNI/nombre como identificador principal, la ubicación de KoBo no
es su punto débil.

Validado con script de Node que reproduce `_prefillDesdeKobo()`
(4 casos: con geo, sin geo, con descripción, flujo con DNI sin tocar).

### 10.1.17 Duplicados falsos por texto de relleno en el campo DNI (18/9/2026)

Agustina, sobre el panel "⚠️ posibles duplicados" (screenshot con grupos
"DNI Nsnc" y "DNI ."): "ahí me aparecen como que son para identificar
porque no tienen DNIs, pero son casos diferentes. Uno es de alguien que
no sabe no contesta y otro es de personas que tienen el nombre pero no
el apellido. No los pongas como que están duplicados."

Confirmado con una consulta a `personas` (agrupando por `dni` con
`sin_identificar` y `dni is not null`): el campo `dni` tenía cargado
texto literal como `"Nsnc"` o `"."` en vez de quedar vacío con el
checkbox "Sin identificar" tildado. La detección de duplicados
(`porDni`, la misma lógica repetida en `casos.html`,
`admin-duplas.html` y `casos-en-vivo.html`) trataba ese texto como un
DNI real compartido y agrupaba como "duplicados" a personas que no
tienen nada que ver entre sí.

Fix: nuevo helper `esDniPlaceholderDup(dni)` — considera "relleno, no
DNI real" a un valor vacío, sin ningún caracter alfanumérico, o que
matchea variantes de "NN / SD / NS-NC / no sabe / no contesta / no
responde / sin datos". Se agregó igual en los tres archivos y la rama
`porDni` de la detección ahora es `if(dni && !esDniPlaceholderDup(dni))`
— un DNI real repetido se sigue agrupando como antes, un DNI de relleno
ya no agrupa a nadie por sí solo (si dos personas comparten además
nombre y apellido normalizados, siguen apareciendo agrupadas por esa
otra vía, que no cambió).

Validado con script de Node que reproduce `porDni`/`porNombre` sobre
los casos exactos del screenshot ("DNI Nsnc" con 2 personas, "DNI ."
con 3 personas) más dos regresiones (DNI real repetido, nombre repetido
sin DNI) — los 4 checks pasan.

### 10.1.18 El mismo problema de §10.1.17, pero en el apellido (18/9/2026)

Con §10.1.17 ya en producción, Agustina reporta que el panel de posibles
duplicados bajó de 8 a 6, pero seguía viendo uno que no correspondía.
Confirmado en la base: dos personas distintas, ambas cargadas como
`nombre="Juan"` y `apellido="-"` (el operador tipeó "-" en vez de dejar
el apellido vacío) — mismo patrón que el DNI de relleno, pero esta vez
en el campo `apellido`, y la agrupación por nombre (`porNombre`, la que
se usa cuando no hay DNI) no tenía ningún filtro para eso: normalizaba
"Juan -" para las dos y las agrupaba como si compartieran apellido real.

Fix, mismo criterio que §10.1.17 y reutilizando el mismo helper
(`esDniPlaceholderDup`, ya genérico — no es específico de DNI a pesar
del nombre): antes de agrupar por nombre, ahora se exige que `apellido`
esté presente y no sea relleno (`if(apellido && !esDniPlaceholderDup(apellido))`).
Si el apellido está vacío o es relleno, esa persona ya no entra en
`porNombre` — dos personas con el mismo nombre de pila pero sin apellido
real cargado no se agrupan más, tal como pidió Agustina en §10.1.17
("uno es de alguien que no sabe no contesta y otro es de personas que
tienen el nombre pero no el apellido. No los pongas como que están
duplicados"). Un nombre+apellido real repetido (con o sin DNI) se sigue
detectando igual que antes.

Validado con script de Node que reproduce el caso exacto ("Juan"/"Juan"
con apellido "-") más tres regresiones (nombre+apellido real repetido
sin DNI, DNI real repetido, nombre repetido con apellido vacío) — los 4
checks pasan.

### 10.1.19 Excepción a "solo seguimiento" para Casa Vincular/ASA cuando KoBo ya registró la derivación (18/9/2026)

Agustina reporta un caso real: César Osmar Colman Lovera (DNI 1840781),
dado de alta a partir de un envío de KoBo donde el equipo territorial ya
registró que la persona aceptó ir a Casa Vincular en ESE mismo contacto
(`kobo_validaciones.acciones` incluye `derivacion_casa_vincular` para su
envío). Al validar el caso y tocar "Pedir derivación → Casa Vincular", el
sistema lo bloqueaba: "Este recurso solo está habilitado para casos en
seguimiento (la persona todavía no tiene más de un contacto
registrado)" — la regla de §5.2 (`soloSeguimiento`, derivada de
`intervencionesActuales.length > 1`) no contempla que el propio KoBo del
único contacto ya haya registrado la aceptación.

Confirmado que la regla en sí no es un bug — viene del documento
original ("únicamente para los seguimientos de los equipos
territoriales") — pero no contemplaba esta situación real. Agustina pidió
ajustarla: "Ajustá la regla, por favor."

Fix: nueva excepción puntual a `soloSeguimiento`, solo para Casa
Vincular/ASA. Cada config suma `koboCodigoHabilitante` (el código de
`termino_intervencion_diaria` de KoBo que corresponde a esa derivación —
`derivacion_casa_vincular` / `derivacion_internacion_asa`, ver
`TERMINO_INTERVENCION_LABELS` en `config/umbral-0.js`). Nuevo método
`Casos._koboYaRegistroDerivacion(cfg)` revisa `koboEventosActuales` (los
envíos de KoBo ya asociados a esa persona, cargados por
`cargarKoboDePersona()`) buscando ese código. El gate en
`_renderSubformDerivacion()`/`guardarDerivacion()` pasa de
`!Casos.esSeguimiento()` a `!Casos.esSeguimiento() &&
!Casos._koboYaRegistroDerivacion(cfg)` — sigue bloqueando cuando no hay
ninguna de las dos señales, y ya no bloquea cuando el contacto único que
existe ya trae en KoBo la aceptación de esa derivación puntual. Un caso
con 2+ intervenciones sigue habilitado igual que antes, sin depender de
KoBo. Mensaje de error actualizado para mencionar la nueva vía.

Nota: como `koboEventosActuales` se completa aparte (asíncrono, no
bloquea abrir la ficha — ver 4), si la dupla abre "Pedir derivación" antes
de que termine de cargar, el chequeo da `false` y se comporta como antes
(bloqueado) — no hay falso positivo, en el peor caso hay que reabrir el
modal una vez que cargó.

Validado con script de Node que reproduce el gate (`soloSeguimiento` +
`esSeguimiento` + `_koboYaRegistroDerivacion`) sobre el caso real de
César, más: sin señal de KoBo (sigue bloqueado), con
`koboEventosActuales` todavía vacío (sigue bloqueado, no rompe), con 2+
intervenciones (sigue habilitado sin depender de KoBo), código de Casa
Vincular no habilita ASA y viceversa, y un tipo sin `soloSeguimiento`
(CIS) no se ve afectado — los 7 checks pasan.

### 10.1.20 "d. Intervenciones y derivaciones" no puede quedar vacío en el reporte que se entrega a gobierno (18/9/2026)

Con la sección "e. Derivaciones y contactos según KoBo (terreno)" ya
andando, Agustina necesitaba entregar el reporte semanal a gobierno en
minutos y la sección "d. Intervenciones y derivaciones" (la que sale de
`derivaciones`, la tabla que llena "Pedir derivación" en casos.html)
seguía en cero para el período — el reporte se lo iba a entregar así.
Pidió explícitamente: "las derivaciones de nuestra plataforma no pueden
quedar vacías. De última, poner el mismo dato que levantamos en KoBo,
[o] eliminar la sección."

Se eligió la primera opción (más informativa que borrar la sección):
cuando "d." no tiene ninguna derivación cargada en la plataforma para el
período **y** "e." sí tiene datos de KoBo, la tabla y el KPI "Total
derivaciones" de "d." muestran en su lugar el desglose de KoBo (mismos
datos que "e.", con las columnas "Efectivizadas"/"Rechazadas" en "—"
porque KoBo no distingue eso) — la sección deja de aparecer vacía, con
una nota aclarando la fuente. Si "d." sí tiene datos propios, no cambia
nada (la plataforma sigue siendo la fuente cuando existe). Si ni "d." ni
"e." tienen datos, se mantiene el mensaje original de "sin derivaciones
en el período" — no se inventa un cero disfrazado de dato.

Aplicado en los dos lugares que renderizan esta tabla: `admin-duplas.html`
(pestaña Reporte, donde se genera) y `reporte-publico.html` (el link que
efectivamente se comparte con gobierno — el snapshot congelado en
`reportes_semanales.datos` trae `koboOutcomes` desde que se agregó la
sección "e.", así que el fallback funciona igual sobre reportes ya
publicados sin tener que regenerarlos).

Validado con script de Node que reproduce las 4 combinaciones
(plataforma vacía + KoBo con datos → usa KoBo; plataforma vacía + sin
KoBo → mensaje original; plataforma vacía + KoBo vacío → mensaje
original; plataforma con datos reales → usa plataforma, ignora KoBo) —
los 4 checks pasan.

### 10.1.21 "Hacer DNI" formalizado (1) vs. personas que en realidad lo necesitan (§10.1.20 continuación, 18/9/2026)

Con "d." ya sin quedar vacía, Agustina miró el desglose real y notó algo
que no cerraba: "Hacer DNI: 1" — "revisá que se haya hecho solo 1 DNI,
me parece poco". Confirmado con una consulta a `personas`: hay **39**
personas cargadas con `dni_denuncia_extravio = true` (la dupla ya marcó
en la ficha que la persona no tiene DNI y necesita el trámite) pero
**solo 1** tiene el trámite formalizado como derivación "Hacer DNI" en
la plataforma. No es un error de conteo — "d." cuenta bien lo que hay en
`derivaciones` — es el mismo patrón de siempre (§10.1.13 y el propio
§10.1.20): las duplas marcan la denuncia de extravío en la ficha pero
casi nunca formalizan el trámite con "Pedir derivación → Hacer DNI".

A diferencia de §10.1.20, acá el fallback de KoBo no sirve: KoBo no
tiene un código propio de "Hacer DNI" en `termino_intervencion_diaria`,
así que ni "d." (con su fallback) ni "e." lo capturan. La única fuente
confiable es el campo dedicado `personas.dni_denuncia_extravio`, que ya
se estaba trayendo en el reporte (columna del `select` de `personas`)
pero nadie lo cruzaba contra `derivaciones`.

Pedido explícito: "cambialo el [c]ódigo y veamos después cómo reforzar
que las duplas lo carguen en nuestra plataforma" — lo segundo (reforzar
la carga) queda pendiente como punto de proceso/capacitación, no es
código (ver sección 11).

Fix: `calcularReporte()` suma `dniPendientes = { personasConDenunciaExtravio,
derivacionesHacerDni }` (ambos ya calculables con los datos que el
reporte ya trae, sin queries nuevas). En "d.", si
`personasConDenunciaExtravio > derivacionesHacerDni`, se agrega una nota
aparte (no se mezcla con la fila "Hacer DNI" de la tabla, que sigue
siendo la cifra formal real) con los dos números y cuántas personas les
faltaría iniciar el trámite. Como `dni_denuncia_extravio` es un estado
de la ficha sin fecha propia (no un evento), la nota aclara que es foto
actual, no acotada al período — mismo criterio que "c. Evolución de los
casos". Igual que con `koboOutcomes` (§10.1.20), se suma a `datos` en
`publicarReporte()` para que también aparezca en el link público de
`reporte-publico.html` — a diferencia de `koboOutcomes`, este campo es
nuevo, así que los reportes publicados ANTES de este fix no lo van a
tener hasta que se regenere y publique uno nuevo.

Validado con script de Node que reproduce el caso real (39 vs. 1 → se
muestra la nota), más regresiones: todas formalizadas → no se muestra;
sin denuncias de extravío → no se muestra; `dniPendientes` ausente
(reporte viejo) → no rompe, no se muestra — los 4 checks pasan.

**Backfill puntual (21/9/2026, one-off, no forma parte del código):**
Agustina pidió resolver el hueco de una vez para la entrega: "necesito
que pase a derivación DNI a las personas que tienen ese trámite como
nota". Se corrió un `INSERT ... SELECT` (con `NOT EXISTS` como guarda
contra duplicados) que creó la derivación "Hacer DNI" formal para las 41
personas con `dni_denuncia_extravio = true` que todavía no la tenían —
`estado: 'solicitado'` (ninguna está realmente efectivizada todavía, eso
se mantuvo honesto), con una `observación` aclarando que se generó a
partir de la denuncia ya cargada, no de un "Pedir derivación" hecho en
el momento. Confirmado después: 42 con denuncia de extravío = 42 con
derivación formal.

### 10.1.22 Trazabilidad de la resolución de una derivación (21/9/2026)

Con el backfill de arriba ya mostrando "Hacer DNI: 42" en el reporte,
Agustina preguntó lo obvio: "¿cómo hace el operador para validar que la
persona fue e hizo el trámite? Porque necesito mostrar la
trazabilidad." Revisando el código, dos problemas reales:

1. El selector para cambiar el estado de una derivación (solicitado →
   efectivizado/rechazado) en el timeline de la ficha solo se le
   mostraba a admin/coordinación — el operador (rol `dupla`) no tenía
   forma de tocarlo, aunque el permiso de UPDATE en la base **ya se lo
   permitía** para las derivaciones de su propia dupla (RLS de
   `derivaciones`: mismo criterio de `solicitado_por` que el SELECT). La
   UI era más restrictiva que el permiso real.
2. Aunque alguien cambiara el estado, no quedaba ningún rastro de CÓMO
   se confirmó: `fecha_resolucion` existe como columna desde el
   principio pero nunca se escribía, y `observaciones` (columna de texto
   de la tabla, además de la key homónima dentro de `datos`) tampoco se
   usaba. Cero trazabilidad real, ni para admin.

Antes de tocar permisos se le preguntó a Agustina el alcance (quién
puede resolver, qué evidencia exigir) — eligió las dos opciones
recomendadas: el operador que la pidió (o cualquiera de su misma dupla,
ver más abajo) además de admin/coordinación, y fecha automática + nota
obligatoria (sin foto por ahora).

Fix en `casos.html`:

- `puedeGestionar` pasa de `['admin','coordinacion']` a
  `['admin','coordinacion','dupla']`. No hace falta filtrar más fino por
  `solicitado_por` en el cliente: si una fila de derivación ya aparece en
  el timeline de una cuenta `dupla`, es porque el SELECT de RLS ya la
  dejó pasar (mismo `dupla_id` que `solicitado_por`) — el mismo criterio
  vale para el UPDATE, así que mostrar el control ahí es seguro. `cliente`
  sigue sin poder (solo lectura por RLS, no cambia).
- El `<select>` de estado ahora llama a
  `Casos.cambiarEstadoDerivacion(id, nuevoEstado)`: si el nuevo valor es
  `solicitado`/`en_espera`/`aprobado` (estados intermedios), actualiza
  directo como siempre (`actualizarEstadoDerivacion()`, sin cambios). Si
  es `efectivizado` o `rechazado` (los dos estados de RESOLUCIÓN, los que
  necesitan trazabilidad), abre un modal (`_abrirModalResolucionDerivacion()`)
  que pide una nota obligatoria ("¿Cómo se confirmó?") antes de guardar
  nada — si cancela, se vuelve a pintar la ficha para que el `<select>`
  no quede mostrando un valor no guardado.
- `confirmarResolucionDerivacion()` guarda en la misma fila: `estado`,
  `fecha_resolucion: now()` (la columna que ya existía) y `observaciones`
  = la nota (la columna de texto de la tabla, ya se mostraba en el
  timeline si tenía algo — antes nunca tenía nada). El timeline ahora
  también muestra "✅ Resuelta el <fecha>" cuando `fecha_resolucion` está
  cargada.
- No se tocó RLS — el permiso de UPDATE para `dupla` ya existía desde
  antes, esto solo destraba la UI para usarlo.

Nota de alcance para el backfill de las 41 derivaciones de arriba: se
insertaron con `solicitado_por = null`, lo que las hacía invisibles para
cuentas `dupla` bajo RLS (el SELECT de `dupla` exige `solicitado_por` en
su propia dupla — `null` nunca matchea). Se corrigió con un UPDATE
puntual que les asignó el perfil de la dupla correspondiente a cada
persona (`personas.dupla_id` → `perfiles.dupla_id`), así quedaron
visibles y gestionables por la dupla que corresponde, no solo por
admin/coordinación.

Validado manualmente (sin script de Node — depende del DOM real del
modal): balance de `<div>` y chequeo de sintaxis de los bloques
`<script>` de `casos.html` sobre el archivo completo, más revisión
cruzada de que las funciones nuevas (`cambiarEstadoDerivacion`,
`_abrirModalResolucionDerivacion`, `_cancelarResolucionDerivacion`,
`confirmarResolucionDerivacion`) están todas referenciadas donde
corresponde.

### 10.1.23 Botón "🪪 Trámites de DNI pendientes" (21/9/2026)

Con §10.1.22 ya dándole al operador la forma de marcar una derivación
como resuelta, faltaba la otra mitad: cómo se ENTERA de cuáles tiene
pendientes sin tener que acordarse caso por caso. Pedido: "quiero que
agregues una pestaña o botón en duplas de color que dice pendientes o
validar trayectoria o algo para que los operadores entren a revisar y
hagan el seguimiento. Trámites de DNI pendientes podría ser" — nombre
tomado tal cual lo propuso.

Nuevo botón en la topbar de `casos.html` (visible para todas las
cuentas, no solo admin/coordinación como "👥 Duplas" — es el propio
operador quien tiene que revisar), con el conteo de pendientes en el
texto (`cargarDniPendientesCount()`, se llama al entrar a la app igual
que `cargarKoboPendientes()`/`revisarDuplicadosCasos()`, sin bloquear).
Al tocarlo (`Casos.mostrarDniPendientes()`) se abre una vista nueva
(`view-dni-pendientes`) con la lista de derivaciones "Hacer DNI" sin
resolver (`estado` distinto de `efectivizado`/`rechazado`), cada una con
fecha del pedido y hace cuántos días — tocar cualquiera abre esa ficha
directo (`Casos.abrirFicha()`) para hacer el seguimiento con el flujo de
§10.1.22. RLS ya scopea `derivaciones`/`personas` por dupla para cuentas
`dupla`, así que la lista sale scopeada sola, sin filtrar nada a mano en
el cliente. El contador se refresca solo después de resolver una
derivación desde `confirmarResolucionDerivacion()`.

Es una lista DISTINTA del `dniPendientes` del reporte semanal (§10.1.21,
`admin-duplas.html`): ese cuenta personas por `dni_denuncia_extravio`
(para el número agregado de gobierno); esta cuenta derivaciones "Hacer
DNI" reales sin resolver (para que el operador entre caso por caso) —
mismos datos de fondo, pero un número puede no coincidir exactamente con
el otro si alguien carga la denuncia de extravío sin pasar todavía por
"Pedir derivación" (para eso está el backfill de §10.1.21, que ya cerró
ese hueco una vez).

Validado manualmente (sin script de Node — depende del DOM real):
balance de `<div>` y chequeo de sintaxis de los bloques `<script>` de
`casos.html`, más grep cruzado de que todos los ids nuevos
(`link-dni-pendientes`, `view-dni-pendientes`, `dni-pendientes-list`) y
funciones (`cargarDniPendientesCount`, `Casos.mostrarDniPendientes`,
`Casos._renderDniPendientes`) están referenciados en todos los lugares
que hacían falta (mostrarlo al entrar, ocultarlo al volver a buscar o
abrir una ficha, refrescarlo al resolver una derivación).

### 10.1.24 Mapa de puntos visitados (21/9/2026)

Pedido: "agregás un mapa con los puntos que visitaron los operadores?".
Se confirmó el alcance con Agustina antes de tocar código: en los dos
lugares (reporte semanal para gobierno + dashboard en vivo), no solo uno.

Fuente de los puntos: `_geolocation` de KoBo, la misma que ya usa
`historia_breve`/"Ver ubicación" (§10.1.16) y la sección "e." del reporte
(§10.1.20-ish, `calcularOutcomesKobo()`) — no hay que agregar ningún dato
nuevo, cada envío ya trae `lat`/`lng` parseados por `parseUmbral0()`.

**Decisión de color** (consultado el skill de dataviz antes de elegir):
NO se le asigna un color distinto a cada dupla. Son ~13 duplas, muy por
encima del tope de 2-3 categorías que un mapa (comparación "todos contra
todos", no una serie ordenada) puede sostener con colores distinguibles
para daltonismo — más allá de eso hay que pasar a "Other" o a otra
codificación. Se usa un solo color de marcador (`--blue` del propio
dashboard, `#1a56db`) y la identidad (tipo de intervención, fecha) va en
el popup al tocar cada punto — codificación compuesta en vez de color
por categoría.

**Implementación**: nuevo archivo `shared/js/mapa-puntos.js` —
`renderMapaPuntos(containerId, puntos)`, reusado en los tres lugares en
vez de triplicar la lógica de Leaflet:

- Carga Leaflet (JS+CSS) desde cdnjs solo la primera vez que hace falta,
  sin bloquear el resto de la página si no se usa esa sección.
  Mosaico de OpenStreetMap (gratis, sin API key).
- Un solo color de marcador (`circleMarker`), sin librería de clustering
  aparte (se evaluó `leaflet.markercluster`, se descartó para no sumar
  una segunda dependencia externa que no se puede probar en vivo desde
  este entorno — mejor una sola librería bien probada que dos con más
  superficie de falla).
- Reusa la instancia del mapa por `containerId` entre renders (filtros de
  fecha, resolución de un caso, etc.) en vez de recrearlo cada vez — solo
  limpia y vuelve a poner los marcadores.
- Si no hay ningún punto con geolocalización, igual muestra el mapa
  (centrado en CABA) con un aviso al pie, no lo oculta.

**Dónde quedó conectado**:

- `dashboard.html`/`dashboard-engine.js`: nueva tarjeta "🗺️ Puntos
  visitados" en la sección de Umbral 0, `renderUmbral0()` llama a
  `renderMapaPuntos('u0-map', rows...)` al final — respeta el mismo
  filtro de fecha que ya tenía el resto de esa sección, sin pedir nada
  nuevo a KoBo (reusa `rows`, ya en memoria).
- `admin-duplas.html`: `calcularOutcomesKobo()` ahora también junta
  `puntos` (mismo forEach que ya arma `conteo`, sin pedidos nuevos) y lo
  devuelve junto con `totalEnvios`/`conteo`; `renderReporte()` agrega el
  mapa dentro de la tarjeta de "a. Cobertura territorial" y llama a
  `renderMapaPuntos('reporte-map', r.koboOutcomes.puntos)` al final.
- `reporte-publico.html`: mismo mapa con los `puntos` que ya viajan
  dentro de `koboOutcomes` en el snapshot publicado — como `koboOutcomes`
  ya se guarda entero en `publicarReporte()` (§10.1.20), no hizo falta
  tocar ese archivo para que `puntos` llegue al link público; reportes
  publicados ANTES de este fix no van a tener `puntos` (van a mostrar el
  mapa vacío con el aviso) hasta que se regenere y publique uno nuevo.

Validado: `node --check` sobre `shared/js/mapa-puntos.js` y
`dashboard-engine.js`, balance de `<div>` y sintaxis de los bloques
`<script>` de los tres HTML tocados, script de Node que reproduce el
armado de `puntos` dentro de `calcularOutcomesKobo()` (excluye
correctamente envíos sin geolocalización, de gente fuera del equipo y
fuera del rango de fechas) — los 3 checks pasan. **No se pudo probar en
un navegador real** (sin acceso de red desde este entorno a KoBo ni a
los CDN de Leaflet) — pedirle a Agustina que confirme que el mapa
efectivamente carga y muestra puntos en los tres lugares la primera vez
que los abra.

### 10.1.25 Resumen del día + mensaje de WhatsApp al cerrar la jornada (21/9/2026)

Pedido: "que tal si todos los días cuando la dupla hace el cierre se crea
un informe de los casos diarios y después podemos generar un mensaje de
WhatsApp así lo comparte con el grupo y nos queda la info más a mano
guardada". El "cierre" al que se refiere es `marcarFinJornada()` (botón
"⏹️ Marcar fin de jornada" en `jornada-box`, ver sección 4) — hay un
archivo aparte, `cierre.html` (formulario de GeoTracker/clima/
inconvenientes), pero ESE no es el punto de enganche: es un form
distinto, no tiene relación con el conteo de casos.

No hizo falta ninguna tabla nueva para "que quede guardado": los datos
de fondo (`personas`/`intervenciones`/`derivaciones`/`seguimientos`) ya
son permanentes — lo que faltaba era juntarlos al momento del cierre y
dejarlos a mano para compartir. El propio mensaje de WhatsApp, una vez
compartido al grupo, es el "archivo" que pidió Agustina — no se duplica
el dato en Supabase.

**Cuándo se calcula**: `mostrarJornada()` ya se llama después de cada
acción de jornada (inicio/fin/reabrir) y al entrar a la app — cuando el
estado es `'completa'` (jornada de hoy con `fin` cargado), dispara
`cargarYRenderResumenDia()` (no bloqueante). Si la dupla reabre la
jornada a la mañana siguiente sin querer, el resumen simplemente no se
muestra (mismo criterio que el resto de "completa").

**Qué cuenta, todo acotado a HOY (rango UTC del día LOCAL, mismo
criterio de huso horario que `buscarPersonas()`/`hoyStr()` — Buenos
Aires es UTC-3) y a la propia dupla**:
- Casos nuevos: `personas` con `created_at` de hoy.
- Casos recontactados: `persona_id` distintos en `intervenciones` de hoy
  que NO están entre los casos nuevos de hoy — mismo criterio que
  "b. Población abordada" de `calcularReporte()`, acotado a un día.
- Intervenciones registradas hoy (todas las filas, sin dedup por
  persona).
- Derivaciones pedidas hoy, con desglose por tipo. `derivaciones` no
  tiene `dupla_id` propio — no hace falta filtrar a mano, el SELECT de
  RLS ya scopea a las propias (mismo criterio que §10.1.22).
- Seguimientos agregados hoy.

**El mensaje**: `Casos.abrirModalMensajeCierre()` arma un texto plano
(dupla, fecha, horario de inicio/fin de la jornada, los 5 números de
arriba) en un modal con tres botones:
- **📱 Compartir por WhatsApp** — abre `https://wa.me/?text=<mensaje
  codificado>`, que abre WhatsApp (app o web) con el texto ya cargado y
  la dupla elige el chat del grupo ahí mismo — no hace falta guardar el
  número del grupo en ningún lado ni pedirlo.
- **📋 Copiar** — mismo patrón que `copiarMensaje()` del reporte semanal
  en `admin-duplas.html`, por si prefieren pegarlo a mano.
- **Cerrar**.

Validado: balance de `<div>` y chequeo de sintaxis de los bloques
`<script>` de `casos.html` sobre el archivo completo, grep cruzado de
que todos los ids/funciones nuevos están referenciados donde
corresponde, y script de Node que reproduce el cálculo de
nuevos/recontactados/derivaciones-por-tipo sobre casos sintéticos
(intervención repetida sobre el mismo caso viejo no duplica el
recontactado; caso nuevo tocado hoy no cuenta como recontactado; día sin
actividad da todo en cero sin romper) — los 7 checks pasan.

### 10.1.26 El mismo resumen diario, pero desde el admin (21/9/2026)

Pedido inmediato después de §10.1.25: "y que se pueda hacer desde el
admin por dupla y por día". Nueva pestaña en `admin-duplas.html`, "📅
Resumen diario" (junto a "Duplas y equipo" y "Reporte semanal") — mismo
cálculo y mismo mensaje que ve la dupla al cerrar su jornada, pero
eligiendo cualquier dupla y cualquier día en vez de "hoy, mi propia
dupla".

Diferencia real con el lado de la dupla (no es un copy-paste): en
`casos.html`, una cuenta `dupla` ya viene limitada por RLS a sus propios
datos, así que ni hace falta filtrar `derivaciones` por dupla a mano (el
SELECT ya viene scopeado). Acá admin/coordinación ven TODAS las duplas,
así que hay que armar el scope a mano: se trae la lista de `persona_id`
que pertenecen a la dupla elegida (`personas.dupla_id`) y se filtran las
derivaciones del día con `.in('persona_id', esaLista)` — sin esto, el
resumen de una dupla mostraría derivaciones de cualquier otra. Caso
límite cubierto explícitamente: si la dupla elegida todavía no tiene
ningún caso cargado (`idsPersonasDupla` vacío), NO se corre la consulta
de derivaciones sin filtro — se deja en cero directamente, para no traer
por error las derivaciones de todas las demás duplas.

`personas`/`intervenciones`/`seguimientos` sí tienen `dupla_id` propio,
así que esos se filtran directo con `.eq('dupla_id', duplaId)`, igual
que del lado de la dupla.

El mensaje (`armarMensajeDiarioAdmin()`) es texto casi idéntico al que
arma `Casos.abrirModalMensajeCierre()` del lado de la dupla (mismo
formato, mismos emojis) — no se reusa literalmente el mismo código
porque viven en archivos y contextos distintos (uno depende de
`resumenDiaHoy`/`jornadaHoy` de `casos.html`, el otro del resultado de
la consulta de admin), pero el texto que le llega a la dupla es
reconocible sea cual sea el origen.

Validado: balance de `<div>` y chequeo de sintaxis de los bloques
`<script>` de `admin-duplas.html`, grep cruzado de que todos los
ids/funciones nuevos están referenciados donde corresponde, y script de
Node que reproduce el cálculo — incluyendo el caso de derivaciones
"cruzadas" (una derivación de otra dupla en el mismo período no se cuela
en el resumen) y el caso límite de una dupla sin casos (no rompe, no
trae de más) — los 5 checks pasan.

### 10.1.27 El resumen diario con el detalle, no solo números (21/9/2026)

Con §10.1.25/§10.1.26 ya andando (casos.html y admin-duplas.html),
Agustina pidió más: "el resumen tiene que tener el resumen de las
intervenciones, los casos con la info" — un número solo ("3 casos
nuevos") no alcanza, hace falta saber CUÁLES y qué pasó en cada
intervención. Mismo espíritu que ya tenía `armarListadoCasos()` del
reporte semanal (§9, "necesito poder ver los casos también").

Cambio en los dos lugares (mismo criterio, cada uno con su propia
fuente de datos — no hay código compartido entre `casos.html` y
`admin-duplas.html` para esto, ver nota de §10.1.26):

- `casosNuevos`/`casosRecontactados` pasan de ser un número a ser un
  array de personas (`id, nombre, apellido, dni, sin_identificar`) — se
  listan con `nombreDisplay()`/`nombreDisplayReporte()` (fallback "Persona
  sin identificar") y el DNI si lo tienen, o "sin identificar" si
  corresponde.
- Nueva clave `intervenciones`: cada intervención del día con su persona
  ya resuelta (no dedup por persona — si hubo dos intervenciones sobre el
  mismo caso en el día, se listan las dos), el `tipo`, las `acciones`
  tildadas (traducidas con `accionesIntervencionLabels`) y el `resumen`
  libre si lo cargaron.
- Para resolver nombre/DNI de los RECONTACTADOS hace falta una consulta
  aparte a `personas` (no vienen en la consulta de "altas de hoy"):
  - Lado dupla (`casos.html`): solo pide los `id`s recontactados
    puntuales, con `.in('id', idsRecontactadas)` — no trae toda la
    dupla.
  - Lado admin (`admin-duplas.html`): ya estaba pidiendo TODOS los
    `persona_id` de la dupla para el filtro de derivaciones (§10.1.26) —
    se aprovechó esa misma consulta (ahora trae nombre/DNI en vez de
    solo `id`) para resolver los recontactados también, sin sumar una
    consulta nueva.
- El mensaje de WhatsApp (los dos lados) ahora lista los casos y las
  intervenciones en vez de solo contarlos — headers en mayúscula por
  sección para que se lea bien en el celular. El textarea de
  `admin-duplas.html` (`#diario-texto`) subió el `min-height` de 180px a
  260px porque el texto es bastante más largo ahora.

Validado: balance de `<div>` y sintaxis de los bloques `<script>` de
`casos.html` y `admin-duplas.html`, y script de Node que reproduce el
armado de `casosNuevos`/`casosRecontactados`/`intervenciones` con
persona resuelta — incluye el caso de una intervención sobre una persona
que no aparece en ninguna de las dos listas (oculta, o un error de
datos): la intervención igual se lista, con `persona: null`, en vez de
romper o desaparecer en silencio — los 6 checks pasan.

### 10.1.28 Observaciones diarias obligatorias, de la dupla al reporte semanal (21/9/2026)

Pedido: "hay que mejorar la experiencia de usuario. Necesitamos sí o sí
que el operador cargue todos los días información sobre su desempeño,
creá un feature de observaciones diarias libre para sumar al reporte
diario y que después se sumen al reporte semanal." Tres partes.

**1. Columna nueva**: `jornadas.observaciones` (text, nullable a nivel
de base — lo "obligatorio" se exige en la UI, no con un CHECK/NOT NULL,
para no romper filas viejas ni bloquear `marcarInicioJornada()`, que no
toca esta columna). Migración `jornadas_add_observaciones`, documentada
también en `schema-ajustes.sql`.

**2. Mandatorio al cerrar la jornada** (`casos.html`): "Marcar fin de
jornada" ya no guarda `fin` con un solo click — ahora
`abrirModalCierreJornada()` abre un modal que pide el texto ("¿Cómo
estuvo la jornada de hoy?", obligatorio) y recién al confirmar,
`marcarFinJornada()` guarda `fin` + `observaciones` juntos en el mismo
UPDATE. Si cancela el modal, la jornada sigue "en curso" — no hay forma
de cerrarla sin cargar el texto. La observación queda visible en
"Jornada de hoy completa" y se suma al mensaje de WhatsApp del cierre
(§10.1.25/27), en una sección nueva "💬 OBSERVACIONES DEL DÍA".

**3. Se suma a los dos reportes que ya existían**:
- **Resumen diario del admin** (`admin-duplas.html`, §10.1.26): nueva
  consulta a `jornadas` (dupla + fecha elegidas, `maybeSingle()` porque
  puede no existir la fila todavía) — se muestra y se suma al mensaje de
  WhatsApp igual que del lado de la dupla.
- **Reporte semanal** (`admin-duplas.html` + `reporte-publico.html`):
  nueva sección **"g. Observaciones diarias del equipo"** — junta
  `jornadas.observaciones` de TODAS las duplas en el período elegido
  (filtro de vacíos hecho en el cliente, no server-side, para no
  depender de sintaxis de filtro sin probar antes en este código —
  `.filter(j => (j.observaciones||'').trim())`), agrupado por dupla y
  fecha. Es un dato distinto de "Alertas y desvíos" (`alertas-texto`,
  que sigue siendo texto editorial que escribe coordinación a mano) —
  "g." es lo que cada dupla vivió y cargó ese día, sin que nadie lo
  reescriba. Se suma en las 4 salidas del reporte: pantalla
  (`renderReporte()`), mensaje de WhatsApp (`armarMensaje()`), snapshot
  publicado (`publicarReporte()` → `datos.observacionesDiarias`) y su
  render en `reporte-publico.html`.

Validado: balance de `<div>` y sintaxis de los bloques `<script>` de los
tres archivos tocados (`casos.html`, `admin-duplas.html`,
`reporte-publico.html`), grep cruzado de que todos los identificadores
nuevos están referenciados en los 4 lugares del reporte semanal, y
script de Node que reproduce el armado de `observacionesDiarias` —
filtra observaciones vacías/solo-espacios y jornadas viejas sin este
campo (`null`), resuelve el código de dupla, y no rompe si una
`dupla_id` no está en el mapa (cae a "—") — los 4 checks pasan.

### 10.1.29 "Demanda espontánea" para CIS (21/9/2026)

Pedido: "agregá también la opción de demanda espontánea, para casos que
cargan en KoBo — demanda espontánea son los casos de personas que en el
primer contacto quieren ir a un CIS". Cierra un hueco marcado desde
hacía rato en el propio código del reporte (comentario en
`generarReporte()`, `admin-duplas.html`): "Origen de cada derivación a
CIS (espontánea vs. seguimiento) — no se guarda ese dato en
`derivaciones.datos` todavía". El concepto ya existía en el resto de la
app (el quiz ya distingue "a diferencia de Casa Vincular, CIS admite
demanda espontánea"; el aviso rápido de "🚨 Avisar a coordinación" ya
tiene una opción "CIS espontáneo" al handy rojo) pero nunca había quedado
como un dato guardado y reportable.

Dos partes, en `config/umbral-0.js` y `casos.html`:

1. **Checklist "¿Qué hiciste con este caso?"** (`ACCIONES_INTERVENCION`)
   — nueva opción `demanda_espontanea_cis`, "para casos que cargan en
   KoBo" literal: es exactamente el checklist que se usa al validar un
   envío de KoBo (`abrirModalValidarKobo()`) además de al registrar una
   intervención manual. KoBo no tiene una pregunta propia para esto
   (mismo caso ya documentado de CIS y teléfono rojo), así que queda
   sin pre-tildar en `KOBO_TERMINO_A_ACCION` — la dupla la tilda a
   mano. Se sumó a `ACCION_A_TIPO_DERIVACION` (→ 'CIS') para que,
   igual que "Derivación a CIS", sugiera completar el formulario
   formal de "Pedir derivación" al tildarla.
2. **Campo "Origen de la derivación" en el formulario de CIS**
   (`TIPOS_DERIVACION_CONFIG['CIS']` y su espejo en
   `RESUMEN_DERIVACION_CONFIG['CIS']`, para que también salga en el
   informe que se copia a WhatsApp) — select con "Demanda espontánea
   (primer contacto)" / "Seguimiento", precargado según
   `Casos.esSeguimiento()` de la ficha abierta pero editable (es una
   propuesta, no una verdad asumida). Este es el dato que efectivamente
   cierra el hueco del reporte — vive en `derivaciones.datos.origen`,
   visible en el timeline de la ficha (ya renderiza genérico todo lo
   que hay en `datos`) sin tocar nada más.

No se tocó el reporte semanal todavía para agregar un conteo agregado de
"espontánea vs. seguimiento" — por ahora el dato queda capturado y
visible por caso (ficha + informe de CIS) y en el conteo de "f." (vía
`demanda_espontanea_cis`); agregarlo como columna propia en "d." queda
para cuando haya volumen real para evaluar cómo se ve.

Validado: `node --check` sobre `config/umbral-0.js`, balance de `<div>`
y sintaxis de los bloques `<script>` de `casos.html`, y grep cruzado de
que `demanda_espontanea_cis` está en `ACCIONES_INTERVENCION` y
`ACCION_A_TIPO_DERIVACION`, y ausente de `KOBO_TERMINO_A_ACCION` a
propósito.

### 10.1.30 "Mis derivaciones y seguimientos" (21/9/2026)

Pedido: "en duplas habría que poder ver mis derivaciones, mis
seguimientos, etc" — mientras se trabajaba en §10.1.29. Hasta ahora, la
única forma de ver una derivación o un seguimiento era abrir la ficha
del caso puntual y mirar su timeline — no había ninguna vista que
juntara TODAS las derivaciones o TODOS los seguimientos de la propia
dupla en un solo lugar (mismo hueco que ya resolvía §10.1.23 pero solo
para "Hacer DNI" sin resolver — acá es cualquier tipo/estado).

Nuevo botón "📋 Mis derivaciones y seguimientos" en la topbar de
`casos.html` — a diferencia de "🪪 Trámites de DNI pendientes"
(§10.1.23, visible para todas las cuentas), este solo se muestra para
cuentas `dupla`: "mi dupla" no significa nada para admin/coordinación,
que ya ven todo desde `admin-duplas.html`.

Abre una vista con dos listas, cada card lleva directo a
`Casos.abrirFicha()`:
- **Mis derivaciones**: las últimas 100 (`.order('fecha_solicitud',
  {ascending:false}).limit(100)`), cualquier tipo o estado — RLS ya
  scopea `derivaciones` a la propia dupla (mismo criterio de
  `solicitado_por`, §10.1.22), no hace falta filtrar a mano.
- **Mis seguimientos**: las últimas 100 (`.order('fecha',
  {ascending:false}).limit(100)`), con un extracto del contenido (120
  caracteres). `seguimientos` tiene su propia policy de RLS con el mismo
  criterio (`dupla_id = mi_dupla_id()`), confirmada antes de escribir el
  código (no asumida por analogía con `derivaciones`, que usa
  `solicitado_por` en vez de `dupla_id` directo).

Nombre/DNI de cada caso se resuelve con una sola consulta a `personas`
(todas las de mi dupla, vía RLS) en paralelo con las otras dos, mismo
patrón que `cargarYRenderResumenDia()`/`cargarDniPendientesCount()`.

El límite de 100 es a propósito — sin filtro de fecha para mantenerlo
simple en esta primera versión; si en la práctica el volumen lo pide,
sumar un filtro de fecha (mismo patrón que `buscar-fecha` en la vista de
búsqueda) es un cambio chico sobre esta base.

Validado: balance de `<div>` y chequeo de sintaxis de los bloques
`<script>` de `casos.html` sobre el archivo completo, grep cruzado de
que todos los ids/funciones nuevos (`link-mi-actividad`,
`view-mi-actividad`, `mis-derivaciones-list`, `mis-seguimientos-list`,
`Casos.mostrarMiActividad`) están referenciados en los lugares que
hacían falta (mostrar el link solo a `dupla`, ocultar la vista al volver
a buscar o abrir una ficha), y confirmación directa contra las policies
de RLS de `derivaciones` y `seguimientos` (no asumidas) antes de escribir
las consultas.

### 10.1.31 El resumen diario con descripción de caso y de la intervención (21/9/2026)

Con §10.1.27 ya listando casos e intervenciones (no solo números),
Agustina lo siguió viendo "muy sintético": "necesito que venga con una
descripción de caso y de la intervención de la dupla" — un nombre y un
tipo no alcanzan, hace falta saber DE QUÉ SE TRATA cada uno.

Dos partes, en `casos.html` y `admin-duplas.html` (mismo criterio,
código separado, como el resto de este feature):

1. **Descripción de caso**: las consultas a `personas` (altas de hoy y
   recontactados) ahora también piden `historia_breve` — la misma
   narrativa que ya se arma en la ficha (KoBo + carga manual, ver
   §10.1.16) — y se muestra truncada a 180 caracteres debajo de cada
   caso listado, tanto en pantalla como en el mensaje de WhatsApp.
2. **Resumen de la intervención**: ya estaba en pantalla desde §10.1.27
   (`intervenciones.resumen`, el campo libre de "Registrar
   intervención") pero **faltaba en el mensaje de WhatsApp** — el
   `intervTxt` de `abrirModalMensajeCierre()`/`armarMensajeDiarioAdmin()`
   armaba la línea sin `i.resumen`, a diferencia de la versión HTML que
   sí lo tenía. Se agregó ahí también, completo (sin truncar — a
   diferencia de `historia_breve`, que puede ser largo por acumular
   varios contactos, el resumen de una sola intervención de un día
   puntual suele ser corto).

Validado: balance de `<div>` y chequeo de sintaxis de los bloques
`<script>` de los dos archivos, y script de Node que reproduce
`truncar()` (corta a N + "…", no toca texto corto, no rompe con
null/undefined, recorta espacios de los bordes) y el armado de las
líneas de caso/intervención con y sin el dato opcional — los 8 checks
pasan.

### 10.1.32 "Contacto espontáneo" (tipo de intervención) confundía con "demanda espontánea" (CIS)

Viendo el resumen recién agregado (§10.1.31), Agustina preguntó: "¿qué
sería 'contacto_espontaneo' acá? Porque contacto espontáneo es solo
cuando se encuentran con una persona en la calle que quiere ir a un CIS
— entonces es como que no es nuestra población." Confusión real y
entendible: `intervenciones.tipo` tiene un valor `contacto_espontaneo`
que se usaba como texto crudo en varios lugares, y ese mismo texto
literal coincide con la jerga del equipo para algo totalmente distinto
(§10.1.29, `demanda_espontanea_cis`: alguien que en el primer contacto
pide ir a un CIS).

Raíz del problema: `contacto_espontaneo` (tipo de intervención) es una
clasificación AMPLIA de cualquier intervención — primer contacto vs.
seguimiento sobre un caso ya conocido, ver el dropdown "Tipo" al
registrar una intervención y el alta automática de cada caso nuevo
(`guardarPersona()`, que crea la primera intervención con
`tipo:'contacto_espontaneo', resumen:'Ingreso inicial del caso.'`) — no
tiene nada que ver con CIS. Pero se mostraba tal cual (valor crudo, sin
pasar por ninguna etiqueta legible) en el timeline de la ficha, en el
resumen diario y en el mensaje de WhatsApp — ahí es donde generaba la
lectura errónea de "esta persona no es nuestra población".

Fix — no se tocó el valor guardado en la base (`contacto_espontaneo`
sigue siendo la clave; cambiarla sería una migración de datos
innecesaria para lo que es un problema de redacción, no de modelo), solo
la ETIQUETA visible:

- Nuevo `TIPO_INTERVENCION_LABELS` en `config/umbral-0.js` —
  `contacto_espontaneo: 'Primer contacto'`, `seguimiento: 'Seguimiento
  en territorio'` — expuesto como `window.PROJECT_CONFIG_UMBRAL_0.tipoIntervencionLabels`,
  mismo patrón que `accionesIntervencionLabels`/`terminoIntervencionLabels`.
- Opción del dropdown "Tipo" al registrar una intervención (`casos.html`)
  renombrada de "Contacto espontáneo" a "Primer contacto" — mismo valor
  (`contacto_espontaneo`), otro texto.
- Los 4 lugares que mostraban `tipo` crudo ahora pasan por el mapa de
  etiquetas: timeline de la ficha ("🚶 Intervención — ..."), resumen
  diario en pantalla y en el mensaje de WhatsApp (`casos.html` y
  `admin-duplas.html`, los mismos 4 puntos que se tocaron en §10.1.31
  para agregar `resumen`).

Validado: `node --check` sobre `config/umbral-0.js`, balance de `<div>`
y sintaxis de los bloques `<script>` de los dos archivos, grep de que no
queda ningún lugar mostrando `i.tipo`/`it.data.tipo` de una intervención
sin pasar por el mapa de etiquetas (confirmado también que
`casos-en-vivo.html` y `reporte-publico.html` no tienen este patrón, no
hacía falta tocarlos), y script de Node que reproduce la resolución de
etiquetas (mapea los dos valores conocidos, cae al valor crudo para uno
desconocido en vez de romper, no rompe con vacío/`undefined`) — los 4
checks pasan.

### 10.1.33 "Sin identificar" ya no se ve todo igual en la lista de búsqueda (22/9/2026)

Contexto real: las duplas están cargando muchos casos "sin identificar"
(en vez de completar KoBo correctamente), y Agustina reporta confusión:
"como dice 'caso sin identificar' siempre, parecen repetidos" — más
"en la vista de la dupla los casos sin identificar no tienen que estar
mezclados con los que sí [están identificados]". Dos pedidos, un mismo
`renderPersonaCard()`/`buscarPersonas()` en `casos.html`.

**1. Separar en dos grupos** (`buscarPersonas()`): la lista de resultados
ya no es un solo bloque ordenado por actividad — se parte en "Casos
identificados (N)" y "Casos sin identificar (N)", cada uno con su propio
`section-label`, manteniendo el orden que ya traía la consulta (más
viejo sin tocar primero) dentro de cada grupo. No se tocó la consulta en
sí (sigue trayendo hasta 40, ordenados por `ultima_actividad`) — el
split es solo al renderizar.

**2. Alguna forma de distinguirlos** (`renderPersonaCard()`):
`nombreDisplay()` da siempre el mismo texto genérico ("Persona sin
identificar") para estos casos — no cambia, sigue siendo lo correcto en
el resto de la plataforma (timeline, mensajes de WhatsApp, etc., donde
se ve UN caso a la vez, no una lista). Acá, específicamente en la
tarjeta de la lista, se agrega lo único que sí varía de un caso "sin
identificar" a otro:

- Título: "Sin identificar · {fecha y hora del alta}" en vez del genérico
  a secas.
- Subtítulo: zona/comuna si las tiene cargadas: si no, y si
  `punto_contacto` es un link de Google Maps crudo (patrón de §10.1.16,
  el caso más común para estos altas), "📍 Con ubicación cargada" en vez
  de mostrar la URL entera (ilegible en una tarjeta chica); si no hay
  nada de eso, "Sin punto de contacto cargado".

No se tocó `nombreDisplay()` en sí ni ningún otro lugar que lo use —
cambio acotado a la tarjeta de la lista, que es donde se reportó la
confusión.

Validado: balance de `<div>` y chequeo de sintaxis de los bloques
`<script>` de `casos.html`, confirmación directa de que
`personas_actividad` (la vista de la que sale la lista) trae las
columnas que hacían falta (`created_at`, `punto_contacto`, `zona`,
`comuna`, `sin_identificar`), y script de Node que reproduce el armado
de título/subtítulo y la agrupación — dos casos "sin identificar" con
datos distintos ya no dan el mismo título, un link de mapa crudo no se
muestra como URL, un caso identificado no cambia de comportamiento, y la
agrupación separa y preserva el orden correctamente — los 7 checks
pasan.

### 10.1.34 Botón dedicado "🙈 Casos sin identificar" (22/9/2026)

Viendo el flujo de "KoBo pendientes" (envíos sin nombre ni DNI que
todavía no tienen caso, con su botón "➕ Cargar como 'Sin
identificar'"), Agustina pidió: "una vez que los acepta, quiero que haya
una pestaña o botón donde ver los sin identificar" — §10.1.33 ya los
agrupaba aparte, pero solo dentro de los resultados de una búsqueda
puntual en curso. Esto es una vista dedicada, siempre disponible en la
topbar, sin tener que tocar el buscador.

Nuevo botón "🙈 Casos sin identificar" (con contador, mismo patrón que
"🪪 Trámites de DNI pendientes" — §10.1.23), visible para todas las
cuentas. `cargarSinIdentificarCount()` trae de `personas_actividad`
(no `personas` directo — hace falta `ultima_actividad`, que
`renderPersonaCard()` usa para el badge de "hace N días sin
seguimiento") todos los casos con `sin_identificar=true` y
`oculto=false`, ordenados igual que el resto de la búsqueda (más viejo
sin tocar primero). La vista (`Casos.mostrarSinIdentificar()` /
`_renderSinIdentificar()`) **reusa `renderPersonaCard()` tal cual** — ya
tiene desde §10.1.33 el título/subtítulo pensados para estos casos
(fecha de alta, zona/comuna o aviso de ubicación en vez de la URL
cruda), no hizo falta escribir nada nuevo para las tarjetas.

El contador se refresca solo después de guardar cualquier alta o
edición de persona (`guardarPersona()`) — cubre tanto crear un caso sin
identificar nuevo como "identificarlo" después (completar nombre y
apellido) o al revés, en un solo punto.

Validado: balance de `<div>` y chequeo de sintaxis de los bloques
`<script>` de `casos.html` sobre el archivo completo, y grep cruzado de
que todos los ids/funciones nuevos están referenciados en los lugares
que hacían falta (mostrar/ocultar la vista junto con el resto, refrescar
el contador después de guardar una persona).

### 10.1.35 Vista "📅 Cierres de jornada" — armar el mensaje de un día pasado (22/9/2026)

Agustina pidió: "hace foco en el reporte diario para que lo manden las
duplas. tienen que armar mensaje y copiar tb así lo mandan a grupo" — al
preguntar qué faltaba exactamente (el flujo de armar/copiar/compartir el
mensaje de cierre ya existía desde §10.1.25/§10.1.27/§10.1.31), aclaró el
problema real: "que marcan el fin de la jornada pero si se olvidan
después no lo pueden mandar". El botón "📱 Armar mensaje de WhatsApp"
solo aparecía dentro del resumen del día de **hoy** (`resumen-dia-box`,
visible cuando `jornadaHoy.fin` está cargado) — si la dupla cerraba la
jornada y no mandaba el mensaje en el momento, al otro día `jornadaHoy`
ya es la de ese nuevo día y no había forma de volver a generarlo.

Cambios en `casos.html`:

- **Refactor** de `cargarYRenderResumenDia()`: la lógica de cálculo
  (casos nuevos/recontactados, intervenciones, derivaciones,
  seguimientos de un día) se extrajo a `calcularResumenDiaParaFecha(fecha)`,
  que ya no depende de "hoy" — recibe la fecha como parámetro y devuelve
  el objeto resumen sin tocar `resumenDiaHoy` (esa variable global sigue
  existiendo, pero ahora es solo la "foto" del día de hoy que usa el
  resumen que se ve al cerrar jornada).
- **Refactor** de `Casos.abrirModalMensajeCierre()`: el armado del texto
  del mensaje se extrajo a `construirTextoCierre(jornada, resumen, fecha)`,
  función de módulo que no depende de las globales `jornadaHoy`/
  `resumenDiaHoy`. De paso corrige un bug latente: antes la fecha del
  encabezado del mensaje se armaba con `new Date().toLocaleDateString()`
  (siempre HOY, sin importar de qué jornada fuera el resumen) — inofensivo
  mientras solo se usaba el mismo día, pero rompía apenas se reutilizara
  para un día pasado. Ahora usa `fmtFechaSolo(fecha)` sobre la fecha real
  de la jornada.
- Nuevo botón en la topbar "📅 Cierres de jornada" (mismo patrón que
  "📋 Mis derivaciones y seguimientos" — solo para cuentas dupla) y vista
  `Casos.mostrarCierresJornada()` que lista, desde `jornadas`, las últimas
  30 jornadas de mi dupla con `fin` cargado (más reciente primero), cada
  una con fecha, horario, un extracto de las observaciones del día y un
  botón "📱 Armar mensaje" por fila.
- `Casos.abrirModalMensajeCierreFecha(fecha, btnEl)`: al tocar "Armar
  mensaje" de una fila, busca la fila de `jornadas` de esa fecha, calcula
  el resumen con `calcularResumenDiaParaFecha(fecha)`, arma el texto con
  `construirTextoCierre()` y abre el mismo modal de siempre (mismo textarea
  `#ta-mensaje-cierre`, mismos botones "📱 Compartir por WhatsApp" /
  "📋 Copiar" — `Casos.compartirWhatsappCierre()`/`Casos.copiarMensajeCierre()`
  no cambiaron, ya eran genéricos porque leen del textarea, no de una
  variable global).
- El flujo de HOY (`Casos.abrirModalMensajeCierre()`, disparado desde el
  botón dentro de `resumen-dia-box` al cerrar la jornada) sigue funcionando
  igual que antes, ahora como un caso particular de las mismas funciones
  compartidas.

Validado con un script de Node aparte (`construirTextoCierre` extraída y
probada standalone): el mensaje de un cierre de hace 3 días muestra la
fecha de ESE día (no la de hoy), incluye sus propias observaciones,
casos e intervenciones, y no rompe cuando no hay fila de `jornadas` para
la fecha pedida (usa "—" en los horarios y "(sin cargar)" en
observaciones) — 8 checks, todos pasaron. También balance de `<div>`
(281/281), chequeo de sintaxis de los 4 bloques `<script>`, y grep
cruzado de que `link-cierres-jornada`/`view-cierres-jornada`/
`cierres-jornada-list` y las funciones nuevas están conectados en todos
los puntos donde hacía falta (mostrar/ocultar vista, mostrar el link solo
para cuentas dupla).

### 10.1.36 Bug: `TIPO_INTERVENCION_LABELS is not defined` rompía el resumen del día (22/9/2026)

Encontrado armando capturas reales de `casos.html` para un instructivo de
WhatsApp (Agustina pidió "un instructivo con una imagen real del
producto"), no reportado por el equipo — el sandbox de esta sesión no
tiene acceso a Supabase/CDNs, así que se armó una página local con datos
de ejemplo para sacar las capturas, y ahí saltó un `ReferenceError:
TIPO_INTERVENCION_LABELS is not defined` al intentar renderizar el
resumen del día.

Causa: §10.1.32 agregó 3 usos del identificador suelto
`TIPO_INTERVENCION_LABELS` en `casos.html` (en `_renderResumenDia()`,
`construirTextoCierre()` y el timeline de la ficha), asumiendo el mismo
patrón que `ACCIONES_INTERVENCION_LABELS` — pero nunca se agregó el alias
local `const TIPO_INTERVENCION_LABELS = window.PROJECT_CONFIG.tipoIntervencionLabels;`
que ese patrón necesita. `config/umbral-0.js` envuelve **todo** el
archivo en un IIFE (`(function(){ ... })()`), así que su propio `const
TIPO_INTERVENCION_LABELS` interno no es una variable global — solo queda
expuesto a través de `window.PROJECT_CONFIG_UMBRAL_0.tipoIntervencionLabels`,
que hay que leer explícitamente del lado de `casos.html` (`admin-duplas.html`
ya lo hacía bien, vía `window.PROJECT_CONFIG.tipoIntervencionLabels`
directo en el sitio de uso — ahí nunca hubo bug).

Por qué no lo agarró la validación de siempre: el chequeo de sintaxis
(`new Function(codigoDelScript)`) solo confirma que el código PARSEA —
un identificador libre que no existe todavía es sintácticamente válido
(podría ser una global de otro script), el error recién aparece en
**tiempo de ejecución**, la primera vez que ese código corre de verdad.
Como nunca se había podido probar en un navegador real contra datos
reales (sin acceso de red desde este entorno, ver notas en PRs
anteriores), este bug viajó sin detectar desde §10.1.32 hasta ahora —
rompía silenciosamente el resumen del día, el mensaje de cierre de
jornada y el timeline de intervenciones de la ficha, siempre que hubiera
al menos una intervención para mostrar.

Fix: agregado `const TIPO_INTERVENCION_LABELS = window.PROJECT_CONFIG.tipoIntervencionLabels;`
en `casos.html`, mismo lugar y mismo patrón que `ACCIONES_INTERVENCION_LABELS`
un renglón arriba.

Validado con capturas reales del producto (ver más abajo) mostrando el
resumen del día, el mensaje de cierre y el timeline funcionando con las
etiquetas de tipo de intervención resueltas correctamente ("Primer
contacto" / "Seguimiento en territorio" en vez de reventar) — además del
balance de `<div>` y chequeo de sintaxis de siempre.

### 10.1.37 Capturas reales del producto para instructivos (22/9/2026)

Pedido de Agustina: "dame un instructivo con una imagen real del producto
así les comparto al grupo de WhatsApp de cómo tiene que hacer el cierre
la dupla". El sandbox de esta sesión no tiene acceso de red a
Supabase/CDNs/el sitio deployado (confirmado varias veces en sesiones
anteriores), así que no se puede ni loguear en la app real ni sacarle una
captura al sitio en producción.

Se armó un mecanismo aparte (fuera del repo, en el scratchpad de la
sesión, no versionado) para generar capturas **reales** igual: sirve
`casos.html` con sus mismos `config/umbral-0.js` y CSS por HTTP local, e
intercepta únicamente `shared/js/supabase-client.js` para reemplazarlo
por un mock que responde con datos de ejemplo usando la misma forma de
API (`client.from(tabla).select().eq()... → {data, error}`) en vez de
conectarse a Supabase — todo el resto (HTML, CSS, la lógica de
`casos.html`) es el código real, sin tocar. Con Playwright (Chromium
local) se recorrió el flujo real: entrar a la app → ver el resumen del
día con "Armar mensaje de WhatsApp" → abrir ese modal → ir a "📅 Cierres
de jornada" → armar el mensaje de un día pasado. Este proceso fue el que
encontró el bug de §10.1.36 (nunca se había podido ejecutar este código
contra datos reales hasta ahora).

No se agrega este script al repo — es una herramienta puntual para este
pedido, no parte del producto ni de su test suite.

### 10.1.38 Nueva sección en el Glosario: "Cierre de jornada y mensaje de WhatsApp" (22/9/2026)

Pedido de Agustina: "agregalo al glosario" — el instructivo que se le
mandó por WhatsApp para explicar el flujo de cierre de jornada (§10.1.37)
también queda como sección permanente en `instructivo.html`
("📖 Glosario", accesible desde el topbar de `casos.html`), con el mismo
criterio que ya usa la sección "Cómo usar Casos" (`pasos-timeline`, un
paso por tarjeta con emoji + título + descripción + captura).

Las 4 capturas del mensaje de WhatsApp (§10.1.37) se movieron de
scratchpad al repo, en `umbral-0/capturas/` junto a las que ya existían
de la sección "Cómo usar Casos" (numeradas 6 a 9, siguiendo la misma
convención): `6-resumen-dia-armar-mensaje.png`, `7-modal-mensaje-cierre.png`,
`8-cierres-de-jornada.png`, `9-modal-mensaje-dia-pasado.png`.

Nueva sección `id="cierre-jornada"` (con su entrada correspondiente en el
índice `.toc` de arriba de la página), insertada entre "Cómo usar Casos"
y "Herramientas de registro", con los mismos 3 pasos del instructivo de
WhatsApp: marcar fin de jornada → armar/compartir el mensaje del día →
"📅 Cierres de jornada" para un día pasado.

Validado: balance de `<div>` (225/225) y `<figure>` (9/9), chequeo de
sintaxis del único bloque `<script>` del archivo, y grep cruzado de que
el `id="cierre-jornada"` nuevo tiene su entrada en el índice y las 4
imágenes referenciadas existen en `umbral-0/capturas/`.

### 10.1.39 Zonas operativas dibujadas en el mapa en vivo del Dashboard (22/9/2026)

Contexto: analizando los puntos reales de KoBo (§10.1.37) para la reunión
con gobierno, Agustina compartió el My Maps real del equipo (KML/KMZ,
`mid=17rIU9xQLt-di5U-caHpcdEQhMQO1rMA`) con el polígono asignado a cada
dupla, los comedores/instituciones de referencia de las duplas "iglesias"
(que no patrullan una zona fija — visitan un lugar en un horario fijo:
C/F/I/L/M) y el contorno general "Zona Frontera" del reporte DGREA. Pidió:
"quiero que en el mapa en vivo de mi plataforma esté el mapa que debemos
recorrer nosotros delimitado, así podemos comparar si estamos en zona o
no".

Cambios:

- **`config/umbral-0.js`**: nuevo `ZONAS_OPERATIVAS_UMBRAL_0` — polígonos
  de las 8 duplas con zona de patrullaje (A/B/D/E/G/H/J/K), los comedores
  de referencia de las 5 duplas "iglesias" (C/F/I/L/M, cada una con 1-2
  polígonos), y el contorno "Zona Frontera". Extraído del KML exportado
  del My Maps, coordenadas redondeadas a 5 decimales (~1m de precisión).
  Expuesto como `window.PROJECT_CONFIG_UMBRAL_0.zonasOperativas`. Sin
  sincronización automática con el My Maps — si cambian los polígonos ahí,
  hay que re-exportar el KML y regenerar este bloque a mano.
- **`shared/js/mapa-puntos.js`**: `renderMapaPuntos(containerId, puntos, zonas)`
  ahora acepta un tercer parámetro opcional. Si se pasa, dibuja los
  polígonos en una capa aparte (`capaZonas`, agregada al mapa ANTES que la
  capa de puntos, así los puntos siempre quedan por encima visualmente) —
  cada zona con su color real del My Maps (mismo hex, extraído del
  `styleUrl` del KML) y un tooltip con el código de dupla; el contorno
  "Zona Frontera" en gris punteado, sin relleno. Se dibuja una sola vez
  por instancia de mapa (no depende del filtro de fecha, así que no hace
  falta recalcularlo en cada re-render de puntos). Los otros dos usos de
  `renderMapaPuntos()` (`admin-duplas.html` reporte, `reporte-publico.html`)
  siguen llamándolo sin el tercer parámetro — no rompen, simplemente no
  muestran las zonas (a propósito: "mi plataforma" / "mapa en vivo" es el
  Dashboard, no el reporte público).
- **`dashboard-engine.js`**: la llamada a `renderMapaPuntos('u0-map', ...)`
  ahora pasa `window.PROJECT_CONFIG_UMBRAL_0.zonasOperativas` como tercer
  argumento.
- Cache-busting (`?v=`) de `mapa-puntos.js` y `dashboard-engine.js` en
  `dashboard.html` subido a `2026-09-22`.

**Hallazgo del cruce contra las zonas** (informativo, no requirió cambios
de código): de los 215 envíos confirmados del equipo desde el 14/9
(§10.1.37), el contorno general "Zona Frontera" del reporte DGREA — que
el propio KML marca como "solo referencia; el trabajo operativo se
organiza por los polígonos de cada turno" — no es el que hay que usar
para validar cumplimiento; contra los polígonos reales asignados a cada
dupla, Once-Balvanera (A) y Chacarita·2 (H) están muy alineadas (93-100%
dentro de su polígono), mientras que Retiro-San Telmo·3 (K, 41%),
Chacarita·1 (D, 55%) y Almagro-Boedo (E, 60%) muestran más dispersión —
esperable en trabajo de calle real (siguiendo personas, no una grilla
fija), pero es el tipo de comparación que este mapa ahora permite hacer
de un vistazo, en vez de a mano con un Excel.

Validado: `node --check` sobre los 3 archivos JS tocados, balance de
`<div>` de `dashboard.html` (191/191) y chequeo de sintaxis de sus 9
bloques `<script>` inline, y un script aparte que parsea
`ZONAS_OPERATIVAS_UMBRAL_0` desde el archivo y confirma que las 8 zonas
de dupla, los 6 polígonos de comedor y el contorno de Zona Frontera están
todos cerrados (primer punto = último punto) y con colores hex válidos.
No se pudo probar visualmente en un navegador real (sin acceso de red
desde este entorno) — a confirmar por el equipo.

### 10.1.40 Puntos del mapa coloreados por dupla (22/9/2026)

Pedido de Agustina, inmediatamente después de §10.1.39: "y quiero que se
vea tb con los colores para cada dupla" — que los PUNTOS del mapa (no
solo los polígonos de zona) también se coloreen por dupla, para poder ver
de un vistazo si un punto de un color cae dentro de la zona de ESE mismo
color.

§10.1.24 había elegido a propósito un solo color de marcador para todos
los puntos, citando la skill de dataviz (con ~13 duplas, muy por encima
de las 2-3 categorías sostenibles con colores distinguibles para
daltonismo). Acá se anula esa decisión a propósito: no son colores
categóricos elegidos por la plataforma, son los MISMOS colores reales que
ya usa el equipo en su My Maps operativo — la referencia visual ya existe
y ya la conoce el equipo, entonces reusarla (en vez de inventar una
paleta nueva) pesa más que la regla general de la skill.

Cambios en `shared/js/mapa-puntos.js`:

- Nueva función `_colorDupla(dupla, zonas)`: devuelve el color real de la
  zona de esa dupla (`zonasOperativas.porDupla[dupla].color`), o si es
  una dupla "iglesias" sin zona propia, el color de su comedor de
  referencia (`zonasOperativas.comedores[dupla][0].color`) — `null` si no
  hay zonas cargadas o la dupla no matchea, y ahí el punto cae al celeste
  genérico de siempre (no rompe nada en `admin-duplas.html`/
  `reporte-publico.html`, que llaman `renderMapaPuntos()` sin el
  parámetro `zonas`).
- Cada punto ahora puede traer `dupla` (código) además de `lat/lng/fecha/tipo`
  — si la trae y hay zonas cargadas, el círculo se pinta con
  `_colorDupla()`; el popup también suma "Dupla X" como primera línea.
- Nueva leyenda debajo del mapa (`#u0-map-leyenda`, mismo patrón que el
  aviso de "sin puntos" ya existente) con un punto de color + código por
  cada dupla que aparece en el rango filtrado — solo se muestra si hay al
  menos un punto coloreado por zona real.
- `dashboard-engine.js`: la llamada a `renderMapaPuntos('u0-map', ...)`
  ahora incluye `dupla: r.dupla` en cada punto mapeado (ya estaba
  disponible en `rows`, atribuido por `cargarRosterUmbral0()` — no hizo
  falta traer ningún dato nuevo, solo dejar de descartarlo al armar el
  array de puntos).

Validado con un script de Node aparte probando `_colorDupla()` extraída:
dupla con zona propia devuelve su color, dupla "iglesias" devuelve el
color de su comedor, dupla desconocida o sin zonas cargadas devuelve
`null` (cae al celeste genérico), y la lógica de la leyenda no duplica
entradas para una dupla con varios puntos — 7 checks, todos pasaron.
También `node --check` sobre los 2 archivos tocados. No se pudo probar
visualmente en un navegador real (sin acceso de red desde este entorno).

### 10.1.41 Colores amarillos de Chacarita, más oscuros (22/9/2026)

Pedido de Agustina, viendo el mapa con los colores de §10.1.40: "y la
zona de contorno amarillo no se ve bien, oscurecela un poco". Las dos
duplas de Chacarita (D y H) tenían colores amarillo claro en el My Maps
original (`#F0C52E` y `#F0D56E`), poco visibles como línea fina sobre el
fondo claro de OpenStreetMap. Se oscurecieron manteniendo el mismo tono
(HSL, luminosidad al 62% de la original): D → `#A5830C`, H → `#C5A014`
(dorado/mostaza oscuro en vez de amarillo pálido).

Como el color de `zonasOperativas.porDupla` se reusa para el polígono, los
puntos de esa dupla y la leyenda (§10.1.40), el cambio se ve reflejado en
los tres lugares con una sola edición.

Validado: `node --check` sobre `config/umbral-0.js`, y confirmación de que
los dos colores nuevos quedaron cargados leyendo `ZONAS_OPERATIVAS_UMBRAL_0`
desde el archivo.

### 10.1.42 Marcar las duplas "iglesias" en el popup y la leyenda del mapa (22/9/2026)

Pedido de Agustina, mismo hilo: "y aclara que está la zona de las
iglesias". Las duplas C/F/I/L/M no patrullan un polígono fijo — visitan
un comedor/institución en un horario fijo (ver `zonasOperativas.comedores`
en config/umbral-0.js, §10.1.39) — y hasta ahora, en el popup de un punto
o en la leyenda, se veían igual que cualquier otra dupla ("Dupla C"),
sin ninguna marca de que su lógica de zona es distinta.

En `shared/js/mapa-puntos.js`: al armar cada punto, se calcula si la
dupla es "iglesia" (tiene color por `zonasOperativas.comedores`, no por
`zonasOperativas.porDupla`) — si lo es, el popup del punto y la entrada
de la leyenda suman "(iglesias)" al lado del código de dupla. El tooltip
de los polígonos de comedor (§10.1.39) ya decía "(comedor de referencia)"
al pasar el mouse — esto suma la misma aclaración en los dos lugares que
son visibles sin necesidad de pasar el mouse por un polígono puntual.

Validado con un script de Node aparte: dupla con zona propia (A) no se
marca como iglesia, dupla con comedor de referencia (C) sí se marca,
dupla sin color asignado no se marca (evita falsos positivos) — 3 checks,
todos pasaron. `node --check` sobre el archivo tocado.

### 10.1.43 El mismo mapa (zonas + colores por dupla) en el Reporte (22/9/2026)

Pedido de Agustina: "y quiero que en reporte se vea el mismo mapa" — que
el mapa con las zonas operativas y los puntos coloreados por dupla
(§10.1.39-§10.1.42, hasta ahora solo en el Dashboard) aparezca también en
el Reporte — tanto el interno (`admin-duplas.html#reporte`) como el
público (`reporte-publico.html`, el link que se comparte con gobierno,
que es justamente el destino natural de esta comparación).

`calcularOutcomesKobo()` en `admin-duplas.html` armaba antes un simple
`Set` de nombres normalizados ("¿es de las 13 duplas?", sin saber de
cuál) para filtrar los envíos de KoBo. Para poder colorear cada punto por
dupla hacía falta saber el código, no solo la pertenencia — se cambió por
un mapa nombre→código de dupla (`duplaPorNombreKobo`, arma `duplas` +
`integrantes` con un fetch extra en paralelo, mismo patrón que
`cargarRosterUmbral0()` en `dashboard-engine.js`), y cada punto en
`puntos` ahora suma `dupla: codigoDupla`. Ese array es el que ya viaja
tal cual al snapshot de `reportes_semanales` que lee `reporte-publico.html`
— no hizo falta tocar cómo se genera o publica el reporte, solo lo que
ya traía cada punto.

Las dos llamadas a `renderMapaPuntos()` (`admin-duplas.html` y
`reporte-publico.html`) ahora pasan `window.PROJECT_CONFIG.zonasOperativas`
como tercer parámetro, igual que en `dashboard-engine.js` (§10.1.39) —
mismo mapa, mismas zonas, mismos colores, mismas leyendas con "(iglesias)"
en los tres lugares.

Importante: esto significa que un reporte publicado DESPUÉS de este
cambio va a traer el campo `dupla` en sus puntos y se va a ver coloreado;
un reporte que ya estaba publicado ANTES (con el `koboOutcomes.puntos`
viejo, sin `dupla`) va a seguir viéndose con el celeste genérico hasta
que se vuelva a publicar — no hay migración retroactiva de reportes ya
guardados en `reportes_semanales`.

Validado: `node --check` sobre los 2 archivos HTML no aplica (son
páginas, no módulos JS) — se usó en cambio balance de `<div>`
(`admin-duplas.html` 249/249, `reporte-publico.html` 91/91) y chequeo de
sintaxis de los 5 bloques `<script>` de cada uno, y grep cruzado de que
`codigoPorDuplaId`/`duplaPorNombreKobo` están conectados en todos los
puntos donde hacía falta. No se pudo probar contra KoBo real ni ver el
reporte publicado (sin acceso de red desde este entorno).

### 10.1.44 Cache-busting faltante en `mapa-puntos.js` (22/9/2026)

Bug real: Agustina reportó "en el reporte no veo el mapa" apenas después
de §10.1.43. Causa encontrada: `admin-duplas.html` y `reporte-publico.html`
cargaban `shared/js/mapa-puntos.js` **sin** el `?v=` de cache-busting que
`dashboard.html` sí tiene desde antes (agregado ahí mismo por este motivo
exacto — ver el comentario en `dashboard.html`: "sin esto, el navegador
[...] puede seguir sirviendo una copia vieja de este archivo después de
un deploy [...] pasó hoy con el fix del filtro de fechas"). Sin ese
parámetro, el navegador de quien ya tenía la página abierta (o la visitó
recientemente) puede seguir sirviendo una copia cacheada de
`mapa-puntos.js` de ANTES de §10.1.39-§10.1.43 — sin `_dibujarZonas`, sin
colorear por dupla, e incluso versiones más viejas podrían no tener el
mapa en absoluto si la copia cacheada es previa a §10.1.24.

De paso se encontró que `dashboard.html` mismo había quedado con la
versión vieja (`?v=2026-09-22b`) después de §10.1.42 (el cambio de
"iglesias" en la leyenda tocó `mapa-puntos.js` pero no se bump'eó la
versión en ese commit) — mismo bug, en el propio Dashboard.

Fix: subido `?v=2026-09-22c` en los 3 lugares que cargan `mapa-puntos.js`
(`dashboard.html`, `admin-duplas.html`, `reporte-publico.html`), sincronizados
al mismo número.

Para quien ya tenía la página abierta cuando se reportó el problema, el
fix de código no alcanza por sí solo — necesita además un refresh forzado
(Ctrl+Shift+R / Cmd+Shift+R) una vez desplegado, para descartar cualquier
copia ya cacheada del HTML de la página en sí (no solo del JS).

Lección para la próxima vez que se edite `mapa-puntos.js`: subir el `?v=`
en los 3 archivos que lo cargan, no solo en el que se esté mirando en ese
momento.

Validado: grep confirmando que los 3 `<script src="...mapa-puntos.js?v=...">`
quedaron con el mismo valor, y balance de `<div>` de los 3 archivos HTML
tocados (sin cambios de estructura, solo el query string).

### 10.1.45 El mapa se veía y después desaparecía en el Reporte (22/9/2026)

Segundo bug real, mismo hilo: después del fix de caché (§10.1.44) Agustina
reportó "lo vi pero desapareció" — con una captura del reporte generado
(KPIs con datos reales: 12 zonas, 123 puntos, 230 intervenciones) pero sin
mapa debajo.

Causa: `generarReporte()` en `admin-duplas.html` llama
`cont.innerHTML = <template completo, incluye `<div id="reporte-map">`>`
cada vez que se toca "📊 Generar reporte" — mismo id, pero un nodo del
DOM **nuevo** cada vez (el viejo se destruye junto con todo lo demás
adentro de `cont`). `renderMapaPuntos()` guarda la instancia de Leaflet
en `_mapaPuntosInstancias[containerId]` y, si ya existe, la reusa sin
volver a crearla — pero seguía apuntando al `<div>` VIEJO, ya huérfano y
fuera del documento. El `<div id="reporte-map">` nuevo (el que sí se ve
en pantalla) nunca tenía un mapa de Leaflet inicializado encima: quedaba
vacío. Primera vez que se genera el reporte, el mapa se ve bien (recién
ahí se crea la instancia); la segunda vez que se toca "Generar reporte"
(otro rango de fechas, o el mismo de nuevo), desaparece — exactamente lo
que describió Agustina. `dashboard.html` nunca tuvo este problema porque
ahí el `<div id="u0-map">` es parte del HTML estático de la página, no se
reemplaza en cada actualización.

Fix en `shared/js/mapa-puntos.js`: antes de reusar una instancia
guardada, se chequea `document.body.contains(inst.map.getContainer())`
— si el contenedor de esa instancia ya no está en el documento, se la
descarta prolijo (`map.remove()`, la forma correcta de Leaflet de tirar
abajo un mapa) y se crea una instancia nueva sobre el `<div>` actual.

Validado con un script de Node aparte que simula el ciclo completo (nodo
A → se reemplaza por nodo B con el mismo id → nodo B se reusa sin
reemplazo) contra una clase `FakeMap`/`FakeBody` que imita
`getContainer()`/`remove()`/`document.body.contains()` sin necesitar
Leaflet real — 5 checks, todos pasaron, incluyendo el caso de
`dashboard.html` (mismo nodo entre llamadas → no recrea nada). También
`node --check` sobre el archivo. Cache-busting subido a `?v=2026-09-22d`
en los 3 lugares que cargan `mapa-puntos.js` (mismo archivo tocado otra
vez, mismo cuidado de §10.1.44).

### 10.1.46 Cálculo de "puntos fuera de zona" en el mapa (22/9/2026)

Pedido de Agustina: "necesito calcular los puntos que se registraron
fuera del territorio que tienen marcadas las duplas" — en vez de
mandarle un número calculado a mano una sola vez (como se hizo antes,
sobre el Excel de KoBo que compartió), se agrega el cálculo a la
plataforma, reusando `zonasOperativas` (§10.1.39): así queda
recalculándose solo cada vez que se mira el mapa, en los tres lugares
donde ya vive (Dashboard, Reporte interno, Reporte público).

En `shared/js/mapa-puntos.js`:

- `_puntoDentroPoligono(lat, lng, poly)`: punto-en-polígono por ray
  casting — mismo algoritmo que se usó a mano (en Python) para el
  análisis del Excel de KoBo esta misma tarde, ahora parte de la
  plataforma.
- `_fueraDeZona(dupla, lat, lng, zonas)`: `true`/`false` si la dupla
  tiene zona de patrullaje propia (`zonasOperativas.porDupla`) y el punto
  cae fuera de ese polígono; `null` si no hay forma de saberlo (sin
  zonas, sin dupla reconocida, o dupla "iglesias" sin zona fija — ahí no
  hay polígono real contra el que comparar, ver §10.1.39/§10.1.42).
- Cada punto fuera de zona se dibuja con borde negro más grueso (en vez
  del color de su dupla) y más opaco, y el popup suma
  "⚠️ Fuera de la zona asignada" como primera línea.
- Nuevo resumen debajo del mapa (mismo patrón que el aviso de "sin
  puntos" y la leyenda ya existentes): "⚠️ N de M puntos con zona
  definida quedaron fuera de la zona asignada a su dupla" (o "✅ los M
  están dentro" si no hay ninguno fuera) — aclara aparte que no incluye a
  las duplas "iglesias", sin zona de patrullaje fija.

No hizo falta tocar `dashboard-engine.js` ni `admin-duplas.html` — el
cálculo vive entero adentro de `renderMapaPuntos()`, que ya recibía
`zonas` y cada punto con su `dupla` desde §10.1.39-§10.1.43.

Validado con un script de Node aparte que carga `zonasOperativas` real
desde `config/umbral-0.js` y los 215 puntos reales del análisis anterior
(§10.1.37, filtrados desde el 14/9): el resultado da exactamente 39 de 97
puntos fuera de zona, dupla por dupla — A 14/15, B 14/23, D 6/11, E 3/5,
G 1/1, H 5/5, K 15/37 — **idéntico** al cálculo hecho a mano en Python
esta misma tarde, y confirma que las duplas "iglesias" (C/F/I/L/M) quedan
afuera del conteo como corresponde — 14 checks, todos pasaron. También
`node --check` sobre el archivo. Cache-busting subido a `?v=2026-09-22e`
en los 3 lugares que cargan `mapa-puntos.js`.

### 10.1.47 Corrección de redacción: "sin zona" no es "sin zona asignada" (22/9/2026)

Agustina, sobre §10.1.46: "cuando decís 'fuera de zona' a qué te referís?
las iglesias marcadas en el mapa son zonas nuestras eh" — la redacción
del resumen y de los comentarios del código decía "duplas 'iglesias', sin
zona de patrullaje fija" o "sin zona fija", lo cual se puede leer como
"esas duplas no tienen zona asignada", y ESO ES FALSO — las duplas de
comedores (C/F/I/L/M) sí tienen zona asignada, es una dirección puntual
(el comedor), no un polígono de manzanas. Lo que no existe es un polígono
contra el que comparar un punto GPS con sentido — comparar "¿cayó exacto
adentro del edificio del comedor?" no dice nada sobre si el operador hizo
bien su recorrido alrededor.

Corregido en `shared/js/mapa-puntos.js`: el resumen debajo del mapa ahora
dice "puntos con **polígono de patrullaje**" (en vez de "con zona
definida" a secas) y la aclaración entre paréntesis pasa a "no incluye a
las duplas de comedores — C, F, I, L, M —, que sí tienen zona asignada,
pero es una dirección puntual, no un polígono de manzanas comparable de
la misma forma". Mismo ajuste en los comentarios internos de
`_colorDupla()` y `_fueraDeZona()`, para que quien lea el código no
repita la misma confusión.

Cache-busting subido a `?v=2026-09-22f` en los 3 lugares que cargan
`mapa-puntos.js`. Validado: `node --check` sobre el archivo — solo cambió
texto/comentarios, ningún cálculo.

### 10.1.48 Puntos de comedores contados explícitamente como cobertura propia (22/9/2026)

Continuación directa de §10.1.47: Agustina, ya aclarado que las duplas de
comedores sí tienen zona asignada, preguntó "pero contabiliza los casos
esos como dentro de nuestra zona de cobertura, sí?" — antes, esos puntos
quedaban simplemente AFUERA de `conZonaCount`/`fueraDeZonaCount` (ni a
favor ni en contra, solo excluidos del chequeo geométrico) — correcto en
el cálculo, pero mudo en el resumen: nunca decía explícitamente "estos
también cuentan". Si una vista tenía SOLO puntos de duplas de comedores
(sin ningún punto de zona-polígono en el rango), el resumen ni siquiera
aparecía (`conZonaCount` daba 0).

Cambios en `shared/js/mapa-puntos.js`:

- Nuevo contador `coberturaCount`: cuenta TODOS los puntos con dupla
  reconocida (con polígono de patrullaje O con comedor de referencia) —
  a diferencia de `conZonaCount`, que sigue siendo solo los puntos
  chequeables geométricamente contra un polígono.
- El resumen ahora arranca siempre con una frase incondicional: "✅ Los N
  puntos con dupla reconocida cuentan como cobertura propia." — sin
  ninguna excepción silenciosa. Recién después, si hay puntos con
  polígono, se suma el detalle de cuántos de esos quedaron fuera; y si
  hay duplas de comedores, se aclara que esos se cuentan siempre dentro
  de su zona de cobertura (el comedor asignado).
- La condición para mostrar el resumen pasó de `conZonaCount > 0` a
  `coberturaCount > 0` — así aparece también cuando en el rango filtrado
  solo hay puntos de duplas de comedores.

Validado con un script de Node aparte (misma base que §10.1.46, los 215
puntos reales + `zonasOperativas` real): `coberturaCount` da 215 (el
total), `conZonaCount` sigue dando 97 y `fueraDeZonaCount` sigue dando 39
(la geometría no cambió) — y un caso aparte filtrando solo los puntos de
duplas de comedores confirma que `coberturaCount > 0` aunque
`conZonaCount` sea 0, es decir, el resumen ya no queda oculto en ese
escenario — 6 checks, todos pasaron. También `node --check` sobre el
archivo. Cache-busting subido a `?v=2026-09-22g`.

### 10.1.49 El texto de §10.1.48 era ilegible — vuelta a una frase corta (22/9/2026)

Agustina, con captura del resumen de §10.1.48 ("Los 227 puntos con dupla
reconocida cuentan como cobertura propia. De esos, 48 de 125 [...] Los
puntos de las duplas de comedores [...] no hay un polígono de manzanas
para chequearlos geométricamente"): "no se entiende esto y no es
necesario, solo digo que las iglesias son zona nuestra tb". Explicar la
lógica interna del cálculo (cobertura propia vs. polígono de patrullaje
vs. chequeo geométrico) en la pantalla fue sobre-ingeniería de la
redacción — el pedido real, de nuevo, era mucho más chico: una sola
aclaración de que las iglesias también son zona del equipo, no una
justificación completa de por qué el cálculo las trata distinto.

Vuelta a un texto de una sola frase corta con el número que importa, más
una aclaración de una línea (sin explicar el motivo) si hay duplas de
iglesias en el rango:

- Con puntos fuera de zona: "⚠️ **N de M** puntos quedaron fuera de la
  zona asignada a su dupla."
- Sin ninguno fuera: "✅ Los M puntos están dentro de la zona asignada a
  su dupla."
- Si no hay ningún punto con polígono (solo iglesias): "✅ Los N puntos
  están dentro de zona." (usa `coberturaCount` en vez de `conZonaCount`,
  que ahí sería 0).
- Y al final, solo si hay alguna dupla de iglesias en el rango: "Las
  iglesias también son zona nuestra."

La explicación de por qué el cálculo funciona así (polígono vs. comedor
puntual, qué es `coberturaCount` vs. `conZonaCount`) se queda en los
comentarios del código, para quien lo edite — no en la pantalla, que es
para operar, no para entender la implementación.

Validado con un script de Node aparte probando `armarTexto()` extraída en
4 escenarios (con puntos fuera + iglesias, todos dentro, solo iglesias,
sin iglesias en el rango) — 5 checks, todos pasaron, incluyendo que la
frase de iglesias NO aparece cuando no hay ninguna dupla de iglesias en
el rango filtrado. También `node --check` sobre el archivo. Cache-busting
subido a `?v=2026-09-22h`.

### 10.1.50 Reporte público sin la comparación derivaciones-vs-KoBo (22/9/2026)

Agustina, antes de entregarle el reporte a gobierno: "hay datos del
reporte que nos complican y deberíamos ocultarlos. la diferencia entro
[entre] la derivacion en nuestra plataforma y lo que se sube a kobo nos
complica, debería verlo yo en el admin pero no hace falta que gobierno
lo vea".

`reporte-publico.html` y `admin-duplas.html#reporte` renderizan el mismo
reporte con dos plantillas separadas (no comparten código) — esto se
tocó **solo** en `reporte-publico.html`; `admin-duplas.html` sigue
mostrando todo, sin cambios, para uso interno.

Sacado del reporte público:

- La sección completa **"e. Derivaciones y contactos según KoBo
  (terreno)"** — una tabla aparte con los conteos crudos de KoBo, que
  puestos al lado de "d. Intervenciones y derivaciones" (los datos
  cargados en la plataforma) hacían evidente cualquier diferencia entre
  ambas fuentes.
- El aviso `⚠️` de "d." que decía explícitamente "No hubo 'Pedir
  derivación' cargado en la plataforma... la tabla de arriba muestra en
  su lugar lo que KoBo registró en terreno" — nombraba la diferencia
  directamente.

Lo que **no** se tocó: el fallback silencioso de la tabla de "d." (si no
hay derivaciones cargadas en la plataforma, mostrar en su lugar los
conteos de KoBo) sigue funcionando igual — sin eso, el reporte mostraría
"Sin derivaciones en el período" en vez del trabajo real hecho en
terreno, que sería peor. Solo se sacó el aviso que señalaba la diferencia
en voz alta, no el dato en sí. Tampoco se tocó la nota de denuncia de
extravío de DNI vs. trámite formalizado (§10.1.21) — es una comparación
distinta a la que Agustina nombró, no se asumió que también había que
sacarla.

Secciones renumeradas para no dejar un salto (antes a-g, ahora a-f):
"f. Qué hicieron las duplas" pasó a "e.", "g. Observaciones diarias"
pasó a "f.". El mapa de puntos (dentro de "a.") sigue usando
`koboOutcomes.puntos` igual que antes — solo se sacó la TABLA que
mostraba esos datos aparte, no la fuente de datos del mapa.

Validado: balance de `<div>` de `reporte-publico.html` (87/87, bajó de
91 por las 4 divs de la sección eliminada), chequeo de sintaxis de sus 5
bloques `<script>`, grep confirmando las letras a-f sin salto ni
duplicado, y confirmación de que `admin-duplas.html` quedó sin ningún
cambio (`git diff` vacío en ese archivo).

### 10.1.51 Nueva página: curso de capacitación para prestadores (22/9/2026)

Agustina: "a partir de todo lo que tenemos en el glosario se transforme
en una capacitación, un mocs en otra pestaña y ese mocs va a servir para
nuevos prestadores que paguen para hacer el curso y poder ser
prestador". Le pregunté (AskUserQuestion) cómo manejar el pago, cuánto
contenido incluir y qué pasa al terminar el curso — descartó las tres
preguntas sin responderlas por la UI, y en su lugar contestó directo por
texto: "que te lleve a contacto sino" (si el curso no da de alta
automática, que termine llevando a un contacto).

Nueva página `umbral-0/capacitacion.html`, hermana de `instructivo.html`
(el Glosario interno del equipo) pero para un público distinto: gente de
afuera del equipo que quiere convertirse en prestador/a pago/a. Enlazada
desde `index.html` con `target="_blank"` ("🎓 Curso para nuevos
prestadores", en `home-footer-links`) — la "otra pestaña" pedida.

Reusa el contenido íntegro del Glosario (no un resumen): qué es Umbral
0, los 5 principios, los 5 niveles de éxito, y el glosario completo de
~18 derivaciones (CIS con sus direcciones, Handy Rojo, Casa Vincular,
ASA, Micro, Salud Mental, SAME, Brigada CER, Mapa de Familias en Riesgo,
Policía, Ciudadanía Porteña, Sedes de Atención Social, Derecho a la
Identidad, DIPA, Médico, Tuberculosis, Hacer DNI, Centro de día), más
cómo se usa Casos (carga/validación/seguimiento) y el cierre de jornada
— reorganizado en 6 "módulos" con numeración y checkbox propio en vez de
la navegación libre por anchors del Glosario.

Cómo quedó resuelta la ambigüedad, con defaults conservadores dado que
las 3 preguntas no se respondieron:

- **Pago:** no hay integración de pago real (no existe infraestructura
  de cobro en el repo). El curso es de acceso libre; el pago se coordina
  a mano después del contacto — así lo dice el propio texto de la
  sección Contacto ("te vamos a responder para coordinar el pago del
  curso").
- **"Que te lleve a contacto":** el checklist de progreso (6 checkboxes,
  uno por módulo, persistido en `localStorage` — solo una conveniencia
  visual por navegador, no una certificación) termina siempre en una
  sección `#contacto` con un botón de WhatsApp (mismo patrón `data-cfg`/
  `data-cfg-href` + `UITheme.init()` que ya usa `index.html` para el
  botón "Contactar a la operadora", leyendo `whatsappLink`/
  `whatsappNumero` de `PROJECT_CONFIG_UMBRAL_0` — hoy vacíos, TODO
  pendiente igual que en el resto del portal). No se otorga ningún alta
  automática de rol ni acceso a la plataforma real al completar el
  curso — completar los módulos no habilita nada por sí solo, coincide
  con lo que pidió.
- **Profundidad del contenido:** se copió el detalle completo de cada
  derivación tal cual está en `instructivo.html` (direcciones, teléfonos,
  protocolos de urgencia), sin resumir — "todo lo que tenemos en el
  glosario" se tomó literal.

Validado: balance de `<div>`/`<details>`/`<summary>` de
`capacitacion.html` (211/211, 19/19, 19/19) y chequeo de sintaxis del
bloque `<script>` principal (progreso + `UITheme.init()`) con
`node --check`.

### 10.1.52 Bug: nombre compuesto en `integrantes` perdía el envío de KoBo entero (22/9/2026)

Agustina: "Yesica Cuenca es un caso de ayer que no lo estamos viendo en
la plataforma, y está en KoBo". Confirmado con la base (Supabase, tabla
`personas`): no hay ningún caso "Yesica Cuenca" cargado. El primer
sospechoso — el filtro `identificacion/equipo !== 'umbral_0'` de
`parseUmbral0()` (§ ya documentado) — quedó descartado: Agustina mandó
una captura del Excel de KoBo (columna "Umbral 0" con el label ya
resuelto) confirmando que ese campo está bien puesto en su envío.

Root cause real, encontrado leyendo `integrantes` en Supabase: "Yesica
Cuenca" no es la persona relevada — es la OPERADORA que cargó el envío
(columna `identificacion/operador_nombre`), registrada en `integrantes`
como **"Yesica soledad Cuenca"** (con segundo nombre). En KoBo tipeó
solo "Yesica cuenca" (sin el "Soledad"). Las tres pantallas que
matchean el operador de un envío contra `integrantes` para decidir si
"es de mi dupla" / "de cuál dupla es" lo hacían con **igualdad exacta
de string** sobre el nombre normalizado (tokens en minúscula, sin
acentos, ordenados alfabéticamente):

- `umbral-0/casos.html` → `cargarKoboPendientes()` (Set `misNombres` +
  `.has()`) — la lista "📥 KoBo pendientes" de Casos.
- `umbral-0/casos.html` → `abrirModalAsociarKobo()` (mismo patrón,
  Set separado) — "🔗 Asociar un envío de KoBo" desde una ficha.
- `shared/js/dashboard-engine.js` → `cargarRosterUmbral0()` +
  `cargarUmbral0()` (objeto `roster` indexado por string exacto) — el
  mapa/resumen en vivo del Dashboard.
- `umbral-0/admin-duplas.html` → `calcularOutcomesKobo()` (objeto
  `duplaPorNombreKobo` indexado por string exacto) — el reporte semanal
  y el mapa de puntos (admin + `reporte-publico.html`).

Con igualdad exacta, "yesica cuenca" (2 tokens) nunca es igual a
"cuenca soledad yesica" (3 tokens) — el envío se descartaba ENTERO en
las cuatro pantallas, sin ningún rastro visible (no aparece en "KoBo
pendientes", no cuenta en el mapa, no suma al reporte semanal). No es
un caso aislado: `select nombre, apellido from integrantes where activo
and nombre ~ ' '` da **8 integrantes activos con nombre compuesto**
(Alan Damián Artaza, Brisa Micaela Cortado, Dylan Leonel Ojeda,
Gabriela Roxana Pedernera, Nestor Atilio Maldonado, Pablo Daniel
Carrizo, Sergio Jose Ferreyra, Yesica soledad Cuenca) — cualquiera de
ellos pierde envíos enteros cada vez que tipea su nombre corto en KoBo,
que es lo más natural.

Arreglado con una función `nombresCoincidenKobo(a, b)` (duplicada en
las tres pantallas, mismo patrón que ya usan para no compartir un
módulo JS entre ellas) que compara por **subconjunto de tokens en
cualquier dirección** en vez de igualdad exacta — "yesica cuenca" ⊆
"cuenca soledad yesica" ⇒ matchean. Las estructuras que antes eran
`Set`/objeto indexado por string exacto pasaron a array + `.find()`/
`.some()` con esta función, porque el subconjunto no se puede resolver
con una key de mapa.

Validado con un script de Node standalone (7 casos: el caso real de
Yesica con y sin segundo nombre, apellido antes que nombre, otro
integrante compuesto — Dylan Leonel Ojeda —, dos personas distintas que
NO deben matchear, operador vacío, y una variante sin acento) — los 7
pasan. `node --check` sobre los `<script>` de `casos.html`,
`admin-duplas.html` y `dashboard-engine.js` completo, sin errores.

### 10.1.53 Bug: "Jornada de hoy" quedaba visible detrás de cualquier otra vista de Casos (22/9/2026)

Agustina, con captura de "Dupla D" en `casos.html`: al tocar "🪪 Trámites
de DNI pendientes" o "📋 Mis derivaciones y seguimientos", seguía viendo
"Jornada de hoy completa" + "Observaciones del día" + "Casos nuevos"
debajo — "solamente de cada dupla pero solo lo que se le pide al menú,
si quiero ver mis derivaciones que me muestre eso, no la jornada de hoy
+ los sin identificar".

Causa: el panel `<div id="jornada-box">` vive FUERA de las vistas que sí
se alternan entre sí (`view-buscar`, `view-ficha`, `view-dni-pendientes`,
`view-sin-identificar`, `view-mi-actividad`, `view-cierres-jornada` —
esas sí se ocultan unas a otras en cada función `mostrar*()`). `jornada-
box` se pinta una sola vez en `entrarAlApp()` (vía `mostrarJornada()`) y
después ninguna de las funciones que cambian de vista lo tocaba —
quedaba con `display:block` fijo sin importar qué vista estuviera activa.

Arreglado agregando `jornada-box.style.display = 'none'` a las 5
funciones que abren una vista que no es la búsqueda/home
(`mostrarDniPendientes`, `mostrarSinIdentificar`, `mostrarMiActividad`,
`mostrarCierresJornada`, `abrirFicha`), y volviendo a llamar
`mostrarJornada()` (que ya trae su propio guard de rol) en
`volverABuscar()` para que reaparezca solo ahí.

De paso, en el mismo pedido ("si quiero ver mis derivaciones que me
muestre eso"): "📋 Mis derivaciones y seguimientos" mostraba las dos
listas (derivaciones + seguimientos) apiladas siempre juntas en la misma
pantalla. Se separó en dos pestañas dentro de la misma vista
(`mia-tab-derivaciones` / `mia-tab-seguimientos`, toggleadas con
`Casos.mostrarTabMiActividad()`), arrancando siempre en "Derivaciones" —
un solo botón de menú (sin agregar más al nav, ya bastante cargado),
pero cada pestaña muestra solo lo suyo.

Sobre el scoping por dupla que también menciona el pedido ("solamente
de cada dupla"): confirmado en Supabase (`pg_policies`) que ya está bien
— el RLS de `derivaciones`/`seguimientos`/`personas` para rol `dupla`
filtra por `solicitado_por`/`dupla_id` = la dupla logueada. No hacía
falta tocar nada ahí; el problema era 100% el panel de jornada
filtrándose visualmente entre vistas, no una fuga de datos entre duplas.

Bug aparte, encontrado en la misma captura (consola con "Failed to load
resource: 400" + "No se pudieron traer los casos sin identificar"):
`cargarSinIdentificarCount()` filtraba `.eq('oculto', false)` sobre la
vista `personas_actividad`, pero esa vista (desde la migración
"personas_actividad: filtra oculto", 17/9/2026, `schema-ajustes.sql`)
ya filtra `oculto` DENTRO de su propio `WHERE` y no expone esa columna
en el resultado — filtrarla de nuevo desde el cliente le pedía a
PostgREST una columna que no existe, 400 en cada carga, "Casos sin
identificar" nunca mostraba nada real. Sacado el `.eq('oculto', false)`
redundante e inválido.

Validado: balance de `<div>`/`<button>` de `casos.html` (284/284, 73/73),
`node --check` sobre sus 2 bloques `<script>` no vacíos, y un script de
Node aparte simulando el DOM mínimo (jornada visible al entrar → oculta
al abrir "DNI pendientes" → visible de nuevo al volver a buscar) — pasa.

### 10.1.54 Mismo bug del §10.1.53, en los otros dos widgets de "home" (22/9/2026)

Agustina, después del fix de arriba: "mis derivaciones sigue mostrando
envíos de KoBo pendientes". El §10.1.53 solo tocó `jornada-box` —
`kobo-pend-box` ("📥 envíos de KoBo... sin caso cargado") y
`mi-turno-box` (zona/turno/referente) son los otros dos widgets que
viven en el mismo lugar, fuera del sistema de vistas, con el mismo
patrón: se pintan una vez en `entrarAlApp()` y ninguna función que
cambia de vista los tocaba.

Mismo arreglo, extendido a los tres: las 5 funciones que abren una
vista que no es la búsqueda/home ahora ocultan los tres
(`jornada-box`, `mi-turno-box`, `kobo-pend-box`), y `volverABuscar()`
los vuelve a mostrar los tres (`mostrarMiTurno()`, `mostrarJornada()`,
`mostrarKoboPendientes()` — las tres funciones ya existían y son
baratas de re-llamar, no repiten ningún fetch a Supabase/KoBo, solo
repintan con los datos ya cargados en memoria).

Validado: balance de `<div>`/`<button>` de `casos.html` sin cambios
(284/284, 73/73 — no se agregó ni sacó ningún tag, solo llamadas JS),
`node --check` sobre sus 2 bloques `<script>` no vacíos, y el mismo
script de Node del §10.1.53 extendido a los tres widgets (visibles al
entrar → los tres ocultos en "Mis derivaciones" → los tres visibles de
nuevo al volver a buscar) — pasa.

### 10.1.55 Home de la dupla: jornada minimizable + guía de "para revisar" (22/9/2026)

Agustina: "el inicio de las duplas debe poder minimizar su jornada una
vez enviada. ¿Podés armar un inicio más intuitivo con un dashboard que
resuma su actividad y lo guíe?".

**Jornada minimizable.** Con la jornada "completa", el bloque de
detalle (`resumen-dia-box` — casos nuevos, recontactados,
intervenciones, derivaciones, seguimientos, botón de WhatsApp) se
armaba siempre desplegado, ocupando bastante lugar en el home apenas se
cerraba la jornada. Ahora arranca colapsado (`display:none` desde el
propio template) detrás de un botón "🔽 Ver detalle del día" /
"🔼 Ocultar detalle del día" (`Casos.toggleResumenDia()`). Al lado del
título ("✅ Jornada de hoy completa — HH:MM a HH:MM") se agrega un
resumen mini de una línea (`#jornada-resumen-mini`, ej. "· 4 nuevos, 2
derivaciones") que se completa solo cuando `_renderResumenDia()`
termina de calcular — así, aun colapsado, la dupla ve de un vistazo si
hubo actividad, sin tener que desplegar todo. Interpretación de "una
vez enviada": colapsado apenas la jornada queda "completa"/cerrada, no
recién después de tocar el botón de compartir por WhatsApp — no hay
ningún campo en `jornadas` que registre "ya se mandó el mensaje", y
agregarlo era más de lo que se pidió; si esto no es lo que Agustina
quiso decir, es un ajuste chico.

**Guía "📌 Para revisar" (nuevo `acciones-box`).** Home con web de 3
widgets desconectados (turno, jornada, KoBo pendientes) más ~9 botones
en el nav — fácil perder de vista que hay trámites de DNI o casos sin
identificar esperando, con la única señal siendo el numerito en un
botón del nav. Se agrega una franja de chips clickeables debajo de
`kobo-pend-box`, mostrando SOLO lo que tiene algo pendiente ("🪪 N
trámites de DNI pendientes →", "🙈 N casos sin identificar →"), cada
uno lleva directo a esa vista (`Casos.mostrarDniPendientes()` /
`Casos.mostrarSinIdentificar()`). KoBo pendientes queda afuera a
propósito — ya tiene su propio panel bien visible en el home, no hacía
falta duplicarlo. `renderAccionesPendientes()` reusa los mismos arrays
que ya calculan `cargarDniPendientesCount()`/`cargarSinIdentificarCount()`
(no repite ningún fetch) y se llama al final de esas dos funciones, más
al volver a buscar — mismo patrón de "widget de home" que jornada/turno/
KoBo pendientes (oculto en las otras 5 vistas, visible solo acá).

Se mantuvieron los botones del nav tal cual — esto es aditivo, no un
reemplazo; reduce el riesgo de romper algo que ya funciona y no
depende de que Agustina confirme sacar accesos que la dupla ya
conoce.

Validado: balance de `<div>`/`<button>` de `casos.html` (288/288,
75/75), `node --check` sobre sus 2 bloques `<script>` no vacíos, y un
script de Node aparte con dos partes — (1) `toggleResumenDia()`:
arranca colapsado → se expande → vuelve a colapsar, con el texto del
botón cambiando en cada paso; (2) `renderAccionesPendientes()`: sin
pendientes la caja queda oculta, con 2 trámites de DNI pendientes se
muestra — las 7 verificaciones pasan.

### 10.1.56 Home de la dupla: turno a la izquierda, pendientes arriba (22/9/2026)

Agustina, sobre el §10.1.55: "estaría bien que en el inicio les
aparezca 'para revisar' [...] más arriba, más a mano. Por eso podés
poner [...] al costado izquierdo la franja que dice turno 2, el
horario, Chacarita, abrir mapa, WhatsApp del referente [...] y dejar
espacio para poner arriba los pendientes".

`mi-turno-box`, `jornada-box`, `kobo-pend-box` y `acciones-box`
("📌 Para revisar", del §10.1.55) eran cuatro bloques full-width
apilados uno debajo del otro, cada uno con su propio
`max-width:860px; margin:... auto 0;` — "para revisar" quedaba
tercero en ese orden (debajo de turno y de jornada), lejos del
primer vistazo.

Se envuelven los cuatro en un contenedor `.home-top` (flex, con
`.home-top-left` angosto para `mi-turno-box` y `.home-top-right` más
ancho para `acciones-box` → `jornada-box` → `kobo-pend-box`, en ese
orden). Las clases `.mi-turno`/`.jornada`/`.kobo-pend`/`.acciones-pend`
ya no centran ni acotan su propio ancho — eso ahora lo maneja
`.home-top`, ellas eran los bloques full-width que ya no hacen falta
con un padre flex.

En pantallas angostas (`max-width:680px`, la mayoría de las duplas
usa el celular en el recorrido) `.home-top-left`/`.home-top-right` se
reordenan por CSS (`order`) para que la columna derecha (pendientes)
quede arriba del todo y turno abajo — no alcanza con el orden en el
DOM porque en desktop van lado a lado, no uno arriba del otro.

Validado: balance de `<div>`/`<button>` de `casos.html` (291/291,
75/75 — 3 divs nuevos de wrapper, ningún botón), `node --check` sobre
sus 2 bloques `<script>` no vacíos, y una captura con Playwright de
una página de prueba standalone (mismo CSS extraído del archivo real +
contenido de ejemplo) en dos anchos — 900px: turno a la izquierda,
"Para revisar" → jornada → KoBo arriba a la derecha; 390px (mobile):
"Para revisar" primero, después jornada, después KoBo, turno al
final, todo en una sola columna — ambos coinciden con lo pedido.

### 10.1.57 Bug: el menú de arriba se cortaba en celular, "Mis derivaciones" invisible (22/9/2026)

Agustina, con captura desde el celular: "no se llegan a ver todas las
opciones del menú. Mis derivaciones falta, [...] no se llega a ver
todo lo del menú". También aclaró, sobre el §10.1.56: "tené en cuenta
que lo tienen que ver desde el celular... no sé si está bien lo que te
dije de la izquierda" — quedó resuelto sin cambios: en celular no hay
columnas, `.home-top-left`/`.home-top-right` se apilan y el orden ya
pone "para revisar" arriba y turno al final (ver captura del
§10.1.56), el layout de dos columnas solo se activa en pantallas
anchas.

Causa de lo del menú: `.topbar-right` (los ~9 botones del nav para una
cuenta dupla — Portal, Cargar KoBo, DNI pendientes, Sin identificar,
Mis derivaciones, Cierres de jornada, Glosario, Test, Cerrar sesión)
es un `display:flex` sin `flex-wrap:wrap` — en desktop entran todos en
una fila, pero en una pantalla de celular (~390-412px) no entran ni
cerca, y sin wrap los botones que no entran quedan cortados fuera del
viewport en vez de bajar a una segunda línea. `.topbar` (el padre) sí
tenía `flex-wrap:wrap`, pero eso solo le permite a `.topbar-right`
completo bajar como bloque debajo del logo — no hacía que sus propios
botones internos se acomodaran en varias líneas.

Arreglado agregando `flex-wrap:wrap` a `.topbar-right`. Validado con
una captura de Playwright de una página de prueba standalone (mismo
CSS real + los 9 botones de una cuenta dupla) a 412px de ancho — los 9
quedan visibles, acomodados en varias líneas, incluido "📋 Mis
derivaciones y seguimientos" que antes quedaba cortado.

### 10.1.58 Bug: los badges de las tarjetas de caso se salían del borde en celular (22/9/2026)

Agustina, con captura desde el celular: los badges ("activo", "Baja",
"⏰ hace N días sin seguimiento") de la lista de casos se veían
cortados, saliéndose del borde derecho de la tarjeta blanca.

Causa: `.persona-badges` (el contenedor de esos badges, dentro de cada
`.persona-card`) era `display:flex; gap:6px; flex-shrink:0;` sin
`flex-wrap` — con 2-3 badges (cada uno con `white-space:nowrap`,
pueden sumar bastante ancho, ej. "⏰ hace 6 días sin seguimiento") y
`flex-shrink:0` impidiéndoles achicarse, en una tarjeta angosta de
celular no entraban en la fila junto al avatar y el nombre/DNI, y sin
wrap se salían del borde en vez de acomodarse en otra línea.

Primer intento — agregar `flex-wrap:wrap` a `.persona-card` y a
`.persona-badges` — mejoraba los casos con 3 badges (bajaban enteros a
su propia línea) pero rompía los de 2 badges cortos: al "casi entrar"
en la misma línea que nombre/DNI, apretaban `.persona-info` a un
ancho mínimo y el texto del nombre/DNI quedaba partido palabra por
palabra — peor que el bug original, y dependía impredeciblemente de
cuántos badges había y cuán largo era cada uno.

Arreglo final: `.persona-badges` con `flex-basis:100%` — así SIEMPRE
ocupa su propia línea completa, debajo de avatar+nombre/DNI, sin
importar cuántos badges haya ni cuán largos sean (un ítem flex con
`flex-basis:100%` nunca cabe junto a otro contenido en la misma línea,
así que fuerza el salto de línea de forma predecible en cualquier
ancho — no depende de un cálculo de "casi entra"). `flex-wrap:wrap` se
mantiene en `.persona-badges` para el caso de 4+ badges (cuentas
admin/coordinación, que además ven el badge "Dupla X").

Validado: balance de `<div>`/`<button>` de `casos.html` sin cambios
(291/291, 75/75 — solo CSS), `node --check` sobre sus 2 bloques
`<script>` no vacíos, y capturas de Playwright de una página de
prueba standalone con los 3 casos reales de la captura de Agustina
(David Riquelme con 2 badges, Patricia Almiron y Gaston Corrales con
3) a 393px de ancho — con el primer intento (solo flex-wrap) el caso
de 2 badges salía roto; con `flex-basis:100%` los 3 casos quedan
prolijos, badges siempre en su propia línea, nada se corta.

### 10.1.59 Se revierte el layout de dos columnas del §10.1.56 (22/9/2026)

Agustina, con captura del celular: "Chacarita Sector 1, que es la
etiqueta de la dupla... no puede estar abajo de los casos. Te pido un
poco de criterio. Y además, en la web no mobile, está todo
desalineado."

El §10.1.56 había armado `.home-top` con dos columnas (turno angosto a
la izquierda, "para revisar"+jornada+KoBo a la derecha) y, en mobile,
reordenaba por CSS para que la columna derecha quedara arriba y turno
abajo del todo. En la práctica esto tenía dos problemas reales que no
se habían notado en la vista previa con datos de ejemplo (sin los
recordatorios de KoBo sin identificar, que suman varias tarjetas más):

- En mobile, con jornada + KoBo pendientes + KoBo sin identificar
  ocupando varias tarjetas, el turno terminaba varias pantallas más
  abajo, después de toda esa lista — perdiendo su lugar de primera
  orientación ("¿dónde/con quién estoy hoy?").
- En desktop, las tarjetas (`.jornada-card`, `.kobo-pend-card`,
  `.mi-turno-card`) están pensadas para un ancho de hasta 860px —
  comprimidas en una columna de ~380-500px (`.home-top-right`) se
  veían apretadas/desalineadas.

Se saca `.home-top`/`.home-top-left`/`.home-top-right` y el `@media`
que reordenaba, y los 4 widgets vuelven a ser bloques full-width
apilados (mismo `max-width:860px; margin:...auto 0; padding:0 18px;`
del diseño original) — pero en un orden fijo distinto al de antes del
§10.1.55: **turno primero siempre**, después "para revisar", jornada,
KoBo pendientes. Es el balance entre los dos pedidos: turno no queda
enterrado (criterio de Agustina), y "para revisar" sigue siendo lo
segundo que se ve, mucho más arriba que en el diseño original donde
era lo último (pedido original del §10.1.55).

Validado: balance de `<div>`/`<button>` de `casos.html` (288/288,
75/75 — 3 divs de wrapper menos, ningún botón), `node --check` sobre
sus 2 bloques `<script>` no vacíos, y capturas de Playwright de una
página de prueba standalone con los 4 widgets con contenido de ejemplo
en 900px y 390px — en ambos anchos: turno arriba, para revisar
segundo, jornada tercero, KoBo pendientes cuarto, todo full-width y
alineado, sin columnas.

### 10.1.60 Admin: resumen diario de todas las duplas juntas (23/9/2026)

Agustina: "en el resumen diario del admin quiero ver el resumen de
todas las duplas, además de filtrar 1 por una quiero ver el resumen
así veo quiénes están en falta, quiénes están haciendo pocos casos,
etc. Necesito poder controlar lo que pasa."

La pestaña "Resumen diario" de `admin-duplas.html` (§10.1.26) solo
dejaba ver una dupla a la vez (dropdown + fecha + detalle). Para
"controlar" hace falta poder barrer todas las duplas de un día de un
vistazo y detectar sin hacer 30 clics cuáles no marcaron jornada o no
cargaron nada. Se agrega arriba de la vista existente (que queda
intacta, con su propio subtítulo "Resumen de una dupla — un día, con
detalle") una tabla nueva "Resumen de todas las duplas — un día":
una fila por dupla (roster completo de `duplas`, no solo las que
tuvieron actividad ese día) con columnas Jornada / Casos nuevos /
Intervenciones / Derivaciones / Seguimientos, y un botón "Ver detalle
→" que carga esa dupla+fecha en la vista de detalle de abajo y hace
scroll (`Casos_verDetalleDiario()`) — para no duplicar la lógica de
detalle, solo la de listar.

Query: 6 consultas en paralelo (`duplas`, `personas` creadas ese día,
`personas` completas para poder resolver dupla desde `derivaciones`
que no tiene `dupla_id` propio, `intervenciones`, `seguimientos`,
`jornadas`), más una 7ª secuencial a `derivaciones` filtrada por los
ids de persona ya resueltos (se salta si no hay ninguna persona
cargada). Mismo recorte de rango UTC del día en horario de Buenos
Aires que ya usaba `calcularResumenDiarioAdmin()` (§10.1.26), ahora
factorizado en `_rangoUtcDelDia()` para no repetirlo.

Código de colores de la fila (para que salte a la vista lo que hay
que mirar, sin leer número por número):
- 🔴 fondo rojo: la dupla no marcó inicio de jornada ese día
  (`sinMarcar`, gana sobre todo lo demás).
- 🟡 fondo amarillo: marcó jornada pero no cargó ningún caso nuevo,
  intervención, derivación ni seguimiento (`sinActividad`).
- Números en rojo dentro de cada celda: esa columna puntual está en
  cero (aunque la fila no esté coloreada — ej. una dupla activa que
  igual no cargó derivaciones ese día).

Validado: balance de `<div>`/`<button>`/`<table>`/`<td>`/`<select>`
de `admin-duplas.html` (todos calzan; el desbalance inicial de
`<tr>` que marcó un chequeo con regex simple era un falso positivo
del regex con el `<tr${...}>` dinámico, no del HTML real — confirmado
leyendo el bloque generado). `node --check` sobre los 2 bloques
`<script>` no vacíos del archivo. Script de Node standalone
reimplementando `contarPor()`, la resolución `derivPorDupla` vía
`persona_id → dupla_id`, y la decisión de color de fila
(`sinMarcar`/`sinActividad`) con datos sintéticos — 17 casos (incluye
persona huérfana sin dupla, dupla sin ninguna fila de jornada, dupla
con jornada "en curso" sin `fin`, dupla con jornada completa pero cero
actividad) — todos pasan.

### 10.1.61 "Ver detalle" del §10.1.60 pasa a ser desplegable inline (23/9/2026)

Agustina: "al ver detalle quiero verde desplegable no que me lleve a
bajo de todo."

El botón "Ver detalle →" del §10.1.60 hacía scroll a la sección de
"una dupla — un día, con detalle" al final de la pestaña
(`Casos_verDetalleDiario()`, reutilizando `calcularResumenDiarioAdmin()`
con el dropdown/fecha seteados a mano) — obligaba a perder de vista la
tabla de todas las duplas para ver el detalle de una. Se cambia a un
desplegable: cada fila de la tabla de "todas las duplas" tiene ahora
una segunda fila hermana (`<tr id="detalle-fila-<id>">`, oculta por
`display:none`) con un contenedor propio (`detalle-cont-<id>`) que el
botón (ahora `Casos_toggleDetalleDiario()`) muestra/oculta in situ, sin
mover el scroll.

Como puede haber más de un detalle abierto a la vez (dos duplas
distintas), había que sacar la dependencia de ids fijos que tenía el
cálculo/render existente:
- `calcularResumenDiarioAdmin()` (el del formulario de abajo) se separó
  en el wrapper que lee `#diario-dupla`/`#diario-fecha` y maneja
  estado/botón, más una función nueva reutilizable
  `_cargarResumenDiario(duplaId, fecha, contId)` con toda la lógica de
  queries — la llaman tanto el formulario de abajo (`contId='diario-cont'`)
  como el desplegable inline (`contId='detalle-cont-<id>'`).
- `_renderResumenDiarioAdmin()` ahora recibe `contId` y lo usa para el
  contenedor y para el id del textarea del mensaje (`texto-<contId>`,
  antes `diario-texto` fijo) — con dos desplegables abiertos, un id fijo
  habría hecho que "Copiar mensaje" de la segunda dupla tocara el
  textarea de la primera.
- El `window._ultimoResumenDiario` global (una sola variable, se pisaba
  entre secciones) pasa a ser `window._resumenesDiarios[contId]`, un
  mapa — así "Armar mensaje"/"Copiar"/"Compartir por WhatsApp" de cada
  desplegable arman el texto de esa dupla, no el de la última calculada
  en cualquier otro lado de la pantalla.
- CSS: el estilo del textarea del mensaje (`#diario-texto { min-height:
  260px }`) pasa a ser por clase (`.diario-texto-area`), porque el id ya
  no es fijo.

Validado: `node --check` sobre los 2 bloques `<script>` (sin cambios de
cantidad), balance de `<div>`/`<button>`/`<table>`/`<td>`/`<select>`/
`<textarea>` del archivo completo (259/259, 42/42, 10/10, 100/100,
2/2, 5/5). Script de Node standalone con un DOM simulado a mano
(sin `document` real) reproduciendo el patrón de namespacing por
`contId`: abre el detalle de dos duplas distintas a la vez, arma
mensaje en cada una y confirma que no se pisan (ni el texto ni el
`<textarea>` que lo contiene), cierra una sin afectar el estado de la
otra, y confirma que la sección de abajo sigue usando `diario-cont`
como default cuando no se pasa `contId` — 13 casos, todos pasan.

**Fix chico el mismo día:** Agustina, con captura — "fijate que el ver
detalle está fuera del cuadrante". El botón de la última columna
envolvía el texto ("Ver detalle" / "→" en dos líneas) porque esa
columna no tenía ancho reservado y competía por espacio con las demás.
Se le agrega `white-space:nowrap` al botón y a su celda, y `width:1%`
al `<th>` vacío de esa columna (truco estándar para que en una tabla
`border-collapse` sin `table-layout:fixed` esa columna se achique al
contenido exacto del botón y las demás se repartan el resto). Validado
con el mismo chequeo de balance de tags de arriba.

### 10.1.62 Bug: envíos de KoBo mal atribuidos cuando el operador hace más de un turno (23/9/2026)

Agustina reportó varios casos concretos de "X casos cargados en KoBo, casi
nada en la plataforma": Natalia Soto (dupla M, 6 en KoBo/0 en plataforma),
Marcelo Gissi (8 en KoBo/1 en plataforma), Mia Cubero (dupla C, 1 en
KoBo/no aparece). Investigando el roster (`integrantes`) contra `duplas`
encontré que **Marcelo Gissi está activo en dos duplas a la vez: F (turno
T2) e I (turno T3)** — el primer diagnóstico fue "esto es un duplicado de
carga masiva, hay que desactivar una fila" y armé una pregunta para
confirmar cuál era la correcta. Agustina cortó por lo sano: **"marcelo
gissi hace 2 turnos"** — las dos filas son legítimas, la persona
efectivamente trabaja en ambas duplas en turnos distintos del día.

Eso cambió el diagnóstico: el bug real no es un dato sucio, es
`buscarDuplaPorNombre()` en `shared/js/dashboard-engine.js` — cuando el
nombre de un operador matchea MÁS de una fila de `integrantes` (persona
con más de un turno), la función usaba `.find()` y se quedaba con la
primera fila en el orden en que Supabase la devolviera (no garantizado
estable) — **todos** los envíos de esa persona, sin importar en qué turno
los hizo, quedaban pegados a esa única dupla. Exactamente el patrón
reportado: un operador de dos turnos con casi toda su carga real
concentrada (mal) en una sola de sus duplas en el resumen.

Fix: desambiguar por el horario del envío (`p.hora`, ya extraído de
`_submission_time` en `parseUmbral0()`) contra la ventana horaria del
turno de cada dupla candidata — mismo mapeo T1-T4 que ya usa
`ZONAS_OPERATIVAS_UMBRAL_0` en `config/umbral-0.js` (T1 6-10hs, T2
10-14hs, T3 14-18hs, T4 18-22hs), tomado ahora también de la columna real
`duplas.turno`:
- La vista `integrantes_publico` (pública, sin login, la que lee
  `cargarRosterUmbral0()`) no exponía `turno` — se le agrega con
  `CREATE OR REPLACE VIEW` (migración `integrantes_publico_add_turno`),
  sumando la columna al final sin tocar las que ya existían.
- `buscarDuplaPorNombre(roster, nombreOperador, hora)` ahora junta TODOS
  los matches (antes se quedaba con el primero); si hay uno solo, se
  resuelve como siempre; si hay más de uno, filtra por cuál turno
  contiene la hora del envío — si exactamente uno matchea, esa es la
  dupla; si el horario no ayuda (cae fuera de toda ventana, o entra en
  más de una — no debería pasar con T1-T4 sin solaparse, pero por las
  dudas), se devuelve la primera dupla como antes (no empeora el
  comportamiento previo) pero marcada `ambiguo:true`.
- Los envíos marcados `ambiguo` se ven con un ⚠️ al lado de la dupla en
  "Últimas intervenciones", y se suman aparte en una caja nueva "🕓 Envíos
  sin turno claro" (mismo patrón visual que "⚠️ Operadores sin dupla
  reconocida", § ya existente) — así Agustina puede ver de un vistazo
  cuántos envíos de gente multi-turno no se pudieron resolver solos, en
  vez de que quede escondido dentro del número "correcto" de alguna
  dupla.
- De paso, `cargarRosterUmbral0()` ahora pide `.order('dupla_codigo')` —
  antes el orden de la query no estaba especificado, así que el
  desempate por defecto (cuando el horario tampoco alcanza) ahora es
  determinístico en vez de depender del orden interno de Postgres.

Nota aparte, sin tocar (no era el bug reportado, y no hay ambigüedad de
turno en estos casos): en la misma revisión encontré **Lucas Ojeda** (DNI
40495582) activo en dupla B y F a la vez, con el mismo patrón de "dos
filas insertadas en el mismo instante" — puede ser otro caso de dos
turnos reales (como Gissi) o un duplicado de carga, no lo sé; y **Mayra
Quito** con una fila repetida dentro de la MISMA dupla E (sin ambigüedad
de dupla, pura fila de más). Quedan para confirmar con Agustina, no se
tocó ninguna de las dos.

Para Natalia Soto y Mia Cubero (dupla única cada una, sin ambigüedad de
turno) el fix de este ticket no aplica — si sus envíos de KoBo siguen sin
verse en la plataforma hay que revisarlo por otro lado (lo más probable:
están legítimamente pendientes de confirmar en "KoBo pendientes" de
`casos.html`, y todavía no se cargó el caso). No se pudo verificar contra
la API en vivo de KoBo desde este entorno: `kf.kobotoolbox.org` está
bloqueado por la política de red del sandbox.

Validado: `node --check` sobre `dashboard-engine.js`, balance de
`<div>`/`<button>`/`<table>` en `dashboard.html`. Script de Node
standalone reimplementando `buscarDuplaPorNombre()`/`horaEnTurno()` con
el roster real de Gissi (F/T2, I/T3): envío a las 11hs resuelve F sin
ambigüedad, a las 16hs resuelve I sin ambigüedad, a las 2hs (fuera de
toda ventana) y sin hora quedan marcados ambiguos pero igual devuelven
una dupla, nombre en orden invertido ("Gissi, Marcelo") sigue
matcheando, y el caso de una sola dupla (Natalia Soto) sigue
resolviendo igual que antes del cambio — 12 casos, todos pasan.

### 10.1.63 "KoBo pendientes" fallaba en silencio (23/9/2026)

Siguiendo el hilo del §10.1.62: Agustina confirmó que ya había revisado
"KoBo pendientes" en `casos.html` para dupla M y los envíos de Natalia
Soto (una sola dupla, sin la ambigüedad de turnos del §10.1.62) no
aparecían ahí tampoco — ni como alta nueva, ni como posible
continuación, ni como sin identificar.

Revisé la base (perfil de dupla M, su fila en `integrantes`, políticas
RLS de `integrantes`/`personas`) y todo el lado de Supabase está bien
conectado — `m@umbral0.app` apunta a la dupla M correcta, Natalia Soto
está cargada como integrante activa de esa misma dupla, RLS deja leerla.
No pude ir más allá porque el acceso a la API en vivo de KoBo
(`kf.kobotoolbox.org`) está bloqueado desde este entorno (mismo límite
que el §10.1.62) — no hay forma de confirmar desde acá con qué texto
exacto quedó guardado el campo "operador" en sus envíos reales.

Lo que SÍ encontré revisando el código: `cargarKoboPendientes()`
fallaba **en silencio**. Si el pedido a KoBo (o cualquier paso de la
función) tira una excepción, el `catch` solo hacía
`box.style.display = 'none'` — el panel entero desaparece, exactamente
igual que cuando genuinamente no hay nada pendiente. Para la dupla (o
para Agustina revisando) un error de red y "no hay pendientes" se ven
IDÉNTICOS, sin ninguna pista de cuál de las dos pasó. Si el chequeo de
Natalia falló por esto (en vez de encontrar cero envíos suyos), no
había forma de notarlo desde la pantalla.

Fix: el `catch` ahora deja el panel visible con un aviso
("⚠️ No se pudo revisar si hay envíos de KoBo pendientes...") en vez de
esconderse — sigue sin ser bloqueante (la dupla puede seguir usando el
resto de la página), pero ahora un error real se distingue de "no hay
nada pendiente". Esto no explica por sí solo el caso de Natalia Soto —
puede ser esto, o puede ser que el nombre que quedó guardado en el
envío de KoBo no matchee contra "Natalia Soto" (apodo, error de tipeo,
etc.) — pero al menos la próxima vez que pase, va a quedar visible cuál
de las dos cosas es.

Validado: `node --check` sobre los 2 bloques `<script>` de `casos.html`,
balance de `<div>`/`<button>` del archivo completo (291/291, 75/75).

### 10.1.64 Accesos de coordinación (23/9/2026)

Agustina: "quiero poder darle un usuario a Anabella, coordinadora de la
parte de personal de Umbral, para que pueda ver los datos de las duplas,
de los turnos, del resumen diario, etc."

`admin-duplas.html` ya dejaba entrar al rol "coordinacion" (`boot()`,
mismo gate que "admin") y las políticas RLS de `duplas`/`personas`/
`intervenciones`/`derivaciones`/`seguimientos`/`jornadas` ya le dan
lectura completa a ese rol — no hacía falta tocar permisos, solo faltaba
una forma de CREAR la cuenta. Hasta ahora el único flujo de alta
(`abrirModalAcceso()`/`guardarAcceso()`) era específico de duplas: pedía
un `dupla_id` y usaba el código de la dupla como nombre.

Se agrega, en "👥 Duplas y equipo", una sección nueva "🧑‍💼 Accesos de
coordinación" — mismo mecanismo (`SupabaseClient.crearCuenta()` +
`perfiles.upsert()`, permitido por la policy `perfiles_admin_insert` para
admin o coordinacion) pero pidiendo nombre a mano (no hay dupla de la
que sacarlo) y sin `dupla_id`. Lista las cuentas admin/coordinacion ya
creadas arriba del botón, para verlas de un vistazo. Una cuenta de
coordinación entra a `admin-duplas.html` igual que Agustina (ve todo:
duplas y equipo, reporte semanal, resumen diario) pero NO puede entrar a
"Casos" a cargar altas/derivaciones — esa pantalla exige rol "dupla" con
`dupla_id` propio.

No creé la cuenta de Anabella yo mismo — el flujo la pide crear a mano
desde la pantalla (nombre + email + contraseña elegida por quien la
crea) para que Agustina defina y anote la contraseña, en vez de que yo
la invente y quede en este chat.

Validado: `node --check` sobre los 2 bloques `<script>` de
`admin-duplas.html`, balance de `<div>`/`<button>`/`<form>` del archivo
completo (273/273, 45/45, 2/2) — `<input>` no balancea por ser tag
auto-cerrado (23 aperturas, 0 cierres, esperado). Confirmado contra
`pg_policies` de Supabase que el rol "coordinacion" ya tenía SELECT en
todas las tablas relevantes y que `perfiles_admin_insert` permite el
alta desde una cuenta admin o coordinacion.

### 10.1.65 "Duplas y equipo": colapsar listas largas detrás de un número (23/9/2026)

Agustina: "en dupla y equipos no necesito ver el listado completo de
kobos sin identificar. que me marque un número y si quiero que se abra
un desplegable. quiero que se vea bien los operadores por turnos, con
la posibilidad de editar y que ahí se abra un desplegable de duplas
territoriales donde se carga o se editan. ⚠️ Posibles duplicados, 🩺
Completar datos faltantes desde KoBo y 📥 KoBo pendientes que me
muestren número y se abra un desplegable también, sino es mucha
información."

Se agrega un patrón colapsable genérico (`toggleResumen(bodyId,
toggleEl)`, CSS `.resumen-toggle`/`.resumen-toggle-body`) y se aplica a:

- **📥 KoBo pendientes** y **🙈 KoBo sin identificar**: arrancan
  mostrando solo "📊 N envíos pendientes"/"✅ Sin pendientes" — la tabla
  completa (ya existía, sin cambios) queda oculta hasta tocar esa línea.
  El conteo se actualiza en `cargarKoboPendientesAdmin()`, mismo momento
  en que ya se armaban las dos tablas.
- **🩺 Completar datos faltantes desde KoBo** y **⚠️ Posibles
  duplicados**: mismo patrón, contador actualizado en
  `mostrarCompletitudKobo()`/`mostrarDuplicadosAdmin()` (que ya corrían
  al terminar "🔍 Revisar" — no hizo falta tocar cuándo se calculan,
  solo qué se muestra por default).
- **👥 Duplas territoriales**: cada tarjeta de dupla (antes: SIEMPRE
  todas expandidas con el formulario completo — 13+ tarjetas de edición
  abiertas a la vez, la cantidad de información que motivó todo este
  pedido) ahora arranca colapsada mostrando solo código, zona, turno y
  cantidad de integrantes; tocarla abre el formulario de edición
  completo (mismo formulario de siempre, sin cambios funcionales). "+
  Nueva dupla" crea la fila y abre esa tarjeta puntual (si no, quedaría
  perdida colapsada entre las demás).
- **👥 Operadores por turno**: se mantiene visible tal cual estaba (no
  pedido para colapsar), pero cada código de dupla suma un botón
  "✏️ Editar" (`abrirEdicionDupla(duplaId)`) que abre y hace scroll a la
  tarjeta correspondiente en "Duplas territoriales" de abajo — así se
  puede corregir el roster sin tener que bajar a buscar la dupla a mano
  entre todas las demás. Mismo patrón de "abrir y saltar" que
  `Casos_verDetalleDiario()`/`Casos_toggleDetalleDiario()` del §10.1.60-61,
  pero apuntando a una sección distinta en vez de una fila hermana.

Validado: `node --check` sobre los 2 bloques `<script>`, balance de
`<div>`/`<button>`/`<form>`/`<select>`/`<textarea>` del archivo completo
(284/284, 46/46, 2/2, 2/2, 5/5). Script de Node standalone con un DOM
simulado a mano validando `toggleResumen()` (abre/cierra alternando,
pinta y saca la clase `open`), el formato de contador
singular/plural/cero, y `abrirEdicionDupla()` (deja el body visible y
`open` marcado, y no rompe si se llama dos veces seguidas — idempotente)
— 10 casos, todos pasan.

### 10.1.66 Se funden "Jornada de hoy" + "Operadores por turno" + "Duplas territoriales" en una sola vista (23/9/2026)

Agustina, sobre el resultado del §10.1.65: "es confuso la organización,
es como que operadores por turnos y duplas territoriales es redundante.
el objetivo de la funcionalidad es poder ver las duplas con sus
integrantes por turno, zona y horario y poder ver si están marcando
presencia hoy y poder editar a los prestadores si es necesario."

Tenía razón: eran 3 secciones separadas mostrando en parte lo mismo —
"🕒 Jornada de hoy" (tabla de solo lectura: dupla/turno/inicio/fin/
estado), "👥 Operadores por turno" (tabla de solo lectura: dupla/turno-
zona/integrante/DNI/teléfono, agregada recién en este mismo día con un
botón "✏️ Editar" que saltaba a la tercera sección) y "👥 Duplas
territoriales" (la única editable, con el formulario completo). El
§10.1.65 ya había colapsado esta última por tarjeta, pero las otras dos
seguían aparte, duplicando información y obligando a mirar 3 lugares
para lo que es una sola pregunta ("¿cómo está esta dupla ahora?").

Se eliminan `cargarJornadaHoyAdmin()` y `cargarOperadoresPorTurno()`
enteras (con sus tablas y botones "🔄 Actualizar" propios) y toda esa
información se funde en el resumen colapsado de cada tarjeta de "👥
Duplas territoriales" (única sección que queda, movida al principio de
la pestaña): `cargarDuplas()` ahora trae también `jornadas` de hoy
(`fecha = hoyStr(0)`) en el mismo viaje que duplas+integrantes, y
`renderDuplaCard(d, jornada)` arma una sola línea con turno+horario,
zona, el mismo badge de presencia que tenía "Jornada de hoy" (✅
completa / 🌤️ en curso / ⚠️ no marcó — este último ahora en rojo, no
gris, para que salte más al ver el listado) e integrantes por nombre
(no solo la cantidad, como en el §10.1.65 anterior). El badge de
jornada no se muestra para duplas inactivas (no tiene sentido preguntar
si "marcaron presencia" en una dupla que no está operando). Tocar la
tarjeta sigue abriendo el mismo formulario de edición de siempre —
nada cambió ahí, solo se sacó la necesidad de las otras dos tablas.

La sección ahora tiene su propio "🔄 Actualizar" (antes cada una de las
3 tenía el suyo) y sigue con "+ Nueva dupla"/"⚡ Crear accesos
faltantes" al lado, todo en un solo lugar.

Validado: `node --check` sobre los 2 bloques `<script>`, balance de
`<div>`/`<button>`/`<form>`/`<select>`/`<textarea>` del archivo completo
(277/277, 44/44, 2/2, 2/2, 5/5 — bajó de 284/46 del §10.1.65 porque se
sacaron 2 tablas enteras). Confirmado que no queda ningún `id` ni
función duplicada (`duplas-list` aparece una sola vez, `cargarDuplas`
se define una sola vez) ni llamadas colgando a las funciones borradas.
Script de Node standalone reimplementando la lógica de la línea de
resumen (turno+horario, texto de integrantes, badge de jornada según
`activa`/`inicio`/`fin`) con 7 escenarios: jornada completa, en curso,
sin marcar, dupla inactiva (sin badge), sin turno asignado, dos
integrantes, y una fila de integrante en blanco que no debe aparecer en
el texto — 10 casos, todos pasan.

### 10.1.67 Resumen de dupla: separar la presencia de hoy del resto del texto (23/9/2026)

Agustina, sobre el §10.1.66: "podés mejorar la vista de las que marcan
jornada, está todo en una misma caja y confunde."

El resumen colapsado de cada tarjeta era una sola línea de texto
corrida — código, turno+horario, zona, el badge de presencia de hoy y
la lista de integrantes, todo mezclado uno atrás del otro sin
jerarquía visual. Se reorganiza en 3 filas dentro de la misma tarjeta,
sin tocar nada del formulario de edición de abajo:
1. **Código + badge de presencia** (✅/🌤️/⚠️) — lo primero que hay que
   ver, separado con más lugar para respirar en vez de ir pegado al
   resto del texto.
2. **Turno + horario · zona** — en gris, más chico.
3. **👤 integrantes** — en gris más claro, al final.

Validado: `node --check` sobre los 2 bloques `<script>`, balance de
`<div>`/`<button>`/`<span>` del archivo completo (281/281, 44/44,
63/63 — subió de 277 divs por las 3 filas nuevas, sin agregar ningún
botón ni cambiar la lógica de click, que sigue atada al mismo
`[data-role="resumen"]` de siempre).

### 10.1.68 Separador visual entre turnos en "Duplas territoriales" (23/9/2026)

Agustina: "marca la división de turnos."

La lista ya venía ordenada por turno (`order('turno')` en
`cargarDuplas()`), pero sin ningún corte visual las 4 franjas horarias
se veían como una lista corrida de tarjetas — había que leer el turno
de cada tarjeta una por una para notar dónde terminaba T1 y empezaba
T2. Se agrega un separador (`renderTurnoDivider()`) cada vez que el
turno cambia respecto de la tarjeta anterior: un título chico en
mayúsculas con línea inferior ("T1 · 6-10HS", etc.), y "SIN TURNO
ASIGNADO" para las duplas sin turno cargado (quedan al final, mismo
orden de siempre — `nullsFirst:false`).

Validado: `node --check` sobre los 2 bloques `<script>`. Script de
Node standalone reimplementando la lógica de armado de la secuencia
(un divider cada vez que cambia `turno`, agrupando duplas sin turno
bajo un único divider en vez de uno por dupla) contra un caso con 3
turnos + 2 duplas sin turno, y el caso trivial de un solo turno — 8
casos, todos pasan.

### 10.1.69 Bug: "Ver detalle" del resumen diario se salía de la tarjeta (23/9/2026)

Agustina, con captura: "el ver detalle me queda afuera de la caja."

La tabla de `_renderResumenTodasLasDuplas()` (§10.1.60) es la única del
archivo que NO estaba envuelta en `<div class="tbl-wrap">` (todas las
demás tablas del archivo sí lo tienen — es lo que le da
`overflow-x:auto` cuando la tabla no entra en el ancho de la tarjeta).
Con 7 columnas y el botón "Ver detalle →" forzado a `white-space:nowrap`
(fix del §10.1.61 sobre el mismo botón), en pantallas más angostas la
tabla terminaba más ancha que la tarjeta y, sin el wrapper, el
excedente se salía visualmente de la caja en vez de generar scroll
horizontal contenido adentro. Se agrega el mismo `<div class="tbl-wrap">`
que ya usan todas las otras tablas — cero cambios de lógica, solo el
contenedor que faltaba.

Validado: `node --check` sobre los 2 bloques `<script>`, balance de
`<div>`/`<button>`/`<table>` del archivo completo (282/282, 44/44,
8/8).

### 10.1.70 Subdominio propio: umbral0.huehaci.com (23/9/2026)

Agustina: "quiero que el dominio de la plataforma sea de huehaci" →
"huehaci.com compré el dominio y alojé https://soluciones.huehaci.com/plataforma
acá" → "pero cuando entrás a cada una tendría que llevarte a
umbral0.huehaci.com" → confirmado que Censo Flash también quiere su
propio subdominio (censoflash.huehaci.com).

Este es un cambio de infraestructura (dominios + DNS), no solo de
código — documentando acá la parte que SÍ vive en el repo y quedó
resuelta, y lo que queda en manos de Agustina (no tengo acceso a la
cuenta de Netlify ni al DNS de huehaci.com desde este entorno):

- **censoflash.huehaci.com**: no necesita ningún cambio de código — la
  raíz del sitio (`index.html`) ya ES Censo Flash. Agustina solo tiene
  que agregarlo como dominio personalizado en Netlify (Site settings →
  Domain management) y apuntar el DNS (CNAME) a este sitio.
- **umbral0.huehaci.com**: la raíz del sitio sirve Censo Flash para
  todos los dominios — hacía falta que ESTE dominio puntual, al entrar
  por la raíz, muestre Umbral 0 en cambio. Se agrega
  `netlify/edge-functions/umbral0-domain.js` (registrado en
  `netlify.toml` con `path = "/"`, así Netlify ni siquiera invoca la
  función para rutas que no sean la raíz): si el `Host` de la request es
  `umbral0.huehaci.com`, hace un `Response.redirect()` (HTTP real, no un
  rewrite transparente) a `/umbral-0/index.html`. Elegido redirect en
  vez de rewrite a propósito: así el navegador queda parado en la URL
  real donde vive el archivo, y todos los links relativos de adentro de
  Umbral 0 (`./casos.html`, `../dashboard.html` para volver a Censo
  Flash, etc.) siguen resolviendo exactamente igual que siempre — un
  rewrite transparente a `/` hubiera requerido mantener una lista de
  excepciones para no romper esos links "de vuelta a Censo Flash", que
  con el redirect no hace falta. Trade-off aceptado: la URL después de
  entrar queda en `umbral0.huehaci.com/umbral-0/index.html` (no
  `umbral0.huehaci.com/` pelado) — Agustina lo priorizó así frente a la
  alternativa de reestructurar el repo para que Umbral 0 pudiera vivir
  como sitio standalone (sus páginas dependen de rutas relativas
  `../shared/`, `../config/`, `../assets/` apuntando a la raíz del
  mismo repo, así que separarlo del todo es un cambio mucho más grande).
  Falta: Agustina tiene que agregar `umbral0.huehaci.com` como dominio
  personalizado en Netlify (activa Edge Functions automáticamente, no
  hace falta nada extra ahí) y apuntar su DNS.
- **soluciones.huehaci.com/plataforma**: confirmado que ese dominio es
  compartido con otros productos de Huehaci (no exclusivo de esta
  plataforma) — el `/plataforma` tiene que resolverse con una
  redirección o proxy configurado donde sea que viva soluciones.huehaci.com
  HOY (no en este repo, no en Netlify de este sitio). Si ese sitio
  también está en Netlify y en un repo al que Agustina me da acceso,
  puedo escribir ahí una redirección tipo `/plataforma/* → (este sitio)
  200` (Netlify sirve eso como proxy transparente, la URL no cambia en
  el navegador) — pendiente de que confirme dónde vive ese dominio.

Validado: `node --check` sobre `netlify/edge-functions/umbral0-domain.js`
(Node 22 detecta automáticamente sintaxis ESM en `.js` sin
`package.json`, mismo runtime que usa Netlify Edge Functions). TOML de
`netlify.toml` parseado con `tomllib` de Python, sin errores. Script de
Node standalone reimplementando la lógica de decisión del edge function
(mismo chequeo de `hostname`): confirma que redirige solo para
`umbral0.huehaci.com` y no para `censoflash.huehaci.com`, el dominio
default de Netlify, ni `soluciones.huehaci.com` — 5 casos, todos pasan.
No se pudo probar contra el runtime real de Netlify Edge Functions
desde este entorno (hace falta un deploy real).

### 10.1.71 Bug: el mensaje de WhatsApp del resumen diario podía compartirse con datos viejos (23/9/2026)

Agustina, con una captura de un mensaje real compartido: "Tomás
Villavicencio compartió este resumen del día [...] pero no es lo que
veo en la plataforma, revisá que los reportes estén funcionando bien."
El mensaje decía "22/09/2026" con 0 en todo (casos nuevos,
intervenciones, derivaciones, seguimientos) y una observación sobre un
operativo policial; la plataforma mostraba, para Dupla A, 3 casos
nuevos / 3 intervenciones / 1 seguimiento.

Antes de tocar nada, verifiqué contra la base real qué había cargado
Dupla A esos días: **22/9 tenía 7 casos nuevos** (con la observación
genérica "Jornada activa") y **23/9 tenía 3 casos nuevos** con una
observación sobre un operativo policial muy parecida (no idéntica,
parafraseada) a la del mensaje compartido — ninguno de los dos días
coincide con "0 en todo" del mensaje. También confirmé que
`_cargarResumenDiario()` (la función que arma el resumen) es
internamente consistente: todas sus sub-consultas (personas,
intervenciones, derivaciones, seguimientos, jornada) usan el mismo
`fecha`/`duplaId`, sin ningún desfasaje entre ellas — descartado un bug
de cálculo cruzando datos de días distintos.

La explicación que sí encaja con la evidencia: **"✍️ Armar mensaje" no
volvía a consultar nada** — arma el texto a partir del `r` que quedó
guardado en `window._resumenesDiarios[contId]` la última vez que se
calculó ese resumen (al apretar "Calcular" o abrir el desplegable de
"Ver detalle"). Si alguien mira el resumen temprano (0 casos todavía),
y recién más tarde aprieta "Armar mensaje"/"Compartir" — sin volver a
calcular — el mensaje sale con la foto vieja, aunque la dupla haya
seguido cargando casos mientras tanto. Con el tiempo suficiente entre
medio (y la dupla activa cargando), la diferencia puede ser tan grande
como la de este caso.

Fix: `armarMensajeDiarioAdmin(contId)` ahora es `async` y **siempre
vuelve a pedir los datos** (`_cargarResumenDiario(duplaId, fecha,
contId)`) antes de armar el texto, usando el `duplaId` que ahora
también se guarda en `_resumenesDiarios[contId]` (antes solo se
guardaba `duplaCod`, el código, no el id — hacía falta para poder
re-consultar). Mientras recalcula, el botón se deshabilita
("Actualizando…") — como `_cargarResumenDiario()` reconstruye todo el
panel (KPIs, textarea, el propio botón) tanto si sale bien como si
falla, no hace falta "restaurar" el botón a mano en ningún caso.
`copiarMensajeDiarioAdmin()`/`compartirWhatsappDiarioAdmin()` (que
llaman a `armarMensajeDiarioAdmin()` como fallback si el textarea está
vacío) ahora esperan (`await`) esa llamada y vuelven a buscar el
`<textarea>` por id después — la referencia de antes queda apuntando a
un nodo desprendido una vez que el panel se reconstruye.

Esto no explica el desfasaje de fecha (22 vs. 23) del caso puntual, que
puede haber sido simplemente una fecha mal elegida en el selector al
calcular por primera vez — pero sí cierra la clase de bug real y
verificable: un resumen calculado hace rato ya no podía compartirse con
números viejos sin que nadie lo notara.

Validado: `node --check` sobre los 2 bloques `<script>`, balance de
`<div>`/`<button>` del archivo completo (282/282, 44/44). Script de
Node standalone simulando el escenario real (un resumen calculado con
0 casos, la "base" cambia a 3 casos + observación real mientras tanto,
se aprieta "Armar mensaje" después): confirma que el mensaje arma con
los 3 casos y la observación actual, no el snapshot viejo de 0, que
`_cargarResumenDiario` se vuelve a llamar, y que una segunda llamada
inmediata (sin cambios en el medio) sigue trayendo lo mismo — 5 casos,
todos pasan.

### 10.1.72 Bug: confirmar un caso "sin identificar" no lo sacaba de pendientes (23/9/2026)

Agustina: "me reportan también varias duplas que la dupla A que valida
los casos sin identificar y le siguen apareciendo, recién lo validé
entrando a la dupla 14 y acepté el caso, tenía 14 envíos y acepté y
siguen 14."

Encontrado: `confirmarKoboSinIdentificar()` (el botón "➕ Cargar como
'Sin identificar'" de `casos.html`) abre el formulario de alta
precargado con los datos del envío, y `guardarPersona()` crea la
persona y su intervención inicial — pero **nunca escribía en
`kobo_validaciones`**. Para los envíos CON DNI
(`confirmarKoboPendiente()`) no hace falta: `cargarKoboPendientes()`
los excluye en cuanto existe una `personas.dni` que matchea. Pero un
envío "sin identificar" no tiene DNI ni nombre con qué matchear —
`kobo_validaciones` es la ÚNICA forma de marcar "este envío puntual ya
se usó". Sin esa escritura, el mismo envío quedaba pendiente para
siempre, sin importar cuántas veces se confirmara — exactamente "tenía
14, acepté, siguen 14".

Fix: nueva variable `koboSubIdSinIdentificarPendiente` que guarda el
`kobo_submission_id` del envío que se está confirmando.
`_renderFormPersona()` la resetea SIEMPRE al abrirse (para que un alta
manual, o una edición, no hereden un valor viejo);
`confirmarKoboSinIdentificar()` la setea recién DESPUÉS de llamar a
`_renderFormPersona()` (si no, el reset de arriba la pisaría). En
`guardarPersona()`, al crear una persona nueva, si esa variable está
seteada se hace un `upsert` a `kobo_validaciones` con
`kobo_submission_id`/`persona_id`/`dupla_id`/`creado_por` — en un
`try/catch` propio que NO frena el alta si falla (el caso ya se guardó,
lo único que se perdería es el tildado de ese envío puntual, que se
puede volver a confirmar).

Nota para Agustina: el fix evita que el bug siga pasando de acá en
adelante, pero **no puede "limpiar" retroactivamente** los envíos que
ya quedaron pendientes por este bug (dupla A con 14, y probablemente
otras duplas con el mismo patrón — hay entre 1 y 19 casos "sin
identificar" ya cargados por dupla en toda la plataforma, ver conteo
abajo). No tengo acceso a la API en vivo de KoBo desde este entorno
para poder cruzar cada envío viejo contra el caso que ya se creó y
completar `kobo_validaciones` a mano. Lo más simple: cada dupla vuelve
a tocar "✅ Confirmar" en los pendientes que reconozca como ya
cargados — con el fix, esa segunda confirmación si o sí va a dejarlos
marcados y van a dejar de aparecer (OJO: esto crea un caso NUEVO
duplicado del que ya se había cargado a mano la primera vez — antes de
re-confirmar en masa, más vale revisar si conviene primero ocultar/
fusionar los duplicados que ya existan, ver "⚠️ Posibles duplicados" en
el admin).

Conteo real de "sin identificar" cargados por dupla (activa, sin
ocultar) al momento de este fix: B 19, D 16, A 14, K 9, C 6, E 5, J 5,
H 5, F 5, G 3, I 2, L 2, M 1 — da una idea de la escala del problema
acumulado, no necesariamente todos son casos del bug (parte es carga
legítima que efectivamente ya no tiene el envío pendiente si el
operador nunca volvió a confirmar el mismo).

Validado: `node --check` sobre los 2 bloques `<script>` de `casos.html`,
balance de `<div>`/`<button>` del archivo completo (291/291, 75/75).
Script de Node standalone reimplementando el flujo completo
(`confirmarKoboSinIdentificar` → `_renderFormPersona` resetea →
`guardarPersona` escribe `kobo_validaciones` → `cargarKoboPendientes`
recalcula excluyendo lo ya validado): confirma que un envío confirmado
deja de aparecer en pendientes, que un alta manual (sin pasar por la
confirmación de KoBo) no deja basura en `kobo_validaciones`, y que
confirmar dos envíos distintos los saca a los dos — 9 casos, todos
pasan.

### 10.1.73 Admin puede confirmar "sin identificar" sin entrar a la cuenta de la dupla (23/9/2026)

Agustina, después del §10.1.72: "no los puedo confirmar yo desde el
admin?" — la tabla "🙈 KoBo sin identificar" de `admin-duplas.html` era
de solo lectura ("cada dupla confirma sus propios pendientes desde su
cuenta en Casos"), justo el trabajo que hacía falta para limpiar el
backlog que dejó el bug anterior.

Revisé las políticas RLS antes de tocar nada: `personas_insert`/
`intervenciones_insert`/`kobo_validaciones_insert` ya dejan insertar
con cualquier `dupla_id` desde una cuenta admin/coordinación (sin
restricción, a diferencia de una cuenta de dupla que solo puede
insertar con su propio `dupla_id`) — no hacía falta ningún cambio de
permisos, solo faltaba la función.

Se agrega un botón "✅ Confirmar" por fila (`confirmarKoboSinIdentificarAdmin(idx)`),
que arma el alta con el mismo criterio que `_prefillDesdeKobo(p, true)`
de `casos.html` (duplicado acá a propósito — los dos archivos no
comparten módulos JS, mismo patrón que `normalizarNombreKobo`/
`nombresCoincidenKobo`, ya duplicadas entre ambos):
- `punto_contacto`: el link al mapa si el envío trae geolocalización
  (caso normal — KoBo geolocaliza automático). Si NO la trae (raro), un
  `prompt()` pide una dirección/referencia a mano — sin punto de
  contacto no hay forma de ubicar a la persona después, así que no se
  guarda vacío; si se cancela el prompt, no se confirma nada.
- `historia_breve`: mismo texto armado que en `casos.html` (tipo/fecha/
  operador del envío + características si KoBo las trajo, o un aviso de
  que no trajo ninguna).
- Inserta `personas` (con el `dupla_id` de la fila, no el del admin, que
  no tiene uno propio) + `intervenciones` (alta = primer evento del
  timeline) + `kobo_validaciones` (mismo fix que el §10.1.72, para que
  este envío puntual no vuelva a aparecer).

`cargarKoboPendientesAdmin()` ahora guarda la lista completa en
`koboSinIdentificarAdminActuales` (antes se descartaba después de
pintar la tabla) para que el botón pueda ubicar el envío por índice sin
recalcular todo de nuevo — mismo patrón que `duplicadosAdminActuales`/
`completitudKoboActual` ya usado en este archivo.

Validado: `node --check` sobre los 2 bloques `<script>`, balance de
`<div>`/`<button>`/`<table>`/`<th>` del archivo completo (282/282,
45/45, 8/8, 34/34) y de los `colspan` de la tabla (subió de 6 a 7
columnas en las 5 apariciones — carga, sin KoBo conectado, sin
pendientes, error, y el `<thead>`). Script de Node standalone
reimplementando la parte pura de `confirmarKoboSinIdentificarAdmin()`
(sin la parte de red): con geolocalización arma `punto_contacto` con el
link de mapa sin pedir nada; sin geolocalización y el prompt cancelado
no arma nada; sin geolocalización con una dirección escrita a mano la
usa recortada; con descripción real de la persona no agrega el aviso
de "sin descripción" — 11 casos, todos pasan.

### 10.1.74 Admin: confirmar todos los "sin identificar" en lote (23/9/2026)

Agustina, apenas vio la tabla real: 118 envíos "sin identificar"
acumulados (backlog del bug del §10.1.72) — "dame la opción para
confirmar todos."

Se extrae la parte de inserción (`personas`/`intervenciones`/
`kobo_validaciones`) de `confirmarKoboSinIdentificarAdmin()` a una
función pura `_crearCasoSinIdentificarAdmin(item, puntoContacto)`, sin
`prompt()` ni refresco de tabla — la reutilizan tanto el botón
individual como el nuevo botón en lote. `confirmarTodosKoboSinIdentificarAdmin()`:

- Filtra solo los envíos que YA traen geolocalización completa
  (`lat` y `lng` no nulos) — pedir una dirección a mano por cada uno de
  118 envíos con un `prompt()` sería inmanejable, así que los que no
  traen ubicación quedan afuera del lote a propósito, para confirmar
  de a uno con el botón individual (que si sabe pedir la dirección a
  mano).
- Antes de arrancar, un `confirm()` explícito con el número exacto de
  casos que se van a crear, cuántos quedan afuera por falta de
  ubicación, y un aviso del riesgo de duplicados (remite a "⚠️ Posibles
  duplicados") — no hay forma de deshacer un lote de altas.
- Mientras corre, el botón muestra progreso ("Confirmando… (45/118)")
  y queda deshabilitado — cada alta es secuencial (no en paralelo), a
  propósito, para no saturar Supabase con 118×3 inserts simultáneos ni
  perder la cuenta de cuál falló si algo sale mal.
- Un envío que falla no corta el lote — seguimos con el resto y se
  cuenta aparte (`conError`), con el detalle en la consola del navegador
  para poder revisarlo después.
- Al terminar, un resumen ("Listo: 116 casos cargados, 2 fallaron... 4
  sin ubicación quedaron pendientes") y refresca la tabla una sola vez
  al final (no en cada iteración, para no recalcular todo 118 veces).

Validado: `node --check` sobre los 2 bloques `<script>`, balance de
`<div>`/`<button>`/`<table>` del archivo completo (283/283, 46/46,
8/8). Encontré y corregí un error de sintaxis real al escribir el
primer borrador (un ternario de conjugación singular/plural mal armado,
`${sinGeo===1?''}` sin rama `:`) — lo detectó `node --check`, no hizo
falta ningún paso extra. Script de Node standalone validando: el texto
de aviso singular/plural ("1 envío... queda... confirmalo" vs "3
envíos... quedan... confirmalos"), el filtrado por geolocalización
completa (un envío con `lat` pero sin `lng` NO cuenta como "con geo" —
2 de 4 casos de prueba quedan afuera del lote), y el loop de
procesamiento contando éxitos/errores por separado sin cortar ante un
fallo puntual, incluyendo el caso trivial de lote vacío — 8 casos,
todos pasan.

Estos puntos no bloquean construir lo de arriba, pero van a afectar el modelo
más adelante — quedan pendientes de definir con Agustina:

- **Reforzar que las duplas carguen "Pedir derivación" cuando corresponde**
  (§10.1.21, 18/9/2026): confirmado que 39 personas tienen denuncia de
  extravío de DNI marcada en la ficha pero solo 1 tiene el trámite
  "Hacer DNI" formalizado como derivación — el patrón se repite con el
  resto de "d." (§10.1.13, §10.1.20). El reporte ya avisa del hueco; falta
  definir CÓMO reforzar la carga en la práctica (¿recordatorio en la
  ficha cuando hay denuncia de extravío sin derivación asociada?
  ¿capacitación con las duplas? ¿ambas?) — pedido explícito de Agustina
  de dejarlo para después ("veamos después cómo reforzar que las duplas
  lo carguen").
- ~~"Pedir derivación"/"Registrar intervención" casi no se usan~~ —
  **actualizado 17/9/2026, ver §10.1.13**: no era falta de uso, era un
  bug real de RLS que bloqueaba CUALQUIER "Pedir derivación" desde una
  cuenta de dupla desde el 3/9/2026 (ya arreglado). `intervenciones`
  sigue teniendo un solo tipo real (`contacto_espontaneo`) — ese sí
  puede ser genuinamente falta de uso de "Registrar intervención", pero
  ahora que "Pedir derivación" funciona de verdad, vale la pena esperar
  una semana más de datos reales (ver §f. del reporte semanal) antes de
  asumir que tampoco se usa por elección.
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
