/*
 * GMO Résumé Manager — a resume and experience tracker.
 * Everything lives in localStorage; exports can be imported back exactly.
 */

import { changelogEditor, releasesEditor } from './releases';
import { buildDocx } from './docx';
import { buildPdf } from './pdf';
import { toJson, toMarkdown, toPlainText } from './format';
import { parseImportBytes } from './parse';
import { APP_VERSION, BUILD_NUMBER } from './version';
import { saveBlob, shareFiles } from './util';
import { buildPngPages } from './png';
import { createZip } from './zip';
import { runRoundTrip, formatReport } from './selftest';
import {
  evaluateResume,
  buildLlmPrompt,
  REGION_GUIDES,
  REGION_SCORE_WEIGHTS,
  CHECK_LABELS,
  METHOD_SOURCES,
  STANDARDS_CAVEAT,
  staleRegions,
  contentSignature,
  regionFieldNotes
} from './screening';
import { complianceIssues } from './compliance';
import { regionFields, missingRequiredFields, logisticsLine, visiblePhoto } from './fields';
import { readsAsNationality } from './context';

const STORAGE_KEY = 'gmoResumeManager.v2';
const LEGACY_STORAGE_KEY = 'resumeStudio.v1';
const UI_KEY = 'gmoResumeManager.ui.v1';
const HISTORY_KEY = 'gmoResumeManager.history.v1';
const HISTORY_LIMIT = 40;

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
  certifications: {
    noun: 'certification',
    make: () => ({
      id: uid(),
      name: '',
      issuer: '',
      date: '',
      expires: '',
      link: ''
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

/* Hiring regions the screening checks know about. */
const REGION_IDS = ['emea', 'us', 'gcc', 'apac', 'latam', 'anz'];
const REGION_LABELS = { emea: 'EMEA', us: 'US', gcc: 'GCC', apac: 'APAC', latam: 'LATAM', anz: 'ANZ' };

function defaultSettings() {
  return {
    theme: 'dark',
    colorMode: 'color',
    font: 'sans',
    density: 'comfortable',
    showSummary: true,
    showTags: true,
    target: '',
    keywords: '',
    region: 'emea',
    syncRegions: true,
    sections: { experience: true, education: true, certifications: true, projects: true, skills: true }
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
      summary: '',
      photo: '',
      photoFull: '',
      nationality: '',
      workAuth: '',
      availability: '',
      dateOfBirth: '',
      maritalStatus: ''
    },
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    skills: [],
    settings: defaultSettings(),
    regions: {}
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
        'Engineer with eight years building reliable backends and the tooling around them. I like small teams, clear interfaces, and leaving systems easier to change than I found them.',
      photo: '',
      photoFull: '',
      nationality: '',
      workAuth: '',
      availability: '',
      dateOfBirth: '',
      maritalStatus: ''
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
    certifications: [
      { id: uid(), name: 'AWS Certified Solutions Architect – Associate', issuer: 'Amazon Web Services', date: 'Mar 2023', expires: 'Mar 2026', link: '' },
      { id: uid(), name: 'Professional Scrum Master I', issuer: 'Scrum.org', date: 'Sep 2021', expires: '', link: '' }
    ],
    settings: defaultSettings()
  };
}

/* -------------------------------------------------------------------- */
/* persistence                                                          */
/* -------------------------------------------------------------------- */

let state = emptyState();
let ui = {
  section: 'profile',
  scrolls: {},
  pageY: 0,
  regulations: false,
  guided: false,
  guidedStep: 0,
  tourSeen: false,
  sub: { education: 'education', settings: 'settings' }
};
let history = [];
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

/** The part of a resume that can differ per market: content only, never appearance. */
function captureContent(source) {
  return JSON.parse(
    JSON.stringify({
      profile: source.profile,
      experience: source.experience,
      education: source.education,
      certifications: source.certifications,
      projects: source.projects,
      skills: source.skills
    })
  );
}

/** Copies one market's saved text onto the live document. */
function adoptContent(target, content) {
  if (!content || typeof content !== 'object') return;
  const copy = JSON.parse(JSON.stringify(content));
  target.profile = copy.profile;
  target.experience = copy.experience;
  target.education = copy.education;
  target.certifications = copy.certifications;
  target.projects = copy.projects;
  target.skills = copy.skills;
}

/**
 * The markets whose text differs from the one on screen, while sync is off. The check
 * itself lives in screening.ts, so the Regional fit card and this header badge always
 * name the same markets.
 */
function divergentRegions() {
  return staleRegions(state);
}

/** The markets holding their own text, other than the one on screen. */
function storedRegions() {
  return REGION_IDS.filter((id) => id !== currentRegion() && Boolean(state.regions && state.regions[id]));
}

/**
 * What one market holds right now, for the dot beside it in the region menu:
 * 'here' (the market on screen), 'own' (its own text), 'same' (a copy identical to this
 * one) and 'none' (never opened, so it would start from the text on screen).
 */
function regionSyncState(id, liveSignature) {
  if (id === currentRegion()) return 'here';
  const copy = state.regions && state.regions[id];
  if (!copy) return 'none';
  const live = liveSignature || contentSignature(captureContent(state));
  return contentSignature(copy) === live ? 'same' : 'own';
}

function applyContent(base, source) {
  const incoming = source && source.profile && typeof source.profile === 'object' ? source.profile : {};

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
}

function normalizeContent(source) {
  const base = emptyState();
  applyContent(base, source && typeof source === 'object' ? source : {});
  return captureContent(base);
}

function normalize(data) {
  const base = emptyState();
  const source = data && typeof data === 'object' ? data : {};
  applyContent(base, source);

  /* A resume saved while "Sync all regions" was off carries one text per market. */
  if (source.regions && typeof source.regions === 'object') {
    REGION_IDS.forEach((id) => {
      const copy = source.regions[id];
      if (!copy || typeof copy !== 'object') return;
      base.regions[id] = normalizeContent(copy);
    });
  }

  base.settings = normalizeSettings(source.settings);
  repairImportedContent(base);
  return base;
}

const TABLE_SEPARATOR = /^:?-{2,}:?$/;

function cleanCell(value) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .trim();
}

function validLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(raw)) return raw;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(raw)) return raw;
  return '';
}

function normaliseLink(value) {
  const raw = validLink(value);
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
}

function parseTableRows(lines) {
  if (!lines.length) return [];
  const cells = lines.map((line) =>
    line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((cell) => cell.trim())
  );

  const separatorAt = cells.findIndex((row) => row.every((cell) => cell === '' || TABLE_SEPARATOR.test(cell)));
  if (separatorAt === -1) return [];

  const header = separatorAt > 0 ? cells[separatorAt - 1] : [];
  const body = cells.slice(separatorAt + 1);
  const lower = header.map((cell) => cell.toLowerCase());

  const pick = (patterns, fallback) => {
    for (let i = 0; i < lower.length; i += 1) {
      if (patterns.some((pattern) => pattern.test(lower[i]))) return i;
    }
    return fallback;
  };

  const nameAt = pick([/^certif/, /^name$/, /^title$/], 1);
  const issuerAt = pick([/^issuer$/, /^issuing/, /^organi/, /^provider/, /^authority/], 2);
  const dateAt = pick([/^issued$/, /^issue date$/, /^date issued$/, /^date$/], 3);
  const expiresAt = pick([/^expire/], 4);
  const linkAt = pick([/url$/, /^link$/], 6);

  return body
    .map((row) => ({
      name: cleanCell(row[nameAt]),
      issuer: cleanCell(row[issuerAt]),
      date: cleanCell(row[dateAt]),
      expires: cleanCell(row[expiresAt]).replace(/^[—–-]+$/, ''),
      link: normaliseLink(row[linkAt])
    }))
    .filter((row) => row.name && row.name !== '#' && !TABLE_SEPARATOR.test(row.name));
}

/**
 * Repairs state that was imported from a document rather than a resume: a reference
 * heading used as the name, and a Markdown table dumped into the summary. The table
 * rows become certifications, so nothing is lost.
 */
function repairImportedContent(base) {
  // Only blank out links that are clearly not links; never rewrite a valid one, so
  // export -> import leaves every field exactly as typed.
  base.certifications.forEach((item) => {
    if (item.link && !validLink(item.link)) item.link = '';
    if (/^[—–-]+$/.test(item.expires)) item.expires = '';
  });

  const name = base.profile.name || '';
  if (name.length > 40 && /certifications|credentials|reference/i.test(name)) {
    const head = name.split(/\s+[—–-]\s+/)[0].trim();
    if (head) base.profile.name = head;
  }

  const summary = base.profile.summary || '';
  if (!/^\s*\|.*\|/m.test(summary)) return;

  const lines = summary.split(/\r?\n/);
  const tableLines = [];
  const remaining = [];
  let inTable = false;

  lines.forEach((line) => {
    if (/^\s*\|/.test(line)) {
      inTable = true;
      tableLines.push(line);
      return;
    }
    if (inTable) {
      inTable = false;
      if (line.trim() === '') return;
    }
    remaining.push(line);
  });

  const rows = parseTableRows(tableLines);
  if (!rows.length) {
    base.profile.summary = remaining.join('\n').trim();
    return;
  }

  rows.forEach((row) => {
    base.certifications.push({ id: uid(), ...row });
  });

  // The source was a reference sheet, not a summary.
  base.profile.summary = rows.length >= 3 ? '' : remaining.join('\n').trim();
}

function normalizeSettings(raw) {
  const out = defaultSettings();
  if (!raw || typeof raw !== 'object') return out;

  if (raw.theme === 'light' || raw.theme === 'dark') out.theme = raw.theme;
  if (raw.colorMode === 'bw' || raw.colorMode === 'color') out.colorMode = raw.colorMode;
  if (raw.font === 'serif' || raw.font === 'sans') out.font = raw.font;
  if (raw.density === 'compact' || raw.density === 'comfortable') out.density = raw.density;
  if (typeof raw.showSummary === 'boolean') out.showSummary = raw.showSummary;
  if (typeof raw.showTags === 'boolean') out.showTags = raw.showTags;
  if (typeof raw.target === 'string') out.target = raw.target;
  if (typeof raw.keywords === 'string') out.keywords = raw.keywords;
  if (typeof raw.region === 'string' && REGION_IDS.indexOf(raw.region) !== -1) out.region = raw.region;
  if (typeof raw.syncRegions === 'boolean') out.syncRegions = raw.syncRegions;

  if (raw.sections && typeof raw.sections === 'object') {
    ['experience', 'education', 'certifications', 'projects', 'skills'].forEach((key) => {
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
    if (parsed.regulations === true) ui.regulations = true;
    if (parsed.guided === true) ui.guided = true;
    if (typeof parsed.guidedStep === 'number' && parsed.guidedStep >= 0) ui.guidedStep = parsed.guidedStep;
    if (parsed.tourSeen === true) ui.tourSeen = true;
    if (parsed.sub && typeof parsed.sub === 'object') {
      if (parsed.sub.education === 'certifications' || parsed.sub.education === 'education') {
        ui.sub.education = parsed.sub.education;
      }
      if (['settings', 'export', 'history', 'releases'].indexOf(parsed.sub.settings) !== -1) {
        ui.sub.settings = parsed.sub.settings;
      }
    }
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

/* --- history of saved versions, kept only in this browser --- */

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === 'object' && entry.state);
  } catch (error) {
    return [];
  }
}

function persistHistory() {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    toast('Could not save the snapshot — storage is full', true);
    return false;
  }
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function saveSnapshot() {
  const entry = {
    id: uid(),
    savedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state))
  };

  history.unshift(entry);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  if (!persistHistory()) return;

  toast('Saved to history');
  if (ui.section === 'history') renderEditor();
  else if (ui.section === 'settings') renderEditor();
}

/** Keeps the current resume in History before something replaces it. */
function snapshotQuietly() {
  if (!hasAnyData()) return;
  history.unshift({
    id: uid(),
    savedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state))
  });
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  persistHistory();
}

function restoreSnapshot(id) {
  const entry = history.find((item) => item.id === id);
  if (!entry) return;
  if (!window.confirm('Replace the resume with this saved version?')) return;

  state = normalize(JSON.parse(JSON.stringify(entry.state)));
  applyAppearance();
  renderTabs();
  renderEditor();
  renderPreview();
  save();
  flushSave();
  toast('Restored the version from ' + formatWhen(entry.savedAt));
}

function deleteSnapshot(id) {
  const entry = history.find((item) => item.id === id);
  if (!entry) return;
  if (!window.confirm('Delete this saved version?')) return;
  history = history.filter((item) => item.id !== id);
  persistHistory();
  renderEditor();
  toast('Version deleted');
}

