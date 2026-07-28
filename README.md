# Campaign Manager

An automated ad-pacing monitor for ad-ops teams. It replaces manual Google Ad Manager (GAM) delivery checks with a self-running pipeline: GAM reports are ingested automatically, pacing health is computed against real flight-day math, and under/over-delivering line items surface on a live dashboard with AI-generated fix suggestions.

Built by **Team AAFA** for the HackAdTech AI hackathon.

**Live dashboard:** https://kannasainikith-art.github.io/Campaign-pacing-checking/

---

## The Problem

Ad-ops teams manually pull GAM delivery reports several times a day and eyeball spend/impressions against budget — with no adjustment for how far into the flight a campaign actually is. Drift goes unnoticed until the next manual check, by which point a line item may have already breached its contract or burned unbillable inventory.

## How It Works

```
Gmail (GAM report emails)
        │
        ▼
Google Apps Script (ingestReports, every 5 min)
   parses CSV attachments
        │
        ▼
Supabase Postgres (raw_reports table)
        │
        ▼
campaign_pacing (SQL view)
   computes flight-day-aware pacing %, rolls status up
   from the WORST line item in each campaign
        │
        ▼
Auto-generated REST API (Supabase)
        │
        ▼
React Dashboard (src/App.jsx → deployed via GitHub Pages)
   auto-refreshes every 5 min
   "Take Action" → AI-generated recommendation (Gemini API,
   via a Supabase Edge Function) → human reviews and approves
   → logged permanently to actions_taken
```

A six-hourly email digest (`sendPacingDigest`, Apps Script) also summarizes under- and over-pacing line items to a configurable recipient list.

## Pacing Formula

Impression-based only — impressions and dollars are never cross-divided.

```
days_elapsed        = today − flight_start   (0 before start, capped at full flight length after end)
expected_impressions = contracted_quantity × (days_elapsed / flight_days)
pacing %             = (impressions_delivered / expected_impressions) × 100
```

| Status | Range |
|---|---|
| Under | < 90% |
| Healthy | 90–110% |
| Over | > 110% |
| Mixed | campaign contains both an under- and an over-pacing line item — both badges shown |

Campaign-level status always rolls up from the **worst** line item, never the average, so one starving line item can't hide inside a healthy-looking campaign.

## Tech Stack

- **Ingestion:** Google Apps Script
- **Database:** Supabase (Postgres + Row Level Security + auto-generated REST API)
- **AI recommendations:** Google Gemini API (`gemini-flash-latest`), called from a Supabase Edge Function
- **Frontend:** React (single-file, `src/App.jsx`), deployed via GitHub Pages
- **Auth:** Supabase Auth

## Database Schema

**`raw_reports`** — one row per ingested line item report
`id, message_id, order_text, line_item, start_date, end_date, rate, contracted_quantity, booked_revenue, delivery_indicator, impressions, clicks, ctr, revenue, campaign_name, advertiser, ingested_at`

**`campaign_pacing`** (view) — computed pacing per line item
`campaign_name, advertiser, li_id, li_name, start_date, end_date, flight_days, days_elapsed, contracted_quantity, expected_impressions, impressions, clicks, budget, spent, pacing, status`

**`actions_taken`** — every AI suggestion and human-approved action, permanently logged
`id, campaign_name, li_id, li_name, title, description, impact, li_status, simulated_gam_payload, created_at, approved_by`

## Security

- Row Level Security enabled on all tables; no public/anon access
- Dashboard access requires real Supabase Auth login
- Apps Script writes to Supabase using a service-role key stored in Script Properties — never in code or the repo
- The only key present in frontend code is the Supabase **publishable** key, which is safe by design
- The Gemini API key used by the AI recommendation feature is stored as a Supabase Edge Function secret, server-side only — never exposed to the frontend

## AI-Generated Recommendations

Clicking **Take Action** on a non-healthy line item sends its real pacing data and GAM settings (priority, available inventory, creative status, delivery setting, frequency cap) to a Supabase Edge Function, which calls the Gemini API with a diagnostic system prompt. The model returns a structured JSON diagnosis, root-cause reasoning, and a specific recommended fix — not a generic template. The suggestion is logged to `actions_taken`, and a human must review and approve it before any action is considered taken.

*Note: the original plan used the Claude API for this feature; the team moved to the Gemini API after confirming Claude's API does not offer a sustained free tier suitable for this project's budget. The diagnostic methodology and prompt design are provider-agnostic.*

## What's Real vs. Simulated

| Feature | Status |
|---|---|
| Report ingestion (Gmail → Supabase) | Real |
| Pacing computation | Real |
| Dashboard, auth, alerts | Real |
| Action logging | Real, persists across sessions |
| AI-generated recommendations | Real (Gemini API) |
| GAM write-back | Simulated — logs a simulated payload; live GAM account write access is pending credentials |

## Local Setup

```bash
# clone and install
git clone https://github.com/kannasainikith-art/Campaign-pacing-checking.git
cd Campaign-pacing-checking
npm install

# run locally
npm run dev

# deploy dashboard to GitHub Pages
npm run deploy
```

Supabase Edge Function (AI recommendation feature):
```bash
supabase secrets set GEMINI_API_KEY=your_key_here
supabase functions deploy generate-suggestion
```

The Apps Script project ("GAM Report Ingestion") is tied to a Gmail account and managed separately in the Apps Script editor; its source is included in this repo at `apps-script/`.

## Roadmap

- GAM live write-back (pending API credentials)
- Individual user logins and role-based access (schema already supports this via `approved_by`)
- Multi-network/multi-tenant support for onboarding additional GAM accounts
- Templatized client-facing pacing reports