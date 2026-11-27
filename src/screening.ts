import type { RegionContent, RegionId, ResumeState } from './types';
import { splitLines, splitList } from './util';
import { missingRequiredFields, regionFields, visibleValue } from './fields';
import { statedDetails, hasDetail } from './context';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface Finding {
  status: CheckStatus;
  text: string;
  /** Anchor inside the resume preview (a data-r-anchor value): tapping the finding scrolls there and flashes it. */
  target?: string;
  /** A button offered beside the finding, run by the app's own action handler. */
  action?: { label: string; id: string };
}

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  score: number;
  summary: string;
  /** The published standard this check applies, in one line. Shown on the card. */
  standard?: string;
  findings: Finding[];
}

/**
 * The published sources this app's rules come from, rewritten as rules it applies.
 * Researched November 2026: ATS vendor and industry statistics, the Ladders
 * eye-tracking study, the Sackett meta-analysis, US OPM and Google re:Work on
 * structured interviewing, NACE on skills-based hiring, and the AI hiring laws.
 */
/**
 * How much weight a source's numbers deserve, shown beside it in the guide.
 * Vendor pipeline statistics are not audited samples, and the app says so rather
 * than presenting every figure as settled fact.
 */
export type EvidenceKind =
  | 'Peer-reviewed'
  | 'Government guidance'
  | 'Industry study'
  | 'Vendor guidance'
  | 'Vendor data'
  | 'Regulation';

export interface MethodSource {
  id: string;
  name: string;
  publisher: string;
  url: string;
  evidence: EvidenceKind;
  /** What the source says, close to its own wording. */
  claim: string;
  /** The rule this app applies because of it. */
  rule: string;
}

export const METHOD_SOURCES: MethodSource[] = [
  {
    id: 'jobscan',
    name: 'ATS match rate',
    publisher: 'Jobscan',
    url: 'https://www.jobscan.co/resume-scanner',
    evidence: 'Vendor guidance',
    claim:
      'Recommends aiming for a match rate of at least 75%, and says plainly that the rate is a Jobscan visualisation, not a score an employer’s ATS assigns.',
    rule: 'The Rubric check passes at 75% coverage, warns from 65%, and fails below that.'
  },
  {
    id: 'atsstats',
    name: 'ATS statistics',
    publisher: 'Coversentry (2026), compiling EDLIGO and Jobscan',
    url: 'https://www.coversentry.com/ats-statistics',
    evidence: 'Vendor data',
    claim:
      'Compiles EDLIGO’s 2025 analysis of 1,000 rejected resumes — 23% parsing errors, and 43% of rejections unrelated to qualifications — with Jobscan’s 2025 survey of 384 recruiters, where measurable achievements rank first at 58.2% and a tailored resume second at 55.3%.',
    rule: 'ATS parsing and quantified achievements carry the heaviest weight, and the ATS check asks for the job title in the headline.'
  },
  {
    id: 'ladders',
    name: 'Eye-tracking study',
    publisher: 'Ladders (2018), with a note on the replication',
    url: 'https://www.theladders.com/static/images/basicSite/pdfs/TheLadders-EyeTracking-StudyC2.pdf',
    evidence: 'Industry study',
    claim:
      'Recruiters give the first screen of a resume about 7.4 seconds, up from six seconds in 2012, and look at the top of the first page first. The sample was small — 30 recruiters — and a 2024 replication (n=114) found longer total reading time while confirming the top-of-page-first pattern.',
    rule: 'The skim check reads only the headline, the summary and the newest role, because that is the part read first.'
  },
  {
    id: 'sackett',
    name: 'Interview validity',
    publisher: 'Sackett, Zhang, Berry and Lievens (2022), Journal of Applied Psychology 107(11)',
    url: 'https://doi.org/10.1037/apl0000994',
    evidence: 'Peer-reviewed',
    claim:
      'Structured interviews predict job performance at .42 against .19 for unstructured ones, the highest mean validity of any common selection method — with a wide spread, so treat .42 as a mean rather than a fixed value.',
    rule: 'Every role needs at least two evidence-led bullets, so each one can survive STAR probing.'
  },
  {
    id: 'opm',
    name: 'Structured interview rubric',
    publisher: 'US Office of Personnel Management',
    url: 'https://www.opm.gov/policy-data-oversight/assessment-and-selection/other-assessment-methods/structured-interviews/',
    evidence: 'Government guidance',
    claim: 'Anchored rubrics with at least three, ideally five to seven, proficiency levels raise reliability, rater agreement and validity.',
    rule: 'The Structured interview check scores each role by the depth of evidence it offers, not by its title.'
  },
  {
    id: 'google',
    name: 'Structured interviewing',
    publisher: 'Google re:Work',
    url: 'https://rework.withgoogle.com/intl/en/guides/a-guide-to-structured-interviewing-for-better-hiring-practices',
    evidence: 'Industry study',
    claim: 'Standardised rubrics raise predictive validity and reduce differences between demographic groups.',
    rule: 'The same criteria apply in every market; only the weights change, and every weight is published in the guide.'
  },
  {
    id: 'nace',
    name: 'Skills-based hiring',
    publisher: 'NACE Job Outlook 2026',
    url: 'https://www.naceweb.org/research/reports/job-outlook/2026/',
    evidence: 'Industry study',
    claim:
      'Published in November 2025 for the Class of 2026: almost 70% of employers say they use skills-based hiring, up over the last year, and employers name examples of skills used to solve problems as the best way to show them.',
    rule: 'Skills and demonstrated outcomes outweigh credentials, and education is not weighted above experience.'
  },
  {
    id: 'resumego',
    name: 'Resume length',
    publisher: 'ResumeGo study, reported by ERE (2019)',
    url: 'https://www.ere.net/articles/one-or-two-page-resumes-best',
    evidence: 'Industry study',
    claim:
      'Recruiters were 2.3 times as likely to prefer a two-page resume. Later surveys point the same way rather than further: criteria’s 2025 report found about 53% of recruiters expect two pages, and another 2025 survey put two pages at 57% against 37% for one — so two pages is a preference, not a rule.',
    rule: 'Two pages is the default ceiling, and the selected market raises it to three where that is the norm.'
  },
  {
    id: 'nyc144',
    name: 'Automated hiring bias audit',
    publisher: 'NYC Local Law 144',
    url: 'https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page',
    evidence: 'Regulation',
    claim:
      'An automated employment decision tool needs an independent bias audit within the past year, a public summary of the results and notice to candidates at least ten business days before use; enforcement began on 5 July 2023.',
    rule: 'The blind-screening view shows what a redacted read looks like, and personal details are judged per market.'
  },
  {
    id: 'euai',
    name: 'AI Act, high-risk employment',
    publisher: 'European Commission',
    url: 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai',
    evidence: 'Regulation',
    claim:
      'AI used in recruitment and worker management — CV-sorting software is the Commission’s own example — is high-risk, and those obligations apply from 2 December 2027. The AI Omnibus that set that date entered into force on 27 July 2026, so the date is settled law rather than a proposal.',
    rule: 'Fields that act as proxies for protected traits are flagged in the markets that filter them out.'
  }
];

/**
 * What the research does not support. Kept beside the sources so the app never
 * repeats a figure the web has quietly retracted.
 */
export const STANDARDS_CAVEAT =
  'Two honesty notes, re-checked against the sources in this release. First, the widely repeated claim that 75% of resumes are rejected by an ATS before a human reads them has no published method behind it: it traces to Preptel, a vendor that shut down in August 2013, and a 2025 survey of 25 recruiters found 92% of the systems rank and sort without auto-rejecting on content at all. This app does not use that figure; what it uses is parser behaviour you can check against the live preview. Second, figures marked as vendor data describe one vendor’s own pipeline or a compilation of other vendors’ surveys rather than an audited sample, so they are treated as direction, not proof.';




export interface KeywordCoverage {
  matched: string[];
  missing: string[];
  ratio: number;
  stuffed: { term: string; count: number }[];
}

export interface ScreeningReport {
  score: number;
  checks: CheckResult[];
  coverage: KeywordCoverage;
  pages: number;
  bullets: number;
  quantified: number;
  totalYears: number;
  /** The anonymised resume, as a blind first pass would read it. */
  blindText: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function statusFor(score: number): CheckStatus {
  if (score >= 80) return 'pass';
  if (score >= 50) return 'warn';
  return 'fail';
}

interface Point {
  index: number;
  open: boolean;
}

/** Parses "Mar 2021", "03/2021", "2021" and "Present". Returns a month index. */
export function parseMonth(value: string | null | undefined): Point | null {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (/present|current|now|today|ongoing/.test(text)) {
    const now = new Date();
    return { index: now.getFullYear() * 12 + now.getMonth(), open: true };
  }

  const worded = text.match(/([a-z]{3,})\.?\s*,?\s*((?:19|20)\d{2})/);
  if (worded) {
    const month = MONTHS.indexOf(worded[1].slice(0, 3));
    if (month !== -1) return { index: Number(worded[2]) * 12 + month, open: false };
  }

  const numeric = text.match(/\b(\d{1,2})[/.-]((?:19|20)\d{2})\b/);
  if (numeric) {
    const month = Number(numeric[1]) - 1;
    if (month >= 0 && month <= 11) return { index: Number(numeric[2]) * 12 + month, open: false };
  }

  const year = text.match(/\b((?:19|20)\d{2})\b/);
  if (year) return { index: Number(year[1]) * 12, open: false };
  return null;
}

/** True for a period written as a year alone, such as "2016". */
export function isYearOnly(value: string | null | undefined): boolean {
  return /^\s*(?:19|20)\d{2}\s*$/.test(String(value || ''));
}

/**
 * The months a period covers. A bare year covers the whole year: as the end of a
 * degree "2016" means December 2016, which is why the end is extended by eleven
 * months here rather than in parseMonth, where a start of "2011" must stay January.
 */
export function monthSpan(forStart: string, forEnd: string): Interval | null {
  const start = parseMonth(forStart);
  const end = parseMonth(forEnd);
  if (!start || !end) return null;
  const endIndex = end.index + (isYearOnly(forEnd) ? 11 : 0);
  return { start: start.index, end: Math.max(start.index, endIndex) };
}

function resumeText(state: ResumeState): string {
  const parts: string[] = [];
  const p = state.profile;
  parts.push(p.name, p.headline, p.summary, p.location);
  state.experience.forEach((item) => {
    parts.push(item.role, item.company, item.location, item.highlights, item.tags);
  });
  state.education.forEach((item) => {
    parts.push(item.degree, item.field, item.school, item.details);
  });
  state.certifications.forEach((item) => {
    parts.push(item.name, item.issuer);
  });
  state.projects.forEach((item) => {
    parts.push(item.name, item.description, item.tech);
  });
  state.skills.forEach((item) => parts.push(item.label, item.items));
  return parts.filter(Boolean).join('\n');
}

function countTerm(text: string, term: string): number {
  const needle = term.toLowerCase().trim();
  if (!needle) return 0;
  const haystack = text.toLowerCase();
  if (needle.indexOf(' ') !== -1) {
    let count = 0;
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      count += 1;
      from = at + needle.length;
    }
    return count;
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = haystack.match(new RegExp('\\b' + escaped + '\\b', 'g'));
  return matches ? matches.length : 0;
}

export function keywordCoverage(state: ResumeState): KeywordCoverage {
  const terms = splitList((state.settings.keywords || '').replace(/[\n;]/g, ','));
  const text = resumeText(state);
  const matched: string[] = [];
  const missing: string[] = [];
  const stuffed: { term: string; count: number }[] = [];

  terms.forEach((term) => {
    const count = countTerm(text, term);
    if (count > 0) matched.push(term);
    else missing.push(term);
    if (count > 8) stuffed.push({ term, count });
  });

  return {
    matched,
    missing,
    ratio: terms.length ? matched.length / terms.length : 0,
    stuffed
  };
}

export interface Interval {
  start: number;
  end: number;
}

function experienceIntervals(state: ResumeState): { intervals: Interval[]; unknown: string[] } {
  const intervals: Interval[] = [];
  const unknown: string[] = [];

  state.experience.forEach((item) => {
    const start = parseMonth(item.start);
    const end = item.current ? parseMonth('present') : parseMonth(item.end);
    if (!start || !end) {
      unknown.push(item.role || item.company || 'Untitled role');
      return;
    }
    intervals.push({ start: start.index, end: Math.max(start.index, end.index) });
  });

  return { intervals, unknown };
}

/**
 * Study periods count as covered time in the timeline: a degree, a language course
 * or a preparation year explains a stretch without a role, and a recruiter does not
 * read it as a gap. Only entries with both years filled are used.
 */
function studyIntervals(state: ResumeState): Interval[] {
  const intervals: Interval[] = [];
  state.education.forEach((item) => {
    if (!item.start.trim() || !item.end.trim()) return;
    const span = monthSpan(item.start, item.end);
    if (span) intervals.push(span);
  });
  return intervals;
}

function overlapsStudy(study: Interval[], from: number, to: number): boolean {
  return study.some((item) => item.start <= to && from <= item.end);
}

function mergedInterval(intervals: Interval[]): { intervals: Interval[]; totalMonths: number } {
  if (!intervals.length) return { intervals: [], totalMonths: 0 };
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  // Copy the first interval before extending it: merging used to write back into the
  // caller's objects, so a later overlap count saw already-merged ranges and reported
  // overlaps between roles that only touch.
  const out: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = out[out.length - 1];
    if (sorted[i].start <= last.end) last.end = Math.max(last.end, sorted[i].end);
    else out.push({ ...sorted[i] });
  }
  const totalMonths = out.reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
  return { intervals: out, totalMonths };
}

