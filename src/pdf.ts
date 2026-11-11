import { jsPDF } from 'jspdf';
import type { ResumeState } from './types';
import { ascii, dateRange, splitLines, splitList } from './util';

const MARGIN = 48;
const INK: [number, number, number] = [24, 26, 22];
const MUTED: [number, number, number] = [92, 100, 88];
const GOLD: [number, number, number] = [154, 91, 0];
const RULE: [number, number, number] = [208, 204, 192];

/**
 * Real PDF output (not window.print) so it works in every browser and web view.
 * Text stays selectable because it is drawn as text, not as a screenshot.
 */
export function buildPdf(state: ResumeState): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const bottom = pageHeight - MARGIN;

  let y = MARGIN + 12;

  const font = (style: 'normal' | 'bold' | 'italic' | 'bolditalic', size: number) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };

  const ensure = (height: number) => {
    if (y + height <= bottom) return;
    doc.addPage();
    y = MARGIN;
  };

  const paragraph = (
    text: string,
    size: number,
    style: 'normal' | 'bold' | 'italic' | 'bolditalic',
    color: [number, number, number],
    gap = 2
  ) => {
    const value = ascii(text);
    if (!value.trim()) return;
    font(style, size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(value, contentWidth) as string[];
    lines.forEach((line) => {
      ensure(size * 1.35);
      doc.text(line, MARGIN, y);
      y += size * 1.35;
    });
    y += gap;
  };

  const section = (title: string) => {
    ensure(30);
    y += 10;
    font('bold', 8.5);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.setCharSpace(1.2);
    doc.text(ascii(title).toUpperCase(), MARGIN, y);
    doc.setCharSpace(0);
    y += 5;
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 13;
  };

  const entryHead = (title: string, dates: string) => {
    ensure(17);
    if (dates) {
      font('normal', 8.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(ascii(dates), pageWidth - MARGIN, y, { align: 'right' });
    }
    font('bold', 10.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    const titleLines = doc.splitTextToSize(ascii(title), contentWidth - 130) as string[];
    doc.text(titleLines[0] || '', MARGIN, y);
    y += 13;
    titleLines.slice(1).forEach((line) => {
      ensure(13);
      doc.text(line, MARGIN, y);
      y += 13;
    });
  };

  const bullet = (text: string, indent = 16) => {
    font('normal', 9.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    const lines = doc.splitTextToSize(ascii(text), contentWidth - indent) as string[];
    lines.forEach((line, index) => {
      ensure(12.5);
      if (index === 0) doc.text('-', MARGIN + 2, y);
      doc.text(line, MARGIN + indent, y);
      y += 12.5;
    });
    y += 1;
  };

  const p = state.profile;
  const s = state.settings;

  if (p.name) {
    font('bold', 22);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    const nameLines = doc.splitTextToSize(ascii(p.name), contentWidth) as string[];
    nameLines.forEach((line) => {
      ensure(26);
      doc.text(line, MARGIN, y);
      y += 26;
    });
    y += 2;
  }

  if (p.headline) paragraph(p.headline, 11, 'normal', [122, 76, 0], 4);

  const contact = [p.email, p.phone, p.location, p.website, p.linkedin].filter(Boolean).join('  |  ');
  if (contact) paragraph(contact, 8.5, 'normal', MUTED, 6);

  if (s.showSummary && p.summary.trim()) {
    y += 4;
    paragraph(p.summary.trim(), 9.5, 'normal', INK, 4);
  }

  const roles = state.experience.filter((item) => item.role || item.company);
  if (s.sections.experience && roles.length) {
    section('Experience');
    roles.forEach((item) => {
      entryHead(item.role || 'Role', dateRange(item));
      const place = [item.company, item.location].filter(Boolean).join('  |  ');
      if (place) paragraph(place, 9, 'italic', MUTED, 3);
      splitLines(item.highlights).forEach((line) => bullet(line));
      if (s.showTags) {
        const tags = splitList(item.tags);
        if (tags.length) paragraph(tags.join('  |  '), 8.5, 'italic', MUTED, 4);
      }
      y += 5;
    });
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (s.sections.education && schools.length) {
    section('Education');
    schools.forEach((item) => {
      const title = [item.degree, item.field].filter(Boolean).join(', ') || item.school;
      entryHead(title, dateRange(item));
      const place = [item.school, item.location].filter(Boolean).join('  |  ');
      if (place) paragraph(place, 9, 'italic', MUTED, 3);
      splitLines(item.details).forEach((line) => bullet(line));
      y += 5;
    });
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    section('Projects');
    projects.forEach((item) => {
      entryHead(item.name, '');
      if (item.link) paragraph(item.link, 8.5, 'italic', MUTED, 2);
      if (item.description) paragraph(item.description, 9.5, 'normal', INK, 2);
      const tech = splitList(item.tech);
      if (tech.length) paragraph(tech.join('  |  '), 8.5, 'italic', MUTED, 3);
      y += 5;
    });
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (s.sections.skills && skills.length) {
    section('Skills');
    skills.forEach((item) => {
      ensure(14);
      font('bold', 9.5);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(ascii(item.label || 'Skills') + ':', MARGIN, y);
      font('normal', 9.5);
      doc.text(ascii(item.items), MARGIN + 96, y);
      y += 14;
    });
  }

  doc.setProperties({
    title: (p.name || 'Resume') + ' — Résumé',
    subject: p.headline || '',
    creator: 'GMO Résumé Manager'
  });

  return doc.output('blob');
}
