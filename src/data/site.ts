export const site = {
  name: "Yariv Itzkovich",
  shortName: "Yariv",
  establishedYear: 2026,
  positioningSentence: {
    en: "I study how mistreatment spills over in organizations — and whether AI can mitigate it.",
    he: "אני חוקר כיצד התנהגות פוגענית גולשת בארגונים — ועד כמה בינה מלאכותית יכולה לצמצם אותה.",
  },
  bio: {
    en: "Associate Editor at the Journal of Managerial Psychology. Faculty in Human Resources Management & Organizational Development at Ariel University. Practitioner-scholar at the intersection of research on workplace harm and tools that might reduce it.",
    he: "עורך משנה ב-Journal of Managerial Psychology. חבר סגל בחוג למנהל משאבי אנוש ופיתוח ארגוני באוניברסיטת אריאל. חוקר-יישומן העוסק בתפר שבין מחקר פגיעה בעבודה לבין כלים שעשויים להקל עליה.",
  },
  affiliation: {
    en: "Ariel University",
    he: "אוניברסיטת אריאל",
  },
  location: {
    en: "Israel · UTC+2",
    he: "ישראל · UTC+2",
  },
  email: "Yarivi@ariel.ac.il",
  profiles: {
    googleScholar: "https://scholar.google.com/citations?user=HyN_EIgAAAAJ",
    orcid: "",
    researchGate: "",
    linkedin: "",
    github: "",
    mastodon: "",
    bluesky: "",
  },
  totalPublicationsOverride: 28, // until content collection is wired up
  headshot: "/images/headshot.jpg",
  // Section visibility toggles. Set any to `false` to hide that section even
  // when its data is non-empty. Sections also auto-hide when their data is empty.
  display: {
    headshot: true,
    atPresent: true,
    fieldsOfInquiry: true,
    now: true,
    selectedWriting: true,
    footerProfiles: true,
    findCv: true,
  },
} as const;

export type SiteConfig = typeof site;
