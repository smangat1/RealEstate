import type { CSSProperties, ReactNode } from "react";

import styles from "./web-skeletons.module.css";

function Bone({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <span className={`${styles.bone} ${className ?? ""}`} style={style} aria-hidden="true" />;
}

function LoadingFrame({
  className,
  label,
  children,
}: {
  className: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <main className={className} role="status" aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>{label}</span>
      {children}
    </main>
  );
}

export function MarketingPageSkeleton() {
  return (
    <LoadingFrame className={`${styles.shell} ${styles.marketingShell}`} label="Loading Homeboard">
      <header className={styles.marketingNav}>
        <div className={styles.brandPlaceholder}>
          <Bone className={styles.markPlaceholder} />
          <Bone style={{ width: 108, height: 12 }} />
        </div>
        <div className={styles.navPlaceholder}>
          <Bone style={{ width: 62, height: 10 }} />
          <Bone style={{ width: 62, height: 10 }} />
          <Bone className={styles.navButtonPlaceholder} />
        </div>
      </header>

      <section className={styles.marketingHero}>
        <Bone style={{ width: 216, height: 10 }} />
        <div className={styles.heroTitlePlaceholder}>
          <Bone style={{ width: "84%" }} />
          <Bone style={{ width: "67%" }} />
          <Bone style={{ width: "73%" }} />
        </div>
        <div className={styles.copyPlaceholder}>
          <Bone style={{ width: "100%" }} />
          <Bone style={{ width: "78%" }} />
        </div>
        <Bone className={styles.heroRulePlaceholder} />
      </section>
    </LoadingFrame>
  );
}

export function WorkspacePageSkeleton() {
  return (
    <LoadingFrame className={`${styles.shell} ${styles.workspaceShell}`} label="Loading your Homeboard workspace">
      <aside className={styles.workspaceSidebar}>
        <div className={styles.workspaceToolbar}>
          <Bone className={styles.roundPlaceholder} />
          <Bone className={styles.roundPlaceholder} />
          <Bone className={styles.roundPlaceholder} />
        </div>
        <div className={styles.workspaceIdentity}>
          <Bone className={styles.markPlaceholder} />
          <div>
            <Bone style={{ width: 116, height: 12 }} />
            <Bone style={{ width: 154, height: 8 }} />
          </div>
        </div>
        <Bone style={{ width: 56, height: 8 }} />
        <div className={styles.sidebarRows}>
          <Bone />
          <Bone />
          <Bone />
          <Bone />
        </div>
      </aside>

      <section className={styles.workspaceMain}>
        <header className={styles.workspaceHeader}>
          <div>
            <Bone style={{ width: 92, height: 9 }} />
            <Bone style={{ width: 280, height: 28 }} />
          </div>
          <div className={styles.workspaceToolbar}>
            <Bone className={styles.roundPlaceholder} />
            <Bone className={styles.roundPlaceholder} />
          </div>
        </header>

        <div className={styles.summaryPlaceholder}>
          <div>
            <Bone style={{ width: 154, height: 13 }} />
            <Bone style={{ width: "72%", height: 9 }} />
          </div>
          <Bone className={styles.summaryMetricPlaceholder} />
        </div>

        <div className={styles.workspaceTabs}>
          <Bone />
          <Bone />
          <Bone />
        </div>

        <div className={styles.cardGridPlaceholder}>
          {Array.from({ length: 6 }).map((_, index) => (
            <article className={styles.listingPlaceholder} key={index}>
              <Bone className={styles.imagePlaceholder} />
              <div className={styles.listingCopyPlaceholder}>
                <Bone style={{ width: "44%", height: 9 }} />
                <Bone style={{ width: "88%", height: 16 }} />
                <Bone style={{ width: "70%", height: 9 }} />
                <Bone style={{ width: "56%", height: 9 }} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </LoadingFrame>
  );
}

export function AccountPageSkeleton() {
  return (
    <LoadingFrame className={`${styles.shell} ${styles.accountShell}`} label="Loading your Homeboard account">
      <section className={styles.accountCardPlaceholder}>
        <div className={styles.accountIntroPlaceholder}>
          <div className={styles.brandPlaceholder}>
            <Bone className={styles.markPlaceholder} />
            <Bone style={{ width: 126, height: 10 }} />
          </div>
          <div className={styles.accountTitlePlaceholder}>
            <Bone style={{ width: "92%" }} />
            <Bone style={{ width: "80%" }} />
            <Bone style={{ width: "58%" }} />
          </div>
          <div className={styles.copyPlaceholder}>
            <Bone style={{ width: "100%" }} />
            <Bone style={{ width: "91%" }} />
            <Bone style={{ width: "68%" }} />
          </div>
        </div>

        <div className={styles.accountFormPlaceholder}>
          <Bone style={{ width: 154, height: 18 }} />
          <Bone style={{ width: "84%", height: 9 }} />
          <div className={styles.fieldStackPlaceholder}>
            <Bone />
            <Bone />
            <Bone />
          </div>
          <Bone className={styles.submitPlaceholder} />
        </div>
      </section>
    </LoadingFrame>
  );
}
