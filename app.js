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
// WHISPER IN-BROWSER SPEECH RECOGNITION
//--------------------------------------------------

let audioRecorder;
let audioChunks = [];
let whisperModel;
let isRecording = false;

// Load Whisper model on page load
// Wait until whisper module is loaded from index.html
const waitForWhisper = setInterval(async () => {
  if (window.whisperReady && window.whisper) {
    clearInterval(waitForWhisper);
    try {
      micStatus.innerText = "⏳ Loading speech model… (first time only)";
      whisperModel = await window.whisper.loadModel("base.en");
      micStatus.innerText = "🎤 Ready to record";
    } catch (err) {
      console.error("Error loading Whisper model:", err);
      micStatus.innerText = "⚠️ Error loading speech model";
    }
  }
}, 100);

// Handle mic start/stop
micBtn.onclick = async () => {
  try {
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

      // Convert audio to text
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const audioArrayBuffer = await audioBlob.arrayBuffer();
      const result = await whisperModel.transcribe(audioArrayBuffer);

      // Append transcript to textarea with clear spacing
      const cleanTranscript = result.text.trim();
      inputEl.value = (inputEl.value + "\n\n" + cleanTranscript).trim();

      micStatus.innerText = "🎤 Ready";
    }
  } catch (err) {
    console.error("Whisper recording error:", err);
    micStatus.innerText = "⚠️ Mic error";
  }
};
