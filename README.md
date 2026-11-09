# Kaanivaa 44 · Staff Roster, Attendance & Lucky Draw

Next.js 16 app (Vercel) + Supabase for running the Kaanivaa 44 staff duty roster (11–14 Nov 2026).

| Page | Who | What |
|---|---|---|
| `/` | everyone | Event landing page |
| `/me` | staff (no login) | Look up own shifts, locations, attendance and draw entries by UID or BML email |
| `/winners` | everyone | Daily MVR 2,000 winners + grand iPhone 18 Pro winner |
| `/admin` | leaders, admins | Live coverage & attendance per day/shift |
| `/admin/attendance` | leaders, admins | Mark Present / Late / Absent / Excused per shift, grouped by location; bulk "mark unmarked present"; live sync between devices |
| `/admin/staff` | leaders, admins | Per-staff shifts, attendance, draw entries; CSV export |
| `/admin/draw` | admins | Run daily & grand draws with a reveal animation; void & redraw |
| `/admin/users` | admins | Grant leader/admin console access |

## Lucky draw rules (enforced in the database)

- **Eligible** = marked *Present* or *Late* for at least one shift (that day for the daily draw, any day for the grand draw).
- Winner is chosen inside Postgres (`run_draw`) using `gen_random_uuid()` (cryptographically random); the full entry list is stored with the result.
- One active draw per day and one grand draw. Voiding a win lets you redraw; the voided person is excluded from that redraw.
- Optional: previous daily winners are excluded from later daily draws (toggle on the draw page). Everyone stays eligible for the grand draw.

## Security model

- Row Level Security on every table. Anonymous visitors can only call `lookup_my_duty(q)` and `public_winners()`.
- Console access requires a Supabase Auth login **and** an `app_users` row (`leader` or `admin`).
- Leaders can only change attendance fields (a trigger blocks moving people between shifts/locations).

## Setup

1. **Database** — run `supabase/migrations/*.sql` in order in the Supabase SQL editor.
2. **Roster data** — generate the seed from the roster workbook (kept out of git because it contains staff personal data):
   ```bash
   pip install openpyxl
   python3 scripts/xlsx_to_seed.py path/to/Kaanivaa_44_Duty_Roster.xlsx > supabase/seed.sql
   ```
   then run `supabase/seed.sql` in the SQL editor. ⚠️ It truncates roster, attendance and draws.
3. **First admin** — Supabase → Authentication → Users → *Add user* (email + password), then:
   ```sql
   insert into public.app_users (email, role) values ('you@example.com', 'admin');
   ```
   More leaders/admins can then be added from `/admin/users` (each also needs an Auth user).
   Recommended: disable public sign-ups in Supabase → Authentication → Providers → Email.
4. **Env vars** (local `.env.local` and Vercel project settings):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
5. `npm install && npm run dev`

## Deploy to Vercel

Import this GitHub repo in Vercel (framework: Next.js), add the two env vars above, deploy.