/**
 * What each hiring market expects on a CV, from current published guidance:
 * page ranges, whether personal details belong on the page, the language levels
 * that get noticed, and how references are handled. Used by the length rule and by
 * the informational "Regional fit" card, which never affects the score.
 */
export interface RegionProfile {
  id: RegionId;
  label: string;
  pageRange: string;
  maxPages: number;
  personal: 'expected' | 'avoid' | 'mixed';
  personalNote: string;
  languageNote: string;
  languagePattern: RegExp;
  referencesNote: string;
  summary: string;
}

export const REGION_PROFILES: Record<RegionId, RegionProfile> = {
  emea: {
    id: 'emea',
    label: 'EMEA',
    pageRange: 'one to two pages',
    maxPages: 2,
    personal: 'mixed',
    personalNote:
      'Two pages with month-and-year dates. A photo and date of birth are still customary in Germany, Austria and Switzerland, and are avoided in the UK and Ireland.',
    languageNote: 'State language levels: English, plus German or French for local roles.',
    languagePattern: /english|german|french|deutsch|français|spanish/i,
    referencesNote: 'References are usually listed as available on request, not with contact details.',
    summary: 'European practice: two pages, exact dates, no unexplained gaps.'
  },
  us: {
    id: 'us',
    label: 'US',
    pageRange: 'one to two pages',
    maxPages: 2,
    personal: 'avoid',
    personalNote:
      'US resumes carry no photo, date of birth, nationality or marital status: anti-discrimination practice, and cleaner parsing.',
    languageNote: 'English is the working language; other languages are a bonus rather than a requirement.',
    languagePattern: /english/i,
    referencesNote: 'References are not listed on a US resume; they are requested later.',
    summary: 'US practice: one to two pages, quantified achievements, ATS keywords.'
  },
  gcc: {
    id: 'gcc',
    label: 'GCC',
    pageRange: 'two to three pages',
    maxPages: 3,
    personal: 'expected',
    personalNote:
      'Gulf CVs normally state nationality, visa or residency status, current location and availability; a professional photo is customary.',
    languageNote: 'State Arabic and English levels explicitly: Arabic can be a requirement in Saudi Arabia, English leads in the UAE private sector.',
    languagePattern: /arabic|english/i,
    referencesNote: 'Referees are often listed directly and can be contacted before an offer.',
    summary: 'Gulf practice: nationality, work authorisation and languages are screening data.'
  },
  apac: {
    id: 'apac',
    label: 'APAC',
    pageRange: 'two to three pages',
    maxPages: 3,
    personal: 'mixed',
    personalNote:
      'India and China often carry a photo and date of birth; Japan uses the fixed Rirekisho form with a photo. Singapore follows Western practice.',
    languageNote: 'State English plus any local language level; Indian employers expect detailed academic records.',
    languagePattern: /english|hindi|mandarin|chinese|japanese|korean|bahasa|tamil/i,
    referencesNote: 'References are usually on request, though some Indian employers still list them.',
    summary: 'APAC practice: detailed education, certifications and language levels.'
  },
  latam: {
    id: 'latam',
    label: 'LATAM',
    pageRange: 'two to three pages',
    maxPages: 3,
    personal: 'mixed',
    personalNote:
      'A photo and date of birth are common in Brazil, Mexico and Colombia; multinational employers expect the international standard instead.',
    languageNote: 'State Spanish or Portuguese as appropriate, plus documented English proficiency.',
    languagePattern: /spanish|portuguese|español|português|english/i,
    referencesNote: 'References are usually available on request.',
    summary: 'LATAM practice: two to three pages, language proficiency, personal tone.'
  },
  anz: {
    id: 'anz',
    label: 'ANZ',
    pageRange: 'two to three pages',
    maxPages: 3,
    personal: 'avoid',
    personalNote:
      'Australian and New Zealand CVs carry no photo, date of birth or nationality. Work authorisation is the exception worth stating.',
    languageNote: 'English, with STAR-format achievements and quantified outcomes.',
    languagePattern: /english/i,
    referencesNote: 'A named references page with two or three referees is expected, and referees may be contacted before an offer.',
    summary: 'ANZ practice: two to three pages, right-to-work status, named referees.'
  }
};

/* Free-text detection lives in context.ts, which reads what a CV states rather than the
   words that happen to appear in it. */

/**
 * The checklist a screener in each market works through, and the date convention
 * that market reads. Kept beside the profiles so the card and the AI prompt use the
 * same wording.
 */
const REGION_CHECKLISTS: Record<RegionId, { checklist: string[]; dateNote: string }> = {
  emea: {
    checklist: [
      'two pages at most, with month-and-year dates',
      'every employment gap accounted for',
      'language levels for the local market',
      'photo and date of birth are customary in DACH and avoided in the UK and Ireland'
    ],
    dateNote: 'Month and year on every role, so any gap can be read at a glance.'
  },
  us: {
    checklist: [
      'one to two pages',
      'no photo, date of birth, nationality or marital status',
      'a summary rather than an objective statement',
      'quantified bullets and the advert keywords in the posting’s own wording'
    ],
    dateNote: 'Month and year, or MM/YYYY.'
  },
  gcc: {
    checklist: [
      'two to three pages',
      'nationality, visa or residency status, current location and availability',
      'Arabic and English levels stated explicitly',
      'referees listed and contactable before an offer'
    ],
    dateNote: 'Month and year, with the duration of each role clear.'
  },
  apac: {
    checklist: [
      'two to three pages',
      'detailed education, grades and institutions',
      'certifications with issuer and date',
      'English plus any local language level'
    ],
    dateNote: 'Month and year; qualifications carry more weight than in the West.'
  },
  latam: {
    checklist: [
      'two to three pages',
      'language proficiency stated up front',
      'a more personal tone is accepted',
      'references on request'
    ],
    dateNote: 'Month and year, with the most recent role first.'
  },
  anz: {
    checklist: [
      'two to three pages',
      'no photo, date of birth or nationality, but right-to-work status is worth stating',
      'STAR-format achievements with outcomes',
      'two or three named referees, who may be contacted before an offer'
    ],
    dateNote: 'Month and year, achievement-led bullets.'
  }
};

/* -------------------------------------------------------------------- */
/* per-market texts: which markets hold their own, and which fell behind */
/* -------------------------------------------------------------------- */

const REGION_IDS: RegionId[] = ['emea', 'us', 'gcc', 'apac', 'latam', 'anz'];

/** The part of a live state that can differ per market — content, never settings. */
export function regionContentOf(state: ResumeState): RegionContent {
  return {
    profile: state.profile,
    experience: state.experience,
    education: state.education,
    certifications: state.certifications,
    projects: state.projects,
    skills: state.skills
  };
}

/**
 * One string per market's text, equal for two markets holding the same wording. The two
 * photo copies are compared by size rather than by content, so a full-size portrait is
 * not serialised six times on every keystroke.
 */
export function contentSignature(content: RegionContent): string {
  const profile: Record<string, string> = {};
  const source = (content && content.profile ? content.profile : {}) as unknown as Record<string, string>;
  Object.keys(source).forEach((key) => {
    const value = String(source[key] || '');
    profile[key] = key === 'photo' || key === 'photoFull' ? '#' + value.length : value;
  });
  return JSON.stringify({
    profile,
    experience: (content && content.experience) || [],
    education: (content && content.education) || [],
    certifications: (content && content.certifications) || [],
    projects: (content && content.projects) || [],
    skills: (content && content.skills) || []
  });
}

/**
 * The markets holding text that differs from the one on screen, while per-region
 * editing is on. The app badges the region button with this list and the Regional fit
 * card names it, so a market whose text fell behind is never silent.
 */
export function staleRegions(state: ResumeState): RegionId[] {
  if (state.settings.syncRegions || !state.regions) return [];
  const active = state.settings.region;
  const current = contentSignature(regionContentOf(state));
  return REGION_IDS.filter((id) => {
    if (id === active) return false;
    const copy = state.regions ? state.regions[id] : undefined;
    return Boolean(copy) && contentSignature(copy as RegionContent) !== current;
  });
}

/**
 * A market that requires a field is not served by another market's text: a US copy has
 * no nationality by design, so copying it over the Gulf loses what the Gulf screens for
 * before a first call. Only fields the market on screen does not show are reported here;
 * the ones it does show are reported under the field itself, by regionFieldNotes.
 */
