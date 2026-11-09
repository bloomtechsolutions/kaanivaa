-- Leaders/admins can add a staff member to an extra shift (e.g. a volunteer who stays on),
-- and remove such extra shifts. Original/auto-assigned duties are not touched by these functions.

alter table public.assignments add column if not exists extra boolean not null default false;
alter table public.assignments add column if not exists added_by text;

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
  if v_loc = 'Shift Leadership' and not v_staff.is_leader then
    raise exception '% is not a shift leader', v_staff.full_name;
  end if;

  -- default: the location on this shift with the lowest fill ratio
  if v_loc is null then
    select l.name into v_loc
    from (values ('Shift Leadership', 3, 0), ('Swipe 1', 15, 1), ('Swipe 2', 15, 2), ('BML Stall', 10, 3), ('Products Showcase', 5, 4))
         as l(name, target, ord)
    where l.name <> 'Shift Leadership' or v_staff.is_leader
    order by (select count(*) from public.assignments a where a.shift_id = p_shift and a.location = l.name)::numeric / l.target, l.ord
    limit 1;
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
begin
  if not public.is_app_user() then raise exception 'Only leaders and admins can remove extra shifts'; end if;
  if not exists (select 1 from public.assignments where id = p_assignment and extra) then
    raise exception 'Only extra shifts can be removed here';
  end if;
  delete from public.assignments where id = p_assignment and extra;
end $$;

revoke all on function public.add_extra_shift(uuid, int, text, boolean) from public, anon;
revoke all on function public.remove_extra_shift(uuid) from public, anon;
grant execute on function public.add_extra_shift(uuid, int, text, boolean) to authenticated;
grant execute on function public.remove_extra_shift(uuid) to authenticated;
