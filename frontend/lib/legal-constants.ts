// Only confirmed operator data belongs here. These server-side settings are
// supplied by the central `webLegal` deployment record or LEGAL_* environment
// variables. There are no built-in name or address fallbacks; legal pages stay
// in draft until the operator fills them in.
const value = (input: string | undefined): string | null => input?.trim() || null;

const operator = {
  name: value(process.env.LEGAL_COMPANY_NAME),
  street: value(process.env.LEGAL_STREET),
  postalCode: value(process.env.LEGAL_POSTAL_CODE),
  city: value(process.env.LEGAL_CITY),
} as const;

export const LEGAL = {
  reviewed: process.env.LEGAL_REVIEWED === "true" && [operator.name, operator.street, operator.postalCode, operator.city, process.env.LEGAL_CONTACT_EMAIL, process.env.LEGAL_PRIVACY_EMAIL].every(v => Boolean(v?.trim())),
  // § 5 DDG – Impressum
  company: {
    name: operator.name,
    legalForm: value(process.env.LEGAL_LEGAL_FORM),
    /** Vertretungsberechtigte Person(en) und Rechtsform laut verifizierter Betreiberangabe */
    representedBy: value(process.env.LEGAL_REPRESENTED_BY),
    street: operator.street,
    postalCode: operator.postalCode,
    city: operator.city,
    country: "Deutschland",
    email: value(process.env.LEGAL_CONTACT_EMAIL),
    phone: null as string | null, // optional – wenn vorhanden
    /** Ust-IdNr. oder USt-Nr. – sobald vorhanden */
    vatId: value(process.env.LEGAL_VAT_ID),
    register: value(process.env.LEGAL_REGISTER),
    registerNumber: value(process.env.LEGAL_REGISTER_NUMBER),
    /** Berufsrechtliche Regelungen, falls berufsrechtlich reguliert */
    professionalRegs: null as string | null,
  },

  // DSGVO – Datenschutz
  privacy: {
    /** Vollständiger Name des Verantwortlichen (Art. 4 Nr. 7 DSGVO) */
    controllerName: operator.name,
    controllerAddress: [operator.street, [operator.postalCode, operator.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    controllerEmail: value(process.env.LEGAL_PRIVACY_EMAIL),
    /** Datenschutzbeauftragter – nur Pflicht ab 20 DS-Mitarbeitern oder bestimmten Verarbeitungen */
    dpoName: null as string | null,
    dpoEmail: null as string | null,
    /** Aufsichtsbehörde des Bundeslandes, in dem das Unternehmen seinen Sitz hat */
    supervisoryAuthority: null as string | null,
    supervisoryAuthorityUrl: null as string | null,
    /** Google Maps API Key – nur Geocoding, kein Tracking */
    googleMapsNotice: true,
    /** Optional LLM-based CV parser + Job-Matching */
    aiProcessingNotice: true,
    /** Wird E-Mail-Marketing (Newsletter) eingesetzt? */
    emailMarketing: false,
  },

  // Plattform-Flags
  platform: {
    /** Gibt es kostenpflichtige B2C-Tarife (Premium)? → Widerruf-Seite aktivieren */
    hasPaidB2cPlans: false,
    /** B2B AGB aktiv? */
    hasB2bTerms: true,
    /** B2C Nutzungsbedingungen aktiv? */
    hasB2cTerms: true,
  },

  // Versionierung
  versions: {
    impressum: "2026-10-07",
    datenschutz: "2026-10-07",
    agbB2b: "2026-10-07",
    nutzungsbedingungen: "2026-10-07",
  },
} as const;
