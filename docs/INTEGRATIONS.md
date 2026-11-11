# E-Mail und Kalender

Palmscout verbindet ein persönliches Google- oder Microsoft-Konto mit dem angemeldeten
Firmenmitglied. Die Zugänge werden pro Nutzer und Mandant gespeichert. Andere
Firmenmitglieder können diese Verbindung weder einsehen noch verwenden.

## Einrichtung

1. Eine OAuth-Webanwendung bei Google bzw. Microsoft registrieren. Gmail und
   Google Calendar müssen für die Google-Anwendung aktiviert sein.
2. Als Rücksprungadresse exakt `INTEGRATIONS_REDIRECT_URI` registrieren, lokal
   `http://localhost:3001/connections/callback`, produktiv eine HTTPS-Adresse.
3. Die passenden `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` bzw.
   `MICROSOFT_OAUTH_CLIENT_ID`/`MICROSOFT_OAUTH_CLIENT_SECRET` konfigurieren.
4. `INTEGRATIONS_ENCRYPTION_KEY` als separaten Fernet-Schlüssel bereitstellen
   und sicher sichern. Schlüsselwechsel brauchen eine Migration der gespeicherten
   Verbindungen oder eine erneute Verbindung aller Konten. Keine Schlüssel committen.
5. Unter **E-Mail & Kalender** das eigene Konto verbinden. Die Anwendung verwendet
   Authorization Code mit PKCE, zehn Minuten gültigen, nutzergebundenen State und
   verschlüsselte Access-/Refresh-Tokens. Tokens werden nicht an den Browser geliefert.

## Funktionsumfang und Grenzen

- Nachrichtenentwürfe werden einer im Arbeitsbereich sichtbaren Person zugeordnet.
  Eigene Entwürfe können bearbeitet, verworfen und als EML exportiert werden.
- Versand erfolgt nur durch ausdrückliche Freigabe eines gespeicherten Entwurfs.
  Bei unklarer Anbieterantwort wird der Versand nicht wiederholt. Der Status muss
  dann im Postfach des Anbieters geprüft werden. „An Anbieter übergeben“ ist kein
  Zustellnachweis.
- Eingegangene Nachrichten können ausdrücklich zur ausgewählten Person geladen
  werden: bis zu 20 Vorschauen der letzten 90 Tage aus dem eigenen Postfach.
  Sie werden nicht als gemeinsame Firmenhistorie gespeichert. Anhänge und vollständige
  Nachrichten verbleiben beim Anbieter. Antworten werden als neue Entwürfe vorbereitet.
  Automatischer Hintergrundabgleich und durchgängige E-Mail-Threads sind noch offen.
- Terminauswahlen sind an eine Bewerbung gebunden. Nur die eingeladene Person
  kann buchen. Bestehende Interviewtermine und verbundene Kalender werden auf
  Belegung geprüft. Nicht erreichbare verbundene Kalender sperren die Buchung,
  statt freie Zeiten vorzutäuschen.
- Bestätigte Termine können ausdrücklich in den eigenen Kalender übernommen
  werden. Es werden dabei keine zusätzlichen Einladungen an Dritte verschickt.
  Die Aktion „Kalender aktualisieren“ aktualisiert vorhandene Einträge und entfernt
  sie nach Absage. Unklare Anbieterantworten lösen keine automatische Wiederholung aus.
  Automatische Hintergrund- und bidirektionale Synchronisation sind noch offen.
- Ohne konfigurierte Anbieter bleibt die lokale Terminbuchung nutzbar. E-Mail-
  Entwürfe können als EML exportiert werden. Die Oberfläche zeigt fehlende
  Verbindungen ausdrücklich an.
- Verbindung trennen löscht die in Palmscout gespeicherten Zugangsdaten. Eine
  Anbieterfreigabe kann zusätzlich im Google-/Microsoft-Konto widerrufen werden.

Echte OAuth-Freigaben, organisationsabhängige Anbieterrechte und Zustellung
müssen mit separaten Testkonten geprüft werden; lokale simulierte Antworten
belegen allein die Implementierung und ihre Fehlerbehandlung.

Für Nachrichtenvorschauen werden zusätzlich `gmail.readonly` bzw. `Mail.Read`
angefordert. Bereits verbundene Konten benötigen hierfür eine erneute OAuth-Freigabe.
Erneuerte Zugangsdaten werden separat gespeichert, damit ein späterer Fehler beim
Abruf keine gültige Token-Erneuerung zurückrollt.

## Offizielle Referenzen (am 7./8. September 2026 geprüft)

- [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Kalenderbelegung](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
- [Gmail Versand](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Microsoft OAuth und PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft Kalendertermine](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)

- [Microsoft Kalenderansicht](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0)
- [Gmail Nachrichtenliste](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Gmail Metadaten](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Microsoft Nachrichtenliste](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0)
- [Google Kalendereintrag aktualisieren](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch)
- [Google Kalendereintrag entfernen](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete)
- [Microsoft Kalendereintrag aktualisieren](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0)
- [Microsoft Kalendereintrag entfernen](https://learn.microsoft.com/en-us/graph/api/event-delete?view=graph-rest-1.0)

## E-Rechnung, DATEV und ELSTER

Der Nutzerauftrag vom 10. September erweitert die Zielarchitektur um diese Bereiche.
[Befund und Architektur](E_RECHNUNG_UND_STEUERSCHNITTSTELLEN.md): Die erste begrenzte
XRechnung-Ausgabe mit Finanzrechten, Freigaben und isoliertem KoSIT-Prüfdienst ist
implementiert; siehe [Architecture](ARCHITECTURE.md). Peppol-Adapter,
WORM-Archivierung, Steuerberater-/DATEV-Übergabe und ein isolierter ERiC-Dienst
bleiben geplante Anbindungen. Externe Rechnungs-/Steuerübermittlung findet noch
nicht statt.
