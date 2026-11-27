# GMO Résumé Manager

A resume and experience tracker: keep your roles, achievements, education, projects and
skills in one place, watch the resume build itself live, and export it as PDF, DOCX, TXT,
Markdown or JSON. Dark by default, with a greenish palette, yellow-orange headings and an
animated WebGL backdrop.

Live: https://drifter1987.github.io/gmo-resume-manager/

## What it does

- **One dock** — there is no top header. The section tabs, the brand, the saved status, the build
  number and the three quick actions (Save, Import, Export) share a single bar fixed at the bottom:
  one row on a desktop, two rows on a phone. The sections are Profile, Experience, Education (with
  Certifications inside), Projects, Skills, Screening and Settings.
- **Profile** — name, headline, contact details and a short summary, plus the fields the selected
  market expects: a photo, nationality, visa or residency status, availability, date of birth and
  marital status appear only where that market wants them (required in the GCC, right-to-work in ANZ,
  optional in EMEA/APAC/LATAM, hidden for the US).
- **Guided mode** — an optional panel at the top of the builder that walks through the resume in the order
  the checks read it, with a progress bar, done/not-done per step and Back / Open section / Next.
- **App tour** — ten stops highlighting the dock, builder, preview, region button, issues toggle, Save,
  Import, Export, Screening and Settings. Runs once on a first visit, replayable from Settings → Guidance.
- **Experience** — roles with dates, a "still work here" toggle, one-line-per-bullet
  highlights and tags.
- **Education**, **Certifications**, **Projects**, **Skills** — repeatable, reorderable entries.
  Certifications carry issuer, issue date, expiry and a credential link, and render on the resume
  as a four-column table under Education.
- **Live preview** — updates on every keystroke and every settings change.
- **Export** — inside Settings, one panel where any combination of PDF, DOCX, PNG, TXT, Markdown
  and JSON can be ticked; Download produces the file (or a ZIP for several) and hands it to the
  system share sheet on a phone. PNG export draws one image per A4 page.
- **Settings** — dark/light theme, resume typeface, density, section visibility, storage usage,
  a data reset, the export panel, the saved-version history, and the release notes and changelog.
- **Readable and reachable** — a toast is announced as a live region, every note under a field is read
  out with that field, a section change moves focus to the panel and names it, a line the regulations
  check marks opens with Enter, the scoring guide keeps focus inside itself while it is open, and the
  small controls grow to a finger on a phone.
- **History** — a Save button (or Cmd/Ctrl+S) snapshots the whole resume into the browser:
  up to 40 versions, each with restore, download and delete.
- **Screening** — a tab that scores the resume against the methods recruiters actually use: ATS
  parsing, the recruiter skim, a rubric against the advert's keywords, achievements, timeline
  gaps, STAR readiness, skills, verifiable certifications, working portfolio links, a
  blind-screening view, and length. The LLM section builds a ready-to-send prompt to paste into
  any chat model next to the exported .md file. Tapping a finding scrolls the live preview to
  the exact role, entry or line it concerns and keeps it highlighted until the tab is left.
- **Hiring regions** — a region button in the preview header (EMEA, US, GCC, APAC, LATAM, ANZ) sets the
  rules the resume is judged by: the page ceiling, whether nationality, visa status or a photo belong on
  the page, the language levels that market notices, and how references are handled. The Regional fit
  check is scored against that market, and the AI prompt is rewritten with the market's checklist. The
  same choice is also in Screening.
- **A headline weighted by market** — the score at the top of Screening is one number, a weighted
  average: each check counts by a multiplier set for the selected region, the market's own rules carry
  the largest share (×4), and the rest are tuned to what that market screens hardest. The guide lists
  every multiplier, so the headline can be recomputed by hand.
- **Folding checks** — every check card collapses to its score, name and verdict; anything with a
  warning or a failure opens itself, and Expand all / Collapse all sit above the list.
