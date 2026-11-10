# Kaanivaa 44 · Staff Roster, Attendance & Lucky Draw

Next.js 16 app (Vercel) + Supabase for running the Kaanivaa 44 staff duty roster (11–14 Nov 2026).

| Page | Who | What |
|---|---|---|
| `/` | everyone | Event landing page |
| `/me` | staff (no login) | Look up own shifts, attendance and lucky draw entries by UID or BML email |
| `/join` | staff (no login) | Volunteer to join (UID + `@bml.com.mv` email + days); duties are **assigned automatically** |
| `/winners` | everyone | Daily MVR 2,000 winners + grand iPhone 18 Pro winner |
| `/admin` | leaders, admins | Live coverage & attendance per day/shift |
| `/admin/attendance` | leaders, admins | Mark Present / Late / Absent / Excused per shift, grouped by location; bulk "mark unmarked present"; **add staff to an extra shift** (tagged EXTRA, removable); live sync between devices |
| `/admin/staff` | leaders, admins | Per-staff shifts, attendance, draw entries; CSV export. Admins: add staff, **edit staff details**, auto-assign, **add / move / remove a duty, remove all duties**, remove staff |
| `/admin/draw` | admins | See eligible staff per draw; spin-wheel reveal of the database-picked winner; void & redraw |
| `/admin/reports` | admins | Excel reports (full event, daily, staff, lucky draw, follow-up) |
| `/admin/users` | admins | Grant leader/admin console access; link leader logins to staff records, and **pick the area leader(s) for every shift × area** (a leader can lead a different area on each shift; they then only see and manage that area on that shift, and staff there see them as "Report to") |
| `/admin/reset` | admins | Clear test activity or restore the original roster |

## Lucky draw rules (enforced in the database)

- **Every completed duty is one entry** (assignment marked *Present* or *Late*).
  - Daily draw: entries = duties completed that day (up to 3).
  - Grand draw: entries = all duties completed (up to 12) — 12 duties = 12× the chance of 1 duty.
- `run_draw` picks one **entry** uniformly at random inside Postgres with `gen_random_uuid()`
  (cryptographically random) and stores the full entry list (`pool`, one element per entry) plus `entrants`.
- One active draw per day and one grand draw. Voiding a win lets you redraw; the voided person is excluded from that redraw.
- Optional: previous daily winners are excluded from later daily draws (toggle on the draw page). Everyone stays in the grand draw.
- The spin wheel has one equal slice per entry (a name appears once per completed duty, spread around the wheel), shows the
  name under the pointer live, and lands on one of the database-picked winner's slices.

## Automatic duty assignment

`assign_staff()` (used by Join, Add staff and Auto-assign):

- **Available on all event days → assigned to every shift** (all 12), each at the location with the lowest fill ratio.
- **Some days only →** at least one shift per available day, and up to 3 that day while a location is still
  understaffed.

Locations are chosen by lowest fill ratio against the planned headcount (Leadership 3, Swipe 1/2 15, BML Stall 10,
Products 5), then the least-crowded shift. TENT is given until a location's tent quota is met, otherwise AREA.
Re-running Auto-assign only fills shifts the person isn't on yet.

## Excel reports (admins)

`/admin/reports` builds formatted `.xlsx` files in the browser from live data: full event report (summary &
coverage, master roster, a sheet per day, staff summary, lucky draw + entry lists, absences follow-up), daily report,
staff summary, lucky draw report and follow-up list.

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

The Vercel project `kaanivaa` is connected to this GitHub repo: every push to the production branch deploys to
https://kaanivaa.vercel.app automatically. Other branches get (Vercel-protected) preview deployments.