function lapsedRequiredFields(state: ResumeState): Array<{ region: RegionId; fields: string[] }> {
  const active = state.settings.region;
  const shown = new Set(regionFields(active).map((spec) => spec.key));
  const out: Array<{ region: RegionId; fields: string[] }> = [];
  REGION_IDS.forEach((id) => {
    if (id === active) return;
    const copy = state.regions ? state.regions[id] : undefined;
    if (!copy) return;
    const content = copy as RegionContent;
    const profile = (content && content.profile ? content.profile : {}) as unknown as Record<string, string>;
    const missing = regionFields(id)
      .filter((spec) => spec.required && !shown.has(spec.key))
      .filter((spec) => !String(profile[spec.key] || '').trim());
    if (missing.length) out.push({ region: id, fields: missing.map((spec) => spec.label.toLowerCase()) });
  });
  return out;
}

/* -------------------------------------------------------------------- */
/* field by field: what differs, where, and what that market says there  */
/* -------------------------------------------------------------------- */

/** Fields that state a fact about you, and should therefore read the same everywhere. */
const FACT_FIELDS = new Set([
  'profile.name',
  'profile.email',
  'profile.phone',
  'profile.location',
  'profile.website',
  'profile.linkedin',
  'experience.role',
  'experience.company',
  'experience.start',
  'experience.end',
  'education.school',
  'education.degree',
  'education.field',
  'education.start',
  'education.end',
  'certifications.name',
  'certifications.issuer',
  'certifications.date',
  'certifications.expires',
  'certifications.link',
  'projects.name',
  'projects.link',
  'skills.label'
]);

const COLLECTION_KEYS: Array<{
  key: 'experience' | 'education' | 'certifications' | 'projects' | 'skills';
  labelField: string;
}> = [
  { key: 'experience', labelField: 'role' },
  { key: 'education', labelField: 'school' },
  { key: 'certifications', labelField: 'name' },
  { key: 'projects', labelField: 'name' },
  { key: 'skills', labelField: 'label' }
];

const REGION_FIELD_LABELS: Record<string, string> = {
  nationality: 'nationality',
  workAuth: 'visa or residency status',
  availability: 'availability',
  dateOfBirth: 'date of birth',
  maritalStatus: 'marital status',
  photo: 'a photo'
};

export interface RegionFieldNote {
  /** Editor path (a data-path value) of the field this note sits under. */
  path: string;
  tone: 'warn' | 'info';
  text: string;
  /** The market to offer to open, when exactly one other market differs here. */
  region?: RegionId;
}

function shortValue(value: string): string {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 48 ? text.slice(0, 47).trim() + '…' : text;
}

function joinRegionNames(labels: string[]): string {
  if (labels.length <= 1) return labels[0] || '';
  if (labels.length === 2) return labels[0] + ' and ' + labels[1];
  return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
}

/** "experience.2.highlights" → "experience.highlights", so one rule covers every entry. */
function plainFieldPath(path: string): string {
  return path.replace(/\.\d+\./, '.');
}

interface FieldDifference {
  region: RegionId;
  /** What that market's own text says in this field. */
  value: string;
  /** True when the market requires this field and its text has none. */
  required: boolean;
  /** True when that market's text has no entry at this position at all. */
  missingEntry: boolean;
}

/**
 * What the builder should say under a field: a required field this market is still
 * missing, and — while per-region editing is on — which other market's own text differs
 * here and what it says. Every note names the field it sits under, so the answer is
 * "this field, in this market, which says this", never a general warning that somewhere
 * a market is out of date.
 */
export function regionFieldNotes(state: ResumeState): RegionFieldNote[] {
  const notes: RegionFieldNote[] = [];
  const active = state.settings.region;
  const activeLabel = REGION_PROFILES[active].label;

  /* The market on screen first: a required field left empty is the one thing here that
     belongs under the field rather than in a list. */
  missingRequiredFields(state).forEach((spec) => {
    notes.push({
      path: 'profile.' + spec.key,
      tone: 'warn',
      text: `Required in ${activeLabel}: the CV is incomplete for this market without it.`
    });
  });

  if (state.settings.syncRegions || !state.regions) return notes;

  const live = regionContentOf(state);
  const liveProfile = live.profile as unknown as Record<string, string>;
  const differences = new Map<string, FieldDifference[]>();

  const add = (path: string, difference: FieldDifference) => {
    const list = differences.get(path) || [];
    list.push(difference);
    differences.set(path, list);
  };

  REGION_IDS.forEach((id) => {
    if (id === active) return;
    const copy = state.regions ? state.regions[id] : undefined;
    if (!copy) return;
    const other = copy as RegionContent;
    const otherProfile = (other.profile || {}) as unknown as Record<string, string>;
    const required = new Set(
      regionFields(id)
        .filter((spec) => spec.required)
        .map((spec) => spec.key as string)
    );

    Object.keys(liveProfile).forEach((key) => {
      if (key === 'photo' || key === 'photoFull') return;
      if (String(liveProfile[key] || '') === String(otherProfile[key] || '')) return;
      add('profile.' + key, {
        region: id,
        value: String(otherProfile[key] || ''),
        required: required.has(key),
        missingEntry: false
      });
    });

    /* The portrait is compared by presence, not by its data URL: the note says a photo is
       missing or different, and never pastes an image into the builder. */
    const minePhoto = String(liveProfile.photo || '');
    const theirPhoto = String(otherProfile.photo || '');
    if (Boolean(minePhoto) !== Boolean(theirPhoto) || (minePhoto && theirPhoto && minePhoto !== theirPhoto)) {
      add('profile.photo', {
        region: id,
        value: theirPhoto ? (minePhoto ? 'a different photo' : 'a photo') : '',
        required: required.has('photo'),
        missingEntry: false
      });
    }

    COLLECTION_KEYS.forEach(({ key, labelField }) => {
      const mine = (live[key] || []) as unknown as Array<Record<string, unknown>>;
      const theirs = (other[key] || []) as unknown as Array<Record<string, unknown>>;
      mine.forEach((item, index) => {
        const pair = theirs[index];
        if (!pair) {
          add(`${key}.${index}.${labelField}`, { region: id, value: '', required: false, missingEntry: true });
          return;
        }
        Object.keys(item).forEach((field) => {
          if (field === 'id' || field === 'current') return;
          if (String(item[field] || '') === String(pair[field] || '')) return;
          add(`${key}.${index}.${field}`, {
            region: id,
            value: String(pair[field] || ''),
            required: false,
            missingEntry: false
          });
        });
      });
    });
  });

  differences.forEach((list, path) => {
    /* One note per field: the required-field note above already says the important part. */
    if (notes.some((note) => note.path === path)) return;

    /* A required field another market's text has lost outranks the wording differences:
       that is the one thing there that must be put right. */
    const needs = list.filter((item) => item.required && !item.value.trim());
    const group = needs.length ? needs : list;
    const names = joinRegionNames(group.map((item) => REGION_PROFILES[item.region].label));
    const several = group.length > 1;
    const first = group[0];
    const fact = FACT_FIELDS.has(plainFieldPath(path));
    const verb = several ? 'have ' : 'has ';
    const region = several ? undefined : first.region;

    /* The portrait never has its value quoted: the note says what the other market holds. */
    if (path === 'profile.photo' && !needs.length) {
      notes.push({
        path,
        tone: 'info',
        text: names + ' ' + verb + (first.value ? 'a different photo here.' : 'no photo here.'),
        region
      });
      return;
    }

    let text: string;
    let tone: 'warn' | 'info' = fact ? 'warn' : 'info';

    if (needs.length) {
      const label = REGION_FIELD_LABELS[path.slice(path.indexOf('.') + 1)] || 'that detail';
      tone = 'warn';
      text = names + (several ? ' need ' : ' needs ') + label + (several ? ' and their texts have none.' : ' and its text has none.');
    } else if (first.missingEntry) {
      text = names + ' ' + verb + 'no entry at this position.';
    } else if (!first.value.trim()) {
      text = names + ' ' + verb + 'nothing in this field.';
    } else if (fact) {
      text = names + ' ' + verb + '“' + shortValue(first.value) + '” here — this field should read the same in every market.';
    } else {
      text = names + ' ' + verb + 'different text here: “' + shortValue(first.value) + '”.';
    }

    notes.push({ path, tone, text, region });
  });

  return notes;
}

export interface RegionalAssessment {
  score: number;
  findings: Finding[];
}

/**
 * The points each regional criterion carries. The guide in the app reads these
 * numbers, so the explanation and the score can never drift apart.
 */
export const REGION_WEIGHTS = {
  /** Points removed for each page over the market's ceiling. */
  pageOver: 25,
  /** GCC: points removed when nationality, visa status or availability is missing. */
  personalRequired: 25,
  /** US and ANZ: points removed when a detail this market filters out is present. */
  personalForbidden: 15,
  /** Points removed when no language level this market expects is listed. */
  language: 15,
  /** GCC and ANZ: points removed when no referees, availability or notice period are stated. */
  references: 10,
  /** EMEA: points removed when a role starts with a bare year instead of month and year. */
  dates: 10
};

export interface RegionCriterion {
  /** The subtitle shown in the guide. */
  title: string;
  /** How the weight is written in the guide. */
  weightLabel: string;
  /** What the market expects of this criterion. */
  rule: string;
  /** How the app measures it on this resume. */
  measured: string;
  /** What a compliant resume shows. */
  pass: string;
}

/**
 * How much each check counts towards the headline in a given market. The market's
 * own rules carry the heaviest single weight, and the universal checks are tuned to
 * what that market screens hardest: keyword and ATS match in the US, credentials and
 * language levels in the Gulf, qualifications in APAC, referees and STAR depth in ANZ.
 */
export const REGION_SCORE_WEIGHTS: Record<RegionId, Record<string, number>> = {
  emea: {
    ats: 1,
    skim: 1.2,
    rubric: 1,
    achievements: 1,
    timeline: 1.2,
    interview: 1,
    skills: 1,
    certifications: 1,
    links: 0.8,
    length: 1,
    region: 4
  },
  us: {
    ats: 1.5,
    skim: 1.3,
    rubric: 1.5,
    achievements: 1.3,
    timeline: 0.8,
    interview: 1,
    skills: 1.2,
    certifications: 0.8,
    links: 0.8,
    length: 1,
    region: 4
  },
  gcc: {
    ats: 1.2,
    skim: 1,
    rubric: 1,
    achievements: 0.9,
    timeline: 1,
    interview: 1,
    skills: 1.2,
    certifications: 1.3,
    links: 1,
    length: 1,
    region: 4
  },
  apac: {
    ats: 1.2,
    skim: 1,
    rubric: 1.2,
    achievements: 1,
    timeline: 1,
    interview: 1,
    skills: 1.3,
    certifications: 1.3,
    links: 0.8,
    length: 1,
    region: 4
  },
  latam: {
    ats: 1.2,
    skim: 1.1,
    rubric: 1,
    achievements: 1,
    timeline: 1,
    interview: 1.2,
    skills: 1,
    certifications: 1,
    links: 0.8,
    length: 1,
    region: 4
  },
  anz: {
    ats: 1.3,
    skim: 1.1,
    rubric: 1.2,
    achievements: 1.2,
    timeline: 1,
    interview: 1.2,
    skills: 1,
    certifications: 1,
    links: 1,
    length: 1,
    region: 4
  }
};

