import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard,
  Megaphone,
  Bell,
  CheckSquare,
  ArrowLeft,
  Search,
  ChevronRight,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Activity,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  Cell,
} from "recharts";

/* ---------------------------------------------------------------- */
/* DATA                                                               */
/* ---------------------------------------------------------------- */

const RAW_CAMPAIGNS = [
  {
    id: "summersale",
    name: "Summer Sale - Display Campaign",
    advertiser: "Acme Retail",
    objective: "Conversions",
    lineItems: [
      { id: "LI-01", name: "Homepage Takeover", audience: "Desktop", platform: "Google Ad Manager", budget: 12000, expected: 12000, spent: 11760, imp: 1470000, clicks: 1176 },
      { id: "LI-02", name: "Homepage Takeover", audience: "Mobile", platform: "Google Ad Manager", budget: 13000, expected: 13000, spent: 13390, imp: 2060000, clicks: 2266 },
      { id: "LI-03", name: "Category Page Retargeting", audience: "All Users", platform: "Google Ad Manager", budget: 14400, expected: 14400, spent: 13824, imp: 1152000, clicks: 1728 },
      { id: "LI-04", name: "Native Content Recommendation", audience: "All Users", platform: "Google Ad Manager", budget: 7200, expected: 7200, spent: 7416, imp: 824000, clicks: 906 },
    ],
  },
  {
    id: "backtoschool",
    name: "Back to School - Video Campaign",
    advertiser: "Acme Retail",
    objective: "Video Views",
    lineItems: [
      { id: "LI-01", name: "Pre-roll Video", audience: "YouTube", platform: "Google Ad Manager", budget: 18000, expected: 18000, spent: 21240, imp: 1180000, clicks: 590 },
      { id: "LI-02", name: "Pre-roll Video", audience: "Connected TV", platform: "Google Ad Manager", budget: 33000, expected: 33000, spent: 41580, imp: 1890000, clicks: 756 },
      { id: "LI-03", name: "Mid-roll Video", audience: "Mobile App", platform: "Google Ad Manager", budget: 9000, expected: 9000, spent: 12780, imp: 852000, clicks: 511 },
      { id: "LI-04", name: "Outstream Video", audience: "Desktop", platform: "Google Ad Manager", budget: 20000, expected: 20000, spent: 23400, imp: 2340000, clicks: 1638 },
      { id: "LI-05", name: "Bumper Ads", audience: "Social Placement", platform: "Google Ad Manager", budget: 16800, expected: 16800, spent: 21840, imp: 1560000, clicks: 780 },
    ],
  },
  {
    id: "holidayclearance",
    name: "Holiday Clearance - Programmatic Campaign",
    advertiser: "Acme Retail",
    objective: "Clearance Sales",
    lineItems: [
      { id: "LI-01", name: "Programmatic Display", audience: "Prospecting", platform: "Google Ad Manager", budget: 12500, expected: 12500, spent: 9375, imp: 1875000, clicks: 1125 },
      { id: "LI-02", name: "Programmatic Display", audience: "Retargeting", platform: "Google Ad Manager", budget: 6750, expected: 6750, spent: 2970, imp: 396000, clicks: 356 },
      { id: "LI-03", name: "Native Ads", audience: "In-feed", platform: "Google Ad Manager", budget: 9600, expected: 9600, spent: 6720, imp: 1120000, clicks: 1008 },
      { id: "LI-04", name: "Audio Ads", audience: "Streaming", platform: "Google Ad Manager", budget: 12100, expected: 12100, spent: 7502, imp: 682000, clicks: 341 },
      { id: "LI-05", name: "Rich Media", audience: "Interstitial", platform: "Google Ad Manager", budget: 23400, expected: 23400, spent: 18720, imp: 1440000, clicks: 1440 },
      { id: "LI-06", name: "Programmatic Display", audience: "Lookalike Audiences", platform: "Google Ad Manager", budget: 4550, expected: 4550, spent: 2275, imp: 350000, clicks: 245 },
    ],
  },
];

function pacingOf(spent, expected) {
  return expected > 0 ? Math.round((spent / expected) * 1000) / 10 : 0;
}
function statusOf(pacing) {
  if (pacing < 90) return "under";
  if (pacing > 110) return "over";
  return "healthy";
}

const CAMPAIGNS = RAW_CAMPAIGNS.map((c) => {
  const lineItems = c.lineItems.map((li) => {
    const pacing = pacingOf(li.spent, li.expected);
    return { ...li, pacing, status: statusOf(pacing) };
  });
  const budget = lineItems.reduce((s, li) => s + li.budget, 0);
  const spent = lineItems.reduce((s, li) => s + li.spent, 0);
  const expected = lineItems.reduce((s, li) => s + li.expected, 0);
  const pacing = pacingOf(spent, expected);
  return { ...c, lineItems, budget, spent, expected, pacing, status: statusOf(pacing) };
});

const STATUS_META = {
  healthy: { label: "Healthy", color: "var(--healthy)", soft: "var(--healthy-soft)", Icon: CheckCircle2 },
  under: { label: "Under-pacing", color: "var(--under)", soft: "var(--under-soft)", Icon: AlertTriangle },
  over: { label: "Over-pacing", color: "var(--over)", soft: "var(--over-soft)", Icon: Activity },
};

