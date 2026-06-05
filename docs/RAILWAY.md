# Deploy on Railway (fully automatic)

No web UI, no port, no manual cron. Push the repo and run **`npm start`** — the scheduler handles everything.

## What runs automatically

- **5 cycles per day** (like → comment → cooldown → post), spaced **2–3 hours**
- Only during **active hours** (default 8:00–20:00, set `TZ` + `ACTIVE_HOURS_*`)
- **Post verification** every 30 minutes
- **Group rotation** from your Google Sheet

## Railway setup

1. **New project** → Deploy from GitHub
2. **Dockerfile** builder (includes Chromium)
3. **Volume** → mount `/app/data` (LinkedIn login + daily state survive redeploys)
4. **Railway env variables** — set the LinkedIn login in **Variables**:
   - `LINKEDIN_EMAIL`
   - `LINKEDIN_PASSWORD`

   Optional variables you may also set there:
   - `LINKEDIN_VERIFICATION_CODE`
   - `TWOCAPTCHA_API_KEY`

   Other settings live in:
   - `lib/hardcoded-config.js` (sheet ID, schedule, Chrome, limits)
   - `lib/auth-credentials.js` (reads the Railway variables above)

5. **Start command:** `node src/daemon.js` (default from Dockerfile)

6. **LinkedIn login:** Bot Chrome → email/password → open group.

   **6-digit email OTP (Railway):** Project → your service → **Variables** → **New variable**
   - Name: `LINKEDIN_VERIFICATION_CODE`
   - Value: `038323` (latest 6 digits from LinkedIn email, no spaces)
   - **Redeploy** or restart the service after each new code (codes expire in minutes).

   **After one successful login:** session is stored in `/app/data/linkedin-bot-chrome`. Restarts should log `Session restored from bot profile` and **not** send a new OTP. You can then **remove** `LINKEDIN_VERIFICATION_CODE` from Railway.

   **Required:** Volume mounted at `/app/data` — without it, every redeploy wipes the profile and LinkedIn emails a new code again.

   **2Captcha** is only for puzzle captchas, not email OTP.

7. **Test schedule on Railway:** `RAILWAY_TEST_SCHEDULE=true` in `lib/hardcoded-config.js` runs cycles every **5 minutes** (24h window). Set `RAILWAY_TEST_SCHEDULE` to `"false"` before real production.

## Local

```bash
npm start    # same scheduler as Railway
npm run cycle   # one cycle only (debug)
```

## You do not need

- Port 3000 / HTTP API
- `CRON_SECRET`
- External cron services
- `npm run daemon` (same as `npm start` now)