/** Names for the weighted headline breakdown in the guide. */
export const CHECK_LABELS: Record<string, string> = {
  ats: 'ATS parse',
  skim: 'Recruiter skim',
  rubric: 'Rubric / advert match',
  achievements: 'Achievements',
  timeline: 'Timeline',
  interview: 'Structured interview',
  skills: 'Skills signal',
  certifications: 'Certifications',
  links: 'Portfolio links',
  length: 'Length and format',
  region: 'Regional fit'
};

export interface RegionGuide {
  id: RegionId;
  label: string;
  tagline: string;
  intro: string;
  pageRange: string;
  criteria: RegionCriterion[];
  /** Expectations this market has that the other Screening checks already measure. */
  elsewhere: string[];
  checklist: string[];
}

/**
 * The scoring guide behind the "How each region is scored" window: one entry per
 * market, each criterion a subtitle, each weight taken from REGION_WEIGHTS.
 */
export const REGION_GUIDES: RegionGuide[] = [
  {
    id: 'emea',
    label: 'EMEA',
    tagline: 'Two pages, exact dates, DACH photo conventions',
    intro:
      'Europe is not one market. Germany, Austria and Switzerland still expect a photo, a date of birth and strictly chronological dates, while the UK and Ireland follow anti-discrimination practice and avoid personal details. What every European reader shares is a taste for two tight pages, month-and-year dates and no unexplained gap.',
    pageRange: 'one to two pages',
    criteria: [
      {
        title: 'Page ceiling',
        weightLabel: '−' + REGION_WEIGHTS.pageOver + ' per page over',
        rule: 'European CVs run one to two pages. Three pages reads as an unfiltered career dump to a UK or German reviewer unless the role is academic.',
        measured: 'Words in the resume divided by 520, rounded up, against the ceiling of two pages.',
        pass: 'Two pages or fewer of resume text.'
      },
      {
        title: 'Personal details',
        weightLabel: 'no points',
        rule: 'A photo and date of birth are customary in DACH; the UK and Ireland avoid them. Either choice is defensible, so this is explained, never deducted.',
        measured: 'Searched in name, headline, summary and location for nationality, date of birth, marital status or a photo reference.',
        pass: 'Whatever the specific country expects: present for DACH, absent for the UK and Ireland.'
      },
      {
        title: 'Language levels',
        weightLabel: '−' + REGION_WEIGHTS.language,
        rule: 'A second language is a working requirement across most of Europe: German for DACH, French for France and Belgium, the local language elsewhere.',
        measured: 'Searched in the Skills section for a language name: English, German, French, Spanish or Deutsch.',
        pass: 'At least one language level listed, with English and the market’s local language named.'
      },
      {
        title: 'Date convention',
        weightLabel: '−' + REGION_WEIGHTS.dates,
        rule: 'European readers scan for month and year. A bare year, such as 2019 instead of Mar 2019, hides a gap and reads as imprecise.',
        measured: 'Counts roles whose start date carries no month name.',
        pass: 'Every role starts with a month and a year.'
      },
      {
        title: 'References',
        weightLabel: 'no points',
        rule: '“References available on request” is the European norm; contact details of referees are not expected on the page.',
        measured: 'Not scored. Checked only so you know what this market wants.',
        pass: 'No referee block needed.'
      }
    ],
    elsewhere: [
      'Timeline — unexplained gaps over six months, since European readers question them in the first call.',
      'Recruiter skim — a headline that states the role and a summary of one short paragraph.',
      'Achievements — quantified bullets; DACH readers in particular expect precision.'
    ],
    checklist: [
      'two pages at most, with month-and-year dates',
      'every employment gap accounted for',
      'language levels for the local market',
      'photo and date of birth are customary in DACH and avoided in the UK and Ireland'
    ]
  },
  {
    id: 'us',
    label: 'US',
    tagline: 'One to two pages, no personal details, quantified bullets',
    intro:
      'A US resume is a compliance document before it is a biography. Anything that hints at age, nationality, marital status or appearance is filtered out by large employers’ processes, and it costs space that belongs to results. One to two pages, a summary rather than an objective, and bullets that carry numbers.',
    pageRange: 'one to two pages',
    criteria: [
      {
        title: 'Page ceiling',
        weightLabel: '−' + REGION_WEIGHTS.pageOver + ' per page over',
        rule: 'One page for early and mid-career, two for fifteen or more years of relevant experience. A third page is almost never appropriate.',
        measured: 'Words in the resume divided by 520, rounded up, against the ceiling of two pages.',
        pass: 'Two pages or fewer of resume text.'
      },
      {
        title: 'Personal details',
        weightLabel: '−' + REGION_WEIGHTS.personalForbidden,
        rule: 'No photo, no date of birth, no nationality, no marital status. Including them signals unfamiliarity with the market, and compliance teams drop the file before a human reads it.',
        measured: 'Searched in name, headline, summary and location for nationality or work authorisation, date of birth and marital status.',
        pass: 'Only name, city, phone, email and a profile link.'
      },
      {
        title: 'Language levels',
        weightLabel: '−' + REGION_WEIGHTS.language,
        rule: 'English is the working language. A second language is a bonus, never a requirement, but the row should still name English.',
        measured: 'Searched in the Skills section for a language name.',
        pass: 'A language row that names English.'
      },
      {
        title: 'References',
        weightLabel: 'no points',
        rule: 'US resumes do not list referees; they are requested at offer stage and sometimes not at all.',
        measured: 'Not scored. Checked only so you know what this market wants.',
        pass: 'No referee block needed.'
      }
    ],
    elsewhere: [
      'Recruiter skim — a summary instead of an objective statement, which the US reads as dated.',
      'Achievements — every bullet an outcome with a number rather than a duty.',
      'Rubric — the posting’s own keywords, in its own wording, since the ATS ranks by overlap.',
      'ATS parse — file format matters: a text PDF, or .docx for older systems such as Taleo.'
    ],
    checklist: [
      'one to two pages',
      'no photo, date of birth, nationality or marital status',
      'a summary rather than an objective statement',
      'quantified bullets and the advert keywords in the posting’s own wording'
    ]
  },
  {
    id: 'gcc',
    label: 'GCC',
    tagline: 'Nationality, visa status and languages are screening data',
    intro:
      'In the Gulf a CV is read as an administrative document as much as a professional one. Nationality, visa or residency status and availability decide sponsorship, quota and package before anyone reads a bullet. Two to three pages are normal, a professional photo is customary, and referees are often contacted before an offer.',
    pageRange: 'two to three pages',
    criteria: [
      {
        title: 'Page ceiling',
        weightLabel: '−' + REGION_WEIGHTS.pageOver + ' per page over',
        rule: 'Two pages are normal and three are tolerated, especially at manager level: Gulf readers expect detailed role descriptions rather than aggressive pruning.',
        measured: 'Words in the resume divided by 520, rounded up, against the ceiling of three pages.',
        pass: 'Two or three pages of resume text.'
      },
      {
        title: 'Nationality, visa and availability',
        weightLabel: '−' + REGION_WEIGHTS.personalRequired,
        rule: 'Nationality maps onto visa mechanics and quota systems, Saudization in the Kingdom and Emiratisation in the UAE. Current status or a relocation statement is a ranking factor, not personal trivia.',
        measured: 'Searched in name, headline, summary and location for nationality, citizenship, visa, residency, work authorisation, right to work or relocation.',
        pass: 'A line such as “German national, available to relocate to the UAE or Saudi Arabia”.'
      },
      {
        title: 'Language levels',
        weightLabel: '−' + REGION_WEIGHTS.language,
        rule: 'Arabic and English levels are stated explicitly: Arabic can be a requirement in Saudi Arabia, while English leads in the UAE private sector.',
        measured: 'Searched in the Skills section for Arabic or English.',
        pass: 'Both languages named, with the level of each.'
      },
      {
        title: 'Referees and availability',
        weightLabel: '−' + REGION_WEIGHTS.references,
        rule: 'Referees are commonly listed, and they can be contacted before an offer. A notice period or availability date is read as seriousness about relocating.',
        measured: 'Searched in the header and skills for references, referees, availability or notice period.',
        pass: 'Referees, an availability date or a notice period stated.'
      }
    ],
    elsewhere: [
      'Skills signal — breadth and grouping, since Gulf adverts list the stack explicitly.',
      'Certifications — verifiable licences and safety tickets carry real weight for site and bench work.',
      'Achievements — numbers survive translation across markets better than adjectives.'
    ],
    checklist: [
      'two to three pages',
      'nationality, visa or residency status, current location and availability',
      'Arabic and English levels stated explicitly',
      'referees listed and contactable before an offer'
    ]
  },
  {
    id: 'apac',
    label: 'APAC',
    tagline: 'Detailed education, certifications, language levels',
    intro:
      'APAC spans markets with very different habits. India runs two to three pages with detailed academic records and treats certifications as a differentiator. China and India often carry a photo and date of birth, Japan uses the fixed Rirekisho form, and Singapore follows the Western standard. Depth of education and qualifications weighs more than in the US.',
    pageRange: 'two to three pages',
    criteria: [
      {
        title: 'Page ceiling',
        weightLabel: '−' + REGION_WEIGHTS.pageOver + ' per page over',
        rule: 'Two to three pages are normal; Indian CVs in particular run long with academic detail and a full certification list.',
        measured: 'Words in the resume divided by 520, rounded up, against the ceiling of three pages.',
        pass: 'Two or three pages of resume text.'
      },
      {
        title: 'Personal details',
        weightLabel: 'no points',
        rule: 'A photo and date of birth are common in India and China and expected on a Japanese Rirekisho, while Singapore follows Western practice. Practice varies too widely to penalise.',
        measured: 'Searched in name, headline, summary and location for nationality, date of birth or marital status.',
        pass: 'Whatever the specific country expects; either way is acceptable here.'
      },
      {
        title: 'Language levels',
        weightLabel: '−' + REGION_WEIGHTS.language,
        rule: 'State English plus the local language level. Indian employers also read the medium of instruction as a signal.',
        measured: 'Searched in the Skills section for English, Hindi, Mandarin, Chinese, Japanese, Korean, Bahasa or Tamil.',
        pass: 'English plus any local language, with levels.'
      },
      {
        title: 'Education and certifications',
        weightLabel: 'no points here',
        rule: 'Qualifications carry more weight than in the West: institution, grades and certification issuers are read closely.',
        measured: 'Scored by the ATS parse and Certifications checks rather than the regional one.',
        pass: 'Institutions, dates and certificate issuers all present and verifiable.'
      }
    ],
    elsewhere: [
      'ATS parse — every education entry needs a school and a degree for an Indian or Chinese reader to read it as complete.',
      'Certifications — issuer and date, plus a credential link, since verifiability is checked.',
      'Skills signal — breadth and grouping of a technical stack.'
    ],
    checklist: [
      'two to three pages',
      'detailed education, grades and institutions',
      'certifications with issuer and date',
      'English plus any local language level'
    ]
  },
  {
    id: 'latam',
    label: 'LATAM',
    tagline: 'Two to three pages, language proficiency, personal tone',
    intro:
      'Latin America mixes both poles: multinationals in Brazil, Mexico, Colombia and Argentina expect the international standard, while domestic and public-sector employers keep photos, dates of birth and a warmer tone. Language proficiency is a genuine differentiator, and two to three pages are normal.',
    pageRange: 'two to three pages',
    criteria: [
      {
        title: 'Page ceiling',
        weightLabel: '−' + REGION_WEIGHTS.pageOver + ' per page over',
        rule: 'Two to three pages at experienced level, with detailed education and professional history rather than aggressive trimming.',
        measured: 'Words in the resume divided by 520, rounded up, against the ceiling of three pages.',
        pass: 'Two or three pages of resume text.'
      },
      {
        title: 'Personal details',
        weightLabel: 'no points',
        rule: 'A photo and date of birth are common in Brazil, Mexico and Colombia, and are avoided by multinationals following the international standard. Both are accepted, so neither is deducted.',
        measured: 'Searched in name, headline, summary and location for nationality, date of birth or marital status.',
        pass: 'Either convention; the international standard suits multinational employers.'
      },
      {
        title: 'Language levels',
        weightLabel: '−' + REGION_WEIGHTS.language,
        rule: 'Spanish or Portuguese as appropriate, plus documented English proficiency: many employers verify the English level formally.',
        measured: 'Searched in the Skills section for Spanish, Portuguese, Español, Português or English.',
        pass: 'Both the local language and English named, with levels.'
      },
      {
        title: 'References',
        weightLabel: 'no points',
        rule: 'References are usually available on request.',
        measured: 'Not scored. Checked only so you know what this market wants.',
        pass: 'No referee block needed, though one is not penalised.'
      }
    ],
    elsewhere: [
      'Structured interview — STAR depth, since interviews in the region probe examples at length.',
      'Achievements — quantified outcomes in place of duties.',
      'Skills signal — a clearly grouped technical stack.'
    ],
    checklist: [
      'two to three pages',
      'language proficiency stated up front',
      'a more personal tone is accepted',
      'references on request'
    ]
  },
  {
    id: 'anz',
    label: 'ANZ',
    tagline: 'Right-to-work status, STAR bullets, named referees',
    intro:
      'Australia and New Zealand follow the UK model with two local wrinkles: work authorisation is worth stating, because a role advertised locally rarely sponsors, and a named referees page is expected rather than dismissed as dated. Photos, dates of birth and nationality are avoided.',
    pageRange: 'two to three pages',
    criteria: [
      {
        title: 'Page ceiling',
        weightLabel: '−' + REGION_WEIGHTS.pageOver + ' per page over',
        rule: 'Two to three pages are normal; a one-page CV under-sells an experienced hire here as much as a four-page one over-sells.',
        measured: 'Words in the resume divided by 520, rounded up, against the ceiling of three pages.',
        pass: 'Two or three pages of resume text.'
      },
      {
        title: 'Personal details',
        weightLabel: '−' + REGION_WEIGHTS.personalForbidden,
        rule: 'No photo, no date of birth, no marital status. Work authorisation is the exception: “citizen”, “permanent resident” or a visa status is useful and is not penalised.',
        measured: 'Searched in name, headline, summary and location for date of birth and marital status; nationality or right-to-work wording is noted but allowed.',
        pass: 'No date of birth or marital status; a right-to-work line is welcome.'
      },
      {
        title: 'Language levels',
        weightLabel: '−' + REGION_WEIGHTS.language,
        rule: 'English, with STAR-format bullets and quantified outcomes.',
        measured: 'Searched in the Skills section for a language name.',
        pass: 'A language row that names English.'
      },
      {
        title: 'Referees',
        weightLabel: '−' + REGION_WEIGHTS.references,
        rule: 'Two or three named referees with contact details are expected, and they may be contacted before an offer, so warn them first.',
        measured: 'Searched in the header and skills for references, referees, availability or notice period.',
        pass: 'Referees, an availability date or a notice period stated.'
      }
    ],
    elsewhere: [
      'Achievements — STAR-shaped, achievement-led bullets with outcomes.',
      'Structured interview — depth per role, since ANZ interviews lean on behavioural examples.',
      'Portfolio links — a working link a reviewer can open.'
    ],
    checklist: [
      'two to three pages',
      'no photo, date of birth or nationality, but right-to-work status is worth stating',
      'STAR-format achievements with outcomes',
      'two or three named referees, who may be contacted before an offer'
    ]
  }
];

