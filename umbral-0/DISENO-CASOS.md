# Umbral 0 — Diseño de gestión de casos

Este documento es el diseño de las pantallas de Umbral 0 que todavía no están
construidas: alta de caso (ingreso), pedido de derivación y acompañamiento
(seguimiento) hasta el egreso. Se basa en el documento del programa (27/07/2026)
y en el esquema ya aplicado en Supabase (proyecto `qwnrdclaeaskoyskbqff`,
cuenta `a.jait@inclusioncaii.org`).

Lo que **ya está construido**: el modelo de datos completo (6 tablas + `perfiles`
de roles + políticas RLS + bucket de fotos) y la pantalla `admin-duplas.html`
(alta/edición de duplas, integrantes y choferes). Lo que sigue acá es diseño,
a construir en el próximo paso.

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

## 3. Pantalla: Nuevo ingreso / Ficha de persona

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
3. **Ficha de la persona** (pantalla principal del caso): cabecera con los
   datos de arriba + foto, y debajo tres botones de acción:
   - ➕ Registrar intervención (otro contacto en territorio)
   - 📨 Pedir derivación (abre el formulario dinámico de la sección 4)
   - 📝 Agregar seguimiento (comentario o ítem de checklist, sección 5)

   Debajo, un **timeline cronológico** que mezcla `intervenciones` +
   `derivaciones` + `seguimientos` de esa persona (`order by fecha desc`).

## 4. Pantalla: Pedir derivación

Un botón "Pedir derivación" abre un selector de `tipo` (las opciones de
`config.derivacionOpciones`: DIPA, Micro, Hacer DNI, Médico, Centro de día,
CIS, + las que se sumen). Según el tipo elegido, el formulario cambia — los
campos van al `jsonb` `derivaciones.datos`, así no hace falta una tabla con
columnas que no aplican a todos los tipos:

- **CIS** (recurso más armado, tomado literal del documento): punto de
  contacto, nombre y apellido, fecha de nacimiento, edad, tiene DNI (sí/no +
  denuncia extravío), estado de salud, medicación, esquema, sube escaleras
  (sí/no), cama arriba (sí/no), estuvo en algún CIS antes (sí — cuál / no),
  resumen de la intervención. Muchos de estos campos ya están en `personas`
  (se auto-completan) — el formulario solo pide lo que falta o cambió.
  Foto del DNI/denuncia obligatoria antes de poder enviar (documento dice
  explícitamente que "no se realizan ingresos sin estos").
- **Casa Vincular** (solo habilitado si la persona ya tiene intervenciones
  previas — el documento dice "únicamente para los seguimientos"): informe
  social completo — situación habitacional, económica, sanitaria, redes de
  contención, situación educativa, resumen y estrategias futuras. Estos campos
  ya están en `personas` como columnas propias (se pre-cargan acá).
- **Micro**: datos duros (ya en `personas`) + checkbox obligatorio "confirmo
  que no presenta signos de consumo activo al momento del ingreso" (el
  documento es explícito: sin esto no se puede enviar).
- **DNI, Médico, DIPA, Centro de día**: formulario simple (observaciones libres),
  se puede enriquecer más adelante si hace falta.
- **Cualquier tipo nuevo** que se agregue a `derivacionOpciones` cae en el
  formulario genérico (solo observaciones) hasta que se le diseñe uno propio.

Al guardar: `derivaciones.estado = 'solicitado'`. Coordinación/admin puede
después actualizar el estado (`en_espera` → `aprobado`/`rechazado` →
`efectivizado`) a medida que le llega la respuesta por los canales actuales
(documento de derivadoras DIPA, grupo de Casas Vinculares, etc. — replicar esos
canales EN la plataforma es un paso futuro, no de esta iteración).

## 5. Pantalla: Acompañamiento (seguimiento)

Lista simple, ordenada por fecha, de:
- **Comentarios libres** (`seguimientos.tipo='comentario'`) — texto + quién y cuándo.
- **Ítems de checklist** (`tipo='checklist_item'`) — texto corto +
  `checklist_completado` (para cosas tipo "acompañar a control médico",
  "retirar medicación", que se marcan hechas con el tiempo).

No hay una lista fija de ítems de checklist todavía (el documento no la define) —
se cargan libres por ahora, igual que `criticidadOpciones`.

## 6. Egreso

El **egreso equivale a la derivación** (así lo definiste vos): cuando una
`derivacion` pasa a `estado='efectivizado'` y es la que cierra el caso, se
marca `personas.estado='egresado'`. No hay una pantalla separada de "egreso" —
es una consecuencia de actualizar el estado de la derivación correspondiente.

## 7. Vista de coordinación / cliente (dashboard)

Reusa el patrón visual de `dashboard.html` (tabs por proyecto): listado de
casos activos con filtros por zona/comuna/estado/tipo de derivación pendiente,
y algún gráfico simple (derivaciones por tipo, casos por criticidad) — mismo
estilo que ya existe para Censo Flash. El rol `cliente` ve esto en modo
solo-lectura; no ve el roster de duplas/choferes (privacidad del equipo).

## 8. Lo que queda abierto (tal como lo dejaste marcado en el documento)

Estos puntos no bloquean construir lo de arriba, pero van a afectar el modelo
más adelante:

- **Traslados** a casas vinculares/centros barriales/hospitales: ¿se coordinan
  por handy/móvil de la RED, o pasan a registrarse acá también? Hoy no hay
  tabla para esto.
- **Referentes por zona/polígono** (Ilanit Álvarez, Natasha Forcinito, Luna
  Aloy) — no están modelados todavía; si terminan siendo un rol más
  (`perfiles.rol='referente'`) o simplemente un campo en `duplas`, se define
  cuando digas con qué equipos trabaja cada una.
- **"Cartas de soflex"** — no me quedó claro qué son del documento, contame y
  lo sumo donde corresponda.
- **Reporting semanal/mensual** — reunión semanal de inicio/cierre y monitoreo
  mensual (con Flor Pedraza): en algún momento esto puede automatizarse (igual
  que quedó pendiente para Censo Flash) una vez que haya datos reales cargados.

## 9. Próximo paso sugerido

Construir la pantalla de **Nuevo ingreso / Ficha de persona** (sección 3) —
es la puerta de entrada de todo el resto (derivaciones y seguimientos cuelgan
de ahí). Aviso cuando quieras que la arme.
