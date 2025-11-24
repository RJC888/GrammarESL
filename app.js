//--------------------------------------------------
// DOM Elements
//--------------------------------------------------
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const textInput = document.getElementById("inputText");
const checkTextBtn = document.getElementById("checkBtn");
const clearBtn = document.getElementById("clearBtn");
const resultsPanel = document.getElementById("results");

//--------------------------------------------------
// Browser Speech Recognition
//--------------------------------------------------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    micStatus.textContent = "Listening...";
    micBtn.textContent = "⏹ Stop";
  };

  recognition.onend = () => {
    micStatus.textContent = "Mic: off";
    micBtn.textContent = "🎤 Tap to Speak";
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    setResultsHtml(`<p>Speech recognition error: ${event.error}</p>`);
  };

  recognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript;
    textInput.value = spokenText;
    console.log("Recognized:", spokenText);

    // Immediately send to backend for grammar analysis
    sendTextToGrammar();
  };
} else {
  micStatus.textContent = "Speech recognition not supported";
  micBtn.disabled = true;
}

//--------------------------------------------------
// Helper: set results HTML
//--------------------------------------------------
function setResultsHtml(html) {
  resultsPanel.innerHTML = html;
}

//--------------------------------------------------
// Grammar send function (text only)
//--------------------------------------------------
async function sendTextToGrammar() {
  setResultsHtml(`<p>Analyzing your English... ⏳</p>`);

  try {
    const tier = getSelectedTier();
    const text = textInput.value.trim();

    const response = await fetch("/api/grammar", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ text, tier }),
    });

    const data = await response.json();
    const formatted = formatAIText(data.text);
    setResultsHtml(formatted);

  } catch (err) {
    setResultsHtml(`<p>Sorry, something went wrong.</p>
    <p><small>${err.message}</small></p>`);
  }
}

//--------------------------------------------------
// Helper: tier selection
//--------------------------------------------------
function getSelectedTier() {
  const radios = document.querySelectorAll("input[name='tier']");
  for (let r of radios) {
    if (r.checked) return r.value;
  }
  return "intermediate";
}

//--------------------------------------------------
// Helper: format AI text
//--------------------------------------------------
function formatAIText(text) {
  if (!text) return "";
  const paragraphs = text.split(/\n{2,}/).map((p) =>
    `<p>${p.replace(/\n/g, "<br>")}</p>`
  );
  return paragraphs.join("\n");
}

//--------------------------------------------------
// Button: manual "Check My Writing"
//--------------------------------------------------
checkTextBtn.addEventListener("click", sendTextToGrammar);

//--------------------------------------------------
// Button: Clear
//--------------------------------------------------
clearBtn.addEventListener("click", () => {
  textInput.value = "";
  setResultsHtml(`<p class="placeholder">
    Your feedback will appear here after you press <strong>“Check My Writing”</strong>.
  </p>`);
});

//--------------------------------------------------
// Mic Button
//--------------------------------------------------
micBtn.addEventListener("click", () => {
  if (!recognition) return;

  if (micBtn.textContent.includes("Tap")) {
    recognition.start();
  } else {
    recognition.stop();
  }
});
