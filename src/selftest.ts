/*
 * Round-trip and variant verification.
 *
 * Three layers, all runnable on the device:
 *  1. Format round trips — build every export from a state, import it back and compare
 *     field by field. JSON, Markdown and TXT for every variant; the binary writers
 *     (PDF, DOCX, PNG, ZIP) once, because they are the slow ones.
 *  2. Region variants — a resume filled in for each of the six markets, with the fields
 *     that market expects, so the region-driven profile fields are exercised too.
 *  3. Random variants — deterministic pseudo-random resumes with awkward data (umlauts,
 *     CJK, pipes, empty sections, expired certificates, duplicated skills), checked for
 *     export/import fidelity and for the screening report staying sane.
 *
 * Exposed as the "Verify export / import" button in Settings → Data and as
 * window.__gmoResumeTest() in the console.
 */
import { buildDocx } from './docx';
import { toJson, toMarkdown, toPlainText } from './format';
import { parseImportBytes } from './parse';
import { buildPdf } from './pdf';
import { buildPngPages } from './png';
import { evaluateResume, regionFieldNotes } from './screening';
import { createZip } from './zip';
import { hasDetail, isNationalityWord, type DetailKind } from './context';
import type { Profile, RegionContent, RegionId, ResumeState } from './types';
import { APP_VERSION } from './version';

const REGIONS: RegionId[] = ['emea', 'us', 'gcc', 'apac', 'latam', 'anz'];

/** A 1×1 transparent PNG, used to prove a photo survives the round trip. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function profile(name: string, extra: Partial<Profile> = {}): Profile {
  const base: Profile = {
    name,
    headline: 'Test engineer · colour round trip',
    email: 'test@example.com',
    phone: '+49 177 000 000',
    location: 'München, Germany',
    website: 'example.dev',
    linkedin: 'linkedin.com/in/test-user',
    summary: 'First paragraph with | pipe and an umlaut: äöü — dash.\n\nSecond paragraph after a blank line.',
    photo: '',
    photoFull: '',
    nationality: '',
    workAuth: '',
    availability: '',
    dateOfBirth: '',
    maritalStatus: ''
  };
  return Object.assign(base, extra);
}

/** Profile fields the region expects, so each market's builder fields get exercised. */
function regionProfile(base: Profile, region: RegionId, withPhoto: boolean): Profile {
  const next: Profile = { ...base };
  if (withPhoto) next.photo = TINY_PNG;
  if (region === 'gcc') {
    next.nationality = 'German';
    next.workAuth = 'Requires sponsorship';
    next.availability = 'From March 2027, two months notice';
    next.maritalStatus = 'Single';
  } else if (region === 'anz') {
    next.workAuth = 'Australian permanent resident';
  } else if (region === 'emea') {
    next.nationality = 'German';
    next.dateOfBirth = '14 March 1992';
  } else if (region === 'apac') {
    next.dateOfBirth = '14 March 1992';
  } else if (region === 'latam') {
    next.dateOfBirth = '14 March 1992';
    next.maritalStatus = 'Single';
  }
  return next;
}

