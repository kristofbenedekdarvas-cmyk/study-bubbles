/* ============================================================
   Study Bubbles — multiple choice quiz trainer
   Content structure (fetched at boot, no build step):

     /subjects.json                → ["economics-1", "..."]
     /<subject-folder>/manifest.json  → { name, series: ["exam-1.json", ...] }
     /<subject-folder>/<series>.json  → { id, name, questions: [...] }
     /<subject-folder>/assets/*        → images referenced by questions

   Progress persists in localStorage so it survives refreshes.
   ============================================================ */

const STORAGE_KEY = "studyBubbles.progress.v2";
const ALL_SERIES_ID = "__all__";

const app = document.getElementById("app");
const crumbsEl = document.getElementById("crumbs");
document.getElementById("homeBtn").addEventListener("click", () => navigate({ view: "home" }));

let QUIZ_DATA = { subjects: [] };

/* ---------------- content loading ---------------- */

async function loadAllData() {
  const folders = await fetch("subjects.json").then(r => {
    if (!r.ok) throw new Error(`subjects.json (${r.status})`);
    return r.json();
  });

  const subjects = await Promise.all(folders.map(async folder => {
    const manifest = await fetch(`${folder}/manifest.json`).then(r => {
      if (!r.ok) throw new Error(`${folder}/manifest.json (${r.status})`);
      return r.json();
    });

    const seriesList = await Promise.all(manifest.series.map(async seriesFile => {
      const seriesData = await fetch(`${folder}/${seriesFile}`).then(r => {
        if (!r.ok) throw new Error(`${folder}/${seriesFile} (${r.status})`);
        return r.json();
      });
      seriesData.questions.forEach(q => {
        q.subjectId = folder;
        q.seriesId = seriesData.id;
        if (q.image) q.image = `${folder}/${q.image}`;
      });
      return seriesData;
    }));

    return { id: folder, folder, name: manifest.name, series: seriesList };
  }));

  return { subjects };
}

/* ---------------- progress storage ---------------- */
// key format: "<subjectId>::<seriesId>::<questionId>"

function progressKey(q) {
  return `${q.subjectId}::${q.seriesId}::${q.id}`;
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Could not read progress", e);
    return {};
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.error("Could not save progress", e);
  }
}

function getStats(q) {
  const p = loadProgress();
  return p[progressKey(q)] || { correct: 0, incorrect: 0 };
}

function recordAnswer(q, isCorrect) {
  const p = loadProgress();
  const key = progressKey(q);
  if (!p[key]) p[key] = { correct: 0, incorrect: 0 };
  if (isCorrect) p[key].correct += 1;
  else p[key].incorrect += 1;
  saveProgress(p);
}

function resetSeriesProgress(questions) {
  const p = loadProgress();
  questions.forEach(q => { delete p[progressKey(q)]; });
  saveProgress(p);
}

function statSummary(questions) {
  const p = loadProgress();
  let attempted = 0, mastered = 0;
  questions.forEach(q => {
    const s = p[progressKey(q)];
    if (s && (s.correct > 0 || s.incorrect > 0)) {
      attempted += 1;
      if (s.correct > 0 && s.incorrect === 0) mastered += 1;
    }
  });
  return { attempted, mastered, total: questions.length };
}

/* ---------------- helpers ---------------- */

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Very small markdown-ish table renderer for question text that embeds
// a pipe-table (used for a handful of questions with data tables).
function renderQuestionText(text) {
  const blocks = text.split(/\n\n+/);
  return blocks.map(block => {
    const lines = block.split("\n").filter(l => l.trim().length);
    const isTable = lines.length > 1 && lines.every(l => l.trim().startsWith("|"));
    if (isTable) {
      const rows = lines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()));
      const html = rows.map((row, i) => {
        const cells = row.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        const tag = i === 0 ? "th" : "td";
        return `<tr>${cells.map(c => `<${tag}>${escapeHtml(c)}</${tag}>`).join("")}</tr>`;
      }).join("");
      return `<table>${html}</table>`;
    }
    return `<div>${escapeHtml(block).replace(/\n/g, "<br>")}</div>`;
  }).join("");
}