/**
 * The Regional fit card, and from 2.9.1 the market's contribution to the score:
 * page ceiling, personal details, language levels, references and date convention,
 * each weighted by what that market actually screens for.
 */
function regionalAssessment(state: ResumeState, region: RegionProfile, pages: number): RegionalAssessment {
  const p = state.profile;
  const header = [p.name, p.headline, p.summary, p.location].join(' ');
  const skillsText = state.skills.map((item) => item.label + ' ' + item.items).join(' ');

  /* Structured region fields, filled in the builder, win over free-text guessing.
     Only the fields the selected market shows are read, so a value left behind in a
     hidden field can neither print nor cost points. */
  const nationality = visibleValue(state, 'nationality');
  const workAuth = visibleValue(state, 'workAuth');
  const availability = visibleValue(state, 'availability');
  const birth = visibleValue(state, 'dateOfBirth');
  const maritalStatus = visibleValue(state, 'maritalStatus');
  const photo = visibleValue(state, 'photo');

  /* Free text is read for what it states, not for words that merely occur: a summary
     saying "open to relocation" is not a nationality, and "citizen developer" is not a
     passport. statedDetails also returns the words that triggered it, so the finding can
     quote the evidence instead of asserting a category. */
  const details = statedDetails(header);
  const phraseOf = (kind: string): string => {
    const hit = details.find((item) => item.kind === kind);
    return hit ? hit.phrase : '';
  };

  const textNationality = phraseOf('nationality') || phraseOf('workAuth');
  const textBirth = phraseOf('birth');
  const textMarital = phraseOf('marital');

  const personal = Boolean(nationality || workAuth || availability) || Boolean(textNationality);
  const age = Boolean(birth) || Boolean(textBirth);
  const marital = Boolean(maritalStatus) || Boolean(textMarital);
  const found: string[] = [];
  if (nationality || workAuth) found.push('nationality or work authorisation');
  else if (textNationality) found.push('“' + textNationality + '” in the header');
  if (age) found.push(textBirth && !birth ? '“' + textBirth + '”' : 'date of birth');
  if (marital) found.push(textMarital && !maritalStatus ? '“' + textMarital + '”' : 'marital status');

  const findings: Finding[] = [];
  const rules = REGION_CHECKLISTS[region.id];
  let score = 100;

  /* --- length --- */
  if (pages > region.maxPages) score -= REGION_WEIGHTS.pageOver * (pages - region.maxPages);
  findings.push({
    status: pages <= region.maxPages ? 'pass' : 'warn',
    text: `About ${pages} page(s) of resume text; ${region.label} CVs usually run ${region.pageRange}.`
  });

  /* --- personal details --- */
  if (region.personal === 'expected') {
    const missing: string[] = [];
    if (!nationality) missing.push('nationality');
    if (!workAuth) missing.push('visa or residency status');
    if (!availability) missing.push('availability');
    if (missing.length) score -= REGION_WEIGHTS.personalRequired;
    findings.push({
      status: missing.length ? 'warn' : 'pass',
      text: missing.length
        ? 'Add ' + missing.join(', ') + ' in Profile under ' + region.label + ' details: this market screens for them before a first call.'
        : 'Nationality, work status and availability are stated, which this market screens for before a first call.',
      target: missing.length ? 'contact' : undefined
    });
    findings.push({
      status: photo ? 'pass' : 'warn',
      text: photo
        ? 'A profile photo is attached, which is customary on a Gulf CV.'
        : 'A professional photo is customary on Gulf CVs; ' + region.label + ' details in Profile takes one. Advice only, no points deducted.'
    });
  } else if (region.personal === 'avoid') {
    // ANZ tolerates a right-to-work line; the US treats nationality itself as noise.
    const forbidden = region.id === 'anz' ? [age ? 'date of birth' : '', marital ? 'marital status' : ''] : found;
    const flagged = forbidden.filter(Boolean);
    if (flagged.length) score -= REGION_WEIGHTS.personalForbidden;
    findings.push({
      status: flagged.length ? 'warn' : 'pass',
      text: flagged.length
        ? 'This CV states ' + flagged.join(', ') + '; this market avoids that, and compliance teams filter it out.'
        : 'No ' + (region.id === 'anz' ? 'date of birth or marital status' : 'nationality, date of birth or marital status') + ', which is what this market expects.'
    });
  } else {
    findings.push({ status: 'info', text: region.personalNote });
  }

  /* --- languages --- */
  const hasLanguage = region.languagePattern.test(skillsText);
  if (!hasLanguage) score -= REGION_WEIGHTS.language;
  findings.push({
    status: hasLanguage ? 'pass' : 'warn',
    text: hasLanguage ? region.languageNote : region.languageNote + ' No language levels that this market expects are listed yet.'
  });

  /* --- references and availability --- */
  if (region.id === 'gcc' || region.id === 'anz') {
    const hasRefs =
      hasDetail(header + ' ' + skillsText, 'references') || Boolean(availability) || hasDetail(skillsText, 'availability');
    if (!hasRefs) score -= REGION_WEIGHTS.references;
    findings.push({
      status: hasRefs ? 'pass' : 'warn',
      text: hasRefs
        ? region.referencesNote
        : 'No referees, availability or notice period stated. ' + region.referencesNote
    });
  } else {
    findings.push({ status: 'info', text: region.referencesNote });
  }

  /* --- date convention: EMEA reads month and year, not a bare year --- */
  if (region.id === 'emea' && state.experience.length) {
    const bareYears = state.experience.filter((item) => item.start.trim() && !/[a-z]{3}/i.test(item.start)).length;
    if (bareYears) {
      score -= REGION_WEIGHTS.dates;
      findings.push({
        status: 'warn',
        text: `${bareYears} role(s) start with a bare year; ${region.label} readers expect month and year.`
      });
    } else {
      findings.push({ status: 'pass', text: 'Every role carries month and year, which this market expects.' });
    }
  }

  findings.push({ status: 'info', text: `What this market checks: ${rules.checklist.join('; ')}.` });

  /* Sync off means this market keeps its own text. Each market is reported for what its
     own text actually lacks; the fields this market shows carry the same warning under
     the field itself, in the builder. */
  if (!state.settings.syncRegions) {
    const lapsed = lapsedRequiredFields(state);
    lapsed.forEach((item) => {
      const label = REGION_PROFILES[item.region].label;
      findings.push({
        status: 'warn',
        text: `The ${label} text has no ${item.fields.join(', ')}. ${label} screens for ${
          item.fields.length === 1 ? 'it' : 'them'
        } before a first call, so open ${label} and fill ${
          item.fields.length === 1 ? 'it' : 'them'
        } in there.`,
        action: { label: 'Open ' + label, id: 'open-region-' + item.region }
      });
    });

    const kept = REGION_IDS.filter(
      (id) => id !== state.settings.region && Boolean(state.regions && state.regions[id])
    );
    findings.push({
      status: 'info',
      text:
        kept.length
          ? `Editing the ${region.label} text only. ${joinRegionNames(
              kept.map((id) => REGION_PROFILES[id].label)
            )} keep ${kept.length === 1 ? 'its own text' : 'their own texts'}, and the builder shows under each field what they say there.`
          : `Editing the ${region.label} text only. No other market has its own text yet; opening one starts it from what is here.`
    });
  }

  return { score: clamp(Math.round(score)), findings };
}


