import type { RegionId, ResumeState } from './types';

/**
 * The fields a CV needs in each market. The builder shows only these, so a US
 * resume never offers a photo and a Gulf resume always asks for nationality and
 * work authorisation. Required fields reach the compliance check and the regional
 * score; optional ones are explained but never penalised.
 */
export type RegionFieldKey = 'photo' | 'nationality' | 'workAuth' | 'availability' | 'dateOfBirth' | 'maritalStatus';

export interface RegionFieldSpec {
  key: RegionFieldKey;
  label: string;
  placeholder: string;
  /** Why this market wants it, shown under the field. */
  hint: string;
  required: boolean;
  kind: 'photo' | 'text';
}

const PHOTO_OPTIONAL: RegionFieldSpec = {
  key: 'photo',
  label: 'Profile photo',
  placeholder: '',
  hint: 'Customary in Germany, Austria and Switzerland and in parts of Asia and Latin America; avoided in the UK and Ireland. Optional here.',
  required: false,
  kind: 'photo'
};

const BIRTH_OPTIONAL: RegionFieldSpec = {
  key: 'dateOfBirth',
  label: 'Date of birth',
  placeholder: '14 March 1992',
  hint: 'Still expected in DACH and common in parts of LATAM and APAC; optional, and never shown on a US or UK CV.',
  required: false,
  kind: 'text'
};

const MARITAL_OPTIONAL: RegionFieldSpec = {
  key: 'maritalStatus',
  label: 'Marital status',
  placeholder: 'Single',
  hint: 'Sometimes asked in the Gulf and in parts of Latin America. Optional, and filtered out in the US, UK, Ireland and ANZ.',
  required: false,
  kind: 'text'
};

export const REGION_FIELDS: Record<RegionId, RegionFieldSpec[]> = {
  emea: [
    PHOTO_OPTIONAL,
    {
      key: 'nationality',
      label: 'Nationality',
      placeholder: 'German',
      hint: 'Customary in DACH in a personal-details block. UK and Irish employers leave it off, so it is optional here.',
      required: false,
      kind: 'text'
    },
    BIRTH_OPTIONAL
  ],
  us: [],
  gcc: [
    {
      key: 'photo',
      label: 'Profile photo',
      placeholder: '',
      hint: 'A professional headshot is customary on Gulf CVs and expected by many employers.',
      required: true,
      kind: 'photo'
    },
    {
      key: 'nationality',
      label: 'Nationality',
      placeholder: 'German',
      hint: 'Standard on a Gulf CV: it drives visa mechanics and quota systems such as Saudization and Emiratisation.',
      required: true,
      kind: 'text'
    },
    {
      key: 'workAuth',
      label: 'Visa or residency status',
      placeholder: 'Requires sponsorship',
      hint: 'Tell the employer whether you already hold a visa, a transferable residency or need sponsorship.',
      required: true,
      kind: 'text'
    },
    {
      key: 'availability',
      label: 'Availability',
      placeholder: 'From March 2026, notice period two months',
      hint: 'Gulf recruiters screen on availability and notice period before the first call.',
      required: true,
      kind: 'text'
    },
    MARITAL_OPTIONAL
  ],
  apac: [PHOTO_OPTIONAL, BIRTH_OPTIONAL],
  latam: [PHOTO_OPTIONAL, BIRTH_OPTIONAL, MARITAL_OPTIONAL],
  anz: [
    {
      key: 'workAuth',
      label: 'Right to work',
      placeholder: 'Australian permanent resident',
      hint: 'State whether you are a citizen, a resident or hold a visa: locally advertised roles rarely sponsor.',
      required: true,
      kind: 'text'
    }
  ]
};

export function regionFields(region: RegionId | undefined): RegionFieldSpec[] {
  return REGION_FIELDS[region || 'emea'] || REGION_FIELDS.emea;
}

/** True when the profile has a value for this field. */
export function hasRegionField(state: ResumeState, key: RegionFieldKey): boolean {
  const profile = state.profile as unknown as Record<string, string | undefined>;
  return Boolean(String(profile[key] || '').trim());
}

/**
 * A field's value, but only when the selected market actually shows that field.
 * A value left behind in a hidden field must never reach the paper or the score:
 * switching from the Gulf to the US hides nationality, and the US CV must not print it.
 */
export function visibleValue(state: ResumeState, key: RegionFieldKey): string {
  if (!regionFields(state.settings.region).some((spec) => spec.key === key)) return '';
  const profile = state.profile as unknown as Record<string, string | undefined>;
  return String(profile[key] || '').trim();
}

/** The photo, only in a market that expects one. */
export function visiblePhoto(state: ResumeState): string {
  return visibleValue(state, 'photo');
}

/** Required fields for the selected market that the profile still lacks. */
export function missingRequiredFields(state: ResumeState): RegionFieldSpec[] {
  return regionFields(state.settings.region).filter((spec) => spec.required && !hasRegionField(state, spec.key));
}

/** One line for the resume and the exports: nationality, authorisation, availability. */
export function logisticsLine(state: ResumeState): string {
  const parts: string[] = [];
  const nationality = visibleValue(state, 'nationality');
  const workAuth = visibleValue(state, 'workAuth');
  const availability = visibleValue(state, 'availability');
  if (nationality) parts.push(/national/i.test(nationality) ? nationality : nationality + ' national');
  if (workAuth) parts.push(workAuth);
  if (availability) parts.push(availability);
  return parts.join(' · ');
}
