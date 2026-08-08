var HomeboardSharePreprocessor = function() {};

HomeboardSharePreprocessor.prototype = {
  run: function(extensionArguments) {
    const clean = (value) => {
      if (typeof value !== "string") return null;
      const result = value.replace(/\s+/g, " ").trim();
      return result || null;
    };
    const number = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value !== "string") return null;
      const raw = value.replace(/[^0-9.]/g, "");
      if (!raw) return null;
      const result = Number(raw);
      return Number.isFinite(result) ? result : null;
    };
    const coordinateNumber = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value !== "string") return null;
      const result = Number(value.trim());
      return Number.isFinite(result) ? result : null;
    };
    const first = (...values) => values.find((value) => value !== null && value !== undefined && value !== "");
    const meta = (selector) => clean(document.querySelector(selector)?.content);
    const recommendationPattern =
      /similar homes|similar listings|similar results|recommended|you may also like|homes you may like|nearby homes|nearby rentals|other rentals|other available homes|more homes|homes for you/i;
    const recommendationRoots = new Set(document.querySelectorAll(
      '[data-testid*="recommend" i],[data-testid*="similar" i],'
      + '[data-testid*="nearby" i],[aria-label*="recommend" i],'
      + '[aria-label*="similar" i],[aria-label*="nearby" i]'
    ));
    for (const heading of document.querySelectorAll('h2,h3,h4,[role="heading"]')) {
      const headingText = clean(heading.innerText || heading.textContent);
      if (!headingText || !recommendationPattern.test(headingText)) continue;
      const semanticRoot = heading.closest('section,aside,[role="region"]');
      const fallbackRoot = heading.parentElement?.children.length <= 16
        ? heading.parentElement
        : null;
      const root = semanticRoot || fallbackRoot;
      if (root) recommendationRoots.add(root);
    }
    const isRecommendation = (node) => {
      for (const root of recommendationRoots) {
        if (root === node || root.contains(node)) return true;
      }
      return false;
    };
    const isListingCard = (node) => Boolean(node.closest(
      '[data-testid*="property-card" i],[data-testid*="listing-card" i],'
      + '[class*="property-card" i],[class*="listing-card" i],'
      + '[class*="recommend" i],[class*="similar" i]'
    ));
    const installScanOverlay = () => {
      const existing = document.querySelector("#homeboard-scan-tag");
      if (existing) existing.remove();
      document.querySelectorAll(".homeboard-evidence-highlight").forEach((node) => {
        node.classList.remove("homeboard-evidence-highlight");
        node.removeAttribute("data-homeboard-evidence");
      });

      let style = document.querySelector("#homeboard-scan-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "homeboard-scan-style";
        style.textContent = `
          .homeboard-evidence-highlight {
            outline: 2px solid rgba(61, 80, 74, 0.90) !important;
            outline-offset: 3px !important;
            border-radius: 5px !important;
            background-color: rgba(249, 226, 205, 0.40) !important;
            box-shadow: 0 0 0 5px rgba(61, 80, 74, 0.12), 0 0 22px rgba(249, 226, 205, 0.24) !important;
            transition: outline-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease !important;
          }
          #homeboard-scan-tag {
            position: fixed !important;
            top: max(14px, env(safe-area-inset-top)) !important;
            right: 14px !important;
            z-index: 2147483647 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            min-height: 36px !important;
            padding: 8px 12px !important;
            border: 1px solid rgba(249, 226, 205, 0.50) !important;
            border-radius: 999px !important;
            background: rgba(61, 80, 74, 0.96) !important;
            box-shadow: 0 10px 30px rgba(36, 49, 41, 0.28), 0 0 24px rgba(249, 226, 205, 0.18) !important;
            color: #FFF3E5 !important;
            font: 700 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif !important;
            letter-spacing: 0 !important;
            pointer-events: none !important;
            -webkit-backdrop-filter: blur(16px) !important;
            backdrop-filter: blur(16px) !important;
          }
          #homeboard-scan-tag::before {
            content: "" !important;
            width: 8px !important;
            height: 8px !important;
            border-radius: 50% !important;
            background: #F9E2CD !important;
            box-shadow: 0 0 0 4px rgba(249, 226, 205, 0.14), 0 0 14px rgba(249, 226, 205, 0.68) !important;
            animation: homeboard-scan-pulse 1.2s ease-in-out infinite alternate !important;
          }
          #homeboard-scan-tag span {
            color: rgba(231, 218, 206, 0.82) !important;
            font-weight: 600 !important;
          }
          @keyframes homeboard-scan-pulse {
            from { opacity: 0.55; transform: scale(0.86); }
            to { opacity: 1; transform: scale(1); }
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      }

      const candidates = [];
      const found = new Set();
      const add = (node, label) => {
        if (
          !node
          || found.has(node)
          || isRecommendation(node)
          || isListingCard(node)
        ) return;
        const rect = node.getBoundingClientRect();
        const text = clean(node.innerText || node.textContent || node.getAttribute("aria-label"));
        if (!text || text.length > 360 || rect.width < 2 || rect.height < 2) return;
        found.add(node);
        candidates.push({ node, label });
      };

      document.querySelectorAll(
        'h1,address,[itemprop="streetAddress"],[itemprop="address"],'
        + '[data-testid*="address" i],[aria-label*="address" i]'
      ).forEach((node) => add(node, "address"));
      document.querySelectorAll(
        '[data-testid="price"],[data-testid*="monthly-rent" i],'
        + '[data-testid*="base-rent" i],[data-testid*="bed-bath" i],'
        + '[data-testid*="bedroom" i],[data-testid*="bathroom" i],'
        + '[itemprop="price"],[itemprop="numberOfBedrooms"],'
        + '[itemprop="numberOfBathroomsTotal"],[itemprop="numberOfBathrooms"],'
        + '[aria-label*="monthly rent" i],[aria-label*="base rent" i],'
        + '[aria-label*="bedroom" i],[aria-label*="bathroom" i]'
      ).forEach((node) => add(node, "listing fact"));
      for (const node of document.querySelectorAll('p,li,dt,dd,span,div')) {
        const text = clean(node.innerText || node.textContent);
        if (
          text
          && text.length <= 180
          && /(?:\$\s*[1-9][\d,]{2,}|(?:\d+(?:\.\d+)?)\s*(?:bd|ba|beds?|baths?|bedrooms?|bathrooms?))/i.test(text)
        ) {
          add(node, "listing fact");
        }
        if (candidates.length >= 10) break;
      }

      const highlightedCandidates = candidates.slice(0, 10);
      highlightedCandidates.forEach(({ node, label }) => {
        node.classList.add("homeboard-evidence-highlight");
        node.setAttribute("data-homeboard-evidence", label);
      });

      const tag = document.createElement("div");
      tag.id = "homeboard-scan-tag";
      tag.setAttribute("role", "status");
      tag.setAttribute("aria-label", "Homeboard is reading highlighted listing details");
      tag.innerHTML = 'Homeboard <span>reading this listing</span>';
      (document.body || document.documentElement).appendChild(tag);

      const cleanup = () => {
        document.querySelector("#homeboard-scan-tag")?.remove();
        document.querySelectorAll(".homeboard-evidence-highlight").forEach((node) => {
          node.classList.remove("homeboard-evidence-highlight");
          node.removeAttribute("data-homeboard-evidence");
        });
      };
      window.__homeboardCleanupScanOverlay = cleanup;
      window.setTimeout(cleanup, 20_000);
      return highlightedCandidates.length;
    };
    const primaryTextValues = () => {
      const result = [];
      const found = new Set();
      for (const node of document.querySelectorAll(
        'h1,h2,h3,h4,p,li,dt,dd,span,[aria-label],[data-testid]'
      )) {
        if (isRecommendation(node) || isListingCard(node)) continue;
        const value = clean(node.innerText || node.textContent || node.getAttribute("aria-label"));
        if (
          !value
          || value.length > 600
          || recommendationPattern.test(value)
          || found.has(value.toLowerCase())
        ) continue;
        found.add(value.toLowerCase());
        result.push(value);
        if (result.length >= 700) break;
      }
      return result;
    };
    const textValues = primaryTextValues();
    const text = textValues.join("\n").slice(0, 60_000);

    const roots = [];
    document.querySelectorAll(
      'script[type="application/ld+json"], script[type="application/json"], script#__NEXT_DATA__'
    ).forEach((script) => {
      const raw = script.textContent || "";
      if (!raw.trim() || raw.length > 8_000_000) return;
      try {
        const value = JSON.parse(raw);
        roots.push(...(Array.isArray(value) ? value : [value]));
      } catch {
        // Ignore malformed site data and continue with metadata and visible text.
      }
    });

    const nodes = [];
    const seen = new Set();
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 10 || seen.has(value) || nodes.length > 12_000) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      const type = Array.isArray(value["@type"])
        ? value["@type"].join(" ")
        : String(value["@type"] || "");
      if (/ItemList/i.test(type)) return;
      nodes.push(value);
      Object.values(value).forEach((item) => visit(item, depth + 1));
    };
    roots.forEach((root) => visit(root));

    const keys = (node, names) => {
      for (const name of names) {
        const value = node?.[name];
        if (value !== null && value !== undefined && value !== "") return value;
      }
      return null;
    };
    const score = (node) => {
      let value = 0;
      if (node?.zpid || node?.listingId || node?.propertyId) value += 5;
      if (node?.address || node?.streetAddress || node?.addressLine1) value += 4;
      if (node?.offers || node?.price || node?.rent || node?.minPrice) value += 3;
      if (keys(node, ["bedrooms", "beds", "numberOfBedrooms", "minBeds"]) != null) value += 2;
      if (keys(node, ["bathrooms", "baths", "numberOfBathrooms", "minBaths"]) != null) value += 2;
      const pagePath = location.pathname.replace(/\/+$/, "");
      const nodeURLs = [
        node?.url,
        node?.["@id"],
        typeof node?.mainEntityOfPage === "string"
          ? node.mainEntityOfPage
          : node?.mainEntityOfPage?.["@id"]
      ].filter((candidate) => typeof candidate === "string");
      if (nodeURLs.some((candidate) => {
        try {
          return new URL(candidate, location.href).pathname.replace(/\/+$/, "") === pagePath;
        } catch {
          return false;
        }
      })) value += 12;
      return value;
    };
    const node = nodes.sort((left, right) => score(right) - score(left))[0] || {};
    const best = (names) => keys(node, names);
    const coordinate = (() => {
      const containers = [
        node,
        node.geo,
        node.location,
        node.location?.geo,
        node.address?.geo
      ];
      for (const candidate of containers) {
        if (!candidate || typeof candidate !== "object") continue;
        const latitude = coordinateNumber(keys(candidate, ["latitude", "lat"]));
        const longitude = coordinateNumber(keys(candidate, ["longitude", "lng", "lon"]));
        if (
          latitude !== null
          && longitude !== null
          && latitude >= -90
          && latitude <= 90
          && longitude >= -180
          && longitude <= 180
          && (latitude !== 0 || longitude !== 0)
        ) {
          return { latitude, longitude };
        }
      }
      return null;
    })();

    const pageEvidence = () => {
      const headings = [...document.querySelectorAll("h1, h2, h3")]
        .filter((element) => !isRecommendation(element) && !isListingCard(element))
        .map((element) => clean(element.textContent))
        .filter(Boolean)
        .slice(0, 24);
      const relevantLines = textValues
        .filter((line) =>
          line
          && /(?:\$|unit|apt|studio|bed|bath|sq\.?\s*ft|floor plan|available|neighborhood|address)/i.test(line)
        )
        .slice(0, 60);
      const structured = nodes
        .filter((candidate) => {
          if (candidate === node) return true;
          return keys(
            candidate,
            ["unit", "unitNumber", "apartmentNumber", "unitCode", "apartmentSuite", "floorPlanName"]
          ) != null;
        })
        .map((candidate) => ({
          name: candidate.name,
          address: typeof candidate.address === "object"
            ? [
                candidate.address?.streetAddress,
                candidate.address?.addressLocality,
                candidate.address?.addressRegion,
                candidate.address?.postalCode
              ].filter(Boolean).join(", ")
            : candidate.address,
          unit: keys(candidate, ["unit", "unitNumber", "apartmentNumber", "unitCode", "apartmentSuite"]),
          price: keys(candidate, ["price", "rent", "monthlyRent", "minPrice", "lowPrice"]),
          bedrooms: keys(candidate, ["bedrooms", "beds", "bedCount", "minBeds", "numberOfBedrooms"]),
          bathrooms: keys(candidate, ["bathrooms", "baths", "bathCount", "minBaths", "numberOfBathrooms"]),
          squareFeet: keys(candidate, ["squareFeet", "livingArea", "floorSize"]),
          availableDate: keys(candidate, ["availableDate", "availabilityDate", "dateAvailable"])
        }))
        .filter((candidate) =>
          candidate.unit
          || candidate.price
          || candidate.bedrooms != null
          || candidate.bathrooms != null
        )
        .slice(0, 36);
      return [
        `TITLE: ${clean(document.title) || ""}`,
        `HEADINGS:\n${headings.join("\n")}`,
        `RELEVANT PAGE LINES:\n${relevantLines.join("\n")}`,
        `STRUCTURED FACT CANDIDATES:\n${structured.map((candidate) => JSON.stringify(candidate)).join("\n")}`
      ].join("\n\n").slice(0, 14_000);
    };

    const secondaryPageEvidence = () => {
      const values = [];
      const found = new Set();
      const add = (value) => {
        const cleaned = clean(value);
        if (
          !cleaned
          || cleaned.length > 1_200
          || recommendationPattern.test(cleaned)
          || found.has(cleaned.toLowerCase())
        ) return;
        found.add(cleaned.toLowerCase());
        values.push(cleaned);
      };
      const fieldPattern =
        /(?:\$|rent|price|address|street|unit|apt|studio|bed|bath|bd\b|ba\b|postal|zip|sq\.?\s*ft)/i;
      for (const element of document.querySelectorAll(
        'h1,h2,h3,h4,p,li,dt,dd,address,button,[aria-label],[title],'
        + '[data-testid],[itemprop],[class*="price" i],[class*="rent" i],'
        + '[class*="address" i],[class*="bed" i],[class*="bath" i]'
      )) {
        if (isRecommendation(element) || isListingCard(element)) continue;
        const candidates = [
          element.innerText,
          element.textContent,
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.getAttribute("content"),
          element.getAttribute("data-testid")
        ];
        for (const candidate of candidates) {
          if (fieldPattern.test(candidate || "")) add(candidate);
        }
        if (values.length >= 260) break;
      }
      return [
        `TITLE: ${clean(document.title) || ""}`,
        `DESCRIPTION: ${first(
          meta('meta[property="og:description"]'),
          meta('meta[name="description"]')
        ) || ""}`,
        `FIELD-SPECIFIC SECOND PASS:\n${values.join("\n")}`,
        `PRIMARY PAGE TEXT:\n${textValues.join("\n")}`
      ].join("\n\n").slice(0, 22_000);
    };

    const installSharePageScanHandoff = () => {
      const collectSentenceRanges = () => {
        const foundTextNodes = new Set();
        const ranges = [];
        const selectors = [
          "main h1", "main h2", "main h3", "main p", "main li", "main dt", "main dd",
          "article h1", "article h2", "article h3", "article p", "article li",
          '[role="main"] h1', '[role="main"] h2', '[role="main"] h3',
          '[role="main"] p', '[role="main"] li'
        ];
        let containers = [...document.querySelectorAll(selectors.join(","))];
        if (containers.length === 0) {
          containers = [...document.querySelectorAll("h1,h2,h3,p,li,dt,dd")];
        }
        for (const container of containers) {
          if (
            container.closest(
              "#homeboard-share-page-scan,nav,footer,script,style,noscript,"
              + "form,input,textarea,select,option,[hidden],[aria-hidden=\"true\"]"
            )
            || isRecommendation(container)
            || isListingCard(container)
          ) continue;
          const style = getComputedStyle(container);
          if (
            style.display === "none"
            || style.visibility === "hidden"
            || Number(style.opacity) === 0
          ) continue;
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          let textNode = walker.nextNode();
          while (textNode) {
            if (!foundTextNodes.has(textNode)) {
              foundTextNodes.add(textNode);
              const rawText = textNode.nodeValue || "";
              const pattern = /[^.!?]+(?:[.!?]+(?=\s|$)|$)/g;
              for (const match of rawText.matchAll(pattern)) {
                const rawSentence = match[0] || "";
                const leading = rawSentence.length - rawSentence.trimStart().length;
                const sentence = rawSentence.trim();
                if (
                  sentence.length < 4
                  || sentence.length > 320
                  || recommendationPattern.test(sentence)
                ) continue;
                const start = (match.index || 0) + leading;
                const range = document.createRange();
                range.setStart(textNode, start);
                range.setEnd(textNode, start + sentence.length);
                if (range.getClientRects().length > 0) ranges.push(range);
                if (ranges.length >= 56) return ranges;
              }
            }
            textNode = walker.nextNode();
          }
        }
        return ranges;
      };

      const makeUI = () => {
        document.querySelector("#homeboard-share-page-scan")?.remove();
        const host = document.createElement("div");
        host.id = "homeboard-share-page-scan";
        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = `
          <style>
            :host {
              position: fixed;
              inset: 0;
              z-index: 2147483647;
              pointer-events: none;
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
              color: #FFF3E5;
            }
            * { box-sizing: border-box; }
            #lines { position: fixed; inset: 0; pointer-events: none; }
            .line {
              position: fixed;
              border-bottom: 2px solid rgba(61, 80, 74, 0.96);
              border-radius: 3px;
              background: rgba(249, 226, 205, 0.52);
              box-shadow:
                0 0 0 2px rgba(61, 80, 74, 0.18),
                0 0 16px rgba(249, 226, 205, 0.24);
            }
            #tag {
              position: fixed;
              top: max(12px, env(safe-area-inset-top));
              right: 12px;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              min-height: 38px;
              max-width: calc(100vw - 24px);
              padding: 9px 13px;
              border: 1px solid rgba(249, 226, 205, 0.50);
              border-radius: 999px;
              background: rgba(61, 80, 74, 0.96);
              box-shadow:
                0 10px 30px rgba(36, 49, 41, 0.28),
                0 0 22px rgba(249, 226, 205, 0.18);
              -webkit-backdrop-filter: blur(18px);
              backdrop-filter: blur(18px);
              font-size: 12px;
              line-height: 1;
            }
            #dot {
              width: 8px;
              height: 8px;
              flex: 0 0 auto;
              border-radius: 50%;
              background: #F9E2CD;
              box-shadow:
                0 0 0 4px rgba(249, 226, 205, 0.14),
                0 0 14px rgba(249, 226, 205, 0.64);
              animation: pulse 700ms ease-in-out infinite alternate;
            }
            #brand { font-weight: 800; }
            #phase {
              overflow: hidden;
              color: rgba(231, 218, 206, 0.84);
              font-weight: 600;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            #complete {
              position: fixed;
              right: 12px;
              bottom: max(12px, env(safe-area-inset-bottom));
              left: 12px;
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto auto;
              align-items: center;
              gap: 10px;
              max-width: 520px;
              margin: 0 auto;
              padding: 12px 12px 12px 15px;
              border: 1px solid rgba(146, 167, 158, 0.68);
              border-radius: 18px;
              background: rgba(61, 80, 74, 0.98);
              box-shadow: 0 18px 46px rgba(36, 49, 41, 0.36);
              -webkit-backdrop-filter: blur(20px);
              backdrop-filter: blur(20px);
              pointer-events: auto;
            }
            #copy { min-width: 0; }
            #title {
              display: block;
              font-size: 13px;
              font-weight: 800;
            }
            #summary {
              display: block;
              margin-top: 3px;
              overflow: hidden;
              color: rgba(231, 218, 206, 0.82);
              font-size: 11px;
              line-height: 1.25;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            button {
              border: 0;
              font: inherit;
              -webkit-tap-highlight-color: transparent;
            }
            #review {
              min-height: 38px;
              padding: 0 14px;
              border-radius: 12px;
              background: linear-gradient(135deg, #F9E2CD, #E4CDB5);
              color: #243129;
              font-size: 12px;
              font-weight: 800;
            }
            #close {
              display: grid;
              place-items: center;
              width: 34px;
              height: 34px;
              border-radius: 50%;
              background: rgba(49, 68, 62, 0.82);
              color: rgba(231, 218, 206, 0.92);
              font-size: 19px;
            }
            .hidden { display: none !important; }
            @keyframes pulse {
              from { opacity: 0.55; transform: scale(0.86); }
              to { opacity: 1; transform: scale(1); }
            }
            @media (max-width: 390px) {
              #complete { grid-template-columns: minmax(0, 1fr) auto; }
              #close { display: none; }
            }
            @media (prefers-reduced-motion: reduce) {
              #dot { animation: none; }
            }
          </style>
          <div id="lines"></div>
          <div id="tag" role="status">
            <span id="dot"></span>
            <span id="brand">Homeboard</span>
            <span id="phase">Following the listing</span>
          </div>
          <section class="hidden" id="complete">
            <div id="copy">
              <span id="title">Scan complete</span>
              <span id="summary">Review the listing details.</span>
            </div>
            <button id="review" type="button">Review details</button>
            <button id="close" type="button" aria-label="Dismiss Homeboard">×</button>
          </section>
        `;
        (document.body || document.documentElement).appendChild(host);
        const byID = (id) => shadow.querySelector(`#${id}`);
        byID("close").addEventListener("click", () => host.remove());
        return {
          host,
          lines: byID("lines"),
          tag: byID("tag"),
          phase: byID("phase"),
          complete: byID("complete"),
          title: byID("title"),
          summary: byID("summary"),
          review: byID("review")
        };
      };

      const delay = (milliseconds) => new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds);
      });
      const drawRange = (ui, range) => {
        ui.lines.replaceChildren();
        for (const rect of range.getClientRects()) {
          if (rect.width < 2 || rect.height < 2) continue;
          const line = document.createElement("div");
          line.className = "line";
          line.style.left = `${Math.max(rect.left - 2, 0)}px`;
          line.style.top = `${Math.max(rect.top - 1, 0)}px`;
          line.style.width = `${Math.min(rect.width + 4, window.innerWidth)}px`;
          line.style.height = `${rect.height + 2}px`;
          ui.lines.appendChild(line);
        }
      };
      const followRange = async (range) => {
        const rect = range.getBoundingClientRect();
        const targetY = Math.round(window.innerHeight * 0.38);
        const outsideFollowBand =
          rect.top < window.innerHeight * 0.28
          || rect.top > window.innerHeight * 0.52;
        if (!outsideFollowBand) return;
        window.scrollTo({
          top: Math.max(window.scrollY + rect.top - targetY, 0),
          behavior: "smooth"
        });
        await delay(150);
      };
      const animate = async (ui, ranges, label, speed = 100) => {
        for (const [index, range] of ranges.entries()) {
          if (!ui.host.isConnected) return;
          const element = range.commonAncestorContainer.parentElement;
          if (!element?.isConnected) continue;
          await followRange(range);
          drawRange(ui, range);
          ui.phase.textContent = `${label} ${index + 1} of ${ranges.length}`;
          await delay(speed);
        }
      };
      const missingPattern = (missingFields) => {
        const fragments = [];
        if (missingFields.includes("address")) {
          fragments.push("address", "street", "postal", "zip", "\\d{1,6}\\s+[A-Za-z]");
        }
        if (missingFields.includes("monthly rent")) {
          fragments.push("\\$", "rent", "price", "month");
        }
        if (missingFields.includes("bedrooms")) {
          fragments.push("\\bbd\\b", "\\bbed", "bedroom");
        }
        if (missingFields.includes("bathrooms")) {
          fragments.push("\\bba\\b", "\\bbath", "bathroom");
        }
        return fragments.length > 0
          ? new RegExp(fragments.join("|"), "i")
          : null;
      };

      const startPageScan = async (payload = {}) => {
        if (typeof window.__homeboardCleanupScanOverlay === "function") {
          window.__homeboardCleanupScanOverlay();
        }
        const ui = makeUI();
        const ranges = collectSentenceRanges();
        const preventTouchScroll = (event) => event.preventDefault();
        document.addEventListener("touchmove", preventTouchScroll, {
          capture: true,
          passive: false
        });
        try {
          const speed = Math.max(80, Math.min(150, Math.round(4_000 / Math.max(ranges.length, 1))));
          await animate(ui, ranges, "Following", speed);
          if (payload.rescanPerformed) {
            const initialMissing = Array.isArray(payload.initialMissingFields)
              ? payload.initialMissingFields
              : [];
            const pattern = missingPattern(initialMissing);
            let quickRanges = pattern
              ? ranges.filter((range) => pattern.test(range.toString()))
              : [];
            if (quickRanges.length === 0) quickRanges = ranges.slice(0, 8);
            quickRanges = quickRanges.slice(0, 10);
            ui.phase.textContent = "Taking one quick second look";
            await delay(240);
            await animate(ui, quickRanges, "Second scan", 85);
          }
        } finally {
          document.removeEventListener("touchmove", preventTouchScroll, {
            capture: true
          });
        }
        if (!ui.host.isConnected) return;
        ui.lines.replaceChildren();
        ui.tag.classList.add("hidden");
        const missing = Array.isArray(payload.missingFields)
          ? payload.missingFields
          : [];
        ui.title.textContent = missing.length > 0
          ? "A few details still need you"
          : "Scan complete";
        ui.summary.textContent = missing.length > 0
          ? `Still missing: ${missing.join(", ")}.`
          : (payload.summary || "Review the listing details.");
        ui.review.addEventListener("click", () => {
          const reviewURL = typeof payload.reviewURL === "string"
            && payload.reviewURL.startsWith("homeboard://")
            ? payload.reviewURL
            : "homeboard://import";
          window.location.href = reviewURL;
        });
        ui.complete.classList.remove("hidden");
      };
      this.startPageScan = startPageScan;
      window.__homeboardStartSharePageScan = startPageScan;
    };

    installSharePageScanHandoff();

    const unitOptions = () => {
      const result = [];
      const found = new Set();
      for (const candidate of nodes) {
        const unit = clean(keys(
          candidate,
          ["unit", "unitNumber", "apartmentNumber", "unitCode", "apartmentSuite", "floorPlanName"]
        ));
        const label = unit;
        const price = number(keys(candidate, ["price", "rent", "monthlyRent", "minPrice", "lowPrice"]));
        const bedrooms = number(keys(
          candidate,
          ["bedrooms", "beds", "bedCount", "minBeds", "numberOfBedrooms"]
        ));
        const bathrooms = number(keys(
          candidate,
          ["bathrooms", "baths", "bathCount", "minBaths", "numberOfBathrooms"]
        ));
        const squareFeet = number(keys(candidate, ["squareFeet", "livingArea", "floorSize"]));
        const factCount = [price, bedrooms, bathrooms, squareFeet]
          .filter((value) => value !== null).length;
        if (!unit || !label || factCount < 2) continue;
        const key = `${label}|${price}|${bedrooms}|${bathrooms}`.toLowerCase();
        if (found.has(key)) continue;
        found.add(key);
        result.push({
          id: unit || key,
          label,
          unit: unit?.toUpperCase() || null,
          price,
          bedrooms,
          bathrooms,
          squareFeet,
          availableDate: clean(keys(
            candidate,
            ["availableDate", "availabilityDate", "dateAvailable"]
          ))
        });
        if (result.length >= 12) break;
      }
      return result;
    };

    const addressObject = typeof node.address === "object" ? node.address : null;
    const composedAddress = addressObject
      ? clean([
          addressObject.streetAddress,
          addressObject.addressLocality,
          [addressObject.addressRegion, addressObject.postalCode]
            .filter(Boolean)
            .join(" ")
        ].filter(Boolean).join(", "))
      : null;
    const addressMatch = `${document.title} ${text.slice(0, 12_000)}`.match(
      /\b(\d{1,6}\s+[A-Za-z0-9.' -]+?\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Parkway|Pkwy|Terrace|Ter)(?:\s*(?:#|Apt|Apartment|Unit)\s*[A-Za-z0-9-]+)?(?:,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5})?)/i
    );
    const baseAddress = first(
      composedAddress,
      clean(typeof node.address === "string" ? node.address : null),
      clean(best(["streetAddress", "addressLine1", "formattedAddress"])),
      clean(addressMatch?.[1])
    );
    const city = clean(first(
      addressObject?.addressLocality,
      best(["city", "cityName", "addressLocality"])
    ));
    const region = clean(first(
      addressObject?.addressRegion,
      best(["state", "stateCode", "addressRegion"])
    ));
    const postalCode = clean(first(
      addressObject?.postalCode,
      best(["zip", "zipcode", "postalCode"])
    ));
    const composeAddress = () => {
      let result = clean(baseAddress);
      if (!result) return null;
      const contains = (component) => {
        const value = clean(component);
        const normalizedResult = ` ${result.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
        const normalizedValue = value?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        return normalizedValue && normalizedResult.includes(` ${normalizedValue} `);
      };
      if (city && !contains(city)) result += `, ${city}`;
      const missingRegion = region && !contains(region) ? region : null;
      const missingPostalCode = postalCode && !contains(postalCode) ? postalCode : null;
      if (missingRegion && missingPostalCode) {
        result += `, ${missingRegion} ${missingPostalCode}`;
      } else if (missingRegion) {
        result += `, ${missingRegion}`;
      } else if (missingPostalCode) {
        result += ` ${missingPostalCode}`;
      }
      return clean(result);
    };
    const address = composeAddress();
    const unitMatch = `${address || ""} ${document.title}`.match(
      /(?:\b(?:apt|apartment|unit)\s*|#\s*)([A-Za-z0-9-]{1,16})\b/i
    );
    const priceMatch = text.match(
      /\$\s*((?:[1-9][0-9]{0,2}(?:,[0-9]{3})+)|(?:[1-9][0-9]{2,5}))(?:\.\d{2})?/
    );
    const bedMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:bd|bed|beds|bedroom|bedrooms)\b/i);
    const bathMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:ba|bath|baths|bathroom|bathrooms)\b/i);
    const isBuildingPage =
      /\/apartments?\//i.test(location.pathname)
      || /\b(?:floor plans|available units|units available)\b/i.test(text.slice(0, 12_000));
    const highlightedEvidenceCount = 0;
    const extractedUnit = clean(first(
      keys(node, ["unit", "unitNumber", "apartmentNumber", "unitCode", "apartmentSuite"]),
      unitMatch?.[1]
    ));

    const propertyListValue = (value) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === "string" || typeof value === "boolean") return value;
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
      }
      if (Array.isArray(value)) {
        return value
          .map((item) => propertyListValue(item))
          .filter((item) => item !== undefined);
      }
      if (typeof value === "object") {
        const result = {};
        for (const [key, item] of Object.entries(value)) {
          const safeItem = propertyListValue(item);
          if (safeItem !== undefined) result[key] = safeItem;
        }
        return result;
      }
      return undefined;
    };

    const result = propertyListValue({
      url: location.href,
      canonicalURL: document.querySelector('link[rel="canonical"]')?.href || location.href,
      pageTitle: first(meta('meta[property="og:title"]'), clean(document.title)),
      safariPageCapture: true,
      highlightedEvidenceCount,
      address,
      unit: isBuildingPage ? null : extractedUnit,
      city,
      region,
      postalCode,
      latitude: coordinate?.latitude,
      longitude: coordinate?.longitude,
      neighborhood: clean(best(["neighborhood", "neighborhoodName", "community"])),
      price: first(
        number(best(["price", "rent", "monthlyRent", "minPrice", "lowPrice"])),
        number(meta('meta[property="product:price:amount"]')),
        number(priceMatch?.[1])
      ),
      bedrooms: first(
        number(best(["bedrooms", "beds", "bedCount", "minBeds", "numberOfBedrooms"])),
        /\bstudio\b/i.test(text) ? 0 : number(bedMatch?.[1])
      ),
      bathrooms: first(
        number(best(["bathrooms", "baths", "bathCount", "minBaths", "numberOfBathrooms"])),
        number(bathMatch?.[1])
      ),
      imageURL: first(meta('meta[property="og:image"]'), meta('meta[name="twitter:image"]')),
      summary: first(meta('meta[property="og:description"]'), meta('meta[name="description"]')),
      listingScope: isBuildingPage ? "building" : "unit",
      pageEvidence: pageEvidence(),
      secondaryPageEvidence: secondaryPageEvidence(),
      unitOptions: isBuildingPage ? unitOptions() : []
    });
    extensionArguments.completionFunction(result);
  }
};

var HomeboardRunFinalizedPageScan = function(payload) {
  if (!payload?.startPageScan) return;
  if (typeof window.__homeboardCleanupScanOverlay === "function") {
    window.__homeboardCleanupScanOverlay();
  }

  const recommendationPattern =
    /similar homes|similar listings|recommended|you may also like|nearby homes|nearby rentals|other rentals|more homes|homes for you/i;
  const isExcluded = (element) => {
    if (!element) return true;
    if (element.closest(
      'nav,footer,aside,form,[role="navigation"],'
      + '[data-testid*="recommend" i],[data-testid*="similar" i],'
      + '[data-testid*="nearby" i],[data-testid*="property-card" i],'
      + '[data-testid*="listing-card" i],[aria-label*="recommend" i],'
      + '[aria-label*="similar" i],[aria-label*="nearby" i],'
      + '[class*="property-card" i],[class*="listing-card" i],'
      + '[class*="recommend" i],[class*="similar" i]'
    )) return true;
    const section = element.closest('section,[role="region"]');
    if (!section) return false;
    const heading = section.querySelector('h1,h2,h3,h4,[role="heading"]');
    return recommendationPattern.test(heading?.textContent || "");
  };
  const collectSentenceRanges = () => {
    const selectors = [
      "main h1", "main h2", "main h3", "main p", "main li", "main dt", "main dd",
      "article h1", "article h2", "article h3", "article p", "article li",
      '[role="main"] h1', '[role="main"] h2', '[role="main"] h3',
      '[role="main"] p', '[role="main"] li'
    ];
    let containers = [...document.querySelectorAll(selectors.join(","))];
    if (containers.length === 0) {
      containers = [...document.querySelectorAll("h1,h2,h3,p,li,dt,dd")];
    }
    const ranges = [];
    const seen = new Set();
    for (const container of containers) {
      if (isExcluded(container)) continue;
      const style = window.getComputedStyle(container);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) {
        const raw = textNode.nodeValue || "";
        for (const match of raw.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)) {
          const leading = match[0].search(/\S/);
          const trimmed = match[0].trim();
          if (leading < 0 || trimmed.length < 3) continue;
          const key = trimmed.toLowerCase();
          if (seen.has(key) || recommendationPattern.test(trimmed)) continue;
          const start = (match.index || 0) + leading;
          const end = Math.min(start + trimmed.length, raw.length);
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, end);
          if (range.getBoundingClientRect().width < 2) continue;
          seen.add(key);
          ranges.push(range);
          if (ranges.length >= 56) return ranges;
        }
      }
    }
    return ranges;
  };

  const host = document.createElement("div");
  host.id = "homeboard-share-page-scan";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      #lines { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none; }
      .line {
        position: fixed;
        border-radius: 4px;
        background: rgba(249, 226, 205, .52);
        box-shadow: 0 0 0 1px rgba(61, 80, 74, .68);
        transition: left 80ms ease, top 80ms ease, width 80ms ease, height 80ms ease;
      }
      #tag {
        position: fixed;
        top: max(12px, env(safe-area-inset-top));
        left: 50%;
        z-index: 2147483647;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: calc(100vw - 28px);
        padding: 10px 14px;
        border: 1px solid rgba(249, 226, 205, .48);
        border-radius: 999px;
        background: rgba(61, 80, 74, .96);
        box-shadow: 0 10px 30px rgba(36, 49, 41, .28);
        color: #FFF3E5;
        font: 750 12px/1 -apple-system, BlinkMacSystemFont, sans-serif;
        white-space: nowrap;
        pointer-events: none;
      }
      #dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #F9E2CD;
        box-shadow: 0 0 0 4px rgba(249, 226, 205, .14), 0 0 14px #F9E2CD;
      }
      #phase { color: rgba(231, 218, 206, .82); }
      #complete {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: max(12px, env(safe-area-inset-bottom));
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border: 1px solid rgba(146, 167, 158, .66);
        border-radius: 18px;
        background: rgba(61, 80, 74, .98);
        box-shadow: 0 16px 40px rgba(36, 49, 41, .34);
        color: #FFF3E5;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #copy { min-width: 0; flex: 1; }
      #title { font-size: 13px; font-weight: 780; }
      #summary {
        overflow: hidden;
        margin-top: 4px;
        color: rgba(231, 218, 206, .82);
        font-size: 11px;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      button {
        min-height: 40px;
        border: 0;
        border-radius: 12px;
        padding: 0 14px;
        background: #F9E2CD;
        color: #243129;
        font: 780 12px/1 -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #close {
        width: 36px;
        min-height: 36px;
        padding: 0;
        border-radius: 50%;
        background: rgba(49, 68, 62, .82);
        color: rgba(231, 218, 206, .90);
        font-size: 18px;
      }
      .hidden { display: none !important; }
    </style>
    <div id="lines"></div>
    <div id="tag"><span id="dot"></span><strong>Homeboard</strong><span id="phase">Following the listing</span></div>
    <div id="complete" class="hidden">
      <div id="copy"><div id="title">Scan complete</div><div id="summary">Review the listing details.</div></div>
      <button id="review" type="button">Review details</button>
      <button id="close" type="button" aria-label="Close">×</button>
    </div>
  `;
  (document.body || document.documentElement).appendChild(host);
  const lines = shadow.querySelector("#lines");
  const tag = shadow.querySelector("#tag");
  const phase = shadow.querySelector("#phase");
  const complete = shadow.querySelector("#complete");
  const delay = (milliseconds) => new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
  const followRange = async (range) => {
    const rect = range.getBoundingClientRect();
    if (rect.top >= window.innerHeight * .28 && rect.top <= window.innerHeight * .52) return;
    window.scrollTo({
      top: Math.max(window.scrollY + rect.top - Math.round(window.innerHeight * .38), 0),
      behavior: "smooth"
    });
    await delay(150);
  };
  const drawRange = (range) => {
    lines.replaceChildren();
    for (const rect of range.getClientRects()) {
      if (rect.width < 2 || rect.height < 2) continue;
      const line = document.createElement("div");
      line.className = "line";
      line.style.left = `${Math.max(rect.left - 2, 0)}px`;
      line.style.top = `${Math.max(rect.top - 1, 0)}px`;
      line.style.width = `${Math.min(rect.width + 4, window.innerWidth)}px`;
      line.style.height = `${rect.height + 2}px`;
      lines.appendChild(line);
    }
  };
  const animate = async (ranges, label, speed) => {
    for (const [index, range] of ranges.entries()) {
      if (!host.isConnected) return;
      await followRange(range);
      drawRange(range);
      phase.textContent = `${label} ${index + 1} of ${ranges.length}`;
      await delay(speed);
    }
  };
  const missingPattern = (fields) => {
    const fragments = [];
    if (fields.includes("address")) fragments.push("address", "street", "postal", "zip", "\\d{1,6}\\s+[A-Za-z]");
    if (fields.includes("monthly rent")) fragments.push("\\$", "rent", "price", "month");
    if (fields.includes("bedrooms")) fragments.push("\\bbd\\b", "\\bbed", "bedroom");
    if (fields.includes("bathrooms")) fragments.push("\\bba\\b", "\\bbath", "bathroom");
    return fragments.length ? new RegExp(fragments.join("|"), "i") : null;
  };
  const preventTouchScroll = (event) => event.preventDefault();
  window.__homeboardCleanupScanOverlay = () => {
    document.removeEventListener("touchmove", preventTouchScroll, true);
    host.remove();
  };
  shadow.querySelector("#close").addEventListener("click", window.__homeboardCleanupScanOverlay);
  shadow.querySelector("#review").addEventListener("click", () => {
    const url = typeof payload.reviewURL === "string"
      && payload.reviewURL.startsWith("homeboard://")
      ? payload.reviewURL
      : "homeboard://import";
    window.location.href = url;
  });

  const run = async () => {
    const ranges = collectSentenceRanges();
    document.addEventListener("touchmove", preventTouchScroll, {
      capture: true,
      passive: false
    });
    try {
      const speed = Math.max(80, Math.min(150, Math.round(4_000 / Math.max(ranges.length, 1))));
      await animate(ranges, "Following", speed);
      if (payload.rescanPerformed) {
        const initialMissing = Array.isArray(payload.initialMissingFields)
          ? payload.initialMissingFields
          : [];
        const pattern = missingPattern(initialMissing);
        let quickRanges = pattern
          ? ranges.filter((range) => pattern.test(range.toString()))
          : [];
        if (quickRanges.length === 0) quickRanges = ranges.slice(0, 8);
        quickRanges = quickRanges.slice(0, 10);
        phase.textContent = "Taking one quick second look";
        await delay(240);
        await animate(quickRanges, "Second scan", 85);
      }
    } finally {
      document.removeEventListener("touchmove", preventTouchScroll, true);
    }
    if (!host.isConnected) return;
    lines.replaceChildren();
    tag.classList.add("hidden");
    const missing = Array.isArray(payload.missingFields) ? payload.missingFields : [];
    shadow.querySelector("#title").textContent = missing.length
      ? "A few details still need you"
      : "Scan complete";
    shadow.querySelector("#summary").textContent = missing.length
      ? `Still missing: ${missing.join(", ")}.`
      : (payload.summary || "Review the listing details.");
    complete.classList.remove("hidden");
  };
  run();
};

HomeboardSharePreprocessor.prototype.finalize = function(arguments) {
  if (typeof window.__homeboardCleanupScanOverlay === "function") {
    window.__homeboardCleanupScanOverlay();
  }
  if (arguments?.startPageScan) {
    HomeboardRunFinalizedPageScan(arguments);
  }
};

var ExtensionPreprocessingJS = new HomeboardSharePreprocessor();
