-- Umbral 0 — ajustes de esquema descubiertos al usar casos.html en producción.
--
-- Contexto: el modelo de datos de Supabase se armó y aplicó directo desde el
-- dashboard (no versionado acá), y DISENO-CASOS.md documentaba algunos
-- campos como si ya existieran en `personas` cuando en realidad no se habían
-- creado. Este archivo es el registro de esos ajustes — correr cada bloque
-- una sola vez en el SQL Editor de Supabase
-- (https://supabase.com/dashboard/project/qwnrdclaeaskoyskbqff/sql/new).
-- Todos usan `if not exists`, así que son seguros de re-correr sin romper nada.

-- 2026-08-12: faltaban las columnas del "informe social" en `personas`
-- (usadas en la ficha de persona y como prefill del formulario de
-- derivación a Casa Vincular — ver DISENO-CASOS.md §5.2). Error visto:
-- "Could not find the 'situacion_sanitaria' column of 'personas' in the schema cache"
alter table public.personas
  add column if not exists situacion_habitacional text,
  add column if not exists situacion_economica text,
  add column if not exists situacion_sanitaria text,
  add column if not exists redes_contencion text,
  add column if not exists situacion_educativa text;

-- 2026-08-12: soporte para "Crear acceso" en admin-duplas.html — un botón
-- por dupla que da de alta su login (email inventado tipo u01@umbral0.app +
-- contraseña que elige quien administra) sin pasar por el dashboard de
-- Supabase a mano. Ver DISENO-CASOS.md §1 y shared/js/supabase-client.js
-- (función crearCuenta).
--
-- 1) Guardamos el email en `perfiles` porque el cliente (anon key) no puede
--    leer auth.users para mostrar "esta dupla ya tiene cuenta: fulano@...".
alter table public.perfiles
  add column if not exists email text;

-- 2) RLS: admin/coordinacion necesitan poder ver TODOS los perfiles (para
--    saber qué duplas ya tienen acceso creado) e insertar/actualizar el
--    perfil de OTRA cuenta (la que se acaba de crear con signUp). Sin esto,
--    "Crear acceso" falla con un error de permisos al guardar en `perfiles`.
--    Es seguro re-correr (drop + create).
--
--    OJO — versión corregida: la primera versión de este bloque consultaba
--    `perfiles` desde adentro de su propia política ("exists (select 1 from
--    perfiles yo where...)"), lo que en Postgres/Supabase dispara
--    "infinite recursion detected in policy for relation perfiles" al
--    loguearse. Se resuelve con una función SECURITY DEFINER que lee el rol
--    por afuera de RLS (patrón estándar de Supabase para este caso).
create or replace function public.mi_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid()
$$;

drop policy if exists "perfiles_admin_select_todos" on public.perfiles;
create policy "perfiles_admin_select_todos" on public.perfiles
  for select
  using (
    auth.uid() = id
    or public.mi_rol() in ('admin', 'coordinacion')
  );

drop policy if exists "perfiles_admin_insert" on public.perfiles;
create policy "perfiles_admin_insert" on public.perfiles
  for insert
  with check (
    auth.uid() = id
    or public.mi_rol() in ('admin', 'coordinacion')
  );

drop policy if exists "perfiles_admin_update" on public.perfiles;
create policy "perfiles_admin_update" on public.perfiles
  for update
  using (
    auth.uid() = id
    or public.mi_rol() in ('admin', 'coordinacion')
  );

-- IMPORTANTE — falta un paso que este SQL no puede hacer por vos:
-- desactivar la confirmación por email en el proyecto de Supabase. Como los
-- emails de las duplas son inventados (nadie los lee), si la confirmación
-- sigue activa la cuenta queda creada pero NO puede loguearse hasta "click"
-- en un mail que nunca va a llegar. Se desactiva en:
-- Supabase Dashboard → Authentication → Sign In / Providers → Email →
-- apagar "Confirm email" (o "Enable email confirmations", según la versión
-- del dashboard). Es un toggle único para todo el proyecto, se hace una sola vez.

-- 2026-09-03: la FK de derivaciones.solicitado_por apuntaba a `integrantes`
-- (el padrón de personas por dupla que se carga en admin-duplas.html) en
-- vez de `perfiles` (la cuenta logueada real, que es lo que el código
-- siempre guardó ahí — ver comentario "vos"/"equipo" en casos.html). Rompía
-- CUALQUIER derivación con "violates foreign key constraint
-- derivaciones_solicitado_por_fkey" apenas la cuenta logueada no tuviera
-- fila en integrantes (ej. cuentas de admin). Ya corrido en producción.
alter table public.derivaciones
  drop constraint derivaciones_solicitado_por_fkey;
