import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import styles from "./info.module.css";

const currentYear = new Date().getFullYear();
const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@joinhomeboard.com";

export function InfoHeader() {
  return (
    <header className={styles.nav}>
      <Link className={styles.logo} href="/" aria-label="Homeboard home">
        <BrandMark className={styles.logoMark} />
        <span>Homeboard</span>
      </Link>

      <nav className={styles.desktopLinks} aria-label="Information pages">
        <Link href="/mac">Homeboard for Mac</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Community rules</Link>
        <Link href="/support">Support</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/">Home</Link>
      </nav>

      <details className={styles.mobileMenu}>
        <summary>Menu</summary>
        <nav aria-label="Mobile information pages">
          <Link href="/mac">Homeboard for Mac</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Community rules</Link>
          <Link href="/support">Support</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/">Home</Link>
        </nav>
      </details>
    </header>
  );
}

export function InfoFooter() {
  return (
    <footer className={styles.footer}>
      <Link className={styles.footerLogo} href="/" aria-label="Homeboard home">
        <BrandMark className={styles.footerLogoMark} />
        <span>Homeboard</span>
      </Link>
      <nav aria-label="Footer">
        <Link href="/mac">Homeboard for Mac</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Community rules</Link>
        <Link href="/support">Support</Link>
        <Link href="/contact">Contact</Link>
      </nav>
      <a className={styles.footerContact} href={`mailto:${supportEmail}`}>
        contact us: {supportEmail}
      </a>
      <span>© {currentYear} Homeboard</span>
    </footer>
  );
}

export function SupportEmail() {
  return (
    <a className={styles.emailLink} href={`mailto:${supportEmail}`}>
      {supportEmail}
    </a>
  );
}
