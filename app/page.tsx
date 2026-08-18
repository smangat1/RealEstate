import Image from "next/image";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import styles from "./marketing.module.css";

export const metadata: Metadata = {
  title: "Homeboard — Find a place without losing the group chat",
  description:
    "Homeboard keeps rental listings, commutes, preferences, and group tradeoffs in one shared place.",
};

const roadmap = [
  {
    stage: "Beta",
    title: "A calmer shared search",
    copy: "Private boards, listing imports, a group shortlist, updates, and commute-aware comparison on iPhone.",
  },
  {
    stage: "Next",
    title: "Sharper route intelligence",
    copy: "More reliable car, rail, bus, and walking choices with clearer explanations for every score.",
  },
  {
    stage: "Planned",
    title: "Broader listing support",
    copy: "More rental apps and websites, stronger listing verification, and smoother iPhone-to-Mac handoff.",
  },
  {
    stage: "Exploring",
    title: "Insight beyond the link",
    copy: "Group-fit summaries, neighborhood context, price-and-space tradeoffs, and decisions that stay explainable.",
  },
];

function HouseMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.houseMark} ${compact ? styles.houseMarkCompact : ""}`} aria-hidden="true">
      <svg viewBox="0 0 44 44" role="img">
        <path d="M8 21.5 22 10l14 11.5v13a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2Z" />
        <path d="M17 36V25h10v11M31 14V8h5v10" />
      </svg>
    </span>
  );
}

function ShareSymbol() {
  return (
    <svg className={styles.shareSymbol} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 30V6m0 0-8 8m8-8 8 8" />
      <path d="M16 18h-4a4 4 0 0 0-4 4v16a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V22a4 4 0 0 0-4-4h-4" />
    </svg>
  );
}

function FeatureIcon({ children }: { children: ReactNode }) {
  return <span className={styles.featureIcon}>{children}</span>;
}

function AppScreenshot() {
  return (
    <figure className={styles.captureFigure}>
      <div className={styles.captureChrome} aria-label="Homeboard comparison map running on iPhone">
        <div className={styles.captureCrop}>
          <Image
            src="/images/homeboard-comparison-map.png"
            alt="The real Homeboard comparison map showing three scored listings, a work node, and color-matched commute routes"
            width={1179}
            height={2556}
            priority
            sizes="(max-width: 760px) 88vw, (max-width: 1100px) 54vw, 430px"
          />
        </div>
      </div>
      <figcaption>
        <span><i /> Live app capture</span>
        <p>Every route matches its listing node. Work stays visible. Scores remain explainable.</p>
      </figcaption>
    </figure>
  );
}

export default function HomePage() {
  return (
    <main className={styles.site}>
      <header className={styles.nav}>
        <a className={styles.brand} href="#top" aria-label="Homeboard home">
          <HouseMark compact />
          <span>HOMEBOARD</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#inside">Inside the app</a>
          <a href="#roadmap">What’s next</a>
        </nav>
        <a className={styles.navCta} href="#install">Get the app</a>
      </header>

      <div className={styles.cardStack}>
        <section className={`${styles.pageCard} ${styles.heroCard}`} id="top">
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><span /> Shared rental search, without the chaos</div>
            <h1>Finding a place with friends doesn’t have to end your friendship.</h1>
            <div className={styles.titleRule} />
            <p>
              Keep listings, commutes, preferences, and tradeoffs in one shared place—before the group chat becomes the problem.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryCta} href="#install">Get Homeboard <span>↓</span></a>
              <a className={styles.textCta} href="#how-it-works">See how it works <span>→</span></a>
            </div>
            <div className={styles.groupProof}>
              <div className={styles.avatarStack} aria-hidden="true">
                <span>S</span><span>M</span><span>J</span>
              </div>
              <div><strong>Built for the group</strong><span>One search. Every tradeoff visible.</span></div>
            </div>
          </div>
          <AppScreenshot />
        </section>

        <section className={`${styles.pageCard} ${styles.workflowCardPage}`} id="how-it-works">
          <div className={styles.sectionHeading}>
            <span className={styles.kicker}>THE MAIN WORKFLOW</span>
            <h2>Search where you already search.</h2>
            <p>Homeboard fits between the rental sites you know and the decision your group needs to make.</p>
          </div>
          <div className={styles.workflowGrid}>
            <article className={styles.workflowItem}>
              <span className={styles.stepNumber}>01</span>
              <FeatureIcon><span className={styles.browserGlyph}>⌕</span></FeatureIcon>
              <h3>Open the exact listing</h3>
              <p>Browse Zillow, StreetEasy, Apartments.com, Safari, or another rental source as usual.</p>
            </article>
            <article className={styles.workflowItem}>
              <span className={styles.stepNumber}>02</span>
              <FeatureIcon><ShareSymbol /></FeatureIcon>
              <h3>Share it to Homeboard</h3>
              <p>Use the familiar Share button, choose Homeboard, and let it collect the listing details.</p>
            </article>
            <article className={styles.workflowItem}>
              <span className={styles.stepNumber}>03</span>
              <FeatureIcon><span className={styles.checkGlyph}>✓</span></FeatureIcon>
              <h3>Review, then compare</h3>
              <p>Confirm anything missing and save it to the same shortlist, map, and discussion as everyone else.</p>
            </article>
          </div>
          <div className={styles.cardAdvance}>Keep scrolling <span>↓</span></div>
        </section>

        <section className={`${styles.pageCard} ${styles.insideCard}`} id="inside">
          <div className={styles.insideLead}>
            <span className={styles.kicker}>INSIDE HOMEBOARD</span>
            <h2>A decision workspace—not another pile of links.</h2>
            <p>Every surface answers one question: which place actually works for this group, and why?</p>
            <div className={styles.insightCallout}>
              <span>84</span>
              <div><strong>Scores stay explainable</strong><p>See the commute, price, space, and preference tradeoffs behind a recommendation.</p></div>
            </div>
          </div>
          <div className={styles.featureList}>
            <article><span>01</span><div><h3>One shared brief</h3><p>Budget, move timing, neighborhoods, work locations, must-haves, and dealbreakers stay visible to everyone.</p></div></article>
            <article><span>02</span><div><h3>Commute-aware comparison</h3><p>Compare routes from every listing to work and weigh practicality—not just straight-line distance.</p></div></article>
            <article><span>03</span><div><h3>A shortlist with context</h3><p>Keep source links, listing facts, notes, reactions, questions, and decisions attached to the actual place.</p></div></article>
            <article><span>04</span><div><h3>Updates without archaeology</h3><p>See what changed, who responded, and what the group still needs to settle without rereading the chat.</p></div></article>
          </div>
        </section>

        <section className={`${styles.pageCard} ${styles.roadmapCardPage}`} id="roadmap">
          <div className={styles.sectionHeading}>
            <span className={styles.kicker}>THE ROAD AHEAD</span>
            <h2>Small beta. Clear direction.</h2>
            <p>Plans are labeled as plans. The beta comes first; the roadmap follows what real groups need.</p>
          </div>
          <div className={styles.roadmapGrid}>
            {roadmap.map((item, index) => (
              <article className={styles.roadmapItem} key={item.stage}>
                <div><span>{item.stage}</span><small>0{index + 1}</small></div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.pageCard} ${styles.installCard}`} id="install">
          <div className={styles.installCopy}>
            <span className={styles.kicker}>COMING TO IPHONE</span>
            <h2>Your group’s next search belongs in one place.</h2>
            <p>The public beta link is not live yet. This is where TestFlight or App Store installation will begin when the build is ready.</p>
            <div className={styles.installActions}>
              <button type="button" disabled aria-disabled="true">
                <span className={styles.appleGlyph}>●</span>
                <span><small>Beta access</small>Coming soon</span>
              </button>
              <span>No fake signup. No email collected here yet.</span>
            </div>
          </div>
          <aside className={styles.privacyPanel} id="privacy">
            <div className={styles.privacyMark}>⌾</div>
            <span className={styles.kicker}>PRIVACY BEFORE BETA</span>
            <h3>A real policy for the product that actually exists.</h3>
            <p>Before public testing, Homeboard will publish its data collection, storage, sharing, retention, deletion, and contact details in plain language.</p>
          </aside>
        </section>
      </div>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#top"><HouseMark compact /><span>HOMEBOARD</span></a>
        <p>Make the rental decision together.</p>
        <div><a href="#privacy">Privacy</a><a href="#roadmap">Roadmap</a><span>© 2026 Homeboard</span></div>
      </footer>
    </main>
  );
}
