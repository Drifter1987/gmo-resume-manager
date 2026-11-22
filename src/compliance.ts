import type { ResumeState } from './types';
import { parseMonth, REGION_PROFILES } from './screening';
import { missingRequiredFields } from './fields';
import { detailPhrase } from './context';
import { splitLines, splitList } from './util';

export type ComplianceSeverity = 'fail' | 'warn';

export type ComplianceArea = 'profile' | 'experience' | 'education' | 'certifications' | 'projects' | 'skills';

export interface ComplianceIssue {
  /** What is wrong, in one sentence. */
  text: string;
  severity: ComplianceSeverity;
  /** Preview anchor (a data-r-anchor value) of the field this is about. */
  anchor?: string;
  /** Editor field path (a data-path value) of the same field. */
  path?: string;
  /** Tab the field lives in. */
  area: ComplianceArea;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_LIKE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;
const MAX_BULLET_WORDS = 40;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isUrl(value: string): boolean {
  return URL_LIKE.test(value.trim());
}

function monthIndexNow(): number {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth();
}

/**
 * The conventions a resume is expected to follow, checked field by field so that
 * the preview and the editor can both mark the exact places that break them.
 * Everything is derived from what the user typed; nothing leaves the browser.
 */
export function complianceIssues(state: ResumeState): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const p = state.profile;
  const nowIndex = monthIndexNow();

  /* --- profile --- */

  const name = p.name.trim();
  if (!name) {
    issues.push({
      area: 'profile',
      severity: 'fail',
      anchor: 'name',
      path: 'profile.name',
      text: 'No name: the first line of a resume is the name, in the largest type on the page.'
    });
  } else {
    if (name.length > 50) {
      issues.push({
        area: 'profile',
        severity: 'warn',
        anchor: 'name',
        path: 'profile.name',
        text: 'The name line is ' + name.length + ' characters; keep it to the name alone.'
      });
    }
    if (/@|\+\d|\d{4,}/.test(name)) {
      issues.push({
        area: 'profile',
        severity: 'warn',
        anchor: 'name',
        path: 'profile.name',
        text: 'The name field holds a contact detail; email and phone belong on the contact line.'
      });
    }
  }

