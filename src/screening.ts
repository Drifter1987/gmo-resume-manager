import type { ResumeState } from './types';
import { splitLines, splitList } from './util';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface Finding {
  status: CheckStatus;
  text: string;
  /** Anchor inside the resume preview (a data-r-anchor value): tapping the finding scrolls there and flashes it. */
  target?: string;
}

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  score: number;
  summary: string;
  findings: Finding[];
}

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

interface Interval {
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

function mergedInterval(intervals: Interval[]): { intervals: Interval[]; totalMonths: number } {
  if (!intervals.length) return { intervals: [], totalMonths: 0 };
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const out: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = out[out.length - 1];
    if (sorted[i].start <= last.end) last.end = Math.max(last.end, sorted[i].end);
    else out.push({ ...sorted[i] });
  }
  const totalMonths = out.reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
  return { intervals: out, totalMonths };
}

export function evaluateResume(state: ResumeState): ScreeningReport {
  const p = state.profile;
  const checks: CheckResult[] = [];
  const roles = state.experience;
  const now = new Date();
  const nowIndex = now.getFullYear() * 12 + now.getMonth();

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
    rolesWithoutTitle || rolesWithoutDate
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

  const atsScore = clamp(
    100 -
      (p.name.trim() ? 0 : 30) -
      missingContact.length * 8 -
      rolesWithoutTitle * 6 -
      rolesWithoutDate * 6 -
      schoolsWithoutName * 6 -
      (state.skills.length ? 0 : 10)
  );
  checks.push({
    id: 'ats',
    name: 'ATS parse',
    status: statusFor(atsScore),
    score: atsScore,
    summary: 'What an applicant tracking system can read from this resume.',
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

  const skimScore = clamp(
    100 -
      (headline ? 0 : 35) -
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
      status: coverage.ratio >= 0.7 ? 'pass' : coverage.ratio >= 0.4 ? 'warn' : 'fail',
      text: `${coverage.matched.length} of ${coverage.matched.length + coverage.missing.length} target terms appear (${Math.round(
        coverage.ratio * 100
      )}%).`,
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
    findings: achievementFindings
  });

  /* --- timeline --- */
  const { intervals, unknown } = experienceIntervals(state);
  const merged = mergedInterval(intervals);
  const totalYears = Math.round((merged.totalMonths / 12) * 10) / 10;
  const gaps: string[] = [];
  for (let i = 1; i < merged.intervals.length; i += 1) {
    const gap = merged.intervals[i].start - merged.intervals[i - 1].end;
    if (gap > 6) gaps.push(gap + ' months');
  }
  const overlaps = intervals.filter((item, index) =>
    intervals.some((other, otherIndex) => otherIndex !== index && item.start < other.end && other.start < item.end)
  ).length;

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
    timelineFindings.push({ status: 'pass', text: 'No gaps longer than six months between roles.', target: 'experience' });
  }
  const timelineScore = clamp(
    100 - gaps.length * 15 - unknown.length * 15 - (intervals.length ? 0 : 40) + (overlaps ? 0 : 0)
  );
  checks.push({
    id: 'timeline',
    name: 'Timeline',
    status: statusFor(timelineScore),
    score: timelineScore,
    summary: 'Whether the dates add up, without unexplained gaps.',
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
    findings: skillFindings
  });

  /* --- certifications --- */
  const certs = state.certifications.filter((item) => item.name.trim());
  const linkedCerts = certs.filter((item) => item.link.trim() !== '');

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
  const lengthFindings: Finding[] = [];
  lengthFindings.push({
    status: pages <= 2 ? 'pass' : 'warn',
    text: `About ${words} words, roughly ${pages} page(s) — one to two pages suits most roles.`
  });
  lengthFindings.push({
    status: longest > 45 ? 'warn' : 'pass',
    text: longest ? `Longest bullet: ${longest} words.` : 'No bullets yet.'
  });
  const lengthScore = clamp(100 - (pages > 2 ? 25 : 0) - (longest > 45 ? 15 : 0));
  checks.push({
    id: 'length',
    name: 'Length and format',
    status: statusFor(lengthScore),
    score: lengthScore,
    summary: 'A rough length and density check.',
    findings: lengthFindings
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

  const scored = checks.filter((check) => check.id !== 'llm' && check.status !== 'info');
  const score = scored.length ? Math.round(scored.reduce((sum, check) => sum + check.score, 0) / scored.length) : 0;

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

  const lines: string[] = [];
  lines.push('You are an experienced technical recruiter and hiring manager. I am attaching my resume as a Markdown file.');
  lines.push('Evaluate it strictly against the methods below and return the scored table first, then the findings.');
  lines.push('');
  lines.push('## Target');
  lines.push('Role: ' + (target || 'not specified — infer from the headline'));
  lines.push('Advert keywords: ' + (keywords.length ? keywords.join(', ') : 'not specified'));
  lines.push('');
  lines.push('## Methods to apply');
  lines.push('1. ATS parse — would a parser read name, contact, titles, employers, dates and skills correctly?');
  lines.push('2. Recruiter skim — what survives a 10 second first pass?');
  lines.push('3. Rubric — score coverage of each advert keyword: matched, partially matched, missing.');
  lines.push('4. Achievements — is each bullet an outcome with a number, or a duty?');
  lines.push('5. Timeline — do the dates add up, are there gaps or overlaps needing an explanation?');
  lines.push('6. Structured interview — which bullets would survive STAR probing, which are too thin?');
  lines.push('7. Skills — breadth, grouping, duplication, keyword stuffing.');
  lines.push('8. Certifications — verifiable or not.');
  lines.push('9. Length and format — pages, bullets that are too long, readability.');
  lines.push('');
  lines.push('## Output');
  lines.push('Return a Markdown table with the columns: Method | Score (0-100) | Verdict | Main reason.');
  lines.push('Then, for each method that scores below 80, list the specific lines to change and a rewrite of each weak bullet.');
  lines.push('Then give the three changes that would most improve the score, in order.');
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
  lines.push('The attached Markdown file is the resume. Read it fully before scoring.');

  return lines.join('\n');
}