function sampleState(profileData: Profile, region: RegionId): ResumeState {
  return {
    profile: profileData,
    experience: [
      {
        id: 'e1',
        role: 'Senior test engineer',
        company: 'ACME GmbH',
        location: 'München, Bavaria',
        start: 'Oct 2020',
        end: '',
        current: true,
        highlights:
          'Led the | pipe | escape study\nBuilt the pipeline from nothing, cutting latency 40%.\nOwned the review rota across 3 teams.',
        tags: 'TypeScript, WebGL, data round trips'
      },
      {
        id: 'e2',
        role: 'Engineer',
        company: 'Boring Co',
        location: 'Remote',
        start: 'Jan 2018',
        end: 'Sep 2020',
        current: false,
        highlights: 'Shipped the thing to 12 markets.\nFixed the other thing, cutting tickets 18%.',
        tags: ''
      }
    ],
    education: [
      {
        id: 'f1',
        school: 'TU München',
        degree: 'MSc',
        field: 'Electrical & Computer Engineering',
        location: 'München',
        start: '2013',
        end: '2015',
        details: 'Grade 1.3.\nThesis on export fidelity.'
      }
    ],
    certifications: [
      { id: 'c1', name: 'MATLAB Onramp', issuer: 'MathWorks', date: 'Jan 2021', expires: '', link: '' },
      {
        id: 'c2',
        name: 'ISO 26262 | Functional Safety',
        issuer: 'Akkodis',
        date: 'Feb 2021',
        expires: 'Jul 2027',
        link: 'https://example.com/cert/iso'
      },
      { id: 'c3', name: 'Deep Learning', issuer: 'Vector', date: 'Mar 2021', expires: '', link: '' }
    ],
    projects: [
      {
        id: 'p1',
        name: 'Roundtrip',
        link: 'example.dev/roundtrip',
        description: 'A | pipe | and an umlaut — äöü.',
        tech: 'TS, Canvas'
      }
    ],
    skills: [
      { id: 's1', label: 'Languages', items: 'TypeScript, German (äöü), 中文' },
      { id: 's2', label: 'A very long label indeed', items: 'A value that wraps onto its own line, twice even.' }
    ],
    settings: {
      theme: 'light',
      colorMode: 'bw',
      font: 'serif',
      density: 'compact',
      showSummary: true,
      showTags: true,
      target: 'Senior test engineer',
      keywords: 'ISO 26262, HIL, test management, automotive',
      region,
      syncRegions: true,
      sections: { experience: true, education: true, certifications: true, projects: true, skills: false }
    },
    regions: {}
  };
}

/* -------------------------------------------------------------------- */
/* one text per market                                                  */
/* -------------------------------------------------------------------- */

const TINY_PNG_FULL = TINY_PNG + 'Zm9v';

function liveContent(state: ResumeState): RegionContent {
  return {
    profile: state.profile,
    experience: state.experience,
    education: state.education,
    certifications: state.certifications,
    projects: state.projects,
    skills: state.skills
  };
}

function cloneContent(content: RegionContent): RegionContent {
  return JSON.parse(JSON.stringify(content)) as RegionContent;
}

/**
 * Sync off, the way a real resume reaches that state: the market on screen (US) holds
 * its own text, three other markets hold text of their own that differs from it, and the
 * portrait sits in both of its copies — the downscaled one and the upload kept whole.
 */
function regionalState(): ResumeState {
  const base = sampleState(regionProfile(profile('Ada Lovelace'), 'gcc', true), 'gcc');
  const state: ResumeState = {
    ...base,
    settings: { ...base.settings, region: 'us', syncRegions: false },
    regions: {}
  };

  state.profile = { ...state.profile, photo: TINY_PNG, photoFull: TINY_PNG_FULL };

  const live = liveContent(state);
  state.regions.us = cloneContent(live);

  (['gcc', 'apac', 'emea'] as RegionId[]).forEach((region, index) => {
    const copy = cloneContent(live);
    copy.profile.summary = `${region.toUpperCase()} wording ${index + 1}: ${copy.profile.summary}`;
    copy.profile.headline = `${region.toUpperCase()} headline ${index + 1}`;
    copy.experience[0].highlights = `${copy.experience[0].highlights}\n${region.toUpperCase()} only bullet ${index + 1}.`;
    copy.skills[0].items = `${copy.skills[0].items}, ${region.toUpperCase()}`;
    state.regions[region] = copy;
  });

  return state;
}

/** Every market's text, and both copies of the portrait, compared field by field. */
function regionalDiff(expected: ResumeState, actual: ResumeState): string[] {
  const problems = diff(flatten(expected), flatten(actual));

  REGIONS.forEach((region) => {
    const before = expected.regions[region];
    if (!before) return;
    const after = actual.regions ? actual.regions[region] : undefined;
    if (!after) {
      problems.push('regions.' + region + ' (missing)');
      return;
    }
    diff(before, after, 'regions.' + region, problems);
  });

  diff(expected.profile.photo, actual.profile.photo, 'profile.photo', problems);
  diff(expected.profile.photoFull, actual.profile.photoFull, 'profile.photoFull', problems);

  /* The three texts must actually differ, or the round trip proves nothing. */
  const distinct = new Set(Object.keys(expected.regions).map((id) => JSON.stringify(expected.regions[id as RegionId])));
  if (distinct.size < 2) problems.push('the test state has no divergent market texts');

  return problems;
}

