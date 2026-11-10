-- 1. Marketing and Merchant departments: two more locations. Their leaders (picked per shift in the
--    area-leaders grid) add the staff who worked that shift on the day, including people who are not on
--    the roster yet. Those duties count for the lucky draws like any other.
-- 2. A leader is marked present automatically on a shift as soon as they start marking or adding staff
--    on that shift.

alter table public.area_leaders drop constraint if exists area_leaders_location_check;
alter table public.area_leaders add constraint area_leaders_location_check check (location in
  ('Shift Leadership', 'Swipe 1', 'Swipe 2', 'BML Stall', 'Products Showcase', 'Marketing', 'Merchant'));

alter table public.staff drop constraint if exists staff_source_check;
alter table public.staff add constraint staff_source_check check (source in ('roster', 'admin', 'self', 'leader'));

create or replace function public.is_location(p text)
returns boolean language sql immutable as $$
  select p in ('Shift Leadership', 'Swipe 1', 'Swipe 2', 'BML Stall', 'Products Showcase', 'Marketing', 'Merchant')
$$;

-- add_extra_shift: accepts the department locations (never picked automatically)
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
  if v_loc is not null and not public.is_location(v_loc) then
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
    if v_loc is null then raise exception 'Pick a location for %', v_staff.full_name; end if;
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

-- A person who is not in the system yet: create them (or reuse the staff with that UID) and add them
create or replace function public.add_new_staff_to_shift(
  p_shift int, p_location text, p_name text, p_uid text default null, p_phone text default null)
returns public.assignments
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_date date;
begin
  if not public.is_app_user() then raise exception 'Only leaders and admins can add staff'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Enter the person''s name'; end if;
  if not public.is_location(p_location) or p_location = 'Shift Leadership' then
    raise exception 'Pick an area for the new person';
  end if;
  if not public.leader_allowed(p_shift, p_location) then
    raise exception 'You can only add staff to your own shift and area';
  end if;
  select shift_date into v_date from public.shifts where id = p_shift;
  if not found then raise exception 'Shift not found'; end if;
  if not public.is_admin() and not public.attendance_open(p_shift) then
    raise exception 'Staff can only be added on the day of the shift';
  end if;
  if nullif(trim(p_uid), '') is not null then
    select id into v_id from public.staff where uid is not null and public.norm_uid(uid) = public.norm_uid(p_uid) limit 1;
  end if;
  if v_id is null then
    insert into public.staff (full_name, uid, phone, source, available_dates)
    values (trim(p_name), nullif(trim(p_uid), ''), nullif(trim(p_phone), ''), 'leader', array[v_date])
    returning id into v_id;
  end if;
  return public.add_extra_shift(v_id, p_shift, p_location, true);
end $$;
revoke all on function public.add_new_staff_to_shift(int, text, text, text, text) from public, anon;
grant execute on function public.add_new_staff_to_shift(int, text, text, text, text) to authenticated;

create or replace function public.admin_move_assignment(p_assignment uuid, p_shift int, p_location text)
returns public.assignments
language plpgsql security definer set search_path = public as $$
declare a public.assignments; st public.staff; v_row public.assignments;
begin
  if not public.is_admin() then raise exception 'Only admins can move duties'; end if;
  select * into a from public.assignments where id = p_assignment;
  if not found then raise exception 'Duty not found'; end if;
  select * into st from public.staff where id = a.staff_id;
  if not exists (select 1 from public.shifts where id = p_shift) then raise exception 'Shift not found'; end if;
  if not public.is_location(p_location) then raise exception 'Unknown location %', p_location; end if;
  if p_location = 'Shift Leadership' and not st.is_leader then
    raise exception '% is not a shift leader', st.full_name;
  end if;
  if p_shift <> a.shift_id and exists (select 1 from public.assignments where shift_id = p_shift and staff_id = a.staff_id) then
    raise exception '% is already on that shift', st.full_name;
  end if;
  update public.assignments set
    shift_id = p_shift,
    location = p_location,
    responsibility = case when p_location = 'Shift Leadership' then 'LEADER'
                          when location = p_location then responsibility
                          else 'AREA' end,
    status = case when p_shift = a.shift_id then status else 'pending' end,
    marked_at = case when p_shift = a.shift_id then marked_at end,
    marked_by = case when p_shift = a.shift_id then marked_by end,
    note = coalesce(note || ' · ', '') || 'moved by ' || lower(auth.jwt() ->> 'email')
  where id = p_assignment
  returning * into v_row;
  return v_row;
end $$;

-- Leader auto-present ------------------------------------------------------------------------------
-- Let the auto-mark below update the leader's own row even though it is outside their areas
create or replace function public.guard_leader_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or current_setting('kaanivaa.auto_present', true) = 'on' then return new; end if;
  if new.shift_id is distinct from old.shift_id or new.staff_id is distinct from old.staff_id
     or new.location is distinct from old.location or new.responsibility is distinct from old.responsibility then
    raise exception 'Only admins can change roster assignments';
  end if;
  if not public.leader_allowed(old.shift_id, old.location) then
    raise exception 'You can only mark attendance for your own shift and area';
  end if;
  if new.status is distinct from old.status and not public.attendance_open(old.shift_id) then
    raise exception 'Attendance can only be marked on the day of the shift';
  end if;
  return new;
end $$;
revoke all on function public.guard_leader_update() from public, anon, authenticated;

create or replace function public.leader_auto_present()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_staff uuid;
begin
  if new.status = 'pending' or (tg_op = 'UPDATE' and new.status is not distinct from old.status) then return null; end if;
  select u.staff_id into v_staff from public.app_users u
   where u.email = lower(auth.jwt() ->> 'email') and u.role = 'leader';
  if v_staff is null or v_staff = new.staff_id then return null; end if;
  perform set_config('kaanivaa.auto_present', 'on', true);
  insert into public.assignments (shift_id, staff_id, location, responsibility, status, marked_at, marked_by, extra, added_by, note)
  values (new.shift_id, v_staff, 'Shift Leadership', 'LEADER', 'present', now(), lower(auth.jwt() ->> 'email'),
          false, 'area leaders', 'Auto: present when they started marking')
  on conflict (shift_id, staff_id) do update
    set status = 'present', note = coalesce(public.assignments.note || ' · ', '') || 'Auto: present when they started marking'
    where public.assignments.status = 'pending';
  perform set_config('kaanivaa.auto_present', 'off', true);
  return null;
end $$;
revoke all on function public.leader_auto_present() from public, anon, authenticated;

drop trigger if exists assignments_leader_auto_present on public.assignments;
create trigger assignments_leader_auto_present after insert or update of status on public.assignments
  for each row execute function public.leader_auto_present();
