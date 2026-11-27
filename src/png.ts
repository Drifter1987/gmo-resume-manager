import { DATA_MARKER, encodeSnapshot } from './data';
import { visiblePhoto } from './fields';
import { paletteFor } from './palette';
import { embedPngText } from './pngmeta';
import type { ResumeState } from './types';
import { dateRange, splitLines, splitList } from './util';

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 96;
/** Where the portrait sits in the header, and the smallest column the header text keeps. */
const PHOTO_BOX = 148;
const MIN_HEADER = 520;

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';

/** Decodes a stored portrait; a picture that cannot be read is simply left out. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Draws the resume onto A4-sized canvases with the same layout as the PDF writer, and
 * returns one PNG per page. Text is drawn as text, so it stays crisp at 150 dpi.
 * Colours follow the colour / black-and-white setting. Every page carries the data
 * snapshot in a text chunk, so any single page can be imported back.
 */
export async function buildPngPages(state: ResumeState): Promise<Blob[]> {
  const pal = paletteFor(state);
  const bw = pal.mode === 'bw';
  const FONT = state.settings.font === 'serif' ? SERIF : SANS;
  const K = state.settings.density === 'compact' ? 0.92 : 1;

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const payload = encodeSnapshot(state);
  const pages: Blob[] = [];
  let y = MARGIN;

  const blank = () => {
    ctx.fillStyle = pal.paper;
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    y = MARGIN;
  };

  const flush = async () => {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const tagged = embedPngText(bytes, DATA_MARKER, payload);
    pages.push(new Blob([tagged], { type: 'image/png' }));
  };

  const ensure = async (height: number) => {
    if (y + height <= PAGE_H - MARGIN - 12) return;
    await flush();
    blank();
  };

  const font = (weight: number, size: number, italic = false) => {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size * K}px ${FONT}`;
  };

  const wrap = (text: string, maxWidth: number): string[] => {
    const lines: string[] = [];
    String(text)
      .split(/\r?\n/)
      .forEach((paragraphText) => {
        const words = paragraphText.split(/\s+/).filter(Boolean);
        let line = '';
        words.forEach((word) => {
          const next = line ? line + ' ' + word : word;
          if (!line || ctx.measureText(next).width <= maxWidth) {
            line = next;
            return;
          }
          lines.push(line);
          line = word;
          // a single word wider than the line: break it by characters
          while (ctx.measureText(line).width > maxWidth && line.length > 1) {
            let cut = line.length - 1;
            while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut -= 1;
            lines.push(line.slice(0, cut));
            line = line.slice(cut);
          }
        });
        if (line) lines.push(line);
      });
    return lines;
  };

  const paragraph = async (
    text: string,
    options: { size: number; weight?: number; italic?: boolean; color?: string; gap?: number; x?: number; width?: number } = { size: 20 }
  ) => {
    const size = options.size * K;
    const value = String(text || '').trim();
    if (!value) return;
    font(options.weight ?? 400, options.size, options.italic);
    const x = options.x ?? MARGIN;
    const width = options.width ?? PAGE_W - MARGIN * 2;
    const lines = wrap(value, width);
    for (const line of lines) {
      await ensure(size * 1.35);
      font(options.weight ?? 400, options.size, options.italic);
      ctx.fillStyle = options.color ?? pal.text;
      ctx.fillText(line, x, y);
      y += size * 1.35;
    }
    y += (options.gap ?? 0) * K;
  };

  const hairline = (x1: number, x2: number, at: number, width: number, dotted = false) => {
    ctx.strokeStyle = pal.rule;
    ctx.lineWidth = width;
    ctx.setLineDash(dotted ? [2, 5] : []);
    ctx.beginPath();
    ctx.moveTo(x1, at);
    ctx.lineTo(x2, at);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const section = async (title: string) => {
    await ensure(80 * K);
    y += 22 * K;
    font(700, 19);
    ctx.fillStyle = pal.accent;
    ctx.fillText(title.toUpperCase(), MARGIN, y);
    y += 12 * K;
    hairline(MARGIN, PAGE_W - MARGIN, y, bw ? 1.5 : 2);
    y += 30 * K;
  };

  const entryHead = async (title: string, dates: string) => {
    await ensure(80 * K);
    let dateWidth = 0;
    if (dates) {
      font(400, 19);
      ctx.fillStyle = pal.muted;
      const w = ctx.measureText(dates).width;
      dateWidth = w + 18;
      ctx.fillText(dates, PAGE_W - MARGIN - w, y);
    }
    font(700, 22);
    ctx.fillStyle = pal.text;
    const lines = wrap(title, PAGE_W - MARGIN * 2 - dateWidth);
    ctx.fillText(lines[0] || '', MARGIN, y);
    y += 30 * K;
    for (let i = 1; i < lines.length; i += 1) {
      await ensure(32 * K);
      font(700, 22);
      ctx.fillStyle = pal.text;
      ctx.fillText(lines[i], MARGIN, y);
      y += 30 * K;
    }
  };

  const bullet = async (text: string) => {
    font(400, 20);
    const lines = wrap(text, PAGE_W - MARGIN * 2 - 30);
    for (let i = 0; i < lines.length; i += 1) {
      await ensure(28 * K);
      font(400, 20);
      ctx.fillStyle = pal.text;
      if (i === 0) {
        ctx.beginPath();
        ctx.arc(MARGIN + 7, y - 7 * K, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillText(lines[i], MARGIN + 30, y);
      y += 28 * K;
    }
    y += 2;
  };

  const certificationTable = async (rows: ResumeState['certifications']) => {
    const inner = PAGE_W - MARGIN * 2;
    const widths = [0.44, 0.26, 0.15, 0.15].map((fraction) => fraction * inner);
    const xs: number[] = [];
    widths.reduce((x, width, index) => {
      xs[index] = MARGIN + x;
      return x + width;
    }, 0);
    const gap = 18;
    const line = 26 * K;

    const header = () => {
      font(700, 15);
      ctx.fillStyle = pal.muted;
      ['CERTIFICATION', 'ISSUER', 'ISSUED', 'EXPIRES'].forEach((label, index) => ctx.fillText(label, xs[index], y));
      y += 10 * K;
      hairline(MARGIN, PAGE_W - MARGIN, y, 1.2);
      y += 30 * K;
    };

    await ensure(120 * K);
    header();

    for (let index = 0; index < rows.length; index += 1) {
      const item = rows[index];
      font(700, 19);
      const name = wrap(item.name, widths[0] - gap);
      font(400, 19);
      const issuer = wrap(item.issuer, widths[1] - gap);
      const issued = wrap(item.date, widths[2] - gap);
      const expires = wrap(item.expires, widths[3]);
      const count = Math.max(1, name.length, issuer.length, issued.length, expires.length);
      const height = count * line + 16 * K;

      if (y + height > PAGE_H - MARGIN - 12) {
        await flush();
        blank();
        header();
      }

      font(700, 19);
      ctx.fillStyle = pal.text;
      name.forEach((text, i) => ctx.fillText(text, xs[0], y + i * line));
      font(400, 19);
      ctx.fillStyle = pal.text;
      issuer.forEach((text, i) => ctx.fillText(text, xs[1], y + i * line));
      ctx.fillStyle = pal.muted;
      issued.forEach((text, i) => ctx.fillText(text, xs[2], y + i * line));
      expires.forEach((text, i) => ctx.fillText(text, xs[3], y + i * line));

      const rowBottom = y + (count - 1) * line + 12 * K;
      if (index < rows.length - 1) hairline(MARGIN, PAGE_W - MARGIN, rowBottom, 1, true);
      y = rowBottom + 24 * K;
    }
    y += 6;
  };

  blank();

  const p = state.profile;
  const s = state.settings;

  /* The portrait goes in the header of the markets that expect one, at its own
     proportions, and the header text is narrowed so nothing runs under it. */
  let headerWidth = PAGE_W - MARGIN * 2;
  let photoHeight = 0;
  const photo = visiblePhoto(state);
  if (photo) {
    const image = await loadImage(photo);
    if (image && image.width && image.height) {
      const scale = PHOTO_BOX / Math.max(image.width, image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      ctx.drawImage(image, PAGE_W - MARGIN - w, MARGIN, w, h);
      headerWidth = Math.max(PAGE_W - MARGIN * 2 - w - 36, MIN_HEADER);
      photoHeight = h;
    }
  }

  if (p.name) {
    font(700, 46);
    const lines = wrap(p.name, headerWidth);
    for (const line of lines) {
      await ensure(58 * K);
      font(700, 46);
      ctx.fillStyle = pal.name;
      ctx.fillText(line, MARGIN, y);
      y += 58 * K;
    }
    y += 4;
  }

  if (p.headline) await paragraph(p.headline, { size: 23, color: pal.headline, gap: 8, width: headerWidth });
  const contact = [p.email, p.phone, p.location, p.website, p.linkedin].filter(Boolean).join('   |   ');
  if (contact) await paragraph(contact, { size: 18, color: pal.muted, gap: 12, width: headerWidth });

  /* Below the portrait, so the summary never starts in the space it occupies. */
  if (photoHeight) y = Math.max(y, MARGIN + photoHeight + 18);

  if (s.showSummary && p.summary.trim()) await paragraph(p.summary.trim(), { size: 20, gap: 10 });

  const roles = state.experience.filter((item) => item.role || item.company);
  if (s.sections.experience && roles.length) {
    await section('Experience');
    for (const item of roles) {
      await entryHead(item.role || 'Role', dateRange(item));
      const place = [item.company, item.location].filter(Boolean).join('   |   ');
      if (place) await paragraph(place, { size: 19, italic: true, color: pal.muted, gap: 6 });
      for (const line of splitLines(item.highlights)) await bullet(line);
      const tags = splitList(item.tags);
      if (s.showTags && tags.length) await paragraph(tags.join('   |   '), { size: 18, italic: true, color: pal.muted, gap: 8 });
      y += 10 * K;
    }
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (s.sections.education && schools.length) {
    await section('Education');
    for (const item of schools) {
      const degree = [item.degree, item.field].filter(Boolean).join(', ');
      const title = degree || item.school || 'Study';
      await entryHead(title, dateRange(item));
      const place = (degree && item.school ? [item.school, item.location] : [item.location])
        .filter(Boolean)
        .join('   |   ');
      if (place) await paragraph(place, { size: 19, italic: true, color: pal.muted, gap: 6 });
      for (const line of splitLines(item.details)) await bullet(line);
      y += 10 * K;
    }
  }

  const certs = state.certifications.filter((item) => item.name);
  if (s.sections.certifications && certs.length) {
    await section('Certifications');
    await certificationTable(certs);
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    await section('Projects');
    for (const item of projects) {
      await entryHead(item.name, '');
      if (item.description) await paragraph(item.description, { size: 19, italic: true, color: pal.muted, gap: 4 });
      const tech = splitList(item.tech);
      if (tech.length) await paragraph(tech.join('   |   '), { size: 18, italic: true, color: pal.muted, gap: 6 });
      if (item.link) await paragraph(item.link, { size: 18, color: pal.muted, gap: 8 });
      y += 8 * K;
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
    const row = 28 * K;

    for (const item of skills) {
      const label = (item.label || 'Skills') + ':';
      font(700, 20);
      const labelWidth = ctx.measureText(label).width;
      const indent = column;
      font(400, 20);
      const lines = wrap(item.items, PAGE_W - MARGIN * 2 - indent);
      const ownLine = labelWidth + 18 > indent;
      await ensure(row * (ownLine ? 1 + lines.length : Math.max(1, lines.length)) + 6);

      font(700, 20);
      ctx.fillStyle = pal.accent;
      ctx.fillText(label, MARGIN, y);

      font(400, 20);
      ctx.fillStyle = pal.text;
      if (ownLine) {
        y += row;
        for (const line of lines) {
          await ensure(row);
          font(400, 20);
          ctx.fillStyle = pal.text;
          ctx.fillText(line, MARGIN + 24, y);
          y += row;
        }
      } else {
        lines.forEach((line, index) => {
          ctx.fillText(line, MARGIN + indent, y + index * row);
        });
        y += row * Math.max(1, lines.length);
      }
      y += 4;
    }
  }

  await flush();
  return pages;
}
