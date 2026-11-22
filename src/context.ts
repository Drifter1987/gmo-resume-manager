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
  /\bvisa[- ]free\b/gi,
  /* Nationality adjectives that name something else. A "Chinese wall" is a compliance
     barrier, a "French drain" is plumbing and "German measles" is a disease: all three
     turn up on engineering and finance CVs, and none of them is a nationality. */
  /\bchinese (?:walls?|whispers|boxes|burn|checkers|remainder)\b/gi,
  /\bfrench (?:drains?|press|toast|fries|braid|curve|door|polish|horn|seam|window|cuff)\b/gi,
  /\bgerman (?:measles|shepherd|silver|wheel|pancake|chocolate)\b/gi,
  /\bdutch (?:auctions?|oven|angle|bargain|treat|courage|uncle|door|barn|cap|gold|rush|baby)\b/gi,
  /\bindian (?:summers?|file|filing|giver|sign|burn|rope trick|reservation|club|elephant|walk|head)\b/gi,
  /\bbritish (?:thermal|pound|pounds|columbia|shorthair|gas|rail)\b/gi,
  /\bspanish (?:fly|flu|moss|omelette|rice|inquisition|steps|broom)\b/gi,
  /\bgr[ae]cian (?:urn|formula)\b/gi,
  /\bturkish (?:delight|bath|towel|coffee|corn)\b/gi,
  /\bwelsh (?:rarebit|onion|dresser|harp|cake|corgi|terrier)\b/gi,
  /\birish (?:stew|coffee|setter|wolfhound|bull|moss|linen|pub)\b/gi,
  /\bscottish (?:fold|terrier|widow|mile|bond)\b/gi,
  /\bdanish (?:pastry|pastries|blue|crown|oil|krone|design)\b/gi,
  /\bswedish (?:fish|massage|meatballs?|ivy|mile|krona|bikini)\b/gi,
  /\bpole position\b/gi
];

const PHRASE_LIMIT = 52;

/**
 * Nationality adjectives and nouns, worldwide. The list exists so a lower-case entry
 * ("chinese", "lebanese", "brasilian") is still read as a nationality, and so the
 * "nationality: …" key form recognises a value the generic rule would miss.
 */
