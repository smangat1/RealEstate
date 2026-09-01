import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { ShareToMacButton } from "@/components/share-to-mac-button";
import { getSiteUrl } from "@/lib/site-url";
import styles from "./safari.module.css";

const siteUrl = getSiteUrl();
const setupUrl = new URL("/safari", siteUrl);
const previewImage = new URL("/api/og?slide=product", siteUrl);

export const metadata: Metadata = {
  title: { absolute: "Homeboard for Safari: Save rentals from your Mac" },
  description: "Connect Homeboard to Safari on your Mac, review a rental in one click, and save it to the same shared board as your iPhone.",
  alternates: { canonical: setupUrl },
  openGraph: {
    type: "website",
    siteName: "Homeboard",
    url: setupUrl,
    title: "Homeboard for Safari",
    description: "One click in Safari sends a reviewed rental to your group’s Homeboard.",
    images: [{ url: previewImage, width: 1200, height: 630, alt: "Homeboard shared rental board" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Homeboard for Safari",
    description: "Save the rental in front of you to the same Homeboard as your iPhone.",
    images: [previewImage],
  },
};

function configuredMacInstallUrl() {
  const value = process.env.NEXT_PUBLIC_MAC_INSTALL_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function ExtensionPreview() {
  return (
    <figure className={styles.extensionPreview} aria-label="Preview of Homeboard in Safari">
      <div className={styles.browserBar}>
        <span className={styles.trafficLights} aria-hidden="true"><i /><i /><i /></span>
        <span className={styles.addressBar}>streeteasy.com · Rental listing</span>
        <BrandMark className={styles.toolbarMark} />
      </div>
      <div className={styles.listingCanvas}>
        <div className={styles.fakePhoto}><span>Rental listing</span></div>
        <div className={styles.fakeListingCopy} aria-hidden="true">
          <i /><i /><i /><i />
        </div>
        <section className={styles.extensionCard}>
          <header>
            <BrandMark className={styles.extensionMark} />
            <div><small>HOMEBOARD · STREETEASY</small><strong>Listing ready to review</strong></div>
            <span>⌘↵</span>
          </header>
          <p>123 Greenpoint Ave · $4,800 · 3 bd · 2 ba</p>
          <div className={styles.factRow}><span>Exact address</span><span>Price found</span><span>Unit found</span></div>
          <button type="button" tabIndex={-1}>Review and save</button>
        </section>
      </div>
      <figcaption>The Safari button reads the page, lets you confirm the facts, then saves to your selected board.</figcaption>
    </figure>
  );
}

export default function SafariSetupPage() {
  const macInstallUrl = configuredMacInstallUrl();

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.wordmark} href="/" aria-label="Homeboard home">
          <BrandMark className={styles.wordmarkIcon} />
          <span>HOMEBOARD</span>
        </Link>
        <nav aria-label="Safari setup navigation">
          <a href="#setup">Setup</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/?slide=product#product">Product</Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Homeboard for Safari · Mac companion</p>
            <h1>See a rental.<br /><em>Send it home.</em></h1>
            <p className={styles.lead}>
              Save the listing in front of you without copying a link, switching devices, or hunting through an extension directory.
            </p>
            <div className={styles.heroActions}>
              {macInstallUrl ? (
                <a className={styles.primaryAction} href={macInstallUrl}>Get the Mac companion <span aria-hidden="true">↗</span></a>
              ) : (
                <span className={styles.betaBadge}>Mac companion · Private beta</span>
              )}
              <ShareToMacButton className={styles.shareAction} />
            </div>
            <p className={styles.platformNote}>Requires macOS Safari. The iPhone app completes the secure pairing.</p>
          </div>
          <ExtensionPreview />
        </section>

        <section className={styles.setupSection} id="setup" aria-labelledby="setup-heading">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Four small steps</p>
            <h2 id="setup-heading">Your Mac and your board, connected.</h2>
          </div>
          <div className={styles.steps}>
            <article><b>01</b><span className={styles.stepIcon}>↓</span><h3>Open the companion</h3><p>Install Homeboard Safari Setup, then open it once so Safari can see the extension.</p></article>
            <article><b>02</b><span className={styles.stepIcon}>⌁</span><h3>Scan the QR</h3><p>On iPhone, open Homeboard → Settings → Connect a Mac and scan the code on screen.</p></article>
            <article><b>03</b><span className={styles.stepIcon}>✓</span><h3>Enable in Safari</h3><p>Click Open Safari Settings in the companion and switch Homeboard on. Apple requires this one manual approval.</p></article>
            <article><b>04</b><span className={styles.stepIcon}>⌂</span><h3>Save a rental</h3><p>Open a listing, click Homeboard in Safari’s toolbar, review the details, and choose Save.</p></article>
          </div>
          {!macInstallUrl ? (
            <aside className={styles.developerNote}>
              <strong>Testing the private build?</strong>
              <span>In Xcode, run <code>Homeboard Safari Setup (Mac)</code> on <code>My Mac</code>. The public install button will appear here when <code>NEXT_PUBLIC_MAC_INSTALL_URL</code> is configured.</span>
            </aside>
          ) : null}
        </section>

        <section className={styles.detailSection} id="how-it-works">
          <div>
            <p className={styles.eyebrow}>What the extension does</p>
            <h2>It collects facts.<br /><em>You make the call.</em></h2>
          </div>
          <div className={styles.detailList}>
            <article><span>01</span><div><strong>Reads only the open listing</strong><p>Address, unit, rent, bedrooms, bathrooms, and source are prepared for review.</p></div></article>
            <article><span>02</span><div><strong>Shows its work before saving</strong><p>Missing or uncertain details stay editable. Building pages ask you to choose the exact unit.</p></div></article>
            <article><span>03</span><div><strong>Uses the same shared board</strong><p>Your selected destination stays in the companion, and offline saves can sync later.</p></div></article>
          </div>
        </section>

        <section className={styles.supportedSection}>
          <p className={styles.eyebrow}>Made for the tabs you already have open</p>
          <p>Zillow · StreetEasy · Realtor · Apartments.com · Redfin · Rent.com · RentHop · Craigslist · Compass · Corcoran · Douglas Elliman · Serhant · Sotheby’s</p>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/">Homeboard</Link>
        <nav><Link href="/privacy">Privacy</Link><Link href="/contact">Contact</Link></nav>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