/** The app's full backup envelope, so the test imports the file users actually make. */
function fullBackupJson(state: ResumeState): string {
  return JSON.stringify(
    {
      app: 'gmo-resume-manager',
      kind: 'full-backup',
      schema: 2,
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      photo: {
        included: Boolean(state.profile.photoFull || state.profile.photo),
        quality: state.profile.photoFull ? 'original' : 'none',
        approxKb: 0
      },
      data: JSON.parse(JSON.stringify(state))
    },
    null,
    2
  );
}

/* -------------------------------------------------------------------- */
/* the nationality lexicon                                              */
/* -------------------------------------------------------------------- */

interface LexiconCase {
  kind: DetailKind;
  text: string;
  match: boolean;
}

/**
 * Sentences the context reader must read as they are written, and the traps the wider
 * lexicon opens: a nationality word that names a piece of plumbing, a disease or a
 * compliance barrier is not a passport.
 */
const LEXICON_CASES: LexiconCase[] = [
  { kind: 'nationality', text: 'Nationality: Lebanese', match: true },
  { kind: 'nationality', text: 'Lebanese', match: true },
  { kind: 'nationality', text: 'Chinese', match: true },
  { kind: 'nationality', text: 'Brasilian', match: true },
  { kind: 'nationality', text: 'citizen of Lebanon', match: true },
  { kind: 'nationality', text: 'nationality: Germany', match: true },
  { kind: 'nationality', text: 'Puerto Rican passport holder', match: true },
  { kind: 'nationality', text: 'Bermudian · Dubai, UAE', match: true },
  { kind: 'nationality', text: 'Đà Nẵng, citizen of Vietnam', match: true },
  { kind: 'nationality', text: 'Open to relocation to Dubai', match: false },
  { kind: 'nationality', text: 'Citizen developer and API integrator', match: false },
  { kind: 'nationality', text: 'Single-page application delivery', match: false },
  { kind: 'nationality', text: 'Chinese wall controls in the trading system', match: false },
  { kind: 'nationality', text: 'French drain survey and German measles outbreak', match: false },
  { kind: 'nationality', text: 'Worked with French and German teams', match: false },
  { kind: 'nationality', text: 'Indian summer of 2024', match: false },
  { kind: 'workAuth', text: 'Requires sponsorship', match: true },
  { kind: 'workAuth', text: 'Valid residency visa, transferable', match: true },
  { kind: 'marital', text: 'Single', match: true },
  { kind: 'birth', text: 'Date of birth: 14 March 1992', match: true }
];

/** The lexicon table: every case, plus the single-word lookup the builder fields use. */
function lexiconProblems(): Array<{ label: string; problems: string[] }> {
  const out: Array<{ label: string; problems: string[] }> = [];

  LEXICON_CASES.forEach((entry) => {
    const found = hasDetail(entry.text, entry.kind);
    if (found === entry.match) return;
    out.push({
      label: entry.kind + ' · “' + entry.text + '”',
      problems: [found ? 'read a detail that is not stated' : 'missed a stated ' + entry.kind]
    });
  });

  const words: Array<[string, boolean]> = [
    ['Lebanese', true],
    ['brasilian', true],
    ['Germany', true],
    ['Puerto Rican', true],
    ['Curaçaoan', true],
    ['not-a-nationality', false]
  ];
  words.forEach(([word, expected]) => {
    if (isNationalityWord(word) === expected) return;
    out.push({ label: 'word · ' + word, problems: ['isNationalityWord returned the wrong answer'] });
  });

  return out;
}

