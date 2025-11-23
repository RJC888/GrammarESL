console.log("🔥 RUNNING FINAL WAV-SAFE VERSION OF app.js");

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
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^\s*[-*]\s+/gm, "• ");
  html = html.replace(/\r\n/g, "\n");
  html = html.replace(/\n{2,}/g, "</p><p>");
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

// State for Whisper
let asrPipeline = null;
let asrLoading = false;
let asrError = null;

//--------------------------------------------------
// LOAD WHISPER MODEL
//--------------------------------------------------
async function loadWhisperModelOnce() {
  let pipeline = window.transformersPipeline;
  if (!pipeline) {
    console.warn("Waiting for pipeline script to be ready...");
    await new Promise(r => setTimeout(r, 200));
    pipeline = window.transformersPipeline;
  }

  if (!pipeline) {
    console.error("❌ Transformers pipeline not available.");
    micStatus.innerText = "⚠️ Missing speech model";
    return null;
  }

  if (asrPipeline) return asrPipeline;

  try {
    asrLoading = true;
    micStatus.innerText = "⏳ Loading speech model…";
    asrPipeline = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-base.en"
    );
    micStatus.innerText = "🎤 Ready to record";
    return asrPipeline;
  } catch (err) {
    console.error("Error loading Whisper:", err);
    micStatus.innerText = "⚠️ Speech model load error";
    return null;
  } finally {
    asrLoading = false;
  }
}

window.addEventListener("load", () => loadWhisperModelOnce());

//--------------------------------------------------
// RECORDING FORMAT SELECTION
//--------------------------------------------------
function getSupportedMimeType() {
  if (MediaRecorder.isTypeSupported("audio/wav")) return "audio/wav";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4"; // Safari
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
    return "audio/webm;codecs=opus"; // Chrome
  return "";
}

//--------------------------------------------------
// MIC BUTTON — START/STOP + TRANSCRIBE
//--------------------------------------------------
micBtn.onclick = async () => {
  try {
    if (!asrPipeline) {
      await loadWhisperModelOnce();
      if (!asrPipeline) return;
    }

    if (!isRecording) {
      // START RECORDING
      audioChunks = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = getSupportedMimeType();
      console.log("🎙 Using mimeType:", mimeType);

      audioRecorder = new MediaRecorder(stream, { mimeType });

      audioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      audioRecorder.start();
      isRecording = true;
      micBtn.innerText = "⏸️";
      micStatus.innerText = "🎙 Recording…";
    } else {
      // STOP RECORDING
      audioRecorder.stop();
      isRecording = false;
      micBtn.innerText = "🎤";
      micStatus.innerText = "⏳ Processing…";

      // Convert chunks → blob
      const audioBlob = new Blob(audioChunks);

      // Convert Blob → raw PCM using Xenova read_audio
      const arrayBuffer = await audioBlob.arrayBuffer();
      const waveform = await window.read_audio(arrayBuffer, 16000);

      // Send PCM vec → Whisper
      const result = await asrPipeline(waveform);

      const transcriptText = result?.text || "";
      const cleanTranscript = transcriptText.trim() || "[no speech recognized]";

      inputEl.value = (inputEl.value + "\n\n" + cleanTranscript).trim();
      micStatus.innerText = "🎤 Ready";
    }

  } catch (err) {
    console.error("Whisper recording error:", err);
    micStatus.innerText = "⚠️ Mic error";
  }
};
