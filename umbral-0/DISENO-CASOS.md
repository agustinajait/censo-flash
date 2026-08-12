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

Las cuentas se crean desde el **Supabase Dashboard → Authentication → Add user**
(por ahora; más adelante puede armarse una pantalla de invitación). Después de
crear la cuenta, alguien con rol `admin` le asigna el rol en `perfiles` (yo
puedo hacerlo por vos con una consulta SQL cuando me pases el email creado).

## 2. Pantalla: Duplas y equipo — `admin-duplas.html` (ya construida)

Login con cuenta Supabase → si el rol es `admin`/`coordinacion`, lista de
duplas (código, zona, polígono, comuna) con sus hasta 2 integrantes editables
inline, más una sección aparte de choferes (sin zona fija). Todo contra las
tablas `duplas`/`integrantes`, protegido por RLS.

Pendiente sobre esto (no bloquea el resto): los **referentes de zona**
(Ilanit Álvarez, Natasha Forcinito, Luna Aloy) no están modelados todavía —
ver sección 10.

## 3. Glosario: herramientas de registro actuales y cómo conviven con la plataforma

El documento describe cuatro herramientas de registro que el equipo usa hoy,
por fuera de esta plataforma. Ninguna desaparece de un día para el otro — la
plataforma va absorbiendo funciones a medida que se construye:

| Herramienta actual | Qué es hoy | Rol en Umbral 0 (esta plataforma) |
|---|---|---|
| **Kobo** | Formulario de registro de intervenciones en territorio | Hoy es la fuente de las `intervenciones`. La app ya tiene un lugar para configurar formularios Kobo (`config.kobo`, vacío todavía) si se decide importar desde ahí en vez de cargar directo en la pantalla de ficha de persona (sección 6). Definir con Agustina si Kobo se mantiene en paralelo o se reemplaza. |
| **Grupo de WhatsApp de equipos territoriales** | Los operadores envían sus intervenciones ahí; coordinación y Gerencia Operativa ven en vivo qué pasa en territorio, despejan dudas, gestionan estrategias | No se reemplaza — es el canal de comunicación en caliente. La plataforma es el registro estructurado que **queda después** de esa conversación, no la reemplaza como canal. |
| **Planilla de seguimiento** | Coordinación consolida en una base de datos la info que le llega por WhatsApp | Esto es exactamente lo que hacen las tablas `personas`/`intervenciones`/`derivaciones`/`seguimientos` — el objetivo de Umbral 0 es que esta planilla deje de mantenerse a mano. |
| **Cartas de soflex** | Mencionado en el documento, no está claro qué son | **Pendiente de definir con Agustina** — ver sección 10. No se modela hasta saber de qué se trata. |

## 4. Pantalla: Nuevo ingreso / Ficha de persona

**Objetivo:** registrar a una persona en situación de calle la primera vez que
el equipo la contacta, y dejar un lugar único (la "ficha") donde se acumula
todo lo que pasa con ella en el tiempo.

**Flujo:**
1. **Buscar antes de crear** — campo de búsqueda por nombre/apellido/DNI contra
   `personas`, para no duplicar a alguien que ya está en seguimiento. Si
   aparece, va directo a su ficha (paso 3).
2. **Si es nueva persona**, formulario de alta → inserta en `personas`:
   - Datos básicos: `nombre`, `apellido`, `dni` (o `dni_denuncia_extravio` si no
     tiene y hay que acompañar a hacer la denuncia — igual que el circuito de
     DNI del documento), `fecha_nacimiento`, `nacionalidad`, `telefono_contacto`.
   - Ubicación: `punto_contacto` (dirección/referencia), `zona`, `comuna`.
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
   datos de arriba + foto, y debajo tres botones de acción:
   - ➕ Registrar intervención (otro contacto en territorio)
   - 📨 Pedir derivación (abre el formulario dinámico de la sección 5)
   - 📝 Agregar seguimiento (comentario o ítem de checklist, sección 6)

   Debajo, un **timeline cronológico** que mezcla `intervenciones` +
   `derivaciones` + `seguimientos` de esa persona (`order by fecha desc`). El
   timeline es también donde se ve el historial de derivaciones previas de la
   persona (egresos anteriores, rechazos) — relevante para Casa Vincular, que
   prioriza a quienes tuvieron reiterados egresos o egresos negativos de otros
   dispositivos (ver 5.2).

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