function fmtMoney(n) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n}`;
}
function fmtNum(n) {
  return n.toLocaleString("en-US");
}

/* Alerts derived from non-healthy line items, newest first */
const ALERTS = [];
CAMPAIGNS.forEach((c) => {
  c.lineItems.forEach((li) => {
    if (li.status !== "healthy") {
      ALERTS.push({
        id: `${c.id}-${li.id}`,
        campaignId: c.id,
        campaignName: c.name,
        lineItemId: li.id,
        lineItemLabel: `${li.id} · ${li.name} · ${li.audience}`,
        status: li.status,
        pacing: li.pacing,
      });
    }
  });
});
// give each a descending pseudo-timestamp, most "recent" first
const NOW = Date.now();
ALERTS.forEach((a, i) => {
  a.timestamp = NOW - i * 11 * 60 * 1000;
});

function timeLabel(ts) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/* Suggestion generator */
function getSuggestions(campaign, li) {
  if (li.status === "under") {
    const gap = li.expected - li.spent;
    return [
      {
        title: "Increase daily budget cap by 40%",
        description: `Raise the daily budget limit to accelerate delivery and compensate for the ${fmtMoney(gap)} underspend. This allows ${li.platform}'s algorithm to serve ads more aggressively to the target audience.`,
        impact: "Close pacing gap to 85–90% within 5–7 days",
      },
      {
        title: "Expand audience targeting",
        description: `Widen the audience definition — age range, interests, or lookalike percentage — to increase the pool of available impressions on ${li.platform}.`,
        impact: "Increase delivery volume by 20–30% within 3–5 days",
      },
      {
        title: "Raise bid by 15%",
        description: `Increase the max bid or bid cap on this placement to win more auctions against competing advertisers.`,
        impact: "Improve auction win rate and close pacing gap within 4–6 days",
      },
    ];
  }
  const excess = li.spent - li.expected;
  return [
    {
      title: "Reduce daily budget cap by 25%",
      description: `Lower the daily budget limit to slow delivery velocity and avoid exhausting the ${fmtMoney(li.budget)} budget before the flight ends. Current overspend is ${fmtMoney(excess)} against expected pace.`,
      impact: "Bring pacing back to 95–105% within 2–3 days",
    },
    {
      title: "Add a frequency cap",
      description: `Limit impressions to 3 per user per week on ${li.platform} to reduce delivery speed while preserving reach.`,
      impact: "Reduce delivery rate by 15–20% within 3–4 days",
    },
    {
      title: "Pause for 48 hours",
      description: `Temporarily pause this line item so pacing can realign with the rest of the flight before resuming delivery.`,
      impact: "Reset pacing to on-target range immediately upon resume",
    },
  ];
}

/* ---------------------------------------------------------------- */
/* SMALL PRESENTATIONAL PIECES                                        */
/* ---------------------------------------------------------------- */

function PulseMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="9" fill="url(#pmGrad)" />
      <path
        d="M5 17h4l2.2-6 3.4 12 2.6-9.5L19 17h3.2l2 3h2.8"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <defs>
        <linearGradient id="pmGrad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#12A5A6" />
          <stop offset="1" stopColor="#0B6E70" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PulseDivider() {
  return (
    <svg viewBox="0 0 400 20" preserveAspectRatio="none" className="cm-pulse-divider">
      <path
        d="M0 10 H150 L162 2 L172 18 L182 10 H400"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function StatusBadge({ status, size = "md" }) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  return (
    <span
      className={`cm-badge cm-badge-${size}`}
      style={{ color: meta.color, background: meta.soft, borderColor: meta.color + "33" }}
    >
      <Icon size={size === "sm" ? 12 : 13} strokeWidth={2.3} />
      {meta.label}
    </span>
  );
}

function LiveBadge() {
  return (
    <span className="cm-live">
      <span className="cm-live-dot">
        <span className="cm-live-ping" />
      </span>
      LIVE · updated moments ago
    </span>
  );
}

function PacingBar({ pacing, status }) {
  const meta = STATUS_META[status];
  const width = Math.max(4, Math.min(100, pacing));
  return (
    <div className="cm-pacingbar-track">
      <div className="cm-pacingbar-fill" style={{ width: `${width}%`, background: meta.color }} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* NAVIGATION SHELL                                                    */
/* ---------------------------------------------------------------- */

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "campaigns", label: "Campaigns", Icon: Megaphone },
  { key: "alerts", label: "Alerts", Icon: Bell },
  { key: "actions", label: "Actions Taken", Icon: CheckSquare },
];

function Sidebar({ view, setView, alertCount, actionsCount }) {
  return (
    <aside className="cm-sidebar">
      <div className="cm-brand">
        <PulseMark />
        <div className="cm-brand-text">
          <span className="cm-brand-name">Campaign Manager</span>
          <span className="cm-brand-version">V1.0</span>
        </div>
      </div>

      <div className="cm-nav-label">Workspace</div>
      <nav className="cm-nav">
        {NAV_ITEMS.map(({ key, label, Icon }) => {
          const count = key === "alerts" ? alertCount : key === "actions" ? actionsCount : null;
          const active = view === key || (key === "campaigns" && view === "campaignDetail");
          return (
            <button
              key={key}
              className={`cm-nav-item ${active ? "is-active" : ""}`}
              onClick={() => setView(key)}
            >
              <Icon size={17} strokeWidth={2} />
              <span>{label}</span>
              {count != null && <span className="cm-nav-count">{count}</span>}
            </button>
          );
        })}
      </nav>

      <div className="cm-sidebar-footer">
        <div className="cm-signed-in">Signed in as</div>
        <div className="cm-signed-email">ops@campaignmanager.io</div>
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- */
/* DASHBOARD                                                           */
/* ---------------------------------------------------------------- */

function Dashboard({ goToCampaign, setView }) {
  const totalBudget = CAMPAIGNS.reduce((s, c) => s + c.budget, 0);
  const totalSpent = CAMPAIGNS.reduce((s, c) => s + c.spent, 0);
  const totalExpected = CAMPAIGNS.reduce((s, c) => s + c.expected, 0);
  const overallPacing = pacingOf(totalSpent, totalExpected);
  const campaignStatusCounts = { healthy: 0, under: 0, over: 0 };
  CAMPAIGNS.forEach((c) => campaignStatusCounts[c.status]++);

  const allLineItems = CAMPAIGNS.flatMap((c) => c.lineItems);
  const liCounts = { healthy: 0, under: 0, over: 0 };
  allLineItems.forEach((li) => liCounts[li.status]++);
  const total = allLineItems.length;

  const chartData = CAMPAIGNS.map((c) => ({
    name: c.name.split(" ").slice(0, 2).join(" "),
    pacing: c.pacing,
    status: c.status,
  }));

  return (
    <div>
      <PageHeader
        title="Pacing Overview"
        subtitle="Real-time delivery health across all active campaigns and line items."
        right={<LiveBadge />}
      />

      <div className="cm-stat-grid">
        <StatCard label="Total Budget" value={fmtMoney(totalBudget)} sub={`Spent ${fmtMoney(totalSpent)}`} />
        <StatCard
          label="Overall Pacing"
          value={`${overallPacing}%`}
          sub="vs expected today"
          valueColor="var(--healthy)"
        />
        <StatCard label="Active Campaigns" value={CAMPAIGNS.length} sub={`${total} line items`} />
        <StatCard
          label="Open Alerts"
          value={ALERTS.length}
          sub="requires attention"
          valueColor="var(--under)"
        />
      </div>

      <div className="cm-section-label">Campaign Health</div>
      <div className="cm-health-grid">
        {["healthy", "under", "over"].map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.Icon;
          return (
            <div className="cm-card cm-health-card" key={s}>
              <div className="cm-health-icon" style={{ background: meta.soft, color: meta.color }}>
                <Icon size={18} strokeWidth={2.2} />
              </div>
              <div>
                <div className="cm-eyebrow">{meta.label === "Healthy" ? "Healthy" : meta.label}</div>
                <div className="cm-health-count">{campaignStatusCounts[s]}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cm-two-col">
        <div className="cm-card cm-chart-card">
          <div className="cm-card-title">Campaign Pacing (%)</div>
          <div className="cm-card-sub">100% = on-pace · reference band 90–110%</div>
          <div style={{ width: "100%", height: 260, marginTop: 16 }}>
            <ResponsiveContainer minWidth={300} minHeight={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
                  axisLine={{ stroke: "var(--border-strong)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReferenceLine y={90} stroke="var(--border-strong)" strokeDasharray="4 4" />
                <ReferenceLine y={110} stroke="var(--border-strong)" strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  contentStyle={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v) => [`${v}%`, "Pacing"]}
                />
                <Bar dataKey="pacing" radius={[4, 4, 0, 0]} maxBarSize={46}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={STATUS_META[d.status].color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="cm-card">
          <div className="cm-card-title">Line Item Health</div>
          <div className="cm-card-sub">Distribution across all line items</div>
          <div className="cm-li-health-list">
            {["healthy", "under", "over"].map((s) => {
              const meta = STATUS_META[s];
              const count = liCounts[s];
              const pct = Math.round((count / total) * 100);
              return (
                <div key={s} className="cm-li-health-row">
                  <div className="cm-li-health-top">
                    <span className="cm-dot-label" style={{ color: meta.color }}>
                      <span className="cm-dot" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="cm-li-health-num">
                      {count} <span className="cm-ink-3">({pct}%)</span>
                    </span>
                  </div>
                  <div className="cm-pacingbar-track">
                    <div className="cm-pacingbar-fill" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <button className="cm-link-btn" onClick={() => setView("alerts")}>
            View all alerts <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, valueColor }) {
  return (
    <div className="cm-card cm-stat-card">
      <div className="cm-eyebrow">{label}</div>
      <div className="cm-stat-value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      <div className="cm-stat-sub">{sub}</div>
    </div>
  );
}

function PageHeader({ title, subtitle, right, back }) {
  return (
    <div className="cm-page-header">
      {back}
      <div className="cm-page-header-row">
        <div>
          <h1 className="cm-page-title">{title}</h1>
          <p className="cm-page-subtitle">{subtitle}</p>
        </div>
        {right}
      </div>
      <PulseDivider />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* CAMPAIGNS LIST                                                     */
/* ---------------------------------------------------------------- */

function CampaignsList({ goToCampaign }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openFilter, setOpenFilter] = useState(false);

  const filtered = CAMPAIGNS.filter((c) => {
    const matchesQuery =
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.advertiser.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const filterLabel =
    statusFilter === "all" ? "All statuses" : STATUS_META[statusFilter].label;

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Every active campaign with real-time pacing and delivery signals."
      />

      <div className="cm-toolbar">
        <div className="cm-search">
          <Search size={16} color="var(--ink-3)" />
          <input
            placeholder="Search campaigns or advertisers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="cm-select-wrap">
          <button className="cm-select" onClick={() => setOpenFilter((o) => !o)}>
            {filterLabel}
            <ChevronDown size={15} />
          </button>
          {openFilter && (
            <div className="cm-select-menu">
              {["all", "healthy", "under", "over"].map((s) => (
                <button
                  key={s}
                  className="cm-select-option"
                  onClick={() => {
                    setStatusFilter(s);
                    setOpenFilter(false);
                  }}
                >
                  {s === "all" ? "All statuses" : STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="cm-card cm-table-card">
        <div className="cm-table-head cm-campaigns-cols">
          <span>Campaign</span>
          <span>Advertiser</span>
          <span>Budget · Spent</span>
          <span>Pacing</span>
          <span>Status</span>
        </div>
        {filtered.length === 0 && (
          <div className="cm-empty">No campaigns match your search.</div>
        )}
        {filtered.map((c) => (
          <button key={c.id} className="cm-table-row cm-campaigns-cols" onClick={() => goToCampaign(c.id)}>
            <span>
              <div className="cm-row-title">{c.name}</div>
              <div className="cm-row-sub">
                {c.lineItems.length} line items ·{" "}
                {c.lineItems.filter((li) => li.status === "under").length} under ·{" "}
                {c.lineItems.filter((li) => li.status === "over").length} over
              </div>
            </span>
            <span>
              <div className="cm-row-title">{c.advertiser}</div>
              <div className="cm-row-sub">{c.objective}</div>
            </span>
            <span>
              <div className="cm-row-title cm-mono">{fmtMoney(c.budget)}</div>
              <div className="cm-row-sub cm-mono">{fmtMoney(c.spent)} spent</div>
            </span>
            <span>
              <div className="cm-row-title cm-mono">
                {c.pacing}%{" "}
                <span className="cm-row-sub" style={{ fontWeight: 400 }}>
                  exp {fmtMoney(c.expected)}
                </span>
              </div>
              <PacingBar pacing={c.pacing} status={c.status} />
            </span>
            <span>
              <StatusBadge status={c.status} size="sm" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* CAMPAIGN DETAIL                                                     */
/* ---------------------------------------------------------------- */

function CampaignDetail({ campaign, goBack, openAction, highlightLineItemId, approvedMap }) {
  const rowRefs = useRef({});

  useEffect(() => {
    if (highlightLineItemId && rowRefs.current[highlightLineItemId]) {
      rowRefs.current[highlightLineItemId].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightLineItemId]);

  return (
    <div>
      <div className="cm-page-header">
        <button className="cm-back-link" onClick={goBack}>
          <ArrowLeft size={15} /> Back to campaigns
        </button>
        <div className="cm-page-header-row">
          <div>
            <h1 className="cm-page-title">{campaign.name}</h1>
            <p className="cm-page-subtitle">
              {campaign.advertiser} · {campaign.objective}
            </p>
          </div>
          <StatusBadge status={campaign.status} />
        </div>
        <PulseDivider />
      </div>

      <div className="cm-stat-grid cm-stat-grid-4">
        <StatCard label="Budget" value={fmtMoney(campaign.budget)} sub=" " />
        <StatCard label="Spent" value={fmtMoney(campaign.spent)} sub={`Expected ${fmtMoney(campaign.expected)}`} />
        <StatCard
          label="Pacing"
          value={`${campaign.pacing}%`}
          sub=" "
          valueColor={STATUS_META[campaign.status].color}
        />
        <StatCard label="Line Items" value={campaign.lineItems.length} sub=" " />
      </div>

      <div className="cm-section-label-row">
        <span className="cm-section-label">Line Items</span>
        <span className="cm-ink-3 cm-mono" style={{ fontSize: 12 }}>{campaign.lineItems.length} total</span>
      </div>

      <div className="cm-card cm-table-card">
        <div className="cm-table-head cm-lineitems-cols">
          <span>Line Item</span>
          <span>Delivery</span>
          <span>Pacing</span>
          <span>Status</span>
          <span>Action</span>
        </div>
        {campaign.lineItems.map((li) => {
          const key = `${campaign.id}-${li.id}`;
          const approved = approvedMap[key];
          return (
            <div
              key={li.id}
              ref={(el) => (rowRefs.current[li.id] = el)}
              className={`cm-table-row cm-lineitems-cols ${highlightLineItemId === li.id ? "is-highlighted" : ""}`}
            >
              <span>
                <div className="cm-row-title">
                  {li.id} · {li.name} · {li.audience}
                </div>
                <div className="cm-row-sub">
                  {li.platform} · Budget {fmtMoney(li.budget)}
                </div>
              </span>
              <span>
                <div className="cm-row-title cm-mono">{fmtNum(li.imp)} imp</div>
                <div className="cm-row-sub cm-mono">{fmtNum(li.clicks)} clicks</div>
              </span>
              <span>
                <div className="cm-row-title cm-mono">{li.pacing}%</div>
                <div className="cm-row-sub cm-mono">
                  {fmtMoney(li.spent)} / {fmtMoney(li.expected)}
                </div>
                <PacingBar pacing={li.pacing} status={li.status} />
              </span>
              <span>
                <StatusBadge status={li.status} size="sm" />
              </span>
              <span>
                {li.status === "healthy" ? (
                  <span className="cm-ink-3" style={{ fontSize: 13 }}>—</span>
                ) : (
                  <div className="cm-action-cell">
                    <button className="cm-take-action-btn" onClick={() => openAction(campaign, li)}>
                      <Sparkles size={14} /> Take Action
                    </button>
                    {approved && (
                      <span className="cm-approved-tag">
                        <CheckCircle2 size={12} /> Action approved
                      </span>
                    )}
                  </div>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* ALERTS                                                              */
/* ---------------------------------------------------------------- */

function AlertsPage({ goToLineItem }) {
  const under = ALERTS.filter((a) => a.status === "under").length;
  const over = ALERTS.filter((a) => a.status === "over").length;

  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle="Pacing anomalies requiring intervention. Click any alert to jump to the line item."
      />
      <div className="cm-stat-grid cm-stat-grid-3">
        <StatCard label="Total Alerts" value={ALERTS.length} sub=" " />
        <StatCard label="Under-pacing" value={under} sub=" " valueColor="var(--under)" />
        <StatCard label="Over-pacing" value={over} sub=" " valueColor="var(--over)" />
      </div>

      <div className="cm-card cm-alert-card">
        {ALERTS.map((a) => {
          const meta = STATUS_META[a.status];
          const Icon = meta.Icon;
          return (
            <button key={a.id} className="cm-alert-row" onClick={() => goToLineItem(a.campaignId, a.lineItemId)}>
              <div className="cm-alert-icon" style={{ background: meta.soft, color: meta.color }}>
                <Icon size={16} strokeWidth={2.2} />
              </div>
              <div className="cm-alert-body">
                <div className="cm-alert-top">
                  <StatusBadge status={a.status} size="sm" />
                  <span className="cm-mono cm-ink-3" style={{ fontSize: 12 }}>{timeLabel(a.timestamp)}</span>
                </div>
                <div className="cm-alert-text">
                  {a.lineItemLabel} is at {a.pacing.toFixed(1)}% of expected pace — {a.status === "under" ? "underpacing" : "overpacing"}.
                </div>
                <div className="cm-alert-campaign">Campaign: <span>{a.campaignName}</span></div>
              </div>
              <ChevronRight size={16} color="var(--ink-3)" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* ACTIONS TAKEN                                                       */
/* ---------------------------------------------------------------- */

function ActionsTakenPage({ actions }) {
  return (
    <div>
      <PageHeader
        title="Actions Taken"
        subtitle="Audit trail of every approved pacing intervention."
      />
      {actions.length === 0 ? (
        <div className="cm-card cm-empty-state">
          <CheckSquare size={22} color="var(--ink-3)" />
          <div className="cm-empty-title">No actions taken yet</div>
          <div className="cm-empty-sub">
            Approve a suggested action from an alert or a campaign's line items and it will show up here.
          </div>
        </div>
      ) : (
        <div className="cm-actions-list">
          {actions.map((a) => (
            <div className="cm-card cm-action-item" key={a.id}>
              <div className="cm-action-icon">
                <CheckCircle2 size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="cm-action-top">
                  <span className="cm-action-title">{a.title}</span>
                  <StatusBadge status={a.liStatus} size="sm" />
                </div>
                <div className="cm-action-desc">{a.description}</div>
                <div className="cm-action-impact">
                  <span className="cm-dot" style={{ background: "var(--healthy)" }} />
                  Expected impact: {a.impact}
                </div>
                <div className="cm-action-meta">
                  <span className="cm-mono">{timeLabel(a.timestamp)}</span>
                  <span className="cm-action-sep">·</span>
                  <span>{a.campaignName}</span>
                  <ChevronRight size={12} style={{ margin: "0 2px" }} />
                  <span className="cm-mono">{a.lineItemId} · {a.lineItemName}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* TAKE ACTION MODAL                                                   */
/* ---------------------------------------------------------------- */

function TakeActionModal({ campaign, lineItem, onClose, onApprove }) {
  const suggestions = useMemo(() => getSuggestions(campaign, lineItem), [campaign, lineItem]);
  const [selected, setSelected] = useState(0);

  return (
    <div className="cm-modal-overlay" onClick={onClose}>
      <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cm-modal-header">
          <div>
            <div className="cm-modal-eyebrow">
              <Sparkles size={13} /> Suggested actions
            </div>
            <div className="cm-modal-title">
              {lineItem.id} · {lineItem.name} · {lineItem.audience}
            </div>
            <div className="cm-modal-sub">
              {campaign.name} · currently at{" "}
              <span style={{ color: STATUS_META[lineItem.status].color, fontWeight: 600 }}>
                {lineItem.pacing}%
              </span>{" "}
              of expected pace
            </div>
          </div>
          <button className="cm-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="cm-modal-body">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className={`cm-suggestion ${selected === i ? "is-selected" : ""}`}
              onClick={() => setSelected(i)}
            >
              <div className="cm-suggestion-radio">
                <span className={`cm-radio-dot ${selected === i ? "is-on" : ""}`} />
              </div>
              <div>
                <div className="cm-suggestion-title">{s.title}</div>
                <div className="cm-suggestion-desc">{s.description}</div>
                <div className="cm-suggestion-impact">
                  <span className="cm-dot" style={{ background: "var(--healthy)" }} />
                  Expected impact: {s.impact}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="cm-modal-footer">
          <button className="cm-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="cm-btn-primary" onClick={() => onApprove(suggestions[selected])}>
            <CheckCircle2 size={15} /> Approve action
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* ROOT APP                                                            */
/* ---------------------------------------------------------------- */

export default function App() {
  useEffect(() => {
    const link1 = document.createElement("link");
    link1.rel = "stylesheet";
    link1.href =
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link1);
    return () => document.head.removeChild(link1);
  }, []);

  const [view, setViewRaw] = useState("dashboard");
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [highlightLineItemId, setHighlightLineItemId] = useState(null);
  const [modalCtx, setModalCtx] = useState(null); // { campaign, lineItem }
  const [actions, setActions] = useState([]);
  const [approvedMap, setApprovedMap] = useState({});
  const [toast, setToast] = useState(null);

  function setView(v) {
    setHighlightLineItemId(null);
    setViewRaw(v);
  }

  function goToCampaign(id) {
    setSelectedCampaignId(id);
    setHighlightLineItemId(null);
    setViewRaw("campaignDetail");
  }

  function goToLineItem(campaignId, lineItemId) {
    setSelectedCampaignId(campaignId);
    setHighlightLineItemId(lineItemId);
    setViewRaw("campaignDetail");
  }

  function openAction(campaign, lineItem) {
    setModalCtx({ campaign, lineItem });
  }

  function approveAction(suggestion) {
    const { campaign, lineItem } = modalCtx;
    const record = {
      id: `${Date.now()}`,
      title: suggestion.title,
      description: suggestion.description,
      impact: suggestion.impact,
      liStatus: lineItem.status,
      campaignName: campaign.name,
      lineItemId: lineItem.id,
      lineItemName: lineItem.name,
      timestamp: Date.now(),
    };
    setActions((prev) => [record, ...prev]);
    setApprovedMap((prev) => ({ ...prev, [`${campaign.id}-${lineItem.id}`]: true }));
    setModalCtx(null);
    setToast("Action approved and saved to your audit trail.");
    setTimeout(() => setToast(null), 3200);
  }

  const selectedCampaign = CAMPAIGNS.find((c) => c.id === selectedCampaignId);

  return (
    <div className="cm-root">
      <style>{CSS}</style>
      <Sidebar view={view} setView={setView} alertCount={ALERTS.length} actionsCount={actions.length} />
      <main className="cm-main">
        {view === "dashboard" && <Dashboard goToCampaign={goToCampaign} setView={setView} />}
        {view === "campaigns" && <CampaignsList goToCampaign={goToCampaign} />}
        {view === "campaignDetail" && selectedCampaign && (
          <CampaignDetail
            campaign={selectedCampaign}
            goBack={() => setView("campaigns")}
            openAction={openAction}
            highlightLineItemId={highlightLineItemId}
            approvedMap={approvedMap}
          />
        )}
        {view === "alerts" && <AlertsPage goToLineItem={goToLineItem} />}
        {view === "actions" && <ActionsTakenPage actions={actions} />}
      </main>

      {modalCtx && (
        <TakeActionModal
          campaign={modalCtx.campaign}
          lineItem={modalCtx.lineItem}
          onClose={() => setModalCtx(null)}
          onApprove={approveAction}
        />
      )}

      {toast && (
        <div className="cm-toast">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* CSS                                                                 */
/* ---------------------------------------------------------------- */

const CSS = `
.cm-root {
  --bg: #F5F6F8;
  --surface: #FFFFFF;
  --surface-2: #FAFBFC;
  --border: #E5E8EC;
  --border-strong: #D6DAE1;
  --ink: #12151B;
  --ink-2: #5B616E;
  --ink-3: #9AA1AC;
  --accent: #0F8B8D;
  --accent-soft: #E4F5F5;
  --healthy: #17915F;
  --healthy-soft: #E4F6EE;
  --under: #D8402F;
  --under-soft: #FCEBE9;
  --over: #BD7514;
  --over-soft: #FBF0DC;
  --radius: 10px;
  --shadow: 0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.05);
  --font-display: 'Space Grotesk', 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  display: flex;
  min-height: 100vh;
  width: 100%;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}
.cm-root * { box-sizing: border-box; }
.cm-root button { font-family: inherit; cursor: pointer; }
.cm-mono { font-family: var(--font-mono) !important; }
.cm-ink-3 { color: var(--ink-3); }

/* Sidebar */
.cm-sidebar {
  width: 240px;
  min-width: 240px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
}
.cm-brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 20px; }
.cm-brand-text { display: flex; flex-direction: column; }
.cm-brand-name { font-family: var(--font-display); font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
.cm-brand-version { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-3); }
.cm-nav-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; color: var(--ink-3); padding: 8px 10px 8px; text-transform: uppercase; }
.cm-nav { display: flex; flex-direction: column; gap: 2px; }
.cm-nav-item {
  display: flex; align-items: center; gap: 10px;
  background: transparent; border: none; text-align: left;
  padding: 9px 10px; border-radius: 8px; color: var(--ink-2);
  font-size: 13.5px; font-weight: 500; width: 100%;
  transition: background .12s ease, color .12s ease;
}
.cm-nav-item:hover { background: var(--surface-2); color: var(--ink); }
.cm-nav-item.is-active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.cm-nav-count {
  margin-left: auto; font-family: var(--font-mono); font-size: 11px;
  background: var(--bg); color: var(--ink-2); border: 1px solid var(--border);
  padding: 1px 6px; border-radius: 999px;
}
.cm-nav-item.is-active .cm-nav-count { background: #fff; color: var(--accent); border-color: transparent; }
.cm-sidebar-footer { margin-top: auto; padding: 12px 10px 0; border-top: 1px solid var(--border); }
.cm-signed-in { font-size: 10.5px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; margin-top:10px;}
.cm-signed-email { font-size: 12.5px; color: var(--ink-2); font-family: var(--font-mono); margin-top: 2px; }

/* Main */
.cm-main { flex: 1; padding: 32px 40px 60px; max-width: 1180px; }

/* Page header */
.cm-page-header { margin-bottom: 24px; }
.cm-page-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.cm-page-title { font-family: var(--font-display); font-size: 30px; font-weight: 700; letter-spacing: -0.015em; margin: 0 0 6px; }
.cm-page-subtitle { color: var(--ink-2); font-size: 14px; margin: 0; }
.cm-pulse-divider { width: 100%; height: 14px; margin-top: 18px; }
.cm-back-link {
  display: inline-flex; align-items: center; gap: 6px; background: none; border: none;
  color: var(--ink-2); font-size: 13px; padding: 0; margin-bottom: 14px; font-weight: 500;
}
.cm-back-link:hover { color: var(--ink); }

.cm-live {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid var(--border); background: var(--surface);
  padding: 7px 12px; border-radius: 999px; font-family: var(--font-mono);
  font-size: 12px; color: var(--ink-2); white-space: nowrap; height: fit-content;
}
.cm-live-dot { position: relative; width: 7px; height: 7px; border-radius: 50%; background: var(--healthy); display:inline-block; }
.cm-live-ping { position: absolute; inset: -4px; border-radius: 50%; background: var(--healthy); opacity: .35; animation: cmPing 1.8s cubic-bezier(0,0,0.2,1) infinite; }
@keyframes cmPing { 0% { transform: scale(0.6); opacity: .5; } 100% { transform: scale(2.2); opacity: 0; } }

/* Stat cards */
.cm-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px 20px; }
.cm-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
.cm-stat-grid-4 { grid-template-columns: repeat(4, 1fr); }
.cm-stat-grid-3 { grid-template-columns: repeat(3, 1fr); }
.cm-stat-card { display: flex; flex-direction: column; gap: 4px; }
.cm-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); }
.cm-stat-value { font-family: var(--font-display); font-size: 28px; font-weight: 700; letter-spacing: -0.01em; margin-top: 2px; }
.cm-stat-sub { font-size: 12.5px; color: var(--ink-3); font-family: var(--font-mono); }

/* Health cards */
.cm-section-label { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); margin: 4px 0 12px; }
.cm-section-label-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 30px; }
.cm-health-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
.cm-health-card { display: flex; align-items: center; gap: 14px; }
.cm-health-icon { width: 38px; height: 38px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cm-health-count { font-family: var(--font-display); font-size: 24px; font-weight: 700; }

/* Two column layout */
.cm-two-col { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; align-items: start; }
.cm-card-title { font-family: var(--font-display); font-weight: 600; font-size: 16px; }
.cm-card-sub { color: var(--ink-3); font-size: 12.5px; margin-top: 2px; }

.cm-li-health-list { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }
.cm-li-health-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.cm-dot-label { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; }
.cm-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.cm-li-health-num { font-family: var(--font-mono); font-size: 12.5px; font-weight: 600; }
.cm-link-btn {
  display: inline-flex; align-items: center; gap: 4px; background: none; border: none;
  color: var(--accent); font-size: 13px; font-weight: 600; padding: 0; margin-top: 18px;
}

/* Pacing bar */
.cm-pacingbar-track { width: 100%; height: 5px; border-radius: 999px; background: var(--border); margin-top: 6px; overflow: hidden; }
.cm-pacingbar-fill { height: 100%; border-radius: 999px; transition: width .3s ease; }

/* Toolbar (search + filter) */
.cm-toolbar { display: flex; gap: 12px; margin-bottom: 18px; }
.cm-search {
  flex: 1; display: flex; align-items: center; gap: 8px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 9px; padding: 10px 14px;
}
.cm-search input { border: none; outline: none; background: none; width: 100%; font-size: 13.5px; color: var(--ink); }
.cm-search input::placeholder { color: var(--ink-3); }
.cm-select-wrap { position: relative; }
.cm-select {
  display: flex; align-items: center; gap: 8px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 9px; padding: 10px 14px; font-size: 13.5px; color: var(--ink-2); white-space: nowrap;
}
.cm-select-menu {
  position: absolute; right: 0; top: calc(100% + 6px); background: var(--surface);
  border: 1px solid var(--border); border-radius: 9px; box-shadow: var(--shadow); overflow: hidden; z-index: 20; min-width: 160px;
}
.cm-select-option { display: block; width: 100%; text-align: left; padding: 9px 14px; background: none; border: none; font-size: 13px; color: var(--ink-2); }
.cm-select-option:hover { background: var(--surface-2); color: var(--ink); }

/* Table */
.cm-table-card { padding: 0; overflow: hidden; }
.cm-table-head, .cm-table-row { display: grid; align-items: center; padding: 14px 20px; }
.cm-table-head {
  font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3);
  border-bottom: 1px solid var(--border); background: var(--surface-2);
}
.cm-table-row {
  border-bottom: 1px solid var(--border); background: none; text-align: left; width: 100%;
  transition: background .12s ease;
}
.cm-table-row:last-child { border-bottom: none; }
button.cm-table-row:hover { background: var(--surface-2); }
.cm-table-row.is-highlighted { background: var(--accent-soft); animation: cmHighlight 1.6s ease 2; }
@keyframes cmHighlight { 0%,100% { background: var(--accent-soft); } 50% { background: transparent; } }
.cm-campaigns-cols { grid-template-columns: 2.1fr 1.3fr 1.2fr 1.4fr 1fr; gap: 16px; }
.cm-lineitems-cols { grid-template-columns: 2fr 1.3fr 1.3fr 1fr 1.4fr; gap: 16px; }
.cm-row-title { font-size: 13.5px; font-weight: 600; color: var(--ink); }
.cm-row-sub { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
.cm-empty { padding: 32px 20px; text-align: center; color: var(--ink-3); font-size: 13.5px; }

/* Badges */
.cm-badge {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600;
  padding: 4px 9px; border-radius: 999px; border: 1px solid; white-space: nowrap;
}
.cm-badge-sm { font-size: 11.5px; padding: 3px 8px; }

/* Take action */
.cm-action-cell { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.cm-take-action-btn {
  display: inline-flex; align-items: center; gap: 6px; background: var(--accent); color: #fff;
  border: none; padding: 7px 12px; border-radius: 7px; font-size: 12.5px; font-weight: 600;
  box-shadow: 0 1px 2px rgba(15,139,141,0.25);
}
.cm-take-action-btn:hover { background: #0C7273; }
.cm-approved-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--healthy); font-weight: 600; }

/* Alerts */
.cm-alert-card { padding: 0; overflow: hidden; }
.cm-alert-row {
  display: flex; align-items: flex-start; gap: 14px; width: 100%; text-align: left;
  background: none; border: none; border-bottom: 1px solid var(--border); padding: 16px 20px;
}
.cm-alert-row:last-child { border-bottom: none; }
.cm-alert-row:hover { background: var(--surface-2); }
.cm-alert-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
.cm-alert-body { flex: 1; }
.cm-alert-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.cm-alert-text { font-size: 13.5px; color: var(--ink); font-weight: 500; line-height: 1.45; }
.cm-alert-campaign { font-size: 12px; color: var(--ink-3); margin-top: 4px; }
.cm-alert-campaign span { color: var(--ink-2); font-weight: 500; }

/* Actions taken */
.cm-actions-list { display: flex; flex-direction: column; gap: 12px; }
.cm-action-item { display: flex; gap: 14px; align-items: flex-start; }
.cm-action-icon { width: 34px; height: 34px; border-radius: 9px; background: var(--healthy-soft); color: var(--healthy); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cm-action-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.cm-action-title { font-weight: 700; font-size: 14.5px; font-family: var(--font-display); }
.cm-action-desc { font-size: 13px; color: var(--ink-2); line-height: 1.5; }
.cm-action-impact { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--healthy); font-weight: 600; margin-top: 8px; }
.cm-action-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-3); margin-top: 10px; flex-wrap: wrap; }
.cm-action-sep { color: var(--border-strong); }
.cm-empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 48px 20px; }
.cm-empty-title { font-weight: 700; font-family: var(--font-display); font-size: 15px; }
.cm-empty-sub { color: var(--ink-3); font-size: 13px; max-width: 360px; }

/* Modal */
.cm-modal-overlay {
  position: fixed; inset: 0; background: rgba(15,20,26,0.4); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px;
}
.cm-modal {
  background: var(--surface); border-radius: 14px; width: 100%; max-width: 560px;
  max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(16,24,40,0.25);
}
.cm-modal-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 22px 22px 16px; border-bottom: 1px solid var(--border); }
.cm-modal-eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
.cm-modal-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; }
.cm-modal-sub { font-size: 12.5px; color: var(--ink-2); margin-top: 4px; }
.cm-modal-close { background: none; border: none; color: var(--ink-3); padding: 4px; }
.cm-modal-close:hover { color: var(--ink); }
.cm-modal-body { padding: 16px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.cm-suggestion {
  display: flex; gap: 12px; text-align: left; padding: 14px; border: 1.5px solid var(--border);
  border-radius: 10px; background: var(--surface-2); width: 100%;
  transition: border-color .12s ease, background .12s ease;
}
.cm-suggestion:hover { border-color: var(--border-strong); }
.cm-suggestion.is-selected { border-color: var(--accent); background: var(--accent-soft); }
.cm-suggestion-radio { padding-top: 3px; }
.cm-radio-dot { display: block; width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border-strong); position: relative; flex-shrink: 0; }
.cm-radio-dot.is-on { border-color: var(--accent); }
.cm-radio-dot.is-on::after { content: ''; position: absolute; inset: 2.5px; background: var(--accent); border-radius: 50%; }
.cm-suggestion-title { font-weight: 700; font-size: 13.5px; margin-bottom: 4px; }
.cm-suggestion-desc { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
.cm-suggestion-impact { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--healthy); font-weight: 600; margin-top: 8px; }
.cm-modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid var(--border); }
.cm-btn-ghost { background: none; border: 1px solid var(--border-strong); color: var(--ink-2); padding: 9px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; }
.cm-btn-ghost:hover { background: var(--surface-2); }
.cm-btn-primary { display: flex; align-items: center; gap: 6px; background: var(--accent); color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; }
.cm-btn-primary:hover { background: #0C7273; }

/* Toast */
.cm-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: #fff; padding: 12px 18px; border-radius: 10px;
  display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 200; animation: cmToastIn .25s ease;
}
@keyframes cmToastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

@media (max-width: 900px) {
  .cm-two-col { grid-template-columns: 1fr; }
  .cm-stat-grid, .cm-stat-grid-4, .cm-stat-grid-3, .cm-health-grid { grid-template-columns: repeat(2, 1fr); }
}
`;