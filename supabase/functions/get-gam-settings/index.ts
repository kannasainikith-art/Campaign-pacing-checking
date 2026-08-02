const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { li_id, li_name, campaign_name } = await req.json();

    if (!li_id) {
      return new Response(JSON.stringify({ error: "Missing required field: li_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const keyJson = Deno.env.get("GAM_SERVICE_ACCOUNT_KEY");
    const networkCode = Deno.env.get("GAM_NETWORK_CODE");
    if (!keyJson || !networkCode) {
      throw new Error("Missing GAM_SERVICE_ACCOUNT_KEY or GAM_NETWORK_CODE secret");
    }
    const serviceAccountKey = JSON.parse(keyJson);
    const accessToken = await getGamAccessToken(serviceAccountKey);

    const gamResponse = await fetch(
      `https://admanager.googleapis.com/v1/networks/${networkCode}/lineItems/${li_id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await gamResponse.json();
    if (!gamResponse.ok) {
      return new Response(
        JSON.stringify({ error: "GAM line item fetch failed", detail: data }),
        { status: 502, headers: corsHeaders }
      );
    }

    const fcap = data.frequencyCaps?.[0] ?? null;
    const liveSettings = {
      priority: data.priority ?? null,
      delivery_rate_type: data.deliveryRateType ?? null,
      frequency_cap: fcap,
      status: data.status ?? null,
      line_item_type: data.lineItemType ?? null,
    };

    // Check for a simulated override on top of the live read
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let isOverridden = false;
    const finalSettings = { ...liveSettings };

    if (supabaseUrl && supabaseServiceKey) {
      const overrideRes = await fetch(
        `${supabaseUrl}/rest/v1/simulated_gam_overrides?gam_line_item_id=eq.${li_id}&select=*`,
        {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
        }
      );
      const overrides = await overrideRes.json();
      const override = overrides?.[0];
      if (override) {
        isOverridden = true;
        if (override.priority != null) finalSettings.priority = override.priority;
        if (override.delivery_rate_type) finalSettings.delivery_rate_type = override.delivery_rate_type;
        if (override.frequency_cap) finalSettings.frequency_cap = override.frequency_cap;
        if (override.status) finalSettings.status = override.status;
      }

      // Save/update the snapshot
      await fetch(`${supabaseUrl}/rest/v1/gam_settings_snapshots`, {
        method: "POST",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          gam_line_item_id: li_id,
          li_name: li_name ?? null,
          campaign_name: campaign_name ?? null,
          line_item_type: finalSettings.line_item_type,
          priority: finalSettings.priority,
          delivery_rate_type: finalSettings.delivery_rate_type,
          frequency_cap: finalSettings.frequency_cap,
          status: finalSettings.status,
          is_simulated_override: isOverridden,
          fetched_at: new Date().toISOString(),
        }),
      });
    }

    return new Response(
      JSON.stringify({ settings: finalSettings, is_simulated_override: isOverridden }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Unexpected server error", detail: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});