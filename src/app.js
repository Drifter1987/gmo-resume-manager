/*
 * GMO Résumé Manager — a resume and experience tracker.
 * Everything lives in localStorage; nothing leaves the device.
 */

import { changelogEditor, releasesEditor } from './releases';

const STORAGE_KEY = 'resumeStudio.v1';

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
    skills: []
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
    ]
  };
}

/* -------------------------------------------------------------------- */
/* persistence                                                          */
/* -------------------------------------------------------------------- */

let state = emptyState();
let saveTimer = null;
let hintTimer = null;

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

  return base;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      showHint('Saved on this device');
    } catch (error) {
      showHint('Could not save — storage is unavailable');
    }
  }, 200);
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

let activeSection = 'profile';

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
      let html = `<div class="card" data-card-id="${item.id}">
        <div class="card-head">
          <span class="card-index">${index + 1}</span>
          <span class="card-title">${esc(item.role || item.company || 'Untitled role')}</span>
          <div class="card-tools">${toolButtons('experience', item.id, index, items.length)}</div>
        </div>
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
      return html;
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
        <div class="card-head">
          <span class="card-index">${index + 1}</span>
          <span class="card-title">${esc(item.degree || item.school || 'Untitled degree')}</span>
          <div class="card-tools">${toolButtons('education', item.id, index, items.length)}</div>
        </div>
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
        <div class="card-head">
          <span class="card-index">${index + 1}</span>
          <span class="card-title">${esc(item.name || 'Untitled project')}</span>
          <div class="card-tools">${toolButtons('projects', item.id, index, items.length)}</div>
        </div>
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
        <div class="card-head">
          <span class="card-index">${index + 1}</span>
          <span class="card-title">${esc(item.label || 'Untitled group')}</span>
          <div class="card-tools">${toolButtons('skills', item.id, index, items.length)}</div>
        </div>
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

const SECTIONS = [
  { id: 'profile', label: 'Profile', render: profileEditor },
  { id: 'experience', label: 'Experience', render: experienceEditor },
  { id: 'education', label: 'Education', render: educationEditor },
  { id: 'projects', label: 'Projects', render: projectsEditor },
  { id: 'skills', label: 'Skills', render: skillsEditor },
  { id: 'releases', label: 'Releases', render: releasesEditor },
  { id: 'changelog', label: 'Changelog', render: changelogEditor }
];

function renderEditor() {
  const tabsEl = document.getElementById('tabs');
  const panelEl = document.getElementById('editor-panel');

  tabsEl.innerHTML = SECTIONS.map(
    (section) => `<button class="tab${section.id === activeSection ? ' is-active' : ''}" type="button" role="tab"
      aria-selected="${section.id === activeSection}" data-tab="${section.id}">${esc(section.label)}</button>`
  ).join('');

  const current = SECTIONS.find((section) => section.id === activeSection) || SECTIONS[0];
  panelEl.innerHTML = current.render();
}

/* -------------------------------------------------------------------- */
/* editor events                                                        */
/* -------------------------------------------------------------------- */

function handleAction(action, button) {
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
      const firstInput = last.querySelector('input, textarea');
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

function bindEditorEvents() {
  document.getElementById('tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;
    activeSection = tab.dataset.tab;
    renderEditor();
  });

  const panel = document.getElementById('editor-panel');

  panel.addEventListener('input', (event) => {
    const target = event.target;
    const path = target.dataset.path;
    if (!path) return;

    const value = target.type === 'checkbox' ? target.checked : target.value;
    setPath(state, path, value);
    save();
    renderPreview();

    if (target.type === 'checkbox') {
      const card = target.closest('.card');
      const cardId = card ? card.dataset.cardId : null;
      renderEditor();
      if (cardId) {
        const again = document.querySelector(`#editor-panel .card[data-card-id="${cardId}"]`);
        if (again) {
          const checkbox = again.querySelector('input[type="checkbox"]');
          if (checkbox) checkbox.focus();
        }
      }
    }
  });

  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    handleAction(button.dataset.action, button);
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
    <div class="r-entry">
      <div class="r-entry-head">
        <h3 class="r-entry-title">${esc(item.role || 'Role')}</h3>
        ${dates ? `<span class="r-entry-dates">${esc(dates)}</span>` : ''}
      </div>
      ${sub ? `<p class="r-entry-sub">${sub}</p>` : ''}
      ${bullets.length ? `<ul class="r-bullets">${bullets.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}
      ${tags.length ? `<p class="r-tags">${tags.map((tag) => esc(tag)).join(' · ')}</p>` : ''}
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
  const body = [];

  const contact = [];
  if (profile.email) {
    contact.push(`<a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>`);
  }
  if (profile.phone) contact.push(`<span>${esc(profile.phone)}</span>`);
  if (profile.location) contact.push(`<span>${esc(profile.location)}</span>`);
  if (profile.website) contact.push(webLink(profile.website));
  if (profile.linkedin) contact.push(webLink(profile.linkedin));

  if (profile.summary.trim()) {
    body.push(`<section class="r-section"><p class="r-summary">${esc(profile.summary)}</p></section>`);
  }

  const roles = state.experience.filter((item) => item.role || item.company);
  if (roles.length) {
    body.push(`<section class="r-section">${sectionTitle('Experience')}${roles.map(renderRole).join('')}</section>`);
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (schools.length) {
    body.push(`<section class="r-section">${sectionTitle('Education')}${schools.map(renderEducation).join('')}</section>`);
  }

  const projects = state.projects.filter((item) => item.name);
  if (projects.length) {
    body.push(`<section class="r-section">${sectionTitle('Projects')}${projects.map(renderProject).join('')}</section>`);
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (skills.length) {
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
        Start in <em>Profile</em> with your name and a one-line headline, then add roles in <em>Experience</em>.
        Not sure where to begin? Load the <em>Example data</em> to see the shape of it.
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
/* export / import                                                      */
/* -------------------------------------------------------------------- */

function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileName(extension) {
  return slugify(state.profile.name || 'resume') + '-resume.' + extension;
}

function toMarkdown() {
  const lines = [];
  const profile = state.profile;

  if (profile.name) lines.push('# ' + profile.name, '');
  if (profile.headline) lines.push('**' + profile.headline + '**', '');

  const contact = [profile.email, profile.phone, profile.location, profile.website, profile.linkedin].filter(Boolean);
  if (contact.length) lines.push(contact.join(' · '), '');
  if (profile.summary) lines.push(profile.summary, '');

  const roles = state.experience.filter((item) => item.role || item.company);
  if (roles.length) {
    lines.push('## Experience', '');
    roles.forEach((item) => {
      const head = [item.role, item.company].filter(Boolean).join(' — ');
      lines.push('### ' + head);
      const dates = dateRange(item);
      const place = [dates, item.location].filter(Boolean).join(' · ');
      if (place) lines.push('*' + place + '*');
      splitLines(item.highlights).forEach((bullet) => lines.push('- ' + bullet));
      const tags = splitList(item.tags);
      if (tags.length) lines.push('', '`' + tags.join('`, `') + '`');
      lines.push('');
    });
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (schools.length) {
    lines.push('## Education', '');
    schools.forEach((item) => {
      const head = [item.degree, item.field].filter(Boolean).join(', ') || item.school;
      lines.push('### ' + head);
      const dates = dateRange(item);
      const place = [item.school, dates].filter(Boolean).join(' · ');
      if (place) lines.push('*' + place + '*');
      splitLines(item.details).forEach((bullet) => lines.push('- ' + bullet));
      lines.push('');
    });
  }

  const projects = state.projects.filter((item) => item.name);
  if (projects.length) {
    lines.push('## Projects', '');
    projects.forEach((item) => {
      lines.push('### ' + item.name);
      if (item.link) lines.push(item.link);
      if (item.description) lines.push(item.description);
      const tech = splitList(item.tech);
      if (tech.length) lines.push('', '`' + tech.join('`, `') + '`');
      lines.push('');
    });
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (skills.length) {
    lines.push('## Skills', '');
    skills.forEach((item) => lines.push('- **' + (item.label || 'Skills') + ':** ' + item.items));
    lines.push('');
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function showHint(message) {
  const hint = document.getElementById('saved-hint');
  if (!hint) return;
  hint.textContent = message;
  hint.classList.add('is-visible');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove('is-visible'), 1600);
}

function hasAnyData() {
  return JSON.stringify(state) !== JSON.stringify(emptyState());
}

/* -------------------------------------------------------------------- */
/* init                                                                 */
/* -------------------------------------------------------------------- */

function init() {
  state = load();
  bindEditorEvents();
  renderEditor();
  renderPreview();

  document.getElementById('btn-print').addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    download(fileName('json'), JSON.stringify(state, null, 2), 'application/json');
    showHint('JSON downloaded');
  });

  document.getElementById('btn-markdown').addEventListener('click', () => {
    download(fileName('md'), toMarkdown(), 'text/markdown;charset=utf-8');
    showHint('Markdown downloaded');
  });

  document.getElementById('btn-example').addEventListener('click', () => {
    if (hasAnyData() && !window.confirm('Replace what you have with the example resume?')) return;
    state = exampleState();
    activeSection = 'profile';
    renderEditor();
    renderPreview();
    save();
    showHint('Example data loaded');
  });

  const fileInput = document.getElementById('file-input');
  document.getElementById('btn-import').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = normalize(JSON.parse(String(reader.result)));
        activeSection = 'profile';
        renderEditor();
        renderPreview();
        save();
        showHint('Imported');
      } catch (error) {
        window.alert('That file could not be read as resume JSON.');
      }
      fileInput.value = '';
    };
    reader.onerror = () => {
      window.alert('That file could not be read.');
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  if (hasAnyData()) showHint('Restored from this device');
}

init();
