-- =====================================================================
-- Sala de Ventas · Lotes La Unión, Antioquia
-- Esquema de base de datos para Supabase (Postgres)
--
-- Cómo usarlo: en Supabase → SQL Editor → New query → pega todo este
-- archivo → Run. Se puede ejecutar más de una vez sin dañar datos.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Perfiles de usuario y roles
--    rol = 'editor'      → puede crear, editar y eliminar todo
--    rol = 'visor'       → solo puede consultar
--    rol = 'sin_acceso'  → cuenta creada pero todavía sin permiso
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  nombre     text,
  rol        text not null default 'sin_acceso'
             check (rol in ('editor', 'visor', 'sin_acceso')),
  created_at timestamptz not null default now()
);

-- Crea el perfil automáticamente cada vez que se crea un usuario en Auth.
-- Si el usuario se creó desde la pantalla "Usuarios" de la app, el rol
-- viene en user_metadata; si no, queda como 'sin_acceso'.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := coalesce(new.raw_app_meta_data ->> 'rol_inicial', 'sin_acceso');
begin
  if v_rol not in ('editor', 'visor', 'sin_acceso') then
    v_rol := 'sin_acceso';
  end if;
  insert into public.perfiles (id, email, nombre, rol)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'nombre', v_rol)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- Perfiles para usuarios que ya existían antes de correr este script
insert into public.perfiles (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

-- Funciones auxiliares para las políticas de seguridad
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid();
$$;

create or replace function public.es_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() = 'editor', false);
$$;

create or replace function public.puede_ver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() in ('editor', 'visor'), false);
$$;

-- ---------------------------------------------------------------------
-- 2. Datos del negocio
-- ---------------------------------------------------------------------
create table if not exists public.lotes (
  id          uuid primary key default gen_random_uuid(),
  numero_lote text not null check (length(trim(numero_lote)) > 0),
  created_at  timestamptz not null default now()
);

create table if not exists public.informacion_propietario (
  lote_id            uuid primary key references public.lotes (id) on delete cascade,
  nombre_propietario text not null,
  valor_venta        numeric(16, 2),
  fecha_venta        date,
  updated_at         timestamptz not null default now()
);

create table if not exists public.compromisos_pago (
  id               uuid primary key default gen_random_uuid(),
  lote_id          uuid not null references public.lotes (id) on delete cascade,
  fecha_programada date not null,
  valor_programado numeric(16, 2) not null,
  fecha_real       date,
  valor_real       numeric(16, 2),
  created_at       timestamptz not null default now()
);

create index if not exists compromisos_pago_lote_idx
  on public.compromisos_pago (lote_id, fecha_programada);

-- ---------------------------------------------------------------------
-- 3. Seguridad por filas (RLS)
--    Editores y visores leen todo; solo editores escriben.
-- ---------------------------------------------------------------------
alter table public.perfiles                enable row level security;
alter table public.lotes                   enable row level security;
alter table public.informacion_propietario enable row level security;
alter table public.compromisos_pago        enable row level security;

drop policy if exists "ver mi perfil"            on public.perfiles;
drop policy if exists "editores ven perfiles"    on public.perfiles;
create policy "ver mi perfil" on public.perfiles
  for select to authenticated using (id = auth.uid());
create policy "editores ven perfiles" on public.perfiles
  for select to authenticated using (public.es_editor());
-- (Los roles solo se cambian desde la pantalla Usuarios, que usa la
--  llave de servicio en el servidor, o desde el SQL Editor.)