export function evaluateResume(state: ResumeState): ScreeningReport {
  const p = state.profile;
  const checks: CheckResult[] = [];
  const roles = state.experience;
  const now = new Date();
  const nowIndex = now.getFullYear() * 12 + now.getMonth();
  const region = REGION_PROFILES[state.settings.region] || REGION_PROFILES.emea;

  /* --- contact / ATS --- */
  const contactFields = [
    { label: 'email', ok: Boolean(p.email && p.email.indexOf('@') !== -1) },
    { label: 'phone', ok: Boolean(p.phone.trim()) },
    { label: 'location', ok: Boolean(p.location.trim()) },
    { label: 'LinkedIn or website', ok: Boolean(p.linkedin.trim() || p.website.trim()) }
  ];
  const missingContact = contactFields.filter((item) => !item.ok).map((item) => item.label);
  const rolesWithoutTitle = roles.filter((item) => !item.role.trim()).length;
  const rolesWithoutDate = roles.filter((item) => !item.start.trim() || (!item.end.trim() && !item.current)).length;
  const schoolsWithoutName = state.education.filter((item) => !item.school.trim() && !item.degree.trim()).length;

  const atsFindings: Finding[] = [];
  if (!p.name.trim())
    atsFindings.push({ status: 'fail', text: 'No name in the profile, so a parser has nothing to anchor the document on.', target: 'name' });
  if (missingContact.length) {
    atsFindings.push({ status: 'warn', text: 'Missing contact fields: ' + missingContact.join(', ') + '.', target: 'contact' });
  } else {
    atsFindings.push({ status: 'pass', text: 'Name, email, phone, location, and a LinkedIn or website are all present.', target: 'contact' });
  }
  atsFindings.push(
    !roles.length
      ? {
          status: 'warn',
          text: 'No roles listed, so a parser finds no employment history to read.',
          target: 'experience'
        }
      : rolesWithoutTitle || rolesWithoutDate
      ? {
          status: 'warn',
          text: `${rolesWithoutTitle} role(s) without a title, ${rolesWithoutDate} without a full start/end date — parsers drop those lines.`,
          target: 'experience'
        }
      : { status: 'pass', text: `All ${roles.length} role(s) carry a title and dates that a parser can read.`, target: 'experience' }
  );
  if (state.education.length) {
    atsFindings.push(
      schoolsWithoutName
        ? { status: 'warn', text: `${schoolsWithoutName} education entr(y/ies) have neither school nor degree.`, target: 'education' }
        : { status: 'pass', text: 'Every education entry has a school and a degree.', target: 'education' }
    );
  }
  if (!state.skills.length)
    atsFindings.push({ status: 'warn', text: 'No skills section, which most keyword parsers rely on.', target: 'skills' });

  /* Published ATS advice: the posting's own job title belongs in the headline or summary,
     because that is what parsers index and what a recruiter reads first. */
  const targetRole = (state.settings.target || '').trim();
  const headlineSummary = (p.headline + ' ' + p.summary).toLowerCase();
  const titleWords = targetRole.toLowerCase().split(/[^a-z0-9+]+/).filter((word) => word.length > 3);
  const titleRatio = titleWords.length
    ? titleWords.filter((word) => headlineSummary.indexOf(word) !== -1).length / titleWords.length
    : 1;
  let titlePenalty = 0;
  if (titleWords.length) {
    if (titleRatio >= 0.6) {
      atsFindings.push({
        status: 'pass',
        text: 'The target job title appears in the headline or summary, where parsers index it.',
        target: 'headline'
      });
    } else {
      titlePenalty = 10;
      atsFindings.push({
        status: 'warn',
        text: 'The target job title is missing from the headline and summary; parsers index the title and recruiters read it first.',
        target: 'headline'
      });
    }
  }

  /* Older parsers index an acronym and its long form separately, so each short term
     wants to be spelled out once. Only advice, never a deduction. */
  const bareAcronyms = splitList((state.settings.keywords || '').replace(/[\n;]/g, ','))
    .filter((term) => term.length > 1 && term.length <= 8 && term.indexOf(' ') === -1 && /[A-Z]/.test(term))
    .filter((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !new RegExp(escaped + '\\s*\\([^)]{6,}\\)', 'i').test(resumeText(state));
    });
  if (bareAcronyms.length) {
    atsFindings.push({
      status: 'info',
      text:
        'Spell each short term out once, as in "HiL (hardware-in-the-loop)": ' +
        bareAcronyms.slice(0, 5).join(', ') +
        '. Older parsers index the two forms separately.',
      target: 'skills'
    });
  }
  atsFindings.push({
    status: 'info',
    text: 'File format: send a text-based PDF, or .docx where the employer still runs an older system such as Taleo. An image PDF parses as an empty record.'
  });

  const atsScore = clamp(
    100 -
      (p.name.trim() ? 0 : 30) -
      missingContact.length * 8 -
      rolesWithoutTitle * 6 -
      rolesWithoutDate * 6 -
      schoolsWithoutName * 6 -
      (roles.length ? 0 : 20) -
      (state.skills.length ? 0 : 10) -
      titlePenalty
  );
  checks.push({
    id: 'ats',
    name: 'ATS parse',
    status: statusFor(atsScore),
    score: atsScore,
    summary: 'What an applicant tracking system can read from this resume.',
    standard: 'Coversentry ATS statistics: 23% of rejections are parsing failures.',
    findings: atsFindings
  });

  /* --- recruiter skim --- */
  const headline = p.headline.trim();
  const summary = p.summary.trim();
  const newest = roles
    .filter((item) => item.role || item.company)
    .slice()
    .sort((a, b) => (parseMonth(b.start)?.index || 0) - (parseMonth(a.start)?.index || 0))[0];
  const newestBullets = newest ? splitLines(newest.highlights).length : 0;

  const skimFindings: Finding[] = [];
  skimFindings.push(
    headline
      ? headline.length <= 120
        ? { status: 'pass', text: 'Headline states the role in ' + headline.length + ' characters.', target: 'headline' }
        : {
            status: 'warn',
            text: 'Headline is ' + headline.length + ' characters — skim readers lose it after about 120.',
            target: 'headline'
          }
      : { status: 'fail', text: 'No headline: the first thing a recruiter looks for is missing.', target: 'headline' }
  );
  skimFindings.push(
    summary.length >= 40 && summary.length <= 600
      ? { status: 'pass', text: 'Summary is ' + summary.length + ' characters — about one short paragraph.', target: 'summary' }
      : summary.length === 0
      ? { status: 'warn', text: 'No summary; the first paragraph is then whatever the first role says.', target: 'summary' }
      : { status: 'warn', text: `Summary is ${summary.length} characters; keep it between 40 and 600.`, target: 'summary' }
  );
  skimFindings.push(
    newestBullets >= 2
      ? { status: 'pass', text: 'Most recent role has ' + newestBullets + ' bullet(s).', target: newest ? 'experience:' + newest.id : 'experience' }
      : {
          status: 'warn',
          text: 'The most recent role has ' + newestBullets + ' bullet(s); give it two or three.',
          target: newest ? 'experience:' + newest.id : 'experience'
        }
  );

  const headlineTooLong = headline.length > 120;
  const skimScore = clamp(
    100 -
      (headline ? 0 : 35) -
      (headlineTooLong ? 10 : 0) -
      (summary.length >= 40 && summary.length <= 600 ? 0 : 15) -
      (newestBullets >= 2 ? 0 : 20) -
      missingContact.length * 5
  );
  checks.push({
    id: 'skim',
    name: 'Recruiter skim',
    status: statusFor(skimScore),
    score: skimScore,
    summary: 'What is visible in the first few seconds.',
    standard: 'Ladders eye-tracking: 7.4 seconds on the first screen.',
    findings: skimFindings
  });

  /* --- rubric against the advert --- */
  const coverage = keywordCoverage(state);
  const hasTarget = splitList((state.settings.keywords || '').replace(/[\n;]/g, ',')).length > 0;
  const rubricFindings: Finding[] = [];
  if (!hasTarget) {
    rubricFindings.push({ status: 'info', text: 'Paste the advert’s key terms above to score this check.' });
  } else {
    rubricFindings.push({
      status: coverage.ratio >= 0.75 ? 'pass' : coverage.ratio >= 0.65 ? 'warn' : 'fail',
      text: `${coverage.matched.length} of ${coverage.matched.length + coverage.missing.length} target terms appear (${Math.round(
        coverage.ratio * 100
      )}%); aim for 75%.`,
      target: 'skills'
    });
    if (coverage.missing.length) {
      rubricFindings.push({ status: 'warn', text: 'Missing: ' + coverage.missing.slice(0, 12).join(', ') + '.', target: 'skills' });
    }
    coverage.stuffed.forEach((item) => {
      rubricFindings.push({
        status: 'warn',
        text: `"${item.term}" appears ${item.count} times — that reads as keyword stuffing.`,
        target: 'skills'
      });
    });
  }
  const rubricScore = hasTarget ? clamp(Math.round(coverage.ratio * 100)) : 60;
  checks.push({
    id: 'rubric',
    name: 'Rubric / advert match',
    status: hasTarget ? statusFor(rubricScore) : 'info',
    score: rubricScore,
    summary: hasTarget ? 'Coverage of the advert’s must-have terms.' : 'Needs the advert’s key terms.',
    standard: 'Jobscan recommends a 75% keyword match.',
    findings: rubricFindings
  });

  /* --- achievements --- */
  const allBullets = roles.reduce<string[]>((all, item) => all.concat(splitLines(item.highlights)), []);
  const quantified = allBullets.filter((line) => /\d|%|€|\$|£|million|thousand|\bk\b/i.test(line)).length;
  const ratio = allBullets.length ? quantified / allBullets.length : 0;
  const bulletWords = allBullets.map((line) => line.split(/\s+/).filter(Boolean).length);
  const averageWords = bulletWords.length ? Math.round(bulletWords.reduce((a, b) => a + b, 0) / bulletWords.length) : 0;
  const longest = bulletWords.length ? Math.max(...bulletWords) : 0;

  const achievementFindings: Finding[] = [];
  achievementFindings.push(
    allBullets.length
      ? {
          status: ratio >= 0.6 ? 'pass' : ratio >= 0.3 ? 'warn' : 'fail',
          text: `${quantified} of ${allBullets.length} bullets carry a number, %, currency or volume (${Math.round(
            ratio * 100
          )}%).`,
          target: 'experience'
        }
      : { status: 'fail', text: 'No achievement bullets yet.', target: 'experience' }
  );
  if (allBullets.length) {
    achievementFindings.push({
      status: averageWords > 32 ? 'warn' : 'pass',
      text: `Bullets average ${averageWords} words; the longest is ${longest}.`,
      target: 'experience'
    });
  }
  const achievementScore = clamp(Math.round(ratio * 100) - (averageWords > 32 ? 10 : 0));
  checks.push({
    id: 'achievements',
    name: 'Achievements',
    status: allBullets.length ? statusFor(achievementScore) : 'fail',
    score: achievementScore,
    summary: 'Whether bullets show outcomes instead of duties.',
    standard: 'Recruiters rank measurable achievements first, at 58.2% (Coversentry 2026).',
    findings: achievementFindings
  });

  /* --- timeline --- */
  const { intervals, unknown } = experienceIntervals(state);
  const study = studyIntervals(state);
  // Counted before merging, on the untouched ranges.
  const overlaps = intervals.filter((item, index) =>
    intervals.some((other, otherIndex) => otherIndex !== index && item.start < other.end && other.start < item.end)
  ).length;
  const merged = mergedInterval(intervals);
  const totalYears = Math.round((merged.totalMonths / 12) * 10) / 10;
  const gaps: string[] = [];
  for (let i = 1; i < merged.intervals.length; i += 1) {
    const from = merged.intervals[i - 1].end;
    const to = merged.intervals[i].start;
    const gap = to - from;
    // A gap that falls inside a degree or a preparation year is covered time, not a hole.
    if (gap > 6 && !overlapsStudy(study, from, to)) gaps.push(gap + ' months');
  }

  const timelineFindings: Finding[] = [];
  timelineFindings.push({
    status: totalYears > 0 ? 'pass' : 'warn',
    text: totalYears > 0 ? `About ${totalYears} year(s) of dated experience in total.` : 'No dated experience yet.',
    target: 'experience'
  });
  if (unknown.length) {
    timelineFindings.push({ status: 'warn', text: 'Cannot read dates for: ' + unknown.join(', ') + '.', target: 'experience' });
  }
  gaps.forEach((gap) => timelineFindings.push({ status: 'warn', text: 'A gap of ' + gap + ' between roles.', target: 'experience' }));
  if (overlaps) {
    timelineFindings.push({
      status: 'info',
      text: `${overlaps} role(s) overlap in time — fine, but be ready to explain it.`,
      target: 'experience'
    });
  }
  if (!gaps.length && intervals.length) {
    timelineFindings.push({
      status: 'pass',
      text: study.length
        ? 'No gaps longer than six months: years filled by a degree, a course or preparation count as covered time.'
        : 'No gaps longer than six months between roles.',
      target: 'experience'
    });
  }
  const timelineScore = clamp(100 - gaps.length * 15 - unknown.length * 15 - (intervals.length ? 0 : 40));
  checks.push({
    id: 'timeline',
    name: 'Timeline',
    status: statusFor(timelineScore),
    score: timelineScore,
    summary: 'Whether the dates add up, without unexplained gaps.',
    standard: 'Coversentry ATS statistics: 23% of rejections are parsing failures, unreadable dates among them.',
    findings: timelineFindings
  });

  /* --- structured interview readiness --- */
  const thinRoles = roles.filter((item) => splitLines(item.highlights).length < 2);
  const interviewFindings: Finding[] = roles.length
    ? roles.map<Finding>((item) => {
        const count = splitLines(item.highlights).length;
        return {
          status: count >= 2 ? 'pass' : 'warn',
          text: `${item.role || item.company || 'Untitled role'}: ${count} bullet(s)${count < 2 ? ' — nothing to probe in a STAR interview.' : '.'}`,
          target: 'experience:' + item.id
        };
      })
    : [{ status: 'fail', text: 'No roles to interview about yet.', target: 'experience' }];
  const interviewScore = roles.length ? clamp(100 - thinRoles.length * 25) : 0;
  checks.push({
    id: 'interview',
    name: 'Structured interview',
    status: roles.length ? statusFor(interviewScore) : 'fail',
    score: interviewScore,
    summary: 'Whether every role has enough detail to survive STAR questions.',
    standard: 'Sackett et al. 2022: structured interviews predict at .42 against .19.',
    findings: interviewFindings
  });

  /* --- skills --- */
  const skillGroups = state.skills.filter((item) => item.items.trim() || item.label.trim());
  const skillItems = skillGroups.reduce<string[]>((all, item) => all.concat(splitList(item.items)), []);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  skillItems.forEach((item) => {
    const key = item.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) duplicates.push(item.trim());
    seen.add(key);
  });
  const skillFindings: Finding[] = [];
  skillFindings.push({
    status: skillItems.length >= 8 ? 'pass' : skillItems.length ? 'warn' : 'fail',
    text: `${skillGroups.length} group(s), ${skillItems.length} distinct item(s).`,
    target: 'skills'
  });
  if (duplicates.length) {
    skillFindings.push({ status: 'warn', text: 'Repeated items: ' + Array.from(new Set(duplicates)).slice(0, 8).join(', ') + '.', target: 'skills' });
  }
  const skillScore = clamp(
    (skillGroups.length >= 3 ? 40 : skillGroups.length ? 25 : 0) + (skillItems.length >= 8 ? 40 : skillItems.length * 5) + (duplicates.length ? 0 : 20)
  );
  checks.push({
    id: 'skills',
    name: 'Skills signal',
    status: statusFor(skillScore),
    score: skillScore,
    summary: 'Breadth and cleanliness of the skills section.',
    standard: 'NACE 2026: 70% of employers hire on demonstrated skills.',
    findings: skillFindings
  });

  /* --- certifications --- */
  const certs = state.certifications.filter((item) => item.name.trim());
  const linkedCerts = certs.filter((item) => item.link.trim() !== '');
  // An expired certificate is a compliance problem, not just a formatting one: an
  // HV or safety ticket that ran out disqualifies the holder on a customer audit.
  const expiredCerts = certs.filter((item) => {
    const expiry = item.expires.trim() ? parseMonth(item.expires) : null;
    return Boolean(expiry && !expiry.open && expiry.index < nowIndex);
  });

  /* Certificates can also arrive as groups in the Skills section — they cannot
     carry an issuer, date or credential link there, so a screener cannot verify them. */
  const certGroups = state.skills.filter((item) => /certif|licen|badge/i.test(item.label));
  const storedAsSkills = certGroups.reduce<string[]>((all, item) => all.concat(splitList(item.items)), []);

  const certFindings: Finding[] = [];
  let certStatus: CheckStatus = 'info';
  let certScore = 70;

  if (certs.length) {
    certFindings.push({
      status: linkedCerts.length === certs.length ? 'pass' : 'warn',
      text: `${linkedCerts.length} of ${certs.length} certificates have a credential link.`,
      target: 'certifications'
    });
    if (linkedCerts.length < certs.length) {
      certFindings.push({
        status: 'warn',
        text: 'Unverifiable certificates carry less weight in screening; add the credential URL where one exists.',
        target: 'certifications'
      });
    }
    if (expiredCerts.length) {
      certFindings.push({
        status: 'warn',
        text: `${expiredCerts.length} certificate(s) are past their expiry date (${expiredCerts
          .map((item) => item.name.trim())
          .slice(0, 3)
          .join(', ',)}). Renew it, remove it, or label it "expired" or "renewal in progress" so it never
          reads as current.`,
        target: 'certifications'
      });
    }
    // Warning only, by design: Rezi, ResumeMate, Resumly and the Jobscan date guidance all treat a
    // lapsed certificate as an accuracy problem with three fixes — renew, remove, or label. None of
    // them scores it, and a parser reads the date either way, so no points are removed here.
    certScore = clamp(Math.round((linkedCerts.length / certs.length) * 100));
    certStatus = statusFor(certScore);
  } else if (storedAsSkills.length) {
    certFindings.push({
      status: 'warn',
      text: `${storedAsSkills.length} certificate(s) sit in the Skills section (${certGroups
        .map((group) => '"' + group.label.trim() + '"')
        .slice(0, 3)
        .join(', ')}), where they cannot carry an issuer, date or credential link.`,
      target: 'skills'
    });
    certFindings.push({
      status: 'info',
      text: 'Move them to the Certifications tab (inside Education) so a screener can verify them.',
      target: 'skills'
    });
    certScore = 40;
    certStatus = 'warn';
  } else {
    certFindings.push({ status: 'info', text: 'No certifications listed. Fine for many roles, expected in some.' });
  }

  checks.push({
    id: 'certifications',
    name: 'Certifications',
    status: certStatus,
    score: certScore,
    summary: certs.length
      ? 'Whether certificates can be verified.'
      : storedAsSkills.length
      ? 'Certificates found as skill groups — unverifiable there.'
      : 'Whether certificates can be verified.',
    standard: '86% of employers treat non-degree certifications as important evidence (2026).',
    findings: certFindings
  });

  /* --- portfolio and profile links --- */
  const projectEntries = state.projects.filter((item) => item.name.trim() || item.description.trim());
  const linkedProjects = projectEntries.filter((item) => looksLikeUrl(item.link));
  const brokenProjects = projectEntries.filter((item) => item.link.trim() && !looksLikeUrl(item.link));
  const profileLinks = [p.website, p.linkedin].filter((item) => item.trim());
  const brokenProfileLinks = profileLinks.filter((item) => !looksLikeUrl(item));
  const brokenAll = brokenProfileLinks.concat(brokenProjects.map((item) => item.link.trim()));

  const linkFindings: Finding[] = [];
  linkFindings.push(
    profileLinks.length || linkedProjects.length
      ? {
          status: 'pass',
          text: `${profileLinks.length ? 'A profile link, ' : ''}${linkedProjects.length} project link(s) give a reviewer something to open.`,
          target: profileLinks.length ? 'contact' : 'projects'
        }
      : { status: 'warn', text: 'No portfolio or profile links — for technical roles reviewers expect at least one.', target: 'contact' }
  );
  if (brokenAll.length) {
    linkFindings.push({
      status: 'warn',
      text: 'These do not read as working URLs: ' + brokenAll.slice(0, 6).join(', ') + '.',
      target: brokenProfileLinks.length ? 'contact' : 'projects'
    });
  }
  const linkScore = clamp(
    (profileLinks.length ? 40 : 0) +
      (linkedProjects.length ? 40 : projectEntries.length ? 15 : 0) +
      (brokenAll.length ? 0 : 20)
  );
  checks.push({
    id: 'links',
    name: 'Portfolio links',
    status: statusFor(linkScore),
    score: linkScore,
    summary: 'Working links a reviewer can actually open.',
    standard: '53% of employers name verifying skill claims as their main screening obstacle (2026).',
    findings: linkFindings
  });

  /* --- blind screening --- */
  const blind = blindPreview(state);
  checks.push({
    id: 'blind',
    name: 'Blind screening',
    status: 'info',
    score: 0,
    summary: blind.redacted.length
      ? 'What a blind first pass reads once ' + blind.redacted.join(', ') + ' are hidden.'
      : 'What a blind first pass would read from this resume.',
    standard: 'NYC Local Law 144 and the EU AI Act: bias audit, public summary, candidate notice.',
    findings: [
      {
        status: 'info',
        text: blind.redacted.length
          ? 'Hidden: ' + blind.redacted.join(', ') + '. Employers and schools stay visible; stricter blind processes hide those too.'
          : 'Nothing to hide yet — add your details and the blind view shows what stays.'
      }
    ]
  });

  /* --- length and format --- */
  const words = resumeText(state).split(/\s+/).filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(words / 520));
  const overPages = Math.max(0, pages - region.maxPages);
  const lengthFindings: Finding[] = [];
  lengthFindings.push({
    status: overPages ? 'warn' : 'pass',
    text: `About ${words} words, roughly ${pages} page(s); ${region.label} CVs usually run ${region.pageRange}.`
  });
  lengthFindings.push({
    status: longest > 45 ? 'warn' : 'pass',
    text: longest ? `Longest bullet: ${longest} words.` : 'No bullets yet.'
  });
  const lengthScore = clamp(100 - (overPages ? (overPages === 1 ? 10 : 25) : 0) - (longest > 45 ? 15 : 0));
  checks.push({
    id: 'length',
    name: 'Length and format',
    status: statusFor(lengthScore),
    score: lengthScore,
    summary: 'Page count and density, measured against the selected market.',
    standard: 'ResumeGo: recruiters preferred two pages 2.3 to 1.',
    findings: lengthFindings
  });

  /* --- regional fit: the selected market's own rules, scored --- */
  const regional = regionalAssessment(state, region, pages);
  checks.push({
    id: 'region',
    name: 'Regional fit — ' + region.label,
    status: statusFor(regional.score),
    score: regional.score,
    summary: region.summary,
    standard: 'Regional CV guides and current market practice; every weight is listed in the scoring guide.',
    findings: regional.findings
  });

  /* --- LLM review --- */
  checks.push({
    id: 'llm',
    name: 'LLM review',
    status: 'info',
    score: 0,
    summary: 'A ready-made prompt for any chat model, used with the exported Markdown.',
    findings: [
      { status: 'info', text: 'Press "Export resume as .md", then "Copy prompt", and paste both into any chat model (ChatGPT, Claude, Gemini, Copilot).' },
      { status: 'info', text: 'The prompt asks for scored findings against these same methods, and forbids invented content.' }
    ]
  });

  // The headline follows the selected market: each check is weighted by what that
  // market screens hardest, with the market's own rules carrying the largest share.
  const scored = checks.filter((check) => check.id !== 'llm' && check.status !== 'info');
  const weights = REGION_SCORE_WEIGHTS[region.id] || {};
  let weightedSum = 0;
  let weightTotal = 0;
  scored.forEach((check) => {
    const weight = typeof weights[check.id] === 'number' ? weights[check.id] : 1;
    weightedSum += check.score * weight;
    weightTotal += weight;
  });
  const score = weightTotal ? Math.round(weightedSum / weightTotal) : 0;

  return {
    score,
    checks,
    coverage,
    pages,
    bullets: allBullets.length,
    quantified,
    totalYears,
    blindText: blind.text
  };
}

