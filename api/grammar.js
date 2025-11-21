// api/grammar.js
//
// Vercel serverless function.
// Secure: uses process.env.OPENAI_API_KEY
// Model: gpt-4o-mini
// Supports 3 tiers: simple, intermediate, advanced

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

  let body;
  try {
    body = req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  const text = (body.text || "").trim();
  const tier = (body.tier || "intermediate").toLowerCase();

  if (!text) {
    return res
      .status(400)
      .json({ error: "Please provide 'text' in the request body." });
  }

  // ----------------------------------------------------
  // TIER PROMPTS
  // ----------------------------------------------------

  const sharedFormat = `
Always respond in this EXACT structure with clear headings. Use simple Markdown:

**Corrected Version**
[Give the student's text, fully corrected.]

**List of Errors**
1. ...
2. ...

**Explanation of Errors (Child-Simple)**
- Explain in very simple English.

**Mini-Lesson**
- 2–4 short bullet points that teach the main idea.

**Example Sentence**
- Give one good example sentence using the grammar point.

**Practice Tip**
- One practical idea the student can try next time.
`;

  const simplePrompt = `
You are a friendly ESL tutor for beginners.

Your goals:
- Fix basic grammar, spelling, and punctuation.
- Keep the student's ideas and tone.
- Use short, clear sentences.
- Be kind and encouraging.

Focus on the MOST important mistakes, not every tiny detail.

${sharedFormat}
`;

  const intermediatePrompt = `
You are an expert ESL grammar coach for students.

Your goals:
- Correct grammar, spelling, and punctuation.
- Keep the student's ideas and tone.
- Briefly explain the most important corrections in simple English.
- If the text is already good, affirm it and suggest one small improvement.

Use clear, student-friendly explanations.

${sharedFormat}
`;

  const advancedPrompt = `
You are a professional academic editor and ESL instructor. Your role is to elevate the student's writing to a more sophisticated and native-like level.

Your goals:
- Thoroughly edit the text for grammar, spelling, punctuation, clarity, and style.
- Suggest improvements to sentence structure (combine short sentences, vary syntax) to enhance flow and readability.
- For the TOP THREE most important corrections or stylistic changes, explain them using correct grammar terms (e.g., "infinitive clause", "perfect aspect", "parallel structure").
- If the text is already strong, comment on the overall rhetorical strength and offer one advanced suggestion.

Use language that an advanced ESL student can understand, but do not oversimplify.

${sharedFormat}
`;

  const tierToSystemPrompt = {
    simple: simplePrompt,
    intermediate: intermediatePrompt,
    advanced: advancedPrompt,
  };

  const systemPrompt =
    tierToSystemPrompt[tier] || tierToSystemPrompt["intermediate"];

  // ----------------------------------------------------
  // OPENAI CHAT COMPLETION (gpt-4o-mini)
  // ----------------------------------------------------
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
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("OpenAI API error:", response.status, errText);
      return res
        .status(502)
        .json({ error: "OpenAI API error", details: errText });
    }

    const data = await response.json();
    const completion =
      data.choices?.[0]?.message?.content || "No response generated.";

    return res.status(200).json({ text: completion });
  } catch (err) {
    console.error("Server error calling OpenAI:", err);
    return res
      .status(500)
      .json({ error: "Server error calling OpenAI", details: err.message });
  }
}
