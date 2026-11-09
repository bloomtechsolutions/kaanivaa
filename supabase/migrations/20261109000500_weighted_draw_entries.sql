-- Lucky draw entries are weighted by completed duties:
-- every assignment marked present/late is one entry (daily: that day's duties, grand: all duties).
-- draws.pool now holds one element per entry (a staff id repeats once per completed duty).

alter table public.draws add column if not exists entrants int;  -- distinct people in the draw
update public.draws set entrants = (select count(distinct x) from unnest(pool) x) where entrants is null;

create or replace function public.draw_pool(p_kind text, p_date date default null, p_exclude_previous boolean default true)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select a.staff_id                      -- one row per completed duty = one entry
  from public.assignments a
  join public.shifts s on s.id = a.shift_id
  where public.is_app_user()
    and a.status in ('present', 'late')
    and (p_kind = 'grand' or s.shift_date = p_date)
    and a.staff_id not in (
      select d.staff_id from public.draws d
      where d.voided and d.kind = p_kind and d.draw_date is not distinct from (case when p_kind = 'daily' then p_date end))
    and (not p_exclude_previous or p_kind = 'grand' or a.staff_id not in (
      select d.staff_id from public.draws d where not d.voided and d.kind = 'daily'))
$$;

create or replace function public.run_draw(p_kind text, p_date date default null, p_exclude_previous boolean default true)
returns public.draws
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_pool   uuid[];
  v_winner uuid;
  v_row    public.draws;
  v_date   date := case when p_kind = 'daily' then p_date end;
begin
  if not public.is_admin() then
    raise exception 'Only admins can run the lucky draw';
  end if;
  if p_kind not in ('daily', 'grand') then
    raise exception 'Unknown draw kind %', p_kind;
  end if;
  if p_kind = 'daily' and p_date is null then
    raise exception 'A date is required for the daily draw';
  end if;
  if exists (select 1 from public.draws where kind = p_kind and draw_date is not distinct from v_date and not voided) then
    raise exception 'This draw has already been done. Void it first to redraw.';
  end if;

  select array_agg(id order by id) into v_pool from public.draw_pool(p_kind, p_date, p_exclude_previous) as id;
  if v_pool is null or array_length(v_pool, 1) = 0 then
    raise exception 'No eligible staff. Mark attendance first.';
  end if;

  -- pick one ENTRY uniformly at random (gen_random_uuid() is cryptographically random),
  -- so each person's chance is proportional to their completed duties
  select e into v_winner from unnest(v_pool) as e order by gen_random_uuid() limit 1;

  insert into public.draws (kind, draw_date, prize, staff_id, pool_size, pool, entrants, drawn_by)
  values (p_kind, v_date,
          case when p_kind = 'grand' then 'iPhone 18 Pro' else 'MVR 2,000 to Swipe wallet' end,
          v_winner, array_length(v_pool, 1), v_pool,
          (select count(distinct x) from unnest(v_pool) x),
          lower(auth.jwt() ->> 'email'))
  returning * into v_row;
  return v_row;
end $$;

revoke all on function public.run_draw(text, date, boolean)   from public, anon;
revoke all on function public.draw_pool(text, date, boolean)  from public, anon;
grant execute on function public.run_draw(text, date, boolean)  to authenticated;
grant execute on function public.draw_pool(text, date, boolean) to authenticated;
