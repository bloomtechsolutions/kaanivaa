-- Picking a leader for an area on a shift also puts them on that shift's roster (Shift Leadership),
-- so they appear in Attendance, get marked, and the duty counts. Removing them from every area on that
-- shift removes that auto-added duty again (only while it is still unmarked).

create or replace function public.area_leaders_sync_roster()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_staff uuid;
begin
  if tg_op = 'INSERT' then
    select staff_id into v_staff from public.app_users where email = new.email;
    if v_staff is not null then
      insert into public.assignments (shift_id, staff_id, location, responsibility, status, extra, added_by)
      values (new.shift_id, v_staff, 'Shift Leadership', 'LEADER', 'pending', false, 'area leaders')
      on conflict (shift_id, staff_id) do nothing;
    end if;
    return new;
  end if;
  select staff_id into v_staff from public.app_users where email = old.email;
  if v_staff is not null and not exists (
       select 1 from public.area_leaders where email = old.email and shift_id = old.shift_id) then
    delete from public.assignments
     where shift_id = old.shift_id and staff_id = v_staff and added_by = 'area leaders' and status = 'pending';
  end if;
  return old;
end $$;
revoke all on function public.area_leaders_sync_roster() from public, anon, authenticated;

drop trigger if exists area_leaders_sync_roster on public.area_leaders;
create trigger area_leaders_sync_roster after insert or delete on public.area_leaders
  for each row execute function public.area_leaders_sync_roster();

-- Backfill: leaders already picked in the grid but not on that shift's roster
insert into public.assignments (shift_id, staff_id, location, responsibility, status, extra, added_by)
select distinct al.shift_id, u.staff_id, 'Shift Leadership', 'LEADER', 'pending', false, 'area leaders'
from public.area_leaders al join public.app_users u on u.email = al.email
where u.staff_id is not null
on conflict (shift_id, staff_id) do nothing;
