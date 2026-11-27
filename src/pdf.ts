import { jsPDF } from 'jspdf';
import { DATA_MARKER, encodeSnapshot } from './data';
import { visiblePhoto } from './fields';
import { hexToRgb, paletteFor } from './palette';
import type { ResumeState } from './types';
import { ascii, dateRange, pdfText, splitLines, splitList } from './util';

const MARGIN = 48;
/** Where the portrait sits in the header, and the smallest column the header text keeps. */
const PHOTO_BOX = 64;
const MIN_HEADER = 260;

type RGB = [number, number, number];
type Style = 'normal' | 'bold' | 'italic' | 'bolditalic';

/**
 * Real PDF output (not window.print) so it works in every browser and web view.
 * Text stays selectable because it is drawn as text, not as a screenshot.
 * Colours, typeface and density follow the resume settings, and the full data
 * snapshot rides along in the document keywords so the PDF can be imported back.
 */
export function buildPdf(state: ResumeState): Blob {
  const pal = paletteFor(state);
  const INK = hexToRgb(pal.text) as RGB;
  const MUTED = hexToRgb(pal.muted) as RGB;
  const ACCENT = hexToRgb(pal.accent) as RGB;
  const RULE = hexToRgb(pal.rule) as RGB;
  const NAME = hexToRgb(pal.name) as RGB;
  const HEADLINE = hexToRgb(pal.headline) as RGB;
  const bw = pal.mode === 'bw';

  const family = state.settings.font === 'serif' ? 'times' : 'helvetica';
  const K = state.settings.density === 'compact' ? 0.92 : 1;

  /* jsPDF 4.2.1 is the floor on purpose: 4.2.1 is where the last of the reviewed
     advisories is fixed (HTML injection in the new-window output overloads, and PDF
     object injection through free-text annotation colour). This writer only uses
     `addImage`, `text`, `setProperties` and `output('blob')`, none of which are affected,
     but the dependency itself should not go back below that version. */
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const bottom = pageHeight - MARGIN - 10;

  let y = MARGIN + 12;

  const font = (style: Style, size: number) => {
    doc.setFont(family, style);
    doc.setFontSize(size * K);
  };

  const ensure = (height: number) => {
    if (y + height <= bottom) return;
    doc.addPage();
    y = MARGIN;
  };

  const paragraph = (text: string, size: number, style: Style, color: RGB, gap = 2, width = contentWidth) => {
    const value = pdfText(text);
    if (!value.trim()) return;
    font(style, size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(value, width) as string[];
    lines.forEach((line) => {
      ensure(size * K * 1.35);
      doc.text(line, MARGIN, y);
      y += size * K * 1.35;
    });
    y += gap * K;
  };

  const rule = (x1: number, x2: number, at: number, width: number, dotted = false) => {
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(width);
    if (dotted) doc.setLineDashPattern([1, 2], 0);
    doc.line(x1, at, x2, at);
    if (dotted) doc.setLineDashPattern([], 0);
  };

  const section = (title: string) => {
    ensure(40);
    y += 10 * K;
    font('bold', 8.5);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.setCharSpace(1.2);
    doc.text(pdfText(title).toUpperCase(), MARGIN, y);
    doc.setCharSpace(0);
    y += 5;
    rule(MARGIN, pageWidth - MARGIN, y, bw ? 0.6 : 0.75);
    y += 13 * K;
  };

  const entryHead = (title: string, dates: string) => {
    ensure(46 * K);
    let dateWidth = 0;
    if (dates) {
      font('normal', 8.5);
      dateWidth = doc.getTextWidth(pdfText(dates)) + 14;
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(pdfText(dates), pageWidth - MARGIN, y, { align: 'right' });
    }
    font('bold', 10.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    const titleWidth = Math.max(contentWidth - dateWidth, 140);
    const titleLines = doc.splitTextToSize(pdfText(title), titleWidth) as string[];
    doc.text(titleLines[0] || '', MARGIN, y);
    y += 13 * K;
    titleLines.slice(1).forEach((line) => {
      ensure(13 * K);
      doc.text(line, MARGIN, y);
      y += 13 * K;
    });
  };

  const bullet = (text: string, indent = 16) => {
    font('normal', 9.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.setFillColor(INK[0], INK[1], INK[2]);
    const lines = doc.splitTextToSize(pdfText(text), contentWidth - indent) as string[];
    lines.forEach((line, index) => {
      ensure(12.5 * K);
      if (index === 0) doc.circle(MARGIN + 4, y - 3 * K, 1.1, 'F');
      doc.text(line, MARGIN + indent, y);
      y += 12.5 * K;
    });
    y += 1;
  };

  const certificationTable = (rows: ResumeState['certifications']) => {
    const fractions = [0.44, 0.26, 0.15, 0.15];
    const gap = 10;
    const widths = fractions.map((fraction) => fraction * contentWidth);
    const xs: number[] = [];
    widths.reduce((x, width, index) => {
      xs[index] = x;
      return x + width;
    }, MARGIN);
    const line = 11.5 * K;

    const header = () => {
      font('bold', 7.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.setCharSpace(0.8);
      ['CERTIFICATION', 'ISSUER', 'ISSUED', 'EXPIRES'].forEach((label, index) => doc.text(label, xs[index], y));
      doc.setCharSpace(0);
      y += 5;
      rule(MARGIN, pageWidth - MARGIN, y, 0.6);
      y += 13 * K;
    };

    ensure(24 + line * 2 + 12);
    header();

    rows.forEach((item, index) => {
      font('bold', 9);
      const name = doc.splitTextToSize(pdfText(item.name), widths[0] - gap) as string[];
      font('normal', 9);
      const issuer = doc.splitTextToSize(pdfText(item.issuer), widths[1] - gap) as string[];
      const issued = doc.splitTextToSize(pdfText(item.date), widths[2] - gap) as string[];
      const expires = doc.splitTextToSize(pdfText(item.expires), widths[3]) as string[];
      const count = Math.max(1, name.length, issuer.length, issued.length, expires.length);
      const height = count * line + 9;

      if (y + height > bottom) {
        doc.addPage();
        y = MARGIN;
        header();
      }

      font('bold', 9);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      name.forEach((text, i) => doc.text(text, xs[0], y + i * line));

      font('normal', 9);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      issuer.forEach((text, i) => doc.text(text, xs[1], y + i * line));
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      issued.forEach((text, i) => doc.text(text, xs[2], y + i * line));
      expires.forEach((text, i) => doc.text(text, xs[3], y + i * line));

      const rowBottom = y + (count - 1) * line + 5;
      if (index < rows.length - 1) rule(MARGIN, pageWidth - MARGIN, rowBottom, 0.5, true);
      y = rowBottom + 11 * K;
    });
    y += 4;
  };

  const p = state.profile;
  const s = state.settings;

  /* The portrait belongs in the header of the markets that expect one, and the header
     text is narrowed so nothing ever runs under it. The size comes from the image itself,
     so a tall or wide portrait keeps its proportions instead of being stretched. */
  const photo = visiblePhoto(state);
  let headerWidth = contentWidth;
  let photoHeight = 0;
  if (photo) {
    let w = PHOTO_BOX;
    let h = PHOTO_BOX;
    try {
      const props = doc.getImageProperties(photo);
      if (props && props.width && props.height) {
        const scale = PHOTO_BOX / Math.max(props.width, props.height);
        w = props.width * scale;
        h = props.height * scale;
      }
    } catch (error) {
      /* A portrait the library cannot measure is still drawn, as a square. */
    }
    try {
      doc.addImage(photo, /^data:image\/jpe?g/i.test(photo) ? 'JPEG' : 'PNG', pageWidth - MARGIN - w, MARGIN, w, h);
      headerWidth = Math.max(contentWidth - w - 20, MIN_HEADER);
      photoHeight = h;
    } catch (error) {
      headerWidth = contentWidth;
    }
  }

  if (p.name) {
    font('bold', 22);
    doc.setTextColor(NAME[0], NAME[1], NAME[2]);
    const nameLines = doc.splitTextToSize(pdfText(p.name), headerWidth) as string[];
    nameLines.forEach((line) => {
      ensure(26 * K);
      doc.text(line, MARGIN, y);
      y += 26 * K;
    });
    y += 2;
  }

  if (p.headline) paragraph(p.headline, 11, 'normal', HEADLINE, 4, headerWidth);

  const contact = [p.email, p.phone, p.location, p.website, p.linkedin].filter(Boolean).join('  |  ');
  if (contact) paragraph(contact, 8.5, 'normal', MUTED, 6, headerWidth);

  /* Below the portrait, so the summary never starts in the space it occupies. */
  if (photoHeight) y = Math.max(y, MARGIN + photoHeight + 10);

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
      y += 5 * K;
    });
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (s.sections.education && schools.length) {
    section('Education');
    schools.forEach((item) => {
      const degree = [item.degree, item.field].filter(Boolean).join(', ');
      const title = degree || item.school || 'Study';
      entryHead(title, dateRange(item));
      const place = (degree && item.school ? [item.school, item.location] : [item.location])
        .filter(Boolean)
        .join('  |  ');
      if (place) paragraph(place, 9, 'italic', MUTED, 3);
      splitLines(item.details).forEach((line) => bullet(line));
      y += 5 * K;
    });
  }

  const certs = state.certifications.filter((item) => item.name);
  if (s.sections.certifications && certs.length) {
    section('Certifications');
    certificationTable(certs);
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    section('Projects');
    projects.forEach((item) => {
      entryHead(item.name, '');
      if (item.description) paragraph(item.description, 9, 'italic', MUTED, 2);
      const tech = splitList(item.tech);
      if (tech.length) paragraph(tech.join('  |  '), 8.5, 'italic', MUTED, 3);
      if (item.link) paragraph(item.link, 8.5, 'normal', MUTED, 3);
      y += 5 * K;
    });
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (s.sections.skills && skills.length) {
    section('Skills');

    let widest = 96;
    skills.forEach((item) => {
      font('bold', 9.5);
      widest = Math.max(widest, doc.getTextWidth(pdfText(item.label || 'Skills') + ':') + 14);
    });
    const column = Math.min(widest, contentWidth * 0.42);

    skills.forEach((item) => {
      const label = pdfText(item.label || 'Skills') + ':';
      font('bold', 9.5);
      const labelWidth = doc.getTextWidth(label);
      const indent = column;
      font('normal', 9.5);
      const valueLines = doc.splitTextToSize(pdfText(item.items), contentWidth - indent) as string[];
      const ownLine = labelWidth + 10 > indent;
      const row = 12.5 * K;
      const height = row * (ownLine ? 1 + valueLines.length : Math.max(1, valueLines.length));

      ensure(height + 6);

      font('bold', 9.5);
      doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.text(label, MARGIN, y);

      font('normal', 9.5);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      if (ownLine) {
        y += row;
        valueLines.forEach((line) => {
          ensure(row);
          doc.text(line, MARGIN + 12, y);
          y += row;
        });
      } else {
        valueLines.forEach((line, index) => {
          doc.text(line, MARGIN + indent, y + index * row);
        });
        y += row * Math.max(1, valueLines.length);
      }
      y += 2;
    });
  }

  doc.setProperties({
    title: ascii((p.name || 'Resume') + ' - Resume'),
    subject: pdfText(p.headline || ''),
    creator: 'GMO Resume Manager',
    keywords: DATA_MARKER + ':' + encodeSnapshot(state)
  });

  return doc.output('blob');
}
