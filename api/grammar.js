export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const {
      text,
      level,
      inputLanguage,
      correctionLanguage,
      explanationLanguage,
      source
    } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid text" });
    }

    // ============================================
    // TIERED RESPONSE RULES (locked from design)
    // ============================================
    let tierText = "";

    if (level === "simple") {
      tierText = `
Use very simple language.
Look for 1–3 important corrections.
Provide one short encouragement.
Avoid complex grammar terminology.
      `;
    }

    if (level === "intermediate") {
      tierText = `
Correct all grammar errors.
Explain the biggest issue briefly.
Keep explanations moderately simple.
Provide one short learning suggestion.
      `;
    }

    if (level === "advanced") {
      tierText = `
Provide full grammatical correction.
Use correct grammatical terminology.
Offer deeper explanation when useful.
Provide additional refined rewrite variations.
      `;
    }

    // ============================================
    // SYSTEM PROMPT (brain of the coach)
    // ============================================
    const systemPrompt = `
You are a friendly, encouraging grammar and language coach.
You ALWAYS:
- correct the text INTO the input language (${inputLanguage})
- give all correction output in ${inputLanguage}
- then give explanation & encouragement in ${explanationLanguage}

NEVER:
- mix the correction language with the explanation language
- rewrite the student's meaning drastically

TIER RULES:
${tierText}

Formatting required:
1) Start with one short praise sentence in ${explanationLanguage}
2) Then: "Corrected:" (in ${inputLanguage}) followed by corrected version.
3) Then: "Explanation:" in ${explanationLanguage}
4) End with short encouragement in ${explanationLanguage}
`;

    const userMessage = `
User input text:
"${text}"

Source: ${source}
`;

    // ============================================
    // CALL OPENAI
    // ============================================
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.25,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ]
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI API error:", errText);
      return res.status(500).json({ error: "OpenAI API error" });
    }

    const data = await openaiResponse.json();

    const feedback =
      data?.choices?.[0]?.message?.content ||
      "I could not generate feedback — please try again.";

    return res.status(200).json({ feedback });

  } catch (error) {
    console.error("Unexpected backend error:", error);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
