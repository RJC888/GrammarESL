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
// GRAMMAR CHECK — CALLS /api/grammar
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
// XENOVA WHISPER SPEECH RECOGNITION
//--------------------------------------------------

let recorder;
let audioChunks = [];
let transcriber;
let isRecording = false;

// Load model at startup
(async () => {
  micStatus.innerText = "⏳ Loading speech model… (first time only)";
  transcriber = await window.loadTranscriber();
  micStatus.innerText = "🎤 Ready to record";
})();

micBtn.onclick = async () => {
  try {
    if (!isRecording) {
      // Start recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);

      audioChunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      recorder.start();
      isRecording = true;
      micBtn.innerText = "⏸️";
      micStatus.innerText = "🎙 Recording… tap to stop";

    } else {
      recorder.stop();
      isRecording = false;
      micBtn.innerText = "🎤";
      micStatus.innerText = "⏳ Processing speech…";

      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const arrayBuffer = await audioBlob.arrayBuffer();

      const result = await transcriber(arrayBuffer);

      const cleanTranscript = result.text.trim();
      inputEl.value = (inputEl.value + "\n\n" + cleanTranscript).trim();

      micStatus.innerText = "🎤 Ready";
    }
  } catch (err) {
    console.error("Whisper recording error:", err);
    micStatus.innerText = "⚠️ Mic error";
  }
};
