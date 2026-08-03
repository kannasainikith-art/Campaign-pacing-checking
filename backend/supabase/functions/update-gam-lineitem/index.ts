const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are an ad-ops pacing diagnostic assistant for Google Ad Manager (GAM) line items.

You will receive the real current state of one line item: its goal, delivered impressions, flight dates, pacing percentage, and its real GAM settings (priority, creative status, delivery rate setting, frequency cap).

Your job: diagnose the MOST LIKELY root cause of its pacing status using the settings provided, then recommend ONE specific, actionable fix.

Diagnostic reference (use this reasoning, don't just guess generically):
- Under-pacing + low priority relative to competing line items -> likely losing the auction; recommend raising priority
- Under-pacing + tight frequency cap -> capping delivery to the same users too early; recommend loosening the frequency cap
- Under-pacing + creatives missing or not yet approved -> delivery is blocked at the creative level, not a pacing setting issue; recommend fixing/resubmitting the creative first
- Over-pacing + delivery rate set to "as fast as possible" or uncapped -> delivering too fast early in the flight; recommend switching delivery rate to evenly, or adding a daily cap
- Over-pacing + priority too high relative to goal -> cannibalizing inventory from other line items; recommend lowering priority

Only recommend changes to fields that are real GAM settings: priority, frequency cap, delivery rate, flight dates, targeting. Do not give vague or generic advice like "monitor performance" without specifying the actual change.

Respond ONLY with valid JSON matching this exact shape, no markdown formatting, no extra text:
{
  "title": "short 5-8 word summary of the issue",
  "diagnosis": "1-2 sentences naming the likely root cause, referencing the specific setting values given",
  "confidence": "high | medium | low",
  "recommended_fix": "1-2 sentences, specific and actionable, naming the exact GAM field to change and the direction",
  "expected_impact": "1 sentence on what should improve and roughly by how much, if estimable"
}`;

interface RequestInput {
  li_id: string; // the GAM line item ID (numeric string)
  li_name: string;
  campaign_name: string;
  goal: number;
  impressions_delivered: number;
  flight_start: string;
  flight_end: string;
  pacing_percent: number;
  status: "under" | "over" | "healthy" | "mixed";
}

// --- GAM auth helpers (same as test-gam-auth) ---
function base64url(input: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryDer = atob(pemBody);
  const bytes = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) bytes[i] = binaryDer.charCodeAt(i);
  return await crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getGamAccessToken(serviceAccountKey: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/admanager",
    aud: serviceAccountKey.token_uri,
    exp: now + 3600,
    iat: now,
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaims = base64url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const privateKey = await importPrivateKey(serviceAccountKey.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const tokenResponse = await fetch(serviceAccountKey.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`GAM token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// --- Fetch real line item settings from GAM ---
async function fetchGamLineItemSettings(lineItemId: string) {
  const keyJson = Deno.env.get("GAM_SERVICE_ACCOUNT_KEY");
  const networkCode = Deno.env.get("GAM_NETWORK_CODE");
  if (!keyJson || !networkCode) {
    throw new Error("Missing GAM_SERVICE_ACCOUNT_KEY or GAM_NETWORK_CODE secret");
  }
  const serviceAccountKey = JSON.parse(keyJson);
  const accessToken = await getGamAccessToken(serviceAccountKey);

  const response = await fetch(
    `https://admanager.googleapis.com/v1/networks/${networkCode}/lineItems/${lineItemId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`GAM line item fetch failed: ${JSON.stringify(data)}`);
  }

  // Extract only what we need for the diagnosis, in plain readable form
  const fcap = data.frequencyCaps?.[0];
  return {
    priority: data.priority ?? "unknown",
    delivery_setting: data.deliveryRateType ?? "unknown",
    creative_status: data.missingCreatives === false ? "creatives attached" : "creatives missing",
    frequency_cap: fcap
      ? `${fcap.maxImpressions} impressions / ${fcap.timeAmount} ${fcap.timeUnit.toLowerCase()}`
      : "no frequency cap set",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    const input = await req.json();

    const {
     li_id,
     field_to_change,
     new_value,
     } = input;

    if (!li_id) {
      return new Response(JSON.stringify({ error: "Missing required field: li_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Step 1: Fetch REAL GAM settings for this line item
    let gamSettings;
    try {
      gamSettings = await fetchGamLineItemSettings(input.li_id);
    } catch (e) {
      console.error("GAM fetch error:", e);
      return new Response(
        JSON.stringify({ error: "Failed to fetch live GAM settings", detail: String(e) }),
        { status: 502, headers: corsHeaders }
      );
    }

    // Step 2: Build the prompt with real pacing + real GAM settings
    const userContent = `Line item: ${input.li_name} (${input.li_id})
Campaign: ${input.campaign_name}
Goal (contracted impressions): ${input.goal}
Delivered impressions: ${input.impressions_delivered}
Flight: ${input.flight_start} to ${input.flight_end}
Pacing: ${input.pacing_percent}% (${input.status})

Real GAM settings (fetched live):
- Priority: ${gamSettings.priority}
- Delivery rate setting: ${gamSettings.delivery_setting}
- Creative status: ${gamSettings.creative_status}
- Frequency cap: ${gamSettings.frequency_cap}

Diagnose the root cause and recommend one specific fix.`;

    // Step 3: Call Gemini
    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", errText);
      return new Response(
        JSON.stringify({ error: "Gemini API call failed", detail: errText }),
        { status: 502, headers: corsHeaders }
      );
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "Gemini returned no content", raw: geminiData }),
        { status: 502, headers: corsHeaders }
      );
    }

    let suggestion;
    try {
      suggestion = JSON.parse(rawText);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Failed to parse Gemini response as JSON", raw: rawText }),
        { status: 502, headers: corsHeaders }
      );
    }

    // Include the real GAM settings used, so the frontend/audit trail can show what informed the diagnosis
    suggestion._gam_settings_used = gamSettings;

    return new Response(JSON.stringify(suggestion), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Unexpected server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});