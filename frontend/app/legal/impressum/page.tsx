import { connection } from "next/server";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { LEGAL } from "@/lib/legal-constants";

export const metadata = { title: "Impressum – Palmscout" };

export default async function ImpressumPage() {
  await connection();
  const { company, versions } = LEGAL;
  return (
    <LegalPageShell title="Impressum" lastUpdated={versions.impressum}>
      <h2>Palmscout – ein Produkt von neurofunken</h2>
      <h3>Anbieterangaben gemäß § 5 DDG</h3>
      <p><strong>{company.name ?? "Anbietername wird ergänzt"}{company.legalForm ? ` ${company.legalForm}` : ""}</strong><br />{company.street ?? "Geschäftsanschrift wird ergänzt"}<br />{[company.postalCode, company.city].filter(Boolean).join(" ") || "Postleitzahl und Ort werden ergänzt"}<br />{company.country}</p>
      <h3>Vertretungsberechtigte Person</h3>
      <p>{company.legalForm ? (company.representedBy ?? "Die vertretungsberechtigte Person wird mit den Gesellschaftsangaben ergänzt.") : "Als natürlicher Anbieter handelt die unter Anbieterangaben genannte Person selbst; eine gesonderte Vertretungsangabe besteht nicht."}</p>
      <h3>Kontakt</h3>
      <p>{company.email ? <a href={`mailto:${company.email}`}>{company.email}</a> : "Kontaktadresse wird ergänzt"}</p>
      {company.phone && <p>Telefon: {company.phone}</p>}
      {company.vatId && <p>Umsatzsteuer-Identifikationsnummer: {company.vatId}</p>}
      <h3>Register, Umsatzsteuer und Verbraucherschlichtung</h3>
      <p>{company.register && company.registerNumber ? <>Registergericht: {company.register}; Registernummer: {company.registerNumber}.</> : "Die geplante UG ist noch nicht eingetragen; eine Registernummer besteht daher nicht."} {company.vatId ? <>Umsatzsteuer-Identifikationsnummer: {company.vatId}.</> : "Eine Umsatzsteuer-Identifikationsnummer ist noch nicht vorhanden."}</p>
      <p>Palmscout bietet derzeit keinen öffentlich buchbaren Verbrauchervertrag an. Eine Teilnahme an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle wird derzeit nicht angeboten oder erklärt. Bei einem späteren Verbrauchervertrag werden die dann einschlägigen Informationen vor Vertragsschluss bereitgestellt.</p>
      <h3>Karriereseiten von Unternehmen</h3>
      <p>Unternehmen können ihren eigenen Markenauftritt verwenden. Der technische Anbieter der Plattform ist neurofunken. Arbeitgeber und Verantwortlichkeiten für Bewerbungen müssen auf der jeweiligen Karriereseite eindeutig angegeben werden.</p>
    </LegalPageShell>
  );
}
