-- Per-shift area leaders: for each shift x area, which leader(s) cover it.
-- A leader can hold different areas on different shifts. Leaders with no rows here keep the older
-- rule (app_users.areas x effective shifts).

create table if not exists public.area_leaders (
  shift_id int  not null references public.shifts (id) on delete cascade,
  location text not null check (location in ('Shift Leadership', 'Swipe 1', 'Swipe 2', 'BML Stall', 'Products Showcase')),
  email    text not null references public.app_users (email) on delete cascade on update cascade,
  primary key (shift_id, location, email)
);
alter table public.area_leaders enable row level security;
grant select, insert, update, delete on public.area_leaders to authenticated;
revoke all on public.area_leaders from anon;
drop policy if exists "area leaders read" on public.area_leaders;
create policy "area leaders read" on public.area_leaders for select to authenticated using (public.is_app_user());
drop policy if exists "area leaders admin write" on public.area_leaders;
create policy "area leaders admin write" on public.area_leaders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Carry over the current setup: each leader's areas x their effective shifts (empty shifts = all)
insert into public.area_leaders (shift_id, location, email)
select s.id, a.area, u.email
from public.app_users u
cross join lateral unnest(u.areas) as a(area)
join public.shifts s on (cardinality(public.effective_shift_ids(u.email)) = 0 or s.id = any(public.effective_shift_ids(u.email)))
where u.role = 'leader' and cardinality(u.areas) > 0
on conflict do nothing;

-- May the signed-in user work on this shift + location?
create or replace function public.leader_allowed(p_shift int, p_location text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    case
      when exists (select 1 from public.area_leaders where email = lower(auth.jwt() ->> 'email')) then
        exists (select 1 from public.area_leaders
                where email = lower(auth.jwt() ->> 'email') and shift_id = p_shift and location = p_location)
      else
        (cardinality(public.my_areas()) = 0 or p_location = any(public.my_areas()))
        and (cardinality(public.my_shift_ids()) = 0 or p_shift = any(public.my_shift_ids()))
    end)
$$;
revoke all on function public.leader_allowed(int, text) from public, anon;
grant execute on function public.leader_allowed(int, text) to authenticated;

-- Leaders: attendance-only changes, and only on their own shift + area
create or replace function public.guard_leader_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.shift_id is distinct from old.shift_id or new.staff_id is distinct from old.staff_id
     or new.location is distinct from old.location or new.responsibility is distinct from old.responsibility then
    raise exception 'Only admins can change roster assignments';
  end if;
  if not public.leader_allowed(old.shift_id, old.location) then
    raise exception 'You can only mark attendance for your own shift and area';
  end if;
  return new;
end $$;
revoke all on function public.guard_leader_update() from public, anon, authenticated;

create or replace function public.check_leader_shift_on_extra()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.extra and (auth.jwt() ->> 'email') is not null
     and not public.leader_allowed(new.shift_id, new.location) then
    raise exception 'You can only add staff to your own shift and area';
  end if;
  if tg_op = 'DELETE' and old.extra and (auth.jwt() ->> 'email') is not null
     and not public.leader_allowed(old.shift_id, old.location) then
    raise exception 'You can only change your own shift and area';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.check_leader_shift_on_extra() from public, anon, authenticated;

create or replace function public.add_extra_shift(
  p_staff uuid, p_shift int, p_location text default null, p_present boolean default false)
