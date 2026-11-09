-- Staff available on every event day are assigned to every shift.
-- Others keep the previous rule: >= p_per_day shifts per available day, up to 3 while a location is understaffed.

create or replace function public.assign_staff(p_staff uuid, p_per_day int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_staff    public.staff;
  v_date     date;
  v_n        int := 0;
  v_k        int;
  v_all_days boolean;
  r          record;
begin
  perform pg_advisory_xact_lock(4444);  -- serialise concurrent registrations
  select * into v_staff from public.staff where id = p_staff;
  if not found then raise exception 'Staff not found'; end if;

  v_all_days := (select coalesce(array_agg(distinct shift_date), '{}') from public.shifts) <@ v_staff.available_dates;

  foreach v_date in array v_staff.available_dates loop
    v_k := (select count(*) from public.assignments a join public.shifts s on s.id = a.shift_id
            where a.staff_id = p_staff and s.shift_date = v_date);
    loop
      -- best (shift, location) on this day the person is not yet on: lowest fill ratio,
      -- then least-crowded shift
      select s.id as shift_id, l.name as location, l.tent_target,
             (select count(*) from public.assignments a where a.shift_id = s.id and a.location = l.name)::numeric / l.target as ratio
        into r
      from public.shifts s
      cross join (values ('Shift Leadership', 3, 0, 0), ('Swipe 1', 15, 5, 1), ('Swipe 2', 15, 5, 2),
                         ('BML Stall', 10, 5, 3), ('Products Showcase', 5, 0, 4)) as l(name, target, tent_target, ord)
      where s.shift_date = v_date
        and (l.name <> 'Shift Leadership' or v_staff.is_leader)
        and not exists (select 1 from public.assignments a where a.shift_id = s.id and a.staff_id = p_staff)
      order by 4, (select count(*) from public.assignments a where a.shift_id = s.id), l.ord, s.shift_no
      limit 1;

      exit when not found;                       -- already on every shift that day
      if not v_all_days then
        exit when v_k >= 3;
        exit when v_k >= p_per_day and r.ratio >= 1;
      end if;

      insert into public.assignments (shift_id, staff_id, location, responsibility)
      values (r.shift_id, p_staff, r.location,
              case when r.location = 'Shift Leadership' then 'LEADER'
                   when (select count(*) from public.assignments a
                         where a.shift_id = r.shift_id and a.location = r.location and a.responsibility = 'TENT') < r.tent_target
                   then 'TENT' else 'AREA' end);
      v_n := v_n + 1;
      v_k := v_k + 1;
    end loop;
  end loop;
  return v_n;
end $$;
revoke all on function public.assign_staff(uuid, int) from public, anon, authenticated;
