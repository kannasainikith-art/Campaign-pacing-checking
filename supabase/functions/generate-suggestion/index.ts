const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are an ad-ops pacing diagnostic assistant for Google Ad Manager (GAM) line items.

You will receive the real current state of one line item: its goal, delivered impressions, flight dates, pacing percentage, and its real GAM settings (line item type, priority, delivery rate setting, frequency cap, current status).

CRITICAL RULE ON LINE ITEM TYPE:
- If line_item_type is STANDARD, this is a DIRECT/GUARANTEED deal. Priority changes are NOT valid — only use frequency_cap, delivery_rate, or pause.
- If line_item_type is PRICE_PRIORITY, NETWORK, BULK, or HOUSE, priority IS a valid lever.

CRITICAL RULE ON DELIVERY RATE:
- delivery_rate only has two states: EVENLY (throttled) and AS_FAST_AS_POSSIBLE (aggressive).
- If the line item is OVER-pacing and delivery_rate is already EVENLY, delivery_rate is NOT usable — do not offer it.
- If the line item is UNDER-pacing and delivery_rate is already AS_FAST_AS_POSSIBLE, same rule — do not offer it.

CRITICAL RULE ON PAUSE:
- "pause" (changing status from READY to PAUSED) is only valid for SEVERE over-pacing — pacing_percent above roughly 130%. Never offer pause for under-pacing or mild over-pacing (110-130%).
- Pause is a valid option only if current status is not already PAUSED.
- Frame pause as a temporary stop-gap ("pause until budget/flight review"), not a permanent fix — always prefer frequency_cap or delivery_rate first unless the over-delivery is severe enough that immediate stoppage matters more than a gradual throttle.

CRITICAL RULE ON OPTION COUNT AND DISTINCTNESS:
- Only generate options that are genuinely, meaningfully different from each other. Do NOT pad with near-identical variations just to reach 3.
- If only ONE field is genuinely usable, return exactly 1 option. Return 2 or 3 only if that many genuinely distinct, non-redundant changes exist.
- Multiple frequency_cap options ARE allowed if they represent meaningfully different intensities a real ad-ops person would choose between — but do not manufacture a third when two cover it.

Respond ONLY with valid JSON, no markdown, no extra text. shared_diagnosis is 1-2 bullets describing the overall pacing issue ONCE (not repeated per option). Each option's fix_bullets describes ONLY that option's specific action:
{
  "shared_diagnosis": ["short bullet on the pacing status", "short bullet on the root setting causing it"],
  "options": [
    {
      "title": "short 5-8 word summary of this specific option",
      "confidence": "high | medium | low",
      "field_to_change": "frequency_cap | delivery_rate | priority | pause",
      "current_value": "exact current value matching GAM shape: frequency_cap is an object with maxImpressions, timeAmount, timeUnit DAY; delivery_rate is a string EVENLY or AS_FAST_AS_POSSIBLE; priority is a number; pause's current_value is the current status string like READY",
      "new_value": "the recommended new value, same shape as current_value (pause's new_value is the string PAUSED)",
      "fix_bullets": ["short bullet with the specific action", "short bullet stating old value to new value"],
      "expected_impact": "1 short sentence on what should improve"
    }
  ]
}`;

interface RequestInput {
  li_id: string;
  li_name: string;
  campaign_name: string;
  goal: number;
  impressions_delivered: number;
  flight_start: string;
  flight_end: string;
  pacing_percent: number;
  status: "under" | "over" | "healthy" | "mixed";
}

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
    scope: "https://www.googleapis.com/auth/admanager.readonly",
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

  const fcap = data.frequencyCaps?.[0];
  const realSettings = {
    priority: data.priority ?? "unknown",
    delivery_setting: data.deliveryRateType ?? "unknown",
    frequency_cap: fcap
      ? `${fcap.maxImpressions} impressions / ${fcap.timeAmount} ${fcap.timeUnit.toLowerCase()}`
      : "no frequency cap set",
    line_item_type: data.lineItemType ?? "unknown",
    status: data.status ?? "unknown",
  };

  // Check for any approved simulated overrides and apply them on top of the real read
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const overrideRes = await fetch(
        `${supabaseUrl}/rest/v1/simulated_gam_overrides?gam_line_item_id=eq.${lineItemId}&select=*`,
        {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        }
      );
      const overrides = await overrideRes.json();
      const override = overrides?.[0];
      if (override) {
        if (override.priority != null) realSettings.priority = override.priority;
        if (override.delivery_rate_type) realSettings.delivery_setting = override.delivery_rate_type;
        if (override.frequency_cap) {
          const of = override.frequency_cap;
          realSettings.frequency_cap = `${of.maxImpressions} impressions / ${of.timeAmount} ${String(of.timeUnit).toLowerCase()}`;
        }
        if (override.status) realSettings.status = override.status;
      }
    } catch (e) {
      console.error("Failed to check simulated overrides (non-fatal):", e);
    }
  }

  return realSettings;
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

    const input: RequestInput = await req.json();

    if (!input.li_id) {
      return new Response(JSON.stringify({ error: "Missing required field: li_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

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

    const userContent = `Line item: ${input.li_name} (${input.li_id})
Campaign: ${input.campaign_name}
Goal (contracted impressions): ${input.goal}
Delivered impressions: ${input.impressions_delivered}
Flight: ${input.flight_start} to ${input.flight_end}
Pacing: ${input.pacing_percent}% (${input.status})

Real GAM settings (fetched live):
- Line item type: ${gamSettings.line_item_type}
- Priority: ${gamSettings.priority}
- Delivery rate setting: ${gamSettings.delivery_setting}
- Frequency cap: ${gamSettings.frequency_cap}
- Current status: ${gamSettings.status}

Generate the appropriate number of genuinely distinct options (1-3) to address this pacing issue.`;

    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0.3,
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

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Failed to parse Gemini response as JSON", raw: rawText }),
        { status: 502, headers: corsHeaders }
      );
    }

    result._gam_settings_used = gamSettings;

    return new Response(JSON.stringify(result), {
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