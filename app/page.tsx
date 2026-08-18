import Image from "next/image";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import styles from "./marketing.module.css";

export const metadata: Metadata = {
  title: "Homeboard — Your next home search just got an upgrade",
  description:
    "Homeboard keeps rental listings, commutes, preferences, and group tradeoffs in one shared place.",
};

const roadmap = [
  {
    stage: "Available in beta",
    title: "A calmer shared search",
    copy: "Private boards, listing imports, a group shortlist, updates, and commute-aware comparison on iPhone.",
  },
  {
    stage: "Next improvement",
    title: "Sharper route intelligence",
    copy: "More reliable car, rail, bus, and walking choices with clearer explanations for every score.",
  },
  {
    stage: "Planned upgrade",
    title: "Broader listing support",
    copy: "More rental apps and websites, stronger listing verification, and smoother iPhone-to-Mac handoff.",
  },
  {
    stage: "On the wishlist",
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

function ListingGallery() {
  return (
    <figure className={styles.listingGallery}>
      <div className={styles.galleryViewport} aria-label="Homeboard comparison map running on iPhone">
        <Image
          src="/images/homeboard-comparison-map.png"
          alt="The real Homeboard comparison map showing three scored listings, a work node, and color-matched commute routes"
          width={1179}
          height={2556}
          priority
          sizes="(max-width: 760px) 100vw, 58vw"
        />
        <span className={styles.photoBadge}>LIVE APP VIEW</span>
      </div>
      <figcaption>
        <span><i /> Comparison map</span>
        <span>1 of 1</span>
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
          <a href="#how-it-works">Tour</a>
          <a href="#inside">Amenities</a>
          <a href="#roadmap">Improvements</a>
        </nav>
        <a className={styles.navCta} href="#install">Get the app</a>
      </header>

      <div className={styles.listingPage}>
        <section className={`${styles.pageCard} ${styles.heroCard}`} id="top">
          <ListingGallery />
          <div className={styles.heroCopy}>
            <div className={styles.listingStatus}><span>FOR SHARED SEARCHES</span><b>BETA SOON</b></div>
            <h1>Your next home search just got an upgrade.</h1>
            <p className={styles.listingLocation}>Homeboard · iPhone + Mac · Built for groups</p>
            <div className={styles.listingFacts} aria-label="Homeboard listing details">
              <span><b>1</b><small>shared board</small></span>
              <span><b>∞</b><small>listings welcome</small></span>
              <span><b>0</b><small>lost links</small></span>
            </div>
            <div className={styles.listingDescription}>
              <span className={styles.kicker}>OVERVIEW</span>
              <p>Keep listings, commutes, preferences, and every group tradeoff in one place—before the chat becomes the problem.</p>
            </div>
            <div className={styles.heroActions}>
              <a className={styles.primaryCta} href="#install">Check availability <span>→</span></a>
              <a className={styles.textCta} href="#how-it-works">Take the tour</a>
            </div>
            <div className={styles.listedBy}>
              <HouseMark compact />
              <div><small>LISTED BY</small><strong>Homeboard</strong><span>One search. Every tradeoff visible.</span></div>
            </div>
          </div>
        </section>

        <nav className={styles.listingSubnav} aria-label="Listing sections">
          <a href="#top">Overview</a>
          <a href="#how-it-works">Tour</a>
          <a href="#inside">Amenities</a>
          <a href="#roadmap">Improvements</a>
        </nav>

        <div className={styles.listingContent}>
          <div className={styles.listingMainColumn}>
        <section className={`${styles.pageCard} ${styles.workflowCardPage}`} id="how-it-works">
          <div className={styles.sectionHeading}>
            <span className={styles.kicker}>HOW TO TOUR</span>
            <h2>See a listing you like? Bring it home.</h2>
            <p>Keep browsing the rental sites you already use. Homeboard starts working when something is worth sharing.</p>
          </div>
          <div className={styles.workflowGrid}>
            <article className={styles.workflowItem}>
              <span className={styles.stepNumber}>01</span>
              <FeatureIcon><span className={styles.browserGlyph}>⌕</span></FeatureIcon>
              <h3>Browse the neighborhood</h3>
              <p>Browse Zillow, StreetEasy, Apartments.com, Safari, or another rental source as usual.</p>
            </article>
            <article className={styles.workflowItem}>
              <span className={styles.stepNumber}>02</span>
              <FeatureIcon><ShareSymbol /></FeatureIcon>
              <h3>Send the address over</h3>
              <p>Use the familiar Share button, choose Homeboard, and let it collect the listing details.</p>
            </article>
            <article className={styles.workflowItem}>
              <span className={styles.stepNumber}>03</span>
              <FeatureIcon><span className={styles.checkGlyph}>✓</span></FeatureIcon>
              <h3>Take the group tour</h3>
              <p>Confirm anything missing and save it to the same shortlist, map, and discussion as everyone else.</p>
            </article>
          </div>
          <div className={styles.cardAdvance}>More listing details below <span>↓</span></div>
        </section>

        <section className={`${styles.pageCard} ${styles.insideCard}`} id="inside">
          <div className={styles.insideLead}>
            <span className={styles.kicker}>AMENITIES INCLUDED</span>
            <h2>Smarter search. Shared boards. Easier comparison.</h2>
            <p>Everything included is designed to answer one question: which place actually works for this group, and why?</p>
            <div className={styles.insightCallout}>
              <span>84</span>
              <div><strong>Scores stay explainable</strong><p>See the commute, price, space, and preference tradeoffs behind a recommendation.</p></div>
            </div>
          </div>
          <div className={styles.featureList}>
            <article><span>01</span><div><h3>Open-plan decision making</h3><p>Budget, move timing, neighborhoods, work locations, must-haves, and dealbreakers stay visible to everyone.</p></div></article>
            <article><span>02</span><div><h3>Commute included</h3><p>Compare routes from every listing to work and weigh practicality—not just straight-line distance.</p></div></article>
            <article><span>03</span><div><h3>Storage for the useful context</h3><p>Keep source links, listing facts, notes, reactions, questions, and decisions attached to the actual place.</p></div></article>
            <article><span>04</span><div><h3>Group-chat resistant</h3><p>See what changed, who responded, and what the group still needs to settle without rereading the chat.</p></div></article>
          </div>
        </section>

        <section className={`${styles.pageCard} ${styles.roadmapCardPage}`} id="roadmap">
          <div className={styles.sectionHeading}>
            <span className={styles.kicker}>PROPERTY HISTORY + PLANNED IMPROVEMENTS</span>
            <h2>The place is still getting better.</h2>
            <p>Like any honest listing, future upgrades are labeled clearly. The beta comes first; the roadmap follows what real groups need.</p>
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
            <span className={styles.kicker}>AVAILABILITY</span>
            <h2>Move-in date: public beta.</h2>
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
            <span className={styles.kicker}>HOUSE RULES</span>
            <h3>Privacy terms written for the product that actually exists.</h3>
            <p>Before public testing, Homeboard will publish its data collection, storage, sharing, retention, deletion, and contact details in plain language.</p>
          </aside>
        </section>
          </div>

          <aside className={styles.listingSidebar} aria-label="Homeboard availability">
            <span className={styles.sidebarStatus}><i /> Beta availability</span>
            <h2>Coming soon</h2>
            <p>Homeboard’s public beta will open through TestFlight when the build is ready.</p>
            <a href="#install">Check availability</a>
            <dl>
              <div><dt>Platform</dt><dd>iPhone + Mac</dd></div>
              <div><dt>Best for</dt><dd>Friends searching together</dd></div>
              <div><dt>Listing ID</dt><dd>HB-BETA-01</dd></div>
            </dl>
            <small>No fake signup or email collection.</small>
          </aside>
        </div>
      </div>

      <div className={styles.mobileActionBar}>
        <div><small>Beta availability</small><strong>Coming soon</strong></div>
        <a href="#install">Get Homeboard</a>
      </div>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#top"><HouseMark compact /><span>HOMEBOARD</span></a>
        <p>Make the rental decision together.</p>
        <div><a href="#privacy">Privacy</a><a href="#roadmap">Roadmap</a><span>© 2026 Homeboard</span></div>
      </footer>
    </main>
  );
}