/** Compare two states field by field; returns a list of differences. */
function diff(expected: unknown, actual: unknown, path = '', out: string[] = []): string[] {
  if (typeof expected !== typeof actual) {
    out.push(path + ' (type)');
    return out;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) {
      out.push(`${path} (length ${expected.length} vs ${Array.isArray(actual) ? actual.length : 'none'})`);
      return out;
    }
    expected.forEach((value, index) => diff(value, actual[index], `${path}[${index}]`, out));
    return out;
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      out.push(path + ' (missing)');
      return out;
    }
    Object.keys(expected as Record<string, unknown>).forEach((key) =>
      diff(
        (expected as Record<string, unknown>)[key],
        (actual as Record<string, unknown>)[key],
        path ? path + '.' + key : key,
        out
      )
    );
    return out;
  }
  if (expected !== actual) out.push(path + ': "' + String(expected) + '" → "' + String(actual) + '"');
  return out;
}

function flatten(state: ResumeState): ResumeState {
  // Compare everything the writers and parsers must carry, ignoring ids (parsers cannot know them).
  const clean = JSON.parse(JSON.stringify(state)) as ResumeState;
  const drop = (list: Array<{ id?: string }> | undefined) =>
    (list || []).forEach((item) => {
      delete item.id;
    });
  drop(clean.experience);
  drop(clean.education);
  drop(clean.certifications);
  drop(clean.projects);
  drop(clean.skills);
  return clean;
}

interface BuiltFile {
  name: string;
  blob: Blob;
  file: string;
}

async function* buildAll(state: ResumeState, includeBinary: boolean): AsyncGenerator<BuiltFile> {
  const stamp = '01.jan.2027-10.00';
  yield { name: 'JSON', blob: new Blob([toJson(state)], { type: 'application/json' }), file: stamp + '.json' };
  yield { name: 'Markdown', blob: new Blob([toMarkdown(state)], { type: 'text/markdown' }), file: stamp + '.md' };
  yield { name: 'TXT', blob: new Blob([toPlainText(state)], { type: 'text/plain' }), file: stamp + '.txt' };
  if (!includeBinary) return;

  yield { name: 'PDF', blob: buildPdf(state), file: stamp + '.pdf' };
  yield { name: 'DOCX', blob: buildDocx(state), file: stamp + '.docx' };

  const pages = await buildPngPages(state);
  for (let i = 0; i < pages.length; i += 1) {
    yield {
      name: 'PNG page ' + (i + 1),
      blob: pages[i],
      file: stamp + (pages.length > 1 ? '-' + (i + 1) : '') + '.png'
    };
  }

  const jsonBytes = new Uint8Array(await new Blob([toJson(state)]).arrayBuffer());
  const mdBytes = new Uint8Array(await new Blob([toMarkdown(state)]).arrayBuffer());
  yield {
    name: 'ZIP bundle',
    blob: new Blob([createZip([
      { name: stamp + '.json', data: jsonBytes },
      { name: stamp + '.md', data: mdBytes }
    ])], { type: 'application/zip' }),
    file: stamp + '.zip'
  };
}