const OPTION_ORDER = ["a", "b", "c", "d", "e", "f"];

/* ---------------- routing ---------------- */

let state = { view: "loading" };

function navigate(next) {
  state = next;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function findSubject(id) {
  return QUIZ_DATA.subjects.find(s => s.id === id);
}

// Returns the real series list plus, if there's more than one series,
// a synthetic "all series combined" entry at the front.
function seriesOptionsFor(subject) {
  const real = subject.series;
  if (real.length <= 1) return real;
  const combined = {
    id: ALL_SERIES_ID,
    name: "All series combined",
    isVirtual: true,
    questions: real.flatMap(s => s.questions)
  };
  return [combined, ...real];
}

function findSeries(subject, id) {
  return seriesOptionsFor(subject).find(s => s.id === id);
}

/* ---------------- render dispatch ---------------- */

function render() {
  renderCrumbs();
  if (state.view === "loading") return renderLoading();
  if (state.view === "error") return renderError();
  if (state.view === "home") return renderHome();
  if (state.view === "series-list") return renderSeriesList();
  if (state.view === "quiz") return renderQuiz();
  if (state.view === "summary") return renderSummary();
}

function renderLoading() {
  crumbsEl.innerHTML = "";
  app.innerHTML = `
    <div class="state-box">
      <div class="spinner"></div>
      Loading question bank…
    </div>`;
}

function renderError() {
  app.innerHTML = `
    <div class="state-box error">
      Couldn't load the question bank.<br>
      <span style="font-size:12px">${escapeHtml(state.message || "")}</span><br>
      <span style="font-size:12px">If you're opening this file directly (file://), serve it over http instead — e.g. <code>python3 -m http.server</code>.</span>
      <div><button class="btn btn-primary retry-btn" id="retryBtn">Try again</button></div>
    </div>`;
  document.getElementById("retryBtn").addEventListener("click", boot);
}

function renderCrumbs() {
  crumbsEl.innerHTML = "";
  if (state.view === "home" || state.view === "loading" || state.view === "error") return;

  const subject = state.subjectId ? findSubject(state.subjectId) : null;
  const parts = [];
  parts.push({ label: "Home", onClick: () => navigate({ view: "home" }) });
  if (subject) {
    parts.push({ label: subject.name, onClick: () => navigate({ view: "series-list", subjectId: subject.id }) });
  }
  if (state.view === "quiz" || state.view === "summary") {
    const series = findSeries(subject, state.seriesId);
    parts.push({ label: series.name, onClick: null });
  }

  parts.forEach((p, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "/";
      crumbsEl.appendChild(sep);
    }
    if (p.onClick) {
      const btn = document.createElement("button");
      btn.textContent = p.label;
      btn.addEventListener("click", p.onClick);
      crumbsEl.appendChild(btn);
    } else {
      const span = document.createElement("span");
      span.className = "current";
      span.textContent = p.label;
      crumbsEl.appendChild(span);
    }
  });
}

/* ---------------- home ---------------- */

function renderHome() {
  if (QUIZ_DATA.subjects.length === 0) {
    app.innerHTML = `
      <h1 class="page-title">No subjects yet</h1>
      <p class="page-sub">Add a folder for your subject at the project root, list it in
      <code>subjects.json</code>, and it'll show up here. See the README for the exact layout.</p>`;
    return;
  }

  const cards = QUIZ_DATA.subjects.map(subject => {
    const allQuestions = subject.series.flatMap(s => s.questions);
    const stat = statSummary(allQuestions);
    const pct = stat.total ? Math.round((stat.mastered / stat.total) * 100) : 0;
    return `
      <button class="subject-card" data-subject="${subject.id}">
        <div class="subject-name">${escapeHtml(subject.name)}</div>
        <div class="subject-meta">${subject.series.length} series · ${allQuestions.length} questions</div>
        <div class="subject-scorebox">${pct}% mastered</div>
      </button>`;
  }).join("");

  app.innerHTML = `
    <h1 class="page-title">Pick a subject</h1>
    <p class="page-sub">Bubble in your answer, get instant feedback, and pick up right where you left off.</p>
    <div class="subject-grid">${cards}</div>
  `;

  app.querySelectorAll(".subject-card").forEach(btn => {
    btn.addEventListener("click", () => navigate({ view: "series-list", subjectId: btn.dataset.subject }));
  });
}

