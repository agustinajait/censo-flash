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
