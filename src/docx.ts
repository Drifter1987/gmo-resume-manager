import type { ResumeState } from './types';
import { ascii, dateRange, escXml, splitLines, splitList } from './util';
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

function runXml(run: Run): string {
  const props: string[] = [];
  if (run.bold) props.push('<w:b/><w:bCs/>');
  if (run.italic) props.push('<w:i/><w:iCs/>');
  if (run.color) props.push(`<w:color w:val="${run.color}"/>`);
  if (run.size) props.push(`<w:sz w:val="${Math.round(run.size * 2)}"/><w:szCs w:val="${Math.round(run.size * 2)}"/>`);

  const text = escXml(ascii(run.text)).replace(/\n/g, '</w:t></w:r><w:r><w:br/><w:t xml:space="preserve">');
  return `<w:r>${props.length ? `<w:rPr>${props.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function paragraph(runs: Run[], options: ParaOptions = {}): string {
  const props: string[] = [];
  if (options.keepNext) props.push('<w:keepNext/>');
  props.push(`<w:spacing w:after="${options.after ?? 60}" w:line="276" w:lineRule="auto"/>`);
  if (options.indent) props.push(`<w:ind w:left="${options.indent}" w:hanging="180"/>`);
  return `<w:p><w:pPr>${props.join('')}</w:pPr>${runs.map(runXml).join('')}</w:p>`;
}

function textParagraph(text: string, options: ParaOptions & Run = {}): string {
  const run: Run = { text, bold: options.bold, italic: options.italic, size: options.size, color: options.color };
  return paragraph([run], options);
}

function heading(text: string): string {
  return paragraph([{ text: text.toUpperCase(), bold: true, size: 9, color: '9A5B00' }], {
    after: 90,
    keepNext: true
  });
}

export function buildDocx(state: ResumeState): Blob {
  const blocks: string[] = [];
  const p = state.profile;
  const s = state.settings;

  if (p.name) blocks.push(textParagraph(p.name, { bold: true, size: 22, after: 40 }));
  if (p.headline) blocks.push(textParagraph(p.headline, { size: 11, color: '7A4C00', after: 40 }));

  const contact = [p.email, p.phone, p.location, p.website, p.linkedin].filter(Boolean).join('  |  ');
  if (contact) blocks.push(textParagraph(contact, { size: 9, color: '5A6257', after: 120 }));

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
            ...(dates ? [{ text: '   ' + dates, size: 8.5, color: '5A6257' }] : [])
          ],
          { after: 30, keepNext: true }
        )
      );
      const place = [item.company, item.location].filter(Boolean).join('  |  ');
      if (place) blocks.push(textParagraph(place, { italic: true, size: 9, color: '5A6257', after: 40 }));
      splitLines(item.highlights).forEach((line) =>
        blocks.push(textParagraph('• ' + line, { size: 9.5, indent: 340, after: 30 }))
      );
      const tags = splitList(item.tags);
      if (s.showTags && tags.length) {
        blocks.push(textParagraph(tags.join('  |  '), { italic: true, size: 8.5, color: '5A6257', after: 120 }));
      } else {
        blocks.push(textParagraph('', { size: 6, after: 100 }));
      }
    });
  }

  const schools = state.education.filter((item) => item.school || item.degree);
  if (s.sections.education && schools.length) {
    blocks.push(heading('Education'));
    schools.forEach((item) => {
      const title = [item.degree, item.field].filter(Boolean).join(', ') || item.school;
      const dates = dateRange(item);
      blocks.push(
        paragraph(
          [
            { text: title, bold: true, size: 10.5 },
            ...(dates ? [{ text: '   ' + dates, size: 8.5, color: '5A6257' }] : [])
          ],
          { after: 30, keepNext: true }
        )
      );
      const place = [item.school, item.location].filter(Boolean).join('  |  ');
      if (place) blocks.push(textParagraph(place, { italic: true, size: 9, color: '5A6257', after: 40 }));
      splitLines(item.details).forEach((line) =>
        blocks.push(textParagraph('• ' + line, { size: 9.5, indent: 340, after: 30 }))
      );
      blocks.push(textParagraph('', { size: 6, after: 100 }));
    });
  }

  const certs = state.certifications.filter((item) => item.name);
  if (s.sections.certifications && certs.length) {
    blocks.push(heading('Certifications'));
    certs.forEach((item) => {
      blocks.push(
        paragraph(
          [
            { text: item.name, bold: true, size: 10 },
            ...(item.date ? [{ text: '   ' + item.date, size: 8.5, color: '5A6257' }] : [])
          ],
          { after: 20, keepNext: true }
        )
      );
      const meta = [item.issuer, item.expires ? 'expires ' + item.expires : ''].filter(Boolean).join('  |  ');
      blocks.push(textParagraph(meta, { italic: true, size: 8.5, color: '5A6257', after: 80 }));
    });
  }

  const projects = state.projects.filter((item) => item.name);
  if (s.sections.projects && projects.length) {
    blocks.push(heading('Projects'));
    projects.forEach((item) => {
      blocks.push(paragraph([{ text: item.name, bold: true, size: 10.5 }], { after: 30, keepNext: true }));
      if (item.link) blocks.push(textParagraph(item.link, { italic: true, size: 8.5, color: '5A6257', after: 30 }));
      if (item.description) blocks.push(textParagraph(item.description, { size: 9.5, after: 30 }));
      const tech = splitList(item.tech);
      if (tech.length) blocks.push(textParagraph(tech.join('  |  '), { italic: true, size: 8.5, color: '5A6257', after: 100 }));
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
            { text: (item.label || 'Skills') + ': ', bold: true, size: 9.5 },
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
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const encoder = new TextEncoder();
  const files: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rels) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) }
  ];

  return new Blob([createZip(files)], { type: DOCX_MIME });
}
