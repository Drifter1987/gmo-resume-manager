import { APP_VERSION } from './version';

export interface Release {
  version: string;
  name: string;
  summary: string;
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    version: '2.7.1',
    name: 'Honest screening numbers',
    summary: 'The Achievements word counts and the Certifications check now read this resume correctly.',
    notes: [
      'Bullet word counts were split on commas and always reported 1 word; they split on spaces now.',
      'Certificates stored as groups in the Skills section are detected and reported as unverifiable there, with a pointer to the Certifications tab.'
    ]
  },
  {
    version: '2.7.0',
    name: 'Screening checks',
    summary: 'A Screening tab that scores the resume against the methods recruiters use, with a ready LLM prompt.',
    notes: [
      'New Screening tab: ATS parse, recruiter skim, rubric against the advert, achievements, timeline, STAR readiness, skills, certifications, portfolio links, a blind-screening view, and length.',
      'Set the target role and the advert keywords; the rubric re-scores as you type and both fill the LLM prompt.',
      'The LLM section builds a ready-to-send prompt: copy it, export the .md, and attach both to any chat model.'
    ]
  },
  {
    version: '2.6.4',
    name: 'Layout polish',
    summary: 'Small fixes: the Black & white label, sticky panels on phones and the verify row.',
    notes: [
      'Settings → Resume colour showed "Black &amp; white" literally; it reads "Black & white" now.',
      'On phones the section rail and the sub-tab strips no longer let scrolled content peek around or slide beneath them.',
      'The Verify export / import button and its explanation sit on one tidy row.'
    ]
  },
  {
    version: '2.6.3',
    name: 'Import that actually opens',
    summary: 'The file input now sits invisibly on top of the Import button.',
    notes: [
      'The previous label pointed at an input parked off-screen, which iOS refused to open.',
      'The input is now an invisible layer over the Import control itself, so a tap opens the picker directly.'
    ]
  },
  {
    version: '2.6.2',
    name: 'The live site builds again',
    summary: 'The built app is published into the repository and the root page forwards to it.',
    notes: [
      'The deployed site was serving the raw source, so the stylesheet and script 404ed at the domain root.',
      'The workflow now commits the built site to dist/ and the root index.html forwards to it, which works under either Pages source setting.',
      'The workflow rebases before pushing so the bot commit never blocks a later push.'
    ]
  },
  {
    version: '2.6.1',
    name: 'Import opens the picker again',
    summary: 'Import is a native file control, the sheet offers Open, and Share is gone.',
    notes: [
      'Import is now a real file control in the dock instead of a scripted click on a hidden input, so iOS opens the picker reliably.',
      'The file picker accepts .json, .md, .txt, .pdf, .docx, .png and .zip by extension.',
      'The finished-file sheet offers Open only, which is the action that works in the app.',
      'The Share button is removed; Download is the single way to produce a file.'
    ]
  },
  {
    version: '2.6.0',
    name: 'Colour or black & white, and import from every export',
    summary: 'A resume colour setting that drives the preview and every export, and every exported format imports back.',
    notes: [
      'New Settings → Resume colour: Colour or Black & white. It changes the live preview, PDF, PNG and DOCX exports together; in Black & white every line of text, rule and heading is plain black on white.',
      'PDF, DOCX and PNG exports now carry the full resume snapshot inside the file (PDF keywords, DOCX document properties, a PNG text chunk), so they import back exactly. A ZIP bundle imports too.',
      'Import recognises files by their content rather than their name, and rebuilds the same preview: content, order, typeface, density, colour mode and section switches.',
      'Markdown and TXT exports write certifications as a proper table / delimited rows with the link kept, escape pipes, and keep multi-paragraph summaries; the fallback parsers read them back without the hidden data block.',
      'PDF, PNG and DOCX now follow the typeface and density settings and draw certifications as a real table. Accents and umlauts survive in the PDF; DOCX keeps dashes and symbols.',
      'Import no longer rewrites valid certificate links, and dates such as “Oct 2020 to Present” split correctly.'
    ]
  },
  {
    version: '2.5.4',
    name: 'Back to a plain main branch',
    summary: 'The page lives at the repository root again, with no build output committed.',
    notes: [
      'index.html is at the root of the repository, next to src/, exactly as before.',
      'Build output is no longer committed; the workflow builds and publishes it without touching the branch.',
      'The root redirect page and the extra src/index.html are gone.'
    ]
  },
  {
    version: '2.5.3',
    name: 'Aligned skill columns',
    summary: 'Every skill value starts at the same column in the PDF and PNG.',
    notes: [
      'The skills block measures its widest label once and uses that as the column, so values line up instead of stepping in and out.',
      'Rows whose label is wider than the column still put the value on its own line, wrapped.'
    ]
  },
  {
    version: '2.5.2',
    name: 'Skills wrap in the PDF and PNG',
    summary: 'Long skill labels no longer collide with their values or get clipped at the page edge.',
    notes: [
      'Skill rows now measure the label, wrap the value into the remaining width, and drop the value onto its own line when the label is long.',
      'Role headings keep a block of space at the foot of a page, so a heading no longer sits alone while its bullets start the next page.',
      'Same fix in both PDF and PNG output.'
    ]
  },
  {
    version: '2.5.1',
    name: 'Calmer colours, clean page breaks',
    summary: 'A warmer sage palette, and PDF/PNG entries no longer collide with their dates or run past the page.',
    notes: [
      'The bright glowing green is gone; surfaces, accents and the backdrop use a warm sage and amber palette that is easier on the eyes.',
      'PDF and PNG entry headings now measure the date before wrapping the title, so a long certificate or role name can no longer overlap the date.',
      'Both writers keep a safety margin at the foot of the page, so nothing is drawn past the last line.',
      'The build is published into the repository and the root page forwards to it, so the site no longer depends on the Pages source setting.'
    ]
  },
  {
    version: '2.5.0',
    name: 'One export sheet, a left rail, images',
    summary: 'Multi-format export with PNG pages and sharing, a left-hand section rail on desktop, and no duplicated controls.',
    notes: [
      'Export is one panel now: tick any combination of PDF, DOCX, PNG, TXT, Markdown and JSON, then Download or Share. More than one file is bundled into a ZIP.',
      'New PNG export draws one image per A4 page; Share opens the iOS sheet where Save Image puts them in Photos and Save to Files stores them in iCloud Drive.',
      'Files are named Name_dd.mmm.yyyy-hh.mm, with -1, -2 suffixes when the PNG export runs to several pages.',
      'On desktop the section tabs moved to a rail on the left, with the editor beside it and the resume on the right.',
      'Export and History moved inside Settings, so the top level is Profile, Experience, Education, Projects, Skills and Settings.',
      'The duplicate Export, Resume and sample-data buttons are gone; each action now lives in exactly one place.'
    ]
  },
  {
    version: '2.4.1',
    name: 'Release notes look right again',
    summary: 'Restored the card styling for release notes and the changelog, and stopped sub-tab labels wrapping.',
    notes: [
      'Release notes show their version chip, title, summary and bullet list as proper cards again.',
      'Changelog entries are grouped with a rule, version label and entry title on separate lines.',
      'Sub-tab labels stay on one line and the strip scrolls sideways when it has to.'
    ]
  },
  {
    version: '2.4.0',
    name: 'History of saved versions',
    summary: 'A Save button snapshots the whole resume, and old versions can be restored, downloaded or deleted.',
    notes: [
      'New Save button in the dock (and Cmd/Ctrl+S) writes a snapshot of everything: profile, roles, education, certificates, projects, skills and settings.',
      'New History tab lists up to 40 versions, newest first, with restore, download and delete.',
      'Snapshots live only in this browser — nothing is uploaded and the GitHub copy of the app stays empty.',
      'Release notes and Changelog moved inside Settings, so the top row is down to seven tabs.',
      'Settings shows how many versions are stored and how much space they use, with a separate Clear history button.'
    ]
  },
  {
    version: '2.3.2',
    name: 'Table polish',
    summary: 'No stray separators on stacked rows, and only real URLs become credential links.',
    notes: [
      'Stacked certificate rows no longer start their meta line with a lone separator.',
      'Placeholder text in a credential column (a dash, "image certificate") is dropped instead of becoming a broken link.'
    ]
  },
  {
    version: '2.3.1',
    name: 'Repair a table that was imported as text',
    summary: 'A Markdown table imported into a summary is turned into certifications, and long text can no longer spill off the paper.',
    notes: [
      'Loading repairs data that came from a reference document: the heading is trimmed back to the name, and a Markdown table found in the summary becomes certification rows.',
      'Certifications stack into a readable list on narrow screens instead of scrolling sideways.',
      'Long URLs, hashes and titles now wrap inside the paper instead of running past its edge.'
    ]
  },
  {
    version: '2.3.0',
    name: 'Fewer tabs, a real table',
    summary: 'Related sections now share a tab, and certifications render as a proper table.',
    notes: [
      'Education and Certifications live in one tab with a switch between them; Releases and Changelog do the same.',
      'Certifications render as a four-column table — certification, issuer, issued, expires — instead of a wrapped list.',
      'Markdown tables under a Certifications heading are imported row by row.',
      'The dock is down to four buttons; the sample resume now lives in the Export tab.'
    ]
  },
  {
    version: '2.2.0',
    name: 'Certifications get their own section',
    summary: 'Licences and certificates are no longer squeezed into the skills list.',
    notes: [
      'New Certifications tab with name, issuer, issue date, expiry and credential link per entry.',
      'The resume shows them as a compact list under Education, so a long certificate list stays readable.',
      'Certifications are included in PDF, DOCX, Markdown and TXT exports, and imported from all of them.',
      'Settings gained a switch to hide the Certifications section.'
    ]
  },
  {
    version: '2.1.1',
    name: 'One-line title',
    summary: 'The app title stays on one row, and Markdown import keeps multi-paragraph summaries.',
    notes: [
      'The “Résumé Manager” title no longer wraps onto two lines, at any width.',
      'Markdown imports now keep every paragraph of a summary instead of only the first line.',
      'Contact lines with a comma-separated location import the whole location, not just the first part.'
    ]
  },
  {
    version: '2.1.0',
    name: 'Export for real',
    summary: 'Working PDF and DOCX exports, a separate Export tab, settings, and a docked toolbar.',
    notes: [
      'PDF export now builds a real PDF in the browser instead of relying on the print dialog, which did nothing in the app’s web view.',
      'New DOCX and TXT exports alongside Markdown and JSON.',
      'A separate Export tab collects every format and the importer, with drag and drop.',
      'A Settings tab with theme, typeface, density, section visibility and data controls.',
      'The section tabs now sit at the top of the app, with Settings on the far right.',
      'A docked bottom toolbar holds the global actions and the build number.',
      'The active tab, scroll positions and every field you typed persist across tab switches and reloads.',
      'Markdown and TXT exports carry a hidden copy of the full data set, so any export rebuilds the identical preview on another device.'
    ]
  },
  {
    version: '2.0.0',
    name: 'Dark by default',
    summary: 'A green-black theme with gold headings, a WebGL backdrop, and a home for every change.',
    notes: [
      'Dark theme is now the default, with a greenish palette and yellow-orange headings.',
      'Animated three.js / WebGL backdrop of drifting data points behind the whole app.',
      'New Releases and Changelog tabs, inside the app, with the full version history.',
      'Build number shown in the footer of every screen, injected at build time.',
      'The app is now built with Vite and TypeScript around the same framework-free UI.'
    ]
  },
  {
    version: '1.1.0',
    name: 'Getting it off the device',
    summary: 'Export the resume as Markdown, move the tracker between devices, and start from an example.',
    notes: [
      'Markdown download of the whole resume, grouped by section.',
      'JSON export and import, with tolerant normalization of older files.',
      'Example data so a new user can see the shape of a finished resume.',
      'Deletes now ask for confirmation and entries can be reordered.'
    ]
  },
  {
    version: '1.0.0',
    name: 'First release',
    summary: 'Profile, experience, education, projects and skills, with a live resume preview.',
    notes: [
      'Editing sections with a live resume preview beside them.',
      'Experience entries with dates, current-role toggle, highlights and tags.',
      'Skills grouped so the resume stays scannable.',
      'Print / save as PDF, with a print stylesheet that keeps only the resume.',
      'Everything saved locally as you type; no account and no server.'
    ]
  }
];

