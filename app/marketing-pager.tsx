"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getMarketingSlideIndex, MARKETING_SLIDES } from "@/lib/marketing-slides";
import { MarketingHeader } from "./marketing-header";
import styles from "./marketing.module.css";

const PAGE_SELECTOR = "[data-page-item]";
const PAGE_HASHES = MARKETING_SLIDES.map((slide) => slide.hash);
const PAGE_LABELS = MARKETING_SLIDES.map((slide) => slide.label);
const LAST_PAGE = PAGE_HASHES.length - 1;
const MOBILE_QUERY = "(max-width: 720px)";

function insideOpenDialog(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("dialog[open]"));
}

function setMetaContent(selector: string, content: string) {
  document.querySelectorAll<HTMLMetaElement>(selector).forEach((element) => {
    element.content = content;
  });
}

function syncShareMetadata(page: number) {
  const slide = MARKETING_SLIDES[page];
  const pageUrl = new URL(window.location.href);
  if (page === 0) pageUrl.searchParams.delete("slide");
  else pageUrl.searchParams.set("slide", slide.key);
  pageUrl.hash = slide.hash;
  window.history.replaceState(null, "", `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`);

  const canonicalUrl = new URL(pageUrl.pathname, pageUrl.origin);
  if (page > 0) canonicalUrl.searchParams.set("slide", slide.key);
  const previewImage = new URL("/api/og", pageUrl.origin);
  previewImage.searchParams.set("slide", slide.key);
  const title = page === 0 ? "Homeboard — Pick your next home on vibes" : `${slide.title} · Homeboard`;

  document.title = title;
  document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]').forEach((element) => {
    element.href = canonicalUrl.toString();
  });
  setMetaContent('meta[name="description"]', slide.description);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', slide.description);
  setMetaContent('meta[property="og:url"]', canonicalUrl.toString());
  setMetaContent('meta[property="og:image"]', previewImage.toString());
  setMetaContent('meta[property="og:image:alt"]', `Homeboard: ${slide.title}`);
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', slide.description);
  setMetaContent('meta[name="twitter:image"]', previewImage.toString());
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
    syncShareMetadata(nextPage);
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

    const clearDesktopPageProgress = (item: HTMLElement) => {
      item.style.removeProperty("--marketing-page-opacity");
      item.style.removeProperty("--marketing-page-blur");
      item.style.removeProperty("--marketing-page-shift");
      item.style.removeProperty("--marketing-page-scale");
    };

    const updateDesktopPageProgress = (items = pageItems()) => {
      const viewportTop = root.scrollTop;
      const viewportBottom = viewportTop + root.clientHeight;

      items.forEach((item) => {
        const itemTop = item.offsetTop;
        const itemHeight = Math.max(1, item.offsetHeight);
        const visiblePixels = Math.max(
          0,
          Math.min(viewportBottom, itemTop + itemHeight) - Math.max(viewportTop, itemTop),
        );
        const progress = Math.max(0, Math.min(1, visiblePixels / itemHeight));
        const hiddenProgress = 1 - progress;

        item.style.setProperty("--marketing-page-opacity", progress.toFixed(4));
        item.style.setProperty("--marketing-page-blur", `${(hiddenProgress * 7).toFixed(2)}px`);
        item.style.setProperty("--marketing-page-shift", `${(hiddenProgress * 68).toFixed(2)}px`);
        item.style.setProperty("--marketing-page-scale", (0.985 + progress * 0.015).toFixed(4));
      });
    };

    const configure = () => {
      updateViewportHeight();
      mobileRef.current = mediaQuery.matches;
      const querySlide = new URLSearchParams(window.location.search).get("slide");
      const queryPage = querySlide ? getMarketingSlideIndex(querySlide) : -1;
      const hashIndex = PAGE_HASHES.indexOf(window.location.hash as (typeof PAGE_HASHES)[number]);
      const hashPage = queryPage >= 0 ? queryPage : hashIndex >= 0 ? hashIndex : activePageRef.current;
      activePageRef.current = hashPage;
      setActivePage(hashPage);
      root.dataset.page = String(hashPage);
      syncShareMetadata(hashPage);

      if (mobileRef.current) {
        delete root.dataset.revealReady;
        root.scrollTop = 0;
        pageItems().forEach(clearDesktopPageProgress);
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
        root.dataset.revealReady = "true";
        requestAnimationFrame(() => {
          root.scrollTo({ top: items[hashPage]?.offsetTop ?? 0, behavior: "auto" });
          updateDesktopPageProgress(items);
        });
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

    const onDesktopScroll = () => {
      if (mobileRef.current || scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        const items = pageItems();
        updateDesktopPageProgress(items);
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
      const hashPage = PAGE_HASHES.indexOf(window.location.hash as (typeof PAGE_HASHES)[number]);
      if (hashPage >= 0) goToPage(hashPage);
    };

    const onResize = () => {
      updateViewportHeight();
      if (!mobileRef.current) updateDesktopPageProgress();
    };

    configure();
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", onTouchCancel, { passive: true });
    root.addEventListener("scroll", onDesktopScroll, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    mediaQuery.addEventListener("change", configure);

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchCancel);
      root.removeEventListener("scroll", onDesktopScroll);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      mediaQuery.removeEventListener("change", configure);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
    };
  }, [goToPage, pageItems, positionPages, publishPage, updateViewportHeight]);

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
