-- =====================================================================
-- GLOBALT ROBOTICS · Esquema de base de datos para Supabase
-- Copia TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Es seguro ejecutarlo más de una vez.
-- =====================================================================

-- 1) Administradores autorizados -------------------------------------
-- Solo los correos de esta tabla pueden crear/editar/eliminar contenido.
create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

-- 👉 CAMBIA este correo por el tuyo (el mismo que crearás en Authentication → Users)
insert into public.admins (email) values ('tu-correo@ejemplo.com')
on conflict (email) do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2) Tablas de contenido ----------------------------------------------
create table if not exists public.games (
  id          text primary key default gen_random_uuid()::text,
  title       text not null,
  description text default '',
  category    text default '',
  level       text default 'Básico',
  url         text default '',
  preview     text default '',
  featured    boolean default false,
  sort_order  integer default 0,
  updated_at  timestamptz default now()
);

create table if not exists public.courses (
  id          text primary key default gen_random_uuid()::text,
  track       text not null default 'programacion' check (track in ('programacion', 'ia')),
  title       text not null,
  category    text default '',
  level       text default 'Básico',
  duration    text default '',
  description text default '',
  topics      jsonb default '[]'::jsonb,
  link        text default '',
  icon        text default 'code',
  sort_order  integer default 0,
  updated_at  timestamptz default now()
);

create table if not exists public.tutorials (
  id          text primary key default gen_random_uuid()::text,
  title       text not null,
  category    text default '',
  youtube_url text default '',
  youtube_id  text default '',
  description text default '',
  sort_order  integer default 0,
  updated_at  timestamptz default now()
);

create table if not exists public.workshops (
  id          text primary key default gen_random_uuid()::text,
  title       text not null,
  type        text default 'Presencial',
  audience    text default '',
  dates       text default '',
  price       text default '',
  description text default '',
  active      boolean default true,
  sort_order  integer default 0,
  updated_at  timestamptz default now()
);

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 3) Seguridad (Row Level Security) -----------------------------------
-- Lectura pública para todos; escritura solo para administradores.
do $$
declare t text;
begin
  foreach t in array array['games', 'courses', 'tutorials', 'workshops', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format('drop policy if exists "escritura admin" on public.%I', t);
    execute format('create policy "lectura publica" on public.%I for select using (true)', t);
    execute format('create policy "escritura admin" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

alter table public.admins enable row level security;
drop policy if exists "admin lee admins" on public.admins;
create policy "admin lee admins" on public.admins for select to authenticated using (public.is_admin());

-- 4) Ajustes iniciales ------------------------------------------------
insert into public.settings (key, value) values ('site', '{
  "banner_active": true,
  "banner_text": "🚀 Inscripciones abiertas: Talleres vacacionales de robótica diciembre 2026",
  "banner_cta": "Inscribirme",
  "whatsapp_number": "573144864187",
  "whatsapp_default_message": "Hola, me interesa información sobre GLOBALT ROBOTICS",
  "location": "La Mesa, Cundinamarca, Colombia",
  "founder": "Ing. Edwin Hernando Gómez Forero",
  "email": ""
}'::jsonb)
on conflict (key) do nothing;

-- Listo. Para cargar el catálogo inicial (juegos, cursos, videos y talleres):
-- entra a /admin → Respaldo JSON → Importar → elige data/catalogo-inicial.json
