-- Kaanivaa 44 — staff roster, attendance and lucky draw
-- Run this in the Supabase SQL editor (or `supabase db push`), then run supabase/seed.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- App users (who may use the admin console)
-- role 'admin'  : everything, including running lucky draws and editing roster
-- role 'leader' : view roster and mark attendance
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  email      text primary key check (email = lower(email)),
  role       text not null default 'leader' check (role in ('admin', 'leader')),
  created_at timestamptz not null default now()
);

create or replace function public.current_role_name()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.app_users where email = lower(auth.jwt() ->> 'email')
$$;

create or replace function public.is_app_user()
returns boolean language sql stable as $$ select public.current_role_name() is not null $$;

create or replace function public.is_admin()
returns boolean language sql stable as $$ select coalesce(public.current_role_name() = 'admin', false) $$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table if not exists public.staff (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null unique,
  uid                 text,
  email               text,
  is_leader           boolean not null default false,
  registration_status text,
  available_dates     date[] not null default '{}',
  phone               text,
  created_at          timestamptz not null default now()
);

create table if not exists public.shifts (
  id         serial primary key,
  shift_date date not null,
  shift_no   smallint not null,
  starts_at  time not null,
  ends_at    time not null,
  unique (shift_date, shift_no)
);

create table if not exists public.assignments (
  id             uuid primary key default gen_random_uuid(),
  shift_id       int  not null references public.shifts (id) on delete cascade,
  staff_id       uuid not null references public.staff (id) on delete cascade,
  location       text not null,
  responsibility text not null check (responsibility in ('LEADER', 'TENT', 'AREA')),
  status         text not null default 'pending'
                 check (status in ('pending', 'present', 'late', 'absent', 'excused')),
  marked_at      timestamptz,
  marked_by      text,
  note           text,
  created_at     timestamptz not null default now(),
  unique (shift_id, staff_id)
);
create index if not exists assignments_staff_idx on public.assignments (staff_id);
create index if not exists assignments_shift_idx on public.assignments (shift_id);

create table if not exists public.draws (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('daily', 'grand')),
  draw_date   date,
  prize       text not null,
  staff_id    uuid not null references public.staff (id),
  pool_size   int  not null,
  pool        uuid[] not null,
  drawn_at    timestamptz not null default now(),
  drawn_by    text,
  voided      boolean not null default false,
  void_reason text,
  check ((kind = 'daily') = (draw_date is not null))
);
-- Only one active (non-voided) draw per day, and one active grand draw.
create unique index if not exists draws_one_active
  on public.draws (kind, coalesce(draw_date, '1900-01-01'::date)) where not voided;

-- Stamp who/when attendance was marked
create or replace function public.stamp_attendance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.marked_at := case when new.status = 'pending' then null else now() end;
    new.marked_by := case when new.status = 'pending' then null else lower(auth.jwt() ->> 'email') end;
  end if;
  return new;
end $$;

drop trigger if exists assignments_stamp on public.assignments;
create trigger assignments_stamp before update on public.assignments
  for each row execute function public.stamp_attendance();

-- Leaders may only change attendance columns, not move people around.
create or replace function public.guard_leader_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (
       new.shift_id is distinct from old.shift_id or new.staff_id is distinct from old.staff_id
    or new.location is distinct from old.location or new.responsibility is distinct from old.responsibility) then
    raise exception 'Only admins can change roster assignments';
  end if;
  return new;
end $$;

drop trigger if exists assignments_guard on public.assignments;
create trigger assignments_guard before update on public.assignments
  for each row execute function public.guard_leader_update();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.app_users   enable row level security;
alter table public.staff       enable row level security;
alter table public.shifts      enable row level security;
alter table public.assignments enable row level security;
alter table public.draws       enable row level security;

drop policy if exists "app users read self" on public.app_users;
create policy "app users read self" on public.app_users for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or public.is_admin());
drop policy if exists "admins manage app users" on public.app_users;
create policy "admins manage app users" on public.app_users for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read" on public.staff;
create policy "staff read" on public.staff for select to authenticated using (public.is_app_user());
drop policy if exists "staff admin write" on public.staff;
create policy "staff admin write" on public.staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "shifts read" on public.shifts;
create policy "shifts read" on public.shifts for select to authenticated using (public.is_app_user());
drop policy if exists "shifts admin write" on public.shifts;
create policy "shifts admin write" on public.shifts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "assignments read" on public.assignments;
create policy "assignments read" on public.assignments for select to authenticated using (public.is_app_user());
drop policy if exists "assignments mark" on public.assignments;
create policy "assignments mark" on public.assignments for update to authenticated
  using (public.is_app_user()) with check (public.is_app_user());
drop policy if exists "assignments admin insert" on public.assignments;
create policy "assignments admin insert" on public.assignments for insert to authenticated with check (public.is_admin());
drop policy if exists "assignments admin delete" on public.assignments;
create policy "assignments admin delete" on public.assignments for delete to authenticated using (public.is_admin());