do $$
declare t text;
begin
  foreach t in array array['lotes', 'informacion_propietario', 'compromisos_pago'] loop
    execute format('drop policy if exists "leer" on public.%I', t);
    execute format('drop policy if exists "insertar" on public.%I', t);
    execute format('drop policy if exists "actualizar" on public.%I', t);
    execute format('drop policy if exists "eliminar" on public.%I', t);
    execute format('create policy "leer" on public.%I for select to authenticated using (public.puede_ver())', t);
    execute format('create policy "insertar" on public.%I for insert to authenticated with check (public.es_editor())', t);
    execute format('create policy "actualizar" on public.%I for update to authenticated using (public.es_editor()) with check (public.es_editor())', t);
    execute format('create policy "eliminar" on public.%I for delete to authenticated using (public.es_editor())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Operaciones que deben hacerse "todo o nada" (transacciones)
-- ---------------------------------------------------------------------

-- Reemplaza todos los compromisos de un lote por un plan nuevo.
-- p_items: [{"fecha_programada":"2026-01-15","valor_programado":1000000}, ...]
create or replace function public.reemplazar_compromisos(p_lote_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.es_editor() then
    raise exception 'Solo los editores pueden modificar el plan de pagos';
  end if;
  delete from public.compromisos_pago where lote_id = p_lote_id;
  insert into public.compromisos_pago (lote_id, fecha_programada, valor_programado)
  select p_lote_id, (x ->> 'fecha_programada')::date, (x ->> 'valor_programado')::numeric
  from jsonb_array_elements(p_items) as x;
end;
$$;

-- Reemplaza TODA la información por la del Excel importado.
-- p_lotes: [{"numero_lote":"1","nombre_propietario":"...","valor_venta":123,"fecha_venta":"2026-01-01"}, ...]
-- p_pagos: [{"numero_lote":"1","fecha_programada":"...","valor_programado":1,"fecha_real":null,"valor_real":null}, ...]
create or replace function public.importar_todo(p_lotes jsonb, p_pagos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r        jsonb;
  v_id     uuid;
  v_map    jsonb := '{}'::jsonb;
  v_lotes  int := 0;
  v_pagos  int := 0;
begin
  if not public.es_editor() then
    raise exception 'Solo los editores pueden importar información';
  end if;

  delete from public.compromisos_pago where true;
  delete from public.informacion_propietario where true;
  delete from public.lotes where true;

  for r in select * from jsonb_array_elements(p_lotes) loop
    if coalesce(trim(r ->> 'numero_lote'), '') = '' then
      continue;
    end if;
    insert into public.lotes (numero_lote) values (trim(r ->> 'numero_lote'))
    returning id into v_id;
    v_map := v_map || jsonb_build_object(trim(r ->> 'numero_lote'), v_id);
    v_lotes := v_lotes + 1;

    if coalesce(trim(r ->> 'nombre_propietario'), '') <> ''
       or nullif(r ->> 'valor_venta', '') is not null
       or nullif(r ->> 'fecha_venta', '') is not null then
      insert into public.informacion_propietario (lote_id, nombre_propietario, valor_venta, fecha_venta)
      values (
        v_id,
        coalesce(trim(r ->> 'nombre_propietario'), ''),
        nullif(r ->> 'valor_venta', '')::numeric,
        nullif(r ->> 'fecha_venta', '')::date
      );
    end if;
  end loop;

  for r in select * from jsonb_array_elements(p_pagos) loop
    v_id := (v_map ->> trim(r ->> 'numero_lote'))::uuid;
    if v_id is null
       or nullif(r ->> 'fecha_programada', '') is null
       or nullif(r ->> 'valor_programado', '') is null then
      continue;
    end if;
    insert into public.compromisos_pago (lote_id, fecha_programada, valor_programado, fecha_real, valor_real)
    values (
      v_id,
      (r ->> 'fecha_programada')::date,
      (r ->> 'valor_programado')::numeric,
      nullif(r ->> 'fecha_real', '')::date,
      nullif(r ->> 'valor_real', '')::numeric
    );
    v_pagos := v_pagos + 1;
  end loop;

  return jsonb_build_object('lotes', v_lotes, 'pagos', v_pagos);
end;
$$;

revoke all on function public.reemplazar_compromisos(uuid, jsonb) from public, anon;
revoke all on function public.importar_todo(jsonb, jsonb) from public, anon;
grant execute on function public.reemplazar_compromisos(uuid, jsonb) to authenticated;
grant execute on function public.importar_todo(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Actualización en vivo (si alguien cambia algo, los demás lo ven)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lotes', 'informacion_propietario', 'compromisos_pago'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. PRIMER EDITOR
--    Después de crear tu usuario en Authentication → Users, corre esta
--    línea cambiando el correo por el tuyo:
--
--    update public.perfiles set rol = 'editor' where email = 'tu-correo@ejemplo.com';
-- ---------------------------------------------------------------------
