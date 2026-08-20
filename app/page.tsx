import Image from "next/image";
import type { Metadata } from "next";

import { InstallExperience, InstallTrigger } from "./install-experience";
import { MarketingPager } from "./marketing-pager";
import styles from "./marketing.module.css";

export const metadata: Metadata = {
  title: {
    absolute: "Homeboard — Pick your next home on vibes",
  },
  description:
    "Save the places you fall for. Homeboard handles the commute math, comparisons, and group tradeoffs.",
};

export default function HomePage() {
  return (
    <MarketingPager>
      <section className={styles.cover} id="top" data-page-item aria-labelledby="cover-heading">
        <div className={styles.coverCopy}>
          <p className={styles.issue}>A manifesto for the group chat · Issue 01</p>
          <h1 id="cover-heading">
            <span>Pick your next home</span>
            <span>on vibes.</span>
            <em>We’ll do the thinking.</em>
          </h1>
          <p className={styles.dek}>
            Fall for the weird kitchen. Obsess over the neighborhood. Save 27 places at 1 a.m.
          </p>
        </div>

        <a className={styles.scrollPrompt} href="#problem" aria-label="Continue to the next page">↓</a>
      </section>

      <section className={`${styles.statement} ${styles.mapsStatement}`} id="problem" data-page-item aria-labelledby="problem-heading">
        <p className={styles.marginNote}>The first problem</p>
        <h2 id="problem-heading">
          You shouldn’t have to open Maps every time you find somewhere <em>that matches your aesthetic.</em>
        </h2>
        <aside className={styles.problemAside}>
          <span>One place you love.</span>
          <strong>Seven tabs.</strong>
          <em>No actual answer.</em>
          <p>Rent is one number. A life is not.</p>
        </aside>
      </section>

      <section className={styles.thesis} id="thinking" data-page-item aria-labelledby="thinking-heading">
        <div className={styles.thesisRule}><span>27 saved</span><i /><span>1 shared board</span></div>
        <h2 id="thinking-heading">
          Doomscroll first.
          <br />
          <em>Optimize later.</em>
        </h2>
        <p>Homeboard turns saved places into a decision.</p>
      </section>

      <section className={styles.productStage} id="product" data-page-item aria-labelledby="product-heading">
        <div className={styles.productCopy}>
          <span className={styles.eyebrow}>What Homeboard actually does</span>
          <h2 id="product-heading">Save what catches your eye. See what actually works.</h2>
          <div className={styles.productFeatures}>
            <article><b>01</b><p><strong>Collects the listing</strong>Address, rent, bedrooms, bathrooms, and the source stay together.</p></article>
            <article><b>02</b><p><strong>Checks the real commute</strong>Drive, train, bus, and walking routes are compared for every saved place.</p></article>
            <article><b>03</b><p><strong>Explains the tradeoff</strong>Your group sees why a place fits—not just a mystery score.</p></article>
          </div>
          <p className={styles.productRoadmap}>
            <strong>On the roadmap</strong>
            Better routes · more rental sources · richer neighborhood context · plain-language privacy
          </p>
          <InstallTrigger className={styles.installTrigger} detail="Private beta details" />
          <nav className={styles.productLinks} aria-label="Homeboard information">
            <a href="/privacy">Privacy</a>
            <a href="/contact">Contact</a>
            <span>© {new Date().getFullYear()} Homeboard</span>
          </nav>
        </div>

        <figure className={styles.productFrame}>
          <Image
            src="/images/homeboard-comparison-map-clean.webp"
            alt="Homeboard comparison map showing scored rental listings, a work destination, and color-matched commute routes"
            width={1179}
            height={2360}
            sizes="(max-width: 720px) 1px, (max-width: 1000px) 280px, 390px"
            priority={false}
          />
        </figure>
      </section>

      <InstallExperience />
    </MarketingPager>
  );
}
