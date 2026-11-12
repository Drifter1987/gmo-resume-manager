import { APP_VERSION } from './version';

export interface Release {
  version: string;
  name: string;
  summary: string;
  notes: string[];
}

export const RELEASES: Release[] = [
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
