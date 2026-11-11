/*
 * GMO Résumé Manager — a resume and experience tracker.
 * Everything lives in localStorage; exports can be imported back exactly.
 */

import { changelogEditor, releasesEditor } from './releases';
import { buildDocx } from './docx';
import { buildPdf } from './pdf';
import { fileNameBase, toJson, toMarkdown, toPlainText } from './format';
import { parseImport } from './parse';
import { APP_VERSION, BUILD_NUMBER } from './version';
import { saveBlob } from './util';

const STORAGE_KEY = 'gmoResumeManager.v2';
const LEGACY_STORAGE_KEY = 'resumeStudio.v1';
const UI_KEY = 'gmoResumeManager.ui.v1';

/* -------------------------------------------------------------------- */
/* helpers                                                              */
/* -------------------------------------------------------------------- */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function splitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitList(text) {
  return String(text || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function dateRange(item) {
  const start = String(item.start || '').trim();
  const end = item.current ? 'Present' : String(item.end || '').trim();
  if (start && end) return start + ' — ' + end;
  return start || end;
}

function slugify(text) {
  const slug = String(text || 'resume')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'resume';
}

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function dots(parts) {
  return parts
    .filter(Boolean)
    .map((part) => esc(part))
    .join(' <span class="r-dot">·</span> ');
}

function webLink(url, label) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const href = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label || raw)}</a>`;
}

/* -------------------------------------------------------------------- */
/* state shape                                                          */
/* -------------------------------------------------------------------- */

const COLLECTIONS = {
  experience: {
    noun: 'role',
    make: () => ({
      id: uid(),
      role: '',
      company: '',
      location: '',
      start: '',
      end: '',
      current: false,
      highlights: '',
      tags: ''
    })
  },
  education: {
    noun: 'degree',
    make: () => ({
      id: uid(),
      school: '',
      degree: '',
      field: '',
      location: '',
      start: '',
      end: '',
      details: ''
    })
  },
  projects: {
    noun: 'project',
    make: () => ({
      id: uid(),
      name: '',
      link: '',
      description: '',
      tech: ''
    })
  },
  skills: {
    noun: 'skill group',
    make: () => ({
      id: uid(),
      label: '',
      items: ''
    })
  }
};

const COLLECTION_KEYS = Object.keys(COLLECTIONS);

function defaultSettings() {
  return {
    theme: 'dark',
    font: 'sans',
    density: 'comfortable',
    showSummary: true,
    showTags: true,
    sections: { experience: true, education: true, projects: true, skills: true }
  };
}

function emptyState() {
  return {
    profile: {
      name: '',
      headline: '',
      email: '',
      phone: '',
      location: '',
      website: '',
      linkedin: '',
      summary: ''
    },
    experience: [],
    education: [],
    projects: [],
    skills: [],
    settings: defaultSettings()
  };
}

function exampleState() {
  return {
    profile: {
      name: 'Ada Lovelace',
      headline: 'Software engineer · distributed systems & developer tools',
      email: 'ada@example.com',
      phone: '+44 20 7946 0321',
      location: 'London, UK',
      website: 'ada.dev',
      linkedin: 'linkedin.com/in/adalovelace',
      summary:
        'Engineer with eight years building reliable backends and the tooling around them. I like small teams, clear interfaces, and leaving systems easier to change than I found them.'
    },
    experience: [
      {
        id: uid(),
        role: 'Staff software engineer',
        company: 'Northwind Labs',
        location: 'London, UK',
        start: 'Mar 2021',
        end: '',
        current: true,
        highlights:
          'Led the migration of the billing pipeline to an event-driven design, cutting p99 latency from 1.4s to 190ms.\nDesigned the internal service template now used by 14 teams, reducing new-service setup from two weeks to a day.\nMentored four engineers through promotion; ran a weekly design review.',
        tags: 'TypeScript, Go, Postgres, Kafka, technical leadership'
      },
      {
        id: uid(),
        role: 'Backend engineer',
        company: 'Bright Harbour',
        location: 'Remote',
        start: 'Jul 2018',
        end: 'Feb 2021',
        current: false,
        highlights:
          'Built the public API and its first rate-limiting layer, supporting 40k daily requests at launch.\nIntroduced integration tests to a codebase that had none, taking deploy failures from weekly to rare.',
        tags: 'Node.js, Express, Redis, Docker'
      }
    ],
    education: [
      {
        id: uid(),
        school: 'University of Edinburgh',
        degree: 'BSc',
        field: 'Computer Science',
        location: 'Edinburgh, UK',
        start: '2014',
        end: '2018',
        details: 'First class honours. Dissertation on scheduling in stream processing systems.'
      }
    ],
    projects: [
      {
        id: uid(),
        name: 'Ledgerline',
        link: 'github.com/ada/ledgerline',
        description:
          'An open-source double-entry bookkeeping library with a typed query layer, used in production by three small businesses.',
        tech: 'TypeScript, SQLite, Vitest'
      },
      {
        id: uid(),
        name: 'Timebox',
        link: '',
        description:
          'A small macOS menu-bar timer for deep work sessions, with an emphasis on keyboard control and no notifications.',
        tech: 'Swift, SwiftUI'
      }
    ],
    skills: [
      { id: uid(), label: 'Languages', items: 'TypeScript, Go, Java, SQL' },
      { id: uid(), label: 'Systems', items: 'Postgres, Kafka, Redis, AWS' },
      { id: uid(), label: 'Practices', items: 'Design docs, mentoring, incident review' }
    ],
    settings: defaultSettings()
  };
}

/* -------------------------------------------------------------------- */
/* persistence                                                          */
/* -------------------------------------------------------------------- */

let state = emptyState();
let ui = { section: 'profile', scrolls: {}, pageY: 0 };
let saveTimer = null;
let hintTimer = null;
let toastTimer = null;
let uiTimer = null;

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyState();
  } catch (error) {
    return emptyState();
  }
}

function normalize(data) {
  const base = emptyState();
  const source = data && typeof data === 'object' ? data : {};
  const incoming = source.profile && typeof source.profile === 'object' ? source.profile : {};

  Object.keys(base.profile).forEach((key) => {
    const value = incoming[key];
    if (typeof value === 'string') base.profile[key] = value;
  });

  COLLECTION_KEYS.forEach((key) => {
    const items = Array.isArray(source[key]) ? source[key] : [];
    base[key] = items
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const fresh = COLLECTIONS[key].make();
        const merged = {};
        Object.keys(fresh).forEach((field) => {
          const raw = item[field];
          if (field === 'id') {
            merged.id = typeof raw === 'string' && raw ? raw : fresh.id;
          } else if (typeof fresh[field] === 'boolean') {
            merged[field] = raw === true || raw === 'true';
          } else if (typeof raw === 'string') {
            merged[field] = raw;
          } else if (typeof raw === 'number') {
            merged[field] = String(raw);
          } else {
            merged[field] = '';
          }
        });
        return merged;
      });
  });

  base.settings = normalizeSettings(source.settings);
  return base;
}

function normalizeSettings(raw) {
  const out = defaultSettings();
  if (!raw || typeof raw !== 'object') return out;

  if (raw.theme === 'light' || raw.theme === 'dark') out.theme = raw.theme;
  if (raw.font === 'serif' || raw.font === 'sans') out.font = raw.font;
  if (raw.density === 'compact' || raw.density === 'comfortable') out.density = raw.density;
  if (typeof raw.showSummary === 'boolean') out.showSummary = raw.showSummary;
  if (typeof raw.showTags === 'boolean') out.showTags = raw.showTags;

  if (raw.sections && typeof raw.sections === 'object') {
    ['experience', 'education', 'projects', 'skills'].forEach((key) => {
      if (typeof raw.sections[key] === 'boolean') out.sections[key] = raw.sections[key];
    });
  }

  return out;
}

function save() {
  clearTimeout(saveTimer);
  setStatus('Unsaved changes…');
  saveTimer = setTimeout(flushSave, 220);
}

function flushSave() {
  clearTimeout(saveTimer);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStatus('Saved on this device');
  } catch (error) {
    setStatus('Could not save — storage is unavailable');
  }
}

function loadUi() {
  try {
    const raw = window.localStorage.getItem(UI_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    if (typeof parsed.section === 'string') ui.section = parsed.section;
    if (parsed.scrolls && typeof parsed.scrolls === 'object') ui.scrolls = parsed.scrolls;
    if (typeof parsed.pageY === 'number') ui.pageY = parsed.pageY;
  } catch (error) {
    /* ignore a corrupt UI record */
  }
}

function saveUi() {
  clearTimeout(uiTimer);
  try {
    window.localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch (error) {
    /* storage may be unavailable */
  }
}

function scheduleUiSave() {
  clearTimeout(uiTimer);
  uiTimer = setTimeout(saveUi, 300);
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let cursor = target;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (cursor[key] == null || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

/* -------------------------------------------------------------------- */
/* editor                                                               */
/* -------------------------------------------------------------------- */

function field(label, path, value, placeholder, options) {
  const opts = options || {};
  const classes = opts.span ? 'field ' + opts.span : 'field';
  const attrs = `data-path="${path}"${opts.disabled ? ' disabled' : ''}`;

  let control;
  if (opts.rows) {
    control = `<textarea rows="${opts.rows}" ${attrs} placeholder="${esc(placeholder || '')}">${esc(value)}</textarea>`;
  } else {
    const type = opts.type || 'text';
    const autocomplete = opts.autocomplete ? ` autocomplete="${opts.autocomplete}"` : '';
    control = `<input type="${type}" ${attrs} value="${esc(value)}" placeholder="${esc(placeholder || '')}"${autocomplete} />`;
  }

  return `<label class="${classes}"><span class="field-label">${esc(label)}</span>${control}</label>`;
}

function toolButtons(collection, id, index, total) {
  return `
    <button class="icon-btn" type="button" data-action="move-up" data-col="${collection}" data-id="${id}" title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
    <button class="icon-btn" type="button" data-action="move-down" data-col="${collection}" data-id="${id}" title="Move down" ${index === total - 1 ? 'disabled' : ''}>↓</button>
    <button class="icon-btn danger" type="button" data-action="remove" data-col="${collection}" data-id="${id}" title="Delete">✕</button>
  `;
}

function cardHead(collection, item, index, total, title) {
  return `
    <div class="card-head">
      <span class="card-index">${index + 1}</span>
      <span class="card-title">${esc(title)}</span>
      <div class="card-tools">${toolButtons(collection, item.id, index, total)}</div>
    </div>
  `;
}

function emptyNote(text) {
  return `<div class="empty-note">${esc(text)}</div>`;
}

function editorShell(title, subtitle, body, collection) {
  return `
    <div class="panel-head">
      <h2>${esc(title)}</h2>
      <p class="panel-sub">${esc(subtitle)}</p>
    </div>
    ${body}
    <button class="btn btn-block" type="button" data-action="add" data-col="${collection}">+ Add ${esc(
      COLLECTIONS[collection].noun
    )}</button>
  `;
}

function profileEditor() {
  const p = state.profile;
  return `
    <div class="panel-head">
      <h2>Profile</h2>
      <p class="panel-sub">The header of your resume. Everything here saves as you type.</p>
    </div>
    <div class="form-grid">
      ${field('Full name', 'profile.name', p.name, 'Ada Lovelace', { span: 'span-2', autocomplete: 'name' })}
      ${field('Headline', 'profile.headline', p.headline, 'Software engineer · distributed systems', { span: 'span-2' })}
      ${field('Email', 'profile.email', p.email, 'ada@example.com', { type: 'email', autocomplete: 'email' })}
      ${field('Phone', 'profile.phone', p.phone, '+44 20 7946 0321', { type: 'tel', autocomplete: 'tel' })}
      ${field('Location', 'profile.location', p.location, 'London, UK')}
      ${field('Website', 'profile.website', p.website, 'ada.dev')}
      ${field('LinkedIn', 'profile.linkedin', p.linkedin, 'linkedin.com/in/ada', { span: 'span-2' })}
      ${field('Summary', 'profile.summary', p.summary, 'Two or three lines on what you do and what you are looking for.', { rows: 5, span: 'span-2' })}
    </div>
  `;
}

function experienceEditor() {
  const items = state.experience;
  const cards = items
    .map((item, index) => {
      const base = `experience.${index}`;
      return `<div class="card" data-card-id="${item.id}">
        ${cardHead('experience', item, index, items.length, item.role || item.company || 'Untitled role')}
        <div class="form-grid">
          ${field('Role', base + '.role', item.role, 'Senior software engineer', { span: 'span-2' })}
          ${field('Company', base + '.company', item.company, 'Northwind Labs')}
          ${field('Location', base + '.location', item.location, 'Remote')}
          ${field('Start', base + '.start', item.start, 'Mar 2021')}
          ${field('End', base + '.end', item.end, 'Aug 2023', { disabled: item.current })}
          <label class="check span-2">
            <input type="checkbox" data-path="${base}.current" ${item.current ? 'checked' : ''} />
            <span>I still work here</span>
          </label>
          ${field('Highlights', base + '.highlights', item.highlights, 'One achievement per line, with numbers where you can.', { rows: 4, span: 'span-2' })}
          ${field('Tags', base + '.tags', item.tags, 'TypeScript, Postgres, leadership', { span: 'span-2' })}
        </div>
      </div>`;
    })
    .join('');

  return editorShell(
    'Experience',
    'Roles, dates and the wins that matter. One bullet per line in highlights, comma-separated tags.',
    cards || emptyNote('No roles yet. Add one to start building the experience section.'),
    'experience'
  );
}

function educationEditor() {
  const items = state.education;
  const cards = items
    .map((item, index) => {
      const base = `education.${index}`;
      return `<div class="card" data-card-id="${item.id}">
        ${cardHead('education', item, index, items.length, item.degree || item.school || 'Untitled degree')}
        <div class="form-grid">
          ${field('School', base + '.school', item.school, 'University of Edinburgh', { span: 'span-2' })}
          ${field('Degree', base + '.degree', item.degree, 'BSc')}
          ${field('Field', base + '.field', item.field, 'Computer Science')}
          ${field('Location', base + '.location', item.location, 'Edinburgh, UK')}
          ${field('Start', base + '.start', item.start, '2014')}
          ${field('End', base + '.end', item.end, '2018')}
          ${field('Details', base + '.details', item.details, 'One line per note: honours, dissertation, relevant courses.', { rows: 3, span: 'span-2' })}
        </div>
      </div>`;
    })
    .join('');

  return editorShell(
    'Education',
    'Degrees, courses and certifications. Details are shown as bullets.',
    cards || emptyNote('No education entries yet.'),
    'education'
  );
}

function projectsEditor() {
  const items = state.projects;
  const cards = items
    .map((item, index) => {
      const base = `projects.${index}`;
      return `<div class="card" data-card-id="${item.id}">
        ${cardHead('projects', item, index, items.length, item.name || 'Untitled project')}
        <div class="form-grid">
          ${field('Name', base + '.name', item.name, 'Ledgerline')}
          ${field('Link', base + '.link', item.link, 'github.com/you/project')}
          ${field('Description', base + '.description', item.description, 'What it does and why it matters.', { rows: 3, span: 'span-2' })}
          ${field('Tech', base + '.tech', item.tech, 'TypeScript, Postgres', { span: 'span-2' })}
        </div>
      </div>`;
    })
    .join('');

  return editorShell(
    'Projects',
    'Side projects, open source and anything you shipped outside a job.',
    cards || emptyNote('No projects yet.'),
    'projects'
  );
}

function skillsEditor() {
  const items = state.skills;
  const cards = items
    .map((item, index) => {
      const base = `skills.${index}`;
      return `<div class="card" data-card-id="${item.id}">
        ${cardHead('skills', item, index, items.length, item.label || 'Untitled group')}
        <div class="form-grid">
          ${field('Group', base + '.label', item.label, 'Languages')}
          ${field('Skills', base + '.items', item.items, 'TypeScript, Go, SQL')}
        </div>
      </div>`;
    })
    .join('');

  return editorShell(
    'Skills',
    'Group your skills so the resume stays scannable. Separate items with commas.',
    cards || emptyNote('No skill groups yet.'),
    'skills'
  );
}

function formatCard(kind, ext, title, description, primary) {
  const copyable = kind === 'md' || kind === 'txt' || kind === 'json';
  return `
    <div class="format-card${primary ? ' is-primary' : ''}">
      <span class="format-icon">${esc(ext)}</span>
      <div>
        <p class="format-name">${esc(title)}</p>
        <p class="format-desc">${esc(description)}</p>
      </div>
      <div class="format-actions">
        ${copyable ? `<button class="btn" type="button" data-copy="${kind}">Copy</button>` : ''}
        <button class="btn${primary ? ' btn-primary' : ''}" type="button" data-export="${kind}">Download</button>
      </div>
    </div>
  `;
}

function exportText(kind) {
  if (kind === 'md') return toMarkdown(state);
  if (kind === 'txt') return toPlainText(state);
  return toJson(state);
}

/**
 * The app's own web view cannot save files. Show the finished file in a sheet with
 * a visible Open/Save link and a copy action, so the export is never a dead end.
 */
function showExportSheet(blob, name, kind) {
  const previous = document.getElementById('export-sheet');
  if (previous) previous.remove();

  const url = URL.createObjectURL(blob);
  const size = Math.max(1, Math.round(blob.size / 1024));
  const copyable = kind === 'md' || kind === 'txt' || kind === 'json';

  const sheet = document.createElement('div');
  sheet.id = 'export-sheet';
  sheet.className = 'sheet';
  sheet.innerHTML = `
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="${esc(kind.toUpperCase())} export">
      <div class="sheet-head">
        <div>
          <p class="sheet-title">${esc(kind.toUpperCase())} ready</p>
          <p class="sheet-file">${esc(name)} · ${size} KB</p>
        </div>
        <button class="icon-btn" type="button" data-sheet-close title="Close">✕</button>
      </div>
      ${
        kind === 'pdf'
          ? `<iframe class="sheet-frame" src="${url}" title="PDF preview"></iframe>`
          : `<div class="sheet-blank">${esc(kind.toUpperCase())} file · ${size} KB</div>`
      }
      <div class="sheet-actions">
        <a class="btn btn-primary" href="${url}" download="${esc(name)}">Open / Save file</a>
        ${copyable ? `<button class="btn" type="button" data-copy="${kind}">Copy text</button>` : ''}
        <button class="btn" type="button" data-sheet-close>Close</button>
      </div>
      <p class="fineprint">If the file opens instead of saving, use the browser's share button and choose
      <strong>Save to Files</strong>.</p>
    </div>
  `;

  document.body.appendChild(sheet);

  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('[data-sheet-close]')) {
      sheet.remove();
      URL.revokeObjectURL(url);
      return;
    }
    const copy = event.target.closest('[data-copy]');
    if (copy) copyText(copy.dataset.copy);
  });
}

function copyText(kind) {
  const text = exportText(kind);
  const done = () => toast(EXPORT_FORMATS[kind].label + ' copied to the clipboard');
  const failed = () => toast('Could not copy — use Download instead', true);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done, failed));
  } else {
    legacyCopy(text, done, failed);
  }
}

function legacyCopy(text, done, failed) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (error) {
    ok = false;
  }
  area.remove();
  if (ok) done();
  else failed();
}

function exportEditor() {
  return `
    <div class="panel-head">
      <h2>Export</h2>
      <p class="panel-sub">Download the resume in the format you need. Every format carries the full data
      set, so importing any of them anywhere rebuilds the same preview.</p>
    </div>
    <div class="format-grid">
      ${formatCard('pdf', 'PDF', 'PDF', 'A4, selectable text, ready to send.', true)}
      ${formatCard('docx', 'DOCX', 'Word document', 'Opens in Word, Google Docs or Pages.')}
      ${formatCard('txt', 'TXT', 'Plain text', 'Readable anywhere, with a hidden data block.')}
      ${formatCard('md', 'MD', 'Markdown', 'Readable in a repo or notes app, imports back.')}
      ${formatCard('json', 'JSON', 'JSON backup', 'Everything, including settings and order.')}
    </div>

    <div class="panel-head panel-head-tight">
      <h2>Import</h2>
      <p class="panel-sub">Restore a JSON backup, or a Markdown or TXT export. The preview is rebuilt exactly
      as it was when you exported.</p>
    </div>

    <div class="drop-zone" id="drop-zone">
      <strong>Drop a resume file here</strong>
      <span>.json, .md or .txt</span>
      <button class="btn" type="button" data-action="import">Choose a file</button>
    </div>

    <p class="fineprint">Markdown and TXT exports include a small hidden copy of the data, which is what makes
    the round trip exact. Opening and saving one of those files in a text editor keeps it intact — just avoid
    deleting the block at the end.</p>
  `;
}

function segButton(key, value, label, on) {
  return `<button class="seg-btn${on ? ' is-on' : ''}" type="button" data-set="${key}" data-value="${value}">${esc(
    label
  )}</button>`;
}

function switchHtml(path, label, checked) {
  return `<label class="switch"><input type="checkbox" data-path="${path}" aria-label="${esc(label)}" ${
    checked ? 'checked' : ''
  } /></label>`;
}

function settingsEditor() {
  const s = state.settings;
  return `
    <div class="panel-head">
      <h2>Settings</h2>
      <p class="panel-sub">Appearance and data. Changes apply to the preview immediately and travel with
      JSON exports.</p>
    </div>

    <section class="setting-block">
      <h3 class="setting-title">Theme</h3>
      <div class="seg" role="group" aria-label="Theme">
        ${segButton('theme', 'dark', 'Dark', s.theme === 'dark')}
        ${segButton('theme', 'light', 'Light', s.theme === 'light')}
      </div>
      <p class="setting-note">Dark is the default. Light keeps the same green and gold accents.</p>
    </section>

    <section class="setting-block">
      <h3 class="setting-title">Resume typeface</h3>
      <div class="seg" role="group" aria-label="Resume typeface">
        ${segButton('font', 'sans', 'Sans', s.font === 'sans')}
        ${segButton('font', 'serif', 'Serif', s.font === 'serif')}
      </div>
    </section>

    <section class="setting-block">
      <h3 class="setting-title">Density</h3>
      <div class="seg" role="group" aria-label="Density">
        ${segButton('density', 'comfortable', 'Comfortable', s.density === 'comfortable')}
        ${segButton('density', 'compact', 'Compact', s.density === 'compact')}
      </div>
    </section>

    <section class="setting-block">
      <h3 class="setting-title">Resume content</h3>
      <div class="switch-row">
        <span>Summary<small>Show the profile summary at the top.</small></span>
        ${switchHtml('settings.showSummary', 'Show summary', s.showSummary)}
      </div>
      <div class="switch-row">
        <span>Role tags<small>Show the stack line under each role.</small></span>
        ${switchHtml('settings.showTags', 'Show role tags', s.showTags)}
      </div>
    </section>

    <section class="setting-block">
      <h3 class="setting-title">Sections</h3>
      <div class="switch-row">
        <span>Experience</span>
        ${switchHtml('settings.sections.experience', 'Show experience', s.sections.experience)}
      </div>
      <div class="switch-row">
        <span>Education</span>
        ${switchHtml('settings.sections.education', 'Show education', s.sections.education)}
      </div>
      <div class="switch-row">
        <span>Projects</span>
        ${switchHtml('settings.sections.projects', 'Show projects', s.sections.projects)}
      </div>
      <div class="switch-row">
        <span>Skills</span>
        ${switchHtml('settings.sections.skills', 'Show skills', s.sections.skills)}
      </div>
      <p class="setting-note">Hiding a section only hides it from the resume and the exports; the data stays.</p>
    </section>

    <section class="setting-block">
      <h3 class="setting-title">Data</h3>
      <div class="data-row">
        <span>Storage used</span>
        <span class="mono">${esc(storageUsage())}</span>
      </div>
      <div class="data-row">
        <span>Version</span>
        <span class="mono">${esc(APP_VERSION)}</span>
      </div>
      <div class="data-row">
        <span>Build</span>
        <span class="mono">${esc(BUILD_NUMBER)}</span>
      </div>
      <div class="danger-zone">
        <button class="btn btn-danger" type="button" data-action="reset">Clear all data</button>
      </div>
    </section>
  `;
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', group: 'main', render: profileEditor },
  { id: 'experience', label: 'Experience', group: 'main', render: experienceEditor },
  { id: 'education', label: 'Education', group: 'main', render: educationEditor },
  { id: 'projects', label: 'Projects', group: 'main', render: projectsEditor },
  { id: 'skills', label: 'Skills', group: 'main', render: skillsEditor },
  { id: 'releases', label: 'Releases', group: 'info', render: releasesEditor },
  { id: 'changelog', label: 'Changelog', group: 'info', render: changelogEditor },
  { id: 'export', label: 'Export', group: 'tool', render: exportEditor },
  { id: 'settings', label: 'Settings', group: 'utility', render: settingsEditor }
];

function renderTabs() {
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = SECTIONS.map((section, index) => {
    const firstOfTool = section.group === 'tool' && (index === 0 || SECTIONS[index - 1].group !== 'tool');
    const classes = ['tab'];
    if (section.id === ui.section) classes.push('is-active');
    if (firstOfTool) classes.push('is-right');
    return `<button class="${classes.join(' ')}" type="button" role="tab" aria-selected="${
      section.id === ui.section
    }" data-tab="${section.id}">${esc(section.label)}</button>`;
  }).join('');

  const active = tabs.querySelector('.tab.is-active');
  if (active) {
    requestAnimationFrame(() => {
      active.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }
}

function renderEditor() {
  const panel = document.getElementById('editor-panel');
  const section = SECTIONS.find((item) => item.id === ui.section) || SECTIONS[0];
  panel.innerHTML = section.render();
}

function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme;
  root.dataset.font = state.settings.font;
  root.dataset.density = state.settings.density;
}

