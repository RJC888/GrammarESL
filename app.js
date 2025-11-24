"use strict";

document.addEventListener("DOMContentLoaded", () => {

  // ==========================
  // DOM ELEMENTS
  // ==========================
  const inputTextEl = document.getElementById("inputText");
  const outputBoxEl = document.getElementById("outputBox");
  const levelSelect = document.getElementById("levelSelect");
  const inputLangSelect = document.getElementById("inputLangSelect");
  const explainLangSelect = document.getElementById("explainLangSelect");
  const checkBtn = document.getElementById("checkBtn");
  const clearBtn = document.getElementById("clearBtn");
  const micBtn = document.getElementById("micBtn");

   // ==========================
  // SPEECH RECOGNITION STATE  ← INSERT HERE
  // ==========================
  let recognition = null;
  let isRecordingSpeech = false;
  let finalText = "";
  let partialText = "";

  // ==========================
  // HELPERS
  // ==========================
  function setOutput(message) {
    if (!message) {
      outputBoxEl.innerHTML = `<p class="placeholder">Your feedback will appear here.</p>`;
    } else {
      outputBoxEl.innerHTML = `<pre style="white-space: pre-wrap; font-size: 17px;">${escapeHtml(message)}</pre>`;
    }
  }

  function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

  function setThinkingState() {
    setOutput("⏳ Analyzing your text…");
  }

  // ==========================
  // ENTER KEY HANDLING
  // ==========================
  if (inputTextEl) {
    inputTextEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (e.shiftKey) {
          // allow newline
          return;
        }
        // prevent newline
        e.preventDefault();
        handleCheckClick();
      }
    });
  }

  // ==========================
  // MAIN ACTION: CHECK
  // ==========================
  async function handleCheckClick() {
    const text = (inputTextEl.value || "").trim();
    if (!text) {
      setOutput("Please enter something first.");
      return;
    }

    const level = levelSelect.value;
    const inputLanguage = inputLangSelect.value;
    const explanationLanguage = explainLangSelect.value;

    const payload = {
      text,
      level,
      inputLanguage,
      correctionLanguage: inputLanguage,   // locked!
      explanationLanguage,
      source: isRecordingSpeech ? "speech" : "text"
    };

    try {
      setThinkingState();

      const response = await fetch("/api/grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setOutput("❗ The grammar coach had trouble responding.");
        return;
      }

      const data = await response.json();
      const feedback = data.feedback || "(No response received.)";
      setOutput(feedback);

    } catch (error) {
      console.error("Grammar API error:", error);
      setOutput("❗ Network or server error — please try again.");
    }
  }

  // ==========================
  // CLEAR
  // ==========================
  function handleClearClick() {
    inputTextEl.value = "";
    setOutput("");
    inputTextEl.focus();
  }

// ==========================
// MIC — REAL SPEECH RECOGNITION (final corrected version)
// ==========================
function handleMicClick() {
  if (!recognition) {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!window.SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    recognition = new window.SpeechRecognition();
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.lang = inputLangSelect.value;
  }

  if (!isRecordingSpeech) {
    // START RECORDING
    isRecordingSpeech = true;
    micBtn.textContent = "🛑 Stop";

    // Preserve already typed or pasted text
    finalText = inputTextEl.value.trim() + " ";
    partialText = "";

    recognition.start();

    recognition.onresult = (event) => {
      let transcript = event.results[0][0].transcript.trim();

      if (event.results[0].isFinal) {
        // Commit the final part
        finalText += transcript + " ";
        partialText = "";
      } else {
        // Display live partial speech
        partialText = transcript + " ";
      }

      // Update field
      inputTextEl.value = finalText + partialText;
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      isRecordingSpeech = false;
      micBtn.textContent = "🎙 Speak";
    };

    recognition.onend = () => {
      if (isRecordingSpeech) {
        recognition.start();
      }
    };

  } else {
    // STOP RECORDING
    isRecordingSpeech = false;
    micBtn.textContent = "🎙 Speak";
    recognition.stop();

    // REMOVE partial text if any
    inputTextEl.value = finalText.trim() + " ";
  }
}

  // ==========================
  // EVENT LISTENERS
  // ==========================
  checkBtn.addEventListener("click", handleCheckClick);
  clearBtn.addEventListener("click", handleClearClick);
  micBtn.addEventListener("click", handleMicClick);

  setOutput("");
});
