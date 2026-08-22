"use client";

import { useEffect, useRef } from "react";

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
      <a className={styles.wordmark} href="#top" aria-label="Homeboard home">
        <BrandMark className={styles.wordmarkIcon} />
        <span>HOMEBOARD</span>
      </a>
      <nav className={styles.desktopNav} aria-label="Site navigation">
        <a href="/?slide=product#product">Product</a>
        <a href="/privacy">Privacy</a>
        <a href="/contact">Contact</a>
      </nav>
      <details className={styles.mobileMenu} ref={mobileMenuRef}>
        <summary>Menu</summary>
        <nav aria-label="Mobile site navigation">
          <a href="/?slide=product#product">Product</a>
          <a href="/privacy">Privacy</a>
          <a href="/contact">Contact</a>
        </nav>
      </details>
      <InstallTrigger className={styles.installCorner} />
    </header>
  );
}