async function downloadSnapshot(id) {
  const entry = history.find((item) => item.id === id);
  if (!entry) return;
  const profile = entry.state.profile || {};
  const stamp = String(entry.savedAt || '').slice(0, 10);
  const name = slugify(profile.name || 'resume') + '-resume-' + stamp + '.json';
  try {
    const file = new File([toJson(entry.state)], name, { type: 'application/json' });
    await deliverFile(file, 'json');
  } catch (error) {
    console.error(error);
    toast('Could not write that snapshot', true);
  }
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

/** A stable id for a field, so its label and its notes can point at it. */
function controlId(path) {
  return 'f-' + String(path || '').replace(/[^\w-]/g, '-');
}

function field(label, path, value, placeholder, options) {
  const opts = options || {};
  const classes = opts.span ? 'field ' + opts.span : 'field';
  const inputId = controlId(path);
  const attrs = `id="${inputId}" data-path="${path}"${opts.disabled ? ' disabled' : ''}`;

  let control;
  if (opts.rows) {
    control = `<textarea rows="${opts.rows}" ${attrs} placeholder="${esc(placeholder || '')}">${esc(value)}</textarea>`;
  } else {
    const type = opts.type || 'text';
    const autocomplete = opts.autocomplete ? ` autocomplete="${opts.autocomplete}"` : '';
    control = `<input type="${type}" ${attrs} value="${esc(value)}" placeholder="${esc(placeholder || '')}"${autocomplete} />`;
  }

  /* A label beside the control, not around it: the notes under a field can hold a
     button of their own, and a button inside a label is not allowed. */
  return `<div class="${classes}"><label class="field-label" for="${inputId}">${esc(label)}</label>${control}</div>`;
}

function toolButtons(collection, id, index, total) {
  return `
    <button class="icon-btn" type="button" data-action="move-up" data-col="${collection}" data-id="${id}"
      title="Move up" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
    <button class="icon-btn" type="button" data-action="move-down" data-col="${collection}" data-id="${id}"
      title="Move down" aria-label="Move down" ${index === total - 1 ? 'disabled' : ''}>↓</button>
    <button class="icon-btn danger" type="button" data-action="remove" data-col="${collection}" data-id="${id}"
      title="Delete" aria-label="Delete" >✕</button>
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

/* -------------------------------------------------------------------- */
/* region details: only the fields the selected market expects          */
/* -------------------------------------------------------------------- */

function requiredTag(spec) {
  return spec.required ? ' <span class="req-tag">required</span>' : ' <span class="opt-tag">optional</span>';
}

function regionPhotoControl(spec) {
  const photo = state.profile.photo;
  const hintId = controlId('profile.photo') + '-hint';
  return `<div class="field span-2 region-photo">
    <span class="field-label">${esc(spec.label)}${requiredTag(spec)}</span>
    <div class="photo-row">
      <span class="photo-thumb">${
        photo ? `<img src="${esc(photo)}" alt="Profile photo preview" />` : '<span class="photo-empty">No photo</span>'
      }</span>
      <label class="btn btn-sm file-trigger">
        ${photo ? 'Replace photo' : 'Upload photo'}
        <input type="file" class="file-input" accept="image/*" data-photo-input aria-describedby="${hintId}" />
      </label>
      ${photo ? '<button class="btn btn-sm btn-ghost" type="button" data-action="remove-photo">Remove</button>' : ''}
    </div>
    <span class="field-hint" id="${hintId}">${esc(spec.hint)}</span>
  </div>`;
}

function regionTextField(spec) {
  const value = state.profile[spec.key] || '';
  const unrecognised = spec.key === 'nationality' && value.trim() && !readsAsNationality(value);
  const inputId = controlId('profile.' + spec.key);
  const hintId = inputId + '-hint';
  return `<div class="field${spec.required ? ' is-required' : ''}">
    <label class="field-label" for="${inputId}">${esc(spec.label)}${requiredTag(spec)}</label>
    <input id="${inputId}" type="text" data-path="profile.${spec.key}" aria-describedby="${hintId}" value="${esc(
      value
    )}" placeholder="${esc(spec.placeholder)}" />
    <span class="field-hint" id="${hintId}">${esc(spec.hint)}</span>
    ${
      unrecognised
        ? `<span class="field-hint field-warn">The check does not read this as a nationality. Write it as a country
      or a demonym — Lebanese, Germany — or as “citizen of Lebanon” — so it is not missed.</span>`
        : ''
    }
  </div>`;
}

function regionFieldsBlock() {
  const region = currentRegion();
  const specs = regionFields(region);
  const label = REGION_LABELS[region];

  if (!specs.length) {
    return `<div class="region-fields-empty span-2">
      <strong>${esc(label)} CVs carry no photo or personal details.</strong>
      <p>This market filters nationality, date of birth, marital status and photographs out, sometimes before a person
      reads the file, so the builder hides those fields while ${esc(label)} is selected. Switch region above to see the
      fields another market expects.</p>
    </div>`;
  }

  const required = specs.filter((spec) => spec.required).length;
  return `<div class="region-fields span-2">
    <div class="region-fields-head">
      <strong>${esc(label)} details</strong>
      <span>${specs.length} field${specs.length === 1 ? '' : 's'} this market expects${
    required ? ', ' + required + ' required' : ', all optional'
  }</span>
    </div>
    <div class="form-grid">
      ${specs.map((spec) => (spec.kind === 'photo' ? regionPhotoControl(spec) : regionTextField(spec))).join('')}
    </div>
  </div>`;
}

/** Reads the upload twice: a small display copy, and the picture kept whole for backups. */
const PHOTO_DISPLAY_MAX = 320;
const PHOTO_FULL_MAX = 1600;
const PHOTO_FULL_LIMIT = 900000; /* characters of data URL before the archive copy is re-encoded */

function renderPhoto(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.width || max, img.height || max));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((img.width || max) * scale));
  canvas.height = Math.max(1, Math.round((img.height || max) * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function readPhotoFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const original = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        try {
          const display = renderPhoto(img, PHOTO_DISPLAY_MAX, 0.82);
          /* The archive keeps the upload untouched when it fits comfortably; a very large
             phone photo is re-encoded at 1600px rather than blowing the storage budget. */
          const full = original.length <= PHOTO_FULL_LIMIT ? original : renderPhoto(img, PHOTO_FULL_MAX, 0.92);
          resolve({ display, full });
        } catch (error) {
          reject(error);
        }
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoInput(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    const photo = await readPhotoFile(file);
    state.profile.photo = photo.display;
    state.profile.photoFull = photo.full;
    save();
    renderEditor();
    renderPreview();
    toast(photo.full === photo.display ? 'Photo added' : 'Photo added — full quality kept for backups');
  } catch (error) {
    toast('That image could not be read', true);
  }
  input.value = '';
}

function profileEditor() {
  const p = state.profile;
  return `
    <div class="panel-head">
      <h2>Profile</h2>
      <p class="panel-sub">The header of your resume. Everything here saves as you type, and the fields follow the
      market you selected.</p>
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
      ${regionFieldsBlock()}
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

function certificationsEditor() {
  const items = state.certifications;
  const cards = items
    .map((item, index) => {
      const base = `certifications.${index}`;
      return `<div class="card" data-card-id="${item.id}">
        ${cardHead('certifications', item, index, items.length, item.name || 'Untitled certification')}
        <div class="form-grid">
          ${field('Certification', base + '.name', item.name, 'ISTQB Certified Tester', { span: 'span-2' })}
          ${field('Issuer', base + '.issuer', item.issuer, 'ISTQB')}
          ${field('Issued', base + '.date', item.date, 'Mar 2024')}
          ${field('Expires', base + '.expires', item.expires, 'Leave empty if it does not', { span: 'span-2' })}
          ${field('Credential link', base + '.link', item.link, 'https://…', { span: 'span-2' })}
        </div>
      </div>`;
    })
    .join('');

  return editorShell(
    'Certifications',
    'Licences, certificates and badges. They render as a table on the resume, under Education.',
    cards || emptyNote('No certifications yet.'),
    'certifications'
  );
}

function educationHub() {
  const sub = ui.sub && ui.sub.education === 'certifications' ? 'certifications' : 'education';
  return `
    <div class="subtabs" role="tablist" aria-label="Education and certifications">
      <button class="subtab${sub === 'education' ? ' is-active' : ''}" type="button" role="tab"
        aria-selected="${sub === 'education'}" data-subtab="education" data-value="education">Education</button>
      <button class="subtab${sub === 'certifications' ? ' is-active' : ''}" type="button" role="tab"
        aria-selected="${sub === 'certifications'}" data-subtab="education" data-value="certifications">Certifications</button>
    </div>
    ${sub === 'certifications' ? certificationsEditor() : educationEditor()}
  `;
}

function settingsHub() {
  const items = [
    { id: 'settings', label: 'Settings' },
    { id: 'export', label: 'Export' },
    { id: 'history', label: 'History' },
    { id: 'releases', label: 'Releases' }
  ];
  const sub = ui.sub && items.some((item) => item.id === ui.sub.settings) ? ui.sub.settings : 'settings';

  return `
    <div class="subtabs" role="tablist" aria-label="Settings sections">
      ${items
        .map(
          (item) => `<button class="subtab${sub === item.id ? ' is-active' : ''}" type="button" role="tab"
        aria-selected="${sub === item.id}" data-subtab="settings" data-value="${item.id}">${esc(item.label)}</button>`
        )
        .join('')}
    </div>
    ${
      sub === 'export'
        ? exportEditor()
        : sub === 'history'
        ? historyEditor()
        : sub === 'releases'
        ? `${releasesEditor()}${changelogEditor()}`
        : settingsEditor()
    }
  `;
}

function historyRow(entry) {
  const saved = entry.state || {};
  const profile = saved.profile || {};
  const roles = (saved.experience || []).length;
  const certs = (saved.certifications || []).length;
  const groups = (saved.skills || []).length;
  const meta = [profile.headline, roles ? roles + (roles === 1 ? ' role' : ' roles') : '', certs ? certs + ' cert.' : '', groups ? groups + ' skill groups' : '']
    .filter(Boolean)
    .map((part) => esc(part))
    .join(' · ');

  return `<article class="history-item">
    <div class="history-head">
      <span class="history-when">${esc(formatWhen(entry.savedAt))}</span>
    </div>
    <p class="history-name">${esc(profile.name || 'Untitled résumé')}</p>
    ${meta ? `<p class="history-meta">${meta}</p>` : ''}
    <div class="history-actions">
      <button class="btn btn-sm" type="button" data-action="restore" data-id="${entry.id}">Restore</button>
      <button class="btn btn-sm" type="button" data-action="download-snapshot" data-id="${entry.id}">Download</button>
      <button class="btn btn-sm btn-danger" type="button" data-action="delete-snapshot" data-id="${entry.id}">Delete</button>
    </div>
  </article>`;
}

