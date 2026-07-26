# Study Bubbles — Quiz Trainer

A self-contained, static multiple-choice quiz trainer. No build step, no
backend — just HTML/CSS/JS. The site discovers your subjects and question
series at boot time by fetching a couple of small JSON files, so adding new
content is just: add files, no code changes.

Progress is saved in your browser's `localStorage`, so it survives
refreshes (but is per-device / per-browser, not synced across devices).

## Folder structure

```
index.html
style.css
app.js
subjects.json              ← list of subject folder names
economics-1/                ← one folder per subject, lives at the project root
  manifest.json             ← subject name + list of series files
  exam-1.json                ← one file per question series (e.g. one exam)
  assets/                    ← images used by this subject's questions
    graph_q12.png
    graph_q23.png
    ppf_q63.png
```

Currently loaded: **Economics 1** → one series, "Exam 1" (76 questions,
three with a diagram: Q12, Q23, Q63).

### `subjects.json` (project root)

A plain array of subject folder names:

```json
["economics-1"]
```

### `<subject-folder>/manifest.json`

```json
{
  "name": "Economics 1",
  "series": ["exam-1.json"]
}
```

`series` lists the filenames (inside that same folder) of each question
series belonging to this subject — e.g. one file per exam, midterm, past
paper, etc.

### `<subject-folder>/<series-file>.json`

```json
{
  "id": "exam-1",
  "name": "Exam 1",
  "questions": [
    {
      "id": "e1q1",
      "text": "When the competitive market is using its resources efficiently, the",
      "options": { "a": "...", "b": "...", "c": "...", "d": "...", "e": "..." },
      "answer": "c",
      "image": null
    }
  ]
}
```

- `id` — unique *within the subject* (used together with the subject folder
  name and question id to key saved progress).
- `text` — plain text prompt. A blank line followed by a block of lines
  starting with `|` renders as a simple table (handy for questions with a
  data table).
- `options` — object keyed `a`–`f` → option text.
- `answer` — the key of the correct option.
- `image` — path *relative to the subject folder* (e.g. `"assets/foo.png"`),
  or `null`.

## Adding a new question series (e.g. a new exam) to an existing subject

1. Drop a new file, e.g. `economics-1/exam-2.json`, following the schema above.
2. Add it to `economics-1/manifest.json`'s `series` array:
   ```json
   { "name": "Economics 1", "series": ["exam-1.json", "exam-2.json"] }
   ```
3. Done. The site will now show both series separately under "Economics 1",
   plus an automatic **"All series combined"** option that pools every
   series' questions into one run (this appears automatically whenever a
   subject has more than one series — no extra config needed).

## Adding a new subject

1. Create a new folder at the project root, e.g. `statistics-1/`.
2. Add `statistics-1/manifest.json` and at least one series file inside it,
   following the schemas above. Put any images in `statistics-1/assets/`.
3. Add `"statistics-1"` to the array in the root `subjects.json`.
4. Done — it'll show up as a new card on the home screen next time the
   site loads.

## Running it locally

Because the site now *fetches* JSON files at boot, it needs to be served
over `http://`, not opened directly as a `file://` URL (browsers block
`fetch` from local files). Serve it with any static server, e.g.:

```bash
cd study-bubbles
python3 -m http.server 8000
# then visit http://localhost:8000
```

If you see a "Couldn't load the question bank" error, this is almost
always the cause — check you're viewing it through `http://` or
`https://`, not a `file://` path.

## Publishing on GitHub Pages

1. Push all of these files (and folders) to your repository's root:
   ```bash
   git init
   git add .
   git commit -m "Initial quiz trainer"
   git branch -M main
   git remote add origin https://github.com/<your-username>/study-bubbles.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment → Source** →
   "Deploy from a branch" → branch `main`, folder `/ (root)` → Save.
3. Live at `https://<your-username>.github.io/study-bubbles/` within a
   minute or two. GitHub Pages serves everything over `https://`, so the
   fetch-based loading works exactly like it does locally.

## How progress tracking works

Every answer updates a correct/incorrect tally saved to `localStorage`
under the key `studyBubbles.progress.v2`, keyed by
`<subject folder>::<series id>::<question id>`. A question counts as
**mastered** once it's been answered correctly at least once with no
recorded misses since the last reset.

- The "↺ reset" button on a series clears saved stats for just that
  series' questions.
- "Review missed" filters a series (or the combined "all series" view)
  down to only the questions you've gotten wrong and haven't yet
  answered correctly since.
- The combined "all series" view records each answer against its
  question's real, original series — so resetting or reviewing an
  individual series afterwards stays accurate.

Because this is `localStorage`, clearing your browser data/cache, using a
different browser, or a private/incognito window will not show the same
progress.