returns public.assignments
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff;
  v_loc   text := nullif(trim(p_location), '');
  v_row   public.assignments;
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if not public.is_app_user() then raise exception 'Only leaders and admins can add extra shifts'; end if;
  select * into v_staff from public.staff where id = p_staff;
  if not found then raise exception 'Staff not found'; end if;
  if not exists (select 1 from public.shifts where id = p_shift) then raise exception 'Shift not found'; end if;
  if exists (select 1 from public.assignments where shift_id = p_shift and staff_id = p_staff) then
    raise exception '% is already on this shift', v_staff.full_name;
  end if;
  if v_loc is not null and v_loc not in ('Shift Leadership', 'Swipe 1', 'Swipe 2', 'BML Stall', 'Products Showcase') then
    raise exception 'Unknown location %', v_loc;
  end if;
  if v_loc is not null and not public.leader_allowed(p_shift, v_loc) then
    raise exception 'You can only add staff to your own shift and area';
  end if;
  if v_loc = 'Shift Leadership' and not v_staff.is_leader then
    raise exception '% is not a shift leader', v_staff.full_name;
  end if;

  if v_loc is null then
    select l.name into v_loc
    from (values ('Shift Leadership', 3, 0), ('Swipe 1', 15, 1), ('Swipe 2', 15, 2), ('BML Stall', 10, 3), ('Products Showcase', 5, 4))
         as l(name, target, ord)
    where (l.name <> 'Shift Leadership' or v_staff.is_leader)
      and public.leader_allowed(p_shift, l.name)
    order by (select count(*) from public.assignments a where a.shift_id = p_shift and a.location = l.name)::numeric / l.target, l.ord
    limit 1;
    if v_loc is null then raise exception 'No suitable location in your area for %', v_staff.full_name; end if;
  end if;

  insert into public.assignments (shift_id, staff_id, location, responsibility, status, marked_at, marked_by, extra, added_by)
  values (p_shift, p_staff, v_loc, case when v_loc = 'Shift Leadership' then 'LEADER' else 'AREA' end,
          case when p_present then 'present' else 'pending' end,
          case when p_present then now() end,
          case when p_present then v_email end,
          true, v_email)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.remove_extra_shift(p_assignment uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_shift int; v_loc text;
begin
  if not public.is_app_user() then raise exception 'Only leaders and admins can remove extra shifts'; end if;
  select shift_id, location into v_shift, v_loc from public.assignments where id = p_assignment and extra;
  if not found then raise exception 'Only extra shifts can be removed here'; end if;
  if not public.leader_allowed(v_shift, v_loc) then
    raise exception 'You can only change your own shift and area';
  end if;
  delete from public.assignments where id = p_assignment and extra;
end $$;

-- Report to: leaders assigned to that exact shift + area; leaders without per-shift rows use the older rule
drop function if exists public.lookup_my_duty(text);
create function public.lookup_my_duty(q text)
returns table (
  full_name text, assignment_id uuid, shift_date date, shift_no smallint, starts_at time, ends_at time,
  location text, responsibility text, status text, report_to text, report_to_kind text
)
language sql stable security definer set search_path = public
as $$
  with me as (select id, full_name from public.staff where id = public.find_staff(q)),
  duties as (
    select me.full_name, a.id, a.shift_id, s.shift_date, s.shift_no, s.starts_at, s.ends_at,
           a.location, a.responsibility, a.status
    from me
    left join public.assignments a on a.staff_id = me.id
    left join public.shifts s on s.id = a.shift_id
  ),
  leaders as (
    select u.email,
           coalesce(nullif(trim(u.display_name), ''), ls.full_name) as name,
           coalesce(nullif(trim(u.phone), ''), nullif(trim(ls.phone), '')) as phone,
           u.areas, public.effective_shift_ids(u.email) as shift_ids,
           exists (select 1 from public.area_leaders al where al.email = u.email) as per_shift
    from public.app_users u
    left join public.staff ls on ls.id = u.staff_id
    where u.role = 'leader'
  )
  select d.full_name, d.id, d.shift_date, d.shift_no, d.starts_at, d.ends_at, d.location, d.responsibility, d.status,
         r.names as report_to,
         case when r.names is not null then 'area' end as report_to_kind
  from duties d
  left join lateral (
    select string_agg(l.name || coalesce(' (' || l.phone || ')', ''), ', ' order by l.name) as names
    from leaders l
    where d.id is not null and l.name is not null
      and (
        (l.per_shift and exists (select 1 from public.area_leaders al
                                 where al.email = l.email and al.shift_id = d.shift_id and al.location = d.location))
        or (not l.per_shift and d.location = any(l.areas)
            and (cardinality(l.shift_ids) = 0 or d.shift_id = any(l.shift_ids)))
      )
  ) r on true
  order by d.shift_date, d.shift_no
$$;
grant execute on function public.lookup_my_duty(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.area_leaders;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
