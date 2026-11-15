import type { ResumeState } from './types';

/** Colours the resume is drawn with. One source of truth for the PDF, DOCX and PNG writers. */
export interface Palette {
  mode: 'color' | 'bw';
  name: string;
  headline: string;
  text: string;
  muted: string;
  accent: string;
  rule: string;
  /** Page background for PNG pages. */
  paper: string;
}

const COLOR: Palette = {
  mode: 'color',
  name: '#10231a',
  headline: '#7a4c00',
  text: '#1a1c18',
  muted: '#5a6257',
  accent: '#9a5b00',
  rule: '#d9d5c6',
  paper: '#f6f3e9'
};

const BW: Palette = {
  mode: 'bw',
  name: '#000000',
  headline: '#000000',
  text: '#000000',
  muted: '#000000',
  accent: '#000000',
  rule: '#000000',
  paper: '#ffffff'
};

export function paletteFor(state: ResumeState): Palette {
  return state.settings && state.settings.colorMode === 'bw' ? BW : COLOR;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

/** Word wants six upper-case hex digits and no leading #. */
export function docxHex(hex: string): string {
  return hex.replace('#', '').toUpperCase();
}
