console.log("app.js loaded — waiting for transformersPipeline...");

//--------------------------------------------------
// DOM ELEMENTS
//--------------------------------------------------
const inputEl = document.getElementById("inputText");
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const checkBtn = document.getElementById("checkBtn");
const clearBtn = document.getElementById("clearBtn");
const resultsEl = document.getElementById("results");

//--------------------------------------------------
// TIER SELECTION
//--------------------------------------------------
function getSelectedTier() {
  const checked = document.querySelector('input[name="tier"]:checked');
  return checked ? checked.value : "intermediate";
}

//--------------------------------------------------
// RESULTS HANDLING
//--------------------------------------------------
function setResultsHtml(html) {
  resultsEl.innerHTML = html;
}

function setLoading(isLoading) {
  checkBtn.disabled = isLoading;
  micBtn.disabled = isLoading;
  checkBtn.textContent = isLoading ? "Checking..." : "✓ Check My Writing";
}

//--------------------------------------------------
// MARKDOWN → SIMPLE HTML FORMATTER
//--------------------------------------------------
function formatAIText(text) {
  if (!text) return "<p>Empty response from server.</p>";

  let html = text.trim();

  // Bold syntax: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Replace Markdown-style bullets with dot bullets
  html = html.replace(/^\s*[-*]\s+/gm, "• ");

  // Paragraphs: double newlines
  html = html.replace(/\r\n/g, "\n"); // normalize
  html = html.replace(/\n{2,}/g, "</p><p>");

  // Single newlines → <br>
  html = html.replace(/\n/g, "<br>");

  return `<p>${html}</p>`;
}

//--------------------------------------------------
// CLEAR BUTTON
//--------------------------------------------------
clearBtn.addEventListener("click", () => {
  inputEl.value = "";
  setResultsHtml(`
    <p class="placeholder">
      Your feedback will appear here after you press
      <strong>“Check My Writing”</strong>.
    </p>
  `);
});

//--------------------------------------------------
// CHECK GRAMMAR — CALLS /api/grammar
//--------------------------------------------------
checkBtn.addEventListener("click", async () => {
  const text = inputEl.value.trim();

  if (!text) {
    setResultsHtml("<p>Please type or speak some English first. 😊</p>");
    return;
  }

  const tier = getSelectedTier();
  setLoading(true);
  setResultsHtml("<p>Checking your writing… ✍️</p>");

  try {
    const response = await fetch("/api/grammar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, tier }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Server error (${response.status}). ${
          errText || "Please try again later."
        }`
      );
    }

    const data = await response.json();
    const formatted = formatAIText(data.text);
    setResultsHtml(formatted);
  } catch (err) {
    console.error("Grammar check failed:", err);
    setResultsHtml(`
      <p>Sorry, something went wrong while checking your writing. 🙁</p>
      <p><small>${err.message}</small></p>
    `);
  } finally {
    setLoading(false);
  }
});

//--------------------------------------------------
// WHISPER (Xenova Transformers.js) — SPEECH-TO-TEXT
//--------------------------------------------------

// State for recording
let audioRecorder = null;
let audioChunks = [];
let isRecording = false;

// State for Whisper (Transformers.js)
let asrPipeline = null;
let asrLoading = false;
let asrError = null;

/**
 * Load Whisper base.en model once using Xenova Transformers.js.
 * Uses the global window.transformersPipeline from index.html.
 *
 * Model: Xenova/whisper-base.en  (English-only, more accurate than tiny) :contentReference[oaicite:2]{index=2}
 */
async function loadWhisperModelOnce() {
  // Wait until Xenova pipeline is ready
  let pipeline = window.transformersPipeline;
  let retries = 0;

  while (!pipeline && retries < 50) {
    await new Promise(r => setTimeout(r, 100));
    pipeline = window.transformersPipeline;
    retries++;
  }

  if (!pipeline) {
    const err = new Error("Transformers pipeline not available on window after waiting.");
    console.error(err);
    asrError = err;
    micStatus.innerText = "⚠️ Speech model unavailable";
    return null;
  }

  if (asrPipeline || asrError) {
    return asrPipeline;
  }

  try {
    asrLoading = true;
    micStatus.innerText = "⏳ Loading speech model… (first time only)";
    asrPipeline = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-base.en"
    );
    micStatus.innerText = "🎤 Ready to record";
    return asrPipeline;
  } catch (err) {
    console.error("Error loading Whisper model via Transformers.js:", err);
    asrError = err;
    micStatus.innerText = "⚠️ Error loading speech model";
    return null;
  } finally {
    asrLoading = false;
  }
}

// Delay loading until module script has initialized
window.addEventListener("load", () => {
  setTimeout(() => loadWhisperModelOnce(), 200);
});

//--------------------------------------------------
// MIC BUTTON — START/STOP + TRANSCRIBE
//--------------------------------------------------
// Convert audio Blob into Float32 raw PCM and resample to 16kHz if needed
async function readAudioFromBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const decodedAudio = await audioContext.decodeAudioData(arrayBuffer);
  const pcm = decodedAudio.getChannelData(0); // original sample rate (e.g., 44.1kHz)

  // Resample to 16kHz for Whisper
  const inputSampleRate = decodedAudio.sampleRate;
  const targetSampleRate = 16000;

  if (inputSampleRate === targetSampleRate) {
    return pcm; // perfect — no resampling needed
  }

  const sampleRatio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(pcm.length / sampleRatio);
  const resampled = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    resampled[i] = pcm[Math.round(i * sampleRatio)];
  }

  return resampled;
}

micBtn.onclick = async () => {
  try {
    // Ensure model is ready
    if (!asrPipeline) {
      if (asrLoading) {
        micStatus.innerText = "⏳ Still loading speech model…";
        return;
      }
      const pipelineInstance = await loadWhisperModelOnce();
      if (!pipelineInstance) {
        // Model could not be loaded
        return;
      }
    }

    if (!isRecording) {
      // Start recording
      audioChunks = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioRecorder = new MediaRecorder(stream);

      audioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      audioRecorder.start();
      isRecording = true;
      micBtn.innerText = "⏸️";
      micStatus.innerText = "🎙 Recording… tap to stop";
    } else {
      // Stop recording
      audioRecorder.stop();
      isRecording = false;
      micBtn.innerText = "🎤";
      micStatus.innerText = "⏳ Processing speech…";

  // Combine audio chunks into a Blob
const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

// Convert Blob → PCM Float32Array
const rawAudio = await readAudioFromBlob(audioBlob);

// Transcribe PCM audio
const result = await asrPipeline(rawAudio);

      // Result is typically { text: "..." }
      const transcriptText =
        (result && result.text) ||
        (Array.isArray(result) && result[0] && result[0].text) ||
        "";

      const cleanTranscript = transcriptText.trim() || "[no speech recognized]";

      // Append transcript to textarea with spacing (A: append behavior)
      inputEl.value = (inputEl.value + "\n\n" + cleanTranscript).trim();

      micStatus.innerText = "🎤 Ready";
    }
  } catch (err) {
    console.error("Whisper recording error:", err);
    micStatus.innerText = "⚠️ Mic error";
  }
};
