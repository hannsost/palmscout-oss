import type { Metadata } from "next";
import "./globals.css";
import { FeedbackWidget } from "@/components/ui/FeedbackWidget";
import { SupportWidgetWrapper } from "@/components/support/SupportWidgetWrapper";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: `${BRAND.product} – Recruiting, HR und Zeitarbeit`,
  description: BRAND.description,
  applicationName: BRAND.product,
  creator: BRAND.company,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--nf-paper)] font-[var(--nf-font)]">
        {children}
        <FeedbackWidget />
        <SupportWidgetWrapper />
      </body>
    </html>
  );
}
