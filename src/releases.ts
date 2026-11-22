import { APP_VERSION } from './version';

export interface Release {
  version: string;
  name: string;
  summary: string;
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    version: '2.13.0',
    name: 'A backup that keeps the photo, and checks that read the sentence',
    summary: 'A full backup restores the resume on another device with the portrait at full quality, and every free-text check now reads what the CV actually states instead of matching words.',
    notes: [
      'New Full backup with photo, in Settings → Data and in the Export panel: one .json carrying every field, every setting and both copies of the portrait — the small display one for the paper, and the upload kept whole. Import it on another device and the resume returns exactly, picture included.',
      'The upload is now stored twice on purpose: a 320px display copy for the paper, and the original untouched (re-encoded at 1600px only when the file is too large to keep). Markdown and TXT exports carry the same snapshot, so they restore the photo too.',
      'Free-text detection moved to a new context module: a detail counts only when the sentence states it, and the finding quotes the words that triggered it. "Open to relocation" is no longer read as a nationality, "citizen developer" is no longer a passport, "single-page application" is no longer a marital status, and a bare "available" no longer satisfies the references check.',
      'The US nationality warning now names its evidence: it quotes the phrase it found instead of asserting a category.',
      'Hidden region fields still cannot cost points or print, and the structured fields in the builder take priority over anything sniffed from the summary.'
    ]
  },
  {
    version: '2.12.1',
    name: 'The test suite covers every market and random data',
    summary: 'Verify now runs the whole chain across all six markets and eight seeded random resumes, and checks that the screening report stays sane on all of them.',
    notes: [
      'Every market is now round-tripped with the profile fields that market expects — photo, nationality, work authorisation, availability, date of birth and marital status — so the region-driven fields are exercised rather than assumed.',
      'Eight deterministic random resumes are generated with awkward data: umlauts, CJK names, pipe characters, empty sections, expired certificates, duplicated skills, missing titles and dates.',
      'Each variant is checked twice: JSON, Markdown and TXT export and import back field by field, and the screening report is checked for sane invariants — a headline inside 0–100, every check named, every score in range, and the regional fit check present.',
      'The nine original formats across three profiles still run, and the binary writers (PDF, DOCX, PNG, ZIP) still go through one full pass.',
      'One button, one report: Settings → Data → Verify export / import now says how many variants passed and whether the screening reports stayed sane.'
    ]
  },
  {
    version: '2.12.0',
    name: 'The builder asks for what each market needs',
    summary: 'Picture, nationality, visa status and availability appear only in the markets that expect them, and two new modes guide you through filling them in.',
    notes: [
      'Region details in Profile: the builder now shows only the fields the selected market expects. GCC asks for a photo, nationality, visa or residency status and availability, all required. ANZ asks for right to work. EMEA, APAC and LATAM offer a photo, date of birth and marital status as optional. US shows none, and says why.',
      'A required field that is still empty is flagged by the regulations check and costs the Regional fit check its points, so the builder, the score and the paper agree.',
      'Photo upload downscales to 320px before it is stored, so a portrait does not fill localStorage. The photo appears in the resume header, and nationality, work status and availability on their own line.',
      'Guided mode: an optional panel at the top of the builder walks through the sections in the order the checks read them, with a progress bar, a done/not-done state per step and Back / Open section / Next.',
      'App tour: ten stops that highlight the dock, the builder, the preview, the region button, the issues toggle, Save, Import, Export, Screening and Settings. It runs once on a first visit and can be replayed from Settings → Guidance.',
      'Markdown and TXT exports now carry the logistics line, so a Gulf or ANZ version keeps its nationality and availability when it leaves the app.'
    ]
  },
  {
    version: '2.11.2',
    name: 'Evidence, labelled honestly',
    summary: 'Each published source now says what kind of evidence it is, and the guide says what the research does not support.',
    notes: [
      'Every source carries a label: peer-reviewed, government guidance, industry study, vendor guidance, vendor data or regulation. A vendor’s pipeline statistics are not an audited sample, and the app now says so instead of presenting every figure as settled.',
      'Re-checked the claims against the web while finishing this: NACE’s 70% skills-based hiring and 42% GPA screening are confirmed on NACE’s own Job Outlook 2026 page.',
      'The guide names what the research does not support: the widely repeated “75% of resumes are rejected by an ATS” has no published method behind it, traces to a vendor that no longer exists, and is not used anywhere in the app.',
      'The AI prompt gets the same caution, so a model reviewing your CV will not repeat the myth either.'
    ]
  },
  {
    version: '2.11.1',
    name: 'The last card without a source',
    summary: 'Timeline was the one check whose standard was not named on the card. It cites the ATS parsing statistic now, so all twelve checks trace to a published source.',
    notes: [
      'Timeline now carries its “Based on” line: Coversentry’s ATS statistics, where 23% of rejections are parsing failures and unreadable dates are one of them. Dates that a parser cannot read are the same dates a screener cannot follow.',
      'Checked against the running app: twelve of twelve checks name a source, and the scoring guide lists the ten standards behind them.'
    ]
  },
  {
    version: '2.11.0',
    name: 'Every rule now cites its source',
    summary: 'Ten published sources, researched this month, are built into the checks: the 75% keyword match, the 7.4-second skim, the .42 interview validity, the two-page preference, and the AI hiring laws.',
    notes: [
      'Researched and encoded: Jobscan’s 75% match-rate target, Coversentry’s 2026 ATS statistics (23% of rejections are parsing failures, 43% are unrelated to qualifications, measurable achievements rank first at 58.2%), the Ladders 2018 eye-tracking study (7.4 seconds on the first screen), Sackett et al. 2022 on structured-interview validity (.42 against .19), US OPM on anchored rubrics, Google re:Work on standardised scoring, NACE Job Outlook 2026 on skills-based hiring (70%, up from 65%), the ResumeGo two-page study (preferred 2.3 to 1), NYC Local Law 144 and the EU AI Act.',
      'The Rubric check now uses the published threshold: a pass at 75% keyword coverage, a warning from 65%, and the finding states the 75% target rather than the old 70%.',
      'New ATS rule from published practice: the posting’s own job title must appear in the headline or summary, because that is what parsers index and what a recruiter reads first. Missing it costs 10 points and names the field to fix.',
      'New ATS advice line: short terms are flagged when they never appear with their long form, since older parsers such as Taleo and Lever index the two separately. Advice only, never a deduction.',
      'Every check card now carries a “Based on” line naming the published standard behind it, so a score can be traced to a source without leaving the app.',
      'The scoring guide gains a “Published standards this app follows” section: one collapsible entry per source with what it says, the rule it set here, and a link to the source itself.',
      'The AI prompt now lists all ten standards with their claims and the rule each one set, and asks the model to say which standard a verdict rests on.'
    ]
  },
  {
    version: '2.10.0',
    name: 'The headline follows the market, and the checks fold away',
    summary: 'The overall score is now weighted by the market you select, and every check card collapses to its headline so the tab is quick to navigate.',
    notes: [
      'One headline, weighted per market: each check counts by a multiplier set for that region, and the market’s own rules carry the largest share (×4). A CV that is strong overall but weak on a market’s own rules no longer hides behind a flat average.',
      'The multipliers reflect what each market screens hardest: keyword and ATS match in the US, credentials and language levels in the Gulf, qualifications in APAC, referees and STAR depth in ANZ, exact dates and gaps in EMEA.',
      'The guide now lists the multiplier for every check inside each region, so the headline can be reconstructed by hand.',
      'Screening check cards are collapsible: a clean check folds down to its score, name and verdict, and any check with a warning or failure opens itself.',
      'Two controls above the list — Expand all and Collapse all — replace scrolling through eleven open cards on a phone.',
      'The overall bar now reads "the weighted average for this market", and each region states both its own fit score and the headline it produces.'
    ]
  },
  {
    version: '2.9.3',
    name: 'Two numbers, named',
    summary: 'The guide now says what each figure is: the market’s own fit score, and the overall score Screening shows.',
    notes: [
      'The guide pill used to show a bare number that read like the Screening score. It now reads "fit 85" and is labelled Regional fit in each market.',
      'Every region also states both figures: regional fit for that market’s own rules, and the overall score there across all eleven scored checks — which is why a market can read 85 in the guide and 99 in Screening.',
      'The note at the top of the window explains the difference instead of implying the two numbers were the same.'
    ]
  },
  {
    version: '2.9.2',
    name: 'The scoring guide, region by region',
    summary: 'A window that explains every market’s scoring in full: one collapsible section per region, the criteria as subtitles, and the points each one carries.',
    notes: [
      'New "How each region is scored" window, opened from Screening and from Settings — the same window from both places.',
      'Each region is a collapsible heading carrying its live score for this resume; the section opens on the market you have selected and lists that market first.',
      'Inside a region, each scoring criterion is a subtitle with what the market expects, how the app measures it, what passes, and its weight.',
      'Every weight is read from one shared table in the code, so the explanation cannot drift from the score.',
      'Each market also lists which expectations the other checks already measure — ATS parse, recruiter skim, achievements, timeline, certifications — and the recruiter’s checklist for that market.',
      'The guide states how the overall score is built: the average of the scored checks, with Regional fit as one of them.'
    ]
  },
  {
    version: '2.9.1',
    name: 'Pick a market, change the rules',
    summary: 'A region button in the preview header now drives the screening score and rewrites the AI prompt for that market and for the file you attach.',
    notes: [
      'New region button in the preview header, next to the regulations toggle: it names the current market and opens a list of EMEA, US, GCC, APAC, LATAM and ANZ, each with a line on what that market expects. It stays reachable while you edit, and the same choice is still in Screening.',
      'Choosing a region now scores the resume against that market, not just its page count. Regional fit is a scored check: page ceiling, personal details (asked for in the GCC, filtered out in the US and ANZ), language levels, referees and availability where the market wants them, and month-and-year dates in EMEA.',
      'The weights are explicit: a page over the market ceiling costs 25, missing nationality or work authorisation in the GCC costs 25, stating nationality where the US or ANZ filters it costs 15, missing language levels 15, missing referees or availability 10, a bare year instead of month and year in EMEA 10.',
      'The card now spells out the checklist that market works through, so the reason for a score is on the page rather than implied.',
      'The AI prompt is rebuilt per region: it states the market, its page range, personal-detail rule, language expectation, references practice, date convention and the numbered checklist a recruiter there works through, plus a tenth scoring method for market fit.',
      'The prompt now reads the file you attach: it explains both formats, how the .md is read and how the .json data is structured, what to do if both are attached, and that the hidden snapshot is not part of the resume.',
      'The prompt also carries the measurements the app has already made — pages, roles, quantified bullets, keyword coverage and the regional score — as facts the model must not contradict.'
    ]
  },
  {
    version: '2.9.0',
    name: 'Grounded in real ATS and regional practice',
    summary: 'Every check was audited against published ATS behaviour and current CV practice in EMEA, US, GCC, APAC, LATAM and ANZ. A lapsed certificate warns and never costs points.',
    notes: [
      'Researched against Jobscan and ATS guidance, certification guidance (Rezi, ResumeMate, Resumly, CareerScribe) and regional CV guides for EMEA, US, GCC, APAC, LATAM and ANZ.',
      'Expired certificates are warning only. No guideline scores a lapsed certificate: it is an accuracy problem with three fixes — renew, remove, or label it expired or renewal in progress. The Certifications check removes no points and the regulations flag is amber, not red.',
      'New Hiring region selector in Screening with a Regional fit card: page range, whether personal details belong on the page, language expectations and references practice, and what this resume already states. The card is informational and never scored.',
      'The page ceiling follows the market: two pages for US and EMEA, three for GCC, APAC, LATAM and ANZ. One page over costs 10, two or more costs 25, instead of a flat 25 above two pages.',
      'The ATS card adds a file-format note: a text-based PDF, or .docx where the employer still runs an older system such as Taleo, never an image PDF.',
      'The LLM prompt names the target region so the model applies that market conventions.'
    ]
  },
  {
    version: '2.8.4',
    name: 'An expired certificate is a note, not a mark down',
    summary: 'Expired certificates now warn without costing points, after checking what US, EU, GCC and APAC guidance actually says about them.',
    notes: [
      'The Certifications check was taking 20 points per expired certificate. No guideline supports that: the sources treat an expired certificate as an accuracy problem — the date is stale, the certificate was renewed without updating the record, or it should be removed — not as a competence gap. It now warns, names the certificate, and deducts nothing.',
      'The warning says what to do: correct the expiry date if it was renewed, or remove the entry, so it never reads as current.',
      'The regulations check agrees: an expired certificate is a warning rather than a serious failure, so it no longer counts toward the "N serious" tally.',
      'Where a job legally requires a current ticket — high-voltage authorisation, NDT, a scheme-bound auditor certificate — that stays a requirement of that advert, not a universal scoring rule.'
    ]
  },
  {
    version: '2.8.3',
    name: 'The shell holds still',
    summary: 'On a desktop the two panes now fill the screen and scroll on their own, the dock no longer shows the resume through it, and the editor has a scroll handle.',
    notes: [
      'The page used to grow to the height of the resume, so the document scrolled while the editor stayed put: the paper was cut off at the dock and the two columns drifted apart. The app is now exactly one screen tall, the editor and the preview scroll inside their own panes, and the dock always sits over empty space.',
      'The preview header with the regulations toggle sticks to the top of the preview pane, so "Highlight issues" stays reachable however far you scroll.',
      'The dock is all but opaque: resume text no longer shows through the bar behind the tabs and buttons.',
      'Both panes draw a scroll handle, so the editor visibly scrolls instead of looking like a page with nothing below the fold.',
      'The sub-tab strip sticks flush to the top of the editor instead of being clipped in half when you scroll.',
      'A generated file name in the Export panel stays on one line now, instead of breaking in the middle of the surname.',
      'Printing is untouched: the print stylesheet still lifts the height and overflow off the page.'
    ]
  },
  {
    version: '2.8.2',
    name: 'Checks that tell the truth',
    summary: 'The timeline no longer invents overlaps, the skim score now counts a long headline, expired certificates are caught, and the finding arrows stopped wrapping onto their own line.',
    notes: [
      'Merging overlapping roles wrote back into the ranges it had just merged, so the Timeline card reported overlaps between roles that merely touch — one ends the month the next begins. The merge works on copies now and the overlap count runs on the untouched dates.',
      'An empty resume no longer scores full marks on the ATS check: with no roles it says so and loses the same 20 points a parser would.',
      'Recruiter skim: a headline over 120 characters now costs 10 points, as its own finding already warned, instead of warning and scoring 100.',
      'Certifications: a certificate past its expiry date is reported and costs 20 points, because an expired high-voltage or safety ticket fails a customer audit.',
      'The ↗ on a tappable Screening finding is pinned to the corner of the line instead of flowing as text, so it can no longer wrap onto a line of its own and look like an empty bullet.',
      'Keyboard users can see focus on the Import button in the dock: the invisible file input passes its focus ring to the label around it.'
    ]
  },
  {
    version: '2.8.1',
    name: 'Study years count, and a paste-ready resume',
    summary: 'The Timeline check now counts degrees, courses and preparation years as covered time, and Settings can load a whole resume from pasted JSON.',
    notes: [
      'A gap between roles that falls inside a degree, a language course or a preparation year is no longer reported as a hole: time in education is covered time, and the finding says so.',
      'A bare year now reads as the whole year: "2016" as an end date means December 2016, so a degree that ran to 2016 no longer leaves an eleven-month hole before the next entry.',
      'Settings → Data has a paste box: paste a resume JSON and press Load pasted JSON to replace every field at once. The version it replaces is saved into History first.',
      'Education entries keep a year-only entry valid: an entry with a start and an end year no longer has to carry exact months.'
    ]
  },
  {
    version: '2.8.0',
    name: 'One dock, a share sheet, a rules check',
    summary: 'Download now opens the iPhone share sheet, the top header is gone, and a toggle marks every field that breaks a resume rule.',
    notes: [
      'Download hands the finished file to the system share sheet — Files, Mail, Messages, WhatsApp, contacts and the rest — instead of a sheet with Open and Copy. When sharing is unavailable, the sheet offers Save to Files, Copy text and a Share button that retries with a fresh tap.',
      'The top header is removed: the brand, the saved status, the section tabs and the build number now share the single dock at the bottom, two rows on a phone and one on a desktop.',
      'Every button is redesigned: one size and focus ring everywhere, a quiet primary action, icon-and-label dock buttons with a 38px touch target, and ghost/danger variants that match.',
      'Duplicate controls are gone: Settings is a tab and no longer also a dock button, and Print is removed because PDF export covers it. Dead handlers were dropped with it.',
      'Tapping a Screening finding now scrolls the live preview to the exact line and keeps it highlighted until the Screening tab is left, instead of a one-second flash.',
      'New regulations check: a toggle in the preview header flags every field that breaks a resume convention, in the preview and in the form. Missing headline, contact or summary show as dashed placeholders; missing or reversed dates, bullets over 40 words, expired certificates, malformed links and duplicated skills are marked too. Tapping a marked line opens that field in the editor.'
    ]
  },
  {
    version: '2.7.2',
    name: 'Tap a finding, see the line',
    summary: 'Findings in the Screening tab are tappable: they scroll the live preview to the exact role, entry or line they concern.',
    notes: [
      'Every finding now knows where it lives in the resume — a missing phone jumps to the contact line, a thin role jumps to that role, certificate groups in Skills jump to the Skills table.',
      'The spot flashes briefly in the preview so you can see what the finding means.'
    ]
  },
  {
    version: '2.7.1',
    name: 'Honest screening numbers',
    summary: 'The Achievements word counts and the Certifications check now read this resume correctly.',
    notes: [
      'Bullet word counts were split on commas and always reported 1 word; they split on spaces now.',
      'Certificates stored as groups in the Skills section are detected and reported as unverifiable there, with a pointer to the Certifications tab.'
    ]
  },
  {
    version: '2.7.0',
    name: 'Screening checks',
    summary: 'A Screening tab that scores the resume against the methods recruiters use, with a ready LLM prompt.',
    notes: [
      'New Screening tab: ATS parse, recruiter skim, rubric against the advert, achievements, timeline, STAR readiness, skills, certifications, portfolio links, a blind-screening view, and length.',
      'Set the target role and the advert keywords; the rubric re-scores as you type and both fill the LLM prompt.',
      'The LLM section builds a ready-to-send prompt: copy it, export the .md, and attach both to any chat model.'
    ]
  },
  {
    version: '2.6.4',
    name: 'Layout polish',
    summary: 'Small fixes: the Black & white label, sticky panels on phones and the verify row.',
    notes: [
      'Settings → Resume colour showed "Black &amp; white" literally; it reads "Black & white" now.',
      'On phones the section rail and the sub-tab strips no longer let scrolled content peek around or slide beneath them.',
      'The Verify export / import button and its explanation sit on one tidy row.'
    ]
  },
  {
    version: '2.6.3',
    name: 'Import that actually opens',
    summary: 'The file input now sits invisibly on top of the Import button.',
    notes: [
      'The previous label pointed at an input parked off-screen, which iOS refused to open.',
      'The input is now an invisible layer over the Import control itself, so a tap opens the picker directly.'
    ]
  },
  {
    version: '2.6.2',
    name: 'The live site builds again',
    summary: 'The built app is published into the repository and the root page forwards to it.',
    notes: [
      'The deployed site was serving the raw source, so the stylesheet and script 404ed at the domain root.',
      'The workflow now commits the built site to dist/ and the root index.html forwards to it, which works under either Pages source setting.',
      'The workflow rebases before pushing so the bot commit never blocks a later push.'
    ]
  },
  {
    version: '2.6.1',
    name: 'Import opens the picker again',
    summary: 'Import is a native file control, the sheet offers Open, and Share is gone.',
    notes: [
      'Import is now a real file control in the dock instead of a scripted click on a hidden input, so iOS opens the picker reliably.',
      'The file picker accepts .json, .md, .txt, .pdf, .docx, .png and .zip by extension.',
      'The finished-file sheet offers Open only, which is the action that works in the app.',
      'The Share button is removed; Download is the single way to produce a file.'
    ]
  },
  {
    version: '2.6.0',
    name: 'Colour or black & white, and import from every export',
    summary: 'A resume colour setting that drives the preview and every export, and every exported format imports back.',
    notes: [
      'New Settings → Resume colour: Colour or Black & white. It changes the live preview, PDF, PNG and DOCX exports together; in Black & white every line of text, rule and heading is plain black on white.',
      'PDF, DOCX and PNG exports now carry the full resume snapshot inside the file (PDF keywords, DOCX document properties, a PNG text chunk), so they import back exactly. A ZIP bundle imports too.',
      'Import recognises files by their content rather than their name, and rebuilds the same preview: content, order, typeface, density, colour mode and section switches.',
      'Markdown and TXT exports write certifications as a proper table / delimited rows with the link kept, escape pipes, and keep multi-paragraph summaries; the fallback parsers read them back without the hidden data block.',
      'PDF, PNG and DOCX now follow the typeface and density settings and draw certifications as a real table. Accents and umlauts survive in the PDF; DOCX keeps dashes and symbols.',
      'Import no longer rewrites valid certificate links, and dates such as “Oct 2020 to Present” split correctly.'
    ]
  },
  {
    version: '2.5.4',
    name: 'Back to a plain main branch',
    summary: 'The page lives at the repository root again, with no build output committed.',
    notes: [
      'index.html is at the root of the repository, next to src/, exactly as before.',
      'Build output is no longer committed; the workflow builds and publishes it without touching the branch.',
      'The root redirect page and the extra src/index.html are gone.'
    ]
  },
  {
    version: '2.5.3',
    name: 'Aligned skill columns',
    summary: 'Every skill value starts at the same column in the PDF and PNG.',
    notes: [
      'The skills block measures its widest label once and uses that as the column, so values line up instead of stepping in and out.',
      'Rows whose label is wider than the column still put the value on its own line, wrapped.'
    ]
  },
  {
    version: '2.5.2',
    name: 'Skills wrap in the PDF and PNG',
    summary: 'Long skill labels no longer collide with their values or get clipped at the page edge.',
    notes: [
      'Skill rows now measure the label, wrap the value into the remaining width, and drop the value onto its own line when the label is long.',
      'Role headings keep a block of space at the foot of a page, so a heading no longer sits alone while its bullets start the next page.',
      'Same fix in both PDF and PNG output.'
    ]
  },
  {
    version: '2.5.1',
    name: 'Calmer colours, clean page breaks',
    summary: 'A warmer sage palette, and PDF/PNG entries no longer collide with their dates or run past the page.',
    notes: [
      'The bright glowing green is gone; surfaces, accents and the backdrop use a warm sage and amber palette that is easier on the eyes.',
      'PDF and PNG entry headings now measure the date before wrapping the title, so a long certificate or role name can no longer overlap the date.',
      'Both writers keep a safety margin at the foot of the page, so nothing is drawn past the last line.',
      'The build is published into the repository and the root page forwards to it, so the site no longer depends on the Pages source setting.'
    ]
  },
  {
    version: '2.5.0',
    name: 'One export sheet, a left rail, images',
    summary: 'Multi-format export with PNG pages and sharing, a left-hand section rail on desktop, and no duplicated controls.',
    notes: [
      'Export is one panel now: tick any combination of PDF, DOCX, PNG, TXT, Markdown and JSON, then Download or Share. More than one file is bundled into a ZIP.',
      'New PNG export draws one image per A4 page; Share opens the iOS sheet where Save Image puts them in Photos and Save to Files stores them in iCloud Drive.',
      'Files are named Name_dd.mmm.yyyy-hh.mm, with -1, -2 suffixes when the PNG export runs to several pages.',
      'On desktop the section tabs moved to a rail on the left, with the editor beside it and the resume on the right.',
      'Export and History moved inside Settings, so the top level is Profile, Experience, Education, Projects, Skills and Settings.',
      'The duplicate Export, Resume and sample-data buttons are gone; each action now lives in exactly one place.'
    ]
  },
  {
    version: '2.4.1',
    name: 'Release notes look right again',
    summary: 'Restored the card styling for release notes and the changelog, and stopped sub-tab labels wrapping.',
    notes: [
      'Release notes show their version chip, title, summary and bullet list as proper cards again.',
      'Changelog entries are grouped with a rule, version label and entry title on separate lines.',
      'Sub-tab labels stay on one line and the strip scrolls sideways when it has to.'
    ]
  },
  {
    version: '2.4.0',
    name: 'History of saved versions',
    summary: 'A Save button snapshots the whole resume, and old versions can be restored, downloaded or deleted.',
    notes: [
      'New Save button in the dock (and Cmd/Ctrl+S) writes a snapshot of everything: profile, roles, education, certificates, projects, skills and settings.',
      'New History tab lists up to 40 versions, newest first, with restore, download and delete.',
      'Snapshots live only in this browser — nothing is uploaded and the GitHub copy of the app stays empty.',
      'Release notes and Changelog moved inside Settings, so the top row is down to seven tabs.',
      'Settings shows how many versions are stored and how much space they use, with a separate Clear history button.'
    ]
  },
  {
    version: '2.3.2',
    name: 'Table polish',
    summary: 'No stray separators on stacked rows, and only real URLs become credential links.',
    notes: [
      'Stacked certificate rows no longer start their meta line with a lone separator.',
      'Placeholder text in a credential column (a dash, "image certificate") is dropped instead of becoming a broken link.'
    ]
  },
  {
    version: '2.3.1',
    name: 'Repair a table that was imported as text',
    summary: 'A Markdown table imported into a summary is turned into certifications, and long text can no longer spill off the paper.',
    notes: [
      'Loading repairs data that came from a reference document: the heading is trimmed back to the name, and a Markdown table found in the summary becomes certification rows.',
      'Certifications stack into a readable list on narrow screens instead of scrolling sideways.',
      'Long URLs, hashes and titles now wrap inside the paper instead of running past its edge.'
    ]
  },
  {
    version: '2.3.0',
    name: 'Fewer tabs, a real table',
    summary: 'Related sections now share a tab, and certifications render as a proper table.',
    notes: [
      'Education and Certifications live in one tab with a switch between them; Releases and Changelog do the same.',
      'Certifications render as a four-column table — certification, issuer, issued, expires — instead of a wrapped list.',
      'Markdown tables under a Certifications heading are imported row by row.',
      'The dock is down to four buttons; the sample resume now lives in the Export tab.'
    ]
  },
  {
    version: '2.2.0',
    name: 'Certifications get their own section',
    summary: 'Licences and certificates are no longer squeezed into the skills list.',
    notes: [
      'New Certifications tab with name, issuer, issue date, expiry and credential link per entry.',
      'The resume shows them as a compact list under Education, so a long certificate list stays readable.',
      'Certifications are included in PDF, DOCX, Markdown and TXT exports, and imported from all of them.',
      'Settings gained a switch to hide the Certifications section.'
    ]
  },
  {
    version: '2.1.1',
    name: 'One-line title',
    summary: 'The app title stays on one row, and Markdown import keeps multi-paragraph summaries.',
    notes: [
      'The “Résumé Manager” title no longer wraps onto two lines, at any width.',
      'Markdown imports now keep every paragraph of a summary instead of only the first line.',
      'Contact lines with a comma-separated location import the whole location, not just the first part.'
    ]
  },
  {
    version: '2.1.0',
    name: 'Export for real',
    summary: 'Working PDF and DOCX exports, a separate Export tab, settings, and a docked toolbar.',
    notes: [
      'PDF export now builds a real PDF in the browser instead of relying on the print dialog, which did nothing in the app’s web view.',
      'New DOCX and TXT exports alongside Markdown and JSON.',
      'A separate Export tab collects every format and the importer, with drag and drop.',
      'A Settings tab with theme, typeface, density, section visibility and data controls.',
      'The section tabs now sit at the top of the app, with Settings on the far right.',
      'A docked bottom toolbar holds the global actions and the build number.',
      'The active tab, scroll positions and every field you typed persist across tab switches and reloads.',
      'Markdown and TXT exports carry a hidden copy of the full data set, so any export rebuilds the identical preview on another device.'
    ]
  },
  {
    version: '2.0.0',
    name: 'Dark by default',
    summary: 'A green-black theme with gold headings, a WebGL backdrop, and a home for every change.',
    notes: [
      'Dark theme is now the default, with a greenish palette and yellow-orange headings.',
      'Animated three.js / WebGL backdrop of drifting data points behind the whole app.',
      'New Releases and Changelog tabs, inside the app, with the full version history.',
      'Build number shown in the footer of every screen, injected at build time.',
      'The app is now built with Vite and TypeScript around the same framework-free UI.'
    ]
  },
  {
    version: '1.1.0',
    name: 'Getting it off the device',
    summary: 'Export the resume as Markdown, move the tracker between devices, and start from an example.',
    notes: [
      'Markdown download of the whole resume, grouped by section.',
      'JSON export and import, with tolerant normalization of older files.',
      'Example data so a new user can see the shape of a finished resume.',
      'Deletes now ask for confirmation and entries can be reordered.'
    ]
  },
  {
    version: '1.0.0',
    name: 'First release',
    summary: 'Profile, experience, education, projects and skills, with a live resume preview.',
    notes: [
      'Editing sections with a live resume preview beside them.',
      'Experience entries with dates, current-role toggle, highlights and tags.',
      'Skills grouped so the resume stays scannable.',
      'Print / save as PDF, with a print stylesheet that keeps only the resume.',
      'Everything saved locally as you type; no account and no server.'
    ]
  }
];

