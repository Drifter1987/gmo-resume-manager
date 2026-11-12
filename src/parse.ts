import { decodeSnapshot } from './data';

export interface ImportResult {
  state: unknown;
  format: string;
}

const MD_PAYLOAD = /<!--\s*gmo-resume-data:([A-Za-z0-9+/=\s]+?)\s*-->/;
const TXT_PAYLOAD = /----- GMO RESUME DATA -----([\s\S]*?)----- END GMO RESUME DATA -----/;

export function extractPayload(text: string): unknown | null {
  const md = text.match(MD_PAYLOAD);
  if (md) {
    const decoded = decodeSnapshot(md[1]);
    if (decoded) return decoded;
  }
  const txt = text.match(TXT_PAYLOAD);
  if (txt) {
    const decoded = decodeSnapshot(txt[1]);
    if (decoded) return decoded;
  }
  return null;
}

export function parseImport(fileName: string, text: string): ImportResult {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('That file is empty.');

  if (/\.json$/i.test(fileName) || trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error('That file is not valid JSON.');
    }
    const record = parsed as Record<string, unknown> | null;
    const data = record && typeof record === 'object' && record.data ? record.data : parsed;
    if (!data || typeof data !== 'object') throw new Error('That JSON file has no resume data.');
    return { state: data, format: 'JSON' };
  }

  const embedded = extractPayload(trimmed);
  if (embedded) {
    return { state: embedded, format: /\.md(own)?$/i.test(fileName) ? 'Markdown' : 'Text' };
  }

  if (/\.md(own)?$/i.test(fileName) || /^#{1,2}\s+\S/m.test(trimmed)) {
    return { state: parseMarkdown(trimmed), format: 'Markdown' };
  }

  return { state: parsePlainText(trimmed), format: 'Text' };
}

interface Draft {
  profile: Record<string, string>;
  experience: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
}

function draft(): Draft {
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
    certifications: [],
    projects: [],
    skills: []
  };
}

const SECTIONS = ['experience', 'education', 'certifications', 'projects', 'skills', 'summary'];

