-- Admins can unlock a shift's attendance outside its day (e.g. for testing or corrections).
-- An unlocked shift is open for everyone who may work on it, leaders included, until it is locked again.

create table if not exists public.attendance_unlocks (
  shift_id    int primary key references public.shifts (id) on delete cascade,
  unlocked_by text,
  unlocked_at timestamptz not null default now()
);
alter table public.attendance_unlocks enable row level security;
grant select, insert, update, delete on public.attendance_unlocks to authenticated;
revoke all on public.attendance_unlocks from anon;
drop policy if exists "unlocks read" on public.attendance_unlocks;
create policy "unlocks read" on public.attendance_unlocks for select to authenticated using (public.is_app_user());
drop policy if exists "unlocks admin write" on public.attendance_unlocks;
create policy "unlocks admin write" on public.attendance_unlocks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.attendance_open(p_shift int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.attendance_unlocks where shift_id = p_shift)
      or coalesce((
        select (now() at time zone 'Indian/Maldives') >= s.shift_date::timestamp
           and (now() at time zone 'Indian/Maldives') <  s.shift_date::timestamp + interval '26 hours'
        from public.shifts s where s.id = p_shift), false)
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.attendance_unlocks;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