**Circuito** (fuera de la plataforma, referencia para las duplas):
1. El equipo arma este formulario + la foto y lo envía a coordinación
   (en la plataforma: guardar la derivación, `estado='solicitado'`).
2. Coordinación completa un Forms externo de solicitud de vacante, y reenvía
   el mismo mensaje al grupo de WhatsApp **"Derivaciones DIPA"** (GOPA +
   derivadoras de los CIS).
3. Las derivadoras van actualizando el estado en un documento externo —
   coordinación/admin replica ese estado en `derivaciones.estado`
   (`en_espera` → `aprobado`/`rechazado` → `efectivizado`).
4. La supervisión de RED (que tiene los móviles en calle) informa un tiempo
   estimado de arribo. Si el equipo tiene que seguir su recorrido, se piden
   datos de vestimenta de la persona para que el equipo que la traslade pueda
   identificarla (campo opcional `vestimenta` en `derivaciones.datos` para
   ese caso).
5. Mientras se espera, se le ofrece a la persona esperar en uno de los dos
   DIPA. Si rechaza, el equipo evalúa si conviene quedarse dando contención en
   calle o seguir el recorrido y volver cuando la vacante se otorgue — esto
   se puede dejar registrado como un `seguimiento` tipo comentario.

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

### 5.4 DNI, Médico/Salud, DIPA, Centro de día

Formulario simple (observaciones libres por ahora), enriquecible más
adelante:

- **Hacer DNI:** derivación de eximición de pago + acompañamiento en
  territorio a hacer el trámite (o la denuncia de extravío en comisaría, si
  corresponde).
- **Médico:** acompañamiento a hospitales/CESACs — incluye búsqueda de
  medicación y vinculación con la institución para controles médicos.
- **DIPA** (Combate de los Pozos 1280 — Dispositivo de Primer Acercamiento):
  recurso de trámites (Ciudadanía Porteña, 690), baños, duchas,
  desayuno/merienda y oferta programática. Cada 15 días se acerca Derecho a
  la Identidad al dispositivo para gestión de trámites de esa área. También
  es el lugar donde se ofrece esperar mientras se gestiona un ingreso a CIS
  (ver 5.1).
- **Centro de día:** sin detalle adicional en el documento — formulario
  simple hasta que se defina más.

### 5.5 Espacios de contención — aclaración, no es una derivación

El documento lista "espacios de contención" junto con las herramientas
territoriales, pero conceptualmente **no es una derivación a un recurso
externo** — es una actividad propia del equipo con las personas que ya tiene
en seguimiento, para sostener el vínculo que facilita el resto de las
gestiones. Por eso no tiene formulario de derivación: se registra como
`seguimiento` (sección 6), no como `derivacion`.

### 5.6 Tipo nuevo

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

## 9. Vista de coordinación / cliente (dashboard)

Reusa el patrón visual de `dashboard.html` (tabs por proyecto): listado de
casos activos con filtros por zona/comuna/estado/tipo de derivación pendiente,
y algún gráfico simple (derivaciones por tipo, casos por criticidad) — mismo
estilo que ya existe para Censo Flash. El rol `cliente` ve esto en modo
solo-lectura; no ve el roster de duplas/choferes (privacidad del equipo).

## 10. Lo que queda abierto

Estos puntos no bloquean construir lo de arriba, pero van a afectar el modelo
más adelante — quedan pendientes de definir con Agustina:

- **Contradicción sobre CIS y seguimiento** (5.1): el documento en un lugar
  describe pedidos espontáneos de CIS (sin vínculo previo) y en otro dice que
  el ingreso a CIS "se realiza siempre y cuando la persona sea seguimiento
  del área". Confirmar cuál es la regla real.
- **Mapeo zona frontera + puntos flash:** lo suma Flor Pedraza — sin definir
  todavía si esto se traduce en un campo/tabla o queda como mapa externo
  (My Maps, como en Censo Flash).
- **"Cartas de soflex"** — no quedó claro qué son en el documento, contame y
  lo sumo donde corresponda.
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

## 11. Próximo paso sugerido

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
