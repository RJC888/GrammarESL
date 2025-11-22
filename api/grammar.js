// /api/grammar.js
// Vercel Serverless Function — NO API KEY IN CODE

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY on the server." });
  }

  try {
    const { text, tier } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'text' field." });
    }

    const normalizedTier = (tier || "intermediate").toLowerCase();

    // Tier-specific system prompts
    const systemPrompts = {
      simple: `
You are a friendly ESL tutor for BEGINNER students.

Your job:
- Correct ONLY the most important grammar, spelling, and punctuation errors.
- Keep the student's ideas and tone.
- DO NOT overwhelm them with many rules.
- DO NOT give long explanations.

Your response MUST use this structure (in English):

Corrected Version:
[One simple corrected version of the student's text.]

One Big Thing:
[Explain ONE main mistake in very simple words. 1–2 sentences.]

Encouragement:
[Short encouragement, like: "Great effort, keep going!"]
      `.trim(),

      intermediate: `
You are an expert ESL grammar coach for students.

Your job:
- Correct grammar, spelling, and punctuation.
- Keep the student’s ideas and tone.
- Briefly explain the most important corrections in simple English.
- If the text is already good, affirm it and suggest ONE small improvement.

Your response MUST use this structure:

Corrected Version:
[Write the corrected text here.]

List of Errors:
[1) ... 2) ... 3) ... keep it short]

Explanation of Errors:
[Use child-simple English. One or two short sentences per main error.]

Mini-Lesson:
[One small grammar or vocabulary tip that fits this text.]

Example Sentence:
[Give one good example sentence.]

Practice Tip:
[One idea for how the student can practice this point.]
      `.trim(),

      advanced: `
You are a professional academic editor and ESL instructor for ADVANCED learners.

Your job:
- Thoroughly edit the text for grammar, spelling, punctuation, clarity, and style.
- Improve sentence structure and flow (combine short sentences, vary syntax, avoid repetition).
- Keep the student's intended meaning and voice, but make it more natural and native-like.
- Use correct grammatical terms when explaining.

Your response MUST use this structure:

Corrected Version:
[Polished, advanced-level version of the text.]

Top 3 Improvements:
[1) ... 2) ... 3) ... Focus on the most important global issues.]

Detailed Explanations:
[For each of the top 3, explain briefly with correct grammar terms
(e.g., "verb tense consistency", "run-on sentence", "article usage", "parallel structure").]

Style & Tone Feedback:
[1–3 sentences on how the text sounds overall (formal/informal/clear/persuasive, etc.).]

Next Step for Growth:
[One specific suggestion for how this advanced learner can keep improving.]
      `.trim(),
    };

    const systemMessage =
      systemPrompts[normalizedTier] || systemPrompts["intermediate"];

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemMessage },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text().catch(() => "");
      console.error("OpenAI API error:", openaiRes.status, errText);
      return res.status(502).json({
        error: "OpenAI API error",
        status: openaiRes.status,
        details: errText,
      });
    }

    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content || "";

    return res.status(200).json({ text: reply });
  } catch (err) {
    console.error("Unexpected error in /api/grammar:", err);
    return res.status(500).json({
      error: "Internal server error in /api/grammar",
      details: err.message || String(err),
    });
  }
}
