-- 1. Leader areas: a leader can be limited to one or more locations (empty = all areas).
-- 2. Admin duty changes: move a duty to another shift/location.

alter table public.app_users add column if not exists areas text[] not null default '{}';

create or replace function public.my_areas()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select areas from public.app_users where email = lower(auth.jwt() ->> 'email')), '{}')
$$;
revoke all on function public.my_areas() from public, anon;
grant execute on function public.my_areas() to authenticated;

-- Leaders: attendance-only changes, and only inside their areas (if they have any)
create or replace function public.guard_leader_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_areas text[];
begin
  if public.is_admin() then return new; end if;
  if new.shift_id is distinct from old.shift_id or new.staff_id is distinct from old.staff_id
     or new.location is distinct from old.location or new.responsibility is distinct from old.responsibility then
    raise exception 'Only admins can change roster assignments';
  end if;
  v_areas := public.my_areas();
  if cardinality(v_areas) > 0 and not (old.location = any(v_areas)) then
    raise exception 'You can only mark attendance for your area (%)', array_to_string(v_areas, ', ');
  end if;
  return new;
end $$;
revoke all on function public.guard_leader_update() from public, anon, authenticated;

-- Extra shifts: leaders with areas can only add/remove inside their areas
create or replace function public.add_extra_shift(
  p_staff uuid, p_shift int, p_location text default null, p_present boolean default false)
returns public.assignments
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff;
  v_loc   text := nullif(trim(p_location), '');
  v_row   public.assignments;
  v_email text := lower(auth.jwt() ->> 'email');
  v_areas text[] := case when public.is_admin() then '{}'::text[] else public.my_areas() end;
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
  if v_loc is not null and cardinality(v_areas) > 0 and not (v_loc = any(v_areas)) then
    raise exception 'You can only add staff to your area (%)', array_to_string(v_areas, ', ');
  end if;
  if v_loc = 'Shift Leadership' and not v_staff.is_leader then
    raise exception '% is not a shift leader', v_staff.full_name;
  end if;

  if v_loc is null then
    select l.name into v_loc
    from (values ('Shift Leadership', 3, 0), ('Swipe 1', 15, 1), ('Swipe 2', 15, 2), ('BML Stall', 10, 3), ('Products Showcase', 5, 4))
         as l(name, target, ord)
    where (l.name <> 'Shift Leadership' or v_staff.is_leader)
      and (cardinality(v_areas) = 0 or l.name = any(v_areas))
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
declare v_loc text; v_areas text[] := case when public.is_admin() then '{}'::text[] else public.my_areas() end;
begin
  if not public.is_app_user() then raise exception 'Only leaders and admins can remove extra shifts'; end if;
  select location into v_loc from public.assignments where id = p_assignment and extra;
  if not found then raise exception 'Only extra shifts can be removed here'; end if;
  if cardinality(v_areas) > 0 and not (v_loc = any(v_areas)) then
    raise exception 'You can only change your area (%)', array_to_string(v_areas, ', ');
  end if;
  delete from public.assignments where id = p_assignment and extra;
end $$;

-- Admin: move a duty to another shift and/or location (staff asked to change). Attendance is reset.
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
  if p_location not in ('Shift Leadership', 'Swipe 1', 'Swipe 2', 'BML Stall', 'Products Showcase') then
    raise exception 'Unknown location %', p_location;
  end if;
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
revoke all on function public.admin_move_assignment(uuid, int, text) from public, anon;
grant execute on function public.admin_move_assignment(uuid, int, text) to authenticated;