/* ---------------- series list ---------------- */

function renderSeriesList() {
  const subject = findSubject(state.subjectId);
  const options = seriesOptionsFor(subject);

  const rows = options.map(series => {
    const stat = statSummary(series.questions);
    const pct = stat.total ? Math.round((stat.mastered / stat.total) * 100) : 0;
    const resetBtn = series.isVirtual
      ? ""
      : `<button class="btn btn-ghost" data-action="reset" data-series="${series.id}" title="Reset progress for this series">↺</button>`;
    return `
      <div class="chapter-row" data-series="${series.id}">
        <div class="chapter-info">
          <div class="chapter-name">${escapeHtml(series.name)}${series.isVirtual ? `<span class="badge-all">combined</span>` : ""}</div>
          <div class="chapter-count">${stat.mastered}/${stat.total} mastered · ${stat.attempted} attempted</div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="chapter-actions">
          <button class="btn btn-secondary" data-action="missed" data-series="${series.id}">Review missed</button>
          <button class="btn btn-primary" data-action="start" data-series="${series.id}">Start</button>
          ${resetBtn}
        </div>
      </div>`;
  }).join("");

  app.innerHTML = `
    <h1 class="page-title">${escapeHtml(subject.name)}</h1>
    <p class="page-sub">${options.length > 1 ? "Choose a series, or run them all together." : "Ready when you are."}</p>
    <div class="chapter-list">${rows}</div>
  `;

  app.querySelectorAll("[data-action='start']").forEach(btn => {
    btn.addEventListener("click", () => startQuiz(subject.id, btn.dataset.series, { onlyMissed: false }));
  });
  app.querySelectorAll("[data-action='missed']").forEach(btn => {
    btn.addEventListener("click", () => startQuiz(subject.id, btn.dataset.series, { onlyMissed: true }));
  });
  app.querySelectorAll("[data-action='reset']").forEach(btn => {
    btn.addEventListener("click", () => {
      const series = findSeries(subject, btn.dataset.series);
      if (confirm(`Reset all saved progress for "${series.name}"? This can't be undone.`)) {
        resetSeriesProgress(series.questions);
        renderSeriesList();
      }
    });
  });
}

/* ---------------- quiz session ---------------- */

let session = null;

function startQuiz(subjectId, seriesId, opts) {
  const subject = findSubject(subjectId);
  const series = findSeries(subject, seriesId);
  let pool = series.questions;

  if (opts.onlyMissed) {
    const p = loadProgress();
    pool = pool.filter(q => {
      const s = p[progressKey(q)];
      return s && s.incorrect > 0 && s.correct === 0;
    });
    if (pool.length === 0) {
      alert("No missed questions here yet — nice work! Showing all questions instead.");
      pool = series.questions;
    }
  }

  session = {
    subjectId, seriesId,
    questions: shuffle(pool),
    index: 0,
    sessionCorrect: 0,
    sessionIncorrect: 0,
    locked: false,
    selected: null,
    onlyMissed: opts.onlyMissed
  };

  navigate({ view: "quiz", subjectId, seriesId });
}