drop policy if exists "draws read" on public.draws;
create policy "draws read" on public.draws for select to authenticated using (public.is_app_user());
-- draws are only written through run_draw() / void_draw()

-- ---------------------------------------------------------------------------
-- Lucky draw
-- Eligible = staff marked present or late on at least one shift
--   daily : on that date
--   grand : on any date
-- ---------------------------------------------------------------------------
create or replace function public.draw_pool(p_kind text, p_date date default null, p_exclude_previous boolean default true)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct a.staff_id
  from public.assignments a
  join public.shifts s on s.id = a.shift_id
  where public.is_app_user()
    and a.status in ('present', 'late')
    and (p_kind = 'grand' or s.shift_date = p_date)
    -- never re-pick someone whose win for this same draw was voided
    and a.staff_id not in (
      select d.staff_id from public.draws d
      where d.voided and d.kind = p_kind and d.draw_date is not distinct from (case when p_kind = 'daily' then p_date end))
    -- optionally skip people who already won a daily prize
    and (not p_exclude_previous or p_kind = 'grand' or a.staff_id not in (
      select d.staff_id from public.draws d where not d.voided and d.kind = 'daily'))
$$;

create or replace function public.run_draw(p_kind text, p_date date default null, p_exclude_previous boolean default true)
returns public.draws
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_pool   uuid[];
  v_winner uuid;
  v_row    public.draws;
  v_date   date := case when p_kind = 'daily' then p_date end;
begin
  if not public.is_admin() then
    raise exception 'Only admins can run the lucky draw';
  end if;
  if p_kind not in ('daily', 'grand') then
    raise exception 'Unknown draw kind %', p_kind;
  end if;
  if p_kind = 'daily' and p_date is null then
    raise exception 'A date is required for the daily draw';
  end if;
  if exists (select 1 from public.draws where kind = p_kind and draw_date is not distinct from v_date and not voided) then
    raise exception 'This draw has already been done. Void it first to redraw.';
  end if;

  select array_agg(id) into v_pool from public.draw_pool(p_kind, p_date, p_exclude_previous) as id;
  if v_pool is null or array_length(v_pool, 1) = 0 then
    raise exception 'No eligible staff. Mark attendance first.';
  end if;

  -- gen_random_uuid() uses a cryptographically strong random source
  select id into v_winner from unnest(v_pool) as id order by gen_random_uuid() limit 1;

  insert into public.draws (kind, draw_date, prize, staff_id, pool_size, pool, drawn_by)
  values (p_kind, v_date,
          case when p_kind = 'grand' then 'iPhone 18 Pro' else 'MVR 2,000 to Swipe wallet' end,
          v_winner, array_length(v_pool, 1), v_pool, lower(auth.jwt() ->> 'email'))
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.void_draw(p_draw uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can void a draw';
  end if;
  update public.draws set voided = true, void_reason = nullif(trim(p_reason), '') where id = p_draw;
end $$;

-- ---------------------------------------------------------------------------
-- Public (no login) functions
-- ---------------------------------------------------------------------------
create or replace function public.norm_uid(t text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(upper(coalesce(t, '')), '[^A-Z0-9]', '', 'g'), '^[UV]', '')
$$;

-- Staff look up their own duties with their UID or work email.
create or replace function public.lookup_my_duty(q text)
returns table (
  full_name text, shift_date date, shift_no smallint, starts_at time, ends_at time,
  location text, responsibility text, status text
)
language sql stable security definer set search_path = public
as $$
  with me as (
    select st.* from public.staff st
    where length(trim(coalesce(q, ''))) >= 3
      and (lower(st.email) = lower(trim(q))
           or (st.uid is not null and public.norm_uid(st.uid) = public.norm_uid(q))
           or (st.email is not null and public.norm_uid(split_part(st.email, '@', 1)) = public.norm_uid(q)))
    limit 1
  )
  select me.full_name, s.shift_date, s.shift_no, s.starts_at, s.ends_at, a.location, a.responsibility, a.status
  from me
  left join public.assignments a on a.staff_id = me.id
  left join public.shifts s on s.id = a.shift_id
  order by s.shift_date, s.shift_no
$$;

create or replace function public.public_winners()
returns table (kind text, draw_date date, prize text, full_name text, drawn_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select d.kind, d.draw_date, d.prize, st.full_name, d.drawn_at
  from public.draws d join public.staff st on st.id = d.staff_id
  where not d.voided
  order by d.kind = 'grand', d.draw_date
$$;

revoke all on function public.run_draw(text, date, boolean)   from public, anon;
revoke all on function public.void_draw(uuid, text)            from public, anon;
revoke all on function public.draw_pool(text, date, boolean)   from public, anon;
grant execute on function public.run_draw(text, date, boolean) to authenticated;
grant execute on function public.void_draw(uuid, text)         to authenticated;
grant execute on function public.draw_pool(text, date, boolean) to authenticated;
grant execute on function public.lookup_my_duty(text) to anon, authenticated;
grant execute on function public.public_winners()      to anon, authenticated;

-- Live updates across leaders' devices
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.assignments;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.draws;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
