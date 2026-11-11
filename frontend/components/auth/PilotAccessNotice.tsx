import Link from "next/link";
import { Footer } from "@/components/layout/Footer";

export function PilotAccessNotice({ email = false }: { email?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">
            {email ? "E-Mail-Versand noch nicht verfügbar" : "Zugang zum betreuten Pilotbetrieb"}
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-gray-600">
            {email
              ? "Passwort- und Bestätigungs-E-Mails können derzeit nicht versendet werden. Wenn du Hilfe mit deinem Zugang brauchst, wende dich an deine Ansprechperson bei neurofunken."
              : "Die öffentliche Registrierung ist derzeit geschlossen. Konten werden im betreuten Pilotbetrieb eingerichtet. Mit einem bereits eingerichteten Konto kannst du dich anmelden. Für einen neuen Zugang wende dich an deine Ansprechperson bei neurofunken."}
          </p>
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Zur Anmeldung
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