/** Deterministic pseudo-random generator, so a failing variant can be reproduced. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Ada Lovelace', 'Åse Möller', '李小龙', 'Zoë d’Arc', 'محمد الأحمد', 'Jean-Luc Picard|X'];
const BULLETS = [
  'Cut cycle time 30% across 4 lines.',
  'A bullet with a | pipe | and a — dash.',
  '短句：提升 25%。',
  'No numbers here at all, just a duty.',
  'A very long bullet that runs on and on about process, documentation, and the many meetings required to keep a programme of work moving forward together.'
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function randomState(rng: () => number, index: number): ResumeState {
  const pick = <T,>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const roleCount = Math.floor(rng() * 3);
  const roles = Array.from({ length: roleCount }, (unused, at) => ({
    id: 'r' + at,
    role: rng() > 0.2 ? pick(['Test engineer', 'Validation lead', 'QA manager']) : '',
    company: rng() > 0.2 ? 'Company ' + at : '',
    location: rng() > 0.5 ? 'Remote' : 'Munich, Germany',
    start: rng() > 0.15 ? pick(MONTHS) + ' ' + (2014 + Math.floor(rng() * 10)) : '',
    end: rng() > 0.5 ? pick(MONTHS) + ' ' + (2018 + Math.floor(rng() * 6)) : '',
    current: rng() > 0.7,
    highlights: Array.from({ length: Math.floor(rng() * 4) }, () => pick(BULLETS)).join('\n'),
    tags: rng() > 0.5 ? 'HiL, CANoe, ISO 26262' : ''
  }));

  const skills = Array.from({ length: Math.floor(rng() * 4) }, (unused, at) => ({
    id: 's' + at,
    label: pick(['Languages', 'Platforms', 'Skills', '']),
    items: rng() > 0.4 ? pick(['TypeScript, SQL, Go', 'TypeScript, SQL, Go, Rust', '', 'German, English']) : ''
  }));

  const profileData = profile(pick(NAMES), {
    headline: rng() > 0.2 ? pick(['Test engineer', '', 'Validation manager | HiL']) : '',
    email: rng() > 0.15 ? 'user' + index + '@example.com' : '',
    summary: rng() > 0.3 ? pick(['Short summary.', '', 'A longer summary with | a pipe and 中文.']) : ''
  });

  const state = sampleState(profileData, pick(REGIONS));
  state.experience = roles;
  state.skills = skills;
  state.certifications =
    rng() > 0.5
      ? [
          {
            id: 'c' + index,
            name: 'Old cert',
            issuer: rng() > 0.5 ? 'Issuer' : '',
            date: 'Jan 2015',
            expires: 'Jan 2016',
            link: ''
          }
        ]
      : [];
  state.education =
    rng() > 0.4
      ? [
          {
            id: 'f' + index,
            school: 'TU Ilmenau',
            degree: 'MSc',
            field: 'Automotive',
            location: 'Ilmenau',
            start: '2018',
            end: '2022',
            details: ''
          }
        ]
      : [];
  return state;
}

/** The screening report must never throw or leave the 0–100 range. */
function checkInvariants(state: ResumeState): string[] {
  const problems: string[] = [];
  let report;
  try {
    report = evaluateResume(state);
  } catch (error) {
    const message = error && (error as Error).message ? (error as Error).message : String(error);
    return ['evaluateResume threw: ' + message];
  }

  if (!Number.isFinite(report.score) || report.score < 0 || report.score > 100) {
    problems.push('headline out of range: ' + report.score);
  }
  if (!Array.isArray(report.checks) || report.checks.length < 11) {
    problems.push('checks missing: ' + (report.checks ? report.checks.length : 'none'));
  }

  const region = report.checks.find((check) => check.id === 'region');
  if (!region) problems.push('no regional fit check');
  else if (!Number.isFinite(region.score) || region.score < 0 || region.score > 100) {
    problems.push('regional fit out of range: ' + region.score);
  }

  report.checks.forEach((check) => {
    if (!check.id) problems.push('check without an id');
    if (!check.name) problems.push('check without a name: ' + check.id);
    if (!Array.isArray(check.findings)) problems.push('check without findings: ' + check.id);
    if (!Number.isFinite(check.score) || check.score < 0 || check.score > 100) {
      problems.push('check out of range: ' + check.id + ' = ' + check.score);
    }
  });

  return problems;
}

export interface RoundTripResult {
  label: string;
  ok: boolean;
  problems: string[];
}

export interface TestReport {
  ok: boolean;
  passed: number;
  total: number;
  results: RoundTripResult[];
  failures: RoundTripResult[];
  variants: number;
  invariantsPassed: number;
  invariantsTotal: number;
  invariantFailures: RoundTripResult[];
  /** The nationality lexicon cases: sentences read, and sentences that must not be. */
  lexiconPassed: number;
  lexiconTotal: number;
  lexiconFailures: RoundTripResult[];
}