function isSectionName(value: string): string {
  const clean = value.replace(/^#+\s*/, '').trim().toLowerCase();
  return SECTIONS.indexOf(clean) !== -1 ? clean : '';
}

function isDateLine(value: string): boolean {
  return /(?:\b(?:19|20)\d{2}\b)/.test(value) && value.length < 44;
}

function splitDates(value: string, item: Record<string, unknown>): void {
  const parts = value.split(/\s*(?:—|–|-|–|to)\s*/i).filter(Boolean);
  item.start = (parts[0] || '').trim();
  const end = parts.length > 1 ? parts.slice(1).join(' ').trim() : '';
  item.current = /present|current|now/i.test(end);
  item.end = item.current ? '' : end;
}

/** Best-effort reader for the Markdown we export (used when the data block is missing). */
export function parseMarkdown(text: string): Draft {
  const state = draft();
  const lines = text.replace(/\r/g, '').split('\n');

  let section = '';
  let current: Record<string, unknown> | null = null;

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith('<!--')) return;

    const heading = isSectionName(line);
    if (heading) {
      section = heading;
      current = null;
      return;
    }

    if (line.startsWith('### ')) {
      const title = line.slice(4).trim();
      current = startItem(state, section, title);
      return;
    }

    if (line.startsWith('# ') && !state.profile.name) {
      state.profile.name = line.slice(2).trim();
      return;
    }

    if (!section) {
      if (/^\*\*.+\*\*$/.test(line) && !state.profile.headline) {
        state.profile.headline = line.replace(/\*\*/g, '').trim();
      } else if (!state.profile.summary && (line.indexOf('·') !== -1 || line.indexOf('@') !== -1)) {
        assignContacts(state, line);
      } else {
        state.profile.summary = join(state.profile.summary, line);
      }
      return;
    }

    if (section === 'skills') {
      const match = line.match(/^-\s*\*\*(.+?):\*\*\s*(.*)$/);
      if (match) state.skills.push({ id: '', label: match[1].trim(), items: match[2].trim() });
      return;
    }

    if (section === 'certifications') {
      if (line.startsWith('|')) {
        const cells = line
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
        if (cells.every((cell) => cell === '' || /^:?-{2,}:?$/.test(cell))) return;
        if (/^(certification|certificate|name|#)$/i.test(cells[0] || '')) return;
        if (cells[0]) {
          state.certifications.push({
            id: '',
            name: cells[0],
            issuer: cells[1] || '',
            date: cells[2] || '',
            expires: (cells[3] || '').replace(/^[—–-]+$/, '').replace(/^expires\s*/i, ''),
            link: /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(cells[4] || '') ? cells[4] : ''
          });
        }
        return;
      }

      const match = line.match(/^-\s*\*\*(.+?)\*\*\s*[—–-]\s*(.*)$/) || line.match(/^-\s*\*\*(.+?)\*\*\s*$/);
      if (match) {
        const bits = (match[2] || '').split('·').map((part) => part.trim());
        state.certifications.push({
          id: '',
          name: match[1].trim(),
          issuer: bits[0] || '',
          date: bits[1] || '',
          expires: (bits[2] || '').replace(/^expires\s*/i, ''),
          link: ''
        });
      }
      return;
    }

    if (!current) return;

    if (/^\*\*.+\*\*$/.test(line)) {
      splitDates(line.replace(/\*\*/g, '').trim(), current);
      return;
    }

    if (/^\*.+\*$/.test(line)) {
      const value = line.replace(/^\*|\*$/g, '').trim();
      if (section === 'experience') {
        const bits = value.split('·').map((part) => part.trim());
        current.company = bits[0] || '';
        current.location = bits[1] || '';
      } else if (section === 'education') {
        const bits = value.split('·').map((part) => part.trim());
        current.school = bits[0] || '';
        current.location = bits[1] || '';
      } else if (section === 'projects') {
        current.link = value;
      }
      return;
    }

    if (line.startsWith('Tags: ')) {
      const tags = line
        .slice(6)
        .split(',')
        .map((tag) => tag.replace(/`/g, '').trim())
        .filter(Boolean);
      if (section === 'projects') current.tech = tags.join(', ');
      else current.tags = tags.join(', ');
      return;
    }

    if (line.startsWith('- ')) {
      const bullet = line.slice(2).trim();
      if (section === 'education') current.details = join(current.details, bullet);
      else current.highlights = join(current.highlights, bullet);
      return;
    }

    if (section === 'projects' && !current.description) {
      current.description = line;
    }
  });

  if (!state.profile.name && !state.experience.length && !state.education.length && !state.projects.length) {
    throw new Error(
      'That file has no resume data block. Export again from the app — JSON, Markdown and TXT all include it.'
    );
  }

  return state;
}

export function parsePlainText(text: string): Draft {
  const state = draft();
  const lines = text.replace(/\r/g, '').split('\n');
  let section = '';
  let current: Record<string, unknown> | null = null;
  let waitingTitle = false;

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith('-----')) return;

    const heading = isSectionName(line);
    if (heading && line === line.toUpperCase()) {
      section = heading;
      current = null;
      waitingTitle = heading !== 'summary';
      return;
    }

    if (section === 'summary') {
      state.profile.summary = join(state.profile.summary, line);
      return;
    }

    if (!section) {
      if (!state.profile.name && line === line.toUpperCase() && line.length < 48) {
        state.profile.name = line;
        return;
      }
      if (!state.profile.headline) {
        state.profile.headline = line;
        return;
      }
      if (line.indexOf('|') !== -1 || line.indexOf('@') !== -1) {
        assignContacts(state, line.replace(/\|/g, '·'));
      }
      return;
    }

    if (section === 'skills') {
      const match = line.match(/^(.+?):\s*(.*)$/);
      if (match) state.skills.push({ id: '', label: match[1].trim(), items: match[2].trim() });
      return;
    }

    if (section === 'certifications') {
      if (line.startsWith('- ')) {
        const bits = line.slice(2).split('|').map((part) => part.trim());
        state.certifications.push({
          id: '',
          name: bits[0] || '',
          issuer: bits[1] || '',
          date: bits[2] || '',
          expires: (bits[3] || '').replace(/^expires\s*/i, ''),
          link: ''
        });
      }
      return;
    }

    if (waitingTitle) {
      current = startItem(state, section, line);
      waitingTitle = false;
      return;
    }

    if (!current) return;

    if (isDateLine(line) && !current.start && !line.startsWith('-')) {
      splitDates(line, current);
      return;
    }

    if (line.startsWith('Tags: ') || line.startsWith('Tech: ')) {
      const value = line.slice(line.indexOf(':') + 1).trim();
      if (section === 'projects') current.tech = value;
      else current.tags = value;
      return;
    }

    if (line.startsWith('- ')) {
      const bullet = line.slice(2).trim();
      if (section === 'education') current.details = join(current.details, bullet);
      else current.highlights = join(current.highlights, bullet);
      return;
    }

    if (section === 'experience' && (!current.company || !current.location) && line.indexOf('|') !== -1) {
      const bits = line.split('|').map((part) => part.trim());
      current.company = bits[0] || '';
      current.location = bits[1] || '';
      return;
    }

    if (section === 'education' && (!current.school || !current.location) && line.indexOf('|') !== -1) {
      const bits = line.split('|').map((part) => part.trim());
      current.school = bits[0] || '';
      current.location = bits[1] || '';
      return;
    }

    if (section === 'projects') {
      if (!current.link && /\./.test(line) && !/\s/.test(line)) current.link = line;
      else if (!current.description) current.description = line;
    }
  });

  if (!state.profile.name && !state.experience.length && !state.education.length && !state.projects.length) {
    throw new Error(
      'That file has no resume data block. Export again from the app — JSON, Markdown and TXT all include it.'
    );
  }

  return state;
}

function startItem(state: Draft, section: string, title: string): Record<string, unknown> | null {
  if (section === 'experience') {
    const item = {
      id: '',
      role: title,
      company: '',
      location: '',
      start: '',
      end: '',
      current: false,
      highlights: '',
      tags: ''
    };
    state.experience.push(item);
    return item;
  }
  if (section === 'education') {
    const bits = title.split(',').map((part) => part.trim());
    const item = {
      id: '',
      school: '',
      degree: bits[0] || '',
      field: bits.slice(1).join(', '),
      location: '',
      start: '',
      end: '',
      details: ''
    };
    state.education.push(item);
    return item;
  }
  if (section === 'projects') {
    const item = { id: '', name: title, link: '', description: '', tech: '' };
    state.projects.push(item);
    return item;
  }
  return null;
}

function assignContacts(state: Draft, line: string): void {
  line
    .split(/·|\||,|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      if (!state.profile.email && part.indexOf('@') !== -1) state.profile.email = part;
      else if (!state.profile.phone && /^[+\d][\d\s()+-]{6,}$/.test(part)) state.profile.phone = part;
      else if (!state.profile.website && /(^|\s)(www\.|https?:\/\/)|\.(dev|com|io|org|net)(\/|$)/i.test(part) && part.indexOf('@') === -1) {
        if (/linkedin/i.test(part)) state.profile.linkedin = part;
        else state.profile.website = part;
      } else if (!state.profile.location) {
        state.profile.location = part;
      } else {
        state.profile.location = state.profile.location + ', ' + part;
      }
    });
}

function join(existing: unknown, value: string): string {
  const base = typeof existing === 'string' ? existing.trim() : '';
  return base ? base + '\n' + value : value;
}
