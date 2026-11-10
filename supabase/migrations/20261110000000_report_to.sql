-- "Report to" on My duty:
--  1. area leaders: console leaders (with a display name) assigned to the duty's location,
--     and to that shift if they are limited to shifts
--  2. otherwise the rostered Shift Leadership staff on the same shift (excluding the person)

alter table public.app_users add column if not exists display_name text;
alter table public.app_users add column if not exists phone text;

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
           a.location, a.responsibility, a.status, me.id as staff_id
    from me
    left join public.assignments a on a.staff_id = me.id
    left join public.shifts s on s.id = a.shift_id
  )
  select d.full_name, d.id, d.shift_date, d.shift_no, d.starts_at, d.ends_at, d.location, d.responsibility, d.status,
         coalesce(al.names, sl.names) as report_to,
         case when al.names is not null then 'area' when sl.names is not null then 'shift' end as report_to_kind
  from duties d
  left join lateral (
    select string_agg(trim(u.display_name) || coalesce(' (' || nullif(trim(u.phone), '') || ')', ''), ', '
                      order by u.display_name) as names
    from public.app_users u
    where d.id is not null
      and u.role = 'leader'
      and nullif(trim(u.display_name), '') is not null
      and d.location = any(u.areas)
      and (cardinality(u.shift_ids) = 0 or d.shift_id = any(u.shift_ids))
  ) al on true
  left join lateral (
    select string_agg(st.full_name, ', ' order by st.full_name) as names
    from public.assignments x join public.staff st on st.id = x.staff_id
    where d.id is not null
      and x.shift_id = d.shift_id and x.location = 'Shift Leadership' and x.staff_id <> d.staff_id
  ) sl on true
  order by d.shift_date, d.shift_no
$$;
grant execute on function public.lookup_my_duty(text) to anon, authenticated;