function renderCard(release: Release): string {
  const isCurrent = release.version === APP_VERSION;
  return `<article class="rel-card${isCurrent ? ' is-current' : ''}">
    <div class="rel-head">
      <span class="rel-version">v${release.version}</span>
      ${isCurrent ? '<span class="rel-badge">Current</span>' : ''}
    </div>
    <h3 class="rel-name">${release.name}</h3>
    <p class="rel-summary">${release.summary}</p>
    <ul class="rel-notes">${release.notes.map((note) => `<li>${note}</li>`).join('')}</ul>
  </article>`;
}

export function releasesEditor(): string {
  return `
    <div class="panel-head">
      <h2>Release notes</h2>
      <p class="panel-sub">What shipped in each version, newest first. The build you are running is marked.</p>
    </div>
    <div class="rel-list">${RELEASES.map(renderCard).join('')}</div>
  `;
}

export function changelogEditor(): string {
  const groups = RELEASES.map((release) => {
    const isCurrent = release.version === APP_VERSION;
    return `<div class="cl-group">
      <div class="cl-head">
        <span class="cl-version">v${release.version}</span>
        ${isCurrent ? '<span class="rel-badge">Current</span>' : ''}
        <span class="cl-kind">${release.name}</span>
      </div>
      <ul class="cl-items">${release.notes.map((note) => `<li>${note}</li>`).join('')}</ul>
    </div>`;
  }).join('');

  return `
    <div class="panel-head">
      <h2>Changelog</h2>
      <p class="panel-sub">Every shipped version of GMO Résumé Manager, in order. Add an entry to
      <code>src/releases.ts</code> when you ship something new.</p>
    </div>
    <div class="rel-list">${groups}</div>
  `;
}
