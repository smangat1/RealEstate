"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { MarketingHeader } from "./marketing-header";
import styles from "./marketing.module.css";

const PAGE_SELECTOR = "[data-page-item]";
const PAGE_HASHES = ["#top", "#problem", "#thinking", "#product"];
const PAGE_LABELS = ["Vibes", "The problem", "Doomscroll", "What Homeboard does"];
const LAST_PAGE = PAGE_HASHES.length - 1;

function insideOpenDialog(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("dialog[open]"));
}

export function MarketingPager({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null);
  const activePageRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);
  const touchCurrentRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const wheelLockedUntilRef = useRef(0);
  const [activePage, setActivePage] = useState(0);

  const pageItems = useCallback(() => {
    return Array.from(rootRef.current?.querySelectorAll<HTMLElement>(PAGE_SELECTOR) ?? []);
  }, []);

  const updateViewportHeight = useCallback(() => {
    const root = rootRef.current;
    if (!root || draggingRef.current) return;
    const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
    root.style.setProperty("--marketing-viewport-height", `${visibleHeight}px`);
  }, []);

  const positionPages = useCallback((page: number, drag = 0, animate = true) => {
    const root = rootRef.current;
    if (!root) return;

    const items = pageItems();
    root.dataset.page = String(page);
    root.classList.toggle(styles.pagerDragging, !animate);

    if (animate) void root.offsetHeight;

    items.forEach((item, index) => {
      item.style.transform = `translate3d(0, calc(${(index - page) * 100}% + ${drag}px), 0)`;
      item.inert = index !== page;
      if (index === page) item.removeAttribute("aria-hidden");
      else item.setAttribute("aria-hidden", "true");
    });
  }, [pageItems]);

  const goToPage = useCallback((requestedPage: number) => {
    const nextPage = Math.max(0, Math.min(LAST_PAGE, requestedPage));
    activePageRef.current = nextPage;
    setActivePage(nextPage);
    positionPages(nextPage, 0, true);
    if (window.location.hash !== PAGE_HASHES[nextPage]) {
      window.history.replaceState(null, "", PAGE_HASHES[nextPage]);
    }
  }, [positionPages]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const configure = () => {
      updateViewportHeight();
      const hashIndex = PAGE_HASHES.indexOf(window.location.hash);
      const hashPage = hashIndex >= 0 ? hashIndex : activePageRef.current;
      activePageRef.current = hashPage;
      setActivePage(hashPage);
      positionPages(hashPage, 0, false);
      requestAnimationFrame(() => root.classList.remove(styles.pagerDragging));
    };

    const onTouchStart = (event: TouchEvent) => {
      if (insideOpenDialog(event.target)) return;
      const touch = event.touches[0];
      draggingRef.current = true;
      touchStartRef.current = touch.clientY;
      touchCurrentRef.current = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (touchStartRef.current === null || insideOpenDialog(event.target)) return;
      const currentY = event.touches[0].clientY;
      touchCurrentRef.current = currentY;
      let drag = currentY - touchStartRef.current;

      if ((activePageRef.current === 0 && drag > 0) || (activePageRef.current === LAST_PAGE && drag < 0)) {
        drag *= 0.2;
      }

      event.preventDefault();
      positionPages(activePageRef.current, drag, false);
    };

    const finishTouch = () => {
      if (touchStartRef.current === null || touchCurrentRef.current === null) return;
      const distance = touchCurrentRef.current - touchStartRef.current;
      touchStartRef.current = null;
      touchCurrentRef.current = null;
      draggingRef.current = false;

      if (distance <= -28) goToPage(activePageRef.current + 1);
      else if (distance >= 28) goToPage(activePageRef.current - 1);
      else positionPages(activePageRef.current, 0, true);
      updateViewportHeight();
    };

    const onWheel = (event: WheelEvent) => {
      if (insideOpenDialog(event.target) || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      const now = Date.now();
      if (Math.abs(event.deltaY) < 8) return;
      if (now < wheelLockedUntilRef.current) {
        wheelLockedUntilRef.current = now + 220;
        return;
      }
      wheelLockedUntilRef.current = now + 620;
      goToPage(activePageRef.current + (event.deltaY > 0 ? 1 : -1));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (insideOpenDialog(event.target)) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;

      if (["ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        goToPage(activePageRef.current + 1);
      } else if (["ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        goToPage(activePageRef.current - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goToPage(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goToPage(LAST_PAGE);
      }
    };

    const onHashChange = () => {
      const hashPage = PAGE_HASHES.indexOf(window.location.hash);
      if (hashPage >= 0) goToPage(hashPage);
    };

    configure();
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", finishTouch, { passive: true });
    root.addEventListener("touchcancel", finishTouch, { passive: true });
    root.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", finishTouch);
      root.removeEventListener("touchcancel", finishTouch);
      root.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
    };
  }, [goToPage, pageItems, positionPages, updateViewportHeight]);

  return (
    <main
      className={`${styles.site} homeboard-marketing`}
      data-page="0"
      ref={rootRef}
    >
      <MarketingHeader mobilePage={activePage} />
      <p className={styles.pageStatus} aria-live="polite" aria-atomic="true">
        Page {activePage + 1} of {PAGE_HASHES.length}: {PAGE_LABELS[activePage]}
      </p>
      {children}
    </main>
  );
}
