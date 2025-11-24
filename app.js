//--------------------------------------------------
// DOM Elements (matching your HTML)
//--------------------------------------------------
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const textInput = document.getElementById("inputText");
const checkTextBtn = document.getElementById("checkBtn");
const clearBtn = document.getElementById("clearBtn");
const resultsPanel = document.getElementById("results");

//--------------------------------------------------
// State
//--------------------------------------------------
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

//--------------------------------------------------
// Helper: determine selected tier (simple/intermediate/advanced)
//--------------------------------------------------
function getSelectedTier() {
  const radios = document.querySelectorAll("input[name='tier']");
  for (let r of radios) {
    if (r.checked) return r.value;
  }
  return "intermediate";
}

//--------------------------------------------------
// Helper: set results HTML
//--------------------------------------------------
function setResultsHtml(html) {
  resultsPanel.innerHTML = html;
}

//--------------------------------------------------
// Helper: Blob → base64
//--------------------------------------------------
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const dataUrl = reader.result;
        const base64 = String(dataUrl).split(",")[1];
        resolve(base64);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

//--------------------------------------------------
// Format AI text nicely for HTML
//--------------------------------------------------
function formatAIText(text) {
  if (!text) return "";
  const paragraphs = text.split(/\n{2,}/).map((p) =>
    `<p>${p.replace(/\n/g, "<br>")}</p>`
  );
  return paragraphs.join("\n");
}

//--------------------------------------------------
// Core: send text or audio to backend
//--------------------------------------------------
async function sendToGrammarAPI({ text = "", audioBlob = null, mimeType }) {
  setResultsHtml(`<p>Analyzing your English... ⏳</p>`);

  try {
    const tier = getSelectedTier();
    let payload = { tier };

    if (text && text.trim()) {
      payload.text = text.trim();
    } else if (audioBlob) {
      const audioBase64 = await blobToBase64(audioBlob);
      payload.audioBase64 = audioBase64;
      payload.mimeType = mimeType || "audio/mp4";
    } else {
      throw new Error("No text or audio to send.");
    }

    const response = await fetch("/api/grammar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

    let transcriptBlock = "";
    if (data.transcript) {
      transcriptBlock = `
        <hr>
        <p><strong>What I heard you say:</strong></p>
        <p>${data.transcript}</p>
      `;
    }

    setResultsHtml(formatted + transcriptBlock);

  } catch (err) {
    console.error("Grammar check failed:", err);
    setResultsHtml(`
      <p>Sorry, something went wrong.</p>
      <p><small>${err.message}</small></p>
    `);
  }
}

//--------------------------------------------------
// TEXT button: "Check My Writing"
//--------------------------------------------------
checkTextBtn.addEventListener("click", () => {
  const text = textInput ? textInput.value : "";
  if (!text || !text.trim()) {
    setResultsHtml(`<p>Please type something first. ✏️</p>`);
    return;
  }
  sendToGrammarAPI({ text });
});

//--------------------------------------------------
// CLEAR button resets everything
//--------------------------------------------------
clearBtn.addEventListener("click", () => {
  if (textInput) textInput.value = "";
  setResultsHtml(`<p class="placeholder">Your feedback will appear here after you press <strong>“Check My Writing”</strong>.</p>`);
});

//--------------------------------------------------
// MIC logic: start/stop recording
//--------------------------------------------------
async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setResultsHtml(`<p>Your browser does not support microphone recording.</p>`);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // prefer webm, fallback to mp4 (Safari)
    let chosenMime = "";
    if (typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        chosenMime = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        chosenMime = "audio/mp4";
      }
    }

    const options = chosenMime ? { mimeType: chosenMime } : undefined;
    mediaRecorder = new MediaRecorder(stream, options);

    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, {
        type: chosenMime || "audio/mp4",
      });

      await sendToGrammarAPI({
        audioBlob,
        mimeType: chosenMime || "audio/mp4",
      });

      // Release the mic:
      if (stream) stream.getTracks().forEach((t) => t.stop());
      isRecording = false;
      micBtn.textContent = "🎤 Tap to Speak";
      micStatus.textContent = "Mic: off";
    };

    mediaRecorder.start();
    isRecording = true;
    micBtn.textContent = "⏹ Stop";
    micStatus.textContent = "Recording... Speak now";

  } catch (err) {
    console.error("Mic error:", err);
    setResultsHtml(`<p>Could not access the microphone.</p>`);
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    micStatus.textContent = "Processing...";
    mediaRecorder.stop();
  }
}

//--------------------------------------------------
// Mic button handler
//--------------------------------------------------
micBtn.addEventListener("click", () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});
