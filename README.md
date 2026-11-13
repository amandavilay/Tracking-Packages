# Shopping Tracker

A personal app that reads your Gmail (read only) and tracks packages, price drops, returns, and spending. Built for iPhone: add it to your Home Screen and it works like an app, with push notifications.

## How it works

| Piece | What it does |
| --- | --- |
| Email scan (hourly) | Searches Gmail for order, shipping, return, and refund emails. First run imports the last 60 days. Regex handles known formats first; Claude reads anything regex can't. Each email is processed once and records are merged so nothing shows twice. Emails missing key info go to **Needs Review**. |
| Packages | 17TRACK status every 2 hours plus a Refresh button. Tagged Palm Coast or Boynton Beach from the shipping address. Auto archived 7 days after delivery. "Didn't get it" drafts a claim email. |
| Price Drops | Checks each item twice a day for 14 days after the order. Reads JSON-LD / Open Graph prices first, Claude second. Notifies on drops of $5 or more and drafts a price adjustment email. |
| Returns | Claude reads each retailer's return policy (cached, editable in Settings). Countdown with green / yellow / red. Tracks return shipments and refunds; flags refunds not posted 14 days after the retailer gets the return. |
| Spending | Monthly totals minus refunds, by retailer. |
| Morning digest | One push notification a day (default 8am Eastern), opens the Today view. |

No email is ever sent by the app. Every draft is shown for you to copy.

## Project layout

```
app/            Screens (packages, prices, returns, spending, today, settings, review) and API routes
  api/cron/[job]  Scheduled jobs: scan, tracking, prices, returns, digest
  actions.ts      Buttons and forms (server actions)
lib/            Logic: gmail, parser, carriers, ingest, tracking (17TRACK), prices, returns, summary, push, drafts
prisma/         Database schema (SQLite)
tests/          Parser and pipeline tests with sample emails
public/         PWA manifest, service worker, icons
vercel.json     Schedule for the jobs
```

## Step 1: Get your keys

### Google (Gmail access)
1. Go to https://console.cloud.google.com and sign in with the Gmail account you shop with.
2. Top bar, project picker, **New Project**. Name it "Shopping Tracker", click **Create**, then select it.
3. Left menu, **APIs & Services**, **Library**. Search "Gmail API", open it, click **Enable**.
4. **APIs & Services**, **OAuth consent screen** (may be called "Google Auth Platform").
   * User type: **External**. App name: Shopping Tracker. Add your email for support and developer contact.
   * Scopes: add `.../auth/gmail.readonly` and `.../auth/userinfo.email`.
   * Test users: add your own Gmail address.
   * Leave the app in **Testing**. That is fine for personal use. Note: in Testing mode Google expires the connection every 7 days, so you reconnect in Settings weekly. To avoid that, click **Publish app**; Google will show an "unverified app" warning when you connect, which you can click through since it is your own app.
5. **APIs & Services**, **Credentials**, **Create credentials**, **OAuth client ID**.
   * Type: **Web application**.
   * Authorized redirect URIs: add `http://localhost:3000/api/auth/google/callback` and later `https://YOUR-APP.vercel.app/api/auth/google/callback`.
   * Copy the **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### 17TRACK
1. Sign up at https://api.17track.net (free plan includes a monthly quota of tracking numbers).
2. In the dashboard, open **Settings** / **Security** and copy the **Access Key** into `TRACK17_API_KEY`.

### Anthropic (Claude API)
1. Sign up at https://console.anthropic.com, add a payment method under **Billing**.
2. **API Keys**, **Create Key**, copy it into `ANTHROPIC_API_KEY`.
3. The app uses `claude-opus-5-5` by default. To lower cost, set `ANTHROPIC_MODEL=claude-haiku-5-5`.

### Push notifications (VAPID keys)
Run `npm run vapid`. Put the public key in both `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private key in `VAPID_PRIVATE_KEY`, and your email in `VAPID_SUBJECT` (as `mailto:you@example.com`).

### Secrets you make up
Run `openssl rand -base64 32` twice: one for `TOKEN_ENCRYPTION_KEY` (encrypts your Gmail tokens), one for `CRON_SECRET`. Pick a password for `APP_PASSWORD`.

## Step 2: Run it on your computer

```bash
npm install
cp .env.example .env        # then fill in the keys
npx prisma db push          # creates the local database
npm run dev                 # open http://localhost:3000
```

* Go to Settings, enter both home addresses, click **Connect Gmail**.
* Run any job by hand: `npm run job -- scan` (also `tracking`, `prices`, `returns`, `digest`).
* Run tests: `npm test`.
* Preview with fake data and no keys: `npx tsx scripts/seed-demo.ts` on a fresh database.

## Step 3: Deploy to Vercel

Vercel can't keep a SQLite file between requests, so production uses **Turso**, which is hosted SQLite (free tier).

1. **Database.** Install the Turso CLI (https://docs.turso.tech/cli/installation), then:
   ```bash
   turso auth login
   turso db create shopping-tracker
   turso db show shopping-tracker --url        # -> TURSO_DATABASE_URL
   turso db tokens create shopping-tracker     # -> TURSO_AUTH_TOKEN
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > schema.sql
   turso db shell shopping-tracker < schema.sql
   ```
2. **Push the code** to GitHub (already done if you are reading this there).
3. **Import into Vercel**: https://vercel.com/new, pick this repo, framework Next.js.
4. **Environment variables**: in the project's Settings, Environment Variables, add everything from `.env.example`. Set `APP_URL` to `https://YOUR-APP.vercel.app` and leave `DATABASE_URL` as `file:./dev.db` (it is only used to build).
5. **Deploy.** Then add the production redirect URI to your Google OAuth client (Step 1, Google, item 5).
6. **Scheduled jobs** come from `vercel.json` and turn on automatically. Vercel signs each call with your `CRON_SECRET`.
   * Important: the **Hobby (free) plan only allows jobs that run once a day**. Hourly email scans, 2 hour tracking refresh, and the digest time check need the **Pro plan**. If you stay on Hobby, use a free service like cron-job.org to call these URLs on schedule with the header `Authorization: Bearer YOUR_CRON_SECRET`:
     * `/api/cron/scan` every hour
     * `/api/cron/tracking` every 2 hours
     * `/api/cron/prices` at 7am and 7pm
     * `/api/cron/returns` once a day
     * `/api/cron/digest` every hour (it only sends at your chosen hour)
7. **On your iPhone**: open the site in Safari, log in, tap Share, **Add to Home Screen**. Open it from the Home Screen icon, go to Settings, tap **Turn on notifications**, then **Send test**. (iOS only allows web push for apps added to the Home Screen, iOS 16.4 or later.)
8. In Settings, enter your two addresses and **Connect Gmail**. The 60 day import runs in batches over the next few scans.

## Notes
* Gmail access is read only. Tokens are encrypted with AES-256-GCM before they are stored.
* All keys live in environment variables; nothing is hardcoded.
* Some retailers block automated price checks. Those items show "Can't check price" instead of erroring.
