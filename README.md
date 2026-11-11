# GMO Résumé Manager

A resume and experience tracker: keep your roles, achievements, education, projects and
skills in one place, and see the resume they add up to as you type. Dark by default, with a
greenish palette, yellow-orange headings and an animated WebGL backdrop.

## What it does

- **Sections and tabs** — Profile, Experience, Education, Projects, Skills, Releases and
  Changelog, each a tab in the editor with the live resume preview beside it.
- **Profile** — name, headline, contact details and a short summary.
- **Experience** — roles with dates, a "still work here" toggle, one-line-per-bullet
  highlights and free-form tags (stack, practices).
- **Education** and **Projects** — repeatable entries with dates, links and bullet details.
- **Skills** — grouped lists so the resume stays scannable.
- **Release notes and changelog** — shipped inside the app as their own tabs, driven by
  `src/releases.ts`. Add an entry there when you ship something.
- **Build number** — shown in the footer of every screen, injected at build time by
  `vite.config.ts` (override with the `BUILD_NUMBER` environment variable).
- **Export** — print / save as PDF, download the resume as Markdown, or export and import
  the whole tracker as JSON.

Entries can be reordered and deleted; everything saves to `localStorage` as you type, so
nothing leaves the device and there is no account or server.

## Stack

- TypeScript for the app shell: `src/main.ts`, `src/background.ts`, `src/version.ts`,
  `src/releases.ts`.
- three.js / WebGL for the animated background (`src/background.ts`). It degrades to the CSS
  gradient where WebGL is unavailable and renders a single still frame when the visitor
  prefers reduced motion.
- The editor and resume renderer are plain JavaScript (`src/app.js`), styled with
  `src/styles.css`. HTML, CSS and JavaScript only — no Python anywhere in the project.
- Vite builds it; there is no server.

## Running it

```
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
npm run preview  # serve the production build
```

## Files

- `index.html` — page shell: backdrop canvas, app bar, editor column, preview column, footer.
- `src/app.js` — state, localStorage persistence, editor rendering and resume rendering.
- `src/releases.ts` — release notes and changelog content, rendered in their own tabs.
- `src/background.ts` — the three.js WebGL point field.
- `src/version.ts` — app version and the build number define.
- `src/styles.css` — dark theme, editor, resume paper and print styles.
- `vite.config.ts` — build output and the `__BUILD_NUMBER__` define.

Printing uses the browser's own print dialog, so "Print / PDF" produces an A4 document
with everything but the resume hidden.
