-- Run once in the SQL Editor of your own Supabase project.
-- Anonymous Auth users have the authenticated role after signing in.
-- Public clients NEVER receive a service_role key or direct membership writes.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users(id),
  invite_code_hash bytea not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_id_idx on public.household_members(user_id);

create table if not exists public.scenarios (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 1048576),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create index if not exists scenarios_household_updated_idx on public.scenarios(household_id, updated_at desc);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.scenarios enable row level security;

-- Remove broad privileges, including defaults that may be present in Supabase.
revoke all on public.households, public.household_members, public.scenarios from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select (id, name, owner_id, created_at) on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.scenarios to authenticated;

-- Members can see their own membership only. This also avoids policy recursion.
drop policy if exists members_read_own on public.household_members;
create policy members_read_own on public.household_members
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists households_read_member on public.households;
create policy households_read_member on public.households
  for select to authenticated using (
    exists (select 1 from public.household_members m where m.household_id = households.id and m.user_id = (select auth.uid()))
  );

drop policy if exists scenarios_read_member on public.scenarios;
create policy scenarios_read_member on public.scenarios
  for select to authenticated using (
    exists (select 1 from public.household_members m where m.household_id = scenarios.household_id and m.user_id = (select auth.uid()))
  );

drop policy if exists scenarios_insert_member on public.scenarios;
create policy scenarios_insert_member on public.scenarios
  for insert to authenticated with check (
    created_by = (select auth.uid()) and
    exists (select 1 from public.household_members m where m.household_id = scenarios.household_id and m.user_id = (select auth.uid()))
  );

drop policy if exists scenarios_update_member on public.scenarios;
create policy scenarios_update_member on public.scenarios
  for update to authenticated using (
    exists (select 1 from public.household_members m where m.household_id = scenarios.household_id and m.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.household_members m where m.household_id = scenarios.household_id and m.user_id = (select auth.uid()))
  );

drop policy if exists scenarios_delete_member on public.scenarios;
create policy scenarios_delete_member on public.scenarios
  for delete to authenticated using (
    exists (select 1 from public.household_members m where m.household_id = scenarios.household_id and m.user_id = (select auth.uid()))
  );

-- Client-supplied timestamps and authors cannot rewrite audit fields.
create or replace function public.touch_scenario()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    if new.household_id <> old.household_id or new.id <> old.id then
      raise exception 'Los identificadores de una vivienda no se pueden modificar';
    end if;
  else
    new.created_at := pg_catalog.now();
    new.created_by := auth.uid();
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists scenarios_touch on public.scenarios;
create trigger scenarios_touch before insert or update on public.scenarios
  for each row execute function public.touch_scenario();

-- Only these fixed SECURITY DEFINER functions may create memberships.
-- The 192-bit code is returned ONCE. Only its SHA-256 hash is stored remotely.
create or replace function public.create_household(p_name text default 'Mi familia')
returns table (household_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_name text := pg_catalog.btrim(p_name);
  v_code text := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
begin
  if v_user is null then raise exception 'Se requiere una sesión de usuario'; end if;
  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 80 then
    raise exception 'El nombre de la familia debe tener entre 1 y 80 caracteres';
  end if;
  insert into public.households (name, owner_id, invite_code_hash)
    values (v_name, v_user, extensions.digest(v_code, 'sha256')) returning id into v_id;
  insert into public.household_members (household_id, user_id) values (v_id, v_user);
  return query select v_id, v_code;
end;
$$;

create or replace function public.join_household(p_invite_code text)
returns table (household_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_code text := pg_catalog.lower(pg_catalog.btrim(p_invite_code));
begin
  if v_user is null then raise exception 'Se requiere una sesión de usuario'; end if;
  if v_code is null or v_code !~ '^[0-9a-f]{48}$' then raise exception 'Código de invitación no válido'; end if;
  select h.id into v_id from public.households h where h.invite_code_hash = extensions.digest(v_code, 'sha256');
  if v_id is null then raise exception 'Código de invitación no válido'; end if;
  insert into public.household_members (household_id, user_id) values (v_id, v_user)
    on conflict on constraint household_members_pkey do nothing;
  return query select v_id;
end;
$$;

revoke all on function public.create_household(text), public.join_household(text), public.touch_scenario() from public, anon, authenticated;
grant execute on function public.create_household(text), public.join_household(text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- RLS checks to run using three test Auth users A, B and C (real UUIDs):
-- 1. Sign in as A, call create_household; record H and invitation code privately.
--    A can insert/list/update/delete scenarios for H.
-- 2. Sign in as B without joining: SELECT scenarios filtered by H returns [].
--    INSERT a scenario with household_id=H fails RLS; UPDATE/DELETE affect 0 rows.
--    INSERT/UPDATE/DELETE household_members is permission denied, including B->H.
--    SELECT invite_code_hash from households is permission denied for A and B.
-- 3. B calls join_household with a random/incorrect code: error, no membership.
--    B calls join_household with the valid invitation: succeeds and is idempotent.
--    B can now read/update/delete A's shared scenarios; created_by stays A.
-- 4. C creates a different family K. A/B cannot read/write K's scenarios.
--    A/B cannot move a scenario from H into K or change its identifier.
-- 5. Unauthenticated clients (role anon, no Auth JWT) cannot read any rows,
--    create a household, join, or write memberships/scenarios.
-- 6. POST upsert with on_conflict=household_id,id by B on A's existing scenario
--    succeeds; created_by/created_at are preserved and updated_at is server time.
-- For SQL Editor testing, SET LOCAL ROLE authenticated and set JWT claims inside
-- a transaction; use actual existing auth.users IDs, then ROLLBACK each test.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
--   select set_config('request.jwt.claims', '{"sub":"<USER_UUID>","role":"authenticated"}', true);
--   select household_id from public.household_members;
--   rollback;