  const headline = p.headline.trim();
  if (!headline) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'headline',
      path: 'profile.headline',
      text: 'No headline: the line under the name should say which role you are applying for.'
    });
  } else if (headline.length > 120) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'headline',
      path: 'profile.headline',
      text: 'The headline runs to ' + headline.length + ' characters; about 120 still gets read.'
    });
  }

  const email = p.email.trim();
  if (!email) {
    issues.push({
      area: 'profile',
      severity: 'fail',
      anchor: 'contact',
      path: 'profile.email',
      text: 'No email address: it is the one contact detail every reader needs.'
    });
  } else if (!EMAIL.test(email)) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'contact',
      path: 'profile.email',
      text: 'The email address does not look complete.'
    });
  }

  const phone = p.phone.trim();
  if (!phone) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'contact',
      path: 'profile.phone',
      text: 'No phone number on the contact line.'
    });
  } else if (phone.replace(/\D/g, '').length < 7) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'contact',
      path: 'profile.phone',
      text: 'The phone number looks too short to dial.'
    });
  }

  if (!p.location.trim()) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'contact',
      path: 'profile.location',
      text: 'No location; a city and a country is what a reader expects.'
    });
  }

  const website = p.website.trim();
  if (website && !isUrl(website)) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'contact',
      path: 'profile.website',
      text: 'The website is not a link yet; write it as ada.dev or https://ada.dev.'
    });
  }

  const linkedin = p.linkedin.trim();
  if (linkedin && !isUrl(linkedin)) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'contact',
      path: 'profile.linkedin',
      text: 'The LinkedIn entry is not a link yet; write it as linkedin.com/in/you.'
    });
  }

  const summary = p.summary.trim();
  if (!summary) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'summary',
      path: 'profile.summary',
      text: 'No summary: one short paragraph of positioning is expected at the top.'
    });
  } else if (summary.length < 40) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'summary',
      path: 'profile.summary',
      text: 'The summary is ' + summary.length + ' characters — a sentence or two, not a fragment.'
    });
  } else if (summary.length > 600) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'summary',
      path: 'profile.summary',
      text: 'The summary runs to ' + summary.length + ' characters; a skim reader stops at about 600.'
    });
  }

  /* --- the fields this market requires, filled in the builder --- */

  const region = REGION_PROFILES[state.settings.region] || REGION_PROFILES.emea;
  missingRequiredFields(state).forEach((spec) => {
    // The hint already sits under the field, so the note only says what is missing.
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'contact',
      path: 'profile.' + spec.key,
      text: spec.label + ' is required in ' + region.label + '.'
    });
  });

  /* Free text is the one place a filtered-out detail can still reach the paper:
     the hidden fields never print, but a summary sentence does. Read what the text
     states rather than the words in it, and quote the evidence in the finding. */
  const freeText = [p.name, p.headline, p.summary, p.location].join(' ');
  const nationalityPhrase = detailPhrase(freeText, 'nationality');
  const birthPhrase = detailPhrase(freeText, 'birth');
  const maritalPhrase = detailPhrase(freeText, 'marital');

  if (region.id === 'us' && nationalityPhrase) {
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'summary',
      path: 'profile.summary',
      text:
        'The summary states nationality (“' +
        nationalityPhrase +
        '”), which this market filters out. Move it to the nationality field for markets that expect it, or take it out of the summary.'
    });
  }
  if ((region.id === 'us' || region.id === 'anz') && (birthPhrase || maritalPhrase)) {
    const quotes = [birthPhrase, maritalPhrase].filter(Boolean).map((phrase) => '“' + phrase + '”');
    issues.push({
      area: 'profile',
      severity: 'warn',
      anchor: 'summary',
      path: 'profile.summary',
      text: 'The summary or headline states ' + quotes.join(' and ') + ', which this market filters out.'
    });
  }

  /* --- experience --- */

  state.experience.forEach((item, index) => {
    const anchor = 'experience:' + item.id;
    const base = 'experience.' + index;

    if (!item.role.trim()) {
      issues.push({
        area: 'experience',
        severity: 'fail',
        anchor,
        path: base + '.role',
        text: 'No job title in this role, so a parser has nothing to file it under.'
      });
    }
    if (!item.company.trim()) {
      issues.push({
        area: 'experience',
        severity: 'warn',
        anchor,
        path: base + '.company',
        text: 'No employer named in this role.'
      });
    }

    const hasStart = Boolean(item.start.trim());
    const hasEnd = Boolean(item.end.trim());

    if (!hasStart) {
      issues.push({
        area: 'experience',
        severity: 'fail',
        anchor,
        path: base + '.start',
        text: 'No start date, so the timeline cannot place this role.'
      });
    }
    if (!item.current && !hasEnd) {
      issues.push({
        area: 'experience',
        severity: 'fail',
        anchor,
        path: base + '.end',
        text: 'No end date, and the role is not marked as the current one.'
      });
    }
    if (item.current && hasEnd) {
      issues.push({
        area: 'experience',
        severity: 'warn',
        anchor,
        path: base + '.end',
        text: 'Marked as the current role but it carries an end date; drop one of the two.'
      });
    }
    if (hasStart && hasEnd) {
      const start = parseMonth(item.start);
      const end = parseMonth(item.end);
      if (start && end && !end.open && end.index < start.index) {
        issues.push({
          area: 'experience',
          severity: 'warn',
          anchor,
          path: base + '.end',
          text: 'The end date comes before the start date.'
        });
      }
    }

    const bullets = splitLines(item.highlights);
    if (!bullets.length) {
      issues.push({
        area: 'experience',
        severity: 'warn',
        anchor,
        path: base + '.highlights',
        text: 'This role carries no achievement lines.'
      });
    }
    bullets.forEach((line, at) => {
      const count = wordCount(line);
      if (count > MAX_BULLET_WORDS) {
        issues.push({
          area: 'experience',
          severity: 'warn',
          anchor: anchor + ':b' + at,
          path: base + '.highlights',
          text: 'Bullet ' + (at + 1) + ' runs to ' + count + ' words; a bullet reads best under about 40.'
        });
      }
    });
  });

  /* --- education --- */

  state.education.forEach((item, index) => {
    const anchor = 'education:' + item.id;
    const base = 'education.' + index;

    if (!item.school.trim() && !item.degree.trim()) {
      issues.push({
        area: 'education',
        severity: 'fail',
        anchor,
        path: base + '.school',
        text: 'This entry names neither a school nor a degree.'
      });
    } else if (!item.school.trim()) {
      issues.push({
        area: 'education',
        severity: 'warn',
        anchor,
        path: base + '.school',
        text: 'No school named in this education entry.'
      });
    }

    const startYear = item.start.trim();
    const endYear = item.end.trim();
    if (!startYear || !endYear) {
      issues.push({
        area: 'education',
        severity: 'warn',
        anchor,
        path: base + (startYear ? '.end' : '.start'),
        text: 'Education is missing a start or end year.'
      });
    } else {
      const start = parseMonth(startYear);
      const end = parseMonth(endYear);
      if (start && end && end.index < start.index) {
        issues.push({
          area: 'education',
          severity: 'warn',
          anchor,
          path: base + '.end',
          text: 'The end year comes before the start year.'
        });
      }
    }

    splitLines(item.details).forEach((line, at) => {
      const count = wordCount(line);
      if (count > MAX_BULLET_WORDS) {
        issues.push({
          area: 'education',
          severity: 'warn',
          anchor: anchor + ':b' + at,
          path: base + '.details',
          text: 'Note ' + (at + 1) + ' runs to ' + count + ' words; keep education notes to one line.'
        });
      }
    });
  });

  /* --- certifications --- */

  state.certifications.forEach((item, index) => {
    const anchor = 'certifications:' + item.id;
    const base = 'certifications.' + index;

    if (!item.name.trim()) {
      issues.push({
        area: 'certifications',
        severity: 'fail',
        anchor,
        path: base + '.name',
        text: 'This certification has no name.'
      });
    }
    if (!item.issuer.trim()) {
      issues.push({
        area: 'certifications',
        severity: 'warn',
        anchor,
        path: base + '.issuer',
        text: 'A certification without an issuer cannot be verified.'
      });
    }
    if (!item.date.trim()) {
      issues.push({
        area: 'certifications',
        severity: 'warn',
        path: base + '.date',
        text: 'Certification ' + (index + 1) + ' has no issue date.'
      });
    }

    const expires = item.expires.trim();
    const expiry = expires ? parseMonth(expires) : null;
    if (expiry && !expiry.open && expiry.index < nowIndex) {
      // A warning, not a failure: an expired certificate is a record to correct, not a
      // breach of resume convention, and no guidance scores it against the candidate.
      issues.push({
        area: 'certifications',
        severity: 'warn',
        anchor,
        path: base + '.expires',
        text: 'This certification expired in ' + expires + '; update the date if it was renewed, or remove it.'
      });
    }

    if (item.link.trim() && !isUrl(item.link)) {
      issues.push({
        area: 'certifications',
        severity: 'warn',
        anchor,
        path: base + '.link',
        text: 'The credential link is not a URL yet.'
      });
    }
  });

  /* --- projects --- */

  state.projects.forEach((item, index) => {
    const anchor = 'projects:' + item.id;
    const base = 'projects.' + index;

    if (!item.name.trim()) {
      issues.push({
        area: 'projects',
        severity: 'warn',
        anchor,
        path: base + '.name',
        text: 'A project without a name cannot be listed.'
      });
    }
    if (item.link.trim() && !isUrl(item.link)) {
      issues.push({
        area: 'projects',
        severity: 'warn',
        anchor,
        path: base + '.link',
        text: 'The project link is not a URL yet.'
      });
    }
    if (!item.description.trim()) {
      issues.push({
        area: 'projects',
        severity: 'warn',
        anchor,
        path: base + '.description',
        text: 'No description: one line on what the project does and why it matters.'
      });
    }
  });

  /* --- skills --- */

  const seenSkills = new Map<string, number[]>();
  state.skills.forEach((group, index) => {
    splitList(group.items).forEach((raw) => {
      const key = raw.trim().toLowerCase();
      if (!key) return;
      const list = seenSkills.get(key) || [];
      list.push(index);
      seenSkills.set(key, list);
    });
  });

  state.skills.forEach((group, index) => {
    const anchor = 'skills:' + group.id;
    const base = 'skills.' + index;
    const items = splitList(group.items);

    if (!group.label.trim()) {
      issues.push({
        area: 'skills',
        severity: 'warn',
        anchor,
        path: base + '.label',
        text: 'This skill group has no label.'
      });
    }
    if (!items.length) {
      issues.push({
        area: 'skills',
        severity: 'warn',
        anchor,
        path: base + '.items',
        text: 'This skill group is empty.'
      });
    } else if (items.length > 12) {
      issues.push({
        area: 'skills',
        severity: 'warn',
        anchor,
        path: base + '.items',
        text: 'This group lists ' + items.length + ' skills; under a dozen keeps it scannable.'
      });
    }

    const repeats: string[] = [];
    items.forEach((raw) => {
      const key = raw.trim().toLowerCase();
      const groups = seenSkills.get(key) || [];
      if (key && groups.length > 1 && repeats.indexOf(raw.trim()) === -1) repeats.push(raw.trim());
    });
    if (repeats.length) {
      issues.push({
        area: 'skills',
        severity: 'warn',
        anchor,
        path: base + '.items',
        text: 'Repeated in more than one group: ' + repeats.slice(0, 5).join(', ') + '.'
      });
    }
  });

  return issues;
}
