const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are an ad-ops pacing diagnostic assistant for Google Ad Manager (GAM) line items.

You will receive the real current state of one line item: its goal, delivered impressions, flight dates, pacing percentage, and its real GAM settings (line item type, priority, delivery rate setting, frequency cap).

CRITICAL RULE ON LINE ITEM TYPE:
- If line_item_type is STANDARD, this is a DIRECT/GUARANTEED deal with a fixed contracted goal. Priority changes are NOT a meaningful lever and must NOT be recommended — priority-based competition matters for programmatic/price-priority inventory, not guaranteed direct deals. For STANDARD line items, only use: frequency cap or delivery rate setting (EVENLY vs AS_FAST_AS_POSSIBLE).
- If line_item_type is PRICE_PRIORITY, NETWORK, BULK, or HOUSE, priority IS a valid lever.

Your job: generate exactly 3 DISTINCT, real, writable options to address the pacing issue. Each option must use a different field_to_change where possible (choose from only: "frequency_cap", "delivery_rate", "priority" — priority only for non-STANDARD types). If fewer than 3 valid distinct fields apply (e.g. a STANDARD line item only has 2 valid levers), give 2 options with different intensities of the same field (e.g. a moderate vs aggressive frequency cap change) rather than inventing a fourth invalid field. Do not suggest creative changes, targeting changes, or anything outside frequency_cap/delivery_rate/priority.

Respond ONLY with valid JSON matching this exact shape, no markdown formatting, no extra text. Each option's diagnosis_bullets and fix_bullets must be arrays of short, punchy bullet-point strings (3-10 words each, max 2 bullets per array):
{
  "options": [
    {
      "title": "short 5-8 word summary of this option",
      "diagnosis_bullets": ["short bullet naming the cause", "short bullet with the specific number/setting"],
      "confidence": "high | medium | low",
      "field_to_change": "frequency_cap | delivery_rate | priority",
      "current_value": "exact current value matching GAM shape: frequency_cap is an object with maxImpressions, timeAmount, timeUnit DAY; delivery_rate is a string EVENLY or AS_FAST_AS_POSSIBLE; priority is a number",
      "new_value": "the recommended new value, same shape as current_value",
      "fix_bullets": ["short bullet with the specific action", "short bullet stating old value to new value"],
      "expected_impact": "1 short sentence on what should improve"
    }
  ]
}
The options array must contain 2 or 3 objects, ordered from most recommended to least.`;

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
  return {
    priority: data.priority ?? "unknown",
    delivery_setting: data.deliveryRateType ?? "unknown",
    frequency_cap: fcap
      ? `${fcap.maxImpressions} impressions / ${fcap.timeAmount} ${fcap.timeUnit.toLowerCase()}`
      : "no frequency cap set",
    line_item_type: data.lineItemType ?? "unknown",
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

Generate 2-3 distinct options to address this pacing issue.`;

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