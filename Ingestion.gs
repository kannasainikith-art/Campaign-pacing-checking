/* ==================== CONFIG ==================== */
const SUPABASE_URL = "https://mfgguyfubnmjhtqnbsjt.supabase.co";
const SUPABASE_KEY = "sb_publishable_I3GcHbLfAHjMEuwrjaEABQ_Wl43XwCr";
const SUBJECT_KEYWORD = "Ad Manager Report";
const PROCESSED_LABEL = "CM-Processed";
/* ================================================== */

function ingestReports() {
  const label = getOrCreateLabel(PROCESSED_LABEL);
  const query = `subject:"${SUBJECT_KEYWORD}" has:attachment -label:${PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 20);

  Logger.log(`Found ${threads.length} unprocessed thread(s).`);

  threads.forEach((thread) => {
    const messages = thread.getMessages();
    let anyRowsIngested = false;

    messages.forEach((message) => {
      const subject = message.getSubject();
      const campaignName = extractCampaignName(subject);
      const attachments = message.getAttachments();

      attachments.forEach((attachment) => {
        const name = attachment.getName().toLowerCase();
        if (!name.endsWith(".csv")) return;

        const csvText = attachment.getDataAsString();
        const rows = parseCsv(csvText);
        const payload = rowsToSupabasePayload(rows, campaignName, message.getId());

        if (payload.length > 0) {
          insertIntoSupabase(payload);
          anyRowsIngested = true;
          Logger.log(`Ingested ${payload.length} row(s) from "${attachment.getName()}" (${campaignName})`);
        }
      });
    });

    if (anyRowsIngested) {
      thread.addLabel(label);
      Logger.log(`Labeled thread as processed: "${thread.getFirstMessageSubject()}"`);
    }
  });
}

function extractCampaignName(subject) {
  const cleaned = subject.replace(new RegExp(SUBJECT_KEYWORD + "\\s*[:\\-]?\\s*", "i"), "").trim();
  return cleaned.length > 0 ? cleaned : subject.trim();
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = (cells[i] || "").trim()));
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { cells.push(field); field = ""; }
      else { field += ch; }
    }
  }
  cells.push(field);
  return cells;
}

function toNum(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function rowsToSupabasePayload(rows, campaignName, messageId) {
  return rows
    .filter((r) => r["Order"] && r["Order"].trim().toLowerCase() !== "total")
    .map((r) => ({
      message_id: messageId,
      order_text: r["Order"] || "",
      line_item: r["Line item"] || "",
      start_date: r["Line item start date"] || null,
      end_date: r["Line item end date"] || null,
      rate: toNum(r["Line item rate"]),
      contracted_quantity: toNum(r["Line item contracted quantity"]),
      booked_revenue: toNum(r["Line item booked revenue (exclude CPD)"]),
      delivery_indicator: toNum(r["Line item delivery indicator"]),
      impressions: toNum(r["Ad server impressions"]),
      clicks: toNum(r["Ad server clicks"]),
      ctr: toNum(r["Ad server CTR"]),
      revenue: toNum(r["Revenue ($)"]),
      campaign_name: campaignName,
      advertiser: null,
    }));
}

function insertIntoSupabase(payload) {
  const SERVICE_KEY = PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_KEY");
  const res = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/raw_reports`, {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      Prefer: "return=minimal",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    Logger.log(`Supabase insert failed: ${res.getResponseCode()} ${res.getContentText()}`);
  }
}

function getOrCreateLabel(name) {
  let label = GmailApp.getUserLabelByName(name);
  if (!label) label = GmailApp.createLabel(name);
  return label;
}

/* ==================== ONE-TIME SETUP ==================== */
function createHourlyTrigger() {
  ScriptTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("ingestReports").timeBased().everyHours(6).create();
  Logger.log("Trigger created: ingestReports will run every 6 hours.");
}

function createFiveMinuteTrigger() {
  ScriptTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("ingestReports").timeBased().everyMinutes(5).create();
  Logger.log("Trigger created: ingestReports will run every 5 minutes.");
}

function ScriptTriggers() {
  return ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "ingestReports");
}

// ==== Pacing digest email ====

// ==== Pacing digest email (HTML) ====

