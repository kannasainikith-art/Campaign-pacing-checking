-- =============================================================
-- CAMPAIGN MANAGER — DATABASE SCHEMA (rebuild file)
-- Team AAFA
--
-- WHAT THIS IS:
--   Recreates the entire Supabase (Postgres) database for Campaign
--   Manager: tables, the pacing view, and Row-Level-Security policies.
--
-- HOW TO USE (on a fresh Supabase project):
--   1. Open the Supabase SQL Editor.
--   2. Paste this whole file and click Run.
--   3. Then, in your app, update the project URL + publishable key
--      (in supabaseClient.js) and the service role key + URL in the
--      Apps Script Script Properties.
--   4. Recreate your Auth login user under Authentication > Users.
--   5. Redeploy the frontend (npm run deploy).
--
-- NOTE ON SECURITY:
--   RLS is ON and there is NO anonymous access. Reads/writes require an
--   authenticated Supabase Auth session. Server-side ingestion (Apps
--   Script) uses the SERVICE ROLE key, which bypasses RLS by design.
-- =============================================================


-- =============================================================
-- 1. RAW REPORTS  — one row per line item, per ingested report.
--    A faithful copy of what GAM's CSV export contains. No math here.
-- =============================================================
create table if not exists raw_reports (
  id                   bigserial primary key,
  message_id           text,
  order_text           text,
  line_item            text,
  start_date           date,
  end_date             date,
  rate                 numeric,
  contracted_quantity  numeric,
  booked_revenue       numeric,
  delivery_indicator   numeric,
  impressions          bigint,
  clicks               bigint,
  ctr                  numeric,
  revenue              numeric,
  campaign_name        text,
  advertiser           text,
  ingested_at          timestamptz default now()
);


-- =============================================================
-- 2. ACTIONS TAKEN  — permanent audit trail of every approved fix.
--    approved_by is populated with the logged-in user's email
--    (phase 1: the shared account; phase 2: individual logins).
-- =============================================================
create table if not exists actions_taken (
  id                     bigserial primary key,
  campaign_name          text,
  li_id                  text,
  li_name                text,
  title                  text,
  description            text,
  impact                 text,
  li_status              text,
  simulated_gam_payload  jsonb,
  created_at             timestamptz default now(),
  approved_by            text
);


-- =============================================================
-- 3. CAMPAIGN_PACING  — the "smart" view on top of raw_reports.
--    Dedupes rows, assigns clean LI-01/LI-02 ids per campaign,
--    computes flight-day-aware pacing, and classifies each line item
--    as under / healthy / over. Any consumer (dashboard, digest email)
--    gets correctly-computed data without re-implementing the math.
-- =============================================================
create or replace view campaign_pacing
with (security_invoker = true) as
 with deduped as (
   select distinct on (raw_reports.campaign_name, raw_reports.line_item, raw_reports.order_text)
        raw_reports.id,
        raw_reports.message_id,
        raw_reports.order_text,
        raw_reports.line_item,
        raw_reports.start_date,
        raw_reports.end_date,
        raw_reports.rate,
        raw_reports.contracted_quantity,
        raw_reports.booked_revenue,
        raw_reports.delivery_indicator,
        raw_reports.impressions,
        raw_reports.clicks,
        raw_reports.ctr,
        raw_reports.revenue,
        raw_reports.campaign_name,
        raw_reports.advertiser,
        raw_reports.ingested_at
       from raw_reports
      order by raw_reports.campaign_name, raw_reports.line_item, raw_reports.order_text, raw_reports.ingested_at desc
    ), numbered as (
     select deduped.id,
        deduped.message_id,
        deduped.order_text,
        deduped.line_item,
        deduped.start_date,
        deduped.end_date,
        deduped.rate,
        deduped.contracted_quantity,
        deduped.booked_revenue,
        deduped.delivery_indicator,
        deduped.impressions,
        deduped.clicks,
        deduped.ctr,
        deduped.revenue,
        deduped.campaign_name,
        deduped.advertiser,
        deduped.ingested_at,
        'LI-'::text || lpad((row_number() over (partition by deduped.campaign_name order by deduped.line_item))::text, 2, '0'::text) as li_id,
        deduped.end_date - deduped.start_date + 1 as flight_days
       from deduped
    ), timed as (
     select numbered.id,
        numbered.message_id,
        numbered.order_text,
        numbered.line_item,
        numbered.start_date,
        numbered.end_date,
        numbered.rate,
        numbered.contracted_quantity,
        numbered.booked_revenue,
        numbered.delivery_indicator,
        numbered.impressions,
        numbered.clicks,
        numbered.ctr,
        numbered.revenue,
        numbered.campaign_name,
        numbered.advertiser,
        numbered.ingested_at,
        numbered.li_id,
        numbered.flight_days,
            case
                when numbered.start_date is null or numbered.end_date is null then null::integer
                when current_date < numbered.start_date then 0
                when current_date > numbered.end_date then numbered.flight_days
                else current_date - numbered.start_date + 1
            end as days_elapsed
       from numbered
    ), calc as (
     select timed.id,
        timed.message_id,
        timed.order_text,
        timed.line_item,
        timed.start_date,
        timed.end_date,
        timed.rate,
        timed.contracted_quantity,
        timed.booked_revenue,
        timed.delivery_indicator,
        timed.impressions,
        timed.clicks,
        timed.ctr,
        timed.revenue,
        timed.campaign_name,
        timed.advertiser,
        timed.ingested_at,
        timed.li_id,
        timed.flight_days,
        timed.days_elapsed,
            case
                when timed.days_elapsed is null or timed.flight_days is null or timed.flight_days = 0 then null::numeric
                else timed.contracted_quantity * (timed.days_elapsed::numeric / timed.flight_days::numeric)
            end as expected_impressions
       from timed
    )
 select campaign_name,
    advertiser,
    li_id,
    line_item as li_name,
    start_date,
    end_date,
    flight_days,
    days_elapsed,
    contracted_quantity,
    expected_impressions,
    impressions,
    clicks,
    booked_revenue as budget,
    revenue as spent,
        case
            when expected_impressions is null or expected_impressions = 0::numeric then null::numeric
            else round(impressions::numeric / expected_impressions * 100::numeric, 1)
        end as pacing,
        case
            when expected_impressions is null or expected_impressions = 0::numeric then 'healthy'::text
            when (impressions::numeric / nullif(expected_impressions, 0::numeric) * 100::numeric) < 90::numeric then 'under'::text
            when (impressions::numeric / nullif(expected_impressions, 0::numeric) * 100::numeric) > 110::numeric then 'over'::text
            else 'healthy'::text
        end as status
   from calc;


-- =============================================================
-- 4. ROW LEVEL SECURITY
--    Enable RLS, then grant access ONLY to authenticated sessions.
--    No policy for the anon role = no anonymous access at all.
--    (The service role key used by Apps Script bypasses RLS by design.)
-- =============================================================
alter table raw_reports   enable row level security;
alter table actions_taken enable row level security;

-- raw_reports: authenticated users can read (the dashboard reads via the view)
create policy "Authenticated read access"
  on raw_reports for select
  to authenticated
  using (true);

-- actions_taken: authenticated users can read and insert the audit trail
create policy "Authenticated read access"
  on actions_taken for select
  to authenticated
  using (true);

create policy "Authenticated insert access"
  on actions_taken for insert
  to authenticated
  with check (true);

-- =============================================================
-- END OF SCHEMA
-- =============================================================
