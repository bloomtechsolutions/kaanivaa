-- Duty confirmation by staff was removed from the app: disable the public RPC.
-- (assignments.confirmed_at is kept so existing data is not lost; nothing reads or writes it now.)
revoke all on function public.confirm_my_duty(text, uuid[]) from public, anon, authenticated;
