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
  if (!text) return "<p>Empty response.</p>";
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
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ text, tier }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Server error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    setResultsHtml(formatAIText(data.text));

  } catch (err) {
    setResultsHtml(`<p>❌ Error: ${err.message}</p>`);
  } finally {
    setLoading(false);
  }
});

//--------------------------------------------------
// WHISPER (Xenova) — Speech Recognition
//--------------------------------------------------

let whisperModel = null;
let isRecording = false;
let recorder;
let chunks = [];

// Load whisper model AFTER module loads
(async () => {
  micStatus.innerText = "⏳ Loading speech model…";
  whisperModel = await window.loadWhisperModel();
  micStatus.innerText = "🎤 Ready to record";
})();

micBtn.onclick = async () => {
  try {
    if (!isRecording) {
      chunks = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (e) => chunks.push(e.data);

      recorder.start();
      isRecording = true;

      micBtn.innerText = "⏸️";
      micStatus.innerText = "🎙 Recording… tap to stop";

    } else {
      recorder.stop();
      isRecording = false;

      micBtn.innerText = "🎤";
      micStatus.innerText = "⏳ Processing speech…";

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const buffer = await blob.arrayBuffer();

        const result = await whisperModel(buffer);
        const transcript = result.text.trim();

        inputEl.value = (inputEl.value + "\n\n" + transcript).trim();
        micStatus.innerText = "🎤 Ready";
      };
    }
  } catch (err) {
    micStatus.innerText = "⚠️ Mic error";
    console.error(err);
  }
};
