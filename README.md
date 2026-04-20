# emailsendingasa

Private tool. Three users enter their pin, hit a button, and get a fresh Google Sheet of 300 emails from a pre-uploaded pool of ~26k. 12-hour cooldown. No email is ever handed out twice.

## Users

| Name | Pin | Gmail |
|------|-----|-------|
| Adit | 7722 | aditmittal@berkeley.edu |
| Srijay | 3490 | srijay_vejendla@berkeley.edu |
| Asim | 5514 | asim_ali@berkeley.edu |

Edit `lib/users.ts` to change.

## One-time setup

### 1. Install

```bash
cd emailsendingasa
npm install
```

### 2. Load your emails

Put your CSV somewhere (columns: `Company`, `Full Name`, `Email`, `First Name` — any order), then:

```bash
node scripts/csv-to-ts.mjs path/to/your.csv
```

That overwrites `lib/emails.ts` with an array of rows. Commit it.

### 3. Create a Google Cloud service account

Already done — you have `credentials.json`. If redoing:

1. https://console.cloud.google.com → new project
2. Enable **Google Sheets API** and **Google Drive API**
3. Credentials → Create → Service account → download JSON key

### 4. Deploy to Vercel

```bash
npm i -g vercel
vercel link
vercel deploy
```

Then in the Vercel dashboard for this project:

**a. Connect Redis storage**
Storage tab → Marketplace → search "Redis" → pick **Upstash for Redis** (free tier) → link to this project. That injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` as env vars automatically.

**b. Add the other env vars** (Settings → Environment Variables):

- `GOOGLE_SERVICE_ACCOUNT_JSON` → paste the base64-encoded JSON:
  ```bash
  base64 -i credentials.json | pbcopy   # Mac
  # then paste as the value
  ```
  (Or paste the raw JSON; the code handles both.)

- `COOKIE_SECRET` → random 32+ chars:
  ```bash
  openssl rand -base64 48
  ```

**c. Redeploy**: `vercel --prod`

### 5. Share

Open the deployed URL. Enter your pin. Click the button. Done.

Share the URL with Srijay and Asim along with their pins.

## Operations

### Reset someone's cooldown

Vercel dashboard → Storage → your KV → find key `cooldown:<pin>` → delete it. Takes 20 seconds.

### Add more emails mid-run

1. Run `node scripts/csv-to-ts.mjs path/to/more.csv` (the script dedupes against nothing — if you want to merge with existing, concatenate your CSVs first).
2. `git commit && git push`. Vercel redeploys.

### Change a pin

Edit `lib/users.ts` → commit → push. Vercel redeploys.

### "Rewind" the last batch (emergency)

Vercel dashboard → Storage → KV → edit `pointer` → subtract 300. The old batch sheet still exists in Drive (delete manually if you want) but the same rows will now go out again.

## Local dev

```bash
cp .env.example .env.local
# fill in KV_* (get from Vercel dashboard), GOOGLE_SERVICE_ACCOUNT_JSON, COOKIE_SECRET
npm run dev
```

Visit http://localhost:3000.

## How it works

- `lib/emails.ts` — the pool (static, committed to git)
- `lib/users.ts` — pin → {name, email} map (static)
- Vercel KV — 4 keys: `pointer`, `cooldown:7722`, `cooldown:3490`, `cooldown:5514`
- `/` — pin entry, sets a signed cookie via iron-session
- `/dashboard` — shows cooldown status + the button
- `/api/batch` — checks cooldown → slices 300 rows → creates Google Sheet via service account → shares it with user's Gmail → advances pointer → sets cooldown → returns URL
- The service account creates sheets in its own Drive and then shares them. No OAuth flow for users.

## What's NOT here (by design)

- Audit log
- Admin dashboard (use the Vercel KV dashboard instead)
- Per-user Drive folders
- Rate limiting on pin attempts (it's a private URL)
- Tests