const NATIONALITY_WORDS = [
  'Abkhaz', 'Afghan', 'Ainu', 'Albanian', 'Algerian', 'American', 'Amazigh', 'Andorran', 'Angolan',
  'Anguillan', 'Antiguan', 'Argentine', 'Argentinian', 'Armenian', 'Aruban', 'Assyrian', 'Australian',
  'Austrian', 'Azerbaijani', 'Bahamian', 'Bahraini', 'Baloch', 'Bangladeshi', 'Barbadian', 'Barbudan',
  'Basque', 'Belarusian', 'Belgian', 'Belizean', 'Beninese', 'Bermudian', 'Bhutanese', 'Bolivian', 'Bosnian',
  'Botswanan', 'Brazilian', 'Brasilian', 'British', 'Briton', 'Bruneian', 'Bulgarian', 'Burkinabé', 'Burmese',
  'Burundian', 'Caymanian', 'Cambodian', 'Cameroonian', 'Canadian', 'Catalan', 'Chadian', 'Chaldean',
  'Chechen', 'Chilean', 'Chinese', 'Colombian', 'Comorian', 'Congolese', 'Cook Islander', 'Corsican',
  'Costa Rican', 'Cossack', 'Croatian', 'Cuban', 'Curaçaoan', 'Cypriot', 'Czech', 'Dane', 'Danish',
  'Djiboutian', 'Dominican', 'Druze', 'Dutch', 'Dutchman', 'Ecuadorian', 'Egyptian', 'Emirati', 'English',
  'Equatorial Guinean', 'Eritrean', 'Estonian', 'Ethiopian', 'Falkland Islander', 'Faroese', 'Fijian',
  'Filipino', 'Finn', 'Finnish', 'French', 'Frisian', 'Gabonese', 'Gambian', 'Georgian', 'German', 'Ghanaian',
  'Gibraltarian', 'Greek', 'Greenlandic', 'Grenadian', 'Guamanian', 'Guatemalan', 'Guinean', 'Bissau-Guinean',
  'Guyanese', 'Haitian', 'Hmong', 'Honduran', 'Hong Konger', 'Hungarian', 'Icelandic', 'Icelander', 'Indian',
  'Indonesian', 'Iranian', 'Iraqi', 'Irish', 'Israeli', 'Italian', 'Ivorian', 'Jamaican', 'Japanese',
  'Jordanian', 'Kanak', 'Kashmiri', 'Kazakh', 'Kenyan', 'Kiribati', 'Kittitian', 'Kosovar', 'Kurd', 'Kurdish',
  'Kuwaiti', 'Kyrgyz', 'Ladin', 'Lao', 'Latvian', 'Lebanese', 'Liberian', 'Libyan', 'Liechtensteiner',
  'Lithuanian', 'Luxembourgish', 'Macedonian', 'Macanese', 'Malagasy', 'Malawian', 'Malaysian', 'Maldivian',
  'Malian', 'Maltese', 'Manx', 'Maronite', 'Marshallese', 'Mauritanian', 'Mauritian', 'Mexican', 'Micronesian',
  'Moldovan', 'Monégasque', 'Mongolian', 'Montenegrin', 'Montserratian', 'Moroccan', 'Mozambican', 'Myanmar',
  'Namibian', 'Nauruan', 'Nepali', 'Nevisian', 'New Caledonian', 'New Zealander', 'Nicaraguan', 'Nigerien',
  'Nigerian', 'Niuean', 'North Korean', 'Norwegian', 'Omani', 'Ossetian', 'Pakistani', 'Palauan',
  'Palestinian', 'Panamanian', 'Papua New Guinean', 'Paraguayan', 'Pashtun', 'Peruvian', 'Pole', 'Polish',
  'Portuguese', 'Puerto Rican', 'Qatari', 'Réunionese', 'Rohingya', 'Roma', 'Romanian', 'Russian', 'Rwandan',
  'Sahrawi', 'Saint Helenian', 'Saint Lucian', 'Salvadoran', 'Samoan', 'Sámi', 'Sami', 'Sardinian', 'Saudi',
  'Scottish', 'Senegalese', 'Serbian', 'Seychellois', 'Sicilian', 'Sierra Leonean', 'Singaporean', 'Slovak',
  'Slovenian', 'Solomon Islander', 'Somali', 'Sorb', 'South African', 'South Korean', 'South Sudanese',
  'Spaniard', 'Spanish', 'Sri Lankan', 'Sudanese', 'Surinamese', 'Swede', 'Swedish', 'Swiss', 'Syrian',
  'Taiwanese', 'Tajik', 'Tanzanian', 'Tatar', 'Thai', 'Tibetan', 'Tigrayan', 'Timorese', 'Togolese', 'Tokelauan',
  'Tongan', 'Trinidadian', 'Tunisian', 'Turk', 'Turkish', 'Turkmen', 'Turks and Caicos Islander', 'Tuvaluan',
  'Ugandan', 'Ukrainian', 'Uruguayan', 'Uyghur', 'Uzbek', 'Vanuatuan', 'Venezuelan', 'Vietnamese',
  'Vincentian', 'Virgin Islander', 'Welsh', 'Yazidi', 'Yemeni', 'Zambian', 'Zimbabwean', 'Ålander', 'Alander'
];

/**
 * Country names, so "nationality: Germany" and "citizen of Lebanon" are read as the
 * nationality they state, and a value typed in the builder is recognised as one.
 */
