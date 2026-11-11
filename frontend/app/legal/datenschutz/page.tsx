import { connection } from "next/server";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { LEGAL } from "@/lib/legal-constants";

export const metadata = { title: "Datenschutz – Palmscout" };

export default async function DatenschutzPage() {
  await connection();
  const { privacy, versions } = LEGAL;
  return (
    <LegalPageShell title="Datenschutzinformationen" lastUpdated={versions.datenschutz}>
      <h2>Verantwortlicher und Kontakt</h2>
      <p>{privacy.controllerName ?? "wird ergänzt"}<br />{privacy.controllerAddress ?? "wird ergänzt"}<br />{privacy.controllerEmail ? <a href={`mailto:${privacy.controllerEmail}`}>{privacy.controllerEmail}</a> : "Eine öffentliche Datenschutz-Kontaktadresse wird noch ergänzt."}</p>
      <p>Ein Datenschutzbeauftragter ist derzeit nicht benannt. Eine Benennung erfolgt, sofern die gesetzlichen Voraussetzungen erfüllt sind.</p>
      <h2>Verarbeitungen in Palmscout</h2>
      <p>Die Plattform unterstützt Nutzerkonten, Bewerbungen, Stellenangebote, Kommunikation und – je nach aktiviertem Arbeitsbereich – Personalverwaltung und Einsatzplanung. Dabei können Kontakt-, Profil-, Bewerbungs- und Beschäftigungsdaten verarbeitet werden.</p>
      <p>Im freigegebenen Pilot bestimmt das jeweilige Unternehmen Zwecke und Mittel seiner Bewerbungs- und Personalprozesse. Es ist für Rechtsgrundlage, Information betroffener Personen und zulässige Inhalte verantwortlich. Der technische Anbieter verarbeitet Daten nur im vereinbarten Umfang; soweit eine Auftragsverarbeitung vorliegt, wird vor Beginn ein Vertrag nach Art. 28 DSGVO geschlossen. Für Beschäftigtendaten sind insbesondere § 26 BDSG sowie Art. 6 und gegebenenfalls Art. 9 DSGVO zu prüfen. Eine Auftragsverarbeitung ersetzt keine Rechtsgrundlage.</p>
      <h2>Arbeitgeber und Partnerunternehmen</h2>
      <p>Arbeitgeber entscheiden über ihre Bewerbungs- und Personalprozesse. Die Rollen von neurofunken und dem jeweiligen Unternehmen sowie erforderliche Vereinbarungen zur Auftragsverarbeitung oder gemeinsamen Verantwortlichkeit müssen für den konkreten Einsatz bestimmt werden. Eine Zusammenarbeit zwischen Unternehmen berechtigt nicht automatisch zur Weitergabe von Bewerberprofilen.</p>
      <h2>KI-Unterstützung</h2>
      <p>KI-Funktionen sind nicht Bestandteil eines öffentlichen Standardbetriebs. Vor einer einzelnen Freigabe werden Zweck, Datenkategorien, Rechtsgrundlage, Dienstleister, Verarbeitungsregionen, Unterauftragnehmer und etwaige Drittlandtransfers dokumentiert. Soweit eine Funktion auf Einwilligung beruht, muss diese freiwillig und jederzeit mit Wirkung für die Zukunft widerrufbar sein. KI-Ergebnisse können fehlerhaft sein und erfordern eine sachkundige Prüfung.</p>
      <h2>Hosting, E-Mail, Kalender und Karten</h2>
      <p>Hostingstandorte, Dienstleisterverträge, Zugriffsschutz, Empfänger und Löschfristen sind für einen produktiven Betrieb noch zu bestätigen. Öffentliche Registrierung und E-Mail-Recovery sind im aktuellen Pilotstandard deaktiviert. Externe E-Mail-, Kalender- und Kartendienste werden nur nach gesonderter Prüfung aktiviert; bei einer Verbindung können Daten an deren Betreiber übermittelt werden.</p>
      <h2>Speicherung im Browser und Einwilligung</h2>
      <p>Zur Anmeldung werden Zugangsdaten für die Sitzung im lokalen Browserspeicher gehalten. Oberflächeneinstellungen und ausdrücklich gespeicherte Ansichten werden ebenfalls lokal gespeichert. Beim Abmelden entfernt Palmscout die Sitzungstoken. Diese Speicherungen sind für die ausdrücklich angeforderte Anmeldung oder Funktion erforderlich und erfolgen ohne Einwilligungsbanner nach § 25 Abs. 2 Nr. 2 TDDDG. Palmscout setzt im Pilotstandard keine Analyse- oder Werbecookies ein. Nicht erforderliche Cookies oder vergleichbare Zugriffe auf Endgeräte werden erst nach vorheriger Einwilligung eingesetzt.</p>
      <h2>Ihre Rechte</h2>
      <p>Nach Maßgabe der DSGVO bestehen Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie auf Widerruf einer Einwilligung. Sie können sich bei einer Datenschutzaufsichtsbehörde beschweren. Für den derzeitigen Verantwortlichen ist der Hessische Beauftragte für Datenschutz und Informationsfreiheit, Wilhelmstraße 7, 65185 Wiesbaden, <a href="https://datenschutz.hessen.de/" target="_blank" rel="noopener noreferrer">datenschutz.hessen.de</a>, zuständig.</p>
      <h2>Stand und Grenzen</h2>
      <p>Stand: 7. Oktober 2026. Diese Informationen unterscheiden den vorhandenen Entwicklungs- und Pilotumfang von einer produktiven Plattform. Bestätigt sind der derzeitige Verantwortliche und seine Anschrift; offen bleiben öffentliche Datenschutz-Kontaktadresse, konkrete Empfänger, Speicherfristen, Hosting und gegebenenfalls Drittlandübermittlungen. Daraus folgt keine Behauptung einer abgeschlossenen rechtlichen oder datenschutzrechtlichen Prüfung.</p>
    </LegalPageShell>
  );
}