function looksLikeUrl(raw: string): boolean {
  const value = String(raw || '').trim();
  if (!value) return false;
  return /^https?:\/\/[^\s]+\.[^\s]+$/i.test(value) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value);
}

export interface BlindPreview {
  text: string;
  redacted: string[];
}

/**
 * A plain-text copy of the resume with identifying details masked, as a blind
 * first pass would show it. Employers and schools stay visible; stricter
 * anonymisation hides those too, which the check's findings mention.
 */
export function blindPreview(state: ResumeState): BlindPreview {
  const p = state.profile;
  const redacted: string[] = [];
  if (p.name.trim()) redacted.push('name');
  if (p.email.trim()) redacted.push('email');
  if (p.phone.trim()) redacted.push('phone');
  if (p.website.trim()) redacted.push('website');
  if (p.linkedin.trim()) redacted.push('LinkedIn');

  const lines: string[] = [];
  lines.push(p.name.trim() ? '[Candidate — name hidden]' : '[Candidate]');
  if (p.headline.trim()) lines.push(p.headline.trim());
  if (p.location.trim()) lines.push(p.location.trim());
  if (p.summary.trim()) {
    lines.push('');
    lines.push(p.summary.trim());
  }

  const roles = state.experience.filter((item) => item.role.trim() || item.company.trim());
  if (roles.length) {
    lines.push('', 'EXPERIENCE');
    roles.forEach((item) => {
      lines.push('');
      const dates = [item.start.trim(), item.current ? 'Present' : item.end.trim()].filter(Boolean).join(' – ');
      lines.push(
        [item.role.trim(), item.company.trim()].filter(Boolean).join(' — ') + (dates ? ' (' + dates + ')' : '')
      );
      splitLines(item.highlights).forEach((line) => lines.push('  - ' + line));
    });
  }

  const schools = state.education.filter((item) => item.school.trim() || item.degree.trim());
  if (schools.length) {
    lines.push('', 'EDUCATION');
    schools.forEach((item) => {
      lines.push('');
      lines.push([item.degree.trim(), item.field.trim(), item.school.trim()].filter(Boolean).join(' — '));
      splitLines(item.details).forEach((line) => lines.push('  - ' + line));
    });
  }

  const groups = state.skills.filter((item) => item.label.trim() || item.items.trim());
  if (groups.length) {
    lines.push('', 'SKILLS');
    groups.forEach((item) =>
      lines.push('- ' + [item.label.trim() ? item.label.trim() + ':' : '', item.items.trim()].filter(Boolean).join(' '))
    );
  }

  return { text: lines.join('\n').trim(), redacted };
}

