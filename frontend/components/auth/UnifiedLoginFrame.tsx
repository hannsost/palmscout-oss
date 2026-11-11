import type { ReactNode } from "react";
import styles from "./UnifiedLoginFrame.module.css";

export function UnifiedLoginFrame({ children }: { children: ReactNode }) {
  return (
    <main className={styles.screen}>
      <div className={styles.frame}>
        <section className={styles.brandPanel} aria-label="Palmscout">
          <div className={styles.brand}>
            <svg className={styles.mark} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 21V10M12 11C8 6 4 7 3 10c4 1 6 2 9 5M12 11c4-5 8-4 9-1-4 1-6 2-9 5M12 8c-1-3 0-5 2-6 1 3 0 5-2 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div><div className={styles.brandName}>palm<span>scout</span></div><div className={styles.brandParent}>von neurofunken</div></div>
          </div>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>Recruiting &amp; Personal</p>
            <h2>Menschen passend zusammenbringen.</h2>
            <p className={styles.introText}>Behalte Bewerbungen, Teams und nächste Schritte in einer klaren Arbeitsfläche im Blick.</p>
          </div>
        </section>
        <section className={styles.formPanel} aria-label="Anmeldung">
          <div className={styles.formContent}>{children}</div>
        </section>
      </div>
    </main>
  );
}