/* -------------------------------------------------------------------- */
/* resume preview                                                       */
/* -------------------------------------------------------------------- */

function renderRole(item) {
  const bullets = splitLines(item.highlights);
  const tags = splitList(item.tags);
  const dates = dateRange(item);
  const sub = dots([item.company, item.location]);

  return `
    <div class="r-entry">
      <div class="r-entry-head">
        <h3 class="r-entry-title">${esc(item.role || 'Role')}</h3>
        ${dates ? `<span class="r-entry-dates">${esc(dates)}</span>` : ''}
      </div>
      ${sub ? `<p class="r-entry-sub">${sub}</p>` : ''}
      ${bullets.length ? `<ul class="r-bullets">${bullets.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}
      ${
        state.settings.showTags && tags.length
          ? `<p class="r-tags">${tags.map((tag) => esc(tag)).join(' · ')}</p>`
          : ''
      }
    </div>
  `;
}

function renderEducation(item) {
  const degree = [item.degree, item.field].filter(Boolean).join(', ');
  const title = degree || item.school || 'Study';
  const sub = degree && item.school ? dots([item.school, item.location]) : dots([item.location]);
  const dates = dateRange(item);
  const details = splitLines(item.details);

  return `
    <div class="r-entry">
      <div class="r-entry-head">
        <h3 class="r-entry-title">${esc(title)}</h3>
        ${dates ? `<span class="r-entry-dates">${esc(dates)}</span>` : ''}
      </div>
      ${sub ? `<p class="r-entry-sub">${sub}</p>` : ''}
      ${details.length ? `<ul class="r-bullets">${details.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}
    </div>
  `;
}

function renderProject(item) {
  const tech = splitList(item.tech);
  const title = item.link
    ? `<a href="${esc(/^https?:\/\//i.test(item.link) ? item.link : 'https://' + item.link)}" target="_blank" rel="noopener noreferrer">${esc(
        item.name || 'Project'
      )}</a>`
    : esc(item.name || 'Project');

  return `
    <div class="r-entry">
      <div class="r-entry-head">
        <h3 class="r-entry-title">${title}</h3>
      </div>
      ${item.description ? `<p class="r-entry-sub">${esc(item.description)}</p>` : ''}
      ${tech.length ? `<p class="r-tags">${tech.map((tag) => esc(tag)).join(' · ')}</p>` : ''}
    </div>
  `;
}

function sectionTitle(text) {
  return `<h2 class="r-section-title">${esc(text)}</h2>`;
}

function renderPreview() {
  const resume = document.getElementById('resume');
  const profile = state.profile;
  const settings = state.settings;
  const body = [];

  const contact = [];
  if (profile.email) contact.push(`<a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>`);
  if (profile.phone) contact.push(`<span>${esc(profile.phone)}</span>`);
  if (profile.location) contact.push(`<span>${esc(profile.location)}</span>`);
  if (profile.website) contact.push(webLink(profile.website));
  if (profile.linkedin) contact.push(webLink(profile.linkedin));

  if (settings.showSummary && profile.summary.trim()) {
    body.push(`<section class="r-section"><p class="r-summary">${esc(profile.summary)}</p></section>`);
  }

  const roles = state.experience.filter((item) => item.role || item.company);
  if (settings.sections.experience && roles.length) {
    body.push(`<section class="r-section">${sectionTitle('Experience')}${roles.map(renderRole).join('')}</section>`);
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (settings.sections.education && schools.length) {
    body.push(`<section class="r-section">${sectionTitle('Education')}${schools.map(renderEducation).join('')}</section>`);
  }

  const projects = state.projects.filter((item) => item.name);
  if (settings.sections.projects && projects.length) {
    body.push(`<section class="r-section">${sectionTitle('Projects')}${projects.map(renderProject).join('')}</section>`);
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (settings.sections.skills && skills.length) {
    body.push(
      `<section class="r-section">${sectionTitle('Skills')}${skills
        .map(
          (item) =>
            `<div class="r-skill"><span class="r-skill-label">${esc(item.label || 'Skills')}</span><span>${esc(
              item.items
            )}</span></div>`
        )
        .join('')}</section>`
    );
  }

  const hasHeader = Boolean(profile.name || profile.headline || contact.length);

  if (!hasHeader && !body.length) {
    resume.innerHTML = `
      <div class="resume-empty">
        <strong>Your resume will appear here</strong>
        <p>Start with your name and a one-line headline in Profile, then add roles in Experience.
        Everything updates in this preview as you type.</p>
        <div class="empty-actions">
          <button class="btn btn-primary" type="button" data-preview-action="profile">Go to Profile</button>
          <button class="btn" type="button" data-preview-action="example">Load sample data</button>
        </div>
      </div>
    `;
    return;
  }

  resume.innerHTML = `
    <header class="r-header">
      <h1 class="r-name">${esc(profile.name || 'Your name')}</h1>
      ${profile.headline ? `<p class="r-headline">${esc(profile.headline)}</p>` : ''}
      ${contact.length ? `<p class="r-contact">${contact.join(' <span class="r-dot">·</span> ')}</p>` : ''}
    </header>
    ${body.join('')}
  `;
}

/* -------------------------------------------------------------------- */
/* actions                                                              */
/* -------------------------------------------------------------------- */

const EXPORT_FORMATS = {
  pdf: { label: 'PDF', ext: 'pdf' },
  docx: { label: 'DOCX', ext: 'docx' },
  txt: { label: 'TXT', ext: 'txt' },
  md: { label: 'Markdown', ext: 'md' },
  json: { label: 'JSON', ext: 'json' }
};

async function exportFile(kind) {
  const meta = EXPORT_FORMATS[kind];
  if (!meta) return;
  const base = fileNameBase(state);
  const name = base + '.' + meta.ext;

  try {
    let blob;
    if (kind === 'pdf') blob = buildPdf(state);
    else if (kind === 'docx') blob = buildDocx(state);
    else if (kind === 'md') blob = new Blob([toMarkdown(state)], { type: 'text/markdown;charset=utf-8' });
    else if (kind === 'txt') blob = new Blob([toPlainText(state)], { type: 'text/plain;charset=utf-8' });
    else blob = new Blob([toJson(state)], { type: 'application/json' });

    const result = await saveBlob(blob, name);

    if (result === 'downloaded') toast(meta.label + ' saved');
    else if (result === 'opened') {
      showExportSheet(blob, name, kind);
    }
  } catch (error) {
    console.error(error);
    toast(
      'Could not create the ' + meta.label + ': ' + (error && error.message ? error.message : 'unknown error'),
      true
    );
  }
}

function importFile(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const result = parseImport(file.name || '', String(reader.result));
      state = normalize(result.state);
      applyAppearance();
      goTo('profile');
      renderPreview();
      save();
      flushSave();
      toast('Imported ' + result.format + ' — preview restored');
    } catch (error) {
      toast(error && error.message ? error.message : 'Could not import that file', true);
    }
    const input = document.getElementById('file-input');
    if (input) input.value = '';
  };

  reader.onerror = () => {
    toast('That file could not be read', true);
    const input = document.getElementById('file-input');
    if (input) input.value = '';
  };

  reader.readAsText(file);
}

function loadExample() {
  if (hasAnyData() && !window.confirm('Replace what you have with the example resume?')) return;
  state = exampleState();
  applyAppearance();
  goTo('profile');
  renderPreview();
  save();
  flushSave();
  toast('Sample resume loaded');
}

function handleAction(action, button) {
  if (action === 'import') {
    document.getElementById('file-input').click();
    return;
  }

  if (action === 'reset') {
    if (!window.confirm('Delete everything and start from an empty resume?')) return;
    state = emptyState();
    applyAppearance();
    goTo('profile');
    renderPreview();
    save();
    flushSave();
    toast('All data cleared');
    return;
  }

  const collection = button.dataset.col;
  const id = button.dataset.id;
  const list = state[collection];
  if (!list) return;

  if (action === 'add') {
    list.push(COLLECTIONS[collection].make());
    renderEditor();
    const cards = document.querySelectorAll('#editor-panel .card');
    const last = cards[cards.length - 1];
    if (last) {
      const firstInput = last.querySelector('input:not([type="checkbox"]), textarea');
      if (firstInput) firstInput.focus();
    }
    save();
    renderPreview();
    return;
  }

  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return;

  if (action === 'remove') {
    if (!window.confirm('Delete this entry?')) return;
    list.splice(index, 1);
  } else if (action === 'move-up' && index > 0) {
    [list[index - 1], list[index]] = [list[index], list[index - 1]];
  } else if (action === 'move-down' && index < list.length - 1) {
    [list[index + 1], list[index]] = [list[index], list[index + 1]];
  } else {
    return;
  }

  renderEditor();
  save();
  renderPreview();
}

function applySetting(key, value) {
  if (key === 'theme') state.settings.theme = value === 'light' ? 'light' : 'dark';
  else if (key === 'font') state.settings.font = value === 'serif' ? 'serif' : 'sans';
  else if (key === 'density') state.settings.density = value === 'compact' ? 'compact' : 'comfortable';
  else return;

  applyAppearance();
  renderEditor();
  renderPreview();
  save();
}

function goTo(id) {
  if (!SECTIONS.some((section) => section.id === id)) return;

  const changed = ui.section !== id;
  const editor = document.getElementById('editor');
  if (editor) ui.scrolls[ui.section] = editor.scrollTop;

  ui.section = id;
  saveUi();
  renderTabs();
  renderEditor();
  renderPreview();

  requestAnimationFrame(() => {
    if (editor) editor.scrollTop = ui.scrolls[id] || 0;
    if (changed) window.scrollTo(0, 0);
  });
}

function storageUsage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || '';
    const kb = Math.max(1, Math.round(raw.length / 1024));
    return 'about ' + kb + ' KB';
  } catch (error) {
    return 'unavailable';
  }
}

