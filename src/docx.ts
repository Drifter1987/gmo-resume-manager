import { DATA_MARKER, encodeSnapshot } from './data';
import { docxHex, paletteFor } from './palette';
import type { Palette } from './palette';
import type { ResumeState } from './types';
import { dateRange, escXml, splitLines, splitList } from './util';
import { createZip, type ZipEntry } from './zip';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string;
}

interface ParaOptions {
  after?: number;
  indent?: number;
  keepNext?: boolean;
}

/** Strips characters XML 1.0 cannot carry; everything else (dashes, accents, symbols) is kept. */
function xmlSafe(value: string): string {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function buildDocx(state: ResumeState): Blob {
  const pal: Palette = paletteFor(state);
  const face = state.settings.font === 'serif' ? 'Georgia' : 'Calibri';
  const K = state.settings.density === 'compact' ? 0.85 : 1;
  const col = (hex: string) => docxHex(hex);

  const runXml = (run: Run): string => {
    const props: string[] = [`<w:rFonts w:ascii="${face}" w:hAnsi="${face}" w:cs="${face}"/>`];
    if (run.bold) props.push('<w:b/><w:bCs/>');
    if (run.italic) props.push('<w:i/><w:iCs/>');
    props.push(`<w:color w:val="${run.color || col(pal.text)}"/>`);
    if (run.size) props.push(`<w:sz w:val="${Math.round(run.size * 2)}"/><w:szCs w:val="${Math.round(run.size * 2)}"/>`);
    const text = escXml(xmlSafe(run.text)).replace(/\n/g, '</w:t></w:r><w:r><w:br/><w:t xml:space="preserve">');
    return `<w:r><w:rPr>${props.join('')}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
  };

  const paragraph = (runs: Run[], options: ParaOptions = {}): string => {
    const props: string[] = [];
    if (options.keepNext) props.push('<w:keepNext/>');
    props.push(`<w:spacing w:after="${Math.round((options.after ?? 60) * K)}" w:line="276" w:lineRule="auto"/>`);
    if (options.indent) props.push(`<w:ind w:left="${options.indent}" w:hanging="180"/>`);
    return `<w:p><w:pPr>${props.join('')}</w:pPr>${runs.map(runXml).join('')}</w:p>`;
  };

  const textParagraph = (text: string, options: ParaOptions & Run = {}): string => {
    const run: Run = { text, bold: options.bold, italic: options.italic, size: options.size, color: options.color };
    return paragraph([run], options);
  };

  const heading = (text: string): string =>
    paragraph([{ text: text.toUpperCase(), bold: true, size: 9, color: col(pal.accent) }], {
      after: 90,
      keepNext: true
    });

  const MUTED = col(pal.muted);
  const border = col(pal.rule);

  const cell = (width: number, runs: Run[], last = false, header = false): string => {
    const edge = header
      ? `<w:bottom w:val="single" w:sz="6" w:space="0" w:color="${border}"/>`
      : `<w:bottom w:val="dotted" w:sz="4" w:space="0" w:color="${border}"/>`;
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcBorders>${edge}</w:tcBorders><w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="${last ? 0 : 120}" w:type="dxa"/></w:tcMar></w:tcPr>${paragraph(runs, { after: 0 })}</w:tc>`;
  };

  const certificationTable = (rows: ResumeState['certifications']): string => {
    const widths = [4240, 2506, 1446, 1446];
    const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
    const head = ['CERTIFICATION', 'ISSUER', 'ISSUED', 'EXPIRES']
      .map((label, index) =>
        cell(widths[index], [{ text: label, bold: true, size: 7.5, color: MUTED }], index === 3, true)
      )
      .join('');
    const body = rows
      .map((item) => {
        const cells = [
          cell(widths[0], [{ text: item.name, bold: true, size: 9 }]),
          cell(widths[1], [{ text: item.issuer, size: 9 }]),
          cell(widths[2], [{ text: item.date, size: 9, color: MUTED }]),
          cell(widths[3], [{ text: item.expires, size: 9, color: MUTED }], true)
        ];
        return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`;
      })
      .join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${head}</w:tr>${body}</w:tbl>`;
  };

  const blocks: string[] = [];
  const p = state.profile;
  const s = state.settings;

  if (p.name) blocks.push(textParagraph(p.name, { bold: true, size: 22, after: 40, color: col(pal.name) }));
  if (p.headline) blocks.push(textParagraph(p.headline, { size: 11, color: col(pal.headline), after: 40 }));

  const contact = [p.email, p.phone, p.location, p.website, p.linkedin].filter(Boolean).join('  |  ');
  if (contact) blocks.push(textParagraph(contact, { size: 9, color: MUTED, after: 120 }));

  if (s.showSummary && p.summary.trim()) {
    blocks.push(textParagraph(p.summary.trim(), { size: 10, after: 160 }));
  }

  const roles = state.experience.filter((item) => item.role || item.company);
  if (s.sections.experience && roles.length) {
    blocks.push(heading('Experience'));
    roles.forEach((item) => {
      const dates = dateRange(item);
      blocks.push(
        paragraph(
          [
            { text: item.role || 'Role', bold: true, size: 10.5 },
            ...(dates ? [{ text: '   ' + dates, size: 8.5, color: MUTED }] : [])
          ],
          { after: 30, keepNext: true }
        )
      );
      const place = [item.company, item.location].filter(Boolean).join('  |  ');
      if (place) blocks.push(textParagraph(place, { italic: true, size: 9, color: MUTED, after: 40 }));
      splitLines(item.highlights).forEach((line) =>
        blocks.push(textParagraph('•  ' + line, { size: 9.5, indent: 340, after: 30 }))
      );
      const tags = splitList(item.tags);
      if (s.showTags && tags.length) {
        blocks.push(textParagraph(tags.join('  |  '), { italic: true, size: 8.5, color: MUTED, after: 120 }));
      } else {
        blocks.push(textParagraph('', { size: 6, after: 100 }));
      }
    });
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (s.sections.education && schools.length) {
    blocks.push(heading('Education'));
    schools.forEach((item) => {
      const degree = [item.degree, item.field].filter(Boolean).join(', ');
      const title = degree || item.school || 'Study';
      const dates = dateRange(item);
      blocks.push(
        paragraph(
          [
            { text: title, bold: true, size: 10.5 },
            ...(dates ? [{ text: '   ' + dates, size: 8.5, color: MUTED }] : [])
          ],
          { after: 30, keepNext: true }
        )
      );
      const place = (degree && item.school ? [item.school, item.location] : [item.location])
        .filter(Boolean)
        .join('  |  ');
      if (place) blocks.push(textParagraph(place, { italic: true, size: 9, color: MUTED, after: 40 }));
      splitLines(item.details).forEach((line) =>
        blocks.push(textParagraph('•  ' + line, { size: 9.5, indent: 340, after: 30 }))
      );
      blocks.push(textParagraph('', { size: 6, after: 100 }));
    });
  }

  const certs = state.certifications.filter((item) => item.name);
  if (s.sections.certifications && certs.length) {
    blocks.push(heading('Certifications'));
    blocks.push(certificationTable(certs));
    blocks.push(textParagraph('', { size: 6, after: 100 }));
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    blocks.push(heading('Projects'));
    projects.forEach((item) => {
      blocks.push(paragraph([{ text: item.name, bold: true, size: 10.5 }], { after: 30, keepNext: true }));
      if (item.description) blocks.push(textParagraph(item.description, { italic: true, size: 9, color: MUTED, after: 30 }));
      const tech = splitList(item.tech);
      if (tech.length) blocks.push(textParagraph(tech.join('  |  '), { italic: true, size: 8.5, color: MUTED, after: 30 }));
      if (item.link) blocks.push(textParagraph(item.link, { size: 8.5, color: MUTED, after: 30 }));
      blocks.push(textParagraph('', { size: 6, after: 100 }));
    });
  }

  const skills = state.skills.filter((item) => item.label || item.items);
  if (s.sections.skills && skills.length) {
    blocks.push(heading('Skills'));
    skills.forEach((item) => {
      blocks.push(
        paragraph(
          [
            { text: (item.label || 'Skills') + ': ', bold: true, size: 9.5, color: col(pal.accent) },
            { text: item.items, size: 9.5 }
          ],
          { after: 40 }
        )
      );
    });
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}"><w:body>${blocks.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

  // The full data snapshot rides in the document description so a DOCX can be imported back exactly.
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXml(xmlSafe(p.name || 'Resume'))}</dc:title><dc:creator>GMO Resume Manager</dc:creator><dc:description>${DATA_MARKER}:${encodeSnapshot(state)}</dc:description></cp:coreProperties>`;

  const encoder = new TextEncoder();
  const files: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rels) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
    { name: 'docProps/core.xml', data: encoder.encode(core) }
  ];

  return new Blob([createZip(files)], { type: DOCX_MIME });
}