- **Published standards** — every check names the source behind it ("Based on: …"), from Jobscan's 75%
  match target and the EDLIGO and Jobscan surveys Coversentry compiles, to the Ladders eye-tracking
  study, Sackett et al. 2022 on structured-interview validity, NACE Job Outlook 2026 on skills-based
  hiring, the ResumeGo length study, and NYC Local Law 144 with the EU AI Act. The scoring guide lists
  them all with what each says, an evidence label — peer-reviewed, government guidance, industry study,
  vendor guidance, vendor data or regulation — and the rule it set. Their claims were re-checked against
  the sources in 2.15.0: NACE's figures were corrected, the EU AI Act date is now settled law (the AI
  Omnibus entered into force on 27 July 2026), and the Ladders and ResumeGo studies are described with
  the limits of their samples. The guide also states what the research does not support: the "75% of
  resumes are rejected by an ATS" claim traces to a vendor that shut down in 2013 and is used nowhere in
  the app.
- **Region scoring guide** — "How each region is scored", opened from Screening and from Settings, is one
  window with a collapsible section per market: the live score for this resume, an introduction to what
  that market reads for, then each scoring criterion as a subtitle with what it expects, how the app
  measures it, what passes and the points it carries, followed by the expectations the other checks
  already cover and the recruiter's checklist for that market.
- **Expired certificates warn, they do not score** — published guidance (Rezi, ResumeMate,
  Resumly, the Jobscan date rules) treats a lapsed certificate as an accuracy problem with three
  fixes: renew it, remove it, or label it expired or renewal in progress. The Certifications
  check therefore warns without removing points, and the regulations toggle marks it amber, not
  red.
- **Regulations check** — a toggle in the preview header marks every field that breaks a resume
  convention: missing name, contact line or summary, a missing or reversed date, a bullet over 40
  words, an expired certificate, a malformed link, a duplicated skill. Missing header fields show
  as dashed placeholders, and tapping a marked line opens that field in the editor.
- **Load a resume from JSON** — Settings → Data takes a pasted resume JSON and replaces every field
  at once, with the replaced version kept in History. Handy on a phone, where a file would otherwise
  have to go through the share sheet first.
- **Full backup with photo** — one .json with every field, every setting and the profile portrait at full
  quality: the small display copy for the paper, plus the upload kept whole. Import it on another device
  and the resume returns as it was, picture included. Markdown and TXT exports carry the same snapshot.
- **Sync across regions** — a switch in the Hiring region block in Screening and in the region menu of the
  preview header, so it is in reach while filling Profile. On, every edit reaches all six markets at once.
  Off, each market keeps its own text: the one you leave is saved, the one you open is loaded, and every
  field in the builder then says what the other markets hold there — quoting them, naming the market, and
  offering to open it — so a difference is answered at the field it is about rather than by a general
  warning. Factual fields (name, contact details, employers, dates, certificates) are marked when another
  market says something else; wording that may legitimately differ is a quiet note. Turning sync back on
  keeps the other markets' texts instead of deleting them, says it keeps them, and brings them back when
  sync goes off again. The region menu shows a dot per market — editing here, its own text, the same text,
  or not started — and carries the two explicit actions: copy this text to every region, or discard the
  kept texts. Per-region texts travel inside every export and the full backup.
- **Context-aware checks** — free text is read for what it states, not for words that appear in it:
  "open to relocation" is not a nationality, "citizen developer" is not a passport, "single-page
  application" is not a marital status, "Chinese wall" is not a Chinese passport. The nationality list runs
  worldwide — territories and diaspora groups included — and reads country names too, so "nationality:
  Germany" and "citizen of Lebanon" count. Findings quote the phrase that triggered them, and the structured
  region fields always take priority over anything read from the summary.
- **Timeline and study years** — a gap between roles that falls inside a degree, a language course
  or a preparation year counts as covered time, and a bare year as an end date reads as December.

## Exports and round trips

| Format | What it is | Imports back |
| --- | --- | --- |
| PDF | Real PDF built with jsPDF, A4, selectable text | yes (snapshot in the keywords) |
| DOCX | Word document built in the browser, no server | yes (snapshot in the properties) |
| PNG | One image per A4 page, drawn on canvas | yes (snapshot in a text chunk) |
| TXT | Plain-text resume plus a hidden data block | yes |
| MD | Markdown resume plus a hidden data block | yes |
| JSON | Full backup: data, order and settings | yes |
| ZIP | Bundle of several of the above | yes (the first importable file inside) |

The profile portrait is drawn into the PDF, the PNG and the DOCX header in the markets that expect one
(GCC, APAC, LATAM and EMEA), at its own proportions; the DOCX carries it as `word/media/portrait.png`
with its relationship. Settings → **Resume colour** switches the preview and the PDF, PNG and DOCX exports
between colour and strict black on white.