function hasAnyData() {
  return JSON.stringify(state) !== JSON.stringify(emptyState());
}

function setStatus(text) {
  const el = document.getElementById('dock-status');
  if (el) el.textContent = text;
}

function showHint(message) {
  const hint = document.getElementById('saved-hint');
  if (!hint) return;
  hint.textContent = message;
  hint.classList.add('is-visible');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove('is-visible'), 1800);
}

function toast(message, isError) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast is-visible' + (isError ? ' is-error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, 2800);
}

/* -------------------------------------------------------------------- */
/* events                                                               */
/* -------------------------------------------------------------------- */

function onPanelInput(event) {
  const target = event.target;

  if (event.type === 'change' && target.tagName !== 'SELECT') return;

  const path = target.dataset ? target.dataset.path : null;
  if (!path) return;

  const value = target.type === 'checkbox' ? target.checked : target.value;
  setPath(state, path, value);

  if (path.indexOf('settings.') === 0) applyAppearance();

  save();
  renderPreview();

  if (target.type === 'checkbox' && path.indexOf('experience.') === 0) {
    const card = target.closest('.card');
    const cardId = card ? card.dataset.cardId : null;
    renderEditor();
    const again = cardId ? document.querySelector(`#editor-panel .card[data-card-id="${cardId}"]`) : null;
    const checkbox = again ? again.querySelector('input[type="checkbox"]') : null;
    if (checkbox) checkbox.focus();
  }
}