alter table public.derivaciones
  add constraint derivaciones_solicitado_por_fkey
  foreign key (solicitado_por) references public.perfiles(id) on delete set null;

-- 2026-09-03: dos columnas nuevas para el reporte semanal que pide GOPA
-- (cobertura territorial + evolución de casos por nivel de vínculo —
-- ver documento institucional Umbral Cero 27/07/2026 y "Reporte_Zona_de
-- frontera"). Ya corrido en producción.
--
-- `intervenciones.datos`: mismo patrón jsonb que `derivaciones.datos`, para
-- registrar zona/turno/tipo de punto/si es punto nuevo sin tener que migrar
-- de nuevo cada vez que se sume un campo al reporte.
alter table public.intervenciones
  add column if not exists datos jsonb not null default '{}'::jsonb;

-- `personas.nivel_actual`: nivel de vínculo (1 a 5) según el documento
-- institucional — no existía ningún campo que lo representara.
alter table public.personas
  add column if not exists nivel_actual smallint not null default 1
  check (nivel_actual between 1 and 5);

-- 2026-09-07: plan de distribución por turno y polígono
-- (Umbral0_Plan_Final.docx) — cada dupla trabaja un único turno fijo (T1 a
-- T4), con su zona/iglesia y mapa de My Maps propios. Ya corrido en
-- producción, con las 13 duplas (A a M) cargadas.
alter table public.duplas
  add column if not exists turno text,          -- 'T1'..'T4'
  add column if not exists mymaps text,          -- link de My Maps (viewer)
  add column if not exists detalle text,         -- horarios/registros de referencia/qué cubre
  add column if not exists es_referente boolean not null default false; -- referente de su turno

-- 2026-09-07: portal público de duplas (umbral-0/index.html), sin login —
-- mismo espíritu que el de Censo Flash. La tabla `duplas` sigue protegida
-- por RLS (solo admin/coordinacion/dupla logueados la ven completa); esta
-- vista expone SOLO las columnas no sensibles, nunca datos de personas.
-- Ya corrido en producción.
create or replace view public.duplas_publico as
  select id, codigo, zona, turno, detalle, mymaps, es_referente, activa
  from public.duplas
  where activa = true;

grant select on public.duplas_publico to anon;

-- OJO — al crearse, la vista heredó los privilegios amplios que Supabase
-- ya tenía configurados por default en el esquema `public` para
-- anon/authenticated (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER),
-- no solo el SELECT de arriba. Como la vista corre con los permisos de su
-- dueño (que puede saltarse RLS), eso dejaba una vía de escritura no
-- intencional hacia `duplas` a través de la vista pública. Se cierra acá
-- (ya corrido en producción) — deja a anon/authenticated con SOLO SELECT:
revoke insert, update, delete, truncate, references, trigger
  on public.duplas_publico from anon, authenticated;

-- 2026-09-07: test de onboarding para cuentas de dupla — se muestra una
-- sola vez, al primer login, dentro de casos.html (el glosario/instructivo
-- vuelve a ser solo visual, sin quiz). Ya corrido en producción.
--
-- No hace falta ninguna política nueva: `perfiles_admin_update` ya
-- permite `auth.uid() = id`, así que cada cuenta puede marcar su propio
-- onboarding_completado.
alter table public.perfiles
  add column if not exists onboarding_completado boolean not null default false,
  add column if not exists onboarding_score smallint;

-- 2026-09-08: teléfono/WhatsApp del referente de turno — para que las
-- demás duplas del mismo turno puedan contactarlo directo desde "Mi turno
-- de hoy" en casos.html, sin depender de tenerlo agendado o buscarlo en un
-- grupo. Solo tiene sentido cargado en la fila de la dupla que tenga
-- es_referente = true; casos.html busca por turno + es_referente, no por
-- persona. No se agrega a `duplas_publico` (portal sin login) a propósito
-- — es un dato de contacto operativo, no algo para mostrar sin login. Ya
-- corrido en producción.
alter table public.duplas
  add column if not exists referente_telefono text;

-- 2026-09-11: marcado diario de inicio/fin de jornada por dupla ("Mi turno
-- de hoy" en casos.html). Una fila por dupla por día — como el login ya es
-- por dupla (no por persona), alcanza con que cualquiera de los dos
-- integrantes lo toque desde esa cuenta compartida. Ya corrido en
-- producción (migración `jornadas_inicio_fin`).
create table if not exists public.jornadas (
  id uuid primary key default gen_random_uuid(),
  dupla_id uuid not null references public.duplas(id) on delete cascade,
  fecha date not null default current_date,
  inicio timestamptz,
  fin timestamptz,
  created_at timestamptz not null default now(),
  unique (dupla_id, fecha)
);

alter table public.jornadas enable row level security;

-- Mismo patrón que el resto de las tablas: admin/coordinacion ven y tocan
-- todo; una cuenta de dupla solo puede ver/marcar la jornada de SU PROPIA
-- dupla (comparando contra perfiles.dupla_id de la cuenta logueada).
create policy "jornadas_propia_dupla" on public.jornadas
  for all
  using (
    public.mi_rol() in ('admin', 'coordinacion')
    or dupla_id = (select dupla_id from public.perfiles where id = auth.uid())
  )
  with check (
    public.mi_rol() in ('admin', 'coordinacion')
    or dupla_id = (select dupla_id from public.perfiles where id = auth.uid())
  );

-- 2026-09-12: gate de "datos de contacto" al crear el acceso de una dupla
-- (DNI/teléfono de sus integrantes) — reemplaza al quiz como paso
-- obligatorio del primer login (el quiz pasa a ser opcional). Antes solo
-- admin/coordinacion podían actualizar `integrantes`; se agrega una
-- política para que una cuenta de dupla pueda actualizar (no leer de
-- más, no borrar) los integrantes de SU PROPIA dupla. Ya corrido en
-- producción (migración `integrantes_update_propia_dupla`).
create policy "integrantes_update_propia_dupla" on public.integrantes
  for update
  using (dupla_id = (select dupla_id from public.perfiles where id = auth.uid()))
  with check (dupla_id = (select dupla_id from public.perfiles where id = auth.uid()));

-- 2026-09-12: `personas` era la única tabla de casos SIN scope por dupla
-- — intervenciones/derivaciones/seguimientos ya restringían a una cuenta
-- de dupla a ver/tocar solo lo de SU dupla (dupla_id = mi_dupla_id()),
-- pero personas_select/update/insert dejaban pasar a cualquier dupla
-- logueada sin filtro: cualquier cuenta veía y editaba los casos de
-- TODAS las duplas. Encontrado al revisar el acceso antes de habilitar
-- el equipo completo. Ya corrido en producción.
--
-- Se agrega `personas.dupla_id` (quién dio de alta el caso — mismo
-- patrón que ya usa `intervenciones.dupla_id`) y se aplica el mismo
-- scope. Backfill desde la intervención de alta ('contacto_espontaneo',
-- se crea siempre junto con la persona — ver casos.html); los 4 casos de
-- prueba que había en producción no tenían esa intervención (datos
-- viejos, de antes de este patrón) y quedaron con dupla_id null —
-- visibles solo para admin/coordinación, se pueden reasignar a mano si
-- hace falta.
--
-- LIMITACIÓN CONOCIDA: si dos duplas distintas se cruzan con la misma
-- persona (se mudó de zona, cobertura de iglesia superpuesta, etc.), la
-- segunda dupla no la va a encontrar al buscar por DNI/nombre — para
-- ella no existe, y puede terminar dándola de alta de nuevo (caso
-- duplicado). El plan de zonas exclusivas por dupla (Umbral0_Plan_Final)
-- lo hace poco frecuente, pero no lo elimina. Si se vuelve un problema
-- real, la solución no es sacar el scope (volvería a exponer todos los
-- casos a todas las duplas) sino algo más fino — ej. que la búsqueda le
-- avise "ya existe un caso con ese DNI, pedile a tu referente que te dé
-- acceso" sin mostrar el detalle. Queda anotado en DISENO-CASOS.md §11.
alter table public.personas
  add column if not exists dupla_id uuid references public.duplas(id) on delete set null;

update public.personas p
set dupla_id = i.dupla_id
from public.intervenciones i
where i.persona_id = p.id
  and i.tipo = 'contacto_espontaneo'
  and p.dupla_id is null
  and i.dupla_id is not null;

drop policy if exists "personas_select" on public.personas;
create policy "personas_select" on public.personas
  for select
  using (
    mi_rol() = any (array['admin','coordinacion','cliente'])
    or (mi_rol() = 'dupla' and dupla_id = mi_dupla_id())
  );

drop policy if exists "personas_update" on public.personas;
create policy "personas_update" on public.personas
  for update
  using (
    mi_rol() = any (array['admin','coordinacion'])
    or (mi_rol() = 'dupla' and dupla_id = mi_dupla_id())
  );

-- El insert ya estaba limitado a roles válidos, pero no impedía que una
-- dupla insertara una persona con el dupla_id de OTRA dupla (spoofing) —
-- se agrega el mismo chequeo.
drop policy if exists "personas_insert" on public.personas;
create policy "personas_insert" on public.personas
  for insert
  with check (
    mi_rol() = any (array['admin','coordinacion'])
    or (mi_rol() = 'dupla' and dupla_id = mi_dupla_id())
  );

-- 2026-09-14: "Eliminar caso" desde admin (casos.html) — RLS de DELETE en
-- `personas` ya era admin-only (`personas_delete`, sin cambios acá). Lo
-- que faltaba era la integridad de la cascada: `intervenciones.persona_id`
-- estaba en "ON DELETE SET NULL", a diferencia de derivaciones/
-- seguimientos (ambas ya "ON DELETE CASCADE") — borrar un caso dejaba
-- intervenciones huérfanas (persona_id null) dando vueltas para siempre,
-- invisibles en cualquier ficha pero sumando igual en "Intervenciones
-- registradas" del reporte semanal. Se unifica a CASCADE. Ya corrido en
-- producción.
alter table public.intervenciones
  drop constraint intervenciones_persona_id_fkey;
alter table public.intervenciones
  add constraint intervenciones_persona_id_fkey
  foreign key (persona_id) references public.personas(id) on delete cascade;

-- 2026-09-14: `nombre`/`apellido` eran obligatorios para poder dar de
-- alta un caso — pero en la calle puede pasar (y va a pasar seguido) que
-- la persona no quiera identificarse. Sin esta columna, la dupla no
-- tenía forma de registrar esa intervención en la plataforma. Ya corrido
-- en producción.
alter table public.personas
  add column if not exists sin_identificar boolean not null default false;

-- 2026-09-14: "¿Acepta entrevista?" — indicador del Nivel 2 (Construcción
-- del vínculo, ver glosario) que faltaba en la ficha. Ya corrido en
-- producción.
alter table public.personas
  add column if not exists acepta_entrevista boolean not null default false;

-- 2026-09-14: vista pública de `integrantes` para que dashboard.html
-- (que NO tiene login de Supabase — es la contraseña compartida de
-- PLATFORM_AUTH) pueda matchear el operador de cada envío de KoBo contra
-- una dupla, sin poder leer nada de `integrantes` que no sea nombre/
-- apellido/dupla (nada de dni/telefono/rol). Mismo patrón que
-- `duplas_publico` (ver arriba): vista con columnas mínimas + grant a
-- anon + revoke explícito de escritura (las vistas heredan grants
-- amplios por default en Postgres/Supabase). Excluye choferes (no
-- cargan KoBo) y duplas dadas de baja. Ya corrido en producción,
-- verificado con `set local role anon`.
create or replace view public.integrantes_publico as
  select i.id, i.nombre, i.apellido, d.codigo as dupla_codigo
  from public.integrantes i
  join public.duplas d on d.id = i.dupla_id
  where i.rol != 'chofer' and d.activa = true;

grant select on public.integrantes_publico to anon;

revoke insert, update, delete, truncate, references, trigger
  on public.integrantes_publico from anon, authenticated;

-- 2026-09-15: Agustina reportó que los casos de un día anterior no
-- quedaban visibles para que las duplas les hicieran seguimiento al día
-- siguiente — la lista de casos.html ordenaba alfabético por apellido,
-- sin ninguna señal de "esto lleva X días sin que nadie lo toque". Esta
-- vista agrega `ultima_actividad` = lo más reciente entre el alta y
-- cualquier intervención/seguimiento/derivación de esa persona.
-- `personas.updated_at` NO sirve para esto: solo cambia si se edita la
-- ficha misma, no cuando se agrega una intervención/seguimiento/
-- derivación (tablas separadas, sin trigger). `security_invoker = true`
-- para que las políticas RLS de `personas` se sigan aplicando según quién
-- consulta la vista (si no, por defecto corre con los permisos de quien
-- la creó, saltándose el scope por dupla_id). A diferencia de
-- duplas_publico/integrantes_publico, esta vista NO es para anon
-- (`personas` tiene datos sensibles) — la usan solo cuentas logueadas de
-- casos.html, así que se le revoca todo a anon en vez de darle grant de
-- lectura. Ya corrido en producción, verificado con `set local role
-- anon` (permission denied, como se esperaba).
create or replace view public.personas_actividad
with (security_invoker = true) as
select
  p.*,
  greatest(
    p.created_at,
    (select max(i.created_at) from public.intervenciones i where i.persona_id = p.id),
    (select max(s.created_at) from public.seguimientos s where s.persona_id = p.id),
    (select max(d.created_at) from public.derivaciones d where d.persona_id = p.id)
  ) as ultima_actividad
from public.personas p;

revoke all on public.personas_actividad from anon;

-- 2026-09-15: Reporte semanal "tipo dashboard" con link para compartir
-- (pedido de Agustina). admin/coordinación publican una FOTO del reporte
-- ya calculado (mismos números que ya se ven en admin-duplas.html) y
-- comparten un link público — GOPA lo abre sin necesitar cuenta.
-- Snapshot inmutable a propósito: el número que ve GOPA en el link
-- coincide siempre con lo que se publicó ese día, no cambia si después
-- se editan casos. Ya corrido en producción, verificado con `set local
-- role anon` (lectura OK, count 0 con la tabla vacía).
create table public.reportes_semanales (
  id uuid primary key default gen_random_uuid(),
  desde date not null,
  hasta date not null,
  datos jsonb not null,
  creado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.reportes_semanales enable row level security;

create policy "reportes_semanales_insert" on public.reportes_semanales
  for insert
  with check (mi_rol() = any (array['admin','coordinacion']));

create policy "reportes_semanales_select_admin" on public.reportes_semanales
  for select
  using (mi_rol() = any (array['admin','coordinacion']));

-- Por si se publica con un error y hay que sacarlo antes de compartirlo
-- de verdad — mismo criterio admin-only que "eliminar caso".
create policy "reportes_semanales_delete" on public.reportes_semanales
  for delete
  using (mi_rol() = 'admin');

-- Vista pública de solo lectura para el link compartido — reporte-publico.html
-- no tiene login de Supabase. `datos` es un resumen agregado (conteos,
-- nombres de zona/tipo de derivación) — nunca nombres/DNI de personas
-- (calcularReporte() en admin-duplas.html no los incluye).
create or replace view public.reportes_semanales_publico as
  select id, desde, hasta, datos, created_at
  from public.reportes_semanales;

grant select on public.reportes_semanales_publico to anon;

revoke insert, update, delete, truncate, references, trigger
  on public.reportes_semanales_publico from anon, authenticated;

-- kobo_validaciones (sept/2026) — "el operador actuaría de validador":
-- 1) confirma que un envío de KoBo ya mostrado en el timeline de una
--    ficha está bien (badge "✅ Validado", con nota opcional), 2) guarda
-- la asociación cuando la dupla confirma a mano que un envío SIN DNI es
-- la misma persona que un caso ya cargado ("posibles continuaciones" en
-- casos.html). RLS calcada de intervenciones/seguimientos. Ya corrido en
-- producción.
create table public.kobo_validaciones (
  id uuid primary key default gen_random_uuid(),
  kobo_submission_id text not null,
  persona_id uuid not null references public.personas(id) on delete cascade,
  dupla_id uuid references public.duplas(id),
  nota text,
  creado_por uuid references public.perfiles(id),
  created_at timestamptz not null default now(),
  unique (kobo_submission_id, persona_id)
);

alter table public.kobo_validaciones enable row level security;

create policy kobo_validaciones_select on public.kobo_validaciones
  for select using (
    mi_rol() = any (array['admin','coordinacion','cliente'])
    or (mi_rol() = 'dupla' and dupla_id = mi_dupla_id())
  );

create policy kobo_validaciones_insert on public.kobo_validaciones
  for insert with check (
    mi_rol() = any (array['admin','coordinacion'])
    or (mi_rol() = 'dupla' and dupla_id = mi_dupla_id())
  );

create policy kobo_validaciones_update on public.kobo_validaciones
  for update using (
    mi_rol() = any (array['admin','coordinacion'])
    or (mi_rol() = 'dupla' and dupla_id = mi_dupla_id())
  );

create policy kobo_validaciones_delete on public.kobo_validaciones
  for delete using (mi_rol() = 'admin');

-- personas_listado_publico (sept/2026) — link EN VIVO para
-- casos-en-vivo.html, a diferencia de reportes_semanales_publico (que es
-- a propósito una foto fija). Pedido de Agustina: ni el coordinador ni
-- GOPA tienen cuenta y quieren ver los casos cargados sin esperar el
-- reporte semanal. Mismo patrón que duplas_publico/integrantes_publico
-- (vista simple, sin security_invoker, grant explícito a anon) — no
-- pasa por RLS de `personas` porque anon no tiene rol. Ya corrido en
-- producción, verificado con `set local role anon`.
create view public.personas_listado_publico as
select
  p.id,
  p.nombre,
  p.apellido,
  p.dni,
  p.dni_denuncia_extravio,
  p.sin_identificar,
  p.zona,
  p.comuna,
  p.punto_contacto,
  p.criticidad,
  p.nivel_actual,
  p.acepta_entrevista,
  p.historia_breve,
  p.fecha_nacimiento,
  p.telefono_contacto,
  p.situacion_habitacional,
  p.situacion_economica,
  p.situacion_educativa,
  p.redes_contencion,
  p.estado,
  p.created_at,
  d.codigo as dupla_codigo
from public.personas p
join public.duplas d on d.id = p.dupla_id;

grant select on public.personas_listado_publico to anon;

revoke insert, update, delete, truncate, references, trigger
  on public.personas_listado_publico from anon, authenticated;

-- personas_listado_publico — perfil completo + turno (sept/2026).
-- Pedido de Agustina sobre casos-en-vivo.html: "que este ordenado por
-- turnos y duplas y que levante el perfil de la persona completo". Se
-- agregan turno/es_referente de la dupla (para agrupar) y el resto de
-- los campos del legajo que faltaban (nacionalidad, situación sanitaria,
-- salud, medicación, esquema, movilidad, paso por CIS, consumo activo).
-- `create or replace view` no permite reordenar/renombrar columnas
-- existentes ("cannot change name of view column") — por eso las
-- columnas nuevas se agregan al final, no intercaladas con las
-- relacionadas. Verificado con `set local role anon` (65 filas, 0 con
-- turno nulo).
create or replace view public.personas_listado_publico as
select
  p.id,
  p.nombre,
  p.apellido,
  p.dni,
  p.dni_denuncia_extravio,
  p.sin_identificar,
  p.zona,
  p.comuna,
  p.punto_contacto,
  p.criticidad,
  p.nivel_actual,
  p.acepta_entrevista,
  p.historia_breve,
  p.fecha_nacimiento,
  p.telefono_contacto,
  p.situacion_habitacional,
  p.situacion_economica,
  p.situacion_educativa,
  p.redes_contencion,
  p.estado,
  p.created_at,
  d.codigo as dupla_codigo,
  p.nacionalidad,
  p.situacion_sanitaria,
  p.estado_salud,
  p.medicacion,
  p.esquema,
  p.sube_escaleras,
  p.cama_arriba,
  p.estuvo_en_cis_antes,
  p.estuvo_en_cis_detalle,
  p.consumo_activo,
  d.turno as dupla_turno,
  d.es_referente as dupla_es_referente
from public.personas p
join public.duplas d on d.id = p.dupla_id;

grant select on public.personas_listado_publico to anon;

revoke insert, update, delete, truncate, references, trigger
  on public.personas_listado_publico from anon, authenticated;

-- personas_dni_index (sept/2026) — chequeo preventivo de DNI duplicado
-- en el alta de casos.html. Pedido de Agustina tras encontrar decenas de
-- casos reales duplicados en producción (mismo DNI, cargado más de una
-- vez por distintas duplas/días): "si hacelo" (agregar el aviso).
--
-- `personas` tiene RLS "cada dupla ve solo sus propios casos", así que
-- una dupla no puede ver si OTRA dupla ya cargó a la misma persona. Esta
-- vista bypassea esa RLS a propósito (mismo patrón que
-- personas_listado_publico) pero SOLO expone lo mínimo necesario para
-- detectar el duplicado (dni, nombre, apellido, dupla, fecha) — no
-- situación económica/habitacional/salud/teléfono/etc. Grant a
-- `authenticated` (no a `anon`: es una herramienta operativa para las
-- duplas logueadas, no un link público). Verificado: trae coincidencias
-- de más de una dupla para el mismo DNI (bypass de RLS confirmado).
create view public.personas_dni_index as
select
  p.dni,
  p.nombre,
  p.apellido,
  p.created_at,
  d.codigo as dupla_codigo
from public.personas p
join public.duplas d on d.id = p.dupla_id
where coalesce(trim(p.dni), '') <> '';

grant select on public.personas_dni_index to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.personas_dni_index from authenticated;

-- personas.oculto (sept/2026) — pedido de Agustina: "podes ocultarlas
-- mejor?" en vez de borrar los casos duplicados de la dupla C que
-- encontramos con personas_dni_index. Ocultar es reversible (a
-- diferencia de un DELETE): el caso sigue entero en la base con todo su
-- timeline, solo deja de aparecer en los listados/reportes. Se agrega el
-- filtro a las dos vistas de arriba (personas_listado_publico,
-- personas_dni_index) — ambas via `create or replace view` agregando
-- solo un WHERE, sin tocar columnas existentes.
alter table public.personas
  add column if not exists oculto boolean not null default false;

create or replace view public.personas_listado_publico as
select
  p.id, p.nombre, p.apellido, p.dni, p.dni_denuncia_extravio, p.sin_identificar,
  p.zona, p.comuna, p.punto_contacto, p.criticidad, p.nivel_actual,
  p.acepta_entrevista, p.historia_breve, p.fecha_nacimiento, p.telefono_contacto,
  p.situacion_habitacional, p.situacion_economica, p.situacion_educativa,
  p.redes_contencion, p.estado, p.created_at, d.codigo as dupla_codigo,
  p.nacionalidad, p.situacion_sanitaria, p.estado_salud, p.medicacion, p.esquema,
  p.sube_escaleras, p.cama_arriba, p.estuvo_en_cis_antes, p.estuvo_en_cis_detalle,
  p.consumo_activo, d.turno as dupla_turno, d.es_referente as dupla_es_referente
from public.personas p
join public.duplas d on d.id = p.dupla_id
where coalesce(p.oculto, false) = false;

create or replace view public.personas_dni_index as
select p.dni, p.nombre, p.apellido, p.created_at, d.codigo as dupla_codigo
from public.personas p
join public.duplas d on d.id = p.dupla_id
where coalesce(trim(p.dni), '') <> ''
  and coalesce(p.oculto, false) = false;

-- Ya usado en producción (sept/2026): se ocultaron las 7 copias de más de
-- 3 casos duplicados en la dupla C (Mangel Sánchez x4, Jorge Alejo Medina
-- Avalos x2, Nuñez Raul x1 — se dejó la primera carga de cada uno), todas
-- verificadas sin intervenciones/derivaciones/seguimientos propios más
-- allá del alta automática. Reversible desde el panel "⚠️ Posibles
-- duplicados" de admin-duplas.html ("👁️ Mostrar de nuevo").

-- intervenciones.acciones (sept/2026) — pedido de Agustina: "yo no manejo
-- el kobo, manejo esta plataforma... el que hizo debe verse en el
-- legajo". Versión NATIVA (no depende de KoBo) de "qué hizo el operador
-- con el caso" — mismas categorías que la pregunta obligatoria de KoBo
-- `termino_intervencion_diaria` donde tiene sentido, más CIS y teléfono
-- rojo (que KoBo no tiene como opción) y "se negó a la entrevista"
-- (pedido de Agustina: "si la persona no acepta la entrevista el
-- operador no marca qué hizo" — antes no había ninguna opción para ese
-- caso). Se completa en el formulario de "Registrar intervención" de
-- casos.html (ver ACCIONES_INTERVENCION) y se muestra en el timeline de
-- la ficha ("Qué se hizo: ...").
alter table public.intervenciones
  add column if not exists acciones text[] not null default '{}'::text[];

-- kobo_validaciones.acciones (sept/2026) — pedido de Agustina: "sigo sin
-- poder ver qué hacen con la acción mis operadores". El checklist de
-- arriba (ACCIONES_INTERVENCION) vivía solo en "Registrar intervención",
-- un paso opcional aparte que casi nadie llegaba a tocar (caso real
-- revisado en producción: el envío de KoBo ni siquiera estaba validado
-- todavía). Se agrega la MISMA lista de acciones directo adentro del
-- modal de "Validar envío de KoBo" — el único paso que todas las duplas
-- sí hacen — para que quede capturado de forma confiable, en vez de
-- depender de un cuarto click que se salta.
alter table public.kobo_validaciones
  add column if not exists acciones text[] not null default '{}'::text[];

-- Ya usado en producción (16/9/2026): se agregó a Mia Cubero como
-- integrante de dupla C (reemplazo/changuito que hizo la salida de hoy y
-- no estaba cargada). Sin esto sus 3 altas reales por KoBo no matcheaban
-- ningún integrante y quedaban invisibles tanto en el "KoBo pendientes"
-- propio de la dupla como en el del admin (ver DISENO-CASOS.md §10.1.1).
-- insert into public.integrantes (dupla_id, rol, nombre, apellido, activo)
-- values ('97385a43-466e-42a4-bf8f-7b129532d1c8', 'operador', 'Mia', 'Cubero', true);

-- personas_listado_publico + ultima_actividad (16/9/2026) — pedido de
-- Agustina: "cuando veo los casos por fecha o en vivo, no se reflejan los
-- casos de seguimiento, entonces parece que el operador no hizo nada en
-- su jornada". La vista solo traía `created_at` (fecha de alta); filtrar
-- casos-en-vivo.html por ese campo hacía que un seguimiento sobre un caso
-- de días atrás no apareciera en el rango de "hoy". Se agrega
-- `ultima_actividad` (mismo cálculo GREATEST() que ya usa la vista
-- `personas_actividad`) y casos-en-vivo.html/casos.html pasan a filtrar
-- por ahí. Ya aplicada en producción vía mcp Supabase — dejo acá el
-- create or replace view completo para que quede versionado.
create or replace view public.personas_listado_publico as
select
  p.id,
  p.nombre,
  p.apellido,
  p.dni,
  p.dni_denuncia_extravio,
  p.sin_identificar,
  p.zona,
  p.comuna,
  p.punto_contacto,
  p.criticidad,
  p.nivel_actual,
  p.acepta_entrevista,
  p.historia_breve,
  p.fecha_nacimiento,
  p.telefono_contacto,
  p.situacion_habitacional,
  p.situacion_economica,
  p.situacion_educativa,
  p.redes_contencion,
  p.estado,
  p.created_at,
  d.codigo as dupla_codigo,
  p.nacionalidad,
  p.situacion_sanitaria,
  p.estado_salud,
  p.medicacion,
  p.esquema,
  p.sube_escaleras,
  p.cama_arriba,
  p.estuvo_en_cis_antes,
  p.estuvo_en_cis_detalle,
  p.consumo_activo,
  d.turno as dupla_turno,
  d.es_referente as dupla_es_referente,
  greatest(
    p.created_at,
    (select max(i.created_at) from intervenciones i where i.persona_id = p.id),
    (select max(s.created_at) from seguimientos s where s.persona_id = p.id),
    (select max(dv.created_at) from derivaciones dv where dv.persona_id = p.id)
  ) as ultima_actividad
from personas p
join duplas d on d.id = p.dupla_id
where coalesce(p.oculto, false) = false;

-- ⚠️ INCIDENTE REAL (16/9/2026, ~14:37-14:54 UTC, ~17 min en producción):
-- la migración de abajo (ultima_actividad_incluye_kobo_validaciones) sumó
-- kobo_validaciones al cálculo de ultima_actividad en AMBAS vistas, pero
-- el `create or replace view public.personas_actividad as select ...` se
-- escribió SIN `with (security_invoker = true)` — el que sí tenía el
-- original (ver más arriba, migración personas_actividad_para_seguimiento,
-- comentario: "la vista es security_invoker"). Un CREATE OR REPLACE VIEW
-- que no repite esa cláusula la PIERDE, aunque el resto de la definición
-- sea idéntica. Sin ella, la vista corre con los privilegios del owner en
-- vez de los del usuario logueado, así que el RLS por-dupla de `personas`
-- dejaba de aplicarse — cualquier dupla que buscara un caso en Casos veía
-- también los de las demás duplas. Detectado porque varias duplas
-- reportaron "me aparecen casos de otras duplas" casi en el momento.
-- Corregido con `alter view ... set (security_invoker = true)` apenas se
-- detectó (no hace falta recrear toda la vista para esto). Las dos vistas
-- de abajo son el estado YA CORREGIDO — personas_actividad con
-- security_invoker explícito, personas_listado_publico SIN él a propósito
-- (esa es pública/anon por diseño, bypasea el RLS por-dupla adrede para
-- mostrar todas las duplas mezcladas en `casos-en-vivo.html`).
--
-- Lección para cualquier CREATE OR REPLACE VIEW futuro sobre una vista
-- existente: revisar primero si tenía `with (security_invoker = true)`
-- (buscar en este archivo) y repetirlo siempre en el reemplazo.
create or replace view public.personas_actividad
with (security_invoker = true) as
select
  p.*,
  greatest(
    p.created_at,
    (select max(i.created_at) from public.intervenciones i where i.persona_id = p.id),
    (select max(s.created_at) from public.seguimientos s where s.persona_id = p.id),
    (select max(d.created_at) from public.derivaciones d where d.persona_id = p.id),
    (select max(kv.created_at) from public.kobo_validaciones kv where kv.persona_id = p.id)
  ) as ultima_actividad
from public.personas p;

create or replace view public.personas_listado_publico as
select
  p.id, p.nombre, p.apellido, p.dni, p.dni_denuncia_extravio, p.sin_identificar,
  p.zona, p.comuna, p.punto_contacto, p.criticidad, p.nivel_actual,
  p.acepta_entrevista, p.historia_breve, p.fecha_nacimiento, p.telefono_contacto,
  p.situacion_habitacional, p.situacion_economica, p.situacion_educativa,
  p.redes_contencion, p.estado, p.created_at, d.codigo as dupla_codigo,
  p.nacionalidad, p.situacion_sanitaria, p.estado_salud, p.medicacion,
  p.esquema, p.sube_escaleras, p.cama_arriba, p.estuvo_en_cis_antes,
  p.estuvo_en_cis_detalle, p.consumo_activo, d.turno as dupla_turno,
  d.es_referente as dupla_es_referente,
  greatest(
    p.created_at,
    (select max(i.created_at) from intervenciones i where i.persona_id = p.id),
    (select max(s.created_at) from seguimientos s where s.persona_id = p.id),
    (select max(dv.created_at) from derivaciones dv where dv.persona_id = p.id),
    (select max(kv.created_at) from kobo_validaciones kv where kv.persona_id = p.id)
  ) as ultima_actividad
from personas p
join duplas d on d.id = p.dupla_id
where coalesce(p.oculto, false) = false;
