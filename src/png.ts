import type { ResumeState } from './types';
import { dateRange, splitLines, splitList } from './util';

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 96;
const INK = '#1a1c18';
const MUTED = '#5a6257';
const GOLD = '#9a5b00';
const RULE = '#d9d5c6';
const PAPER = '#f6f3e9';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

/**
 * Draws the resume onto A4-sized canvases with the same layout as the PDF writer, and
 * returns one PNG per page. Text is drawn as text, so it stays crisp at 150 dpi.
 */
export async function buildPngPages(state: ResumeState): Promise<Blob[]> {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const pages: Blob[] = [];
  let y = MARGIN;

  const blank = () => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    y = MARGIN;
  };

  const flush = async () => {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) pages.push(blob);
  };

  const ensure = async (height: number) => {
    if (y + height <= PAGE_H - MARGIN - 12) return;
    await flush();
    blank();
  };

  const font = (weight: number, size: number, italic = false) => {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
  };

  const wrap = (text: string, maxWidth: number): string[] => {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? line + ' ' + word : word;
      if (!line || ctx.measureText(next).width <= maxWidth) line = next;
      else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    return lines;
  };

  const paragraph = async (
    text: string,
    options: { size: number; weight?: number; italic?: boolean; color?: string; gap?: number; x?: number; width?: number } = { size: 20 }
  ) => {
    const size = options.size;
    const value = String(text || '').trim();
    if (!value) return;
    font(options.weight ?? 400, size, options.italic);
    ctx.fillStyle = options.color ?? INK;
    const x = options.x ?? MARGIN;
    const width = options.width ?? PAGE_W - MARGIN * 2;
    const lines = wrap(value, width);
    for (const line of lines) {
      await ensure(size * 1.35);
      ctx.fillText(line, x, y);
      y += size * 1.35;
    }
    y += options.gap ?? 0;
  };

  const section = async (title: string) => {
    await ensure(64);
    y += 22;
    font(700, 19);
    ctx.fillStyle = GOLD;
    ctx.fillText(title.toUpperCase(), MARGIN, y);
    y += 12;
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
    y += 30;
  };

  const entryHead = async (title: string, dates: string) => {
    await ensure(72);
    let dateWidth = 0;
    if (dates) {
      font(400, 19);
      ctx.fillStyle = MUTED;
      dateWidth = ctx.measureText(dates).width + 18;
      ctx.fillText(dates, PAGE_W - MARGIN - (dateWidth - 18), y);
    }
    font(700, 22);
    ctx.fillStyle = INK;
    const lines = wrap(title, PAGE_W - MARGIN * 2 - dateWidth);
    ctx.fillText(lines[0] || '', MARGIN, y);
    y += 30;
    for (let i = 1; i < lines.length; i += 1) {
      await ensure(32);
      ctx.fillText(lines[i], MARGIN, y);
      y += 30;
    }
  };

  const bullet = async (text: string) => {
    font(400, 20);
    ctx.fillStyle = INK;
    const lines = wrap(text, PAGE_W - MARGIN * 2 - 30);
    for (let i = 0; i < lines.length; i += 1) {
      await ensure(28);
      if (i === 0) ctx.fillText('-', MARGIN + 2, y);
      ctx.fillText(lines[i], MARGIN + 30, y);
      y += 28;
    }
    y += 2;
  };

  blank();

  const p = state.profile;
  const s = state.settings;

  if (p.name) {
    font(700, 46);
    ctx.fillStyle = INK;
    const lines = wrap(p.name, PAGE_W - MARGIN * 2);
    for (const line of lines) {
      await ensure(58);
      ctx.fillText(line, MARGIN, y);
      y += 58;
    }
    y += 4;
  }

  if (p.headline) await paragraph(p.headline, { size: 23, color: '#7a4c00', gap: 8 });
  const contact = [p.email, p.phone, p.location, p.website, p.linkedin].filter(Boolean).join('   |   ');
  if (contact) await paragraph(contact, { size: 18, color: MUTED, gap: 12 });

  if (s.showSummary && p.summary.trim()) await paragraph(p.summary.trim(), { size: 20, gap: 10 });

  const roles = state.experience.filter((item) => item.role || item.company);
  if (s.sections.experience && roles.length) {
    await section('Experience');
    for (const item of roles) {
      await entryHead(item.role || 'Role', dateRange(item));
      const place = [item.company, item.location].filter(Boolean).join('   |   ');
      if (place) await paragraph(place, { size: 19, italic: true, color: MUTED, gap: 6 });
      for (const line of splitLines(item.highlights)) await bullet(line);
      const tags = splitList(item.tags);
      if (s.showTags && tags.length) await paragraph(tags.join('   |   '), { size: 18, italic: true, color: MUTED, gap: 8 });
      y += 10;
    }
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (s.sections.education && schools.length) {
    await section('Education');
    for (const item of schools) {
      const title = [item.degree, item.field].filter(Boolean).join(', ') || item.school;
      await entryHead(title, dateRange(item));
      const place = [item.school, item.location].filter(Boolean).join('   |   ');
      if (place) await paragraph(place, { size: 19, italic: true, color: MUTED, gap: 6 });
      for (const line of splitLines(item.details)) await bullet(line);
      y += 10;
    }
  }

  const certs = state.certifications.filter((item) => item.name);
  if (s.sections.certifications && certs.length) {
    await section('Certifications');
    for (const item of certs) {
      await entryHead(item.name, item.date || '');
      const meta = [item.issuer, item.expires ? 'expires ' + item.expires : ''].filter(Boolean).join('   |   ');
      if (meta) await paragraph(meta, { size: 18, italic: true, color: MUTED, gap: 4 });
      y += 6;
    }
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    await section('Projects');
    for (const item of projects) {
      await entryHead(item.name, '');
      if (item.link) await paragraph(item.link, { size: 18, italic: true, color: MUTED, gap: 4 });
      if (item.description) await paragraph(item.description, { size: 20, gap: 4 });
      const tech = splitList(item.tech);
      if (tech.length) await paragraph(tech.join('   |   '), { size: 18, italic: true, color: MUTED, gap: 8 });
      y += 8;
    }
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (s.sections.skills && skills.length) {
    await section('Skills');

    let widest = 210;
    for (const item of skills) {
      font(700, 20);
      widest = Math.max(widest, ctx.measureText((item.label || 'Skills') + ':').width + 24);
    }
    const column = Math.min(widest, (PAGE_W - MARGIN * 2) * 0.42);

    for (const item of skills) {
      const label = (item.label || 'Skills') + ':';
      font(700, 20);
      const labelWidth = ctx.measureText(label).width;
      const indent = column;
      font(400, 20);
      const lines = wrap(item.items, PAGE_W - MARGIN * 2 - indent);
      const ownLine = labelWidth + 18 > indent;
      await ensure(30 * (ownLine ? 1 + lines.length : Math.max(1, lines.length)) + 6);

      font(700, 20);
      ctx.fillStyle = INK;
      ctx.fillText(label, MARGIN, y);

      font(400, 20);
      if (ownLine) {
        y += 28;
        for (const line of lines) {
          await ensure(28);
          ctx.fillText(line, MARGIN + 24, y);
          y += 28;
        }
      } else {
        lines.forEach((line, index) => {
          ctx.fillText(line, MARGIN + indent, y + index * 28);
        });
        y += 28 * Math.max(1, lines.length);
      }
      y += 4;
    }
  }

  await flush();
  return pages;
}
