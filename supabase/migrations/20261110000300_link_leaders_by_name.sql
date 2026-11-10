-- Also link logins without a UID in the email (e.g. neena@) to the one shift leader whose name
-- contains that word (Aishath Neena). Unique matches only.
create or replace function public.match_staff_for_email(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.staff where lower(email) = lower(p_email) limit 1),
    (select min(id::text)::uuid from public.staff
      where uid is not null
        and nullif(regexp_replace(split_part(p_email, '@', 1), '[^0-9]', '', 'g'), '') is not null
        and public.norm_uid(uid) = regexp_replace(split_part(p_email, '@', 1), '[^0-9]', '', 'g')
      having count(*) = 1),
    (select min(id::text)::uuid from public.staff
      where is_leader
        and length(regexp_replace(split_part(p_email, '@', 1), '[^a-zA-Z]', '', 'g')) >= 4
        and lower(full_name) ~ ('\m' || lower(regexp_replace(split_part(p_email, '@', 1), '[^a-zA-Z]', '', 'g')) || '\M')
      having count(*) = 1)
  )
$$;

update public.app_users u
   set staff_id = public.match_staff_for_email(u.email),
       follow_roster = (u.role = 'leader')
 where u.staff_id is null and public.match_staff_for_email(u.email) is not null;
