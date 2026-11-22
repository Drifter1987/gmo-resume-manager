/**
 * Context-aware reading of free text.
 *
 * A word match is not evidence. "Open to relocation" is not a nationality, "single-page
 * application" is not a marital status, and "citizen developer" is not a passport. Every
 * check that used to look for a bare word now asks this module whether a detail is really
 * *stated*, and gets back the exact words that triggered it so the finding can quote them.
 */

export type DetailKind = 'nationality' | 'workAuth' | 'birth' | 'marital' | 'availability' | 'references';

export interface DetailHit {
  kind: DetailKind;
  /** The matched words, trimmed, so a finding can quote the evidence. */
  phrase: string;
}

/**
 * Phrases that contain a trigger word but mean something else. They are blanked out
 * before any pattern runs, so they can never produce a finding.
 */
const FALSE_FRIENDS: RegExp[] = [
  /\bcitizen (?:developers?|science|scientists?|journalism|media|participation|engagement)\b/gi,
  /\b(?:corporate|digital|global|active|responsible|good|model|private) citizen\b/gi,
  /\bcitizen of the world\b/gi,
  /\bsingle[- ](?:page|sign|source|point|team|platform|system|tenant|thread|handedly|market)\b/gi,
  /\breference (?:architecture|implementation|design|model|data|point|guide|document)\b/gi,
  /\bborn[- ](?:digital|global|free)\b/gi,
  /\bvisa[- ]free\b/gi
];

const PHRASE_LIMIT = 52;

/** Nationality is stated as a key, or as a nationality adjective with national/citizen/holder. */
const NATIONALITY_STATED: RegExp[] = [
  /\b(?:nationality|citizenship)\s*(?:[:—–-]|\bis\b)\s*([\w'’.-]+(?:\s+[\w'’.-]+){0,2})/i,
  /\b((?:[A-Z][a-z]{2,})(?:\s+[A-Z][a-z]{2,})?)\s+(?:national|citizen|passport holder)\b/g,
  /\bcitizen of\s+([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+)?)/g,
  /\bholder of (?:a|an)\s+([A-Z][\w'’.-]+)\s+passport\b/g,
  /\bdual\s+(?:nationality|citizenship)\b/i
];

/** Work authorisation is stated as a status, a permit, a visa or an explicit sponsorship line. */
const WORK_AUTH_STATED: RegExp[] = [
  /\b(?:work authori[sz]ation|right to work|work permit|employment pass|eligibility to work)\b\s*(?:[:—–-]\s*)?([\w'’ /-]{0,32})/i,
  /\b(?:valid|transferable|current|active)\s+(?:residen(?:t|cy)|visa|iqama|permit)\b/i,
  /\b(?:uae|saudi|qatari|kuwaiti|bahraini|omani|german|eu|uk|us)\s+(?:residen(?:t|cy)|visa|iqama|work permit)\b/i,
  /\b(?:requires?|needs?|no|without)\s+(?:visa\s+)?sponsorship\b/i,
  /\bvisa\s+(?:status|type|required)\b/i,
  /\b(?:residen(?:t|cy)|iqama)\s+(?:visa|permit|status)\b/i
];

const BIRTH_STATED: RegExp[] = [
  /\b(?:date of birth|birth date|d\.?\s?o\.?\s?b\.?)\b\s*(?:[:—–-]\s*)?([\w'’,./ -]{0,24})/i,
  /\bborn\s+(?:on|in)\s+[\w'’,./ -]{2,24}/i
];

/** "single" alone is too common in technical writing, so it needs a marital frame. */
const MARITAL_STATED: RegExp[] = [
  /\bmarital status\b\s*(?:[:—–-]\s*)?([\w'’ -]{0,24})/i,
  /\b(?:married|divorced|widowed|separated)\b/i,
  /\bsingle\b(?=\s*(?:[,.;)]|$))/i
];

const AVAILABILITY_STATED: RegExp[] = [
  /\b(?:available|availability)\s+(?:from|immediately|on|to start|date)\b/i,
  /\bnotice period\b/i,
  /\bstart(?:ing)? date\b/i
];

const REFERENCES_STATED: RegExp[] = [
  /\b(?:references?|referees?)\b/i,
  /\bon request\b/i,
  /\bavailable on request\b/i,
  /\bnotice period\b/i
];

function clean(text: string): string {
  let out = String(text || '');
  FALSE_FRIENDS.forEach((pattern) => {
    out = out.replace(pattern, ' ');
  });
  return out;
}

function firstPhrase(text: string, patterns: RegExp[]): string {
  for (let index = 0; index < patterns.length; index += 1) {
    const pattern = patterns[index];
    const flags = pattern.flags.indexOf('g') === -1 ? pattern.flags + 'g' : pattern.flags;
    const scanner = new RegExp(pattern.source, flags);
    const found = scanner.exec(text);
    if (!found) continue;
    const raw = String(found[0] || '')
      .replace(/\s+/g, ' ')
      .trim();
    return raw.length > PHRASE_LIMIT ? raw.slice(0, PHRASE_LIMIT - 1).trim() + '…' : raw;
  }
  return '';
}

/** Every detail the text actually states, with the words that prove it. */
export function statedDetails(text: string): DetailHit[] {
  const source = clean(text);
  if (!source.trim()) return [];

  const hits: DetailHit[] = [];
  const add = (kind: DetailKind, phrase: string) => {
    if (!phrase) return;
    if (hits.some((hit) => hit.kind === kind)) return;
    hits.push({ kind, phrase });
  };

  add('nationality', firstPhrase(source, NATIONALITY_STATED));
  add('workAuth', firstPhrase(source, WORK_AUTH_STATED));
  add('birth', firstPhrase(source, BIRTH_STATED));
  add('marital', firstPhrase(source, MARITAL_STATED));
  add('availability', firstPhrase(source, AVAILABILITY_STATED));
  add('references', firstPhrase(source, REFERENCES_STATED));
  return hits;
}

/** The quoted words for one kind of detail, or an empty string when none is stated. */
export function detailPhrase(text: string, kind: DetailKind): string {
  const hit = statedDetails(text).find((item) => item.kind === kind);
  return hit ? hit.phrase : '';
}

export function hasDetail(text: string, kind: DetailKind): boolean {
  return Boolean(detailPhrase(text, kind));
}
