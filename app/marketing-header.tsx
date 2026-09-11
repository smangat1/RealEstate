"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { InstallTrigger } from "./install-experience";
import styles from "./marketing.module.css";

export function MarketingHeader({ mobilePage = 0 }: { mobilePage?: number }) {
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);
  const headerCollapsed = mobilePage > 0;
  const headerAtProduct = mobilePage === 3;

  useEffect(() => {
    if (mobilePage > 0) mobileMenuRef.current?.removeAttribute("open");
  }, [mobilePage]);

  return (
    <header className={`${styles.nav} ${headerCollapsed ? styles.navCollapsed : ""} ${headerAtProduct ? styles.navAtProduct : ""}`}>
      <Link className={styles.wordmark} href="#top" aria-label="Homeboard home">
        <BrandMark className={styles.wordmarkIcon} />
        <span>HOMEBOARD</span>
      </Link>
      <nav className={styles.desktopNav} aria-label="Site navigation">
        <Link href="/?slide=product#product">Product</Link>
        <Link href="/safari">Safari for Mac</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/contact">Contact</Link>
      </nav>
      <details className={styles.mobileMenu} ref={mobileMenuRef}>
        <summary>Menu</summary>
        <nav aria-label="Mobile site navigation">
          <Link href="/?slide=product#product">Product</Link>
          <Link href="/safari">Safari for Mac</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/contact">Contact</Link>
        </nav>
      </details>
      <InstallTrigger className={styles.installCorner} />
    </header>
  );
}
