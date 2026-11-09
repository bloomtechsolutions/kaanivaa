-- Hardening from Supabase security advisor
alter function public.is_app_user() set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.norm_uid(text) set search_path = public;

-- Trigger functions are never called directly
revoke all on function public.stamp_attendance()    from public, anon, authenticated;
revoke all on function public.guard_leader_update() from public, anon, authenticated;

-- Role helpers are only needed by signed-in users (used inside RLS policies)
revoke all on function public.current_role_name() from public, anon;
revoke all on function public.is_app_user()       from public, anon;
revoke all on function public.is_admin()          from public, anon;
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.is_app_user()       to authenticated;
grant execute on function public.is_admin()          to authenticated;