const COUNTRY_NAMES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia',
  'Australia', 'Austria', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize',
  'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brasil', 'Brunei', 'Bulgaria',
  'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 'Central African Republic',
  'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus',
  'Czechia', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
  'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland',
  'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea',
  'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq',
  'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati',
  'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta',
  'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia',
  'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands',
  'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland',
  'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia',
  'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'São Tomé and Príncipe', 'Saudi Arabia',
  'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands',
  'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname',
  'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo',
  'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Türkiye', 'Turkmenistan', 'Tuvalu', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu',
  'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
  /* Territories and special regions that appear on CVs as a nationality. */
  'Puerto Rico', 'Bermuda', 'Faroe Islands', 'Greenland', 'Isle of Man', 'Aruba', 'Curaçao', 'Réunion',
  'New Caledonia', 'French Polynesia', 'Kashmir', 'Tibet', 'Gibraltar', 'Falkland Islands', 'Cayman Islands',
  'British Virgin Islands', 'US Virgin Islands', 'Guadeloupe', 'Martinique', 'Guam', 'Jersey', 'Guernsey',
  'Åland'
];

const NATIONALITY_ALT = NATIONALITY_WORDS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length)
  .join('|');

const COUNTRY_ALT = COUNTRY_NAMES.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length)
  .join('|');

/**
 * Nationality is stated as a key with a value, or as a nationality word with
 * national/citizen/passport holder. The negative lookahead stops "Chinese national
 * holiday" and similar from reading as a person's nationality. Every pattern is
 * case-insensitive, so a lower-case "citizen of lebanon" still counts.
 */
const NATIONALITY_STATED: RegExp[] = [
  new RegExp('\\b(?:nationality|citizenship)\\s*(?:[:—–-]|\\bis\\b)\\s*([\\w\\u00C0-\\u024F\'’.-]+(?:\\s+[\\w\\u00C0-\\u024F\'’.-]+){0,2})', 'i'),
  new RegExp(
    '\\b(' + NATIONALITY_ALT + ')\\s+(?:national|citizen|passport holder)\\b(?!\\s+(?:holiday|day|park|grid|bank|railway|standard|anthem|language|team|squad|curriculum|exam|examination|wall|walls|drain|summer|auction|measles))',
    'gi'
  ),
  new RegExp('\\b(' + NATIONALITY_ALT + ')\\s+(?:passport|nationality|citizenship)\\b', 'gi'),
  new RegExp('\\b(?:national|citizen|subject)\\s+of\\s+(?!the\\b|a\\b|an\\b)(' + COUNTRY_ALT + ')\\b', 'gi'),
  /\bcitizen of\s+(?!the\b|a\b|an\b)([\w\u00C0-\u024F'’.-]{2,}(?:\s+[\w\u00C0-\u024F'’.-]+)?)/gi,
  /\bholder of (?:a|an)\s+([\w\u00C0-\u024F'’.-]+)\s+passport\b/gi,
  /\bdual\s+(?:nationality|citizenship)\b/i,
  /* A demonym standing as its own item — the whole line, or between the separators a
     header line uses — states a nationality. A demonym inside a sentence does not:
     "worked with French and German teams" is not a passport, and a language list that
     ends a line is not one either. */
  new RegExp(
    '(?:^|[·•|–—;]\\s*)(' + NATIONALITY_ALT + ')(?=\\s*(?:$|[·•|–—;]))',
    'gim'
  )
];

/** True when a single word is one of the nationalities or country names above. */
export function isNationalityWord(word: string): boolean {
  const needle = String(word || '').trim().toLowerCase();
  if (!needle) return false;
  return (
    NATIONALITY_WORDS.some((entry) => entry.toLowerCase() === needle) ||
    COUNTRY_NAMES.some((entry) => entry.toLowerCase() === needle)
  );
}

/**
 * Whether a value typed into the Nationality field is one the checks can read: a word
 * from the list, a phrasing they accept, or a compound such as "German and Lebanese".
 * The field and the checking therefore read one list, not two.
 */
export function readsAsNationality(value: string): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  if (detailPhrase(text, 'nationality')) return true;
  return text
    .split(/[\s,;/&()+·|]+/)
    .filter(Boolean)
    .some((token) => isNationalityWord(token));
}

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
      .replace(/^[\s·•|–—;]+/, '')
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
