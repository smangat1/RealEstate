"use client";

import { useEffect, useState } from "react";

import styles from "./marketing.module.css";

export function MarketingHeader({ mobilePage = 0 }: { mobilePage?: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const [atProduct, setAtProduct] = useState(false);

  useEffect(() => {
    const update = () => {
      setCollapsed(window.scrollY > window.innerHeight * 0.35);
      const product = document.getElementById("product");
      const bounds = product?.getBoundingClientRect();
      setAtProduct(Boolean(bounds && bounds.top <= window.innerHeight * 0.4 && bounds.bottom > 0));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const headerCollapsed = collapsed || mobilePage > 0;
  const headerAtProduct = atProduct || mobilePage === 3;

  return (
    <header className={`${styles.nav} ${headerCollapsed ? styles.navCollapsed : ""} ${headerAtProduct ? styles.navAtProduct : ""}`}>
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
