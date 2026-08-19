"use client";

import { useEffect, useState } from "react";

import styles from "./marketing.module.css";

export function MarketingHeader() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const update = () => setCollapsed(window.scrollY > window.innerHeight * 0.35);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={`${styles.nav} ${collapsed ? styles.navCollapsed : ""}`}>
      <a className={styles.wordmark} href="#top" aria-label="Homeboard home">
        HOMEBOARD
      </a>
      <nav className={styles.desktopNav} aria-label="Site navigation">
        <a href="#product">Product</a>
        <a href="/privacy">Privacy</a>
        <a href="/contact">Contact</a>
      </nav>
      <details className={styles.mobileMenu}>
        <summary>Menu</summary>
        <nav aria-label="Mobile site navigation">
          <a href="#product">Product</a>
          <a href="/privacy">Privacy</a>
          <a href="/contact">Contact</a>
        </nav>
      </details>
      <a className={styles.installCorner} href="#product">
        Install Homeboard <span aria-hidden="true">↗</span>
      </a>
    </header>
  );
}
