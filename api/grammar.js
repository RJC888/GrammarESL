// /api/grammar.js

import OpenAI from "openai";
import { toFile } from "openai/uploads";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',   // allow larger audio payloads
    },
  },
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, tier = "intermediate", audioBase64, mimeType } = req.body || {};
    let sourceText = text || "";
    let transcriptText = "";

    // If recording was sent rather than text input
    if (!sourceText && audioBase64) {
      const audioBuffer = Buffer.from(audioBase64, "base64");
      const extension = mimeType && mimeType.includes("/") ? mimeType.split("/")[1] : "mp4";

      const file = await toFile(audioBuffer, `grammar-audio.${extension}`);

      console.log("🎧 Performing Whisper transcription...");

      // Correct model
      const transcription = await client.audio.transcriptions.create({
        model: "whisper-1",
        file,
        response_format: "text",
      });

      transcriptText =
        typeof transcription === "string"
          ? transcription
          : transcription.text || "";

      sourceText = transcriptText.trim();
    }

    if (!sourceText) {
      return res.status(400).json({ error: "No text or audio provided to analyze." });
    }

    // Prepare grammar teaching prompt
    const userPrompt = `
You are an experienced ESL grammar teacher for all levels.

STUDENT WRITING:
---
${sourceText}
---

HELP LEVEL: ${tier}

Provide:
1. A corrected version of the English
2. Simple explanation of 2–4 key grammar improvements
3. A few short practice sentences

Format:

Corrected English:
...

Key Grammar Points:
- ...

Practice Sentences:
1. ...
2. ...
`.trim();

    console.log("✏️ Performing grammar analysis...");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a concise, friendly ESL grammar coach." },
        { role: "user", content: userPrompt },
      ],
    });

    const feedback =
      completion.choices?.[0]?.message?.content?.trim() ||
      "No feedback generated.";

    return res.status(200).json({
      text: feedback,
      transcript: transcriptText,
      tier,
    });

  } catch (err) {
    console.error("❌ /api/grammar error:", err);

    return res.status(500).json({
      error: "Server crash during grammar/transcription",
      details: err.message || "Unknown error",
    });
  }
}
