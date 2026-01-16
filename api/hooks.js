export default async function handler(req, res) {
  // CORS (на всякий случай)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.log("Missing OPENROUTER_API_KEY");
      return res.status(500).json({ error: "Missing OPENROUTER_API_KEY" });
    }

    // Надёжное чтение body (работает везде)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8") || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.log("Bad JSON body:", raw);
      return res.status(400).json({ error: "Bad JSON body" });
    }

    const cleanTopic = String(parsed?.topic || "").trim();
    if (!cleanTopic) {
      console.log("Missing topic");
      return res.status(400).json({ error: "Missing topic" });
    }

    const system = [
      "You write TikTok hooks.",
      "Return EXACTLY 10 hooks.",
      "Each hook is 6–14 words, punchy, no emojis, no hashtags.",
      "No explanations, no extra text.",
      'Output MUST be valid JSON: {"hooks":["...","..."]}.',
      "Hooks should feel viral: curiosity, conflict, warning, bold claim, contrarian."
    ].join(" ");

    console.log("Calling OpenRouter… topic:", cleanTopic);

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tiktok-hooks.vercel.app",
        "X-Title": "TikTok Hook Generator"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        temperature: 0.9,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Topic: ${cleanTopic}` }
        ]
      })
    });

    const text = await resp.text();

    if (!resp.ok) {
      console.log("OpenRouter error:", resp.status, text);
      return res.status(502).json({ error: "Upstream error", status: resp.status, details: text });
    }

    let hooks = [];
    try {
      const data = JSON.parse(text);
      const content = data?.choices?.[0]?.message?.content || "";
      const parsed2 = JSON.parse(content);
      hooks = Array.isArray(parsed2?.hooks) ? parsed2.hooks : [];
    } catch (e) {
      console.log("Parse error:", String(e), "Raw:", text);
      return res.status(500).json({ error: "Parse error", details: String(e) });
    }

    hooks = hooks.map(s => String(s).trim()).filter(Boolean).slice(0, 10);

    return res.status(200).json({ hooks });
  } catch (e) {
    console.log("Server error:", e);
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
