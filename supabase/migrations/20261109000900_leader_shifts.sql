-- Leaders can also be limited to specific shifts (empty = all shifts), alongside areas.

alter table public.app_users add column if not exists shift_ids int[] not null default '{}';

create or replace function public.my_shift_ids()
returns int[] language sql stable security definer set search_path = public as $$
  select coalesce((select shift_ids from public.app_users where email = lower(auth.jwt() ->> 'email')), '{}')
$$;
revoke all on function public.my_shift_ids() from public, anon;
grant execute on function public.my_shift_ids() to authenticated;

-- Leaders: attendance-only changes, inside their areas and shifts (if limited)
create or replace function public.guard_leader_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_areas text[]; v_shifts int[];
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
  v_shifts := public.my_shift_ids();
  if cardinality(v_shifts) > 0 and not (old.shift_id = any(v_shifts)) then
    raise exception 'You can only mark attendance for your own shifts';
  end if;
  return new;
end $$;
revoke all on function public.guard_leader_update() from public, anon, authenticated;

-- Extra shifts: leaders limited to shifts can only add/remove on those shifts
create or replace function public.leader_can_use_shift(p_shift int)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or cardinality(public.my_shift_ids()) = 0 or p_shift = any(public.my_shift_ids())
$$;
revoke all on function public.leader_can_use_shift(int) from public, anon;
grant execute on function public.leader_can_use_shift(int) to authenticated;

create or replace function public.check_leader_shift_on_extra()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.extra and not public.leader_can_use_shift(new.shift_id) then
    raise exception 'You can only add staff to your own shifts';
  end if;
  if tg_op = 'DELETE' and old.extra and auth.jwt() is not null and (auth.jwt() ->> 'email') is not null
     and not public.leader_can_use_shift(old.shift_id) then
    raise exception 'You can only change your own shifts';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.check_leader_shift_on_extra() from public, anon, authenticated;

drop trigger if exists assignments_leader_shift_extra on public.assignments;
create trigger assignments_leader_shift_extra before insert or delete on public.assignments
  for each row execute function public.check_leader_shift_on_extra();
