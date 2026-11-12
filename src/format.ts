import { encodeSnapshot, snapshot, wrapPayload } from './data';
import type { ResumeState } from './types';
import { dateRange, slugify, splitLines, splitList } from './util';

export function fileNameBase(state: ResumeState): string {
  return slugify(state.profile.name || 'resume') + '-resume';
}

export function toJson(state: ResumeState): string {
  return JSON.stringify(snapshot(state), null, 2);
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
      const place = [item.company, item.location].filter(Boolean).join(' · ');
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
      const title = [item.degree, item.field].filter(Boolean).join(', ') || item.school;
      out.push(`### ${title}`, '');
      const place = [item.school, item.location].filter(Boolean).join(' · ');
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
    certs.forEach((item) => {
      const meta = [item.issuer, item.date, item.expires ? 'expires ' + item.expires : '']
        .filter(Boolean)
        .join(' · ');
      out.push(`- **${item.name}**${meta ? ' — ' + meta : ''}`);
    });
    out.push('');
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    out.push('## Projects', '');
    projects.forEach((item) => {
      out.push(`### ${item.name}`, '');
      if (item.link) out.push(`*${item.link}*`, '');
      if (item.description) out.push(item.description, '');
      const tech = splitList(item.tech);
      if (tech.length) out.push('Tags: ' + tech.map((tag) => '`' + tag + '`').join(', '), '');
      out.push('');
    });
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (s.sections.skills && skills.length) {
    out.push('## Skills', '');
    skills.forEach((item) => out.push(`- **${item.label || 'Skills'}:** ${item.items}`));
    out.push('');
  }

  out.push(`<!-- ${'gmo-resume-data'}:${encodeSnapshot(state)} -->`, '');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toPlainText(state: ResumeState): string {
  const p = state.profile;
  const s = state.settings;
  const out: string[] = [];

  if (p.name) out.push(p.name.toUpperCase(), '');
  if (p.headline) out.push(p.headline, '');
  const contact = [p.email, p.phone, p.location, p.website, p.linkedin].filter(Boolean);
  if (contact.length) out.push(contact.join(' | '), '');
  if (s.showSummary && p.summary.trim()) out.push('SUMMARY', '', p.summary.trim(), '');

  const roles = state.experience.filter((item) => item.role || item.company);
  if (s.sections.experience && roles.length) {
    out.push('EXPERIENCE', '');
    roles.forEach((item) => {
      out.push(item.role || 'Role');
      const place = [item.company, item.location].filter(Boolean).join(' | ');
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
      out.push([item.degree, item.field].filter(Boolean).join(', ') || item.school);
      const place = [item.school, item.location].filter(Boolean).join(' | ');
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
      const meta = [item.issuer, item.date, item.expires ? 'expires ' + item.expires : '']
        .filter(Boolean)
        .join(' | ');
      out.push('- ' + item.name + (meta ? ' | ' + meta : ''));
    });
    out.push('');
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    out.push('PROJECTS', '');
    projects.forEach((item) => {
      out.push(item.name);
      if (item.link) out.push(item.link);
      if (item.description) out.push(item.description);
      const tech = splitList(item.tech);
      if (tech.length) out.push('Tech: ' + tech.join(', '));
      out.push('');
    });
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (s.sections.skills && skills.length) {
    out.push('SKILLS', '');
    skills.forEach((item) => out.push(`${item.label || 'Skills'}: ${item.items}`));
    out.push('');
  }

  out.push('----- GMO RESUME DATA -----');
  wrapPayload(encodeSnapshot(state)).forEach((line) => out.push(line));
  out.push('----- END GMO RESUME DATA -----', '');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
