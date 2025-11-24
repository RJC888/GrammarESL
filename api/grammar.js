// /api/grammar.js
// Secure backend: accepts EITHER plain text OR audioBase64, does:
// 1) optional transcription (Whisper)
// 2) ESL grammar feedback
// 3) returns { text: "...", transcript: "..." }

import OpenAI from "openai";
import { toFile } from "openai/uploads";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, tier = "A", audioBase64, mimeType } = req.body || {};
    let sourceText = text || "";
    let transcriptText = "";

    // 1) If we got audio, transcribe it with Whisper-like model
    if (!sourceText && audioBase64) {
      const audioBuffer = Buffer.from(audioBase64, "base64");
      const extension = mimeType && mimeType.includes("/")
        ? mimeType.split("/")[1]
        : "mp4";

      const file = await toFile(audioBuffer, `grammar-audio.${extension}`);

      // Use gpt-4o-mini-transcribe (or change to "whisper-1" if needed)
      const transcription = await client.audio.transcriptions.create({
        model: "gpt-4o-mini-transcribe",
        file,
        response_format: "text",
      });

      // When response_format = "text", transcription is a plain string
      transcriptText =
        typeof transcription === "string"
          ? transcription
          : transcription.text || "";

      sourceText = transcriptText.trim();
    }

    if (!sourceText) {
      return res
        .status(400)
        .json({ error: "No text or audio provided to analyze." });
    }

    // 2) Build ESL-friendly prompt
    const tierLabel = tier || "A";

    const userPrompt = `
You are an experienced ESL grammar teacher for upper-elementary and adult learners.

STUDENT WRITING (to analyze):
---
${sourceText}
---

TIER LEVEL: ${tierLabel}

Please:
1. Correct the grammar and punctuation.
2. Briefly explain the most important corrections in simple, clear English.
3. Give 1–3 short practice sentences the student can speak or write to improve.

Format like this:

Corrected Version:
[corrected paragraph]

Key Grammar Points:
- [short, simple explanation]
- [short, simple explanation]

Practice Sentences:
1. ...
2. ...
3. ...
`.trim();

    // 3) Call a lightweight model for grammar feedback
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a kind, concise ESL grammar teacher. Keep explanations short and clear.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const feedback =
      completion.choices?.[0]?.message?.content?.trim() ||
      "No feedback generated.";

    // Stay compatible with your existing frontend:
    // it expects { text: ... }
    return res.status(200).json({
      text: feedback,
      transcript: transcriptText,
      tier: tierLabel,
    });
  } catch (err) {
    console.error("❌ /api/grammar error:", err);
    return res.status(500).json({
      error: "Internal server error.",
      details: err.message || "Unknown error",
    });
  }
}