function onPanelClick(event) {
  const copyButton = event.target.closest('[data-copy]');
  if (copyButton) {
    copyText(copyButton.dataset.copy);
    return;
  }

  const exportButton = event.target.closest('[data-export]');
  if (exportButton) {
    exportFile(exportButton.dataset.export);
    return;
  }

  const setButton = event.target.closest('[data-set]');
  if (setButton) {
    applySetting(setButton.dataset.set, setButton.dataset.value);
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    handleAction(actionButton.dataset.action, actionButton);
  }
}

function onDockClick(event) {
  const button = event.target.closest('[data-dock]');
  if (!button) return;

  const action = button.dataset.dock;
  if (action === 'import') document.getElementById('file-input').click();
  else if (action === 'example') loadExample();
  else if (action === 'export') goTo('export');
  else if (action === 'settings') goTo('settings');
  else if (action === 'preview') {
    const resume = document.getElementById('resume');
    if (resume) resume.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (action === 'pdf') exportFile('pdf');
}

function bindEvents() {
  document.getElementById('tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) goTo(tab.dataset.tab);
  });

  const panel = document.getElementById('editor-panel');
  panel.addEventListener('input', onPanelInput);
  panel.addEventListener('change', onPanelInput);
  panel.addEventListener('click', onPanelClick);

  panel.addEventListener('dragover', (event) => {
    const zone = event.target.closest('#drop-zone');
    if (!zone) return;
    event.preventDefault();
    zone.classList.add('is-over');
  });

  panel.addEventListener('dragleave', (event) => {
    const zone = event.target.closest('#drop-zone');
    if (zone) zone.classList.remove('is-over');
  });

  panel.addEventListener('drop', (event) => {
    const zone = event.target.closest('#drop-zone');
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove('is-over');
    const files = event.dataTransfer && event.dataTransfer.files;
    if (files && files[0]) importFile(files[0]);
  });

  document.getElementById('resume').addEventListener('click', (event) => {
    const button = event.target.closest('[data-preview-action]');
    if (!button) return;
    if (button.dataset.previewAction === 'example') loadExample();
    else goTo('profile');
  });

  document.getElementById('dock').addEventListener('click', onDockClick);
  document.getElementById('btn-export-quick').addEventListener('click', () => goTo('export'));
  document.getElementById('btn-print').addEventListener('click', () => window.print());

  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) importFile(file);
    fileInput.value = '';
  });

  window.addEventListener(
    'scroll',
    () => {
      scheduleUiSave();
    },
    { passive: true }
  );

  document.getElementById('editor').addEventListener(
    'scroll',
    (event) => {
      ui.scrolls[ui.section] = event.target.scrollTop;
      scheduleUiSave();
    },
    { passive: true }
  );

  window.addEventListener('beforeunload', () => {
    flushSave();
    saveUi();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushSave();
      saveUi();
    }
  });
}

/* -------------------------------------------------------------------- */
/* init                                                                 */
/* -------------------------------------------------------------------- */

function init() {
  state = loadState();
  loadUi();

  if (!SECTIONS.some((section) => section.id === ui.section)) ui.section = 'profile';

  applyAppearance();
  bindEvents();
  renderTabs();
  renderEditor();
  renderPreview();
  setStatus('Saved on this device');

  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    const editor = document.getElementById('editor');
    if (editor) editor.scrollTop = ui.scrolls[ui.section] || 0;
  });

  if (hasAnyData()) showHint('Restored from this device');
}

init();
