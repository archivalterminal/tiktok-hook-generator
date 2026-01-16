export default async function handler(req, res) {
  // Разрешаем только POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENROUTER_API_KEY" });
    }

    const { topic } = req.body || {};
    const cleanTopic = String(topic || "").trim();
    if (!cleanTopic) {
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

    const user = `Topic: ${cleanTopic}`;

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Эти заголовки можно оставить, они помогают OpenRouter с аналитикой
        "HTTP-Referer": "https://vercel.app",
        "X-Title": "TikTok Hook Generator"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.9,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(502).json({ error: "Upstream error", details: errText });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";

    // Пытаемся распарсить JSON строго
    let hooks = [];
    try {
      const parsed = JSON.parse(content);
      hooks = Array.isArray(parsed?.hooks) ? parsed.hooks : [];
    } catch {
      // запасной вариант: вытащим строки построчно
      hooks = content
        .split("\n")
        .map(s => s.replace(/^\s*\d+[\).\s-]+/, "").trim())
        .filter(Boolean);
    }

    // Нормализуем до 10
    hooks = hooks.slice(0, 10);

    return res.status(200).json({ hooks });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