function renderQuiz() {
  const q = session.questions[session.index];
  const stats = getStats(q);

  const optionsHtml = OPTION_ORDER.filter(k => q.options[k]).map(key => {
    return `
      <button class="option" data-key="${key}">
        <span class="bubble">${key}</span>
        <span class="option-text">${escapeHtml(q.options[key])}</span>
      </button>`;
  }).join("");

  app.innerHTML = `
    <div class="quiz-header">
      <span>Question ${session.index + 1} of ${session.questions.length}${session.onlyMissed ? " · reviewing missed" : ""}</span>
      <span class="quiz-scoreboard">
        <span>session: <b>${session.sessionCorrect}</b>✓ <b>${session.sessionIncorrect}</b>✗</span>
        <span>lifetime: <b>${stats.correct}</b>✓ <b>${stats.incorrect}</b>✗</span>
      </span>
    </div>
    <div class="qcard">
      <div class="q-index">${escapeHtml(q.subjectId)} · ${escapeHtml(q.seriesId)} · ${escapeHtml(q.id)}</div>
      <div class="q-text">${renderQuestionText(q.text)}</div>
      ${q.image ? `<img class="q-image" src="${q.image}" alt="Diagram for this question">` : ""}
      <div class="options">${optionsHtml}</div>
      <div class="feedback-row" id="feedbackRow" style="display:none">
        <span class="feedback-text" id="feedbackText"></span>
        <button class="btn btn-primary" id="nextBtn">Next question →</button>
      </div>
    </div>
  `;

  app.querySelectorAll(".option").forEach(btn => {
    btn.addEventListener("click", () => selectOption(q, btn.dataset.key));
  });
}

function selectOption(question, key) {
  if (session.locked) return;
  session.locked = true;
  session.selected = key;
  const isCorrect = key === question.answer;

  recordAnswer(question, isCorrect);
  if (isCorrect) session.sessionCorrect += 1; else session.sessionIncorrect += 1;

  app.querySelectorAll(".option").forEach(btn => {
    btn.classList.add("locked");
    const k = btn.dataset.key;
    if (k === question.answer) btn.classList.add("correct");
    else if (k === key) btn.classList.add("incorrect");
  });

  const feedbackRow = document.getElementById("feedbackRow");
  const feedbackText = document.getElementById("feedbackText");
  feedbackRow.style.display = "flex";
  feedbackText.textContent = isCorrect
    ? "Correct!"
    : `Not quite — correct answer is ${question.answer.toUpperCase()}.`;
  feedbackText.className = "feedback-text " + (isCorrect ? "correct-txt" : "incorrect-txt");

  const nextBtn = document.getElementById("nextBtn");
  const isLast = session.index === session.questions.length - 1;
  nextBtn.textContent = isLast ? "See results →" : "Next question →";
  nextBtn.addEventListener("click", () => {
    if (isLast) {
      navigate({ view: "summary", subjectId: session.subjectId, seriesId: session.seriesId });
    } else {
      session.index += 1;
      session.locked = false;
      session.selected = null;
      renderQuiz();
    }
  });

  document.onkeydown = (e) => {
    if (e.key === "Enter") nextBtn.click();
  };
}

/* ---------------- summary ---------------- */

function renderSummary() {
  const subject = findSubject(state.subjectId);
  const series = findSeries(subject, state.seriesId);
  const total = session.sessionCorrect + session.sessionIncorrect;
  const pct = total ? Math.round((session.sessionCorrect / total) * 100) : 0;

  app.innerHTML = `
    <div class="summary-card">
      <div class="summary-title">Round complete</div>
      <p class="page-sub" style="margin-bottom:0;">${escapeHtml(series.name)} — ${escapeHtml(subject.name)}</p>
      <div class="summary-score">${session.sessionCorrect}/${total} <span>(${pct}%)</span></div>
      <div class="summary-actions">
        <button class="btn btn-primary" id="retryAll">Go again</button>
        <button class="btn btn-secondary" id="retryMissed">Review missed only</button>
        <button class="btn btn-ghost" id="backToSeries">Back to series list</button>
      </div>
    </div>
  `;

  document.getElementById("retryAll").addEventListener("click", () => startQuiz(subject.id, series.id, { onlyMissed: false }));
  document.getElementById("retryMissed").addEventListener("click", () => startQuiz(subject.id, series.id, { onlyMissed: true }));
  document.getElementById("backToSeries").addEventListener("click", () => navigate({ view: "series-list", subjectId: subject.id }));
}

/* ---------------- boot ---------------- */

async function boot() {
  state = { view: "loading" };
  render();
  try {
    QUIZ_DATA = await loadAllData();
    navigate({ view: "home" });
  } catch (e) {
    console.error(e);
    state = { view: "error", message: e.message };
    render();
  }
}

boot();