export async function runRoundTrip(): Promise<TestReport> {
  const results: RoundTripResult[] = [];
  const invariantFailures: RoundTripResult[] = [];
  let variants = 0;
  let invariantsPassed = 0;
  let invariantsTotal = 0;

  const record = (label: string, problems: string[]) => {
    const entry = { label, ok: problems.length === 0, problems: problems.slice(0, 6) };
    results.push(entry);
    return entry;
  };

  const recordInvariants = (label: string, state: ResumeState) => {
    invariantsTotal += 1;
    const problems = checkInvariants(state);
    if (problems.length) invariantFailures.push({ label, ok: false, problems: problems.slice(0, 6) });
    else invariantsPassed += 1;
  };

  /* --- 1: every region, with that market's profile fields --- */
  const bases = [profile('Ada Lovelace'), profile('Åse Möller'), profile('李小龙')];

  for (let batch = 0; batch < REGIONS.length; batch += 1) {
    const region = REGIONS[batch];
    const base = bases[batch % bases.length];
    const state = sampleState(regionProfile(base, region, batch === 0), region);
    variants += 1;
    recordInvariants('invariants · ' + region.toUpperCase(), state);

    // The binary writers are slow, so they run for one region only.
    for await (const item of buildAll(state, batch === 0)) {
      const bytes = new Uint8Array(await item.blob.arrayBuffer());
      try {
        const imported = await parseImportBytes(item.file, bytes);
        record(
          region.toUpperCase() + ' · ' + item.name,
          diff(flatten(state), flatten(imported.state as ResumeState))
        );
      } catch (error) {
        const message = error && (error as Error).message ? (error as Error).message : String(error);
        record(region.toUpperCase() + ' · ' + item.name, [message]);
      }
    }
  }

  /* --- 2: random variants, deterministic seed --- */
  const rng = mulberry32(20261121);
  for (let index = 0; index < 8; index += 1) {
    const state = randomState(rng, index);
    variants += 1;
    const label = 'random #' + (index + 1) + ' · ' + state.settings.region.toUpperCase();
    recordInvariants('invariants · ' + label, state);

    const writers = [
      { name: 'JSON', text: toJson(state), file: 'random.json' },
      { name: 'Markdown', text: toMarkdown(state), file: 'random.md' },
      { name: 'TXT', text: toPlainText(state), file: 'random.txt' }
    ];

    for (const writer of writers) {
      try {
        const bytes = new TextEncoder().encode(writer.text);
        const imported = await parseImportBytes(writer.file, bytes);
        record(label + ' · ' + writer.name, diff(flatten(state), flatten(imported.state as ResumeState)));
      } catch (error) {
        const message = error && (error as Error).message ? (error as Error).message : String(error);
        record(label + ' · ' + writer.name, [message]);
      }
    }
  }

  /* --- 3: three markets with their own text, a portrait, and every export --- */
  const regional = regionalState();
  variants += 1;
  recordInvariants('invariants · per-region texts', regional);

  const regionExports = [
    { name: 'JSON', text: toJson(regional), file: 'per-region.json' },
    { name: 'Markdown', text: toMarkdown(regional), file: 'per-region.md' },
    { name: 'TXT', text: toPlainText(regional), file: 'per-region.txt' },
    { name: 'full backup', text: fullBackupJson(regional), file: 'per-region-full-backup.json' }
  ];

  for (const writer of regionExports) {
    try {
      const bytes = new TextEncoder().encode(writer.text);
      const imported = await parseImportBytes(writer.file, bytes);
      record('per-region · ' + writer.name, regionalDiff(regional, imported.state as ResumeState));
    } catch (error) {
      const message = error && (error as Error).message ? (error as Error).message : String(error);
      record('per-region · ' + writer.name, [message]);
    }
  }

  /* --- 4: the per-field notes that replaced the general region warning --- */
  const noteProblems: string[] = [];
  try {
    const notes = regionFieldNotes(regional);
    const summary = notes.find((note) => note.path === 'profile.summary');
    if (!summary) noteProblems.push('no note under the summary, although three markets word it differently');
    else if (summary.region) noteProblems.push('a note about three markets offers a single market to open');
    if (notes.some((note) => note.path === 'profile.email')) {
      noteProblems.push('a note under the email, although every market holds the same address');
    }
    const quiet = regionFieldNotes({ ...regional, settings: { ...regional.settings, syncRegions: true } });
    if (quiet.length) noteProblems.push('notes appear while sync is on');
  } catch (error) {
    noteProblems.push(error && (error as Error).message ? (error as Error).message : String(error));
  }
  record('per-region · field notes', noteProblems);

  /* --- 5: the portrait in the writers, in a market that expects one --- */
  const portraitProblems: string[] = [];
  try {
    /* An opaque square, because a transparent test image would leave the PNG page
       looking exactly the same and prove nothing. */
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(0, 0, 8, 8);
    }

    const withPhoto = sampleState(regionProfile(profile('Portrait Test'), 'gcc', false), 'gcc');
    withPhoto.profile.photo = ctx ? canvas.toDataURL('image/png') : TINY_PNG;
    withPhoto.profile.photoFull = withPhoto.profile.photo;

    const without: ResumeState = JSON.parse(JSON.stringify(withPhoto)) as ResumeState;
    without.profile.photo = '';
    without.profile.photoFull = '';

    const pdfWith = new Uint8Array(await buildPdf(withPhoto).arrayBuffer());
    const pdfWithout = new Uint8Array(await buildPdf(without).arrayBuffer());
    if (pdfWith.length <= pdfWithout.length) portraitProblems.push('the PDF does not carry the portrait');

    const docxWith = new Uint8Array(await buildDocx(withPhoto).arrayBuffer());
    const docxWithout = new Uint8Array(await buildDocx(without).arrayBuffer());
    if (docxWith.length <= docxWithout.length) portraitProblems.push('the DOCX does not carry the portrait');

    const pngWith = await buildPngPages(withPhoto);
    const pngWithout = await buildPngPages(without);
    if (!pngWith.length || !pngWithout.length) {
      portraitProblems.push('the PNG writer returned no page');
    } else {
      /* Pixels, not size: a page with a portrait on it cannot be the same image. */
      const withBytes = new Uint8Array(await pngWith[0].arrayBuffer());
      const bareBytes = new Uint8Array(await pngWithout[0].arrayBuffer());
      const same =
        withBytes.length === bareBytes.length && withBytes.every((byte, index) => byte === bareBytes[index]);
      if (same) portraitProblems.push('the PNG does not carry the portrait');
    }

    /* The portrait must not break the data that rides beside it. */
    const back = await parseImportBytes('portrait.pdf', pdfWith);
    diff(flatten(withPhoto), flatten(back.state as ResumeState), 'portrait', portraitProblems);
    if (without.profile.photo === withPhoto.profile.photo) portraitProblems.push('the test state has no portrait to prove');
  } catch (error) {
    portraitProblems.push(error && (error as Error).message ? (error as Error).message : String(error));
  }
  record('portrait · PDF, DOCX and PNG', portraitProblems);

  /* --- 6: the nationality lexicon --- */
  const lexiconFailures = lexiconProblems().map((item) => ({ label: item.label, ok: false, problems: item.problems }));
  const lexiconTotal = LEXICON_CASES.length + 6;
  const lexiconPassed = lexiconTotal - lexiconFailures.length;

  const failures = results.filter((item) => !item.ok);
  const passed = results.length - failures.length;

  return {
    ok: failures.length === 0 && invariantFailures.length === 0 && lexiconFailures.length === 0,
    passed,
    total: results.length,
    results,
    failures,
    variants,
    invariantsPassed,
    invariantsTotal,
    invariantFailures,
    lexiconPassed,
    lexiconTotal,
    lexiconFailures
  };
}

export function formatReport(report: TestReport): string {
  const lines = report.results.map(
    (item) => (item.ok ? '✓ ' : '✗ ') + item.label + (item.ok ? '' : ' — ' + item.problems.join(' · '))
  );

  const invariantLines = report.invariantFailures.map((item) => '✗ ' + item.label + ' — ' + item.problems.join(' · '));
  const lexiconLines = report.lexiconFailures.map((item) => '✗ ' + item.label + ' — ' + item.problems.join(' · '));

  return [
    `${report.ok ? 'ALL PASS' : 'FAILURES'} — ${report.passed}/${report.total} round trips exact across ${report.variants} variants`,
    `invariants — ${report.invariantsPassed}/${report.invariantsTotal} screening reports sane`,
    `lexicon — ${report.lexiconPassed}/${report.lexiconTotal} readings correct`,
    '',
    ...lines,
    ...(invariantLines.length ? ['', 'invariant failures', ...invariantLines] : []),
    ...(lexiconLines.length ? ['', 'lexicon failures', ...lexiconLines] : [])
  ].join('\n');
}

export const TEST_VERSION = APP_VERSION;
