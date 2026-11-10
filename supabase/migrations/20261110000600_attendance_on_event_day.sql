-- Attendance can only be marked on the day of the shift (Maldives time). The window runs from 00:00 on
-- the shift's date until 02:00 the next morning, so the 22:00-00:00 shift can be finished after midnight.
-- Admins are exempt so they can correct mistakes afterwards.

create or replace function public.attendance_open(p_shift int)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (now() at time zone 'Indian/Maldives') >= s.shift_date::timestamp
       and (now() at time zone 'Indian/Maldives') <  s.shift_date::timestamp + interval '26 hours'
    from public.shifts s where s.id = p_shift), false)
$$;
grant execute on function public.attendance_open(int) to authenticated;

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
  if new.status is distinct from old.status and not public.attendance_open(old.shift_id) then
    raise exception 'Attendance can only be marked on the day of the shift';
  end if;
  return new;
end $$;
revoke all on function public.guard_leader_update() from public, anon, authenticated;

create or replace function public.check_leader_shift_on_extra()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.extra and (auth.jwt() ->> 'email') is not null then
    if not public.leader_allowed(new.shift_id, new.location) then
      raise exception 'You can only add staff to your own shift and area';
    end if;
    if not public.is_admin() and not public.attendance_open(new.shift_id) then
      raise exception 'Extra shifts can only be added on the day of the shift';
    end if;
  end if;
  if tg_op = 'DELETE' and old.extra and (auth.jwt() ->> 'email') is not null then
    if not public.leader_allowed(old.shift_id, old.location) then
      raise exception 'You can only change your own shift and area';
    end if;
    if not public.is_admin() and not public.attendance_open(old.shift_id) then
      raise exception 'Extra shifts can only be removed on the day of the shift';
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.check_leader_shift_on_extra() from public, anon, authenticated;
