-- Admin reset for testing.
-- A private snapshot of the original roster (spreadsheet import) is kept so a full reset can restore it.

create table if not exists public.baseline_staff (like public.staff including defaults);
create table if not exists public.baseline_assignments (
  shift_id       int  not null,
  staff_id       uuid not null,
  location       text not null,
  responsibility text not null,
  primary key (shift_id, staff_id)
);
alter table public.baseline_staff       enable row level security;  -- no policies: only reachable via admin_reset()
alter table public.baseline_assignments enable row level security;
revoke all on public.baseline_staff, public.baseline_assignments from anon, authenticated;

-- Take the snapshot once (original roster rows only)
insert into public.baseline_staff
select * from public.staff where source = 'roster'
  and not exists (select 1 from public.baseline_staff);
insert into public.baseline_assignments (shift_id, staff_id, location, responsibility)
select a.shift_id, a.staff_id, a.location, a.responsibility
from public.assignments a join public.staff st on st.id = a.staff_id
where st.source = 'roster' and not exists (select 1 from public.baseline_assignments);

-- p_mode = 'activity': clear the selected test activity, keep people and duties
-- p_mode = 'full'    : restore the original roster exactly (removes added/joined staff, all activity and draws)
create or replace function public.admin_reset(
  p_mode text,
  p_attendance boolean default false,
  p_confirmations boolean default false,
  p_draws boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare v_att int := 0; v_conf int := 0; v_draws int := 0; v_staff int := 0;
begin
  if not public.is_admin() then raise exception 'Only admins can reset data'; end if;

  if p_mode = 'activity' then
    if p_draws then
      delete from public.draws where true; get diagnostics v_draws = row_count;
    end if;
    if p_attendance then
      update public.assignments set status = 'pending', note = null where status <> 'pending';
      get diagnostics v_att = row_count;
    end if;
    if p_confirmations then
      update public.assignments set confirmed_at = null where confirmed_at is not null;
      get diagnostics v_conf = row_count;
    end if;

  elsif p_mode = 'full' then
    if not exists (select 1 from public.baseline_assignments) then
      raise exception 'No original roster snapshot found';
    end if;
    perform pg_advisory_xact_lock(4444);
    delete from public.draws where true;                        get diagnostics v_draws = row_count;
    delete from public.assignments where true;
    delete from public.staff where id not in (select id from public.baseline_staff);
    get diagnostics v_staff = row_count;
    -- restore original staff details (and any roster staff that were removed)
    insert into public.staff select * from public.baseline_staff
      on conflict (id) do update set
        full_name = excluded.full_name, uid = excluded.uid, email = excluded.email, is_leader = excluded.is_leader,
        registration_status = excluded.registration_status, available_dates = excluded.available_dates,
        phone = excluded.phone, source = excluded.source;
    insert into public.assignments (shift_id, staff_id, location, responsibility)
      select shift_id, staff_id, location, responsibility from public.baseline_assignments;

  else
    raise exception 'Unknown reset mode %', p_mode;
  end if;

  return json_build_object('attendance', v_att, 'confirmations', v_conf, 'draws', v_draws, 'staff_removed', v_staff,
                           'staff', (select count(*) from public.staff), 'assignments', (select count(*) from public.assignments));
end $$;

revoke all on function public.admin_reset(text, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_reset(text, boolean, boolean, boolean) to authenticated;