function historyEditor() {
  return `
    <div class="panel-head">
      <h2>History</h2>
      <p class="panel-sub">Snapshots of the whole resume — profile, roles, education, certificates, projects,
      skills and settings — stored in this browser only. ${history.length
        ? history.length + (history.length === 1 ? ' version saved.' : ' versions saved.')
        : 'Nothing saved yet.'}</p>
    </div>
    <p class="fineprint">Save in the dock snapshots the current resume at any time.</p>
    ${
      history.length
        ? `<div class="history-list">${history.map(historyRow).join('')}</div>`
        : emptyNote('No saved versions yet. Press Save to snapshot everything as it is now.')
    }
    <p class="fineprint">Up to 40 versions are kept, newest first. Restoring a version replaces what is in the
    editor — save the current state first if you might want it back.</p>
  `;
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

function formatOption(kind) {
  const meta = EXPORT_FORMATS[kind];
  return `<label class="format-row">
    <input type="checkbox" data-format="${kind}" ${exportSelection[kind] ? 'checked' : ''} />
    <span class="format-icon">${esc(meta.label)}</span>
    <span class="format-text">
      <span class="format-name">${esc(meta.label)}</span>
      <span class="format-desc">${esc(meta.description)}</span>
    </span>
  </label>`;
}

function exportText(kind) {
  if (kind === 'md') return toMarkdown(state);
  if (kind === 'txt') return toPlainText(state);
  return toJson(state);
}

/**
 * The last resort when the share sheet cannot be reached: the file plus a Share
 * button (a fresh tap, which iOS accepts), a real "Save to Files" download link
 * and, for text formats, a copy action. No bare blob URL is opened in a new tab.
 */
function showExportSheet(blob, name, kind, shareables) {
  const previous = document.getElementById('export-sheet');
  if (previous) previous.remove();

  const url = URL.createObjectURL(blob);
  const size = Math.max(1, Math.round(blob.size / 1024));
  const copyable = kind === 'md' || kind === 'txt' || kind === 'json';
  const files = Array.isArray(shareables) ? shareables.filter(Boolean) : [];
  const canShare = files.length > 0 && typeof navigator.share === 'function';

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
        <button class="icon-btn" type="button" data-sheet-close title="Close" aria-label="Close">✕</button>
      </div>
      ${
        kind === 'pdf'
          ? `<iframe class="sheet-frame" src="${url}" title="PDF preview"></iframe>`
          : `<div class="sheet-blank">${esc(kind.toUpperCase())} file · ${size} KB</div>`
      }
      <div class="sheet-actions">
        ${canShare ? '<button class="btn btn-primary" type="button" data-sheet-share>Share…</button>' : ''}
        <a class="btn${canShare ? '' : ' btn-primary'}" href="${url}" download="${esc(name)}">Save to Files</a>
        ${copyable ? `<button class="btn" type="button" data-copy="${kind}">Copy text</button>` : ''}
        <button class="btn btn-ghost" type="button" data-sheet-close>Close</button>
      </div>
      <p class="fineprint">Share opens the system share sheet, where Files, Mail, Messages and the rest can take
      the file. Save to Files writes it into the Files app.</p>
    </div>
  `;

  document.body.appendChild(sheet);

  const close = () => {
    sheet.remove();
    URL.revokeObjectURL(url);
  };

  sheet.addEventListener('click', async (event) => {
    if (event.target === sheet || event.target.closest('[data-sheet-close]')) {
      close();
      return;
    }
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      copyText(copy.dataset.copy);
      return;
    }
    const share = event.target.closest('[data-sheet-share]');
    if (share) {
      const outcome = await shareFiles(files, name);
      if (outcome === 'shared') {
        toast('Shared');
        close();
      } else if (outcome === 'unsupported') {
        toast('Sharing is not available here — use Save to Files', true);
      }
    }
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
      <p class="panel-sub">Pick one or more formats. Files are named
      <code>${esc(exportBaseName())}.ext</code> at the moment you export.</p>
    </div>
    <div class="format-grid">${Object.keys(EXPORT_FORMATS).map(formatOption).join('')}</div>
    <div class="export-bar">
      <button class="btn btn-primary" type="button" data-action="export-download">Download</button>
      <button class="btn" type="button" data-action="export-copy">Copy text</button>
    </div>
    <div class="export-bar">
      <button class="btn" type="button" data-action="full-backup">Full backup with photo</button>
    </div>
    <p class="fineprint">Full backup writes one .json with everything — every field, every setting and the
    profile photo at full quality — so another device can restore the resume exactly. Ticking only JSON above
    exports the same data without that label.</p>
    <p class="fineprint">Two or more files are bundled into a single ZIP. On a phone Download opens the system
    share sheet — Files, Mail, Messages, WhatsApp and the rest. Use Import in the dock (or drop a file here)
    to bring a resume back in.</p>

    <div class="panel-head panel-head-tight">
      <h2>Import</h2>
      <p class="panel-sub">Use Import in the dock to choose a file, or drop one here. Every format
      this app exports restores the same resume: content, order, colour mode and settings.</p>
    </div>
    <div class="drop-zone" id="drop-zone">
      <strong>Drop a resume file here</strong>
      <span>.json, .md, .txt, .pdf, .docx, .png or .zip</span>
    </div>
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
      <h3 class="setting-title">Resume colour</h3>
      <div class="seg" role="group" aria-label="Resume colour">
        ${segButton('colorMode', 'color', 'Colour', s.colorMode === 'color')}
        ${segButton('colorMode', 'bw', 'Black & white', s.colorMode === 'bw')}
      </div>
      <p class="setting-note">Applies to the preview and to PDF, PNG and DOCX exports. Black &amp; white prints
      every line of text in plain black on white.</p>
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
      <h3 class="setting-title">Guidance</h3>
      <div class="switch-row">
        <span>Guided mode<small>A step-by-step panel at the top of the builder that follows you through the resume,
        in the order the checks read it.</small></span>
        <button class="btn btn-sm" type="button" data-action="guided-toggle">${
          ui.guided ? 'Stop guided mode' : 'Start guided mode'
        }</button>
      </div>
      <div class="switch-row">
        <span>App tour<small>Highlights each part of the interface and explains what it does.</small></span>
        <button class="btn btn-sm" type="button" data-action="tour-start">Replay the tour</button>
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
        <span>Certifications</span>
        ${switchHtml('settings.sections.certifications', 'Show certifications', s.sections.certifications)}
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
      <h3 class="setting-title">Hiring regions</h3>
      <p class="setting-note">The Screening tab scores the resume against one market at a time. The guide opens
      the same window as the button in Screening: every region, every criterion it screens for, and the points
      each one carries.</p>
      <button class="btn btn-sm guide-open-btn" type="button" data-action="region-guide">
        How each region is scored
      </button>
    </section>

    <section class="setting-block">
      <h3 class="setting-title">Data</h3>
      <div class="data-row">
        <span>Storage used</span>
        <span class="mono">${esc(storageUsage())}</span>
      </div>
      <div class="data-row">
        <span>Saved versions</span>
        <span class="mono">${history.length}</span>
      </div>
      <div class="data-row">
        <span>Version</span>
        <span class="mono">${esc(APP_VERSION)}</span>
      </div>
      <div class="data-row">
        <span>Build</span>
        <span class="mono">${esc(BUILD_NUMBER)}</span>
      </div>
      <div class="verify-row">
        <button class="btn btn-primary" type="button" data-action="full-backup">Full backup with photo</button>
        <span class="setting-note">One .json holding every field, every setting and the profile photo at full
        quality. Import it on another device and the resume returns exactly as it is here, picture included.</span>
      </div>
      <div class="verify-row">
        <button class="btn" type="button" data-action="verify">Verify export / import</button>
        <pre class="verify-report" id="verify-report" hidden></pre>
        <span class="setting-note">Runs the whole test suite: every export built and imported back field by
        field, once per market with that market's profile fields, three markets holding their own text and a
        portrait through JSON, Markdown, TXT and the full backup, the per-field notes those markets produce,
        eight seeded random resumes checked for fidelity and for a sane screening report, and a table of
        nationality sentences that must and must not be read as one. A few seconds. Nothing is downloaded or
        overwritten.</span>
      </div>
      <div class="paste-row">
        <label class="field-label" for="paste-json">Paste a resume JSON</label>
        <textarea id="paste-json" class="textarea paste-area" rows="4" data-paste="json"
          placeholder='{"data": { "profile": { "name": "…" } }}'></textarea>
        <div class="verify-row">
          <button class="btn" type="button" data-action="apply-paste">Load pasted JSON</button>
          <span class="setting-note">Replaces every field at once, the same as importing a .json file.
          The current resume is saved into History first, so it can be restored.</span>
        </div>
      </div>
      <div class="danger-zone">
        <button class="btn btn-danger" type="button" data-action="reset">Clear all data</button>
        <button class="btn btn-danger" type="button" data-action="clear-history">Clear history</button>
      </div>
    </section>
  `;
}

/* -------------------------------------------------------------------- */
/* resume regulations: mark every field that breaks a resume convention  */
/* -------------------------------------------------------------------- */

let activeAnchor = null;
let previewIssues = [];

function regulationsOn() {
  return ui.regulations === true;
}

function currentIssues() {
  if (!regulationsOn()) return [];
  try {
    return complianceIssues(state);
  } catch (error) {
    return [];
  }
}

function anchorElement(anchor) {
  const resume = document.getElementById('resume');
  if (!resume || !anchor) return null;
  return resume.querySelector('[data-r-anchor="' + String(anchor).replace(/"/g, '\\"') + '"]');
}

/** Re-applies the screening highlight and the regulation marks to the preview. */
function applyPreviewMarks() {
  const resume = document.getElementById('resume');
  if (!resume) return;

  resume.querySelectorAll('.is-target, .is-flagged').forEach((el) => {
    el.classList.remove('is-target', 'is-flagged', 'is-flag-fail', 'is-flag-warn');
    el.removeAttribute('title');
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    el.removeAttribute('aria-label');
  });

  if (ui.section === 'screening' && activeAnchor) {
    const target = anchorElement(activeAnchor);
    if (target) {
      target.classList.add('is-target');
      target.setAttribute('title', 'The screening finding points here');
    }
  }

  const issues = currentIssues();
  previewIssues = issues;

  issues.forEach((issue) => {
    if (!issue.anchor) return;
    const el = anchorElement(issue.anchor);
    if (!el) return;
    el.classList.add('is-flagged', issue.severity === 'fail' ? 'is-flag-fail' : 'is-flag-warn');
    const existing = el.getAttribute('title');
    el.setAttribute('title', existing ? existing + ' ' + issue.text : issue.text);
    /* A marked line is a control too: reachable by Tab, and it says what it fixes. */
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Fix this field: ' + issue.text);
  });

  updateFlagTally(issues);
}

function updateFlagTally(issues) {
  const tally = document.getElementById('flag-tally');
  if (!tally) return;

  if (!regulationsOn()) {
    tally.textContent = '';
    tally.classList.remove('is-bad');
    return;
  }

  const serious = issues.filter((issue) => issue.severity === 'fail').length;
  const count = issues.length;
  /* A phone header has room for a count, not a sentence. */
  const narrow = window.matchMedia('(max-width: 640px)').matches;

  if (!count) {
    tally.textContent = narrow ? 'All clear' : 'Every field follows the usual resume rules';
  } else if (narrow) {
    tally.textContent =
      count + (count === 1 ? ' issue' : ' issues') + (serious ? ' · ' + serious + ' serious' : '');
  } else {
    tally.textContent =
      count +
      (count === 1 ? ' field needs attention' : ' fields need attention') +
      (serious ? ' · ' + serious + ' serious' : '');
  }
  tally.classList.toggle('is-bad', serious > 0);
}

/**
 * Drops the ids this build adds to aria-describedby, so a re-render never leaves a
 * control pointing at a note that is no longer there. The static field hints keep theirs.
 */
function resetDescribedBy(panel) {
  panel.querySelectorAll('[aria-describedby]').forEach((el) => {
    const kept = String(el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && !/^(flag|note)-/.test(id));
    if (kept.length) el.setAttribute('aria-describedby', kept.join(' '));
    else el.removeAttribute('aria-describedby');
  });
}

/** Points a control at its note, keeping the hint it already had. */
function describeWith(control, id) {
  const ids = String(control.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter(Boolean);
  if (ids.indexOf(id) === -1) ids.push(id);
  control.setAttribute('aria-describedby', ids.join(' '));
}

/** Flags the matching form fields in the editor, with the reason beside the field. */
function decorateEditor() {
  const panel = document.getElementById('editor-panel');
  if (!panel) return;

  panel.querySelectorAll('.is-flagged').forEach((el) => {
    el.classList.remove('is-flagged');
    el.removeAttribute('title');
  });
  panel.querySelectorAll('.field-flag').forEach((el) => el.remove());
  panel.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  resetDescribedBy(panel);

  if (!regulationsOn()) {
    decorateRegionNotes();
    return;
  }

  const byPath = new Map();
  currentIssues().forEach((issue) => {
    if (!issue.path) return;
    const list = byPath.get(issue.path) || [];
    list.push(issue.text);
    byPath.set(issue.path, list);
  });

  byPath.forEach((messages, path) => {
    const control = panel.querySelector('[data-path="' + path + '"]');
    if (!control) return;
    const box = control.closest('.field, .check, .switch-row') || control;
    box.classList.add('is-flagged');
    box.setAttribute('title', messages.join(' '));
    control.setAttribute('aria-invalid', 'true');

    if (box !== control && box.classList.contains('field')) {
      const note = document.createElement('span');
      note.className = 'field-flag';
      note.id = 'flag-' + controlId(path);
      note.textContent = messages[0];
      box.appendChild(note);
      describeWith(control, note.id);
    }
  });

  /* Last, so a field the regulations check already explains is not explained twice. */
  decorateRegionNotes();
}

function setRegulations(on) {
  ui.regulations = Boolean(on);
  saveUi();
  decorateEditor();
  applyPreviewMarks();
}

/**
 * The per-market notes, under the field each one is about: which other market's own text
 * differs here, and what that text says. Unlike the regulations flags these are always
 * shown, because a market holding different wording is a fact about the resume, not a
 * rule being broken.
 */
function decorateRegionNotes() {
  const panel = document.getElementById('editor-panel');
  if (!panel) return;

  panel.querySelectorAll('.field-region').forEach((el) => el.remove());

  let notes = [];
  try {
    notes = regionFieldNotes(state);
  } catch (error) {
    notes = [];
  }

  notes.forEach((note) => {
    // The photo control carries no data-path: it is found by its file input.
    const control =
      note.path === 'profile.photo'
        ? panel.querySelector('[data-photo-input]')
        : panel.querySelector('[data-path="' + note.path + '"]');
    if (!control) return;
    const box = control.closest('.field, .check, .switch-row') || control;
    // A field the regulations check already explains is not explained twice.
    if (box.querySelector('.field-flag')) return;

    const el = document.createElement('span');
    el.className = 'field-region is-' + note.tone;
    el.id = 'note-' + controlId(note.path);
    el.appendChild(document.createTextNode(note.text));

    if (note.region) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'link-btn';
      button.dataset.action = 'open-region-' + note.region;
      button.textContent = 'Open ' + (REGION_LABELS[note.region] || note.region);
      el.appendChild(document.createTextNode(' '));
      el.appendChild(button);
    }

    box.appendChild(el);
    describeWith(control, el.id);
  });
}

function sectionForPath(path) {
  if (!path) return null;
  if (path.indexOf('profile.') === 0) return 'profile';
  if (path.indexOf('experience.') === 0) return 'experience';
  if (path.indexOf('education.') === 0) return 'education';
  if (path.indexOf('certifications.') === 0) return 'education';
  if (path.indexOf('projects.') === 0) return 'projects';
  if (path.indexOf('skills.') === 0) return 'skills';
  if (path.indexOf('settings.') === 0) return 'settings';
  return null;
}

/** Jumps from a flagged field in the preview to the same field in the editor. */
function focusField(path) {
  const section = sectionForPath(path);
  if (!section) return;
  if (!ui.sub) ui.sub = { education: 'education', settings: 'settings' };
  if (path.indexOf('certifications.') === 0) ui.sub.education = 'certifications';

  goTo(section);

  requestAnimationFrame(() => {
    const panel = document.getElementById('editor-panel');
    const target = panel ? panel.querySelector('[data-path="' + path + '"]') : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    const card = target.closest('.card') || target;
    if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

/* -------------------------------------------------------------------- */
/* screening: how the resume survives the methods recruiters use        */
/* -------------------------------------------------------------------- */

let screenTimer = null;

function screeningHub() {
  return `
    <div class="panel-head">
      <h2>Screening</h2>
      <p class="panel-sub">How this resume survives the methods recruiters actually use. Every check is
      computed in the browser from what you have typed — nothing is sent anywhere. Tap a finding and the
      preview scrolls to that line and keeps it lit until you leave Screening.</p>
    </div>

    <section class="setting-block is-screen">
      <h3 class="setting-title">Target</h3>
      <div class="form-grid">
        ${field('Role you are applying for', 'settings.target', state.settings.target, 'Senior Test Manager', {
          span: 'span-2'
        })}
        ${field('Advert keywords (comma-separated)', 'settings.keywords', state.settings.keywords, 'ISTQB, ISO 26262, HiL, ASPICE', {
          span: 'span-2'
        })}
      </div>
      <p class="setting-note">The Rubric check scores the resume against these terms; both also fill the
      LLM prompt. The checks re-run as you type.</p>
    </section>

    <section class="setting-block is-screen">
      <h3 class="setting-title">Hiring region</h3>
      <div class="seg seg-wrap" role="group" aria-label="Hiring region">
        ${REGION_IDS.map(
          (id) =>
            `<button class="seg-btn${state.settings.region === id ? ' is-on' : ''}" type="button"
              data-set="region" data-value="${id}">${esc(REGION_LABELS[id])}</button>`
        ).join('')}
      </div>
      <p class="setting-note">Page norms, personal details, language levels and references follow this market:
      it sets the page ceiling and scores the Regional fit card. The AI prompt below is written for it too. The
      same switch sits in the region menu of the preview header, so it is in reach while you fill in Profile.</p>
      <div class="sync-row">
        <label class="switch-toggle" title="One text for every region, or one per region">
          <input type="checkbox" data-sync-regions ${state.settings.syncRegions ? 'checked' : ''} />
          <span class="switch-track" aria-hidden="true"></span>
          <span class="switch-text">Sync all regions</span>
        </label>
        <span class="sync-state">${
          state.settings.syncRegions ? 'One text for every region' : 'Each region keeps its own text'
        }</span>
      </div>
      ${syncNoticeHtml()}
      <button class="btn btn-sm guide-open-btn" type="button" data-action="region-guide">
        How each region is scored
      </button>
    </section>

    <div id="screen-results">${screenResultsHtml()}</div>
  `;
}

function screenResultsHtml() {
  const report = evaluateResume(state);
  const prompt = buildLlmPrompt(state, report);
  const llm = report.checks.find((check) => check.id === 'llm') || null;
  const rest = report.checks.filter((check) => check.id !== 'llm');

  return `
    <div class="screen-overall">
      <span class="screen-total">${report.score}</span>
      <span>/ 100 — the weighted average for this market</span>
    </div>
    <div class="screen-controls">
      <button class="btn btn-sm" type="button" data-action="screen-expand">Expand all</button>
      <button class="btn btn-sm" type="button" data-action="screen-collapse">Collapse all</button>
    </div>
    ${rest.map((check) => screenCard(check, report)).join('')}
    ${llm ? llmCard(llm, prompt) : ''}
  `;
}

function screenCard(check, report) {
  const cls = check.status === 'pass' ? 'ok' : check.status === 'warn' ? 'warn' : check.status === 'fail' ? 'bad' : 'info';
  // A check that needs attention opens itself; a clean one folds down to its headline,
  // so a long list stays navigable on a phone.
  const needsAttention = check.status === 'warn' || check.status === 'fail';
  const open = needsAttention || check.findings.some((finding) => finding.status === 'warn' || finding.status === 'fail');

  return `<details class="screen-card is-${cls}"${open ? ' open' : ''}>
    <summary class="screen-head">
      <span class="screen-score">${check.status === 'info' ? '—' : check.score}</span>
      <span class="screen-name">${esc(check.name)}</span>
      <span class="screen-status">${esc(check.status)}</span>
    </summary>
    <div class="screen-body">
      <p class="screen-summary">${esc(check.summary)}</p>
      ${check.standard ? `<p class="screen-standard">Based on: ${esc(check.standard)}</p>` : ''}
      ${
        check.findings.length
          ? `<ul class="screen-findings">${check.findings
              .map((finding) => {
                const action = finding.action
                  ? `<button class="btn btn-sm screen-act" type="button" data-action="${esc(
                      finding.action.id
                    )}">${esc(finding.action.label)}</button>`
                  : '';
                if (finding.target) {
                  return `<li class="is-${finding.status}"><button class="screen-jump" type="button" data-jump="${esc(
                    finding.target
                  )}" title="Show this in the resume preview">${esc(finding.text)}</button>${action}</li>`;
                }
                return `<li class="is-${finding.status}"><span>${esc(finding.text)}</span>${action}</li>`;
              })
              .join('')}</ul>`
          : ''
      }
      ${check.id === 'blind' && report.blindText ? `<pre class="prompt-box">${esc(report.blindText)}</pre>` : ''}
    </div>
  </details>`;
}

/**
 * Scrolls the live preview to a screening finding. The spot stays highlighted
 * until the Screening tab is left, so the finding and the line can be compared.
 */
function jumpToResume(anchor) {
  activeAnchor = anchor || null;
  applyPreviewMarks();

  const el = anchorElement(activeAnchor);
  if (!el) {
    toast('That part is not in the preview yet — add the field, or switch on Highlight issues to see where it belongs', true);
    return;
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('is-flashed');
  void el.offsetWidth; /* restart the flash animation on a second tap */
  el.classList.add('is-flashed');
  setTimeout(() => el.classList.remove('is-flashed'), 1700);
}

function llmCard(check, prompt) {
  return `<details class="screen-card is-info">
    <summary class="screen-head">
      <span class="screen-score">—</span>
      <span class="screen-name">${esc(check.name)}</span>
      <span class="screen-status">info</span>
    </summary>
    <div class="screen-body">
      <p class="screen-summary">${esc(check.summary)}</p>
      <ul class="screen-findings">
        <li>1. Export the resume as Markdown with the button below.</li>
        <li>2. Copy the prompt with the button below.</li>
        <li>3. Paste the prompt into any chat model and attach the .md or .json file.</li>
      </ul>
      <div class="screen-actions">
        <button class="btn" type="button" data-action="copy-llm">Copy prompt</button>
        <button class="btn" type="button" data-action="export-md">Export resume as .md</button>
      </div>
      <pre class="prompt-box">${esc(prompt)}</pre>
    </div>
  </details>`;
}

function scheduleScreenRefresh() {
  clearTimeout(screenTimer);
  screenTimer = setTimeout(() => refreshScreenResults(false), 350);
}

function refreshScreenResults(announce) {
  const host = document.getElementById('screen-results');
  if (!host) return;
  host.innerHTML = screenResultsHtml();
  if (announce) toast('Checks re-run');
}

function copyRaw(text, message) {
  const done = () => toast(message);
  const failed = () => toast('Could not copy — select the text in the box and copy it by hand', true);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done, failed));
  } else {
    legacyCopy(text, done, failed);
  }
}

async function exportScreenMd() {
  const name = slugify(state.profile.name || 'resume') + '-resume.md';
  try {
    const file = new File([toMarkdown(state)], name, { type: 'text/markdown' });
    await deliverFile(file, 'md');
  } catch (error) {
    console.error(error);
    toast('Could not write that file', true);
  }
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', group: 'main', render: profileEditor },
  { id: 'experience', label: 'Experience', group: 'main', render: experienceEditor },
  { id: 'education', label: 'Education', group: 'main', render: educationHub },
  { id: 'projects', label: 'Projects', group: 'main', render: projectsEditor },
  { id: 'skills', label: 'Skills', group: 'main', render: skillsEditor },
  { id: 'screening', label: 'Screening', group: 'tool', render: screeningHub },
  { id: 'settings', label: 'Settings', group: 'utility', render: settingsHub }
];

function renderTabs() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;

  tabs.innerHTML = SECTIONS.map((section) => {
    const active = section.id === ui.section;
    return `<button class="tab${active ? ' is-active' : ''}" type="button" role="tab"
      id="tab-${section.id}" aria-selected="${active}" aria-controls="editor-panel"
      tabindex="${active ? '0' : '-1'}" data-tab="${section.id}">${esc(section.label)}</button>`;
  }).join('');

  const active = tabs.querySelector('.tab.is-active');
  if (active) {
    requestAnimationFrame(() => {
      const left = active.offsetLeft - tabs.clientWidth / 2 + active.offsetWidth / 2;
      tabs.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    });
  }

  const panel = document.getElementById('editor-panel');
  if (panel) panel.setAttribute('aria-labelledby', 'tab-' + ui.section);
}

function renderEditor() {
  const panel = document.getElementById('editor-panel');
  const section = SECTIONS.find((item) => item.id === ui.section) || SECTIONS[0];
  panel.innerHTML = guidedPanelHtml() + section.render();
  decorateEditor();
}

/* -------------------------------------------------------------------- */
/* guided mode: a step-by-step builder that follows the selected market   */
/* -------------------------------------------------------------------- */

function guidedSteps() {
  const region = currentRegion();
  const specs = regionFields(region);
  const steps = [
    {
      id: 'identity',
      section: 'profile',
      title: 'Name and headline',
      body:
        'Start with the two lines every reader sees first: your name, and a headline that states the role you want. Keep the headline under about 120 characters.',
      done: () => Boolean(state.profile.name.trim() && state.profile.headline.trim())
    }
  ];

  if (specs.length) {
    steps.push({
      id: 'region',
      section: 'profile',
      title: REGION_LABELS[region] + ' details',
      body: `This market expects ${specs.length} extra field${specs.length === 1 ? '' : 's'}${
        specs.some((spec) => spec.required) ? ', and the required ones are what a screener looks for before anything else' : ''
      }. Upload or fill them in Profile, under ${REGION_LABELS[region]} details.`,
      done: () => missingRequiredFields(state).length === 0
    });
  }

  steps.push(
    {
      id: 'contact',
      section: 'profile',
      title: 'Contact line',
      body: 'Email and phone are non-negotiable, a city is expected, and a LinkedIn or portfolio link gives a reviewer somewhere to go.',
      done: () =>
        Boolean(
          state.profile.email.trim() &&
            state.profile.phone.trim() &&
            state.profile.location.trim() &&
            (state.profile.linkedin.trim() || state.profile.website.trim())
        )
    },
    {
      id: 'summary',
      section: 'profile',
      title: 'Summary',
      body: 'Two or three lines: what you do, at what level, and what you are looking for. Between 40 and 600 characters is the range this app scores.',
      done: () => state.profile.summary.trim().length >= 40
    },
    {
      id: 'experience',
      section: 'experience',
      title: 'Roles and achievements',
      body: 'Every role needs a title, an employer and dates. Aim for two or more bullets composed as outcome + number, since quantified bullets carry the most weight.',
      done: () =>
        state.experience.length > 0 &&
        state.experience.every((item) => item.role.trim() && item.company.trim() && item.start.trim()) &&
        state.experience.every((item) => splitLines(item.highlights).length >= 2)
    },
    {
      id: 'education',
      section: 'education',
      title: 'Education',
      body: 'School, degree and years. Certifications live beside Education in their own sub-tab, with issuer and date so a screener can verify them.',
      done: () => state.education.some((item) => (item.school.trim() || item.degree.trim()) && item.start.trim())
    },
    {
      id: 'skills',
      section: 'skills',
      title: 'Skills',
      body: 'Three to six groups, each with a short list. This is where keyword matching earns its points, so use the wording of the advert.',
      done: () => state.skills.filter((item) => item.items.trim()).length >= 2
    },
    {
      id: 'review',
      section: 'screening',
      title: 'Review the score',
      body: 'Screening scores the resume for the selected market from eleven checks. Fix anything under 100, then export.',
      done: () => {
        try {
          return evaluateResume(state).score >= 100;
        } catch (error) {
          return false;
        }
      }
    }
  );

  return steps;
}

function guidedPanelHtml() {
  if (!ui.guided) return '';
  const steps = guidedSteps();
  const total = steps.length;
  const index = Math.max(0, Math.min(ui.guidedStep || 0, total - 1));
  const step = steps[index];
  const complete = steps.filter((item) => item.done()).length;
  const percent = Math.round((complete / total) * 100);

  return `<section class="guided" aria-label="Guided mode">
    <div class="guided-head">
      <span class="guided-kicker">Guided mode · step ${index + 1} of ${total}</span>
      <button class="btn btn-sm btn-ghost" type="button" data-action="guided-exit">Exit</button>
    </div>
    <div class="guided-bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
      <span style="width:${percent}%"></span>
    </div>
    <h3 class="guided-title">${esc(step.title)}</h3>
    <p class="guided-body">${esc(step.body)}</p>
    <p class="guided-state ${step.done() ? 'is-done' : ''}">${step.done() ? 'Complete.' : 'Still to do.'}</p>
    <div class="guided-actions">
      <button class="btn btn-sm" type="button" data-action="guided-prev" ${index === 0 ? 'disabled' : ''}>Back</button>
      <button class="btn btn-sm" type="button" data-action="guided-goto">Open this section</button>
      <button class="btn btn-sm btn-primary" type="button" data-action="guided-next">${
        index === total - 1 ? 'Finish' : 'Next step'
      }</button>
    </div>
    <ol class="guided-list">
      ${steps
        .map(
          (item, at) =>
            `<li class="${item.done() ? 'is-done' : ''}${at === index ? ' is-current' : ''}">
              <span class="guided-dot" aria-hidden="true">${item.done() ? '✓' : at + 1}</span>${esc(item.title)}
            </li>`
        )
        .join('')}
    </ol>
  </section>`;
}

function setGuided(on) {
  ui.guided = Boolean(on);
  if (ui.guided) {
    const steps = guidedSteps();
    const firstOpen = steps.findIndex((step) => !step.done());
    ui.guidedStep = firstOpen === -1 ? 0 : firstOpen;
  }
  saveUi();
  renderEditor();
}

function guidedMove(delta) {
  const steps = guidedSteps();
  const next = Math.max(0, Math.min((ui.guidedStep || 0) + delta, steps.length - 1));
  ui.guidedStep = next;
  saveUi();
  goTo(steps[next].section);
  const panel = document.getElementById('editor-panel');
  if (panel) panel.scrollTop = 0;
}

/* -------------------------------------------------------------------- */
/* the app tour                                                          */
/* -------------------------------------------------------------------- */

const TOUR_STEPS = [
  {
    selector: '[data-tab="profile"]',
    title: 'The sections',
    body: 'Seven sections live in this dock: Profile, Experience, Education, Projects, Skills, Screening and Settings. Everything you type saves as you go.'
  },
  {
    selector: '#editor-panel',
    title: 'The builder',
    body: 'The left pane is the form. Its fields follow the hiring region you pick, so a US resume never asks for a photo and a Gulf resume always asks for nationality and visa status.'
  },
  {
    selector: '.preview',
    title: 'The live preview',
    body: 'The right pane is the resume itself, on A4 paper, rebuilt on every keystroke. What you see is what the exports contain.'
  },
  {
    selector: '#region-btn',
    title: 'Hiring region',
    body: 'Pick the market you are applying to. It sets the page ceiling, which personal details the builder shows, how the resume is scored, and the AI prompt.'
  },
  {
    selector: '#regulations-toggle',
    title: 'Highlight issues',
    body: 'Turn this on to mark every field that breaks a resume convention, in the preview and in the form. Tap a marked line to jump to the field.'
  },
  {
    selector: '[data-dock="save"]',
    title: 'Save a version',
    body: 'Save snapshots the whole resume into this browser, up to forty versions, each one restorable from Settings → History.'
  },
  {
    selector: '.file-trigger',
    title: 'Import',
    body: 'Bring a resume back from JSON, Markdown, TXT, PDF, DOCX, PNG or ZIP. Every format this app exports rebuilds the identical preview.'
  },
  {
    selector: '[data-dock="export"]',
    title: 'Export',
    body: 'Choose any combination of PDF, DOCX, PNG, TXT, Markdown and JSON. On a phone the finished file goes straight to the system share sheet.'
  },
  {
    selector: '[data-tab="screening"]',
    title: 'Screening',
    body: 'Eleven checks score the resume for the selected market, each naming the published standard behind it, with findings that jump to the line they concern.'
  },
  {
    selector: '[data-tab="settings"]',
    title: 'Settings',
    body: 'Appearance, data, export, history and releases. The scoring guide, this tour and guided mode live here too.'
  }
];

function tourElement(step) {
  const el = document.querySelector(step.selector);
  return el instanceof HTMLElement ? el : null;
}

function endTour() {
  const overlay = document.getElementById('app-tour');
  if (overlay) overlay.remove();
  ui.tourSeen = true;
  saveUi();
}

function renderTourStep(index) {
  const overlay = document.getElementById('app-tour');
  if (!overlay) return;
  const step = TOUR_STEPS[index];
  if (!step) {
    endTour();
    return;
  }

  const target = tourElement(step);
  if (!target) {
    renderTourStep(index + 1);
    return;
  }

  const rect = target.getBoundingClientRect();
  const pad = 6;
  const spot = overlay.querySelector('.tour-spot');
  const card = overlay.querySelector('.tour-card');
  if (!spot || !card) return;

  spot.style.left = Math.max(4, rect.left - pad) + 'px';
  spot.style.top = Math.max(4, rect.top - pad) + 'px';
  spot.style.width = Math.min(window.innerWidth - 8, rect.width + pad * 2) + 'px';
  spot.style.height = Math.min(window.innerHeight - 8, rect.height + pad * 2) + 'px';

  card.innerHTML = `
    <p class="tour-kicker">Tour · ${index + 1} of ${TOUR_STEPS.length}</p>
    <h3>${esc(step.title)}</h3>
    <p>${esc(step.body)}</p>
    <div class="tour-actions">
      <button class="btn btn-sm btn-ghost" type="button" data-tour-skip>Skip the tour</button>
      <span class="tour-spacer"></span>
      <button class="btn btn-sm" type="button" data-tour-prev ${index === 0 ? 'disabled' : ''}>Back</button>
      <button class="btn btn-sm btn-primary" type="button" data-tour-next>${
        index === TOUR_STEPS.length - 1 ? 'Done' : 'Next'
      }</button>
    </div>
  `;

  const cardWidth = Math.min(320, window.innerWidth - 32);
  card.style.width = cardWidth + 'px';
  const below = rect.bottom + 12;
  const height = card.offsetHeight || 180;
  const placeAbove = below + height > window.innerHeight - 12 && rect.top > height + 20;
  card.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - cardWidth - 12)) + 'px';
  card.style.top = (placeAbove ? Math.max(12, rect.top - height - 12) : below) + 'px';

  overlay.dataset.index = String(index);
}

function startTour(index) {
  endTour();
  const overlay = document.createElement('div');
  overlay.id = 'app-tour';
  overlay.className = 'tour';
  overlay.innerHTML = '<div class="tour-spot" aria-hidden="true"></div><div class="tour-card" role="dialog" aria-modal="true"></div>';
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (event) => {
    const at = Number(overlay.dataset.index || 0);
    if (event.target.closest('[data-tour-skip]')) endTour();
    else if (event.target.closest('[data-tour-next]')) {
      if (at === TOUR_STEPS.length - 1) endTour();
      else renderTourStep(at + 1);
    } else if (event.target.closest('[data-tour-prev]')) renderTourStep(Math.max(0, at - 1));
  });

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') endTour();
  });

  renderTourStep(index || 0);
}

