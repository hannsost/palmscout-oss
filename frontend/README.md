# Palmscout Frontend

Next.js, React und TypeScript mit Node.js 24. Den Backend-Stack gemäß
[Root-Schnellstart](../README.md#quick-start) starten, dann lokal:

```sh
npm ci
NEXT_PUBLIC_API_URL=http://localhost:8001 NEXT_PUBLIC_APP_URL=http://localhost:3001 npm run dev -- --port 3001
```

Für Produktionsbuilds sind explizite HTTPS-Origins und beim Docker-Build ein
gepinntes Node-24-Alpine-Image erforderlich; siehe [Deployment](../deploy/README.md).
`LEGAL_*`-Werte für den lokalen Server in dessen Umgebung oder `.env.local` hinterlegen.

## Prüfungen

```bash
npm ci
npm run lint
npm run build
npm run typecheck
npm run test:e2e
```

Der Build erzeugt auch die Next.js-Routentypen für einen frischen Checkout.
Die Browserprüfung nutzt den laufenden Compose-Stack und synthetische Konten aus
`../TEST_USERS.md`. Sie darf nur lokal ausgeführt werden. Ein vorhandenes Chromium
wird automatisch genutzt; alternativ `npx playwright install chromium` ausführen
oder `PLAYWRIGHT_CHROMIUM_EXECUTABLE` setzen.

JSON-Bericht, Fehlerscreenshots und die gezielt aufgenommenen Ansichten liegen
unter `../.artifacts/browser/`. `e2e/portal.spec.ts` prüft Portale und mobile
Navigation; `e2e/workflows.spec.ts` prüft Registrierung, Stellenpflege und
Mitarbeiteransichten sowie ausgewählte WCAG-Regeln der Anmeldung.

CI führt Lint, Produktionsbuild und Typprüfung aus. Der aktuelle technische
Freigabestand steht in `../docs/RELEASE_READINESS_2026-09-06.md`.

## Release-Konfiguration

Der Containerbuild braucht jetzt ausdrücklich `NODE_IMAGE=node:24-alpine@sha256:…`
mit einem geprüften Digest; Buildkontext ist ausschließlich `frontend/`.
Die Kontext-Allowlist schließt lokale Env-Dateien, Dependencies und Testartefakte aus.
Die vorhandene Compose-Datei muss für einen neuen Containerbuild ebenfalls diesen
Buildarg übergeben. Direkte lokale Entwicklung mit `npm run dev` bleibt möglich.

Produktionsbuilds verwenden `NEXT_PUBLIC_API_URL=https://api.example.com`
und `NEXT_PUBLIC_APP_URL=https://app.example.com`. HTTP, Credentials, Pfade,
Query und Fragment sind dort unzulässig. Andere HTTPS-Origins müssen ausdrücklich
beim Build gesetzt werden. Runtime-Env ändert diese Browserwerte nicht.

`NEXT_PUBLIC_REGISTRATION_ENABLED=false` und `NEXT_PUBLIC_EMAIL_ENABLED=false`
sind Produktionsdefaults für den betreuten Pilotbetrieb. Registrierung und
E-Mail-Recovery zeigen damit einen ehrlichen Hinweis; `/` führt zur Anmeldung
oder zum passenden Rollenportal. Die API muss Registrierung unabhängig sperren.
Eine spätere Freigabe braucht passende Backend-/Provider-Abnahme und einen neuen
Frontendbuild. Die frühere öffentliche Landingpage ist noch kein abgenommener
öffentlicher Registrierungs-/Wartelistenprozess.

Rechtsseiten werden auf Anfrage gerendert und lesen `LEGAL_*` aus der Serverumgebung.
Ohne vollständige und bestätigte Betreiberangaben bleibt der Entwurfshinweis sichtbar.
Inter bleibt unverändert: `next/font/google` benötigt Google-Fonts-Zugriff beim
Build; Browser erhalten danach selbst gehostete Fontdateien. Kein Offlinebuild behauptet.

Der Runtimeprozess läuft als UID:GID `1001:1001` auf Port 3000. `/healthz` prüft
nur den Webprozess, keine API-/DB-/Betreiberbereitschaft. Bei schreibgeschütztem
Root-Dateisystem müssen `/tmp` und `/app/.next/cache` beschreibbar sein.

Begrenzte Prüfung ohne Produktionsbuild:

```bash
NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 npx --no-install next typegen
npm run typecheck -- --incremental false
node --test --test-isolation=none tests/deployment-config.test.mjs
```
