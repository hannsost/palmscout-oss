# Palmscout lokal entwickeln

Palmscout ist die Recruiting-, Personal- und Zeitarbeitsplattform von neurofunken.
FastAPI, Next.js, PostgreSQL mit pgvector und Redis bilden die lokale Umgebung.
Das Produkt ist in einer frühen Pilotphase. Es trifft keine autonomen Personalentscheidungen.

Start: `.env.example` nach `.env` kopieren, Platzhalter ersetzen, dann
`docker compose -f docker-compose.yml up --build -d backend` ausführen.
Das Frontend separat mit Node.js 24 starten: `cd frontend && npm ci`, dann
`NEXT_PUBLIC_API_URL=http://localhost:8001 NEXT_PUBLIC_APP_URL=http://localhost:3001 npm run dev -- --port 3001`.
Das Produktions-Dockerfile benötigt ein gepinntes Node-Image und HTTPS-URLs.
UI: http://localhost:3001 · API: http://localhost:8001/docs.
Der Backend-Start führt Migrationen aus. Stoppen: `docker compose -f docker-compose.yml down`.
Datenvolumes nur nach bewusster Sicherung löschen.

`HIREOS_FRONTEND_PORT`, `HIREOS_API_PORT`, `hireos_*`-Container und Datenbanknamen
sind technische Altbezeichnungen. Das Produkt heißt Palmscout.
Compose-Standardkennwörter sind ausschließlich für lokale Entwicklung geeignet.
QuickWork und zugehörige Namen/Firmen in übernommenen Testdaten sind erfundene Beispiele.

Siehe [Schnellstart](../README.md), [Konfiguration und Tests](CONFIGURATION.md),
[KI-Anbieter](AI-PROVIDERS.md), [Integrationen](INTEGRATIONS.md) und
[E-Rechnung](E_RECHNUNG_UND_STEUERSCHNITTSTELLEN.md).
