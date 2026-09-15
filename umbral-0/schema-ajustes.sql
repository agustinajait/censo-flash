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
