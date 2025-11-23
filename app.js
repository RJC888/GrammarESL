console.log("🔥 RUNNING RAW-PCM WHISPER VERSION OF app.js");

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

// State for Whisper (Transformers.js)
let asrPipeline = null;
let asrLoading = false;

// RAW AUDIO CAPTURE STATE (no MediaRecorder)
let audioContext = null;
let mediaStream = null;
let mediaSource = null;
let processorNode = null;
let isRecording = false;
let recordedChunks = []; // array of Float32Array
let recordedSampleRate = 16000;

//--------------------------------------------------
// LOAD WHISPER MODEL ONCE
//--------------------------------------------------
async function loadWhisperModelOnce() {
  if (asrPipeline) return asrPipeline;
  if (asrLoading) return null;

  let pipeline = window.transformersPipeline;
  let retries = 0;

  while (!pipeline && retries < 50) {
    await new Promise((r) => setTimeout(r, 100));
    pipeline = window.transformersPipeline;
    retries++;
  }

  if (!pipeline) {
    console.error("❌ transformersPipeline not available on window");
    micStatus.innerText = "⚠ Speech model unavailable";
    return null;
  }

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
    console.error("Error loading Whisper model:", err);
    micStatus.innerText = "⚠ Error loading speech model";
    return null;
  } finally {
    asrLoading = false;
  }
}

window.addEventListener("load", () => {
  loadWhisperModelOnce();
});

//--------------------------------------------------
// UTIL — RESAMPLE TO 16kHz (simple, good enough)
//--------------------------------------------------
function resampleTo16k(input, inputSampleRate) {
  const targetRate = 16000;
  if (inputSampleRate === targetRate) {
    return input;
  }
  const ratio = inputSampleRate / targetRate;
  const newLength = Math.round(input.length / ratio);
  const output = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    output[i] = input[Math.floor(i * ratio)];
  }
  return output;
}

//--------------------------------------------------
// START RAW-PCM CAPTURE (NO MEDIARECORDER)
//--------------------------------------------------
async function startRawRecording() {
  try {
    recordedChunks = [];

    // 1. Make audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    recordedSampleRate = audioContext.sampleRate;

    // 2. Get mic stream
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaSource = audioContext.createMediaStreamSource(mediaStream);

    // 3. Create ScriptProcessorNode to grab PCM chunks
    // buffer size 4096, 1 input channel, 1 output channel
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    processorNode.onaudioprocess = (event) => {
      if (!isRecording) return;
      const inputBuffer = event.inputBuffer;
      const channelData = inputBuffer.getChannelData(0);

      // Copy data out so we don't hold onto AudioBuffer internals
      const chunk = new Float32Array(channelData.length);
      chunk.set(channelData);
      recordedChunks.push(chunk);
    };

    // 4. Connect graph
    mediaSource.connect(processorNode);
    // Some browsers require processor to connect to destination to run
    processorNode.connect(audioContext.destination);

    isRecording = true;
    micBtn.innerText = "⏸️";
    micStatus.innerText = "🎙 Recording… tap again to stop";
  } catch (err) {
    console.error("Error starting raw recording:", err);
    micStatus.innerText = "⚠️ Mic permission or audio error";
  }
}

//--------------------------------------------------
// STOP RAW-PCM CAPTURE, BUILD FLOAT32, RUN WHISPER
//--------------------------------------------------
async function stopRawRecordingAndTranscribe() {
  try {
    isRecording = false;

    if (processorNode) {
      processorNode.disconnect();
      processorNode.onaudioprocess = null;
    }
    if (mediaSource) {
      mediaSource.disconnect();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }

    if (audioContext) {
      try {
        await audioContext.close();
      } catch (e) {
        console.warn("Error closing audioContext:", e);
      }
    }

    micStatus.innerText = "⏳ Processing speech…";

    // Join all chunks into one big Float32Array
    let totalLength = 0;
    for (const chunk of recordedChunks) {
      totalLength += chunk.length;
    }
    const fullPcm = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of recordedChunks) {
      fullPcm.set(chunk, offset);
      offset += chunk.length;
    }

    if (fullPcm.length === 0) {
      micStatus.innerText = "⚠️ No audio captured";
      return;
    }

    // Resample to 16kHz for Whisper
    const resampled = resampleTo16k(fullPcm, recordedSampleRate);

    // Make sure Whisper is ready
    if (!asrPipeline) {
      await loadWhisperModelOnce();
      if (!asrPipeline) {
        micStatus.innerText = "⚠️ Speech model unavailable";
        return;
      }
    }

    // Run Whisper on raw PCM
    const result = await asrPipeline({
      audio: resampled,
      sampling_rate: 16000,
    });

    const transcriptText =
      (result && result.text) ||
      (Array.isArray(result) && result[0] && result[0].text) ||
      "";

    const cleanTranscript = transcriptText.trim() || "[no speech recognized]";

    // Append to text area
    inputEl.value = (inputEl.value + "\n\n" + cleanTranscript).trim();
    micStatus.innerText = "🎤 Ready";
  } catch (err) {
    console.error("Whisper recording error:", err);
    micStatus.innerText = "⚠️ Mic error";
  } finally {
    // Reset references
    audioContext = null;
    mediaStream = null;
    mediaSource = null;
    processorNode = null;
    recordedChunks = [];
  }
}

//--------------------------------------------------
// MIC BUTTON HANDLER — TOGGLE RECORD / TRANSCRIBE
//--------------------------------------------------
micBtn.onclick = async () => {
  try {
    if (!isRecording) {
      // Start recording
      await startRawRecording();
    } else {
      // Stop and transcribe
      micBtn.innerText = "🎤";
      await stopRawRecordingAndTranscribe();
    }
  } catch (err) {
    console.error("Whisper micBtn onclick error:", err);
    micStatus.innerText = "⚠️ Mic error";
  }
};
