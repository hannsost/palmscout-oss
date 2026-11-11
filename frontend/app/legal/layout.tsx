import { connection } from "next/server";

/** Operator information is supplied at runtime, never frozen into build-time HTML. */
export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
