# GMO Résumé Manager

A resume and experience tracker: keep your roles, achievements, education, projects and
skills in one place, watch the resume build itself live, and export it as PDF, DOCX, TXT,
Markdown or JSON. Dark by default, with a greenish palette, yellow-orange headings and an
animated WebGL backdrop.

Live: https://drifter1987.github.io/gmo-resume-manager/

## What it does

- **Section rail** — on desktop the tabs sit in a slim column on the left, with the editor beside
  it and the live resume on the right; on phones the same tabs run across the top. The sections are
  Profile, Experience, Education (with Certifications inside), Projects, Skills and Settings.
- **Docked bottom toolbar** — Save, import, export and settings from anywhere, plus the build number.
- **Profile** — name, headline, contact details and a short summary.
- **Experience** — roles with dates, a "still work here" toggle, one-line-per-bullet
  highlights and tags.
- **Education**, **Certifications**, **Projects**, **Skills** — repeatable, reorderable entries.
  Certifications carry issuer, issue date, expiry and a credential link, and render on the resume
  as a four-column table under Education.
- **Live preview** — updates on every keystroke and every settings change.
- **Export** — inside Settings, one panel where any combination of PDF, DOCX, PNG, TXT, Markdown
  and JSON can be ticked; Download bundles several files into a ZIP, Share opens the system sheet.
  PNG export draws one image per A4 page.
- **Settings** — dark/light theme, resume typeface, density, section visibility, storage usage,
  a data reset, the export panel, the saved-version history, and the release notes and changelog.
- **History** — a Save button (or Cmd/Ctrl+S) snapshots the whole resume into the browser:
  up to 40 versions, each with restore, download and delete.

## Exports and round trips

| Format | What it is | Imports back |
| --- | --- | --- |
| PDF | Real PDF built with jsPDF, A4, selectable text | no (for reading) |
| DOCX | Word document built in the browser, no server | no |
| PNG | One image per A4 page, drawn on canvas | no |
| TXT | Plain-text resume plus a hidden data block | yes |
| MD | Markdown resume plus a hidden data block | yes |
| JSON | Full backup: data, order and settings | yes |

Files are named `Name_dd.mmm.yyyy-hh.mm.ext` at the moment of export, with `-1`, `-2` suffixes when
PNG runs to several pages. On iPhone, Share opens the system sheet, where **Save Image** writes PNGs
to Photos, **Save to Files** writes to iCloud Drive or On My iPhone, and apps such as WhatsApp appear
with the document already attached.

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
- jsPDF for PDF output; the DOCX writer builds an OOXML package with a small stored-mode
  ZIP writer, so there is no server involved.

## Running and deploying

```
npm install
npm run dev      # dev server
npm run build    # production build into dist/
npm run preview  # serve the build
```

`.github/workflows/pages.yml` builds and deploys `dist/` to GitHub Pages on every push to
`main`. In the repository, set **Settings → Pages → Source** to **GitHub Actions** once.

Vite is configured with `base: './'`, so the build works from any sub-path, including
`/gmo-resume-manager/`. The build number comes from `vite.config.ts` (`__BUILD_NUMBER__`,
overridable with the `BUILD_NUMBER` environment variable).

## Files

- `index.html` — page shell: backdrop, header with section tabs, editor, preview, dock.
- `src/app.js` — state, persistence, editor and preview rendering, export/import wiring.
- `src/format.ts` — Markdown and TXT builders with the embedded data block.
- `src/parse.ts` — import detection and the best-effort text parsers.
- `src/pdf.ts` / `src/docx.ts` / `src/zip.ts` / `src/png.ts` — the file writers (PNG draws one
  canvas per A4 page).
- `src/releases.ts` — release notes and changelog content.
- `src/styles.css` — theme, layout, editor, resume paper and print styles.

Printing still works through the browser's own dialog (`Print` in the preview toolbar),
but PDF no longer depends on it.
