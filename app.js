
//--------------------------------------------------
// DOM Elements
//--------------------------------------------------
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const textInput = document.getElementById("textInput");
const checkBtn = document.getElementById("checkBtn");



//--------------------------------------------------
//--------------------------------------------------
// Whisper In-Browser Speech Recognition
//--------------------------------------------------
//--------------------------------------------------
// Whisper In-Browser Speech Recognition
//--------------------------------------------------

let audioRecorder;
let audioChunks = [];
let whisperModel;
let isRecording = false;

// Load Whisper model once (on page load)
(async () => {
  micStatus.innerText = "⏳ Loading speech model… (first time only)";
  whisperModel = await whisper.loadModel("base.en"); 
  micStatus.innerText = "🎤 Ready to record";
})();

// Start/Stop microphone
micBtn.onclick = async () => {
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

    // Put transcript into textarea
    textInput.value = (textInput.value + " " + result.text).trim();
    micStatus.innerText = "🎤 Ready";
  }
};

//--------------------------------------------------
// AI Markdown → HTML Formatter   <-- PUT IT HERE
//--------------------------------------------------
function formatAIText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>")
    .replace(/^\s*[-•]\s+/gm, "• ");
}

//--------------------------------------------------
// REAL AI Grammar Check (OpenAI)   <-- KEEP THIS BELOW
//--------------------------------------------------
checkBtn.onclick = async () => {
  const text = textInput.value.trim();
  const resultsDiv = document.getElementById("results");

  if (!text) {
    alert("Please type or dictate something first.");
    return;
  }

  resultsDiv.innerHTML = "⏳ Analyzing your writing with AI...";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly, patient ESL grammar coach. When the student submits text, ALWAYS answer using the clear format below. Make every explanation so simple that even a child could understand it. Use short sentences, easy words, and a warm, encouraging tone.\n\n" +

              "**Corrected Version:**\n" +
              "Give the corrected version of the student’s writing. Keep it natural, simple, and clear.\n\n" +

              "**List of Errors:**\n" +
              "Give a numbered list of all grammar, spelling, punctuation, word choice, and clarity mistakes.\n\n" +

              "**Explanation of Errors:**\n" +
              "For each error:\n" +
              "1. Say what the mistake was.\n" +
              "2. Explain WHY it is wrong using very simple ESL-friendly language.\n" +
              "3. Give the rule in a child-friendly way (no big grammar terms).\n\n" +

              "**Mini-Lesson:**\n" +
              "Give a short, simple lesson explaining the main grammar idea the student needs. Use easy examples and very clear steps.\n\n" +

              "**Example Sentence:**\n" +
              "Write one short example sentence that shows the correct grammar.\n\n" +

              "**Practice Tip:**\n" +
              "Give one easy, practical tip the student can use to improve this specific skill.\n\n" +

              "Your tone must always be friendly, supportive, and easy for English learners. Avoid long paragraphs. Be clear, simple, and encouraging."
          },
          {
            role: "user",
            content: text
          }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      resultsDiv.innerHTML = "❗ AI Error: " + data.error.message;
      return;
    }

    const aiText = data.choices[0].message.content;
    resultsDiv.innerHTML = formatAIText(aiText);

  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = "❗ Could not reach AI. Check your API key or internet.";
  }

};  // <-- THIS closes checkBtn.onclick. You were missing it!


//--------------------------------------------------
// Clear Button
//--------------------------------------------------
document.getElementById("clearBtn").onclick = () => {
  textInput.value = "";
  document.getElementById("results").innerHTML = "";
  micStatus.innerText = "Click the microphone to start dictation";
  micBtn.innerText = "🎤";

  isRecording = false;  // only this remains
};