export function buildLlmPrompt(state: ResumeState, report: ScreeningReport): string {
  const target = (state.settings.target || '').trim();
  const keywords = splitList((state.settings.keywords || '').replace(/[\n;]/g, ','));
  const failed = report.checks.filter((check) => check.status === 'fail' || check.status === 'warn');
  const region = REGION_PROFILES[state.settings.region] || REGION_PROFILES.emea;
  const rules = REGION_CHECKLISTS[region.id];

  const lines: string[] = [];
  lines.push(`You are an experienced technical recruiter and hiring manager screening for a role in ${region.label}.`);
  lines.push('I am attaching my resume as a file, in one of the two formats this app exports. Read whichever is attached:');
  lines.push('- .md — the resume as Markdown: headings, roles, bullets, skills. A base64 comment at the end carries a data snapshot; ignore it.');
  lines.push('- .json — the same resume as data: data.profile, data.experience[], data.education[], data.certifications[], data.projects[], data.skills[], data.settings. Read the fields directly.');
  lines.push('If both are attached, take the wording from the .md and the structure from the .json. Never treat the hidden snapshot as part of the resume.');
  lines.push('Evaluate it strictly against the methods below and return the scored table first, then the findings.');
  lines.push('');
  lines.push('## Target');
  lines.push('Role: ' + (target || 'not specified — infer from the headline'));
  lines.push('Advert keywords: ' + (keywords.length ? keywords.join(', ') : 'not specified'));
  lines.push(`Region: ${region.label} — ${region.summary}`);
  lines.push('');
  lines.push(`## ${region.label} rules to apply`);
  lines.push('- Length: ' + region.pageRange + '.');
  lines.push('- Personal details: ' + region.personalNote);
  lines.push('- Languages: ' + region.languageNote);
  lines.push('- References: ' + region.referencesNote);
  lines.push('- Dates: ' + rules.dateNote);
  lines.push('- The checklist a screener in this market works through:');
  rules.checklist.forEach((item, index) => lines.push(`  ${index + 1}. ${item}`));
  lines.push('');
  lines.push('## Methods to apply');
  lines.push('1. ATS parse — would a parser read name, contact, titles, employers, dates and skills correctly?');
  lines.push('2. Recruiter skim — what survives a 10 second first pass?');
  lines.push('3. Rubric — score coverage of each advert keyword: matched, partially matched, missing.');
  lines.push('4. Achievements — is each bullet an outcome with a number, or a duty?');
  lines.push('5. Timeline — do the dates add up, are there gaps or overlaps needing an explanation?');
  lines.push('6. Structured interview — which bullets would survive STAR probing, which are too thin?');
  lines.push('7. Skills — breadth, grouping, duplication, keyword stuffing.');
  lines.push('8. Certifications — verifiable, in date, and relevant to this market.');
  lines.push('9. Length and format — pages, bullets that are too long, readability.');
  lines.push(`10. ${region.label} market fit — score the resume against each rule listed above, one line per rule.`);
  lines.push('');
  lines.push('## Published standards to apply');
  lines.push('Score against the same published methods this app uses, and say which one a verdict rests on:');
  METHOD_SOURCES.forEach((source) => {
    lines.push(`- ${source.name} (${source.publisher}, ${source.evidence.toLowerCase()}): ${source.claim} Rule applied here: ${source.rule}`);
  });
  lines.push('');
  lines.push('## What the research does not support');
  lines.push(
    '- Do not repeat the claim that 75% of resumes are rejected by an ATS before a human reads them; it has no published method and this app does not use it.'
  );
  lines.push('- Vendor pipeline statistics describe one vendor’s own data, so treat them as direction, not proof. Say so when a verdict rests on one.');
  lines.push('');
  lines.push('## Measured in the app for this resume (facts, not opinions — do not contradict them)');
  lines.push(`- Length: about ${report.pages} page(s).`);
  lines.push(
    `- Roles: ${state.experience.length}; bullets: ${report.bullets}; of those carrying a number, %, or volume: ${report.quantified}.`
  );
  lines.push(`- Dated experience: about ${report.totalYears} year(s).`);
  lines.push(
    `- Advert keywords matched: ${report.coverage.matched.length} of ${
      report.coverage.matched.length + report.coverage.missing.length
    }${report.coverage.missing.length ? ' (missing: ' + report.coverage.missing.slice(0, 12).join(', ') + ')' : ''}.`
  );
  lines.push(`- The app's own score for ${region.label}: ${report.score}/100.`);
  lines.push('');
  lines.push('## Output');
  lines.push('Return a Markdown table with the columns: Method | Score (0-100) | Verdict | Main reason.');
  lines.push('Then, for each method that scores below 80, list the specific lines to change and a rewrite of each weak bullet.');
  lines.push('Then give the three changes that would most improve the score for this market, in order.');
  lines.push('');
  lines.push('## Rules');
  lines.push('- Use only what is in the attached file. Do not invent employers, dates, metrics or skills.');
  lines.push('- If something is missing, say it is missing instead of filling it in.');
  lines.push('- Quote the exact bullet you are rewriting.');
  lines.push('- Keep the whole answer under 900 words.');
  lines.push('');
  if (failed.length) {
    lines.push('## Findings already measured by the app (use them, do not contradict them)');
    failed.forEach((check) => {
      lines.push('- ' + check.name + ' (' + check.status + '): ' + check.summary);
      check.findings
        .filter((finding) => finding.status !== 'pass')
        .forEach((finding) => lines.push('  - ' + finding.text));
    });
  }
  lines.push('');
  lines.push(`The attached file is the resume. Read it fully, then score it as a ${region.label} recruiter would.`);

  return lines.join('\n');
}
