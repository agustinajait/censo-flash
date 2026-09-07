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
