// api/grammar.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY on the server." });
  }

  const { text, tier } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Missing text input." });
  }

  const prompts = {
    simple: `
You are a friendly ESL tutor...
[INCLUDE THE SIMPLE TIER PROMPT YOU ALREADY APPROVED]
`,
    intermediate: `
You are an expert ESL grammar coach...
[YOUR INTERMEDIATE PROMPT]
`,
    advanced: `
You are a professional academic editor...
[YOUR ADVANCED PROMPT]
`,
  };

  const systemPrompt = prompts[tier] || prompts.intermediate;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    const data = await response.json();

    return res.status(200).json({ text: data.choices[0].message.content });

  } catch (err) {
    console.error("OpenAI API error:", err);
    return res.status(500).json({ error: err.message || "API error" });
  }
}
