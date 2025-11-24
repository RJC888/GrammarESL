// app.js
// Front-end logic for Grammar Coach
// -------------------------------------------------

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  //--------------------------------------------------
  // DOM ELEMENTS
  //--------------------------------------------------
  const inputTextEl = document.getElementById("inputText");
  const micBtn = document.getElementById("micBtn");
  const micStatusEl = document.getElementById("micStatus");
  const nativeLanguageSelect = document.getElementById("nativeLanguage");
  const statusMessageEl = document.getElementById("statusMessage");
  const resultsEl = document.getElementById("results");
  const checkBtn = document.getElementById("checkBtn");
  const clearBtn = document.getElementById("clearBtn");

  //--------------------------------------------------
  // STATE
  //--------------------------------------------------
  let isRecording = false; // planned for future voice input

  //--------------------------------------------------
  // HELPERS
  //--------------------------------------------------

  function getSelectedRadio(name, defaultValue) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    for (const r of radios) {
      if (r.checked) return r.value;
    }
    return defaultValue;
  }

  function setStatus(message, type = "info") {
    if (!statusMessageEl) return;

    statusMessageEl.textContent = message || "";
    statusMessageEl.classList.remove("status-info", "status-error", "status-success");

    if (type === "error") {
      statusMessageEl.classList.add("status-error");
    } else if (type === "success") {
      statusMessageEl.classList.add("status-success");
    } else {
      statusMessageEl.classList.add("status-info");
    }
  }

  function setResults(markup) {
    if (!resultsEl) return;
    if (!markup) {
      resultsEl.innerHTML =
        '<p class="placeholder">Your friendly grammar coach feedback will appear here.</p>';
      return;
    }
    resultsEl.innerHTML = markup;
  }

  //--------------------------------------------------
  // MAIN ACTION: CHECK TEXT
  //--------------------------------------------------

  async function handleCheckClick() {
    const text = (inputTextEl.value || "").trim();

    if (!text) {
      setStatus("Type something first!", "error");
      return;
    }

    const tier = getSelectedRadio("tier", "simple");
    const focus = getSelectedRadio("focus", "grammar");
    const nativeLanguage = nativeLanguageSelect.value || "English";

    const payload = {
      text,
      tier,
      focus,
      nativeLanguage,
      source: "text",
    };

    try {
      setStatus("Getting feedback from Grammar Coach…", "info");
      setResults('<p class="placeholder">Analyzing… ⏳</p>');

      const response = await fetch("/api/grammar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error:", errorText);
        throw new Error("The grammar coach had a problem responding.");
      }

      const data = await response.json();
      const feedback = data.feedback || "(No feedback returned.)";

      setStatus("Done. See feedback below.", "success");

      const html = `<pre class="feedback-text">${escapeHtml(feedback)}</pre>`;
      setResults(html);
    } catch (err) {
      console.error("Grammar check error:", err);
      setStatus(
        "Sorry — something went wrong. Check your network connection and try again.",
        "error"
      );
      setResults("");
    }
  }

  //--------------------------------------------------
  // CLEAR BUTTON
  //--------------------------------------------------

  function handleClearClick() {
    inputTextEl.value = "";
    setStatus("");
    setResults("");
    inputTextEl.focus();
  }

  //--------------------------------------------------
  // MIC BUTTON (STUB ONLY)
  //--------------------------------------------------

  function handleMicClick() {
    isRecording = !isRecording;
    if (isRecording) {
      micStatusEl.textContent = "Mic feature coming soon — please type for now.";
    } else {
      micStatusEl.textContent = "Mic off";
    }
  }

  //--------------------------------------------------
  // UTILITY: ESCAPE HTML
  //--------------------------------------------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  //--------------------------------------------------
  // EVENT LISTENERS
  //--------------------------------------------------

  if (checkBtn) {
    checkBtn.addEventListener("click", handleCheckClick);
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", handleClearClick);
  }

  if (micBtn) {
    micBtn.addEventListener("click", handleMicClick);
  }

  if (inputTextEl) {
    inputTextEl.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleCheckClick();
      }
    });
  }

  setResults(""); // initialize
});
