import { DATA_MARKER, decodeSnapshot } from './data';
import { extractPngText, isPng } from './pngmeta';
import { readZip } from './zip';

export interface ImportResult {
  state: unknown;
  format: string;
}

const MD_PAYLOAD = /<!--\s*gmo-resume-data:([A-Za-z0-9+/=\s]+?)\s*-->/;
const TXT_PAYLOAD = /----- GMO RESUME DATA -----([\s\S]*?)----- END GMO RESUME DATA -----/;
const RAW_PAYLOAD = new RegExp(DATA_MARKER + ':([A-Za-z0-9+/=]+)');

const NO_DATA =
  'That file does not carry this app\u2019s resume data. Export it again from the app \u2014 PDF, DOCX, PNG, TXT, Markdown and JSON all include it.';

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

function latin1(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return out;
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

function fromEmbedded(raw: string | null | undefined, label: string): ImportResult {
  const decoded = raw ? decodeSnapshot(raw) : null;
  if (!decoded) throw new Error(NO_DATA);
  return { state: decoded, format: label };
}

const ZIP_PRIORITY = ['.json', '.md', '.markdown', '.txt', '.docx', '.pdf', '.png'];

/**
 * Reads any file the app exports. The format is recognised by its content, not its name:
 * PDF, DOCX, PNG and ZIP bundles carry the data snapshot; JSON, Markdown and TXT carry it
 * too, with a best-effort text parser as the fallback.
 */
export async function parseImportBytes(fileName: string, bytes: Uint8Array): Promise<ImportResult> {
  if (!bytes.length) throw new Error('That file is empty.');

  if (isPdf(bytes)) {
    const match = latin1(bytes).match(RAW_PAYLOAD);
    return fromEmbedded(match && match[1], 'PDF');
  }

  if (isPng(bytes)) {
    return fromEmbedded(extractPngText(bytes, DATA_MARKER), 'PNG');
  }

  if (isZip(bytes)) {
    const entries = await readZip(bytes);
    const document = entries.get('word/document.xml');
    if (document) {
      const core = entries.get('docProps/core.xml');
      const xml = core ? new TextDecoder().decode(core) : '';
      const match = xml.match(RAW_PAYLOAD);
      return fromEmbedded(match && match[1], 'DOCX');
    }

    const names = Array.from(entries.keys()).filter((name) => !/(^|\/)(__MACOSX|\.)/.test(name));
    for (const extension of ZIP_PRIORITY) {
      const name = names.find((entry) => entry.toLowerCase().endsWith(extension));
      if (name) {
        const inner = await parseImportBytes(name, entries.get(name) as Uint8Array);
        return { state: inner.state, format: 'ZIP \u2192 ' + inner.format };
      }
    }
    throw new Error('That ZIP file has no resume inside.');
  }

  return parseImport(fileName, new TextDecoder().decode(bytes));
}

export function parseImport(fileName: string, text: string): ImportResult {
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
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
  certifications: Array<Record<string, unknown>>;
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

const SECTION_ALIASES: Record<string, string> = {
  experience: 'experience',
  'work experience': 'experience',
  'professional experience': 'experience',
  education: 'education',
  certifications: 'certifications',
  certificates: 'certifications',
  'licenses & certifications': 'certifications',
  projects: 'projects',
  skills: 'skills',
  summary: 'summary',
  about: 'summary'
};

function sectionOf(value: string): string {
  const clean = value.replace(/^#+\s*/, '').trim().toLowerCase();
  return SECTION_ALIASES[clean] || '';
}

function isDateLine(value: string): boolean {
  return /(?:\b(?:19|20)\d{2}\b)/.test(value) && value.length < 44;
}

function splitDates(value: string, item: Record<string, unknown>): void {
  let parts = value.split(/\s+(?:\u2014|\u2013|-|to)\s+/i).filter(Boolean);
  if (parts.length < 2 && !/^\d{4}-\d{2}(-\d{2})?$/.test(value.trim())) {
    parts = value.split(/\s*[\u2014\u2013-]\s*/).filter(Boolean);
  }
  item.start = (parts[0] || '').trim();
  const end = parts.length > 1 ? parts.slice(1).join(' ').trim() : '';
  const now = /^(present|current|now|ongoing)$/i.test(end);
  item.current = now;
  item.end = now ? '' : end;
}

/** Splits on pipes that are not escaped as \| and unescapes them. */
function splitUnescaped(text: string): string[] {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (ch === '|') {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function tableCells(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  return splitUnescaped(text);
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => cell === '' || /^:?-{2,}:?$/.test(cell));
}

function cleanLink(value: string | undefined): string {
  const raw = String(value || '').trim();
  return /^(https?:\/\/)?[^\s.|]+\.[^\s]+$/i.test(raw) ? raw : '';
}

function cleanExpires(value: string | undefined): string {
  return String(value || '').trim().replace(/^[\u2014\u2013-]+$/, '');
}

interface CertColumns {
  name: number;
  issuer: number;
  date: number;
  expires: number;
  link: number;
}

function certColumns(header: string[]): CertColumns {
  const lower = header.map((cell) => cell.toLowerCase());
  const offset = lower[0] === '#' || lower[0] === 'no' || lower[0] === 'no.' ? 1 : 0;
  const find = (patterns: RegExp[], fallback: number) => {
    for (let i = 0; i < lower.length; i += 1) {
      if (patterns.some((pattern) => pattern.test(lower[i]))) return i;
    }
    return fallback;
  };
  return {
    name: find([/^certif/, /^name$/, /^title$/], offset),
    issuer: find([/^issuer$/, /^issuing/, /^organi/, /^provider/, /^authority/], offset + 1),
    date: find([/^issued$/, /^issue date$/, /^date issued$/, /^date$/], offset + 2),
    expires: find([/^expire/], offset + 3),
    link: find([/url$/, /^link$/], offset + 4)
  };
}

/** Best-effort reader for the Markdown we export (used when the data block is missing). */
export function parseMarkdown(text: string): Draft {
  const state = draft();
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');

  let section = '';
  let current: Record<string, unknown> | null = null;
  let columns: CertColumns | null = null;
  let contactDone = false;
  let blankBefore = false;

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) {
      if (section === 'summary' || (!section && state.profile.summary)) blankBefore = true;
      return;
    }
    if (line.startsWith('<!--')) return;

    if (/^#{1,2}\s+/.test(line)) {
      const heading = sectionOf(line);
      if (heading) {
        section = heading;
        current = null;
        columns = null;
        return;
      }
    }

    if (line.startsWith('### ')) {
      current = startItem(state, section, line.slice(4).trim());
      return;
    }

    if (/^#\s+/.test(line) && !state.profile.name) {
      state.profile.name = line.replace(/^#\s+/, '').trim();
      return;
    }

    const addSummary = (value: string) => {
      state.profile.summary = join(state.profile.summary, value, blankBefore);
      blankBefore = false;
    };

    if (!section) {
      if (/^\*\*.+\*\*$/.test(line) && !state.profile.headline) {
        state.profile.headline = line.replace(/\*\*/g, '').trim();
      } else if (!contactDone && !state.profile.summary && (line.indexOf('\u00B7') !== -1 || line.indexOf('@') !== -1)) {
        assignContacts(state, line);
        contactDone = true;
      } else {
        addSummary(line);
      }
      return;
    }

    if (section === 'summary') {
      addSummary(line);
      return;
    }

    if (section === 'skills') {
      const match = line.match(/^[-*\u2022]\s*\*\*(.+?):\*\*\s*(.*)$/);
      if (match) state.skills.push({ id: '', label: match[1].trim(), items: match[2].trim() });
      return;
    }

    if (section === 'certifications') {
      if (line.startsWith('|')) {
        const cells = tableCells(line);
        if (isSeparatorRow(cells)) return;
        const next = lines[index + 1] ? lines[index + 1].trim() : '';
        if (next.startsWith('|') && isSeparatorRow(tableCells(next))) {
          columns = certColumns(cells);
          return;
        }
        const cols = columns || certColumns([]);
        const name = (cells[cols.name] || '').replace(/\*\*/g, '').trim();
        if (name && name !== '#') {
          state.certifications.push({
            id: '',
            name,
            issuer: cells[cols.issuer] || '',
            date: cells[cols.date] || '',
            expires: cleanExpires(cells[cols.expires]),
            link: cleanLink(cells[cols.link])
          });
        }
        return;
      }

      const match = line.match(/^[-*\u2022]\s*\*\*(.+?)\*\*\s*[\u2014\u2013-]\s*(.*)$/) ||
        line.match(/^[-*\u2022]\s*\*\*(.+?)\*\*\s*$/);
      if (match) {
        const bits = (match[2] || '').split('\u00B7').map((part) => part.trim());
        state.certifications.push({
          id: '',
          name: match[1].trim(),
          issuer: bits[0] || '',
          date: bits[1] || '',
          expires: (bits[2] || '').replace(/^expires\s+/i, ''),
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

    if (/^\*[^*].*\*$/.test(line)) {
      const value = line.replace(/^\*|\*$/g, '').trim();
      if (section === 'experience' || section === 'education') {
        const at = value.indexOf('\u00B7');
        const first = (at === -1 ? value : value.slice(0, at)).trim();
        const rest = at === -1 ? '' : value.slice(at + 1).trim();
        if (section === 'experience') {
          current.company = first;
          current.location = rest;
        } else {
          current.school = first;
          current.location = rest;
        }
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

    const bullet = line.match(/^[-*\u2022]\s+(.*)$/);
    if (bullet) {
      if (section === 'education') current.details = join(current.details, bullet[1].trim());
      else if (section === 'projects') current.description = join(current.description, bullet[1].trim());
      else current.highlights = join(current.highlights, bullet[1].trim());
      return;
    }

    if (section === 'projects') current.description = join(current.description, line);
  });

  ensureContent(state);
  return state;
}

function ensureContent(state: Draft): void {
  const empty =
    !state.profile.name &&
    !state.profile.summary &&
    !state.experience.length &&
    !state.education.length &&
    !state.certifications.length &&
    !state.projects.length &&
    !state.skills.length;
  if (empty) throw new Error(NO_DATA);
}

function looksLikeLink(value: string): boolean {
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(value);
}

export function parsePlainText(text: string): Draft {
  const state = draft();
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const itemSections = ['experience', 'education', 'projects'];

  let section = '';
  let current: Record<string, unknown> | null = null;
  let waitingTitle = false;
  let stage = 0;
  let contactDone = false;
  let blankBefore = false;
  let stop = false;

  lines.forEach((raw) => {
    if (stop) return;
    const line = raw.trim();

    if (line.startsWith('----- GMO RESUME DATA')) {
      stop = true;
      return;
    }

    if (!line) {
      if (section === 'summary' && state.profile.summary) blankBefore = true;
      else if (itemSections.indexOf(section) !== -1) waitingTitle = true;
      return;
    }

    const heading = sectionOf(line);
    if (heading && line === line.toUpperCase()) {
      section = heading;
      current = null;
      waitingTitle = itemSections.indexOf(heading) !== -1;
      blankBefore = false;
      return;
    }

    if (section === 'summary') {
      state.profile.summary = join(state.profile.summary, line, blankBefore);
      blankBefore = false;
      return;
    }

    if (!section) {
      if (!state.profile.name) {
        state.profile.name = line;
        return;
      }
      const contactLike = line.indexOf('@') !== -1 || /^[+\d][\d\s()+-]{6,}$/.test(line);
      if (!contactDone && (contactLike || (state.profile.headline && line.indexOf('|') !== -1))) {
        assignContacts(state, line);
        contactDone = true;
        return;
      }
      if (!state.profile.headline) {
        state.profile.headline = line;
        return;
      }
      if (!contactDone) {
        assignContacts(state, line);
        contactDone = true;
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
        const bits = splitUnescaped(line.slice(2));
        state.certifications.push({
          id: '',
          name: bits[0] || '',
          issuer: bits[1] || '',
          date: bits[2] || '',
          expires: cleanExpires(bits[3]),
          link: cleanLink(bits[4])
        });
      }
      return;
    }

    if (waitingTitle) {
      current = startItem(state, section, line);
      waitingTitle = false;
      stage = 0;
      return;
    }

    if (!current) return;

    if (line.startsWith('Tags: ') || line.startsWith('Tech: ')) {
      const value = line.slice(line.indexOf(':') + 1).trim();
      if (section === 'projects') current.tech = value;
      else current.tags = value;
      return;
    }

    if (line.startsWith('- ')) {
      const bullet = line.slice(2).trim();
      if (section === 'education') current.details = join(current.details, bullet);
      else if (section === 'projects') current.description = join(current.description, bullet);
      else current.highlights = join(current.highlights, bullet);
      stage = 2;
      return;
    }

    if (section === 'projects') {
      if (!current.link && stage === 0 && looksLikeLink(line)) {
        current.link = line;
      } else {
        current.description = join(current.description, line);
      }
      stage = 1;
      return;
    }

    if (stage === 0) {
      if (line.indexOf('|') !== -1 || !isDateLine(line)) {
        const at = line.indexOf('|');
        const first = (at === -1 ? line : line.slice(0, at)).trim();
        const rest = at === -1 ? '' : line.slice(at + 1).replace(/\s*\|\s*/g, ' | ').trim();
        if (section === 'experience') {
          current.company = first;
          current.location = rest;
        } else {
          current.school = first;
          current.location = rest;
        }
        stage = 1;
      } else {
        splitDates(line, current);
        stage = 2;
      }
      return;
    }

    if (stage === 1) {
      splitDates(line, current);
      stage = 2;
    }
  });

  ensureContent(state);
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
    const at = title.indexOf(',');
    const item = {
      id: '',
      school: '',
      degree: (at === -1 ? title : title.slice(0, at)).trim(),
      field: at === -1 ? '' : title.slice(at + 1).trim(),
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

function isUrl(part: string): boolean {
  return !/\s/.test(part) && /^(https?:\/\/|www\.)|^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(part);
}

function assignContacts(state: Draft, line: string): void {
  line
    .split(/\u00B7|\||,|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const profile = state.profile;
      if (part.indexOf('@') !== -1 && !/\s/.test(part) && !profile.email) {
        profile.email = part;
      } else if (!profile.phone && /^[+\d][\d\s()+-]{6,}$/.test(part)) {
        profile.phone = part;
      } else if (isUrl(part) && /linkedin\./i.test(part) && !profile.linkedin) {
        profile.linkedin = part;
      } else if (isUrl(part) && !/linkedin\./i.test(part) && !profile.website) {
        profile.website = part;
      } else if (!profile.location) {
        profile.location = part;
      } else {
        profile.location = profile.location + ', ' + part;
      }
    });
}

function join(existing: unknown, value: string, paragraph = false): string {
  const base = typeof existing === 'string' ? existing.trim() : '';
  if (!base) return value;
  return base + (paragraph ? '\n\n' : '\n') + value;
}