function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme;
  root.dataset.color = state.settings.colorMode;
  root.dataset.font = state.settings.font;
  root.dataset.density = state.settings.density;
  renderRegionPicker();
}

/* --- hiring region: a button in the preview header, always in reach --- */

const REGION_HINTS = {
  emea: 'Two pages, exact dates, DACH photo conventions',
  us: 'One to two pages, no personal details, quantified bullets',
  gcc: 'Nationality, visa status and languages are screening data',
  apac: 'Detailed education, certifications, language levels',
  latam: 'Two to three pages, language proficiency, personal tone',
  anz: 'Right-to-work status, STAR bullets, named referees'
};

function currentRegion() {
  return REGION_IDS.indexOf(state.settings.region) !== -1 ? state.settings.region : 'emea';
}

function renderRegionPicker() {
  const label = document.getElementById('region-label');
  const menu = document.getElementById('region-menu');
  if (!label || !menu) return;

  const active = currentRegion();
  label.textContent = REGION_LABELS[active];

  const dots = {
    here: 'editing here',
    own: 'own text',
    same: 'same as here',
    none: 'not started'
  };

  const liveSignature = contentSignature(captureContent(state));
  const options = REGION_IDS.map((id) => {
    const state_ = regionSyncState(id, liveSignature);
    return `<button class="region-option${id === active ? ' is-on' : ''}" type="button"
      aria-pressed="${id === active}" data-region="${id}" title="${esc(REGION_LABELS[id] + ' — ' + dots[state_])}">
      <span class="region-option-row">
        <span class="region-option-name">${esc(REGION_LABELS[id])}</span>
        <span class="region-dot is-${state_}" aria-hidden="true"></span>
        <span class="region-option-tag">${esc(dots[state_])}</span>
      </span>
      <span class="region-option-note">${esc(REGION_HINTS[id])}</span>
    </button>`;
  }).join('');

  const others = storedRegions();
  const footState = state.settings.syncRegions
    ? others.length
      ? `One text for every region. The separate ${others.length === 1 ? 'text' : 'texts'} kept for ${others
          .map((id) => REGION_LABELS[id])
          .join(', ')} ${others.length === 1 ? 'comes' : 'come'} back when sync is switched off.`
      : 'One text for every region.'
    : 'Each region keeps its own text. Opening a region loads its text; leaving one saves it.';

  const foot = `<div class="region-menu-foot">
    <label class="switch-toggle region-menu-switch" title="One text for every region, or one per region">
      <input type="checkbox" data-sync-regions ${state.settings.syncRegions ? 'checked' : ''} />
      <span class="switch-track" aria-hidden="true"></span>
      <span class="switch-text">Sync all regions</span>
    </label>
    <p class="region-menu-state">${esc(footState)}</p>
    ${
      others.length
        ? `<div class="region-menu-actions">
            ${
              state.settings.syncRegions
                ? ''
                : '<button class="btn btn-sm" type="button" data-action="sync-copy-all">Copy this text to every region</button>'
            }
            <button class="btn btn-sm" type="button" data-action="sync-discard">Discard other regions’ texts</button>
          </div>`
        : ''
    }
  </div>`;

  menu.innerHTML = options + foot;
  updateRegionBadge();
}