function renderCard(release: Release): string {
  const isCurrent = release.version === APP_VERSION;
  return `<article class="rel-card${isCurrent ? ' is-current' : ''}">
    <div class="rel-head">
      <span class="rel-version">v${release.version}</span>
      ${isCurrent ? '<span class="rel-badge">Current</span>' : ''}
    </div>
    <h3 class="rel-name">${release.name}</h3>
    <p class="rel-summary">${release.summary}</p>
    <ul class="rel-notes">${release.notes.map((note) => `<li>${note}</li>`).join('')}</ul>
  </article>`;
}

export function releasesEditor(): string {
  return `
    <div class="panel-head">
      <h2>Release notes</h2>
      <p class="panel-sub">What shipped in each version, newest first. The build you are running is marked.</p>
    </div>
    <div class="rel-list">${RELEASES.map(renderCard).join('')}</div>
  `;
}

export function changelogEditor(): string {
  const groups = RELEASES.map((release) => {
    const isCurrent = release.version === APP_VERSION;
    return `<div class="cl-group">
      <div class="cl-head">
        <span class="cl-version">v${release.version}</span>
        ${isCurrent ? '<span class="rel-badge">Current</span>' : ''}
        <span class="cl-kind">${release.name}</span>
      </div>
      <ul class="cl-items">${release.notes.map((note) => `<li>${note}</li>`).join('')}</ul>
    </div>`;
  }).join('');

  return `
    <div class="panel-head">
      <h2>Changelog</h2>
      <p class="panel-sub">Every shipped version of GMO Résumé Manager, in order. Add an entry to
      <code>src/releases.ts</code> when you ship something new.</p>
    </div>
    <div class="rel-list">${groups}</div>
  `;
}
