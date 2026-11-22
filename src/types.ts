export interface Profile {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  summary: string;
  /** Region-driven fields. Only the ones the selected market expects are shown in the builder. */
  /** Data URL of the profile photo, already downscaled before it is stored. */
  photo: string;
  /** The upload kept whole, so a full backup restores the picture at its original quality. */
  photoFull: string;
  nationality: string;
  /** Visa, residency or right-to-work wording. */
  workAuth: string;
  /** Notice period or start date. */
  availability: string;
  dateOfBirth: string;
  maritalStatus: string;
}

export interface ExperienceItem {
  id: string;
  role: string;
  company: string;
  location: string;
  start: string;
  end: string;
  current: boolean;
  highlights: string;
  tags: string;
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  field: string;
  location: string;
  start: string;
  end: string;
  details: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  link: string;
  description: string;
  tech: string;
}

export interface SkillGroup {
  id: string;
  label: string;
  items: string;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
  expires: string;
  link: string;
}

export type ColorMode = 'color' | 'bw';

/** Hiring region: drives length norms and the regional fit notes in Screening. */
export type RegionId = 'emea' | 'us' | 'gcc' | 'apac' | 'latam' | 'anz';

export interface Settings {
  theme: 'dark' | 'light';
  /** Resume colour: coloured accents, or strictly black text on white. Applies to preview and exports. */
  colorMode: ColorMode;
  font: 'sans' | 'serif';
  density: 'comfortable' | 'compact';
  showSummary: boolean;
  showTags: boolean;
  /** Target role for the screening checks and the LLM prompt. */
  target: string;
  /** Comma-separated advert keywords for the rubric check. */
  keywords: string;
  /** Market the application targets: EMEA, US, GCC, APAC, LATAM or ANZ. */
  region: RegionId;
  /** On: one text for every market. Off: each market keeps its own text. */
  syncRegions: boolean;
  sections: {
    experience: boolean;
    education: boolean;
    certifications: boolean;
    projects: boolean;
    skills: boolean;
  };
}

export interface ResumeState {
  profile: Profile;
  experience: ExperienceItem[];
  education: EducationItem[];
  certifications: CertificationItem[];
  projects: ProjectItem[];
  skills: SkillGroup[];
  settings: Settings;
  /**
   * The text each market keeps while "Sync all regions" is off. The selected market's
   * document lives at the top level as usual; this holds the others. Empty while sync
   * is on, because then there is only one text for every market.
   */
  regions: Partial<Record<RegionId, RegionContent>>;
}

/** The part of the resume that can differ per market: content, never appearance or settings. */
export interface RegionContent {
  profile: Profile;
  experience: ExperienceItem[];
  education: EducationItem[];
  certifications: CertificationItem[];
  projects: ProjectItem[];
  skills: SkillGroup[];
}
