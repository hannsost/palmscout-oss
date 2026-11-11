import { connection } from "next/server";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { LEGAL } from "@/lib/legal-constants";

export const metadata = { title: "B2B-Pilotbedingungen – Palmscout" };

export default async function AgbB2bPage() {
  await connection();
  const { company, versions } = LEGAL;
  return (
    <LegalPageShell title="B2B-Pilotbedingungen für Palmscout" lastUpdated={versions.agbB2b}>
      <p className="text-sm text-gray-500 italic">Diese Bedingungen beschreiben den gegenwärtigen Gründungs- und Pilotstand. Sie gelten nur, wenn sie einem Unternehmer im Sinn von § 14 BGB zusammen mit einem individuellen Angebot ausdrücklich einbezogen werden. Sie begründen keinen öffentlich buchbaren SaaS-Vertrag.</p>
      <h2>1. Vertragspartner und Geltung</h2>
      <p>Vertragspartner ist {company.name}{company.legalForm ? ` ${company.legalForm}` : ""} (nachfolgend „Anbieter“), sobald die im Impressum noch fehlenden Betreiberangaben bestätigt sind. Der Pilotvertrag kommt ausschließlich durch ein individuelles Angebot und dessen Annahme zustande. Abweichende Bedingungen des Kunden gelten nur bei ausdrücklicher Vereinbarung.</p>
      <h2>2. Pilotumfang</h2>
      <p>Palmscout befindet sich in Entwicklung. Der konkrete Pilotumfang, aktivierte Funktionen, Nutzungsberechtigte, Datenarten, technische Umgebung, Servicezeiten, Vergütung und Laufzeit werden im Angebot festgelegt. Nicht vereinbarte Funktionen, insbesondere automatische öffentliche Registrierung, E-Mail-Versand, KI-Dienste, Schnittstellen, Verfügbarkeit oder Wiederherstellungszeiten, sind nicht geschuldet.</p>
      <h2>3. Zugänge und Mitwirkung</h2>
      <p>Der Kunde benennt berechtigte Nutzer, hält Zugangsdaten vertraulich und informiert den Anbieter unverzüglich über Missbrauch. Er ist für die Rechtmäßigkeit der von ihm eingegebenen Daten, Inhalte und Weisungen verantwortlich und darf keine Rechte Dritter verletzen oder den Betrieb beeinträchtigen. Der Anbieter darf einzelne Zugänge bei einem begründeten Sicherheitsrisiko vorübergehend sperren und informiert den Kunden, soweit dies möglich und zumutbar ist.</p>
      <h2>4. Datenschutz</h2>
      <p>Soweit der Anbieter personenbezogene Daten im Auftrag verarbeitet, schließen die Parteien vor Beginn der Verarbeitung einen Auftragsverarbeitungsvertrag nach Art. 28 DSGVO. Der Kunde bestimmt Zweck und Mittel seiner Verarbeitung und bleibt für die Rechtsgrundlage, Information der betroffenen Personen und zulässige Weisungen verantwortlich. Eine Auftragsverarbeitung ersetzt keine eigene Rechtsgrundlage.</p>
      <h2>5. Vergütung, Laufzeit und Daten</h2>
      <p>Vergütung, Zahlungsziel und Laufzeit ergeben sich ausschließlich aus dem Angebot. Soweit keine Laufzeit vereinbart wurde, kann jede Partei mit einer Frist von 30 Tagen zum Monatsende kündigen; das Recht zur außerordentlichen Kündigung bleibt unberührt. Nach Vertragsende erhält der Kunde eine angemessene Gelegenheit zum Export der vereinbarten Daten. Anschließend werden Daten gelöscht oder zurückgegeben, soweit keine gesetzlichen Pflichten entgegenstehen und der AV-Vertrag nichts anderes bestimmt.</p>
      <h2>6. Rechte und Haftung</h2>
      <p>Der Anbieter räumt für die Laufzeit das nicht ausschließliche, nicht übertragbare Recht ein, Palmscout im vereinbarten Umfang zu nutzen. Er haftet unbeschränkt für Vorsatz, grobe Fahrlässigkeit sowie Schäden aus Verletzung von Leben, Körper oder Gesundheit. Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten ist die Haftung auf den vorhersehbaren, vertragstypischen Schaden begrenzt; im Übrigen ist sie ausgeschlossen. Zwingende gesetzliche Ansprüche bleiben unberührt.</p>
      <h2>7. Schlussbestimmungen</h2>
      <p>Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Ist der Kunde Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist Gerichtsstand der Sitz des Anbieters, sobald dieser bestätigt ist. Änderungen dieser Bedingungen werden nur wirksam, wenn sie transparent angekündigt und für den jeweiligen Vertrag rechtlich zulässig vereinbart werden.</p>
    </LegalPageShell>
  );
}
