-- New staff (admin-added or self-registered), automatic duty assignment, duty confirmation

alter table public.assignments add column if not exists confirmed_at timestamptz;
alter table public.staff add column if not exists source text not null default 'roster'
  check (source in ('roster', 'admin', 'self'));

create unique index if not exists staff_uid_norm_uniq on public.staff (public.norm_uid(uid)) where uid is not null;
create unique index if not exists staff_email_uniq on public.staff (lower(email)) where email is not null;

-- Resolve a staff member from a UID (U1234 / 1234 / V234) or work email.
create or replace function public.find_staff(q text)
returns uuid language sql stable security definer set search_path = public as $$
  select st.id from public.staff st
  where length(trim(coalesce(q, ''))) >= 3
    and (lower(st.email) = lower(trim(q))
         or (st.uid is not null and public.norm_uid(st.uid) = public.norm_uid(q))
         or (st.email is not null and public.norm_uid(split_part(st.email, '@', 1)) = public.norm_uid(q)))
  limit 1
$$;
revoke all on function public.find_staff(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Automatic assignment
-- For each available date: give at least p_per_day shifts, and keep adding
-- (max 3 per day) while some location on that day is below its planned headcount.
-- Picks the location/shift with the lowest fill ratio. TENT until the location's
-- tent quota for that shift is met, otherwise AREA.
-- ---------------------------------------------------------------------------
create or replace function public.assign_staff(p_staff uuid, p_per_day int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff;
  v_date  date;
  v_n     int := 0;
  v_k     int;
  r       record;
begin
  perform pg_advisory_xact_lock(4444);  -- serialise concurrent registrations
  select * into v_staff from public.staff where id = p_staff;
  if not found then raise exception 'Staff not found'; end if;

  foreach v_date in array v_staff.available_dates loop
    v_k := (select count(*) from public.assignments a join public.shifts s on s.id = a.shift_id
            where a.staff_id = p_staff and s.shift_date = v_date);
    loop
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

      exit when not found;
      exit when v_k >= 3;
      exit when v_k >= p_per_day and r.ratio >= 1;

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

-- Admin: add a staff member (optionally auto-assign)
create or replace function public.admin_add_staff(
  p_name text, p_uid text, p_email text, p_dates date[], p_is_leader boolean default false, p_auto boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int := 0;
begin
  if not public.is_admin() then raise exception 'Only admins can add staff'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Enter the full name'; end if;
  if nullif(trim(p_uid), '') is not null and exists (select 1 from public.staff where public.norm_uid(uid) = public.norm_uid(p_uid)) then
    raise exception 'A staff member with UID % already exists', p_uid;
  end if;
  insert into public.staff (full_name, uid, email, is_leader, registration_status, available_dates, source)
  values (trim(p_name), nullif(upper(trim(p_uid)), ''), nullif(lower(trim(p_email)), ''), coalesce(p_is_leader, false),
          'Added by admin', (select coalesce(array_agg(distinct d order by d), '{}') from unnest(p_dates) d
                             where d in (select shift_date from public.shifts)), 'admin')
  returning id into v_id;
  if p_auto then v_n := public.assign_staff(v_id); end if;
  return json_build_object('id', v_id, 'assigned', v_n);
end $$;

-- Admin: (re)run automatic assignment for an existing staff member
create or replace function public.admin_auto_assign(p_staff uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can assign duties'; end if;
  return public.assign_staff(p_staff);
end $$;

-- Public: a staff member volunteers to join
create or replace function public.register_staff(p_name text, p_uid text, p_email text, p_dates date[])
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_dates date[];
begin
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Please enter your full name'; end if;
  if trim(coalesce(p_uid, '')) !~* '^[UV]?[0-9]{2,6}$' then raise exception 'Please enter a valid staff UID (e.g. U3450)'; end if;
  if lower(trim(coalesce(p_email, ''))) !~ '^[a-z0-9._%+-]+@bml\.com\.mv$' then
    raise exception 'Please use your BML email (name@bml.com.mv)';
  end if;
  select coalesce(array_agg(distinct d order by d), '{}') into v_dates
    from unnest(p_dates) d where d in (select shift_date from public.shifts) and d >= (now() at time zone 'Indian/Maldives')::date;
  if cardinality(v_dates) = 0 then raise exception 'Choose at least one upcoming event day'; end if;
  if public.find_staff(p_uid) is not null or public.find_staff(p_email) is not null then
    raise exception 'You are already registered — use "My duty" to see your shifts';
  end if;

  insert into public.staff (full_name, uid, email, registration_status, available_dates, source)
  values (trim(p_name), upper(trim(p_uid)), lower(trim(p_email)), 'Self-registered', v_dates, 'self')
  returning id into v_id;
  return public.assign_staff(v_id);
end $$;

-- ---------------------------------------------------------------------------
-- Duty lookup + confirmation (public, by UID or email)
-- ---------------------------------------------------------------------------
drop function if exists public.lookup_my_duty(text);
create function public.lookup_my_duty(q text)
returns table (
  full_name text, assignment_id uuid, shift_date date, shift_no smallint, starts_at time, ends_at time,
  location text, responsibility text, status text, confirmed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select st.full_name, a.id, s.shift_date, s.shift_no, s.starts_at, s.ends_at, a.location, a.responsibility, a.status, a.confirmed_at
  from public.staff st
  left join public.assignments a on a.staff_id = st.id
  left join public.shifts s on s.id = a.shift_id
  where st.id = public.find_staff(q)
  order by s.shift_date, s.shift_no
$$;

create or replace function public.confirm_my_duty(q text, p_assignment_ids uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_staff uuid := public.find_staff(q); v_n int;
begin
  if v_staff is null then raise exception 'Staff not found'; end if;
  update public.assignments set confirmed_at = now()
   where staff_id = v_staff and confirmed_at is null
     and (p_assignment_ids is null or id = any(p_assignment_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.admin_add_staff(text, text, text, date[], boolean, boolean) from public, anon;
revoke all on function public.admin_auto_assign(uuid) from public, anon;
grant execute on function public.admin_add_staff(text, text, text, date[], boolean, boolean) to authenticated;
grant execute on function public.admin_auto_assign(uuid) to authenticated;
grant execute on function public.register_staff(text, text, text, date[]) to anon, authenticated;
grant execute on function public.lookup_my_duty(text) to anon, authenticated;
grant execute on function public.confirm_my_duty(text, uuid[]) to anon, authenticated;

-- Admins may remove staff; draws keep history so block deleting a winner
alter table public.draws drop constraint if exists draws_staff_id_fkey;
alter table public.draws add constraint draws_staff_id_fkey foreign key (staff_id) references public.staff (id) on delete restrict;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.staff;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
