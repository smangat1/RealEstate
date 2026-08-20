"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { MarketingHeader } from "./marketing-header";
import styles from "./marketing.module.css";

const PAGE_SELECTOR = "[data-page-item]";
const PAGE_HASHES = ["#top", "#problem", "#thinking", "#product"];
const PAGE_LABELS = ["Vibes", "The problem", "Doomscroll", "What Homeboard does"];
const PAGE_SHORT_LABELS = ["Vibes", "Problem", "Thinking", "Homeboard"];
const LAST_PAGE = PAGE_HASHES.length - 1;
const MOBILE_QUERY = "(max-width: 720px)";

function insideOpenDialog(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("dialog[open]"));
}

export function MarketingPager({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null);
  const activePageRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);
  const touchCurrentRef = useRef<number | null>(null);
  const touchStartedAtRef = useRef(0);
  const draggingRef = useRef(false);
  const mobileRef = useRef(true);
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

  const publishPage = useCallback((requestedPage: number) => {
    const nextPage = Math.max(0, Math.min(LAST_PAGE, requestedPage));
    activePageRef.current = nextPage;
    setActivePage(nextPage);
    const root = rootRef.current;
    if (root) root.dataset.page = String(nextPage);
    if (window.location.hash !== PAGE_HASHES[nextPage]) {
      window.history.replaceState(null, "", PAGE_HASHES[nextPage]);
    }
    return nextPage;
  }, []);

  const goToPage = useCallback((requestedPage: number, behavior: ScrollBehavior = "smooth") => {
    const nextPage = publishPage(requestedPage);
    if (mobileRef.current) {
      positionPages(nextPage, 0, true);
      return;
    }

    const root = rootRef.current;
    const item = pageItems()[nextPage];
    if (root && item) root.scrollTo({ top: item.offsetTop, behavior });
  }, [pageItems, positionPages, publishPage]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    let scrollFrame = 0;
    let desktopWheelStartPage: number | null = null;
    let desktopWheelTimer: number | undefined;

    const configure = () => {
      updateViewportHeight();
      mobileRef.current = mediaQuery.matches;
      const hashIndex = PAGE_HASHES.indexOf(window.location.hash);
      const hashPage = hashIndex >= 0 ? hashIndex : activePageRef.current;
      activePageRef.current = hashPage;
      setActivePage(hashPage);
      root.dataset.page = String(hashPage);

      if (mobileRef.current) {
        root.style.removeProperty("--marketing-scroll-progress");
        root.scrollTop = 0;
        positionPages(hashPage, 0, false);
        requestAnimationFrame(() => root.classList.remove(styles.pagerDragging));
      } else {
        root.classList.remove(styles.pagerDragging);
        const items = pageItems();
        items.forEach((item) => {
          item.style.removeProperty("transform");
          item.inert = false;
          item.removeAttribute("aria-hidden");
        });
        requestAnimationFrame(() => root.scrollTo({ top: items[hashPage]?.offsetTop ?? 0, behavior: "auto" }));
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!mobileRef.current || insideOpenDialog(event.target)) return;
      const touch = event.touches[0];
      draggingRef.current = true;
      touchStartRef.current = touch.clientY;
      touchCurrentRef.current = touch.clientY;
      touchStartedAtRef.current = performance.now();
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

    const finishTouch = (cancelled = false) => {
      if (touchStartRef.current === null || touchCurrentRef.current === null) return;
      const distance = touchCurrentRef.current - touchStartRef.current;
      const duration = performance.now() - touchStartedAtRef.current;
      touchStartRef.current = null;
      touchCurrentRef.current = null;
      draggingRef.current = false;

      const travelThreshold = Math.min(30, Math.max(22, window.innerHeight * 0.035));
      const fastFlick = duration < 300 && Math.abs(distance) >= 13;

      if (cancelled) positionPages(activePageRef.current, 0, true);
      else if (distance <= -travelThreshold || (fastFlick && distance < 0)) goToPage(activePageRef.current + 1);
      else if (distance >= travelThreshold || (fastFlick && distance > 0)) goToPage(activePageRef.current - 1);
      else positionPages(activePageRef.current, 0, true);
      updateViewportHeight();
    };

    const onTouchEnd = () => finishTouch(false);
    const onTouchCancel = () => finishTouch(true);

    const onDesktopWheel = (event: WheelEvent) => {
      if (mobileRef.current || insideOpenDialog(event.target) || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (desktopWheelStartPage === null) {
        desktopWheelStartPage = Math.max(0, Math.min(LAST_PAGE, Math.round(root.scrollTop / root.clientHeight)));
      }
      if (desktopWheelTimer !== undefined) window.clearTimeout(desktopWheelTimer);
      desktopWheelTimer = window.setTimeout(() => {
        desktopWheelStartPage = null;
        desktopWheelTimer = undefined;
      }, 500);
    };

    const onDesktopScroll = () => {
      if (mobileRef.current || scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        if (desktopWheelStartPage !== null) {
          const minimumPage = Math.max(0, desktopWheelStartPage - 1);
          const maximumPage = Math.min(LAST_PAGE, desktopWheelStartPage + 1);
          const minimumScroll = minimumPage * root.clientHeight;
          const maximumScroll = maximumPage * root.clientHeight;
          if (root.scrollTop < minimumScroll) root.scrollTop = minimumScroll;
          else if (root.scrollTop > maximumScroll) root.scrollTop = maximumScroll;
        }
        const maximumScroll = Math.max(1, root.scrollHeight - root.clientHeight);
        const scrollProgress = Math.max(0, Math.min(1, root.scrollTop / maximumScroll));
        root.style.setProperty("--marketing-scroll-progress", String(scrollProgress));
        const items = pageItems();
        const center = root.scrollTop + root.clientHeight / 2;
        let nearestPage = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        items.forEach((item, index) => {
          const distance = Math.abs(item.offsetTop + item.offsetHeight / 2 - center);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestPage = index;
          }
        });
        if (nearestPage !== activePageRef.current) publishPage(nearestPage);
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (insideOpenDialog(event.target)) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;

      if (!mobileRef.current) {
        if (["ArrowDown", "PageDown", " "].includes(event.key)) {
          event.preventDefault();
          root.scrollBy({ top: event.key === "ArrowDown" ? 96 : root.clientHeight * 0.82, behavior: "smooth" });
        } else if (["ArrowUp", "PageUp"].includes(event.key)) {
          event.preventDefault();
          root.scrollBy({ top: event.key === "ArrowUp" ? -96 : root.clientHeight * -0.82, behavior: "smooth" });
        } else if (event.key === "Home") {
          event.preventDefault();
          goToPage(0);
        } else if (event.key === "End") {
          event.preventDefault();
          goToPage(LAST_PAGE);
        }
        return;
      }

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
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", onTouchCancel, { passive: true });
    root.addEventListener("wheel", onDesktopWheel, { passive: true });
    root.addEventListener("scroll", onDesktopScroll, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    mediaQuery.addEventListener("change", configure);

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchCancel);
      root.removeEventListener("wheel", onDesktopWheel);
      root.removeEventListener("scroll", onDesktopScroll);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      mediaQuery.removeEventListener("change", configure);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      if (desktopWheelTimer !== undefined) window.clearTimeout(desktopWheelTimer);
    };
  }, [goToPage, pageItems, positionPages, publishPage, updateViewportHeight]);

  return (
    <main
      className={`${styles.site} homeboard-marketing`}
      data-page="0"
      ref={rootRef}
    >
      <MarketingHeader mobilePage={activePage} />
      <aside className={styles.scrollRoute} aria-hidden="true">
        <span className={styles.scrollRouteCount}>
          <b>{String(activePage + 1).padStart(2, "0")}</b>
          <small>/04</small>
        </span>
        <span className={styles.scrollRouteTrack}>
          <i className={styles.scrollRouteFill} />
          <b className={styles.scrollRouteThumb} />
          {PAGE_SHORT_LABELS.map((label, index) => (
            <i
              className={`${styles.scrollRouteStop} ${index <= activePage ? styles.scrollRouteStopPassed : ""}`}
              key={label}
              style={{ top: `${(index / LAST_PAGE) * 100}%` }}
            />
          ))}
        </span>
        <span className={styles.scrollRouteName}>{PAGE_SHORT_LABELS[activePage]}</span>
        <span className={styles.scrollRouteHint}>Scroll</span>
      </aside>
      <p className={styles.pageStatus} aria-live="polite" aria-atomic="true">
        Page {activePage + 1} of {PAGE_HASHES.length}: {PAGE_LABELS[activePage]}
      </p>
      {children}
    </main>
  );
}