/**
 * The badge on the region button: how many markets still hold older text while
 * per-region editing is on. It is the same list the Regional fit card names, from the
 * same function, so the two can never disagree.
 */
function updateRegionBadge() {
  const badge = document.getElementById('region-badge');
  const btn = document.getElementById('region-btn');
  if (!badge || !btn) return;

  const stale = divergentRegions();
  badge.textContent = String(stale.length);
  badge.hidden = !stale.length;

  const names = stale.map((id) => REGION_LABELS[id]).join(', ');
  btn.title = stale.length
    ? 'Hiring region: ' + names + (stale.length === 1 ? ' has its own' : ' have their own') + ' text, which differs from this one — open this menu to review it'
    : 'Hiring region: sets the screening rules and the AI prompt';
  btn.classList.toggle('has-stale', stale.length > 0);
}

function setRegionMenuOpen(open) {
  const btn = document.getElementById('region-btn');
  const menu = document.getElementById('region-menu');
  if (!btn || !menu) return;
  // Opening it re-reads the dots, so what the menu says about each market is current.
  if (open) renderRegionPicker();
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open) {
    const option = menu.querySelector('[aria-pressed="true"]') || menu.querySelector('button');
    if (option) option.focus({ preventScroll: true });
  }
}

/* -------------------------------------------------------------------- */
/* the region scoring guide: one window, opened from Screening and       */
/* from Settings, with a collapsible section per market                  */
/* -------------------------------------------------------------------- */

