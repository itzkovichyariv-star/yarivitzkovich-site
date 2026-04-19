export const site = {
  name: "Yariv Itzkovich",
  shortName: "Yariv",
  establishedYear: 2026,
  positioningSentence: {
    en: "I study how mistreatment moves through organizations — and whether machines can learn to interrupt it.",
    he: "אני חוקר כיצד פגיעה נעה בארגונים — והאם מכונות יכולות ללמוד לעצור אותה.",
  },
  bio: {
    en: "Associate Editor at the Journal of Managerial Psychology. Faculty in Human Resources Management & Organizational Development at Ariel University. Practitioner-scholar working at the seam between research on workplace harm and tools that might ease it.",
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
  email: "yariv@yarivitzkovich.com", // replace with real address
  profiles: {
    googleScholar: "",
    orcid: "",
    researchGate: "",
    linkedin: "",
    github: "",
    mastodon: "",
    bluesky: "",
  },
  totalPublicationsOverride: 28, // until content collection is wired up
  headshot: "/images/headshot.jpg",
} as const;

export type SiteConfig = typeof site;
