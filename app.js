// app.js
//--------------------------------------------------
// DOM Elements
//--------------------------------------------------
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const textInput = document.getElementById("textInput");
const tierSelect = document.getElementById("tierSelect");
const checkTextBtn = document.getElementById("checkTextBtn");
const resultsPanel = document.getElementById("resultsPanel");
const loadingIndicator = document.getElementById("loadingIndicator");

//--------------------------------------------------
// State
//--------------------------------------------------
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

//--------------------------------------------------
// Helper: set loading UI
//--------------------------------------------------
function setLoading(isLoading) {
  if (!loadingIndicator) return;
  loadingIndicator.style.display = isLoading ? "inline-block" : "none";
}

//--------------------------------------------------
// Helper: render AI result
//--------------------------------------------------
function setResultsHtml(html) {
  if (!resultsPanel) return;
  resultsPanel.innerHTML = html;
}

// Optional: simple formatter if you don't already have one
function formatAIText(text) {
  if (!text) return "";
  // Convert double newlines to paragraphs, single to <br>
  const paragraphs = text.split(/\n{2,}/).map((p) =>
    `<p>${p.replace(/\n/g, "<br>")}</p>`
  );
  return paragraphs.join("\n");
}

//--------------------------------------------------
// Helper: Blob → base64 (for sending audio to backend)
//--------------------------------------------------
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const dataUrl = reader.result; // "data:audio/mp4;base64,AAAA..."
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
// Core: send data to /api/grammar
//--------------------------------------------------
async function sendToGrammarAPI({ text = "", audioBlob = null, mimeType, tier }) {
  setLoading(true);
  setResultsHtml(`<p>Analyzing your English... ⏳</p>`);

  try {
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
    setResultsHtml(formatted);

    // Optionally show transcript under results if it came from audio
    if (data.transcript) {
      const transcriptHtml = `
        <hr>
        <p><strong>Transcribed Speech:</strong></p>
        <p>${data.transcript}</p>
      `;
      setResultsHtml(formatted + transcriptHtml);
    }
  } catch (err) {
    console.error("Grammar check failed:", err);
    setResultsHtml(`
      <p>Sorry, something went wrong while checking your writing. 🙁</p>
      <p><small>${err.message}</small></p>
    `);
  } finally {
    setLoading(false);
  }
}

//--------------------------------------------------
// Text-only flow: "Check My Writing" button
//--------------------------------------------------
if (checkTextBtn) {
  checkTextBtn.addEventListener("click", () => {
    const text = textInput ? textInput.value : "";
    const tier = tierSelect ? tierSelect.value : "A";

    if (!text || !text.trim()) {
      setResultsHtml(`<p>Please type something first. ✏️</p>`);
      return;
    }

    sendToGrammarAPI({ text, tier });
  });
}

//--------------------------------------------------
// Microphone flow: record → send audio to backend
//--------------------------------------------------
async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setResultsHtml(`<p>Your browser does not support microphone recording.</p>`);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Try formats in order: webm (Chrome) → mp4 (Safari)
    let chosenMime = "";
    if (typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        chosenMime = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        chosenMime = "audio/mp4";
      } else {
        chosenMime = "";
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
      try {
        const audioBlob = new Blob(audioChunks, {
          type: chosenMime || "audio/mp4",
        });
        const tier = tierSelect ? tierSelect.value : "A";
        await sendToGrammarAPI({
          audioBlob,
          mimeType: chosenMime || "audio/mp4",
          tier,
        });
      } catch (err) {
        console.error("Error handling recorded audio:", err);
        setResultsHtml(`
          <p>Sorry, there was a problem processing your recording.</p>
          <p><small>${err.message}</small></p>
        `);
      } finally {
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        isRecording = false;
        if (micBtn) micBtn.textContent = "🎙 Start Speaking";
        if (micStatus) micStatus.textContent = "";
      }
    };

    mediaRecorder.start();
    isRecording = true;
    if (micBtn) micBtn.textContent = "⏹ Stop Recording";
    if (micStatus) micStatus.textContent = "Recording... Speak now.";

  } catch (err) {
    console.error("Mic error:", err);
    setResultsHtml(`
      <p>Could not access the microphone.</p>
      <p><small>${err.message}</small></p>
    `);
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    if (micStatus) micStatus.textContent = "Processing your recording...";
  }
}

//--------------------------------------------------
// Mic button wiring
//--------------------------------------------------
if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  });
}