// Edit this list to add teammates later — one line per address
const RECIPIENTS = ["kanna.sainikith@databeat.io"];  // <-- your real email
const DASHBOARD_URL = "https://kannasainikith-art.github.io/Campaign-pacing-checking/";

function sendPacingDigest() {
  const props = PropertiesService.getScriptProperties();
  const SUPABASE_URL = props.getProperty("SUPABASE_URL");
  const SERVICE_KEY = props.getProperty("SUPABASE_SERVICE_KEY");

  const url = `${SUPABASE_URL}/rest/v1/campaign_pacing?select=campaign_name,li_name,pacing,status`;
  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) {
    Logger.log("Digest fetch failed: " + res.getResponseCode() + " " + res.getContentText());
    return;
  }

  const rows = JSON.parse(res.getContentText());
  const under = rows.filter((r) => r.status === "under");
  const over = rows.filter((r) => r.status === "over");
  const totalUnhealthy = under.length + over.length;

  // Timestamp in a readable format (uses the script's timezone)
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d, yyyy 'at' h:mm a");

  // Build one table section (color-coded); returns "" if the list is empty
  function section(title, list, color) {
    if (list.length === 0) return "";
    let rowsHtml = list
      .map(
        (r) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;">${r.campaign_name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555;">${r.li_name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:${color};">${r.pacing}%</td>
        </tr>`
      )
      .join("");
    return `
      <h3 style="margin:24px 0 8px;color:${color};font-size:15px;">
        ${title} (${list.length})
      </h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#fafafa;text-align:left;">
            <th style="padding:10px 14px;font-size:12px;color:#888;text-transform:uppercase;">Campaign</th>
            <th style="padding:10px 14px;font-size:12px;color:#888;text-transform:uppercase;">Line Item</th>
            <th style="padding:10px 14px;font-size:12px;color:#888;text-transform:uppercase;text-align:right;">Pacing</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
  }

  let inner;
  if (totalUnhealthy === 0) {
    inner = `
      <div style="text-align:center;padding:32px 0;">
        <div style="font-size:40px;">✅</div>
        <p style="font-size:16px;color:#2e7d32;font-weight:600;margin:12px 0 0;">All campaigns are pacing well!!</p>
        <p style="color:#888;font-size:13px;margin:6px 0 0;">No under-pacing or over-pacing line items at this check.</p>
      </div>`;
  } else {
    inner =
      section("🔻 Under-pacing", under, "#c0392b") +
      section("🔺 Over-pacing", over, "#e67e22");
  }

  const subject =
    totalUnhealthy === 0
      ? "Campaign Pacing — All Healthy ✅"
      : `Campaign Pacing Alert — ${under.length} under, ${over.length} over`;

  const htmlBody = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#f5f6f8;padding:24px;">
    <div style="background:#1a1a2e;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;">
      <h2 style="margin:0;font-size:18px;">Campaign Pacing Digest</h2>
      <p style="margin:6px 0 0;font-size:13px;color:#b8b8d0;">${now}</p>
    </div>
    <div style="background:#fff;padding:8px 24px 24px;border-radius:0 0 10px 10px;">
      <div style="display:flex;gap:12px;margin:16px 0;">
        <div style="flex:1;background:#fdf0ee;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#c0392b;">${under.length}</div>
          <div style="font-size:12px;color:#888;">Under-pacing</div>
        </div>
        <div style="flex:1;background:#fdf6ee;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#e67e22;">${over.length}</div>
          <div style="font-size:12px;color:#888;">Over-pacing</div>
        </div>
      </div>
      ${inner}
      <div style="text-align:center;margin-top:28px;">
        <a href="${DASHBOARD_URL}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
          Open Dashboard →
        </a>
      </div>
      <p style="text-align:center;color:#aaa;font-size:11px;margin-top:20px;">
        Automated pacing check • sent every 6 hours
      </p>
    </div>
  </div>`;

  MailApp.sendEmail({
    to: RECIPIENTS.join(","),
    subject: subject,
    htmlBody: htmlBody,
  });

  Logger.log("Digest sent | under=" + under.length + " over=" + over.length);
}

function createDigestTrigger() {
  // Remove any existing digest triggers first, to avoid duplicates
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "sendPacingDigest") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("sendPacingDigest")
    .timeBased()
    .everyHours(6)
    .create();

  Logger.log("6-hour digest trigger created.");
}