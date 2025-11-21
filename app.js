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
// HELPER: Get selected tier
//--------------------------------------------------
function getSelectedTier() {
  const checked = document.querySelector('input[name="tier"]:checked');
  return checked ? checked.value : "intermediate";
}

//--------------------------------------------------
// HELPER: Render status / errors
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
// (Bold, line breaks, bullets, sections)
//--------------------------------------------------
function formatAIText(text) {
  if (!text) return "<p>Empty response from server.</p>";

  let html = text.trim();

  // Bold syntax: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Bullet points: - or * at line start → bullet symbol
  html = html.replace(/^\s*[-*]\s+/gm, "• ");

  // Convert double newlines to paragraphs
  html = html.replace(/\r\n/g, "\n"); // normalize
  html = html.replace(/\n{2,}/g, "</p><p>");

  // Convert remaining single newlines to <br>
  html = html.replace(/\n/g, "<br>");

  html = `<p>${html}</p>`;

  return html;
}

//--------------------------------------------------
// CLEAR BUTTON
//--------------------------------------------------
clearBtn.addEventListener("click", () => {
  inputEl.value = "";
  setResultsHtml(
    `<p class="placeholder">
      Your feedback will appear here after you press
      <strong>“Check My Writing”</strong>.
    </p>`
  );
});

//--------------------------------------------------
// MAIN: GRAMMAR CHECK (CALLS /api/grammar)
//--------------------------------------------------
checkBtn.addEventListener("click", async () => {
  const text = (inputEl.value || "").trim();

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
      headers: {
        "Content-Type": "application/json",
      },
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
    setResultsHtml(
      `<p>Sorry, something went wrong while checking your writing. 🙁</p>
       <p><small>${err.message}</small></p>`
    );
  } finally {
    setLoading(false);
  }
});

//--------------------------------------------------
// WHISPER WEB SPEECH-TO-TEXT
// (PLACEHOLDER – PASTE YOUR EXISTING WORKING BLOCK)
//--------------------------------------------------

/*
  🔊 IMPORTANT:

  You already have a working Whisper Web (base.en) setup:
  - Loads at page load
  - Records audio with MediaRecorder
  - Sends audio to Whisper
  - Appends transcription to the textarea
  - Updates micStatus

  To keep that working, do this:

  1. Find the Whisper code in your OLD app.js
     (everything related to model loading, MediaRecorder, etc.)

  2. Paste it inside this function, OR below this comment block,
     making sure it still uses:
       - micBtn
       - micStatus
       - inputEl

  3. If your old code had its own event listeners for micBtn,
     you can remove the empty listener below or adjust as needed.
*/

// Optional: a tiny stub so the button does something harmless
let isRecording = false;

micBtn.addEventListener("click", () => {
  // If you paste your full Whisper logic, you can delete this stub.
  if (!isRecording) {
    micStatus.textContent = "Mic: listening (stub – add Whisper code)";
  } else {
    micStatus.textContent = "Mic: off";
  }
  isRecording = !isRecording;
});
