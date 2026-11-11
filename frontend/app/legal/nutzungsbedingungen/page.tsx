import { connection } from "next/server";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { LEGAL } from "@/lib/legal-constants";

export const metadata = { title: "Nutzungsbedingungen – Palmscout" };

export default async function NutzungsbedingungenPage() {
  await connection();
  const { company, versions, platform } = LEGAL;
  return (
    <LegalPageShell title="Nutzungsbedingungen für Palmscout" lastUpdated={versions.nutzungsbedingungen}>
      <p className="text-sm text-gray-500 italic">Diese Bedingungen gelten für die gegenwärtig zugängliche Entwicklungs- und Pilotoberfläche. Öffentliche Registrierung und kostenpflichtige B2C-Tarife sind im aktuellen Stand nicht freigeschaltet.</p>
      <h2>1. Geltungsbereich</h2>
      <p>Diese Nutzungsbedingungen gelten zwischen Ihnen und {company.name}{company.legalForm ? ` ${company.legalForm}` : ""} für die kostenlose Nutzung einer freigegebenen Palmscout-Oberfläche. Ein Vertrag über einen kostenpflichtigen Dienst, eine Vermittlung, ein Arbeitsverhältnis oder eine Personalentscheidung kommt dadurch nicht zustande. {platform.hasPaidB2cPlans ? "Kostenpflichtige Funktionen werden nur mit gesonderten Vertrags- und Widerrufsinformationen angeboten." : "Kostenpflichtige B2C-Funktionen werden derzeit nicht angeboten."}</p>
      <h2>2. Zugang und Nutzung</h2>
      <p>Zugänge werden nur für den vereinbarten Test- oder Pilotzweck bereitgestellt. Sie müssen Ihre Angaben richtig halten, Zugangsdaten vertraulich behandeln und einen Missbrauch unverzüglich an {company.email ? <a href={`mailto:${company.email}`}>{company.email}</a> : "die noch zu benennende Kontaktadresse"} melden. Ein Anspruch auf Registrierung, bestimmte Funktionen oder eine bestimmte Verfügbarkeit besteht nicht.</p>
      <h2>3. Inhalte und Entscheidungen</h2>
      <p>Sie dürfen keine rechtswidrigen, diskriminierenden, irreführenden oder Rechte Dritter verletzenden Inhalte eingeben und keine automatisierten Zugriffe einsetzen, die den Betrieb beeinträchtigen. Palmscout unterstützt Arbeitsabläufe, trifft aber keine Einstellungs-, Vermittlungs- oder sonstige Personalentscheidung. Ergebnisse automatisierter Hilfen müssen fachlich geprüft werden; sie ersetzen keine eigene Entscheidung.</p>
      <h2>4. Datenschutz</h2>
      <p>Informationen zur Verarbeitung personenbezogener Daten stehen in der <a href="/legal/datenschutz">Datenschutzinformation</a>. Soweit ein Unternehmen Daten von Bewerbern, Beschäftigten oder anderen Personen verarbeitet, bleibt es für seine Rechtsgrundlage, Informationspflichten und Entscheidungen verantwortlich. Erforderliche Rollen und Vereinbarungen, insbesondere eine Auftragsverarbeitung, werden vor einem konkreten Pilotbetrieb bestimmt.</p>
      <h2>5. Beendigung und Haftung</h2>
      <p>Sie können die Nutzung jederzeit beenden; der Anbieter kann einen Testzugang mit angemessener Ankündigung oder bei Sicherheits- beziehungsweise Pflichtverletzungen sofort sperren. Der Anbieter haftet unbeschränkt für Vorsatz, grobe Fahrlässigkeit und Schäden aus Verletzung von Leben, Körper oder Gesundheit. Bei leicht fahrlässiger Verletzung wesentlicher Pflichten ist die Haftung auf den vorhersehbaren, vertragstypischen Schaden begrenzt; im Übrigen ist sie ausgeschlossen. Zwingende Rechte, insbesondere von Verbrauchern, bleiben unberührt.</p>
      <h2>6. Schlussbestimmungen</h2>
      <p>Es gilt deutsches Recht; für Verbraucher bleiben zwingende Vorschriften ihres gewöhnlichen Aufenthalts unberührt. Ein öffentlich buchbarer Verbrauchervertrag wird derzeit nicht angeboten. Falls das später geschieht, werden die erforderlichen vorvertraglichen Informationen und ein gegebenenfalls bestehendes Widerrufsrecht vor Vertragsschluss bereitgestellt.</p>
    </LegalPageShell>
  );
}