let guideOpener = null;

/**
 * Two different numbers, kept apart on purpose:
 *  - fit: the Regional fit check alone, scored against that market's criteria;
 *  - overall: the average of every scored check in that market, which is the number
 *    the Screening tab shows at the top.
 *
 * With sync off, each market is scored on the text it actually holds, not on the one
 * on screen: otherwise the guide would quote a score for wording that market never had.
 */
function regionScores(id) {
  try {
    let subject = { ...state, settings: { ...state.settings, region: id } };
    const owns = !state.settings.syncRegions && id !== currentRegion() ? state.regions && state.regions[id] : null;
    if (owns) subject = { ...subject, ...owns };

    const report = evaluateResume(subject);
    const check = report.checks.find((item) => item.id === 'region');
    const scored = report.checks.filter((item) => item.id !== 'llm' && item.status !== 'info');
    return {
      fit: check ? check.score : null,
      overall: report.score,
      checks: scored.length
    };
  } catch (error) {
    return { fit: null, overall: null, checks: 0 };
  }
}

function guideCriterionHtml(criterion) {
  const scored = criterion.weightLabel.indexOf('−') === 0;
  return `<section class="guide-criterion">
    <div class="guide-criterion-head">
      <h4>${esc(criterion.title)}</h4>
      <span class="guide-weight${scored ? '' : ' is-info'}">${esc(criterion.weightLabel)}</span>
    </div>
    <p class="guide-rule">${esc(criterion.rule)}</p>
    <dl class="guide-facts">
      <dt>Measured</dt>
      <dd>${esc(criterion.measured)}</dd>
      <dt>Passes when</dt>
      <dd>${esc(criterion.pass)}</dd>
    </dl>
  </section>`;
}

function guideWeightsHtml(id) {
  const weights = REGION_SCORE_WEIGHTS[id] || {};
  const rows = Object.keys(CHECK_LABELS)
    .map((key) => ({ label: CHECK_LABELS[key], weight: typeof weights[key] === 'number' ? weights[key] : 1 }))
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
  return rows
    .map((row) => `<li><span>${esc(row.label)}</span><span class="guide-weight-x">×${row.weight}</span></li>`)
    .join('');
}

function guideRegionHtml(guide, activeId) {
  const scores = regionScores(guide.id);
  const selected = guide.id === activeId;
  const scored = scores.fit !== null && scores.fit < 100;

  return `<details class="guide-region" data-guide-region="${esc(guide.id)}"${selected ? ' open' : ''}>
    <summary>
      <h3 class="guide-region-name">${esc(guide.label)}
        ${selected ? '<span class="guide-current">Selected</span>' : ''}
        <span class="guide-region-score${scored ? ' is-warn' : ''}" title="Regional fit in this market">${
          scores.fit === null ? '—' : 'fit ' + scores.fit
        }</span>
      </h3>
      <span class="guide-region-tagline">${esc(guide.tagline)}</span>
    </summary>
    <div class="guide-region-body">
      <p class="guide-intro">${esc(guide.intro)}</p>
      <p class="guide-pagerange"><strong>Length:</strong> ${esc(guide.pageRange)}</p>
      <div class="guide-scoreline">
        <span>Regional fit <strong>${scores.fit === null ? '—' : scores.fit + '/100'}</strong> — this market’s own rules</span>
        <span>Headline in this market <strong>${scores.overall === null ? '—' : scores.overall + '/100'}</strong> — every check, weighted for this market</span>
      </div>

      <h4 class="guide-subtitle">How the headline is weighted here</h4>
      <ul class="guide-weights">${guideWeightsHtml(guide.id)}</ul>

      <h4 class="guide-subtitle">Where the points come from</h4>
      ${guide.criteria.map(guideCriterionHtml).join('')}

      <h4 class="guide-subtitle">Measured by the other checks</h4>
      <ul class="guide-elsewhere">${guide.elsewhere.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>

      <h4 class="guide-subtitle">The recruiter’s checklist</h4>
      <ol class="guide-checklist">${guide.checklist.map((line) => `<li>${esc(line)}</li>`).join('')}</ol>
    </div>
  </details>`;
}

function closeRegionGuide() {
  const sheet = document.getElementById('region-guide');
  if (!sheet) return;
  sheet.remove();
  document.body.classList.remove('guide-open');
  if (guideOpener && typeof guideOpener.focus === 'function') guideOpener.focus({ preventScroll: true });
  guideOpener = null;
}

