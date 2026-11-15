import { DATA_MARKER, encodeSnapshot, snapshot, wrapPayload } from './data';
import type { ResumeState } from './types';
import { dateRange, slugify, splitLines, splitList } from './util';

export function fileNameBase(state: ResumeState): string {
  return slugify(state.profile.name || 'resume') + '-resume';
}

export function toJson(state: ResumeState): string {
  return JSON.stringify(snapshot(state), null, 2);
}

/** A table cell: no line breaks, pipes escaped so the cell cannot split. */
function cell(value: string | null | undefined): string {
  return String(value == null ? '' : value)
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/** "Company · Location" that keeps an empty first half, so the position survives a re-import. */
function pair(a: string, b: string, separator: string): string {
  if (!a && !b) return '';
  return b ? `${a}${separator}${b}`.trim() : a;
}

export function toMarkdown(state: ResumeState): string {
  const p = state.profile;
  const s = state.settings;
  const out: string[] = [];

  if (p.name) out.push(`# ${p.name}`, '');
  if (p.headline) out.push(`**${p.headline}**`, '');
  const contact = [p.email, p.phone, p.location, p.website, p.linkedin].filter(Boolean);
  if (contact.length) out.push(contact.join(' · '), '');
  if (s.showSummary && p.summary.trim()) out.push(p.summary.trim(), '');

  const roles = state.experience.filter((item) => item.role || item.company);
  if (s.sections.experience && roles.length) {
    out.push('## Experience', '');
    roles.forEach((item) => {
      out.push(`### ${item.role || 'Role'}`, '');
      const place = pair(item.company, item.location, ' · ');
      if (place) out.push(`*${place}*`, '');
      const dates = dateRange(item);
      if (dates) out.push(`**${dates}**`, '');
      const bullets = splitLines(item.highlights);
      bullets.forEach((bullet) => out.push(`- ${bullet}`));
      if (bullets.length) out.push('');
      const tags = splitList(item.tags);
      if (s.showTags && tags.length) out.push('Tags: ' + tags.map((tag) => '`' + tag + '`').join(', '), '');
      out.push('');
    });
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (s.sections.education && schools.length) {
    out.push('## Education', '');
    schools.forEach((item) => {
      const degree = [item.degree, item.field].filter(Boolean).join(', ');
      out.push(`### ${degree || item.school}`, '');
      const place = degree ? pair(item.school, item.location, ' · ') : item.location ? pair('', item.location, ' · ') : '';
      if (place) out.push(`*${place}*`, '');
      const dates = dateRange(item);
      if (dates) out.push(`**${dates}**`, '');
      const details = splitLines(item.details);
      details.forEach((line) => out.push(`- ${line}`));
      if (details.length) out.push('');
      out.push('');
    });
  }

  const certs = state.certifications.filter((item) => item.name);
  if (s.sections.certifications && certs.length) {
    out.push('## Certifications', '');
    out.push('| Certification | Issuer | Issued | Expires | Link |');
    out.push('| --- | --- | --- | --- | --- |');
    certs.forEach((item) => {
      out.push(
        `| ${cell(item.name)} | ${cell(item.issuer)} | ${cell(item.date)} | ${cell(item.expires)} | ${cell(item.link)} |`
      );
    });
    out.push('');
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    out.push('## Projects', '');
    projects.forEach((item) => {
      out.push(`### ${item.name}`, '');
      if (item.link) out.push(`*${item.link}*`, '');
      splitLines(item.description).forEach((line) => out.push(line, ''));
      const tech = splitList(item.tech);
      if (tech.length) out.push('Tags: ' + tech.map((tag) => '`' + tag + '`').join(', '), '');
      out.push('');
    });
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (s.sections.skills && skills.length) {
    out.push('## Skills', '');
    skills.forEach((item) => out.push(`- **${item.label || 'Skills'}:** ${splitLines(item.items).join(', ')}`));
    out.push('');
  }

  out.push(`<!-- ${DATA_MARKER}:${encodeSnapshot(state)} -->`, '');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Splits a text field into pieces joined with " | ", escaping literal pipes. */
function field(value: string | null | undefined): string {
  return String(value == null ? '' : value)
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

export function toPlainText(state: ResumeState): string {
  const p = state.profile;
  const s = state.settings;
  const out: string[] = [];

  if (p.name) out.push(p.name, '');
  if (p.headline) out.push(p.headline, '');
  const contact = [p.email, p.phone, p.location, p.website, p.linkedin].filter(Boolean);
  if (contact.length) out.push(contact.join(' | '), '');
  if (s.showSummary && p.summary.trim()) out.push('SUMMARY', '', p.summary.trim(), '');

  const roles = state.experience.filter((item) => item.role || item.company);
  if (s.sections.experience && roles.length) {
    out.push('EXPERIENCE', '');
    roles.forEach((item) => {
      out.push(item.role || 'Role');
      const place = pair(item.company, item.location, ' | ');
      if (place) out.push(place);
      const dates = dateRange(item);
      if (dates) out.push(dates);
      splitLines(item.highlights).forEach((bullet) => out.push('- ' + bullet));
      const tags = splitList(item.tags);
      if (s.showTags && tags.length) out.push('Tags: ' + tags.join(', '));
      out.push('');
    });
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (s.sections.education && schools.length) {
    out.push('EDUCATION', '');
    schools.forEach((item) => {
      const degree = [item.degree, item.field].filter(Boolean).join(', ');
      out.push(degree || item.school);
      const place = degree ? pair(item.school, item.location, ' | ') : item.location ? pair('', item.location, ' | ') : '';
      if (place) out.push(place);
      const dates = dateRange(item);
      if (dates) out.push(dates);
      splitLines(item.details).forEach((line) => out.push('- ' + line));
      out.push('');
    });
  }

  const certsText = state.certifications.filter((item) => item.name);
  if (s.sections.certifications && certsText.length) {
    out.push('CERTIFICATIONS', '');
    certsText.forEach((item) => {
      const cells = [item.name, item.issuer, item.date, item.expires, item.link].map(field);
      while (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
      out.push('- ' + cells.join(' | '));
    });
    out.push('');
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    out.push('PROJECTS', '');
    projects.forEach((item) => {
      out.push(item.name);
      if (item.link) out.push(item.link);
      splitLines(item.description).forEach((line) => out.push(line));
      const tech = splitList(item.tech);
      if (tech.length) out.push('Tech: ' + tech.join(', '));
      out.push('');
    });
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (s.sections.skills && skills.length) {
    out.push('SKILLS', '');
    skills.forEach((item) => out.push(`${item.label || 'Skills'}: ${splitLines(item.items).join(', ')}`));
    out.push('');
  }

  out.push('----- GMO RESUME DATA -----');
  wrapPayload(encodeSnapshot(state)).forEach((line) => out.push(line));
  out.push('----- END GMO RESUME DATA -----', '');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