Files are named `Name_dd.mmm.yyyy-hh.mm.ext` at the moment of export, with `-1`, `-2` suffixes when
PNG runs to several pages. On iPhone and iPad Download opens the system share sheet — Files, Mail,
Messages, WhatsApp, contacts and the rest — with the finished file attached. Where sharing is not
available, a sheet offers **Save to Files**, **Copy text** and a Share button that retries.

JSON carries the state as-is. Markdown and TXT carry the same snapshot base64-encoded in a
comment (HTML comment in Markdown, a marked block at the end of the TXT). Importing any of
the three rebuilds the identical preview — same order, same sections, same settings — on
another device. If the hidden block is stripped, a best-effort text parser takes over.

## Persistence

Everything is written to `localStorage` as you type. The active tab and its scroll position
are stored too, so switching sections or reloading never loses a field or your place.
Saved versions live in a separate `localStorage` key, so the repository and the deployed site
never hold anyone's resume — the data exists only in the browser that entered it.

## Stack

- TypeScript: `main.ts`, `background.ts`, `version.ts`, `releases.ts`, `format.ts`,
  `parse.ts`, `pdf.ts`, `docx.ts`, `zip.ts`, `data.ts`, `util.ts`, `types.ts`.
- three.js / WebGL for the animated background; it degrades to the CSS gradient where WebGL
  is unavailable and renders one still frame under reduced motion.
- The editor and preview renderer are plain JavaScript (`src/app.js`), styled by
  `src/styles.css`. HTML, CSS and JavaScript only — no Python anywhere.
- jsPDF 4.2.1 for PDF output — the version floor, because every reviewed advisory against the
  library is fixed only in the 4.x line; the DOCX writer builds an OOXML package with a small
  stored-mode ZIP writer, so there is no server involved.

## Running and deploying

```
npm install
npm run dev        # dev server
npm run build      # production build into dist/
npm run preview    # serve the build on 127.0.0.1:4173
npm run typecheck  # tsc --noEmit
npm run test:e2e   # Playwright against the built app
```

`npm run test:e2e` builds the app, serves it and drives it in Chromium: a first load with no console
error, importing a full backup, the per-market note under the summary, the export and import suite, a
PDF taken out and read back, and the JSON export keeping every market text. CI runs the type check and
the suite before it builds and deploys, so a broken editor or a lost export stops the deploy.

`index.html` at the root forwards to `./dist/`, and the app's page is `src/index.html`. Vite builds
`src/` into `dist/`; the workflow uploads that build to GitHub Pages and also commits it into the
repository, so the site works whether Pages is set to *GitHub Actions* or to *Deploy from a branch*.

Vite is configured with `base: './'`, so the build works from any sub-path, including
`/gmo-resume-manager/`. The build number comes from `vite.config.ts` (`__BUILD_NUMBER__`,
overridable with the `BUILD_NUMBER` environment variable).

## Files

- `index.html` — a one-line forwarder to the built app in `dist/`.
- `src/index.html` — page shell: backdrop, editor, preview header with the regulations toggle, and
  the single dock holding the section tabs and the quick actions.
- `src/app.js` — state, persistence, editor and preview rendering, export/import wiring.
- `src/compliance.ts` — the resume regulations the toggle checks, field by field.
- `src/format.ts` — Markdown and TXT builders with the embedded data block.
- `src/parse.ts` — import detection and the best-effort text parsers.
- `src/pdf.ts` / `src/docx.ts` / `src/zip.ts` / `src/png.ts` — the file writers (PNG draws one
  canvas per A4 page).
- `src/releases.ts` — release notes and changelog content.
- `src/screening.ts` — the screening checks (ATS parse, skim, rubric, achievements, timeline,
  interview, skills, certifications, links, blind view, length) and the LLM prompt builder.
- `src/styles.css` — theme, layout, editor, resume paper and print styles.
- `tests/app.spec.ts` and `tests/fixtures/full-backup.json` — the browser suite and its fixture;
  `playwright.config.ts` builds and serves the app for it.

The print stylesheet is still there, so printing the page from the browser's own menu prints the
resume alone; the in-app Print button is gone, since PDF export covers it.
