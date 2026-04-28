# Migrating emailsendingasa into the CRM

This folder is the portable handoff bundle. Everything the other project needs
to absorb this tool lives here:

- `state.json` — full Redis dump (pointer, blacklist, cooldowns, histories, users)
- `blacklist.csv` — flat blacklist for easy human review / DB import
- `MIGRATION.md` — this document

The source tree of this repo (`/Users/adit/emailsendingasa`) is the other half:
the React/Next.js code, the 168k-row email pool in `lib/emails.ts`, and the
Google Sheets integration.

---

## What this tool does, in one paragraph

A private Next.js app where 3 users (admin + 2 teammates) hit a button and
get a Google Sheet of 400 fresh leads to email, with a 12-hour cooldown
between batches. The pool of ~26k leads is baked into the source as
`lib/emails.ts`. A growing blacklist (Upstash Redis Set, currently ~3.8k+)
guarantees no email is ever shipped twice across users or batches. Admin can
upload CSVs to seed the blacklist with previously-contacted leads.

---

## Where every piece of state lives

| Thing | Storage | File / Key |
|---|---|---|
| 26k email pool | Source code | `lib/emails.ts` (auto-gen by `scripts/csv-to-ts.mjs`) |
| Original CSV | Repo root | `proxi Master Sheet - master.csv` |
| Pointer (next-row index) | Upstash Redis | `pointer` (integer) |
| Blacklist | Upstash Redis | `blacklist` (Set) |
| Per-user cooldowns | Upstash Redis | `cooldown:<password>` (ISO string) |
| Per-user batch history | Upstash Redis | `history:<password>` (JSON, capped at 50) |
| Fresh-remaining cache | Upstash Redis | `effective_remaining` (JSON `{pointer, fresh, updatedAt}`) |
| Users (password→user) | Source code | `lib/users.ts` |
| Google service account | Env var | `GOOGLE_SERVICE_ACCOUNT_JSON` (base64 JSON) |
| Session cookie secret | Env var | `COOKIE_SECRET` |

`state.json` in this folder contains every Redis-side value at export time.

---

## Constants worth preserving in the new home

| Name | Value | File |
|---|---|---|
| `BATCH_SIZE` | 400 | `app/api/batch/route.ts` |
| `COOLDOWN_HOURS` | 12 | `app/api/batch/route.ts` |
| `LOOKAHEAD_WINDOW` | 500 | `app/api/batch/route.ts` |
| `HISTORY_CAP` | 50 | `lib/kv.ts` |
| `SADD_CHUNK` | 1000 | `lib/kv.ts` |
| `SMISMEMBER_CHUNK` | 500 | `lib/kv.ts` |

---

## Files to read in order when integrating

1. `README.md` — high-level overview
2. `docs/specs/2026-04-19-emailsendingasa-design.md` — original design spec
3. `app/api/batch/route.ts` — core batch-handout flow:
   - read pointer
   - walk forward picking 400 rows that aren't blacklisted (in 500-row windows, batched SMISMEMBER)
   - create Google Sheet, share with user's Gmail
   - advance pointer, auto-add picked rows to blacklist, refresh cache
   - set 12h cooldown
4. `app/api/blacklist/upload/route.ts` — admin CSV upload (regex-extracts emails column-agnostically)
5. `app/api/login/route.ts` + `app/api/logout/route.ts` — iron-session auth (REPLACEABLE by the CRM's auth)
6. `app/dashboard/page.tsx` + `app/dashboard/client.tsx` — the entire UI:
   - cooldown countdown
   - "Give me my batch of 400" button
   - fresh-remaining count
   - history list (per-user, or all-users for admin)
   - admin-only: blacklist upload + total blacklist size
7. `lib/kv.ts` — every Redis call lives here. Single point of integration if moving to a different KV.
8. `lib/sheets.ts` — Google Sheets/Drive service-account wrapper. KEEP AS-IS, it's portable.
9. `lib/users.ts` — to be REPLACED by the CRM's user model.
10. `lib/auth.ts` — iron-session helpers, to be REPLACED by the CRM's auth.

---

## Migration checklist (high level)

1. **Move the email pool** — turn `lib/emails.ts` into a database table
   (`email_pool` or merge into the CRM's existing leads table with a
   `pool_status` flag). Removes the need for a redeploy to add leads.
2. **Move the blacklist** — import `state.json:blacklist` into a DB table
   (`email_blacklist`, single unique column). The blacklist is the most
   important piece of state — losing it means re-contacting leads.
3. **Move pointer / cooldowns / histories** — either keep them in Redis (if
   the CRM uses Redis) or normalize into Postgres tables.
4. **Replace auth** — drop `app/api/login`, `app/api/logout`, `lib/auth.ts`,
   and `lib/users.ts`. Use the CRM's existing auth + user table. Preserve
   the `isAdmin` notion for the blacklist upload UI and all-users history
   view.
5. **Port the routes** — move `/dashboard` and `/api/batch` and
   `/api/blacklist/upload` under whatever tab structure the CRM uses.
6. **Keep Google Sheets integration verbatim** — the service-account JSON
   env var is portable, and `lib/sheets.ts` doesn't depend on anything
   project-specific.
