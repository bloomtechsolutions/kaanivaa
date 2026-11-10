-- Link console users (leader logins) to their staff record, and let a leader's shifts follow
-- their roster duties automatically (so they can't get out of sync).

alter table public.app_users add column if not exists staff_id uuid references public.staff (id) on delete set null;
alter table public.app_users add column if not exists follow_roster boolean not null default false;

-- Best staff match for a login email: same email, otherwise exactly one staff whose UID equals the
-- digits in the email's local part (e.g. zima3014@ -> UID 3014).
create or replace function public.match_staff_for_email(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.staff where lower(email) = lower(p_email) limit 1),
    (select min(id::text)::uuid from public.staff
      where uid is not null
        and nullif(regexp_replace(split_part(p_email, '@', 1), '[^0-9]', '', 'g'), '') is not null
        and public.norm_uid(uid) = regexp_replace(split_part(p_email, '@', 1), '[^0-9]', '', 'g')
      having count(*) = 1)
  )
$$;
revoke all on function public.match_staff_for_email(text) from public, anon;
grant execute on function public.match_staff_for_email(text) to authenticated;

-- Link existing logins once, and let linked leaders follow their roster by default
update public.app_users u
   set staff_id = public.match_staff_for_email(u.email)
 where u.staff_id is null;
update public.app_users set follow_roster = true where staff_id is not null and role = 'leader';

-- Effective shifts for a console user: their live roster duties when following the roster,
-- otherwise the shifts ticked by an admin (empty = all shifts)
create or replace function public.effective_shift_ids(p_email text)
returns int[] language sql stable security definer set search_path = public as $$
  select case
    when u.follow_roster and u.staff_id is not null then
      coalesce((select array_agg(distinct a.shift_id order by a.shift_id) from public.assignments a where a.staff_id = u.staff_id), '{0}')
    else u.shift_ids
  end
  from public.app_users u where u.email = lower(p_email)
$$;
revoke all on function public.effective_shift_ids(text) from public, anon;
grant execute on function public.effective_shift_ids(text) to authenticated;

-- my_shift_ids() now uses the effective shifts ('{0}' = following roster but no duties = no shifts)
create or replace function public.my_shift_ids()
returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(public.effective_shift_ids(auth.jwt() ->> 'email'), '{}')
$$;

-- Report to: area leaders (named, or the linked staff name), on their effective shifts
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
    select coalesce(nullif(trim(u.display_name), ''), ls.full_name) as name,
           coalesce(nullif(trim(u.phone), ''), nullif(trim(ls.phone), '')) as phone,
           u.areas, public.effective_shift_ids(u.email) as shift_ids
    from public.app_users u
    left join public.staff ls on ls.id = u.staff_id
    where u.role = 'leader'
  )
  select d.full_name, d.id, d.shift_date, d.shift_no, d.starts_at, d.ends_at, d.location, d.responsibility, d.status,
         al.names as report_to,
         case when al.names is not null then 'area' end as report_to_kind
  from duties d
  left join lateral (
    select string_agg(l.name || coalesce(' (' || l.phone || ')', ''), ', ' order by l.name) as names
    from leaders l
    where d.id is not null
      and l.name is not null
      and d.location = any(l.areas)
      and (cardinality(l.shift_ids) = 0 or d.shift_id = any(l.shift_ids))
  ) al on true
  order by d.shift_date, d.shift_no
$$;
grant execute on function public.lookup_my_duty(text) to anon, authenticated;
