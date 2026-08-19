import Image from "next/image";
import type { Metadata } from "next";

import styles from "./marketing.module.css";

export const metadata: Metadata = {
  title: "Homeboard — Pick your next home on vibes",
  description:
    "Save the places you fall for. Homeboard handles the commute math, comparisons, and group tradeoffs.",
};

const futurePlans = [
  ["01", "Better routes", "Clearer car, rail, bus, and walking choices for every listing."],
  ["02", "More places", "Stronger importing across more rental websites and apps."],
  ["03", "More context", "Neighborhood fit, group preferences, and tradeoffs beyond the listing facts."],
  ["04", "Plain privacy", "A real policy covering collection, storage, sharing, retention, and deletion before beta."],
];

function RouteNode({ className, label }: { className: string; label: string }) {
  return (
    <span className={`${styles.routeNode} ${className}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export default function HomePage() {
  return (
    <main className={styles.site}>
      <header className={styles.nav}>
        <a className={styles.wordmark} href="#top" aria-label="Homeboard home">
          HOMEBOARD
        </a>
        <a className={styles.installCorner} href="#product">
          Install Homeboard <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.cover} id="top">
        <div className={styles.coverCopy}>
          <p className={styles.issue}>A manifesto for the group chat · Issue 01</p>
          <h1>
            Pick your next home
            <br />
            on vibes.
            <br />
            <em>We’ll do the thinking.</em>
          </h1>
          <p className={styles.dek}>
            Fall for the weird kitchen. Obsess over the neighborhood. Save 27 places at 1 a.m.
          </p>
        </div>

        <div className={styles.coverDiagram} aria-hidden="true">
          <span className={`${styles.metric} ${styles.metricRent}`}>$2,325</span>
          <span className={`${styles.metric} ${styles.metricTime}`}>42 min</span>
          <span className={`${styles.metric} ${styles.metricStops}`}>2 transfers</span>
          <span className={`${styles.metric} ${styles.metricMiles}`}>8.4 mi</span>
          <RouteNode className={styles.dotHome} label="home?" />
          <RouteNode className={styles.dotWork} label="work" />
          <RouteNode className={styles.dotGym} label="gym" />
          <span className={styles.lineOne} />
          <span className={styles.lineTwo} />
          <span className={styles.lineThree} />
        </div>

        <p className={styles.scrollPrompt}>Scroll for the practical part <span aria-hidden="true">↓</span></p>
      </section>

      <section className={`${styles.statement} ${styles.mapsStatement}`}>
        <p className={styles.marginNote}>The first problem</p>
        <h2>
          You shouldn’t have to open Maps every time you find somewhere <em>cute.</em>
        </h2>
        <div className={styles.noiseField} aria-hidden="true">
          <span className={styles.noiseA}>31 min</span>
          <span className={styles.noiseB}>+$225</span>
          <span className={styles.noiseC}>3 stops</span>
          <span className={styles.noiseD}>walk?</span>
          <span className={styles.noiseE}>???</span>
          <span className={styles.noiseF}>1.7 mi</span>
          <span className={styles.noiseG}>partner</span>
        </div>
      </section>

      <section className={styles.routeEssay} aria-labelledby="route-heading">
        <div className={styles.routeCopy}>
          <span className={styles.eyebrow}>The commute-math spiral</span>
          <h2 id="route-heading">One cute place. Seven tabs. No actual answer.</h2>
          <p>
            Rent is one number. A life is not. Work, friends, the gym, the train, and who has a car all pull in different directions.
          </p>
        </div>
        <div className={styles.transitSketch} aria-hidden="true">
          <span className={`${styles.track} ${styles.trackA}`} />
          <span className={`${styles.track} ${styles.trackB}`} />
          <span className={`${styles.track} ${styles.trackC}`} />
          <RouteNode className={styles.sketchHome} label="HOME?" />
          <RouteNode className={styles.sketchWork} label="WORK · 42m" />
          <RouteNode className={styles.sketchFriend} label="FRIENDS · 28m" />
          <RouteNode className={styles.sketchTrain} label="TRAIN · 9m" />
          <span className={styles.sketchPrice}>$2,180</span>
          <span className={styles.sketchTransfer}>2 transfers</span>
        </div>
      </section>

      <section className={`${styles.statement} ${styles.memoryStatement}`}>
        <p className={styles.marginNote}>The second problem</p>
        <h2>You shouldn’t have to remember whether the last one was actually better.</h2>
        <p className={styles.sideCopy}>
          Was it cheaper? Closer? Bigger? Or did it just have better photos?
        </p>
      </section>

      <section className={styles.thesis}>
        <div className={styles.thesisRule}><span>27 saved</span><i /><span>1 shared board</span></div>
        <h2>
          Doomscroll first.
          <br />
          <em>Optimize later.</em>
        </h2>
        <p>Homeboard turns saved places into a decision.</p>
      </section>

      <section className={styles.reveal} aria-labelledby="reveal-heading">
        <div className={styles.revealHeading}>
          <span className={styles.eyebrow}>The useful part</span>
          <h2 id="reveal-heading">Eventually, you do have to choose.</h2>
          <p>That’s when the chaos becomes a board, the dots become routes, and the saved links become an actual decision.</p>
        </div>

        <div className={styles.productStage} id="product">
          <figure className={styles.productFrame}>
            <Image
              src="/images/homeboard-comparison-map.png"
              alt="Homeboard comparison map showing scored rental listings, a work destination, and color-matched commute routes"
              width={1179}
              height={2556}
              sizes="(max-width: 720px) 120vw, 76vw"
              priority={false}
            />
          </figure>
          <span className={`${styles.annotation} ${styles.annotationA}`}>← your shortlist, without the spreadsheet</span>
          <span className={`${styles.annotation} ${styles.annotationB}`}>commute accounted for ↓</span>
          <span className={`${styles.annotation} ${styles.annotationC}`}>actual logic lives here ↗</span>
        </div>
      </section>

      <section className={styles.betweenSection}>
        <p>
          Homeboard is for the part of apartment hunting between
        </p>
        <h2>“wait, this one is kinda perfect”</h2>
        <span>and</span>
        <h2>“okay, but does this actually work?”</h2>
      </section>

      <section className={styles.rhythm} aria-label="How Homeboard fits the search">
        <div><span>01</span><h2>Save first.</h2><p>Keep whatever catches your eye.</p></div>
        <div><span>02</span><h2>Compare later.</h2><p>Price, space, commute, and group fit stay attached.</p></div>
        <div><span>03</span><h2>Think less.</h2><p>The boring math happens in the background.</p></div>
        <div><span>04</span><h2>Keep scrolling.</h2><p>You’ll know when something is worth stopping for.</p></div>
      </section>

      <section className={styles.future} aria-labelledby="future-heading">
        <div className={styles.futureLead}>
          <span className={styles.eyebrow}>Still being improved</span>
          <h2 id="future-heading">The beta comes first. The useful parts keep getting better.</h2>
        </div>
        <div className={styles.futureList}>
          {futurePlans.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.install} id="availability">
        <p className={styles.marginNote}>Homeboard · iPhone + Mac · Built for groups</p>
        <h2>Keep scrolling.<br /><em>Just not alone.</em></h2>
        <p className={styles.installCopy}>Public beta access will open here when the build is ready.</p>
        <button type="button" disabled aria-disabled="true">
          Install Homeboard <span aria-hidden="true">↗</span>
          <small>Coming soon</small>
        </button>
      </section>

      <footer className={styles.footer} id="privacy">
        <strong>HOMEBOARD</strong>
        <p>Save on impulse. Decide with context.</p>
        <div><span>Privacy policy before beta</span><span>© 2026</span></div>
      </footer>
    </main>
  );
}
