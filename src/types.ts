export interface Profile {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  summary: string;
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

export interface Settings {
  theme: 'dark' | 'light';
  font: 'sans' | 'serif';
  density: 'comfortable' | 'compact';
  showSummary: boolean;
  showTags: boolean;
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
}