function openRegionGuide(focusId, source) {
  closeRegionGuide();

  const activeId = REGION_IDS.indexOf(focusId) !== -1 ? focusId : currentRegion();
  // Put the chosen market first so the window opens on the one in use.
  const ordered = REGION_GUIDES.slice().sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0));

  guideOpener = document.activeElement;
  const from = source === 'settings' ? 'Settings' : 'Screening';

  const sheet = document.createElement('div');
  sheet.id = 'region-guide';
  sheet.className = 'guide';
  sheet.innerHTML = `
    <div class="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title" tabindex="-1">
      <header class="guide-head">
        <div class="guide-heading">
          <p class="guide-kicker">${esc(from)} · scoring guide</p>
          <h2 id="guide-title">How each region is scored</h2>
          <p class="guide-sub">Six markets, the criteria each one screens for, and the points they carry.</p>
        </div>
        <button class="icon-btn" type="button" data-guide-close aria-label="Close the scoring guide" title="Close">✕</button>
      </header>

      <div class="guide-body">
        <p class="guide-note">The headline in Screening is one number, weighted for the market you select: every check counts by the
        multiplier listed inside its region, and the market’s own rules carry the largest share. The <strong>fit</strong>
        pill beside each market is those rules alone, with nothing else mixed in — which is why it can sit below the
        headline. Each criterion subtracts from 100 once.</p>
        ${ordered.map((guide) => guideRegionHtml(guide, activeId)).join('')}
        <details class="guide-region">
          <summary>
            <h3 class="guide-region-name">Published standards this app follows</h3>
            <span class="guide-region-tagline">${METHOD_SOURCES.length} sources, and the rule each one set</span>
          </summary>
          <div class="guide-region-body">
            <p class="guide-intro">Every rule above traces to a published source. Each check card names the one it
            applies under “Based on”. What each source says, the strength of its evidence, and the rule it set here:</p>
            ${METHOD_SOURCES.map(
              (source) => `<h4 class="guide-subtitle">${esc(source.name)} — ${esc(source.publisher)}
                <span class="guide-evidence">${esc(source.evidence)}</span></h4>
              <p class="guide-intro">${esc(source.claim)}</p>
              <p class="guide-pagerange"><strong>Rule applied:</strong> ${esc(source.rule)}</p>
              <p class="guide-intro"><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(
                source.publisher
              )}</a></p>`
            ).join('')}
            <h4 class="guide-subtitle">What this research does not support</h4>
            <p class="guide-intro">${esc(STANDARDS_CAVEAT)}</p>
          </div>
        </details>
        <p class="guide-sources">Based on published ATS behaviour (Jobscan and platform parser guidance) and current
        CV practice for each market: Tadween, LoopCV, Resume Optimizer Pro, ApplyGoat, Rezi, ResumeMate and the
        Jobscan date rules. Practice varies by employer, so treat these as strong conventions rather than law.</p>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);
  document.body.classList.add('guide-open');

  /* The window says it is modal, so Tab stays inside it until it is closed. */
  sheet.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      sheet.querySelectorAll('button, [href], summary, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const card = sheet.querySelector('.guide-card');
  if (card) card.focus({ preventScroll: true });
}

function bindRegionGuide() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-guide-close]')) {
      closeRegionGuide();
      return;
    }
    if (event.target.id === 'region-guide') closeRegionGuide();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('region-guide')) closeRegionGuide();
  });
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
    <div class="r-entry" data-r-anchor="experience:${esc(item.id)}">
      <div class="r-entry-head">
        <h3 class="r-entry-title">${esc(item.role || 'Role')}</h3>
        ${dates ? `<span class="r-entry-dates">${esc(dates)}</span>` : ''}
      </div>
      ${sub ? `<p class="r-entry-sub">${sub}</p>` : ''}
      ${bullets.length ? `<ul class="r-bullets">${bullets
        .map((line, index) => `<li data-r-anchor="experience:${esc(item.id)}:b${index}">${esc(line)}</li>`)
        .join('')}</ul>` : ''}
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
    <div class="r-entry" data-r-anchor="education:${esc(item.id)}">
      <div class="r-entry-head">
        <h3 class="r-entry-title">${esc(title)}</h3>
        ${dates ? `<span class="r-entry-dates">${esc(dates)}</span>` : ''}
      </div>
      ${sub ? `<p class="r-entry-sub">${sub}</p>` : ''}
      ${details.length ? `<ul class="r-bullets">${details
        .map((line, index) => `<li data-r-anchor="education:${esc(item.id)}:b${index}">${esc(line)}</li>`)
        .join('')}</ul>` : ''}
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
    <div class="r-entry" data-r-anchor="projects:${esc(item.id)}">
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

function renderCertifications(items) {
  const rows = items
    .map((item) => {
      const name = item.link
        ? `<a href="${esc(/^https?:\/\//i.test(item.link) ? item.link : 'https://' + item.link)}" target="_blank" rel="noopener noreferrer">${esc(
            item.name
          )}</a>`
        : esc(item.name);
      return `<tr data-r-anchor="certifications:${esc(item.id)}">
        <td class="r-cert-name">${name}</td>
        <td>${esc(item.issuer || '')}</td>
        <td class="r-cert-date">${esc(item.date || '')}</td>
        <td class="r-cert-date">${esc(item.expires || '')}</td>
      </tr>`;
    })
    .join('');

  return `<div class="r-table-wrap">
    <table class="r-table r-table-certs">
      <colgroup>
        <col class="col-name" />
        <col class="col-issuer" />
        <col class="col-date" />
        <col class="col-date" />
      </colgroup>
      <thead>
        <tr><th>Certification</th><th>Issuer</th><th>Issued</th><th>Expires</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
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
    body.push(`<section class="r-section" data-r-anchor="summary"><p class="r-summary">${esc(profile.summary)}</p></section>`);
  } else if (settings.showSummary && regulationsOn()) {
    body.push(
      `<section class="r-section" data-r-anchor="summary"><p class="r-summary r-missing">Two or three lines on what you do and what you are looking for belong here.</p></section>`
    );
  }

  const roles = state.experience.filter((item) => item.role || item.company);
  if (settings.sections.experience && roles.length) {
    body.push(
      `<section class="r-section" data-r-anchor="experience">${sectionTitle('Experience')}${roles.map(renderRole).join('')}</section>`
    );
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (settings.sections.education && schools.length) {
    body.push(
      `<section class="r-section" data-r-anchor="education">${sectionTitle('Education')}${schools.map(renderEducation).join('')}</section>`
    );
  }

  const certs = state.certifications.filter((item) => item.name);
  if (settings.sections.certifications && certs.length) {
    body.push(
      `<section class="r-section" data-r-anchor="certifications">${sectionTitle('Certifications')}${renderCertifications(certs)}</section>`
    );
  }

  const projects = state.projects.filter((item) => item.name);
  if (settings.sections.projects && projects.length) {
    body.push(
      `<section class="r-section" data-r-anchor="projects">${sectionTitle('Projects')}${projects.map(renderProject).join('')}</section>`
    );
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (settings.sections.skills && skills.length) {
    body.push(
      `<section class="r-section" data-r-anchor="skills">${sectionTitle('Skills')}${skills
        .map(
          (item) =>
            `<div class="r-skill" data-r-anchor="skills:${esc(item.id)}"><span class="r-skill-label">${esc(item.label || 'Skills')}</span><span>${esc(
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
    applyPreviewMarks();
    updateRegionBadge();
    return;
  }

  const logistics = logisticsLine(state);
  const photo = visiblePhoto(state);

  resume.innerHTML = `
    <header class="r-header${photo ? ' has-photo' : ''}">
      <div class="r-header-text">
        <h1 class="r-name" data-r-anchor="name">${esc(profile.name || 'Your name')}</h1>
        ${
          profile.headline
            ? `<p class="r-headline" data-r-anchor="headline">${esc(profile.headline)}</p>`
            : regulationsOn()
            ? `<p class="r-headline r-missing" data-r-anchor="headline">A one-line headline belongs here: the role you are applying for.</p>`
            : ''
        }
        ${
          contact.length
            ? `<p class="r-contact" data-r-anchor="contact">${contact.join(' <span class="r-dot">·</span> ')}</p>`
            : regulationsOn()
            ? `<p class="r-contact r-missing" data-r-anchor="contact">Email, phone, city and a profile link belong on this line.</p>`
            : ''
        }
        ${logistics ? `<p class="r-logistics" data-r-anchor="contact">${esc(logistics)}</p>` : ''}
      </div>
      ${photo ? `<img class="r-photo" src="${esc(photo)}" alt="Profile photo" />` : ''}
    </header>
    ${body.join('')}
  `;

  applyPreviewMarks();
  updateRegionBadge();
}

/* -------------------------------------------------------------------- */
/* actions                                                              */
/* -------------------------------------------------------------------- */

const EXPORT_FORMATS = {
  pdf: { label: 'PDF', ext: 'pdf', description: 'A4, selectable text. Imports back.' },
  docx: { label: 'DOCX', ext: 'docx', description: 'Word document. Imports back.' },
  png: { label: 'PNG', ext: 'png', description: 'One image per page. Imports back.' },
  txt: { label: 'TXT', ext: 'txt', description: 'Plain text. Imports back.' },
  md: { label: 'MD', ext: 'md', description: 'Markdown. Imports back.' },
  json: { label: 'JSON', ext: 'json', description: 'Full backup. Imports back.' }
};

const exportSelection = { pdf: true, docx: false, png: false, txt: false, md: false, json: false };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function exportBaseName() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mmm = MONTHS[now.getMonth()];
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const name = (state.profile.name || 'resume').trim().replace(/[\\/:*?"<>|]/g, '') || 'resume';
  return name + '_' + dd + '.' + mmm + '.' + yyyy + '-' + hh + '.' + mm;
}

function selectedKinds() {
  return Object.keys(exportSelection).filter((kind) => exportSelection[kind]);
}

async function buildExportFiles() {
  const base = exportBaseName();
  const files = [];

  for (const kind of selectedKinds()) {
    if (kind === 'pdf') {
      files.push(new File([buildPdf(state)], base + '.pdf', { type: 'application/pdf' }));
    } else if (kind === 'docx') {
      files.push(
        new File([buildDocx(state)], base + '.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
      );
    } else if (kind === 'txt') {
      files.push(new File([toPlainText(state)], base + '.txt', { type: 'text/plain' }));
    } else if (kind === 'md') {
      files.push(new File([toMarkdown(state)], base + '.md', { type: 'text/markdown' }));
    } else if (kind === 'json') {
      files.push(new File([toJson(state)], base + '.json', { type: 'application/json' }));
    } else if (kind === 'png') {
      const pages = await buildPngPages(state);
      pages.forEach((blob, index) => {
        const suffix = pages.length > 1 ? '-' + (index + 1) : '';
        files.push(new File([blob], base + suffix + '.png', { type: 'image/png' }));
      });
    }
  }

  if (!files.length) toast('Choose at least one format', true);
  return files;
}

async function zipFiles(files) {
  const entries = [];
  for (const file of files) {
    entries.push({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
  }
  return new Blob([createZip(entries)], { type: 'application/zip' });
}

function fileKind(name) {
  const dot = String(name || '').lastIndexOf('.');
  return dot === -1 ? 'file' : name.slice(dot + 1).toLowerCase();
}

/**
 * iPhones and iPads get the system share sheet, which is the menu a user expects
 * there: Files, Mail, Messages, WhatsApp, contacts and the rest. Desktop keeps a
 * plain download, which is what a desktop means by "Download".
 */
function prefersShareSheet() {
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  const isAndroid = /Android/.test(ua);
  return (isIos || isAndroid) && typeof navigator.share === 'function';
}

/** Returns true when the share sheet was shown (shared or dismissed). */
async function tryShare(files, name) {
  if (!prefersShareSheet()) return false;
  const outcome = await shareFiles(files, name);
  if (outcome === 'shared') {
    toast('Ready to send');
    return true;
  }
  return outcome === 'cancelled';
}

/** Shares one finished file, or falls back to a download and the export sheet. */
async function deliverFile(file, kind) {
  if (await tryShare([file], file.name)) return;
  try {
    const result = await saveBlob(file, file.name);
    if (result === 'downloaded') toast('Saved ' + file.name);
    else if (result === 'opened') showExportSheet(file, file.name, kind, [file]);
  } catch (error) {
    console.error(error);
    toast('Could not write that file', true);
  }
}

async function exportDownload() {
  try {
    const files = await buildExportFiles();
    if (!files.length) return;

    if (files.length === 1) {
      await deliverFile(files[0], fileKind(files[0].name));
      return;
    }

    const zipName = exportBaseName() + '.zip';
    const zip = await zipFiles(files);
    const zipFile = new File([zip], zipName, { type: 'application/zip' });

    if (await tryShare([zipFile], zipName)) return;

    const result = await saveBlob(zip, zipName);
    if (result === 'downloaded') toast(files.length + ' files saved as ' + zipName);
    else if (result === 'opened') showExportSheet(zip, zipName, 'zip', [zipFile]);
  } catch (error) {
    console.error(error);
    toast('Could not create the export: ' + (error && error.message ? error.message : 'unknown error'), true);
  }
}

/**
 * The full backup: every field, every setting, and both copies of the portrait — the
 * display one and the upload kept whole — in one .json that restores the resume as it is.
 * Unlike the ordinary JSON export, it says so in the file itself, so a reader can tell a
 * complete archive from a list export.
 */
function fullBackupJson() {
  const photo = state.profile.photoFull || state.profile.photo || '';
  return JSON.stringify(
    {
      app: 'gmo-resume-manager',
      kind: 'full-backup',
      schema: 2,
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      photo: {
        included: Boolean(photo),
        quality: state.profile.photoFull ? (state.profile.photoFull === state.profile.photo ? 'display' : 'original') : 'none',
        approxKb: photo ? Math.round((photo.length * 3) / 4 / 1024) : 0
      },
      data: JSON.parse(JSON.stringify(state))
    },
    null,
    2
  );
}

async function exportFullBackup() {
  try {
    const stamp = exportBaseName().split('_').slice(1).join('_');
    const name = slugify(state.profile.name || 'resume') + '-full-backup_' + stamp + '.json';
    const file = new File([fullBackupJson()], name, { type: 'application/json' });
    toast('Building the full backup…');
    await deliverFile(file, 'json');
  } catch (error) {
    console.error(error);
    toast('Could not build the full backup', true);
  }
}

function exportCopy() {
  const kinds = selectedKinds();
  const kind = kinds.includes('md') ? 'md' : kinds.includes('txt') ? 'txt' : kinds.includes('json') ? 'json' : null;
  if (!kind) {
    toast('Select Markdown, TXT or JSON to copy text', true);
    return;
  }
  copyText(kind);
}

function importFile(file) {
  const reader = new FileReader();
  const resetInput = () => {
    const input = document.getElementById('file-input');
    if (input) input.value = '';
  };

  reader.onload = async () => {
    try {
      const result = await parseImportBytes(file.name || '', new Uint8Array(reader.result));
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
    resetInput();
  };

  reader.onerror = () => {
    toast('That file could not be read', true);
    resetInput();
  };

  reader.readAsArrayBuffer(file);
}

/**
 * Loads a resume pasted as JSON into Settings. Same result as importing a .json
 * file, without needing the file picker: useful on a phone, where a file has to be
 * put through the share sheet first.
 */
function applyPastedJson() {
  const area = document.getElementById('paste-json');
  const text = area ? area.value.trim() : '';
  if (!text) {
    toast('Paste the resume JSON first', true);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    toast('That is not valid JSON', true);
    return;
  }

  const record = parsed && typeof parsed === 'object' ? parsed : {};
  const data = record.data && typeof record.data === 'object' ? record.data : record;
  if (!data || !data.profile || typeof data.profile !== 'object') {
    toast('That JSON carries no resume data', true);
    return;
  }

  snapshotQuietly();
  state = normalize(data);
  applyAppearance();
  goTo('profile');
  renderPreview();
  save();
  flushSave();
  toast('Resume loaded — the previous version is in History');
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

async function runVerify() {
  toast('Running the export / import suite…');
  const button = document.querySelector('[data-action="verify"]');
  if (button) button.disabled = true;
  try {
    const report = await runRoundTrip();
    const summary =
      report.passed +
      '/' +
      report.total +
      ' round trips across ' +
      report.variants +
      ' variants; ' +
      report.invariantsPassed +
      '/' +
      report.invariantsTotal +
      ' screening reports sane; ' +
      report.lexiconPassed +
      '/' +
      report.lexiconTotal +
      ' lexicon readings correct';

    const output = document.getElementById('verify-report');
    if (output) {
      output.hidden = false;
      output.textContent = formatReport(report);
      output.classList.toggle('is-bad', !report.ok);
    }

    if (report.ok) {
      toast('Verify passed: ' + summary);
      showHint('All checks passed');
    } else {
      console.error('[GMO resume verify]', formatReport(report));
      const problems = report.failures.length + report.invariantFailures.length + report.lexiconFailures.length;
      toast('Verify found ' + problems + ' problem(s) — the report is below the button', true);
    }
  } catch (error) {
    console.error(error);
    toast('Verify could not run: ' + (error && error.message ? error.message : 'unknown error'), true);
  }
  if (button) button.disabled = false;
}

function handleAction(action, button) {
  /* A per-field or per-market note offering to open the market it is about. A note under a
     field leaves the section alone; one on the Screening card goes to Profile, where the
     fields that market needs are filled in. */
  if (action.indexOf('open-region-') === 0) {
    const id = action.slice('open-region-'.length);
    if (REGION_IDS.indexOf(id) === -1) return;
    applySetting('region', id);
    if (button && button.closest && button.closest('#screen-results')) goTo('profile');
    toast('Editing the ' + REGION_LABELS[id] + ' text');
    return;
  }

  if (action === 'remove-photo') {
    state.profile.photo = '';
    state.profile.photoFull = '';
    save();
    renderEditor();
    renderPreview();
    toast('Photo removed');
    return;
  }

  if (action === 'full-backup') {
    exportFullBackup();
    return;
  }

  if (action === 'sync-copy-all') {
    state.regions = {};
    save();
    renderRegionPicker();
    renderEditor();
    renderPreview();
    toast('This text now applies to every region');
    return;
  }

  if (action === 'sync-discard') {
    const others = storedRegions();
    if (!others.length) return;
    const names = others.map((id) => REGION_LABELS[id] || id).join(', ');
    if (!window.confirm('Discard the separate text kept for ' + names + '? The text on screen is kept.')) return;
    others.forEach((id) => {
      delete state.regions[id];
    });
    save();
    renderRegionPicker();
    renderEditor();
    renderPreview();
    toast('Discarded the text kept for ' + names);
    return;
  }

  if (action === 'guided-exit') {
    setGuided(false);
    return;
  }

  if (action === 'guided-toggle') {
    setGuided(!ui.guided);
    if (ui.guided) goTo('profile');
    return;
  }

  if (action === 'guided-next') {
    const steps = guidedSteps();
    if ((ui.guidedStep || 0) >= steps.length - 1) {
      setGuided(false);
      toast('Guided mode finished — the score is in Screening');
      return;
    }
    guidedMove(1);
    return;
  }

  if (action === 'guided-prev') {
    guidedMove(-1);
    return;
  }

  if (action === 'guided-goto') {
    const steps = guidedSteps();
    const step = steps[Math.max(0, Math.min(ui.guidedStep || 0, steps.length - 1))];
    goTo(step.section);
    return;
  }

  if (action === 'tour-start') {
    startTour(0);
    return;
  }

  if (action === 'screen-expand' || action === 'screen-collapse') {
    const open = action === 'screen-expand';
    document.querySelectorAll('#screen-results .screen-card').forEach((card) => {
      card.open = open;
    });
    return;
  }

  if (action === 'region-guide') {
    openRegionGuide(currentRegion(), ui.section === 'settings' ? 'settings' : 'screening');
    return;
  }

  if (action === 'export-download') {
    exportDownload();
    return;
  }

  if (action === 'export-copy') {
    exportCopy();
    return;
  }

  if (action === 'save') {
    saveSnapshot();
    return;
  }

  if (action === 'restore') {
    restoreSnapshot(button.dataset.id);
    return;
  }

  if (action === 'delete-snapshot') {
    deleteSnapshot(button.dataset.id);
    return;
  }

  if (action === 'download-snapshot') {
    downloadSnapshot(button.dataset.id);
    return;
  }

  if (action === 'clear-history') {
    if (!window.confirm('Delete every saved version in the history?')) return;
    history = [];
    persistHistory();
    renderEditor();
    toast('History cleared');
    return;
  }

  if (action === 'import') {
    document.getElementById('file-input').click();
    return;
  }

  if (action === 'sample') {
    loadExample();
    return;
  }

  if (action === 'verify') {
    runVerify();
    return;
  }

  if (action === 'apply-paste') {
    applyPastedJson();
    return;
  }

  if (action === 'copy-llm') {
    copyRaw(buildLlmPrompt(state, evaluateResume(state)), 'Prompt copied — paste it into any chat model');
    return;
  }

  if (action === 'export-md') {
    exportScreenMd();
    return;
  }

  if (action === 'screen-run') {
    refreshScreenResults(true);
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

/**
 * What the sync switch is doing, in one sentence, plus which markets keep a text of
 * their own. What those texts actually say is shown under the field it differs in, in
 * the builder, so this block names markets and nothing more.
 */
function syncNoticeHtml() {
  const active = REGION_LABELS[currentRegion()];
  const others = storedRegions();
  const names = others.map((id) => REGION_LABELS[id] || id).join(', ');

  if (state.settings.syncRegions) {
    return `<p class="setting-note sync-note">One text for every region: an edit here reaches all six.${
      others.length
        ? ` ${esc(names)} ${others.length === 1 ? 'keeps a separate text' : 'keep separate texts'}, stored and untouched until sync is off again.`
        : ''
    }</p>`;
  }

  return `<p class="setting-note sync-note"><strong>Editing the ${esc(active)} text only.</strong> ${
    others.length
      ? `${esc(names)} ${others.length === 1 ? 'keeps its own text' : 'keep their own texts'} — each field in the builder says what that market has there.`
      : 'No other market has its own text yet; opening one starts it from what is here.'
  }</p>`;
}

/**
 * Switching sync. The texts other markets keep are never thrown away by the switch
 * itself: turning sync on leaves them stored and says so, turning it off keeps them and
 * the market on screen becomes its own text again. Getting the space back is a separate,
 * explicit action.
 */
function setSyncRegions(on) {
  const menu = document.getElementById('region-menu');
  const wasOpen = Boolean(menu && !menu.hidden);

  state.settings.syncRegions = Boolean(on);

  if (state.settings.syncRegions) {
    if (!state.regions) state.regions = {};
    const kept = storedRegions().length;
    toast(
      kept
        ? 'Sync on — one text for every region; the ' + kept + ' other ' + (kept === 1 ? 'text is' : 'texts are') + ' still stored'
        : 'Sync on — one text for every region'
    );
  } else {
    if (!state.regions) state.regions = {};
    state.regions[currentRegion()] = captureContent(state);
    toast('Sync off — each region keeps its own text from now on');
  }

  save();
  renderRegionPicker();
  // The menu is rebuilt in place, so it stays open and the switch keeps the focus.
  if (wasOpen) {
    const input = document.querySelector('#region-menu [data-sync-regions]');
    if (input) input.focus({ preventScroll: true });
  }
  renderEditor();
  renderPreview();
}

/**
 * Switching market. With sync on there is one document, so nothing moves. With sync off
 * the market being left is stored first, then the new market's own text is loaded; a
 * market visited for the first time starts from what was on screen and stays separate.
 */
function switchRegion(next) {
  if (REGION_IDS.indexOf(next) === -1) return;
  const from = currentRegion();
  if (next === from) return;
  state.settings.region = next;

  if (!state.settings.syncRegions) {
    if (!state.regions) state.regions = {};
    state.regions[from] = captureContent(state);
    const stored = state.regions[next];
    if (stored) {
      adoptContent(state, stored);
    } else {
      state.regions[next] = captureContent(state);
      toast(REGION_LABELS[next] + ' starts from the text you had; edits here stay in ' + REGION_LABELS[next]);
    }
  }

  save();
  renderRegionPicker();
  renderEditor();
  renderPreview();
}

function applySetting(key, value) {
  if (key === 'theme') state.settings.theme = value === 'light' ? 'light' : 'dark';
  else if (key === 'colorMode') state.settings.colorMode = value === 'bw' ? 'bw' : 'color';
  else if (key === 'font') state.settings.font = value === 'serif' ? 'serif' : 'sans';
  else if (key === 'density') state.settings.density = value === 'compact' ? 'compact' : 'comfortable';
  else if (key === 'region') {
    if (REGION_IDS.indexOf(value) === -1) return;
    switchRegion(value);
    return;
  } else return;

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

  if (id !== 'screening') activeAnchor = null;
  ui.section = id;
  saveUi();
  renderTabs();
  renderEditor();
  renderPreview();

  requestAnimationFrame(() => {
    if (editor) editor.scrollTop = ui.scrolls[id] || 0;
    if (changed) window.scrollTo(0, 0);
    /* The panel is announced on the way in, so a section change is not silent. */
    const panel = document.getElementById('editor-panel');
    const section = SECTIONS.find((item) => item.id === id);
    if (!changed || !panel || !section) return;
    panel.setAttribute('aria-label', section.label + ' fields');
    panel.focus({ preventScroll: true });
  });
}

function goToSub(section, sub) {
  if (!ui.sub) ui.sub = { education: 'education', settings: 'settings' };
  ui.sub[section] = sub;
  goTo(section);
}

function storageUsage() {
  try {
    const raw =
      (window.localStorage.getItem(STORAGE_KEY) || '') +
      (window.localStorage.getItem(HISTORY_KEY) || '');
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

  /* On a phone the dock's meta line is hidden, so the Save button carries the state
     as a dot instead: green when saved, amber while there are unsaved changes. */
  const save = document.querySelector('[data-dock="save"]');
  if (!save) return;
  const label = String(text || '');
  save.dataset.state = /^unsaved/i.test(label) ? 'unsaved' : 'saved';
  save.title = 'Save a snapshot (Ctrl or Cmd + S) — ' + label;
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
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
  }
  /* A live region, so a phone reader hears the message instead of missing it. An error
     interrupts; anything else waits its turn. */
  el.setAttribute('role', isError ? 'alert' : 'status');
  el.setAttribute('aria-live', isError ? 'assertive' : 'polite');
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

  // A photo arrives as a change event only, so it is handled before the select guard.
  if (target.dataset && target.dataset.photoInput !== undefined && event.type === 'change') {
    handlePhotoInput(target);
    return;
  }

  if (target.dataset && target.dataset.syncRegions !== undefined && event.type === 'change') {
    setSyncRegions(target.checked);
    return;
  }

  if (event.type === 'change' && target.tagName !== 'SELECT') return;
  if (target.dataset && target.dataset.paste) return;

  if (target.dataset && target.dataset.format) {
    exportSelection[target.dataset.format] = target.checked;
    return;
  }

  const path = target.dataset ? target.dataset.path : null;
  if (!path) return;

  const value = target.type === 'checkbox' ? target.checked : target.value;
  setPath(state, path, value);

  if (path.indexOf('settings.') === 0) applyAppearance();

  if (path === 'settings.target' || path === 'settings.keywords') scheduleScreenRefresh();

  save();
  renderPreview();
  if (regulationsOn()) decorateEditor();
  else decorateRegionNotes();

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
  const subButton = event.target.closest('[data-subtab]');
  if (subButton) {
    if (!ui.sub) ui.sub = { education: 'education', releases: 'notes' };
    ui.sub[subButton.dataset.subtab] = subButton.dataset.value;
    saveUi();
    renderEditor();
    return;
  }

  const jumpButton = event.target.closest('[data-jump]');
  if (jumpButton) {
    jumpToResume(jumpButton.dataset.jump);
    return;
  }

  const copyButton = event.target.closest('[data-copy]');
  if (copyButton) {
    copyText(copyButton.dataset.copy);
    return;
  }

  const exportButton = event.target.closest('[data-export]');
  if (exportButton) {
    exportDownload();
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
  if (action === 'save') saveSnapshot();
  else if (action === 'import') document.getElementById('file-input').click();
  else if (action === 'export') goToSub('settings', 'export');
  else if (action === 'settings') goTo('settings');
}

function bindEvents() {
  const tabs = document.getElementById('tabs');

  tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;
    const id = tab.dataset.tab;
    goTo(id);
    const again = document.querySelector('#tabs [data-tab="' + id + '"]');
    if (again) again.focus();
  });

  tabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const buttons = Array.from(document.querySelectorAll('#tabs [data-tab]'));
    const at = buttons.findIndex((button) => button.dataset.tab === ui.section);
    if (at === -1) return;
    event.preventDefault();
    const next = (at + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
    const target = buttons[next].dataset.tab;
    goTo(target);
    const again = document.querySelector('#tabs [data-tab="' + target + '"]');
    if (again) again.focus();
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
    if (button) {
      if (button.dataset.previewAction === 'example') loadExample();
      else goTo('profile');
      return;
    }

    if (!regulationsOn()) return;
    if (event.target.closest('a')) return;
    const flagged = event.target.closest('[data-r-anchor].is-flagged');
    if (!flagged) return;
    const anchor = flagged.dataset.rAnchor;
    const issue = previewIssues.find((item) => item.anchor === anchor && item.path);
    if (!issue) return;
    event.preventDefault();
    focusField(issue.path);
  });

  /* A marked line is a control: Enter or Space opens the field it is about. */
  document.getElementById('resume').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!regulationsOn()) return;
    const flagged = event.target.closest('[data-r-anchor].is-flagged');
    if (!flagged) return;
    const anchor = flagged.dataset.rAnchor;
    const issue = previewIssues.find((item) => item.anchor === anchor && item.path);
    if (!issue) return;
    event.preventDefault();
    focusField(issue.path);
  });

  const regulationsToggle = document.getElementById('regulations-toggle');
  if (regulationsToggle) {
    regulationsToggle.addEventListener('change', (event) => setRegulations(event.target.checked));
  }

  bindRegionGuide();

  const regionBtn = document.getElementById('region-btn');
  if (regionBtn) {
    regionBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = document.getElementById('region-menu');
      setRegionMenuOpen(Boolean(menu && menu.hidden));
    });
  }

  const regionMenu = document.getElementById('region-menu');
  if (regionMenu) {
    regionMenu.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        event.stopPropagation();
        handleAction(actionButton.dataset.action, actionButton);
        return;
      }
      const option = event.target.closest('[data-region]');
      if (!option) return;
      setRegionMenuOpen(false);
      applySetting('region', option.dataset.region);
      if (regionBtn) regionBtn.focus();
    });

    regionMenu.addEventListener('change', (event) => {
      const input = event.target.closest('[data-sync-regions]');
      if (!input) return;
      setSyncRegions(input.checked);
    });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('.region-picker')) return;
    setRegionMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setRegionMenuOpen(false);
  });

  document.getElementById('dock').addEventListener('click', onDockClick);

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

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveSnapshot();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushSave();
      saveUi();
    }
  });

  /* What the header says depends on how much room it has, so a rotation or a resize
     rewrites the tally and the region badge instead of leaving the long wording. */
  const narrow = window.matchMedia('(max-width: 640px)');
  const onNarrow = () => {
    updateFlagTally(previewIssues);
    updateRegionBadge();
  };
  if (typeof narrow.addEventListener === 'function') narrow.addEventListener('change', onNarrow);
}

/* -------------------------------------------------------------------- */
/* init                                                                 */
/* -------------------------------------------------------------------- */

function init() {
  state = loadState();
  history = loadHistory();
  loadUi();

  if (!SECTIONS.some((section) => section.id === ui.section)) ui.section = 'profile';

  const regulationsToggle = document.getElementById('regulations-toggle');
  if (regulationsToggle) regulationsToggle.checked = regulationsOn();

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

  // A first visit gets the tour once; afterwards it is a button in Settings.
  if (!ui.tourSeen) {
    setTimeout(() => {
      if (!ui.tourSeen) startTour(0);
    }, 700);
  }
}

init();
