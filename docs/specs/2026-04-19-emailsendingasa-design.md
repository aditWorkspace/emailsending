# emailsendingasa — Design Spec (v2, simplified)

**Date:** 2026-04-19
**Owner:** Adit
**Users:**
- Adit (pin `7722`, email `aditmittal@berkeley.edu`)
- Srijay (pin `3490`, email `srijay_vejendla@berkeley.edu`)
- Asim (pin `5514`, email `asim_ali@berkeley.edu`)

---

## 1. Goal

A private Vercel website. Each user enters their 4-digit pin, hits one button, and is handed the link to a Google Sheet containing their next 400 emails. 12-hour cooldown between batches. No email is ever given out twice. That's it.

---

## 2. Stack

- **Next.js (App Router)** on **Vercel** — one deploy, one URL.
- **Vercel KV** (free tier Redis) — stores the 4 pieces of mutable state and nothing else.
- **Google Sheets + Drive APIs** via a **service account** — creates the output sheet and shares it with the user's Gmail.
- **Emails hardcoded** in `lib/emails.ts` as a TypeScript array. No upload UI, no DB for the pool. You paste the 26k rows in once, commit, push.

---

## 3. State (the whole thing)

Stored in Vercel KV:

| Key | Value | Purpose |
|-----|-------|---------|
| `pointer` | integer, starts at `0` | Index into the emails array. Next batch = `emails.slice(pointer, pointer+400)`. |
| `cooldown:7722` | ISO8601 timestamp | Adit's next-available time. |
| `cooldown:3490` | ISO8601 timestamp | Shri J's next-available time. |
| `cooldown:5514` | ISO8601 timestamp | Asim's next-available time. |

That's it. 4 keys. No audit log, no user table, no admin UI.

---

## 4. Users (hardcoded)

In `lib/users.ts`:

```ts
export const USERS = {
  "7722": { name: "Adit",   email: "aditmittal@berkeley.edu" },
  "3490": { name: "Srijay", email: "srijay_vejendla@berkeley.edu" },
  "5514": { name: "Asim",   email: "asim_ali@berkeley.edu" },
};
```

Pin = full identity. No separate login/username. Email is used to share the generated Sheet with that person.

---

## 5. Pages

**`/` (login)**
- Single pin input (numeric, 4 digits).
- On submit: POSTs to `/api/login` which sets an httpOnly cookie `pin=<pin>` (signed) if valid. Redirects to `/dashboard`.
- Wrong pin = shake input, red text. No lockout (YAGNI).

**`/dashboard`** (cookie required, else redirect to `/`)
- Shows: "Hi `<name>`."
- One big button: **"Give me my batch of 400"**
- Below it: next-available time (if cooldown active) or "Ready now."
- Small "Log out" link (clears cookie).

**Click button →** fetches `/api/batch`. Server does its thing (§6). Returns either:
- `{ ok: true, url: "https://docs.google.com/spreadsheets/d/..." }` → dashboard opens the URL in a new tab automatically, then shows a "Your batch is ready →" card with the link as backup.
- `{ ok: false, reason: "cooldown", retryAt }` → dashboard shows countdown.
- `{ ok: false, reason: "exhausted" }` → "Pool is empty. Tell Adit to add more."

---

## 6. `/api/batch` flow

1. Read cookie, look up user. Missing/invalid → 401.
2. Read `cooldown:<pin>` from KV. If `now < cooldown` → return `{ok:false, reason:"cooldown", retryAt}`.
3. Read `pointer` from KV. If `pointer + 400 > emails.length` → return `{ok:false, reason:"exhausted"}`.
4. Slice: `const batch = emails.slice(pointer, pointer + 400);`
5. **Create Google Sheet** via service account:
   - Use `googleapis` npm package.
   - Create a new Spreadsheet titled `<UserName> - YYYY-MM-DD - Batch`.
   - Write headers row + 400 data rows. Columns in order: Company, Full Name, Email, First Name.
   - Share it with `user.email` (role: `writer`) via Drive API.
   - Optionally move it to a per-user folder (nice-to-have; skip for v1).
6. **Commit state** (only after sheet creation succeeds):
   - `pointer += 400`
   - `cooldown:<pin>` = `now + 12h`
7. Return `{ ok: true, url: sheet.webViewLink }`.

**Concurrency:** use `@upstash/redis`'s `MULTI` or an `INCRBY` on pointer to avoid a double-click racing itself. If two clicks land simultaneously, second one sees updated cooldown and bounces.

---

## 7. File layout

```
emailsendingasa/
├── app/
│   ├── page.tsx              # pin entry
│   ├── dashboard/page.tsx    # button
│   ├── api/
│   │   ├── login/route.ts    # set cookie
│   │   ├── logout/route.ts   # clear cookie
│   │   └── batch/route.ts    # the real work
│   └── layout.tsx
├── lib/
│   ├── emails.ts             # the hardcoded 26k array
│   ├── users.ts              # pin → {name, email}
│   ├── kv.ts                 # Vercel KV client wrapper
│   ├── sheets.ts             # googleapis wrapper: createBatchSheet()
│   └── auth.ts               # cookie helpers
├── docs/specs/2026-04-19-emailsendingasa-design.md
├── package.json
├── next.config.js
├── tsconfig.json
└── README.md                 # setup, env vars, deploy steps
```

---

## 8. Env vars (on Vercel)

```
KV_URL=...                    # auto-injected when you connect Vercel KV
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
GOOGLE_SERVICE_ACCOUNT_JSON=  # paste the full JSON blob, base64-encoded
COOKIE_SECRET=                # random 32+ chars, for signing the pin cookie
```

---

## 9. Setup (what you'll do, in order)

1. Create new Google Cloud project → enable Sheets API + Drive API → create a service account → download its JSON key.
2. `npx create-next-app emailsendingasa` (TypeScript, App Router).
3. Paste the code I generate.
4. Paste the 26k emails into `lib/emails.ts`. (I'll give you a one-line script that converts your CSV into the TS array.)
5. Fill Shri's + Asim's Gmail in `lib/users.ts`.
6. `vercel link` → `vercel env add` for each secret above → `vercel deploy`.
7. In the Vercel dashboard: Storage → Create KV store → connect to project.
8. Visit URL, enter your pin, click button. Done.

---

## 10. What's intentionally NOT here

- Audit log
- Admin dashboard / menu
- Per-user Drive folders (v1 just shares the sheet directly)
- Rate-limiting / lockouts
- Password recovery (it's a 4-digit pin, you can't recover it — I just tell you what it is)
- Multi-tenant anything
- Tests beyond a smoke test for `/api/batch` happy path

---

## 11. If you want to reset someone's cooldown manually

SSH-free: Vercel dashboard → Storage → your KV → find `cooldown:<pin>` → edit value to `1970-01-01T00:00:00Z` or delete the key. Takes 20 seconds. No admin UI needed.

---

## 12. Running out of pool

26,000 ÷ 400 ÷ 3 users ≈ 21 days until exhausted. When it happens, you get the "Pool empty" error, edit `lib/emails.ts` to append more rows, push, Vercel redeploys, done.

---

All decisions final unless you change them.
