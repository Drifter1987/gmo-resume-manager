import type { ResumeState } from './types';
import { fromBase64, toBase64 } from './util';
import { APP_VERSION } from './version';

export const SCHEMA_VERSION = 2;
export const DATA_MARKER = 'gmo-resume-data';

export interface Snapshot {
  app: 'gmo-resume-manager';
  schema: number;
  version: string;
  exportedAt: string;
  data: ResumeState;
}

export function snapshot(state: ResumeState): Snapshot {
  return {
    app: 'gmo-resume-manager',
    schema: SCHEMA_VERSION,
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: state
  };
}

/** Base64 payload carried inside Markdown and TXT exports so they round-trip exactly. */
export function encodeSnapshot(state: ResumeState): string {
  return toBase64(JSON.stringify(snapshot(state)));
}

export function decodeSnapshot(raw: string): unknown | null {
  try {
    const parsed = JSON.parse(fromBase64(String(raw).replace(/\s+/g, ''))) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.data && typeof parsed.data === 'object') return parsed.data;
    return parsed;
  } catch (error) {
    return null;
  }
}

export function wrapPayload(payload: string, width = 76): string[] {
  const lines: string[] = [];
  for (let i = 0; i < payload.length; i += width) lines.push(payload.slice(i, i + width));
  return lines;
}
