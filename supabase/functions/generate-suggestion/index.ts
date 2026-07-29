const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are an ad-ops pacing diagnostic assistant for Google Ad Manager (GAM) line items.

You will receive the real current state of one line item: its goal, delivered impressions, flight dates, pacing percentage, and its GAM settings (priority, available inventory, creative status, delivery settings, frequency cap).

Your job: diagnose the MOST LIKELY root cause of its pacing status using the settings provided, then recommend ONE specific, actionable fix.

Diagnostic reference (use this reasoning, don't just guess generically):
- Under-pacing + low priority relative to competing line items -> likely losing the auction; recommend raising priority
- Under-pacing + narrow targeting or low available inventory -> insufficient matching inventory; recommend broadening targeting/geo
- Under-pacing + tight frequency cap -> capping delivery to the same users too early; recommend loosening the frequency cap
- Under-pacing + creative disapproved/rejected/pending -> delivery is blocked at the creative level, not a pacing setting issue; recommend fixing/resubmitting the creative first
- Over-pacing + no daily cap set -> delivering too fast early in the flight; recommend adding/tightening a daily impression cap
- Over-pacing + priority too high relative to goal -> cannibalizing inventory from other line items; recommend lowering priority

Only recommend changes to fields that are real GAM settings: priority, frequency cap, daily cap, flight dates, targeting. Do not give vague or generic advice like "monitor performance" or "review targeting" without specifying the actual change.

Respond ONLY with valid JSON matching this exact shape, no markdown formatting, no extra text:
{
  "title": "short 5-8 word summary of the issue",
  "diagnosis": "1-2 sentences naming the likely root cause, referencing the specific setting values given",
  "confidence": "high | medium | low",
  "recommended_fix": "1-2 sentences, specific and actionable, naming the exact GAM field to change and the direction",
  "expected_impact": "1 sentence on what should improve and roughly by how much, if estimable"
}`;

interface LineItemInput {
  li_id: string;
  li_name: string;
  campaign_name: string;
  goal: number;
  impressions_delivered: number;
  flight_start: string;
  flight_end: string;
  pacing_percent: number;
  status: "under" | "over" | "healthy" | "mixed";
  gam_settings: {
    priority: number;
    available_inventory: number;
    creative_status: string;
    delivery_setting: string;
    frequency_cap: string;
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

    const input: LineItemInput = await req.json();

    if (!input.li_id || !input.gam_settings) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: li_id and gam_settings" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const userContent = `Line item: ${input.li_name} (${input.li_id})
Campaign: ${input.campaign_name}
Goal (contracted impressions): ${input.goal}
Delivered impressions: ${input.impressions_delivered}
Flight: ${input.flight_start} to ${input.flight_end}
Pacing: ${input.pacing_percent}% (${input.status})

GAM settings:
- Priority: ${input.gam_settings.priority}
- Available inventory: ${input.gam_settings.available_inventory}
- Creative status: ${input.gam_settings.creative_status}
- Delivery setting: ${input.gam_settings.delivery_setting}
- Frequency cap: ${input.gam_settings.frequency_cap}

Diagnose the root cause and recommend one specific fix.`;

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
