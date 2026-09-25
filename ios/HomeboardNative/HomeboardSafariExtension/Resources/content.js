(() => {
  if (window.__homeboardListingExtractorInstalled) return;
  window.__homeboardListingExtractorInstalled = true;
  const SAVE_CONFIRMATION_DELAY_MS = 900;

  const cleanText = (value) => {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/\s+/g, " ").trim();
    return cleaned || null;
  };

  const numeric = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const coordinateNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  };

  const first = (...values) => values.find((value) => value !== null && value !== undefined && value !== "");

  function canonicalURL() {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    if (canonical) {
      try {
        const target = new URL(canonical, location.href);
        if (target.origin === location.origin && target.pathname.replace(/\/+$/, '') === location.pathname.replace(/\/+$/, '')) return target.href;
      } catch { /* The visible page URL remains authoritative during navigation. */ }
    }
    return location.href;
  }

  function visibleListingAddress(roots = recommendationRoots()) {
    for (const element of document.querySelectorAll(
      '[data-testid="bdp-building-address"],[data-testid="home-details-summary-headline"],'
      + '[data-testid="address"],[itemprop="streetAddress"],address,h1,h2,main h1 + p'
    )) {
      if (isRecommendationElement(element, roots) || isListingCard(element) || element.closest('[hidden],[aria-hidden="true"]')) continue;
      if (!isPageElementVisible(element)) continue;
      const address = addressFromText(element.innerText || element.textContent || "");
      if (address) return address;
    }
    return null;
  }

  function isPageElementVisible(element) {
    for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  }

  function currentPageIdentity() {
    const roots = recommendationRoots();
    const heading = [...document.querySelectorAll('h1')].find((element) =>
      !isRecommendationElement(element, roots) && !isListingCard(element)
      && !element.closest('[hidden],[aria-hidden="true"]')
      && isPageElementVisible(element)
    );
    return JSON.stringify([
      location.href,
      buildingAddressKey(visibleListingAddress(roots)),
      cleanText(heading?.innerText || heading?.textContent)
    ]);
  }

  function isCaptureCurrent(capture) {
    return capture?.pageIdentity === currentPageIdentity();
  }

  function metaContent(selector) {
    return cleanText(document.querySelector(selector)?.content);
  }

  let structuredNodeContexts = new WeakMap();
  let structuredNodeParents = new WeakMap();

  function parseStructuredData() {
    structuredNodeContexts = new WeakMap();
    structuredNodeParents = new WeakMap();
    const roots = [];
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"], script[type="application/json"], script#__NEXT_DATA__'
    );
    for (const script of scripts) {
      const raw = script.textContent || "";
      if (!raw.trim() || raw.length > 8_000_000) continue;
      try {
        const parsed = JSON.parse(raw);
        roots.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      } catch {
        // One malformed block should not prevent other structured data from loading.
      }
    }

    const nodes = [];
    const seen = new Set();
    const visit = (value, depth = 0, context = "root", parent = null) => {
      if (
        !value
        || typeof value !== "object"
        || depth > 16
        || seen.has(value)
        || nodes.length > 24_000
      ) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1, context, parent));
        return;
      }
      const contextDescriptor = [
        context,
        value.name,
        value.headline,
        value.description
      ].filter((item) => typeof item === "string").join(" ");
      if (
        types(value).includes("itemlist")
        && !/\b(?:available|availability|units?|floor.?plans?)\b/i.test(contextDescriptor)
      ) return;
      structuredNodeContexts.set(value, context);
      if (parent) structuredNodeParents.set(value, parent);
      nodes.push(value);
      Object.entries(value).forEach(([key, item]) => {
        visit(item, depth + 1, `${context}.${key}`, value);
      });
    };
    roots.forEach((root) => visit(root));
    return nodes;
  }

  function types(node) {
    const value = node?.["@type"];
    return (Array.isArray(value) ? value : [value])
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.toLowerCase());
  }

  const recommendationPattern =
    /similar homes|similar listings|similar results|recommended|you may also like|homes you may like|nearby homes|nearby rentals|other rentals|other available homes|more homes|homes for you/i;

  function recommendationRoots() {
    const roots = new Set(document.querySelectorAll(
      '[data-testid*="recommend" i],[data-testid*="similar" i],'
      + '[data-testid*="nearby" i],[aria-label*="recommend" i],'
      + '[aria-label*="similar" i],[aria-label*="nearby" i]'
    ));
    for (const heading of document.querySelectorAll('h2,h3,h4,[role="heading"]')) {
      const headingText = cleanText(heading.innerText || heading.textContent);
      if (!headingText || !recommendationPattern.test(headingText)) continue;
      const semanticRoot = heading.closest('section,aside,[role="region"]');
      const fallbackRoot = heading.parentElement?.children.length <= 16
        ? heading.parentElement
        : null;
      const root = semanticRoot || fallbackRoot;
      if (root) roots.add(root);
    }
    return roots;
  }

  function isRecommendationElement(node, roots) {
    for (const root of roots) {
      if (root === node || root.contains(node)) return true;
    }
    return false;
  }

  function isListingCard(node) {
    return Boolean(node.closest(
      '[data-testid*="property-card" i],[data-testid*="listing-card" i],'
      + '[class*="property-card" i],[class*="listing-card" i],'
      + '[class*="recommend" i],[class*="similar" i]'
    ));
  }

  function structuredURLMatchesPage(node) {
    const candidates = [
      node?.url,
      node?.["@id"],
      typeof node?.mainEntityOfPage === "string" ? node.mainEntityOfPage : node?.mainEntityOfPage?.["@id"]
    ].filter((value) => typeof value === "string");
    if (candidates.length === 0) return false;
    let page;
    try {
      page = new URL(canonicalURL(), location.href);
    } catch {
      return false;
    }
    return candidates.some((value) => {
      try {
        const candidate = new URL(value, location.href);
        return candidate.origin === page.origin
          && candidate.pathname.replace(/\/+$/, "") === page.pathname.replace(/\/+$/, "");
      } catch {
        return false;
      }
    });
  }

  function bestStructuredNode(nodes, visibleAddress = null) {
    const preferredTypes = [
      "apartment",
      "accommodation",
      "residence",
      "singlefamilyresidence",
      "house",
      "product",
      "place",
      "realestatelisting"
    ];

    let winner = {};
    let winningScore = Number.NEGATIVE_INFINITY;
    for (const node of nodes) {
      const visibleKey = buildingAddressKey(visibleAddress);
      const nodeKey = buildingAddressKey(structuredAncestorAddress(node));
      if (visibleKey && nodeKey && visibleKey !== nodeKey) continue;
      const visibleUnit = unitFromText(visibleAddress || "");
      const nodeUnit = normalizedUnitIdentifier(valueForKeys(node, ["unit", "unitNumber", "apartmentNumber", "apartmentSuite"]));
      if (visibleUnit && nodeUnit && visibleUnit !== nodeUnit) continue;
      const context = structuredNodeContexts.get(node) || "";
      if (/recommend|similar|nearby|history|unavailable|off.?market/i.test(context)) continue;
      const nodeTypes = types(node);
      let score = preferredTypes.some((type) => nodeTypes.includes(type)) ? 5 : 0;
      if (node.address) score += 4;
      if (node.offers) score += 3;
      if (node.numberOfBedrooms != null) score += 2;
      if (node.numberOfBathroomsTotal != null || node.numberOfBathrooms != null) score += 2;
      if (node.floorSize) score += 1;
      if (node.image) score += 1;
      if (node.zpid || node.listingId || node.propertyId) score += 5;
      if (node.streetAddress || node.addressLine1) score += 4;
      if (node.price || node.rent || node.monthlyRent || node.minPrice) score += 3;
      if (node.bedrooms != null || node.beds != null || node.minBeds != null) score += 2;
      if (node.bathrooms != null || node.baths != null || node.minBaths != null) score += 2;
      if (structuredURLMatchesPage(node)) score += 12;
      if (recommendationPattern.test([
        node.name,
        node.headline,
        node.description
      ].filter(Boolean).join(" "))) score -= 20;
      if (score > winningScore) {
        winner = node;
        winningScore = score;
      }
    }
    return winner;
  }

  function structuredCoordinate(node) {
    const containers = [
      node,
      node?.geo,
      node?.location,
      node?.location?.geo,
      node?.address?.geo
    ];
    for (const candidate of containers) {
      if (!candidate || typeof candidate !== "object") continue;
      const latitude = coordinateNumber(valueForKeys(candidate, ["latitude", "lat"]));
      const longitude = coordinateNumber(valueForKeys(candidate, ["longitude", "lng", "lon"]));
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
  }

  function structuredAddress(node) {
    const direct = typeof node.address === "object" ? node.address : null;
    const addressNode = direct;
    if (!addressNode) {
      return cleanText(
        first(
          typeof node.address === "string" ? node.address : null,
          node.streetAddress,
          node.addressLine1
        )
      );
    }

    return cleanText([
      addressNode.streetAddress,
      addressNode.addressLocality,
      [addressNode.addressRegion, addressNode.postalCode]
        .filter(Boolean)
        .join(" ")
    ].filter(Boolean).join(", "));
  }

  function buildingAddressKey(value) {
    const address = cleanText(value);
    if (!address) return null;
    return address
      .toLowerCase()
      .replace(/\b(?:apt|apartment|unit|suite)\s*#?\s*[a-z0-9-]+\b.*$/i, "")
      .replace(/#\s*[a-z0-9-]+\b.*$/i, "")
      .split(",")[0]
      .replace(/\bnorth\b/g, "n")
      .replace(/\bsouth\b/g, "s")
      .replace(/\beast\b/g, "e")
      .replace(/\bwest\b/g, "w")
      .replace(/\bstreet\b/g, "st")
      .replace(/\bavenue\b/g, "ave")
      .replace(/\bboulevard\b/g, "blvd")
      .replace(/\broad\b/g, "rd")
      .replace(/\bdrive\b/g, "dr")
      .replace(/\blane\b/g, "ln")
      .replace(/\bplace\b/g, "pl")
      .replace(/\bcourt\b/g, "ct")
      .replace(/\bterrace\b/g, "ter")
      .replace(/\bparkway\b/g, "pkwy")
      .replace(/[^a-z0-9]+/g, " ")
      .trim() || null;
  }

  function structuredCity(node) {
    const addressNode = typeof node.address === "object" ? node.address : null;
    return cleanText(first(addressNode?.addressLocality, node.city, node.cityName));
  }

  function valueForKeys(node, keys) {
    if (!node || typeof node !== "object") return null;
    for (const key of keys) {
      const value = node[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return null;
  }

  function bestValue(nodes, keys) {
    for (const node of nodes) {
      const value = valueForKeys(node, keys);
      if (value !== null) return value;
    }
    return null;
  }

  function selectorText(selectors, roots = recommendationRoots()) {
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (isRecommendationElement(node, roots) || isListingCard(node)) continue;
        const value = cleanText(node.textContent);
        if (value) return value;
      }
    }
    return null;
  }

  function offerValue(node, key) {
    const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
    for (const offer of offers.filter(Boolean)) {
      const value = first(
        offer?.[key],
        offer?.priceSpecification?.[key],
        key === "price" ? offer?.lowPrice : null
      );
      if (value != null) return value;
    }
    return null;
  }

  function absoluteImageURL(value) {
    const candidate = cleanText(value);
    if (!candidate) return null;
    try {
      const url = new URL(candidate, document.baseURI || location.href);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      if (/(?:logo|favicon|avatar|sprite|map-marker|placeholder)[^/]*\.(?:svg|png|gif)(?:$|\?)/i.test(url.href)) {
        return null;
      }
      return url.href;
    } catch {
      return null;
    }
  }

  function structuredImageURL(value) {
    if (typeof value === "string") return absoluteImageURL(value);
    if (Array.isArray(value)) {
      return value.map(structuredImageURL).find(Boolean) || null;
    }
    if (value && typeof value === "object") {
      return absoluteImageURL(value.url || value.contentUrl || value.thumbnailUrl);
    }
    return null;
  }

  function visibleListingImageURL(roots = recommendationRoots()) {
    const selectors = [
      '[data-testid*="gallery" i] img',
      '[data-testid*="hero" i] img',
      '[data-testid*="media" i] img',
      '[class*="gallery" i] img',
      '[class*="hero" i] img',
      'main picture img',
      '[role="main"] picture img',
      'main img',
      '[role="main"] img'
    ];
    const images = new Set(document.querySelectorAll(selectors.join(',')));
    let winner = null;
    let winningScore = Number.NEGATIVE_INFINITY;
    for (const image of images) {
      if (isRecommendationElement(image, roots) || isListingCard(image)) continue;
      if (image.closest('nav,header,footer,[class*="map" i],[data-testid*="map" i]')) continue;
      const url = first(
        absoluteImageURL(image.currentSrc),
        absoluteImageURL(image.src),
        absoluteImageURL(image.getAttribute('data-src')),
        absoluteImageURL(image.getAttribute('data-lazy-src')),
        absoluteImageURL(image.getAttribute('data-original'))
      );
      if (!url) continue;
      const rect = image.getBoundingClientRect();
      const width = image.naturalWidth || rect.width;
      const height = image.naturalHeight || rect.height;
      const ratio = height > 0 ? width / height : 0;
      if (width < 220 || height < 140 || ratio < 0.65 || ratio > 2.8) continue;
      const descriptor = [
        image.alt,
        image.id,
        image.className,
        image.closest('[data-testid]')?.getAttribute('data-testid'),
        image.closest('[class]')?.className
      ].filter((value) => typeof value === 'string').join(' ');
      if (/logo|icon|avatar|map|street.?view|floor.?plan/i.test(descriptor)) continue;
      const heroBonus = /gallery|hero|photo|media/i.test(descriptor) ? 1_000_000 : 0;
      const viewportBonus = rect.bottom > 0 && rect.top < innerHeight ? 250_000 : 0;
      const score = heroBonus + viewportBonus + Math.min(width * height, 900_000);
      if (score > winningScore) {
        winner = url;
        winningScore = score;
      }
    }
    return winner;
  }

  function imageValue(node, roots = recommendationRoots()) {
    return first(
      absoluteImageURL(metaContent('meta[property="og:image:secure_url"]')),
      absoluteImageURL(metaContent('meta[property="og:image"]')),
      absoluteImageURL(metaContent('meta[name="twitter:image"]')),
      absoluteImageURL(document.querySelector('link[rel~="image_src"]')?.href),
      structuredImageURL(node.primaryImageOfPage),
      structuredImageURL(node.image),
      structuredImageURL(node.thumbnailUrl),
      visibleListingImageURL(roots)
    );
  }

  function primaryTextValues(roots = recommendationRoots()) {
    const seen = new Set();
    const values = [];
    for (const node of document.querySelectorAll(
      'h1,h2,h3,h4,p,li,dt,dd,span,[aria-label],[data-testid]'
    )) {
      if (isRecommendationElement(node, roots) || isListingCard(node)) continue;
      const value = cleanText(
        node.innerText || node.textContent || node.getAttribute("aria-label")
      );
      if (
        !value
        || value.length > 600
        || recommendationPattern.test(value)
        || seen.has(value.toLowerCase())
      ) continue;
      seen.add(value.toLowerCase());
      values.push(value);
      if (values.length >= 700) break;
    }
    return values;
  }

  function pageEvidence(
    nodes,
    primaryNode,
    isBuildingPage,
    primaryValues,
    roots,
    unitCandidates = []
  ) {
    const headings = [...document.querySelectorAll("h1, h2, h3")]
      .filter((element) => !isRecommendationElement(element, roots) && !isListingCard(element))
      .map((element) => cleanText(element.textContent))
      .filter(Boolean)
      .slice(0, 24);
    const relevantLines = primaryValues
      .filter((line) =>
        line
        && /(?:\$|unit|apt|studio|bed|bath|sq\.?\s*ft|floor plan|available|neighborhood|address)/i.test(line)
      )
      .slice(0, 60);
    const evidenceNodes = isBuildingPage ? nodes : [primaryNode];
    const structured = evidenceNodes
      .filter((candidate) => {
        if (candidate === primaryNode) return true;
        if (!isBuildingPage) return false;
        return valueForKeys(
          candidate,
          ["unit", "unitNumber", "apartmentNumber", "unitCode", "apartmentSuite", "floorPlanName"]
        ) != null;
      })
      .map((candidate) => {
        const address = typeof candidate.address === "object"
          ? [
              candidate.address?.streetAddress,
              candidate.address?.addressLocality,
              candidate.address?.addressRegion,
              candidate.address?.postalCode
            ].filter(Boolean).join(", ")
          : candidate.address;
        return {
          name: candidate.name,
          address,
          unit: valueForKeys(candidate, ["unit", "unitNumber", "apartmentNumber", "unitCode", "apartmentSuite"]),
          price: valueForKeys(candidate, ["price", "rent", "monthlyRent", "minPrice", "lowPrice"]),
          bedrooms: valueForKeys(candidate, ["bedrooms", "beds", "bedCount", "minBeds", "numberOfBedrooms"]),
          bathrooms: valueForKeys(candidate, ["bathrooms", "baths", "bathCount", "minBaths", "numberOfBathrooms"]),
          squareFeet: valueForKeys(candidate, ["squareFeet", "livingArea", "floorSize"]),
          availableDate: valueForKeys(candidate, ["availableDate", "availabilityDate", "dateAvailable"])
        };
      })
      .filter((candidate) =>
        candidate.unit
        || candidate.price
        || candidate.bedrooms != null
        || candidate.bathrooms != null
      )
      .slice(0, 36);

    return [
      `TITLE: ${cleanText(document.title) || ""}`,
      `HEADINGS:\n${headings.join("\n")}`,
      `RELEVANT PAGE LINES:\n${relevantLines.join("\n")}`,
      `STRUCTURED FACT CANDIDATES:\n${structured.map((candidate) => JSON.stringify(candidate)).join("\n")}`,
      `VISIBLE UNIT CANDIDATES:\n${unitCandidates.map((candidate) => JSON.stringify(candidate)).join("\n")}`
    ].join("\n\n").slice(0, 14_000);
  }

  function currentAvailabilityRoots(roots = recommendationRoots()) {
    const result = new Set(document.querySelectorAll([
      '[data-testid*="available-units" i]', '[data-testid*="availability-list" i]',
      '[data-testid*="unit-list" i]', '[data-testid*="floor-plans" i]',
      '[data-testid*="floorplans" i]', '[id*="available-units" i]',
      '[id*="floorplans" i]', '[class*="available-units" i]', '[class*="floorplans" i]'
    ].join(',')));
    for (const heading of document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')) {
      const text = cleanText(heading.innerText || heading.textContent);
      if (!text || unavailableUnitPattern.test(text)) continue;
      if (!/\b(?:available (?:apartments|homes|units)|availability|(?:apartment )?floor\s*plans?)\b/i.test(text)) continue;
      const root = heading.closest('section,[role="region"]') || heading.parentElement;
      if (root) result.add(root);
    }
    return new Set([...result].filter((root) => !isRecommendationElement(root, roots)));
  }

  // Preserve the row and line order used by the Share flow's native parser.
  function collectScanEvidence(roots, primaryNode, structuredUnitEvidence) {
    const availabilityRoots = currentAvailabilityRoots(roots);
    const withinAvailability = (element) => [...availabilityRoots]
      .some((root) => root === element || root.contains(element));
    const readSection = (root) => {
      let visited = 0;
      const read = (node) => {
        if (++visited > 24_000) return "";
        if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
        if (node.nodeType !== Node.ELEMENT_NODE) return "";
        if (node.matches('script,style,noscript,nav,footer,header,form,[hidden],[aria-hidden="true"],#homeboard-page-scan-root')) return "";
        if (isRecommendationElement(node, roots)) return "";
        if (isListingCard(node) && !withinAvailability(node)) return "";
        const descriptor = [node.id, node.className, node.getAttribute('data-testid')]
          .filter((value) => typeof value === 'string').join(' ');
        if (/unavailable|off.market|past.listings|rental.history/i.test(descriptor)) return "";
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return "";
        if (node.tagName === "BR") return "\n";
        let text = "";
        let excludedHeadingLevel = null;
        for (const child of node.childNodes) {
          const heading = child.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/.test(child.tagName);
          if (heading) {
            const level = Number(child.tagName[1]);
            if (excludedHeadingLevel !== null && level <= excludedHeadingLevel) excludedHeadingLevel = null;
            if (unavailableUnitPattern.test(child.textContent || "")) excludedHeadingLevel = level;
          }
          if (excludedHeadingLevel === null) text += read(child);
        }
        const block = /^(?:block|flex|grid|list-item|table-row|table-cell|table|flow-root)$/.test(style.display);
        return block ? `\n${text}\n` : text;
      };
      return read(root).replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n').trim().slice(0, 32_000);
    };
    const outerAvailabilityRoots = [...availabilityRoots].filter((root) =>
      ![...availabilityRoots].some((other) => other !== root && other.contains(root))
    );
    const availabilityPageEvidence = outerAvailabilityRoots.map(readSection).filter(Boolean).join('\n\n').slice(0, 32_000);
    const main = document.querySelector('main,[role="main"]') || document.body;
    const semanticPageEvidence = main ? readSection(main) : "";
    const primaryFacts = [...document.querySelectorAll(
      'h1,address,[itemprop="streetAddress"],[data-testid="price"],'
      + '[data-testid*="bed-bath" i],[data-testid*="monthly-rent" i],[itemprop="price"]'
    )].filter((element) => !isRecommendationElement(element, roots) && !isListingCard(element))
      .map((element) => cleanText(element.innerText || element.textContent)).filter(Boolean);
    const primaryPageEvidence = [structuredAddress(primaryNode), ...primaryFacts].filter(Boolean).join('\n').slice(0, 10_000);
    return {
      primaryPageEvidence,
      semanticPageEvidence,
      availabilityPageEvidence,
      // Keep every structured option available for native validation, outside the page digest's cap.
      structuredUnitEvidence: structuredUnitEvidence.join('\n'),
      secondaryPageEvidence: [primaryPageEvidence, availabilityPageEvidence, semanticPageEvidence]
        .filter(Boolean).join('\n\n').slice(0, 32_000)
    };
  }

  const unavailableUnitPattern =
    /\b(?:unavailable|no[ _-]?longer[ _-]?available|off[ _-]?market|rented|leased|(?:recently[ _-]?)?sold|resale|for[ _-]?sale|in[ _-]?contract|coming[ _-]?soon)\b/i;

  function normalizedUnitIdentifier(value) {
    const unit = cleanText(typeof value === "number" ? String(value) : value)
      ?.replace(/^(?:unit|apt|apartment)\s*(?:#|number|no\.?)?\s*/i, "")
      .replace(/^#\s*/, "")
      .replace(/[.,;:]+$/, "")
      .toUpperCase();
    if (!unit || unit.length > 24) return null;
    if (/^(?:AVAILABLE|AVAILABILITY|DETAILS?|FEATURES?|AMENITIES|FLOOR|PLAN|NOW|RENT|RENTAL|HOME|LISTING)$/i.test(unit)) {
      return null;
    }
    return /^[A-Z0-9][A-Z0-9-]{0,23}$/.test(unit) ? unit : null;
  }

  function normalizedFloorPlanLabel(value) {
    const label = cleanText(value)
      ?.replace(/^(?:the\s+)?(?:floor\s*plan|floorplan|layout)\s*[:#-]?\s*/i, "")
      .replace(/\s+(?:floor\s*plan|floorplan)$/i, "");
    if (
      !label
      || label.length > 80
      || /^(?:available units?|availability|floor plans?|view|details?|select|apply|contact)$/i.test(label)
      || unavailableUnitPattern.test(label)
    ) return null;
    return label;
  }

  function floorPlanLabelFromText(value) {
    const raw = typeof value === "string" ? value : "";
    const line = raw.split(/\n+/)
      .map(cleanText)
      .find((candidate) => candidate && /\bfloor\s*plan\b/i.test(candidate));
    const direct = normalizedFloorPlanLabel(line);
    if (direct) return direct;
    const compact = cleanText(raw);
    const match = compact?.match(/\b([A-Za-z0-9][A-Za-z0-9-]{0,23})\s+floor\s*plan\b/i);
    return normalizedFloorPlanLabel(match?.[1]);
  }

  function explicitUnitIdentifiers(text) {
    const value = cleanText(text) || "";
    const identifiers = [];
    const patterns = [
      /\b(?:unit|apt|apartment)\b\s*(?:#|number|no\.?)?\s*:?[ ]*(?:unit\s*)?#?\s*([A-Za-z0-9][A-Za-z0-9-]{0,23})\b/gi,
      /#\s*([A-Za-z0-9][A-Za-z0-9-]{0,23})\b/g
    ];
    for (const pattern of patterns) {
      for (const match of value.matchAll(pattern)) {
        const unit = normalizedUnitIdentifier(match[1]);
        if (unit && !identifiers.includes(unit)) identifiers.push(unit);
      }
    }
    return identifiers;
  }

  function structuredAncestorValue(node, keys, maximumDepth = 6) {
    let current = node;
    for (let depth = 0; current && depth <= maximumDepth; depth += 1) {
      const value = valueForKeys(current, keys);
      if (value !== null) return value;
      current = structuredNodeParents.get(current);
    }
    return null;
  }

  function structuredFloorPlanLabel(node) {
    let current = node;
    for (let depth = 0; current && depth <= 6; depth += 1) {
      const explicitLabel = normalizedFloorPlanLabel(valueForKeys(
        current,
        ["floorPlanName", "floorplanName", "planName", "layoutName"]
      ));
      if (explicitLabel) return explicitLabel;

      const context = structuredNodeContexts.get(current) || "";
      const unit = valueForKeys(
        current,
        ["unit", "unitNumber", "apartmentNumber", "unitCode", "apartmentSuite"]
      );
      const hasFloorPlanShape = Array.isArray(current.units)
        || valueForKeys(current, ["minPrice", "maxPrice", "minBaseRent", "maxBaseRent"]) !== null;
      if (!unit && /floor.?plans?|layouts?/i.test(context) && hasFloorPlanShape) {
        const contextualLabel = normalizedFloorPlanLabel(current.name);
        if (contextualLabel) return contextualLabel;
      }
      current = structuredNodeParents.get(current);
    }
    return null;
  }

  function structuredAncestorAddress(node) {
    let current = node;
    for (let depth = 0; current && depth <= 6; depth += 1) {
      const address = structuredAddress(current);
      if (address) return address;
      current = structuredNodeParents.get(current);
    }
    return null;
  }

  function nearestPrecedingHeadingText(element) {
    let preceding = null;
    for (const heading of document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')) {
      if (element.contains(heading)) continue;
      const position = heading.compareDocumentPosition(element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) preceding = heading;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) break;
    }
    return cleanText(preceding?.innerText || preceding?.textContent);
  }

  function inheritedFloorPlanText(row, boundaryRoots, recommendationSections) {
    let current = row.parentElement;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      if (isRecommendationElement(current, recommendationSections)) return null;
      const descriptor = [
        current.id,
        current.className,
        current.getAttribute?.('data-testid'),
        current.getAttribute?.('aria-label')
      ].filter((value) => typeof value === 'string').join(' ');
      const text = cleanText(current.innerText || current.textContent);
      if (
        (
          /floor.?plan|floorplan|layout|unit.?group|accordion/i.test(descriptor)
          || /^(?:[a-z0-9-]+\s+)?floor\s*plan\b/i.test(text || "")
        )
        && text
        && text.length <= 12_000
        && (bedroomsFromText(text) !== null || bathroomsFromText(text) !== null)
      ) return text;
      if (boundaryRoots.has(current)) break;
    }
    return null;
  }

  function unitOptions(
    nodes,
    roots = recommendationRoots(),
    { pageAddress = null, primaryNode = null, structuredEvidence = [] } = {}
  ) {
    const options = [];
    const seen = new Map();
    const optionRanks = [];
    const optionQualities = [];

    const appendOption = ({
      unit,
      label,
      price,
      bedrooms,
      bathrooms,
      squareFeet,
      availableDate,
      groupLabel,
      sourceRank = 1
    }) => {
      const cleanUnit = normalizedUnitIdentifier(unit);
      const cleanLabel = cleanUnit || normalizedFloorPlanLabel(label);
      const hasLayout = bedrooms !== null && bedrooms !== undefined
        || bathrooms !== null && bathrooms !== undefined;
      if (
        !cleanLabel
        || !Number.isFinite(price)
        || price < 300
        || price > 100_000
        || !hasLayout
      ) return;

      const key = cleanUnit
        ? `unit|${cleanUnit}`
        : `plan|${cleanLabel}|${bedrooms}|${bathrooms}`.toLowerCase();
      const option = {
        id: cleanUnit || key,
        label: cleanLabel,
        unit: cleanUnit,
        price,
        bedrooms,
        bathrooms,
        squareFeet,
        availableDate: cleanText(availableDate),
        _groupKey: normalizedFloorPlanLabel(groupLabel || (!cleanUnit ? cleanLabel : null))
          ?.toLowerCase() || null
      };
      const quality = [price, bedrooms, bathrooms, squareFeet, option.availableDate]
        .filter((value) => value !== null && value !== undefined && value !== "").length
        + (cleanUnit ? 2 : 0);
      const existingIndex = seen.get(key);
      if (existingIndex !== undefined) {
        if (
          sourceRank < optionRanks[existingIndex]
          || (
            sourceRank === optionRanks[existingIndex]
            && quality <= optionQualities[existingIndex]
          )
        ) return;
        options[existingIndex] = option;
        optionRanks[existingIndex] = sourceRank;
        optionQualities[existingIndex] = quality;
        return;
      }
      seen.set(key, options.length);
      options.push(option);
      optionRanks.push(sourceRank);
      optionQualities.push(quality);
    };

    const pageAddressKey = buildingAddressKey(pageAddress);
    let structuredCandidateCount = 0;
    for (const candidate of nodes) {
      if (structuredCandidateCount >= 800) break;
      const unit = normalizedUnitIdentifier(valueForKeys(
        candidate,
        ["unit", "unitNumber", "apartmentNumber", "unitCode", "apartmentSuite"]
      ));
      const planLabel = structuredFloorPlanLabel(candidate);
      const ownsPlan = valueForKeys(candidate, ["floorPlanName", "floorplanName", "planName", "layoutName"]) !== null
        || (candidate.name && Array.isArray(candidate.units));
      if (!unit && !ownsPlan) continue;
      const label = unit || planLabel;
      if (!label) continue;
      const context = structuredNodeContexts.get(candidate) || "";
      if (/recommend|similar|nearby|history|unavailable|off.?market|past.?listings/i.test(context)) continue;
      const contextIsAvailability = /(?:available|availability)/i.test(context);
      const contextIsUnitCollection = /(?:units?|floor.?plans?)/i.test(context);
      const candidateAddressKey = buildingAddressKey(structuredAncestorAddress(candidate));
      const matchesPageAddress = Boolean(
        pageAddressKey && candidateAddressKey && pageAddressKey === candidateAddressKey
      );
      const matchesPageURL = structuredURLMatchesPage(candidate);
      if (pageAddressKey && candidateAddressKey && !matchesPageAddress) continue;
      const availableDate = cleanText(structuredAncestorValue(
        candidate,
        ["availableDate", "availabilityDate", "dateAvailable", "availableFrom"]
      ));
      const status = cleanText(structuredAncestorValue(candidate, [
        "availability", "availabilityStatus", "homeStatus", "listingStatus", "status", "saleStatus"
      ]));
      if (status && unavailableUnitPattern.test(status)) continue;
      const hasAvailabilitySignal = Boolean(availableDate || status || contextIsAvailability);
      if (
        candidate !== primaryNode
        && !matchesPageAddress
        && !matchesPageURL
        && !(contextIsUnitCollection && hasAvailabilitySignal)
      ) continue;
      if (!unit && candidate !== primaryNode && !hasAvailabilitySignal) continue;
      structuredCandidateCount += 1;

      const price = numeric(structuredAncestorValue(
        candidate,
        ["price", "rent", "monthlyRent", "baseRent", "minBaseRent", "minPrice", "lowPrice"]
      ));
      const bedrooms = numeric(structuredAncestorValue(
        candidate,
        ["bedrooms", "beds", "bedCount", "minBeds", "numberOfBedrooms"]
      ));
      const bathrooms = numeric(structuredAncestorValue(
        candidate,
        ["bathrooms", "baths", "bathCount", "minBaths", "numberOfBathrooms"]
      ));
      const squareFeet = numeric(structuredAncestorValue(
        candidate,
        ["squareFeet", "sqft", "livingArea", "floorSize"]
      ));
      structuredEvidence.push(JSON.stringify({ unit, label, price, bedrooms, bathrooms, squareFeet, availableDate, groupLabel: planLabel }));
      appendOption({
        unit,
        label,
        price,
        bedrooms,
        bathrooms,
        squareFeet,
        availableDate,
        groupLabel: planLabel,
        sourceRank: candidate === primaryNode || matchesPageURL || matchesPageAddress
          ? 3
          : 2
      });
    }

    const availabilityRoots = currentAvailabilityRoots(roots);

    const rowSelectors = [
      '[data-testid="unit" i]',
      '[data-testid*="unit-card" i]',
      '[data-testid*="unit-row" i]',
      '[data-testid*="unit-item" i]',
      '[data-testid*="unit-listing" i]',
      '[data-testid*="floor-plan-card" i]',
      '[data-testid*="floorplan-card" i]',
      '[class*="unit-card" i]',
      '[class*="unitrow" i]',
      '[class*="unit-row" i]',
      '[class*="floor-plan-card" i]',
      '[class*="floorplan-card" i]',
      '[class*="availability" i] tr',
      '[aria-label*="floor plan" i]',
      '[role="row"]',
      'table tbody tr'
    ];
    const rows = new Map();
    const availabilityRows = new Set();
    const addRows = (elements, semanticAvailability = false, rank = 3) => {
      for (const element of elements) {
        if (rows.size >= 700) break;
        rows.set(element, Math.max(rows.get(element) || 0, rank));
        if (semanticAvailability) availabilityRows.add(element);
      }
    };
    for (const selector of rowSelectors) {
      addRows(document.querySelectorAll(selector));
      if (rows.size >= 700) break;
    }
    for (const root of availabilityRoots) {
      addRows(root.querySelectorAll([
        'article',
        'li',
        'tr',
        '[role="row"]',
        '[role="listitem"]',
        '[data-testid*="unit-card" i]',
        '[data-testid*="unit-row" i]',
        '[data-testid*="floor-plan-card" i]',
        '[data-testid*="floorplan-card" i]'
      ].join(',')), true, 4);
      const floorPlanControls = [...root.querySelectorAll('button,[role="button"]')]
        .filter((control) => {
          const text = cleanText(control.innerText || control.textContent);
          return Boolean(
            text
            && text.length <= 2_000
            && /\bfloor\s*plans?\b/i.test(text)
            && priceFromText(text) !== null
            && (bedroomsFromText(text) !== null || bathroomsFromText(text) !== null)
          );
        });
      addRows(floorPlanControls, true, 4);

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();
      let visitedTextNodes = 0;
      while (textNode && visitedTextNodes < 4_000 && rows.size < 700) {
        visitedTextNodes += 1;
        if (explicitUnitIdentifiers(textNode.nodeValue || "").length > 0) {
          let candidate = textNode.parentElement;
          for (let depth = 0; candidate && depth < 8; depth += 1) {
            const candidateText = cleanText(candidate.innerText || candidate.textContent);
            if (!candidateText || candidateText.length > 2_000) break;
            if (priceFromText(candidateText) !== null) {
              addRows([candidate], true, 5);
              break;
            }
            if (candidate === root) break;
            candidate = candidate.parentElement;
          }
        }
        textNode = walker.nextNode();
      }
    }

    const labelSelector = [
      '[data-testid*="unit-name" i]',
      '[data-testid*="unit-number" i]',
      '[data-testid*="floor-plan-name" i]',
      '[data-testid*="floorplan-name" i]',
      '[class*="unit-name" i]',
      '[class*="floor-plan-name" i]',
      '[class*="floorplan-name" i]',
      'h2',
      'h3',
      'h4',
      'th'
    ].join(',');

    for (const [row, rowRank] of rows) {
      if (isRecommendationElement(row, roots) || isListingCard(row)) continue;
      if (row.closest('[hidden],[aria-hidden="true"]')) continue;
      const text = cleanText(row.innerText || row.textContent);
      if (
        !text
        || text.length < 8
        || text.length > 2_000
        || unavailableUnitPattern.test(text)
        || unavailableUnitPattern.test(nearestPrecedingHeadingText(row) || "")
      ) continue;
      const candidateAddressKey = buildingAddressKey(addressFromText(text));
      if (pageAddressKey && candidateAddressKey && candidateAddressKey !== pageAddressKey) continue;

      const descriptor = [
        row.id,
        row.className,
        row.getAttribute('data-testid'),
        row.getAttribute('aria-label')
      ].filter((value) => typeof value === 'string').join(' ');
      const textUnits = explicitUnitIdentifiers(text);
      const attributeUnit = normalizedUnitIdentifier(first(
        row.getAttribute('data-unit'),
        row.getAttribute('data-unit-number'),
        row.getAttribute('data-apartment')
      ));
      if (!attributeUnit && textUnits.length > 1) continue;
      const unit = attributeUnit || (textUnits.length === 1 ? textUnits[0] : null);
      const hasUnitContext = /unit|floor.?plan|availability/i.test(descriptor)
        || availabilityRows.has(row)
        || Boolean(unit);
      if (!hasUnitContext) continue;

      const attributePlan = normalizedFloorPlanLabel(first(
        row.getAttribute('data-floorplan'),
        row.getAttribute('data-floor-plan')
      ));
      const labelNode = row.matches(labelSelector)
        ? row
        : row.querySelector(labelSelector);
      const lineLabel = (row.innerText || "")
        .split(/\n+/)
        .map(cleanText)
        .find((line) =>
          line
          && line.length <= 80
          && !/(?:\$|\b(?:studio|\d+(?:\.\d+)?)\s*(?:bd|br|bed|ba|bath)|sq\.?\s*ft|square feet|available\b)/i.test(line)
          && !/^(?:view|details?|apply|contact|tour|select|more)(?:\s+\w+){0,2}$/i.test(line)
        );
      const label = unit || normalizedFloorPlanLabel(
        attributePlan || labelNode?.innerText || labelNode?.textContent || lineLabel
      );
      if (!label) continue;
      if (!unit && !availabilityRows.has(row) && !/floor.?plan|floorplan|layout/i.test(descriptor)) {
        continue;
      }

      const inheritedText = inheritedFloorPlanText(row, availabilityRoots, roots);
      const layoutText = [text, inheritedText].filter(Boolean).join(" ");

      const availableDateMatch = text.match(
        /\b(?:available|availability)\s*(?:on|from|:)?\s*(now|immediately|[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)\b/i
      );
      appendOption({
        unit,
        label,
        price: priceFromText(text),
        bedrooms: bedroomsFromText(text) ?? bedroomsFromText(layoutText),
        bathrooms: bathroomsFromText(text) ?? bathroomsFromText(layoutText),
        squareFeet: squareFeetFromText(text) ?? squareFeetFromText(layoutText),
        availableDate: availableDateMatch?.[1] || null,
        groupLabel: floorPlanLabelFromText(inheritedText || text),
        sourceRank: unit ? Math.max(rowRank, 5) : rowRank
      });
    }
    const rankedOptions = options
      .map((option, index) => ({ option, rank: optionRanks[index] }));
    const exactUnitGroups = new Set(
      rankedOptions
        .filter(({ option }) => option.unit && option._groupKey)
        .map(({ option }) => option._groupKey)
    );
    return rankedOptions
      .filter(({ option }) => option.unit || !exactUnitGroups.has(option._groupKey))
      .sort((left, right) => right.rank - left.rank)
      .slice(0, 80)
      .map(({ option }) => {
        const { _groupKey, ...publicOption } = option;
        return publicOption;
      });
  }

  function priceFromText(text) {
    const matches = [...text.matchAll(
      /\$\s*((?:[1-9][0-9]{0,2}(?:,[0-9]{3})+)|(?:[1-9][0-9]{2,5}))(?:\.\d{2})?/g
    )]
      .map((match) => numeric(match[1]))
      .filter((value) => value != null && value >= 300 && value <= 100_000);
    return matches[0] ?? null;
  }

  function bedroomsFromText(text) {
    if (/\bstudio\b/i.test(text)) return 0;
    const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:bd|br|bed|beds|bedroom|bedrooms)\b/i);
    return numeric(match?.[1]);
  }

  function bathroomsFromText(text) {
    const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:ba|bth|bath|baths|bathroom|bathrooms)\b/i);
    return numeric(match?.[1]);
  }

  function squareFeetFromText(text) {
    const match = text.match(/\b([1-9][0-9]{2,4}(?:,[0-9]{3})?)\s*(?:sq\.?\s*ft|square\s*feet)\b/i);
    return numeric(match?.[1]);
  }

  function addressFromText(text) {
    const match = text.match(
      /\b(\d{1,6}[A-Za-z]?\s+(?:(?:Route|Rte|Highway|Hwy)\s+\d+[A-Za-z]?|[A-Za-z0-9.' -]+?\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Parkway|Pkwy|Terrace|Ter)\b)(?:,?\s*(?:#|Apt|Apartment|Unit)\s*[A-Za-z0-9-]+)?(?:,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5})?)/i
    );
    return cleanText(match?.[1]);
  }

  function composeAddress(baseAddress, city, region, postalCode) {
    let result = cleanText(baseAddress);
    if (!result) return null;
    const contains = (component) => {
      const value = cleanText(component);
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
    return cleanText(result);
  }

  function unitFromText(text) {
    return explicitUnitIdentifiers(text)[0] || null;
  }

  function sourceName() {
    const host = location.hostname.toLowerCase();
    const providers = [
      ["zillow.com", "Zillow"],
      ["streeteasy.com", "StreetEasy"],
      ["realtor.com", "Realtor"],
      ["apartments.com", "Apartments.com"],
      ["redfin.com", "Redfin"],
      ["rent.com", "Rent.com"],
      ["renthop.com", "RentHop"],
      ["craigslist.org", "Craigslist"],
      ["compass.com", "Compass"],
      ["corcoran.com", "Corcoran"],
      ["elliman.com", "Douglas Elliman"],
      ["serhant.com", "SERHANT."],
      ["sothebysrealty.com", "Sotheby's"]
    ];
    return providers.find(([domain]) => host.endsWith(domain))?.[1] || host.replace(/^www\./, "");
  }

  function extractAgentContact(node, roots, text) {
    const rawAgent = node?.realEstateAgent || node?.broker || node?.contactPoint || node?.seller || node?.provider;
    const structuredAgent = Array.isArray(rawAgent) ? rawAgent[0] : (rawAgent && typeof rawAgent === "object" ? rawAgent : null);
    const structuredName = cleanText(first(structuredAgent?.name, structuredAgent?.givenName));
    const structuredPhone = cleanText(first(structuredAgent?.telephone, structuredAgent?.phone));
    const structuredEmail = cleanText(structuredAgent?.email);
    const structuredOrg = typeof structuredAgent?.worksFor === "object" ? structuredAgent.worksFor?.name : (typeof structuredAgent?.parentOrganization === "object" ? structuredAgent.parentOrganization?.name : null);
    const structuredBrokerage = cleanText(first(structuredOrg, structuredAgent?.brokerage));

    const domName = cleanText(selectorText([
      '[data-testid="listing-agent-name"]',
      '[data-testid="contact-agent-name"]',
      '[data-testid="agent-name"]',
      '[data-qa="agent-name"]',
      '.agent-name',
      '.listing-agent',
      '.listing-agent-info .name',
      '[data-tn="listing-agent"]',
      '[itemprop="realEstateAgent"]',
      '[itemprop="broker"]'
    ], roots));

    const domBrokerage = cleanText(selectorText([
      '[data-testid="broker-name"]',
      '[data-testid="listing-brokerage"]',
      '[data-testid="attribution-broker"]',
      '.brokerage-name',
      '.licensed-broker',
      '[data-tn="listing-brokerage"]'
    ], roots));

    let domPhone = null;
    const telLink = document.querySelector('a[href^="tel:"]');
    if (telLink) {
      domPhone = cleanText(telLink.getAttribute("href")?.replace(/^tel:/i, "") || telLink.textContent);
    }
    if (!domPhone) {
      domPhone = cleanText(selectorText([
        '[data-testid="agent-phone"]',
        '[data-testid="contact-phone"]',
        '[itemprop="telephone"]'
      ], roots));
    }

    let domEmail = null;
    const mailtoLink = document.querySelector('a[href^="mailto:"]');
    if (mailtoLink) {
      const emailHref = mailtoLink.getAttribute("href")?.replace(/^mailto:/i, "").split("?")[0];
      domEmail = cleanText(emailHref || mailtoLink.textContent);
    }
    if (!domEmail) {
      domEmail = cleanText(selectorText([
        '[data-testid="agent-email"]',
        '[itemprop="email"]'
      ], roots));
    }

    const textNameMatch = text.match(/(?:listed by|listing agent|represented by|contact agent|listing broker)\s*[:\s-]+\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i);
    const textName = cleanText(textNameMatch?.[1]);

    const textBrokerageMatch = text.match(/(?:brokerage|brokered by|listing courtesy of|courtesy of)\s*[:\s-]+\s*([A-Za-z0-9&.,' ]{2,50})/i);
    const textBrokerage = cleanText(textBrokerageMatch?.[1]);

    const textPhoneMatch = text.match(/(?:call|text|phone|cell|direct)\s*[:\s-]+\s*(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/i);
    const textPhone = cleanText(textPhoneMatch?.[1]);

    let textEmail = null;
    const textEmailMatch = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
    if (textEmailMatch && !/support@|info@zillow|contact@streeteasy|no-reply@|noreply@/i.test(textEmailMatch[1])) {
      textEmail = cleanText(textEmailMatch[1]);
    }

    const agentName = first(domName, structuredName, textName);
    const agentPhone = first(domPhone, structuredPhone, textPhone);
    const agentEmail = first(domEmail, structuredEmail, textEmail);
    const brokerage = first(domBrokerage, structuredBrokerage, textBrokerage);

    if (!agentName && !agentPhone && !agentEmail && !brokerage) {
      return null;
    }

    return {
      agentName: agentName || null,
      agentPhone: agentPhone || null,
      agentEmail: agentEmail || null,
      brokerage: brokerage || null
    };
  }

  function extractListing() {
    const nodes = parseStructuredData();
    const roots = recommendationRoots();
    const visibleAddress = visibleListingAddress(roots);
    const pageIdentity = currentPageIdentity();
    const node = bestStructuredNode(nodes, visibleAddress);
    const coordinate = structuredCoordinate(node);
    const primaryValues = primaryTextValues(roots);
    const text = [
      metaContent('meta[name="description"]'),
      metaContent('meta[property="og:description"]'),
      primaryValues.join("\n").slice(0, 60_000)
    ].filter(Boolean).join(" ");

    const floorSize = typeof node.floorSize === "object" ? node.floorSize.value : node.floorSize;
    const pageTitle = cleanText(
      first(
        JSON.parse(pageIdentity)[2],
        metaContent('meta[property="og:title"]'),
        node.name,
        document.title
      )
    );
    const baseAddress = first(
      visibleAddress,
      structuredAddress(node),
      selectorText([
        '[data-testid="bdp-building-address"]',
        '[data-testid="home-details-summary-headline"]',
        '[data-testid="address"]',
        'h1[itemprop="address"]'
      ], roots),
      addressFromText(`${pageTitle || ""} ${text.slice(0, 12_000)}`)
    );
    const city = first(
      structuredCity(node),
      cleanText(valueForKeys(node, ["city", "cityName", "addressLocality"]))
    );
    const addressObject = typeof node.address === "object" ? node.address : null;
    const region = cleanText(first(
      addressObject?.addressRegion,
      valueForKeys(node, ["state", "stateCode", "addressRegion"])
    ));
    const postalCode = cleanText(first(
      addressObject?.postalCode,
      valueForKeys(node, ["zip", "zipcode", "postalCode"])
    ));
    const address = composeAddress(baseAddress, city, region, postalCode);
    const unit = first(
      unitFromText(visibleAddress || ""),
      cleanText(node.apartmentSuite),
      cleanText(node.unitCode),
      cleanText(valueForKeys(node, ["unit", "unitNumber", "apartmentNumber"])),
      unitFromText(`${address || ""} ${pageTitle || ""}`)
    );
    const price = first(
      numeric(offerValue(node, "price")),
      numeric(valueForKeys(node, ["price", "rent", "monthlyRent", "minPrice", "lowPrice"])),
      numeric(metaContent('meta[property="product:price:amount"]')),
      numeric(selectorText([
        '[data-testid="price"]',
        '[data-testid="price-and-tax"]',
        '[data-testid="home-details-chip-container"]'
      ], roots)),
      priceFromText(text)
    );
    const bedrooms = first(
      numeric(node.numberOfBedrooms),
      numeric(valueForKeys(node, ["bedrooms", "beds", "bedCount", "minBeds"])),
      bedroomsFromText(text)
    );
    const bathrooms = first(
      numeric(node.numberOfBathroomsTotal),
      numeric(node.numberOfBathrooms),
      numeric(valueForKeys(node, ["bathrooms", "baths", "bathCount", "minBaths"])),
      bathroomsFromText(text)
    );
    const squareFeet = first(
      numeric(floorSize),
      squareFeetFromText(text)
    );
    const structuredUnitEvidence = [];
    const availableUnitOptions = unitOptions(nodes, roots, {
      pageAddress: address,
      primaryNode: node,
      structuredEvidence: structuredUnitEvidence
    });
    const scanEvidence = collectScanEvidence(roots, node, structuredUnitEvidence);
    const isBuildingPage =
      /\/apartments?\//i.test(location.pathname)
      || types(node).includes("apartmentcomplex")
      || currentAvailabilityRoots(roots).size > 0
      || /\b(?:floor plans|available units|units available)\b/i.test(text.slice(0, 10_000))
      || availableUnitOptions.length > 1;

    const factCount = [address, price, bedrooms, bathrooms, squareFeet]
      .filter((value) => value !== null && value !== undefined).length;
    const detailPage = isActualListingPage(nodes, node, address);
    const contact = extractAgentContact(node, roots, text);

    return {
      url: location.href,
      pageIdentity,
      canonicalURL: canonicalURL(),
      sourceName: sourceName(),
      pageTitle,
      address,
      unit: isBuildingPage ? null : unit,
      city,
      region,
      postalCode,
      latitude: coordinate?.latitude,
      longitude: coordinate?.longitude,
      neighborhood: cleanText(first(
        valueForKeys(node, ["neighborhood", "neighborhoodName", "community"])
      )),
      price,
      bedrooms,
      bathrooms,
      squareFeet,
      imageURL: imageValue(node, roots),
      summary: cleanText(metaContent('meta[property="og:description"]') || metaContent('meta[name="description"]')),
      detailPage,
      listingScope: isBuildingPage ? "building" : "unit",
      extractionConfidence: factCount >= 4 ? "high" : factCount >= 2 ? "medium" : "low",
      contact,
      agentName: contact?.agentName || null,
      agentPhone: contact?.agentPhone || null,
      agentEmail: contact?.agentEmail || null,
      brokerage: contact?.brokerage || null,
      ...scanEvidence,
      pageEvidence: pageEvidence(
        nodes,
        node,
        isBuildingPage,
        primaryValues,
        roots,
        availableUnitOptions
      ),
      unitOptions: isBuildingPage ? availableUnitOptions : []
    };
  }

  let pageScanSession = null;

  function readableSentenceRanges() {
    const roots = recommendationRoots();
    const seenTextNodes = new Set();
    const ranges = [];
    const selectors = [
      "main h1",
      "main h2",
      "main h3",
      "main p",
      "main li",
      "main dt",
      "main dd",
      "article h1",
      "article h2",
      "article h3",
      "article p",
      "article li",
      '[role="main"] h1',
      '[role="main"] h2',
      '[role="main"] h3',
      '[role="main"] p',
      '[role="main"] li'
    ];
    let containers = [...document.querySelectorAll(selectors.join(","))];
    if (containers.length === 0) {
      containers = [...document.querySelectorAll("h1,h2,h3,p,li,dt,dd")];
    }

    const rejectedContainer = (element) => {
      if (
        !element
        || element.closest(
          "#homeboard-page-scan-root,nav,footer,script,style,noscript,"
          + "form,button,input,textarea,select,option,[hidden],[aria-hidden=\"true\"]"
        )
        || isRecommendationElement(element, roots)
        || isListingCard(element)
      ) return true;
      const style = getComputedStyle(element);
      return style.display === "none"
        || style.visibility === "hidden"
        || Number(style.opacity) === 0;
    };

    for (const container of containers) {
      if (rejectedContainer(container)) continue;
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();
      while (textNode) {
        if (!seenTextNodes.has(textNode)) {
          seenTextNodes.add(textNode);
          const rawText = textNode.nodeValue || "";
          const sentencePattern = /[^.!?]+(?:[.!?]+(?=\s|$)|$)/g;
          for (const match of rawText.matchAll(sentencePattern)) {
            const rawSentence = match[0] || "";
            const leadingSpace = rawSentence.length - rawSentence.trimStart().length;
            const sentence = rawSentence.trim();
            if (
              sentence.length < 4
              || sentence.length > 320
              || recommendationPattern.test(sentence)
            ) continue;
            const start = (match.index || 0) + leadingSpace;
            const end = start + sentence.length;
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, end);
            if (range.getClientRects().length > 0) {
              ranges.push(range);
            }
            if (ranges.length >= 56) return ranges;
          }
        }
        textNode = walker.nextNode();
      }
    }
    return ranges;
  }

  function createPageScanUI({ compact = false, pillPicker = false } = {}) {
    document.querySelector("#homeboard-page-scan-root")?.remove();

    const host = document.createElement("div");
    host.id = "homeboard-page-scan-root";
    host.setAttribute("aria-live", "polite");
    host.classList.toggle("compact", compact);
    host.classList.toggle("mobile-pills", pillPicker);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          pointer-events: none;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
          color: #fff3e5;
        }
        * { box-sizing: border-box; }
        .highlight-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }
        :host(.compact) .highlight-layer {
          display: none;
        }
        :host(.mobile-pills) .highlight-layer {
          display: none;
        }
        .sentence-highlight {
          position: fixed;
          border-bottom: 2px solid rgba(61, 80, 74, 0.96);
          border-radius: 3px;
          background: rgba(249, 226, 205, 0.32);
          box-shadow:
            0 0 0 2px rgba(249, 226, 205, 0.1),
            0 0 15px rgba(61, 80, 74, 0.18);
          transition: opacity 100ms ease;
        }
        .scan-tag {
          position: fixed;
          top: max(12px, env(safe-area-inset-top));
          right: 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          max-width: calc(100vw - 24px);
          padding: 9px 13px;
          border: 1px solid rgba(249, 226, 205, 0.46);
          border-radius: 999px;
          background: rgba(61, 80, 74, 0.95);
          box-shadow:
            0 10px 30px rgba(36, 49, 41, 0.28),
            0 0 22px rgba(249, 226, 205, 0.14);
          -webkit-backdrop-filter: blur(18px);
          backdrop-filter: blur(18px);
          pointer-events: none;
          font-size: 12px;
          line-height: 1;
        }
        .scan-dot {
          width: 8px;
          height: 8px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: #f9e2cd;
          box-shadow:
            0 0 0 4px rgba(249, 226, 205, 0.14),
            0 0 14px rgba(249, 226, 205, 0.62);
          animation: pulse 700ms ease-in-out infinite alternate;
        }
        .scan-brand { font-weight: 800; }
        .scan-phase {
          overflow: hidden;
          color: rgba(231, 218, 206, 0.74);
          font-weight: 600;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .complete-card {
          position: fixed;
          right: 12px;
          bottom: max(12px, env(safe-area-inset-bottom));
          left: 12px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 11px;
          max-width: 520px;
          margin: 0 auto;
          padding: 12px 12px 12px 15px;
          border: 1px solid rgba(146, 167, 158, 0.7);
          border-radius: 18px;
          background: rgba(61, 80, 74, 0.97);
          box-shadow:
            0 18px 46px rgba(36, 49, 41, 0.34),
            0 0 25px rgba(249, 226, 205, 0.12);
          -webkit-backdrop-filter: blur(20px);
          backdrop-filter: blur(20px);
          pointer-events: auto;
        }
        :host(.compact) .complete-card {
          right: 20px;
          bottom: 20px;
          left: auto;
          width: min(470px, calc(100vw - 40px));
          margin: 0;
        }
        :host(.mobile-pills) .scan-tag {
          top: auto;
          right: 12px;
          bottom: max(12px, env(safe-area-inset-bottom));
          min-height: 34px;
          padding: 8px 12px;
        }
        :host(.mobile-pills) .complete-card {
          right: 10px;
          bottom: max(10px, env(safe-area-inset-bottom));
          left: 10px;
          grid-template-columns: minmax(0, 1fr);
          gap: 8px;
          width: auto;
          max-width: 520px;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
          transition:
            opacity 150ms ease,
            transform 150ms ease,
            visibility 0s linear;
          will-change: opacity, transform;
        }
        :host(.mobile-pills.carousel-collapsed) .complete-card,
        :host(.mobile-pills.review-open) .complete-card {
          visibility: hidden;
          pointer-events: none;
          opacity: 0;
          transform: translateY(10px) scale(0.97);
          transition-delay: 0s, 0s, 150ms;
        }
        :host(.mobile-pills.scan-failed) .complete-card {
          padding: 10px;
          border: 1px solid rgba(146, 167, 158, 0.7);
          border-radius: 18px;
          background: rgba(61, 80, 74, 0.97);
          box-shadow: 0 18px 46px rgba(36, 49, 41, 0.34);
        }
        .complete-source {
          margin-bottom: 4px;
          display: block;
          overflow: hidden;
          color: rgba(249, 226, 205, 0.58);
          font-size: 8px;
          font-weight: 850;
          letter-spacing: 0.11em;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .complete-copy {
          min-width: 0;
        }
        .complete-copy strong {
          display: block;
          font-size: 13px;
        }
        .complete-copy span {
          display: block;
          margin-top: 3px;
          overflow: hidden;
          color: rgba(231, 218, 206, 0.7);
          font-size: 11px;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        :host(.mobile-pills) .complete-copy {
          display: none;
        }
        :host(.mobile-pills.scan-failed) .complete-copy {
          display: block;
        }
        .capture-pills {
          display: none;
        }
        :host(.mobile-pills) .capture-pills {
          --listing-pill-width: min(300px, calc(100vw - 68px));
          grid-column: 1;
          display: flex;
          box-sizing: border-box;
          gap: 10px;
          width: 100%;
          padding: 4px calc((100% - var(--listing-pill-width)) / 2) 6px;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scroll-padding-inline: calc((100% - var(--listing-pill-width)) / 2);
          scrollbar-width: none;
          scroll-snap-type: x mandatory;
          touch-action: pan-x;
          -webkit-overflow-scrolling: touch;
        }
        :host(.mobile-pills) .capture-pills::-webkit-scrollbar {
          display: none;
        }
        .listing-pill {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          flex: 0 0 var(--listing-pill-width);
          gap: 4px 12px;
          min-width: 0;
          min-height: 58px;
          padding: 10px 14px;
          border: 1px solid rgba(249, 226, 205, 0.34);
          border-radius: 19px;
          background:
            linear-gradient(145deg, rgba(75, 97, 89, 0.98), rgba(49, 68, 62, 0.98));
          box-shadow:
            0 10px 28px rgba(24, 34, 29, 0.30),
            inset 0 1px rgba(255, 255, 255, 0.05);
          -webkit-backdrop-filter: blur(18px);
          backdrop-filter: blur(18px);
          color: #fff3e5;
          text-align: left;
          scroll-snap-align: center;
          scroll-snap-stop: always;
          cursor: pointer;
          opacity: 0.58;
          transform: scale(0.94);
          transition:
            opacity 160ms ease,
            transform 160ms ease,
            border-color 160ms ease,
            background 160ms ease;
        }
        .listing-pill.carousel-active {
          border-color: rgba(249, 226, 205, 0.58);
          opacity: 1;
          transform: scale(1);
        }
        .listing-pill:active {
          background:
            linear-gradient(145deg, rgba(83, 106, 98, 0.99), rgba(55, 75, 68, 0.99));
          transform: scale(0.975);
        }
        .listing-pill:disabled {
          cursor: wait;
          opacity: 0.52;
        }
        .listing-pill.saving,
        .listing-pill.saved {
          border-color: rgba(249, 226, 205, 0.82);
          background: rgba(61, 80, 74, 0.99);
          opacity: 1;
        }
        .pill-copy {
          min-width: 0;
        }
        .pill-title,
        .pill-facts {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pill-title {
          color: #f9e2cd;
          font-size: 12px;
          font-weight: 850;
          letter-spacing: -0.01em;
        }
        .pill-facts {
          margin-top: 3px;
          color: rgba(255, 243, 229, 0.78);
          font-size: 10.5px;
          font-weight: 650;
        }
        .pill-price {
          color: #fff3e5;
          font-size: 14px;
          font-weight: 850;
          letter-spacing: -0.02em;
          white-space: nowrap;
        }
        .listing-pill.saved .pill-price {
          font-size: 12px;
        }
        .listing-pill.edit-pill {
          border-style: dashed;
          background:
            linear-gradient(145deg, rgba(69, 88, 82, 0.96), rgba(44, 60, 55, 0.96));
        }
        .listing-pill.edit-pill .pill-title {
          color: #fff3e5;
        }
        .listing-pill.edit-pill .pill-price {
          color: #f9e2cd;
          font-size: 12px;
        }
        .collapsed-tab {
          display: none;
        }
        :host(.mobile-pills) .collapsed-tab {
          position: fixed;
          right: 0;
          bottom: max(12px, env(safe-area-inset-bottom));
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 34px;
          padding: 0 10px 0 12px;
          border: 1px solid rgba(249, 226, 205, 0.38);
          border-right: 0;
          border-radius: 17px 0 0 17px;
          background: rgba(61, 80, 74, 0.96);
          box-shadow: 0 8px 24px rgba(24, 34, 29, 0.28);
          -webkit-backdrop-filter: blur(18px);
          backdrop-filter: blur(18px);
          color: #f9e2cd;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: -0.01em;
          pointer-events: none;
          visibility: hidden;
          opacity: 0;
          transform: translateX(8px);
          transition:
            opacity 150ms ease,
            transform 150ms ease,
            visibility 0s linear 150ms;
        }
        :host(.mobile-pills.carousel-collapsed:not(.review-open):not(.scan-failed)) .collapsed-tab {
          pointer-events: auto;
          visibility: visible;
          opacity: 1;
          transform: translateX(0);
          transition-delay: 0s;
        }
        .collapsed-tab-chevron {
          font-size: 13px;
          line-height: 1;
        }
        :host(.mobile-pills) .review-button.mobile-hidden {
          display: none;
        }
        :host(.mobile-pills.scan-failed) .review-button {
          display: block;
        }
        :host(.mobile-pills) .complete-card .close-button {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          clip-path: inset(50%);
          overflow: hidden;
          white-space: nowrap;
        }
        button {
          border: 0;
          font: inherit;
          -webkit-tap-highlight-color: transparent;
        }
        .review-button,
        .save-button {
          min-height: 38px;
          padding: 0 14px;
          border-radius: 12px;
          background: linear-gradient(135deg, #f9e2cd, #e4cdb5);
          color: #243129;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        .close-button,
        .panel-close {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(49, 68, 62, 0.9);
          color: rgba(255, 243, 229, 0.82);
          font-size: 19px;
          cursor: pointer;
        }
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(36, 49, 41, 0.38);
          -webkit-backdrop-filter: blur(2px);
          backdrop-filter: blur(2px);
          pointer-events: auto;
        }
        .review-panel {
          position: fixed;
          right: 10px;
          bottom: max(10px, env(safe-area-inset-bottom));
          left: 10px;
          max-width: 520px;
          max-height: calc(100vh - 20px);
          margin: 0 auto;
          overflow-y: auto;
          border: 1px solid rgba(146, 167, 158, 0.68);
          border-radius: 24px;
          background:
            radial-gradient(circle at 92% 0%, rgba(249, 226, 205, 0.12), transparent 38%),
            #3d504a;
          box-shadow: 0 24px 70px rgba(36, 49, 41, 0.48);
          pointer-events: auto;
          -webkit-overflow-scrolling: touch;
        }
        :host(.compact) .review-panel {
          right: 20px;
          bottom: 20px;
          left: auto;
          width: min(500px, calc(100vw - 40px));
          max-height: calc(100vh - 40px);
          margin: 0;
        }
        .panel-header {
          position: sticky;
          top: 0;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid rgba(146, 167, 158, 0.34);
          background: rgba(61, 80, 74, 0.95);
          -webkit-backdrop-filter: blur(18px);
          backdrop-filter: blur(18px);
        }
        .panel-mark {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border: 1px solid rgba(249, 226, 205, 0.42);
          border-radius: 12px;
          background: rgba(249, 226, 205, 0.12);
          color: #f9e2cd;
          font-size: 17px;
          font-weight: 900;
        }
        .panel-mark svg { width: 24px; height: 25px; display: block; }
        .panel-heading {
          min-width: 0;
          flex: 1;
        }
        .panel-heading strong {
          display: block;
          font-size: 15px;
        }
        .panel-heading small {
          margin-bottom: 3px;
          display: block;
          overflow: hidden;
          color: rgba(249, 226, 205, 0.58);
          font-size: 8px;
          font-weight: 850;
          letter-spacing: 0.11em;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .panel-heading span {
          display: block;
          margin-top: 3px;
          color: rgba(231, 218, 206, 0.7);
          font-size: 11px;
        }
        .panel-body {
          display: grid;
          gap: 14px;
          padding: 16px;
        }
        .option-list {
          display: grid;
          gap: 8px;
        }
        .option-button {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 4px 10px;
          width: 100%;
          padding: 11px 12px;
          border: 1px solid rgba(146, 167, 158, 0.42);
          border-radius: 13px;
          background: rgba(75, 97, 89, 0.76);
          color: #fff3e5;
          text-align: left;
          cursor: pointer;
        }
        .option-button.selected {
          border-color: rgba(249, 226, 205, 0.7);
          background: rgba(249, 226, 205, 0.12);
        }
        .option-button span {
          color: #f9e2cd;
          font-weight: 800;
        }
        .field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 11px;
        }
        label {
          display: grid;
          gap: 6px;
          color: rgba(231, 218, 206, 0.76);
          font-size: 11px;
          font-weight: 700;
        }
        label.wide { grid-column: 1 / -1; }
        input {
          width: 100%;
          min-height: 43px;
          padding: 0 12px;
          border: 1px solid rgba(146, 167, 158, 0.5);
          border-radius: 12px;
          outline: none;
          background: rgba(49, 68, 62, 0.72);
          color: #fff3e5;
          font: 500 14px/1 -apple-system, BlinkMacSystemFont, sans-serif;
        }
        input:focus {
          border-color: rgba(249, 226, 205, 0.74);
          box-shadow: 0 0 0 3px rgba(249, 226, 205, 0.12);
        }
        input.missing {
          border-color: rgba(255, 180, 171, 0.78);
        }
        .panel-note {
          margin: 0;
          color: rgba(231, 218, 206, 0.68);
          font-size: 11px;
          line-height: 1.4;
        }
        .panel-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
          padding: 0 16px 16px;
        }
        .cancel-button {
          min-height: 38px;
          padding: 0 13px;
          border-radius: 12px;
          background: rgba(49, 68, 62, 0.86);
          color: rgba(255, 243, 229, 0.84);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .save-button:disabled {
          cursor: wait;
          opacity: 0.55;
        }
        .hidden { display: none !important; }
        @keyframes pulse {
          from { opacity: 0.55; transform: scale(0.86); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (max-width: 390px) {
          .complete-card {
            grid-template-columns: minmax(0, 1fr) auto;
          }
          .complete-card .close-button { display: none; }
          .field-grid { grid-template-columns: 1fr; }
          label.wide { grid-column: auto; }
        }
        @media (prefers-reduced-motion: reduce) {
          .scan-dot { animation: none; }
          .sentence-highlight { transition: none; }
          :host(.mobile-pills) .complete-card,
          :host(.mobile-pills) .collapsed-tab { transition: none; }
        }
      </style>
      <div class="highlight-layer" id="highlightLayer"></div>
      <div class="scan-tag" id="scanTag" role="status">
        <span class="scan-dot"></span>
        <span class="scan-brand">Homeboard</span>
        <span class="scan-phase" id="scanPhase">Reading this listing</span>
      </div>
      <section class="complete-card hidden" id="completeCard">
        <div class="complete-copy">
          <small class="complete-source" id="completeSource">HOMEBOARD · RENTAL LISTING</small>
          <strong id="completeTitle">Listing ready</strong>
          <span id="completeSummary">Review the details Homeboard found.</span>
        </div>
        <div class="capture-pills hidden" id="capturePills" aria-label="Listings ready to save"></div>
        <button class="review-button" id="reviewButton" type="button">Review and save</button>
        <button class="close-button" id="dismissButton" type="button" aria-label="Dismiss Homeboard">×</button>
      </section>
      <button class="collapsed-tab" id="collapsedTab" type="button" aria-label="Show Homeboard listing">
        <span id="collapsedLabel">Listing</span>
        <span class="collapsed-tab-chevron" aria-hidden="true">‹</span>
      </button>
      <div class="backdrop hidden" id="backdrop"></div>
      <section class="review-panel hidden" id="reviewPanel" role="dialog" aria-modal="true" aria-label="Review Homeboard listing details">
        <header class="panel-header">
          <div class="panel-mark" aria-hidden="true">
            <svg viewBox="0 0 48 49" fill="none"><path d="M3 3h12v12H3V3Zm30 0h12v12H33V3ZM3 34h12v12H3V34Zm30 0h12v12H33V34ZM18 4h12v14l-6 6-6-6V4Zm6 17 12 11h-5v14h-6v-8h-3v8h-6V32h-4l12-11Z" fill="currentColor"/></svg>
          </div>
          <div class="panel-heading">
            <small id="panelSource">HOMEBOARD · REVIEW BEFORE SAVING</small>
            <strong>Review listing</strong>
            <span>Confirm the exact rental before saving.</span>
          </div>
          <button class="panel-close" id="panelClose" type="button" aria-label="Close review">×</button>
        </header>
        <div class="panel-body">
          <div class="option-list hidden" id="optionList"></div>
          <div class="field-grid">
            <label class="wide">Full address
              <input id="fieldAddress" autocomplete="street-address" placeholder="Number, street, city, state, postal code">
            </label>
            <label>Unit
              <input id="fieldUnit" autocapitalize="characters" placeholder="3B">
            </label>
            <label>Neighborhood
              <input id="fieldNeighborhood" placeholder="Williamsburg">
            </label>
            <label>Monthly rent
              <input id="fieldPrice" inputmode="decimal" placeholder="$4,800">
            </label>
            <label>Bedrooms
              <input id="fieldBedrooms" inputmode="decimal" placeholder="3">
            </label>
            <label>Bathrooms
              <input id="fieldBathrooms" inputmode="decimal" placeholder="2">
            </label>
          </div>
          <p class="panel-note" id="panelNote">These details came from the main listing, not nearby or similar cards.</p>
        </div>
        <footer class="panel-footer">
          <button class="cancel-button" id="cancelReview" type="button">Not now</button>
          <button class="save-button" id="saveButton" type="button">Save to Homeboard</button>
        </footer>
      </section>
    `;
    document.documentElement.appendChild(host);

    const byID = (id) => shadow.querySelector(`#${id}`);
    const hideReview = () => {
      byID("backdrop").classList.add("hidden");
      byID("reviewPanel").classList.add("hidden");
      host.classList.remove("review-open");
      host.dispatchEvent(new CustomEvent("homeboard.reviewClosed"));
    };
    byID("dismissButton").addEventListener("click", () => host.remove());
    byID("panelClose").addEventListener("click", hideReview);
    byID("cancelReview").addEventListener("click", hideReview);
    byID("backdrop").addEventListener("click", hideReview);

    const ui = {
      host,
      shadow,
      phase: byID("scanPhase"),
      tag: byID("scanTag"),
      highlightLayer: byID("highlightLayer"),
      completeCard: byID("completeCard"),
      completeTitle: byID("completeTitle"),
      completeSource: byID("completeSource"),
      completeSummary: byID("completeSummary"),
      capturePills: byID("capturePills"),
      collapsedTab: byID("collapsedTab"),
      collapsedLabel: byID("collapsedLabel"),
      reviewButton: byID("reviewButton"),
      backdrop: byID("backdrop"),
      reviewPanel: byID("reviewPanel"),
      optionList: byID("optionList"),
      panelSource: byID("panelSource"),
      panelNote: byID("panelNote"),
      saveButton: byID("saveButton"),
      fields: {
        address: byID("fieldAddress"),
        unit: byID("fieldUnit"),
        neighborhood: byID("fieldNeighborhood"),
        price: byID("fieldPrice"),
        bedrooms: byID("fieldBedrooms"),
        bathrooms: byID("fieldBathrooms")
      },
      hideReview
    };
    configureMobileSwipeDismiss(ui, pillPicker);
    return ui;
  }

  function configureMobileSwipeDismiss(ui, enabled) {
    if (!enabled) return;
    let pointerID = null;
    let startX = 0;
    let startY = 0;
    let verticalGesture = false;

    const reset = () => {
      pointerID = null;
      verticalGesture = false;
      ui.completeCard.style.removeProperty("transform");
      ui.completeCard.style.removeProperty("opacity");
    };

    ui.capturePills.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerID = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      verticalGesture = false;
    });

    ui.capturePills.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerID) return;
      const deltaX = event.clientX - startX;
      const deltaY = Math.max(0, event.clientY - startY);
      if (!verticalGesture && deltaY > 8 && deltaY > Math.abs(deltaX) * 1.15) {
        verticalGesture = true;
        ui.capturePills.setPointerCapture?.(event.pointerId);
      }
      if (!verticalGesture) return;
      event.preventDefault();
      ui.completeCard.style.transform = `translateY(${deltaY}px)`;
      ui.completeCard.style.opacity = String(Math.max(0.22, 1 - deltaY / 150));
    });

    const finish = (event) => {
      if (event.pointerId !== pointerID) return;
      const deltaX = event.clientX - startX;
      const deltaY = Math.max(0, event.clientY - startY);
      if (verticalGesture && deltaY > 56 && deltaY > Math.abs(deltaX) * 1.15) {
        ui.completeCard.style.transform = "translateY(120px)";
        ui.completeCard.style.opacity = "0";
        globalThis.setTimeout(() => ui.host.remove(), 150);
        pointerID = null;
        return;
      }
      reset();
    };

    ui.capturePills.addEventListener("pointerup", finish);
    ui.capturePills.addEventListener("pointercancel", reset);
    ui.capturePills.setAttribute(
      "aria-label",
      "Listings ready to save. Swipe down to dismiss."
    );
  }

  const scanDelay = (milliseconds) => new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

  function numericField(element) {
    const raw = element.value.replace(/[^0-9.]/g, "");
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function formatScanNumber(value) {
    if (!Number.isFinite(value)) return "";
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 1
    }).format(value);
  }

  function listingSummary(value) {
    const facts = [
      value.address,
      Number.isFinite(value.price) ? `$${formatScanNumber(value.price)}` : null,
      Number.isFinite(value.bedrooms) ? `${formatScanNumber(value.bedrooms)} bd` : null,
      Number.isFinite(value.bathrooms) ? `${formatScanNumber(value.bathrooms)} ba` : null
    ].filter(Boolean);
    return facts.join(" · ") || "Review the details Homeboard found.";
  }

  function missingRequiredFields(value) {
    return ["address", "price", "bedrooms", "bathrooms"].filter((key) =>
      value[key] === null || value[key] === undefined || value[key] === ""
    );
  }

  function bedroomLabel(value) {
    if (!Number.isFinite(value)) return null;
    if (value === 0) return "Studio";
    return `${formatScanNumber(value)} ${value === 1 ? "bed" : "beds"}`;
  }

  function bathroomLabel(value) {
    if (!Number.isFinite(value)) return null;
    return `${formatScanNumber(value)} ${value === 1 ? "bath" : "baths"}`;
  }

  function mobileListingTitle(candidate, option = null, multiple = false) {
    const address = cleanText(candidate.address || candidate.pageTitle);
    const unit = cleanText(candidate.unit || option?.unit);
    const optionLabel = cleanText(option?.label);
    const detail = unit
      ? (/^unit\b/i.test(unit) ? unit : `Unit ${unit}`)
      : optionLabel;
    if (multiple && detail) return detail;
    if (address && detail && !address.toLowerCase().includes(detail.toLowerCase())) {
      return `${address} · ${detail}`;
    }
    if (address) return address;
    if (detail) return detail;
    return multiple ? "Available listing" : "This listing";
  }

  function populateMobileListingPill(button, capture, titleText, trailingText = null) {
    const copy = document.createElement("span");
    copy.className = "pill-copy";
    const title = document.createElement("span");
    title.className = "pill-title";
    title.textContent = titleText;
    const facts = document.createElement("span");
    facts.className = "pill-facts";
    facts.textContent = [
      bedroomLabel(capture.bedrooms),
      bathroomLabel(capture.bathrooms),
      Number.isFinite(capture.squareFeet)
        ? `${formatScanNumber(capture.squareFeet)} sq ft`
        : null
    ].filter(Boolean).join(" · ") || "A few details need review";
    copy.append(title, facts);

    const price = document.createElement("span");
    price.className = "pill-price";
    price.textContent = trailingText || (Number.isFinite(capture.price)
      ? `$${formatScanNumber(capture.price)}`
      : "Review →");
    button.replaceChildren(copy, price);
    return { title, facts, price };
  }

  function showMobileSavedPill(ui, capture) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "listing-pill saved";
    button.disabled = true;
    populateMobileListingPill(
      button,
      capture,
      mobileListingTitle(capture),
      "Saved"
    );
    ui.capturePills.replaceChildren(button);
    ui.capturePills.classList.remove("hidden");
  }

  function listingSource(value) {
    const explicit = cleanText(value?.sourceName);
    if (explicit) return explicit;
    try {
      const hostname = new URL(value?.url || window.location.href).hostname;
      return hostname.replace(/^www\./i, "");
    } catch {
      return "Rental listing";
    }
  }

  function showSentenceHighlight(ui, range) {
    ui.highlightLayer.replaceChildren();
    for (const rect of range.getClientRects()) {
      if (rect.width < 2 || rect.height < 2) continue;
      const line = document.createElement("div");
      line.className = "sentence-highlight";
      line.style.left = `${Math.max(rect.left - 2, 0)}px`;
      line.style.top = `${Math.max(rect.top - 1, 0)}px`;
      line.style.width = `${Math.min(rect.width + 4, window.innerWidth)}px`;
      line.style.height = `${rect.height + 2}px`;
      ui.highlightLayer.appendChild(line);
    }
  }

  async function animateSentenceRanges(ui, ranges) {
    if (ranges.length === 0) {
      await scanDelay(1_100);
      return;
    }
    const millisecondsPerSentence = Math.max(
      90,
      Math.min(180, Math.round(4_300 / ranges.length))
    );

    for (const [index, range] of ranges.entries()) {
      if (!ui.host.isConnected) return;
      const ancestor = range.commonAncestorContainer.parentElement;
      if (!ancestor?.isConnected) continue;
      let rect = range.getBoundingClientRect();
      const outsideReadingArea = rect.top < 76 || rect.bottom > window.innerHeight - 72;
      if (outsideReadingArea) {
        const nextTop = Math.max(
          window.scrollY + rect.top - Math.round(window.innerHeight * 0.36),
          0
        );
        window.scrollTo({ top: nextTop, behavior: "smooth" });
        await scanDelay(170);
        rect = range.getBoundingClientRect();
      }
      if (rect.width > 1 && rect.height > 1) {
        showSentenceHighlight(ui, range);
      }
      ui.phase.textContent = `Reading ${index + 1} of ${ranges.length}`;
      await scanDelay(millisecondsPerSentence);
    }
  }

  async function analyzePageCapture(capture, { allowSystemModel = true } = {}) {
    try {
      const response = await browser.runtime.sendMessage({
        type: "homeboard.analyzeListing",
        capture: {
          ...capture,
          allowSystemModel
        }
      });
      if (response?.analyzed && response.analysis) return response.analysis;
    } catch {
      // Deterministic extraction remains available if native analysis is unavailable.
    }
    return {
      scope: capture.listingScope || "unknown",
      facts: capture,
      options: capture.unitOptions || [],
      missingFields: ["address", "price", "bedrooms", "bathrooms"]
        .filter((key) => capture[key] === null || capture[key] === undefined || capture[key] === ""),
      message: "Review the details Homeboard found.",
      usedOnDeviceModel: false
    };
  }

  async function saveListingCapture(capture) {
    const response = await browser.runtime.sendMessage({
      type: "homeboard.saveListing",
      capture
    });
    if (!response?.saved) {
      throw new Error(response?.error || "Homeboard could not save this rental.");
    }
    return response;
  }

  function mergedCapture(capture, analysis) {
    const resolvedFacts = Object.fromEntries(
      Object.entries(analysis?.facts || {})
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
    );
    if (Array.isArray(resolvedFacts.insights)) {
      resolvedFacts.modelInsights = resolvedFacts.insights;
    }
    return {
      ...capture,
      ...resolvedFacts,
      listingScope: analysis?.scope || capture.listingScope
    };
  }

  function resolvedUnitOptions(capture, analysis) {
    // An empty analyzed list is meaningful: do not resurrect rejected candidates.
    return Array.isArray(analysis?.options)
      ? analysis.options
      : (Array.isArray(capture?.unitOptions) ? capture.unitOptions : []);
  }

  function listingCandidates(capture, analysis) {
    const baseCapture = mergedCapture(capture, analysis);
    const options = resolvedUnitOptions(capture, analysis);
    if (options.length > 0) {
      return options.map((option) => ({
        option,
        capture: {
          ...baseCapture,
          unit: option.unit || null,
          price: option.price ?? null,
          bedrooms: option.bedrooms ?? null,
          bathrooms: option.bathrooms ?? null,
          squareFeet: option.squareFeet ?? null,
          availableDate: option.availableDate ?? null,
          listingScope: "unit",
          unitOptions: []
        }
      }));
    }
    return baseCapture.listingScope === "building" ? [] : [{ option: null, capture: baseCapture }];
  }

  function configureReview(ui, originalCapture, analysis) {
    let groundedCapture = originalCapture;
    let latestAnalysis = analysis;
    let reviewCapture = mergedCapture(groundedCapture, latestAnalysis);
    let groundedOptions = resolvedUnitOptions(groundedCapture, latestAnalysis);
    let selectedExactOption = groundedOptions.length === 0;
    let didSelectOption = false;
    let reviewOpened = false;
    const editedFields = new Set();
    const fieldValues = () => ({
      address: reviewCapture.address || "",
      unit: reviewCapture.unit || "",
      neighborhood: reviewCapture.neighborhood || reviewCapture.city || "",
      price: Number.isFinite(reviewCapture.price)
        ? `$${formatScanNumber(reviewCapture.price)}`
        : "",
      bedrooms: Number.isFinite(reviewCapture.bedrooms)
        ? formatScanNumber(reviewCapture.bedrooms)
        : "",
      bathrooms: Number.isFinite(reviewCapture.bathrooms)
        ? formatScanNumber(reviewCapture.bathrooms)
        : ""
    });
    const fillFields = ({ preserveUserInput = false } = {}) => {
      Object.entries(fieldValues()).forEach(([key, value]) => {
        const field = ui.fields[key];
        if (preserveUserInput && (editedFields.has(key) || cleanText(field.value))) return;
        field.value = value;
      });
    };
    fillFields();
    Object.entries(ui.fields).forEach(([key, field]) => {
      field.addEventListener("input", () => editedFields.add(key));
    });

    const renderOptions = (options, { replace = false } = {}) => {
      if (replace) ui.optionList.replaceChildren();
      if (options.length === 0) {
        ui.optionList.classList.add("hidden");
        selectedExactOption = true;
        return;
      }
      if (ui.optionList.childElementCount > 0) return;
      selectedExactOption = false;
      ui.optionList.classList.remove("hidden");
      options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "option-button";
        const label = document.createElement("strong");
        label.textContent = option.label || option.unit || "Available home";
        const price = document.createElement("span");
        price.textContent = Number.isFinite(option.price)
          ? `$${formatScanNumber(option.price)}`
          : "Review";
        button.append(label, price);
        button.addEventListener("click", () => {
          selectedExactOption = true;
          didSelectOption = true;
          ui.optionList.querySelectorAll(".option-button").forEach((candidate) => {
            candidate.classList.toggle("selected", candidate === button);
          });
          reviewCapture = {
            ...reviewCapture,
            unit: option.unit || null,
            price: option.price ?? null,
            bedrooms: option.bedrooms ?? null,
            bathrooms: option.bathrooms ?? null,
            squareFeet: option.squareFeet ?? null,
            listingScope: "unit"
          };
          fillFields();
        });
        ui.optionList.appendChild(button);
      });
      ui.panelNote.textContent =
        "This is a building page. Choose the exact unit before saving.";
    };
    renderOptions(groundedOptions);
    if (groundedOptions.length === 0 && analysis?.missingFields?.length) {
      ui.panelNote.textContent =
        "Homeboard left uncertain details blank. Confirm them before saving.";
    }

    const showReview = () => {
      reviewOpened = true;
      ui.host.classList.add("review-open");
      ui.backdrop.classList.remove("hidden");
      ui.reviewPanel.classList.remove("hidden");
      ui.fields.address.focus({ preventScroll: true });
    };
    ui.reviewButton.addEventListener("click", showReview);
    ui.shadow.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!ui.reviewPanel.classList.contains("hidden")) {
          ui.hideReview();
          ui.reviewButton.focus({ preventScroll: true });
        } else {
          ui.host.remove();
        }
      }
      if (
        event.key === "Enter"
        && (event.metaKey || event.ctrlKey)
        && !ui.reviewPanel.classList.contains("hidden")
        && !ui.saveButton.disabled
      ) {
        event.preventDefault();
        ui.saveButton.click();
      }
    });

    ui.saveButton.addEventListener("click", async () => {
      if (!isCaptureCurrent(reviewCapture)) {
        synchronizePageNavigation();
        return;
      }
      if (!selectedExactOption) {
        ui.panelNote.textContent =
          "Choose the exact unit or floor plan before saving.";
        return;
      }
      const reviewed = {
        ...reviewCapture,
        address: cleanText(ui.fields.address.value),
        unit: cleanText(ui.fields.unit.value)?.toUpperCase() || null,
        neighborhood: cleanText(ui.fields.neighborhood.value),
        price: numericField(ui.fields.price),
        bedrooms: numericField(ui.fields.bedrooms),
        bathrooms: numericField(ui.fields.bathrooms)
      };
      const missing = missingRequiredFields(reviewed);
      Object.entries(ui.fields).forEach(([key, field]) => {
        field.classList.toggle("missing", missing.includes(key));
      });
      if (missing.length > 0) {
        ui.panelNote.textContent =
          `Confirm ${missing.join(", ")} before saving.`;
        return;
      }

      ui.saveButton.disabled = true;
      ui.saveButton.textContent = "Saving…";
      ui.hideReview();
      ui.completeTitle.textContent = "Saving to Homeboard…";
      ui.completeSummary.textContent = "You can keep browsing while Homeboard finishes the save.";
      ui.reviewButton.textContent = "Saving…";
      ui.reviewButton.disabled = true;
      try {
        const response = await saveListingCapture(reviewed);
        ui.hideReview();
        ui.completeTitle.textContent = "Saved to Homeboard";
        ui.completeSummary.textContent = response.synced
          ? "This reviewed listing is now on the same board on every device."
          : "Saved safely. Homeboard will finish syncing in the background.";
        ui.reviewButton.textContent = "Saved";
        ui.reviewButton.disabled = true;
        if (ui.host.classList.contains("mobile-pills")) {
          showMobileSavedPill(ui, reviewed);
          globalThis.setTimeout(() => ui.host.remove(), SAVE_CONFIRMATION_DELAY_MS);
        }
      } catch (error) {
        ui.saveButton.disabled = false;
        ui.saveButton.textContent = "Try saving again";
        ui.reviewButton.textContent = "Review and save";
        ui.reviewButton.disabled = false;
        ui.panelNote.textContent = error instanceof Error
          ? error.message
          : "Homeboard could not save this rental.";
        showReview();
      }
    });

    return {
      showReview,
      get isEditing() { return reviewOpened || didSelectOption; },
      prepareCapture(capture) {
        reviewCapture = { ...capture };
        selectedExactOption = true;
        didSelectOption = true;
        ui.optionList.classList.add("hidden");
        ui.panelNote.textContent = "Confirm the details Homeboard could not verify.";
        fillFields();
      },
      applyAnalysis(nextCapture, nextAnalysis) {
        if (reviewOpened || didSelectOption) return;
        groundedCapture = nextCapture;
        latestAnalysis = nextAnalysis;
        groundedOptions = resolvedUnitOptions(nextCapture, nextAnalysis);
        reviewCapture = mergedCapture(groundedCapture, latestAnalysis);
        selectedExactOption = groundedOptions.length === 0;
        renderOptions(groundedOptions, { replace: true });
        fillFields();
      },
      applyEnhancedAnalysis(enhancedAnalysis) {
        latestAnalysis = enhancedAnalysis;
        const enhancedCapture = mergedCapture(groundedCapture, enhancedAnalysis);
        if (didSelectOption) {
          const nonUnitFields = [
            "address", "city", "neighborhood", "imageURL", "summary",
            "amenities", "modelInsights"
          ];
          for (const key of nonUnitFields) {
            if (enhancedCapture[key] !== null && enhancedCapture[key] !== undefined) {
              reviewCapture[key] = enhancedCapture[key];
            }
          }
        } else {
          reviewCapture = { ...reviewCapture, ...enhancedCapture };
        }
        fillFields({ preserveUserInput: reviewOpened });
        if (!reviewOpened && !didSelectOption) {
          groundedOptions = resolvedUnitOptions(groundedCapture, enhancedAnalysis);
          renderOptions(groundedOptions, { replace: true });
        }
        if (
          groundedOptions.length === 0
          && enhancedAnalysis?.missingFields?.length === 0
        ) {
          ui.panelNote.textContent = enhancedAnalysis.usedOnDeviceModel
            ? "Homeboard’s deeper check agreed with these listing details."
            : "These details came from the main listing, not nearby or similar cards.";
        }
      }
    };
  }

  function configureMobilePillPicker(ui, originalCapture, analysis, review) {
    const collapseDelay = 4_000;
    let groundedCapture = originalCapture;
    let latestAnalysis = analysis;
    let hasChosen = false;
    let carouselFrame = null;
    let collapseTimer = null;
    let pageScrollController = null;

    const clearCollapseTimer = () => {
      if (collapseTimer === null) return;
      globalThis.clearTimeout(collapseTimer);
      collapseTimer = null;
    };

    const stopListeningForPageScroll = () => {
      pageScrollController?.abort();
      pageScrollController = null;
    };

    const collapseCarousel = () => {
      clearCollapseTimer();
      stopListeningForPageScroll();
      if (
        !ui.host.isConnected
        || hasChosen
        || ui.saveButton.disabled
        || !ui.reviewPanel.classList.contains("hidden")
      ) return;
      ui.completeCard.style.removeProperty("transform");
      ui.completeCard.style.removeProperty("opacity");
      ui.host.classList.add("carousel-collapsed");
    };

    const armPageScrollCollapse = () => {
      if (pageScrollController || ui.host.classList.contains("carousel-collapsed")) return;
      pageScrollController = new AbortController();
      const onPageScroll = (event) => {
        const path = event.composedPath?.() || [];
        if (path.includes(ui.host)) return;
        collapseCarousel();
      };
      globalThis.addEventListener("scroll", onPageScroll, {
        passive: true,
        signal: pageScrollController.signal
      });
      document.addEventListener("scroll", onPageScroll, {
        capture: true,
        passive: true,
        signal: pageScrollController.signal
      });
    };

    const scheduleCollapse = ({ restart = false } = {}) => {
      if (restart) clearCollapseTimer();
      if (
        collapseTimer !== null
        || !ui.host.isConnected
        || hasChosen
        || ui.saveButton.disabled
        || !ui.reviewPanel.classList.contains("hidden")
        || ui.host.classList.contains("carousel-collapsed")
      ) return;
      armPageScrollCollapse();
      collapseTimer = globalThis.setTimeout(collapseCarousel, collapseDelay);
    };

    const expandCarousel = () => {
      if (!ui.host.isConnected || hasChosen) return;
      ui.host.classList.remove("carousel-collapsed");
      scheduleCarouselUpdate();
      scheduleCollapse({ restart: true });
    };

    const updateCenteredPill = () => {
      carouselFrame = null;
      const pills = [...ui.capturePills.querySelectorAll(".listing-pill")];
      if (pills.length === 0) return;
      const carouselRect = ui.capturePills.getBoundingClientRect();
      const carouselCenter = carouselRect.left + carouselRect.width / 2;
      const centered = pills.reduce((closest, pill) => {
        const rect = pill.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - carouselCenter);
        return !closest || distance < closest.distance ? { pill, distance } : closest;
      }, null)?.pill;
      for (const pill of pills) {
        const active = pill === centered;
        pill.classList.toggle("carousel-active", active);
        if (active) pill.setAttribute("aria-current", "true");
        else pill.removeAttribute("aria-current");
      }
    };

    const scheduleCarouselUpdate = () => {
      if (carouselFrame !== null) return;
      carouselFrame = globalThis.requestAnimationFrame(updateCenteredPill);
    };

    ui.capturePills.addEventListener("scroll", scheduleCarouselUpdate, { passive: true });
    ui.capturePills.addEventListener("pointerdown", () => {
      clearCollapseTimer();
      stopListeningForPageScroll();
    });
    ui.capturePills.addEventListener("pointerup", () => {
      scheduleCollapse({ restart: true });
    });
    ui.capturePills.addEventListener("pointercancel", () => {
      scheduleCollapse({ restart: true });
    });
    ui.capturePills.addEventListener("focusin", clearCollapseTimer);
    ui.capturePills.addEventListener("focusout", () => {
      scheduleCollapse({ restart: true });
    });
    ui.collapsedTab.addEventListener("click", expandCarousel);
    ui.host.addEventListener("homeboard.reviewClosed", () => {
      scheduleCollapse({ restart: true });
    });

    const render = (nextAnalysis) => {
      if (hasChosen || review.isEditing) return;
      if (nextAnalysis) latestAnalysis = nextAnalysis;
      const wasCollapsed = ui.host.classList.contains("carousel-collapsed");
      const baseCapture = mergedCapture(groundedCapture, latestAnalysis);
      const candidates = listingCandidates(groundedCapture, latestAnalysis);
      if (candidates.length === 0) {
        clearCollapseTimer();
        stopListeningForPageScroll();
        ui.capturePills.replaceChildren();
        ui.completeCard.classList.add("hidden");
        return;
      }
      ui.completeCard.classList.remove("hidden");
      const centeredID = ui.capturePills.querySelector('.carousel-active')?.dataset.optionId;

      ui.capturePills.replaceChildren();
      ui.capturePills.classList.remove("hidden");
      ui.reviewButton.classList.add("mobile-hidden");
      ui.completeTitle.textContent = candidates.length > 1
        ? "Choose a unit to save"
        : "Tap the listing to save";
      ui.completeSummary.textContent = baseCapture.address
        || "Homeboard found the details shown below.";
      ui.collapsedLabel.textContent = candidates.length > 1
        ? `${candidates.length} units`
        : "Listing";
      ui.collapsedTab.setAttribute(
        "aria-label",
        candidates.length > 1
          ? `Show ${candidates.length} Homeboard unit choices`
          : "Show the Homeboard listing"
      );

      for (const { option, capture } of candidates) {
        const missing = missingRequiredFields(capture);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "listing-pill";
        button.dataset.optionId = option?.id || option?.unit || "listing";
        const { title, facts, price } = populateMobileListingPill(
          button,
          capture,
          mobileListingTitle(capture, option, candidates.length > 1)
        );
        button.setAttribute(
          "aria-label",
          missing.length > 0
            ? `${title.textContent}. Review missing ${missing.join(", ")}`
            : `Save ${title.textContent}, ${facts.textContent}, ${price.textContent} to Homeboard`
        );

        button.addEventListener("click", async () => {
          if (!isCaptureCurrent(capture)) {
            synchronizePageNavigation();
            return;
          }
          if (hasChosen) return;
          hasChosen = true;
          if (missing.length > 0) {
            review.prepareCapture(capture);
            review.showReview();
            hasChosen = false;
            return;
          }

          const buttons = [...ui.capturePills.querySelectorAll(".listing-pill")];
          buttons.forEach((candidate) => { candidate.disabled = true; });
          button.classList.add("saving");
          price.textContent = "Saving…";
          ui.completeTitle.textContent = "Saving to Homeboard";
          try {
            await saveListingCapture(capture);
            button.classList.remove("saving");
            button.classList.add("saved");
            price.textContent = "Saved";
            ui.capturePills.replaceChildren(button);
            ui.completeTitle.textContent = "Saved to Homeboard";
            ui.completeSummary.textContent = listingSummary(capture);
            globalThis.setTimeout(() => ui.host.remove(), SAVE_CONFIRMATION_DELAY_MS);
          } catch (error) {
            hasChosen = false;
            buttons.forEach((candidate) => { candidate.disabled = false; });
            button.classList.remove("saving");
            price.textContent = Number.isFinite(capture.price)
              ? `$${formatScanNumber(capture.price)}`
              : "Try again →";
            ui.completeTitle.textContent = "Could not save yet. Tap to retry";
            ui.completeSummary.textContent = error instanceof Error
              ? error.message
              : "Homeboard could not save this rental.";
          }
        });
        ui.capturePills.appendChild(button);
      }

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "listing-pill edit-pill";
      editButton.dataset.optionId = "edit";
      const editContent = populateMobileListingPill(
        editButton,
        {},
        "Edit details",
        "Edit →"
      );
      editContent.facts.textContent = "Change anything before saving";
      editButton.setAttribute(
        "aria-label",
        "Edit the listing details before saving to Homeboard"
      );
      editButton.addEventListener("click", () => {
        if (!isCaptureCurrent(groundedCapture)) {
          synchronizePageNavigation();
          return;
        }
        if (hasChosen) return;
        clearCollapseTimer();
        stopListeningForPageScroll();
        ui.host.classList.remove("carousel-collapsed");
        review.showReview();
      });
      ui.capturePills.appendChild(editButton);

      ui.capturePills.scrollLeft = 0;
      if (centeredID) {
        const centered = [...ui.capturePills.children].find((pill) => pill.dataset.optionId === centeredID);
        if (centered) ui.capturePills.scrollLeft = centered.offsetLeft - (ui.capturePills.clientWidth - centered.offsetWidth) / 2;
      }
      scheduleCarouselUpdate();
      if (!wasCollapsed) scheduleCollapse();
    };

    render(analysis);
    return {
      applyAnalysis(nextCapture, nextAnalysis) {
        groundedCapture = nextCapture;
        render(nextAnalysis);
      },
      applyEnhancedAnalysis(enhancedAnalysis) {
        render(enhancedAnalysis);
      }
    };
  }

  function unitOptionSignature(capture) {
    const options = Array.isArray(capture?.unitOptions) ? capture.unitOptions : [];
    return JSON.stringify([capture?.availabilityPageEvidence, capture?.structuredUnitEvidence, options.map((option) => [
      normalizedUnitIdentifier(option?.unit),
      normalizedFloorPlanLabel(option?.label),
      option?.price ?? null,
      option?.bedrooms ?? null,
      option?.bathrooms ?? null,
      option?.squareFeet ?? null,
      cleanText(option?.availableDate)
    ])]);
  }

  async function settledPageCapture(initialCapture) {
    let capture = initialCapture;
    let previous = unitOptionSignature(capture);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 650));
      if (!isCaptureCurrent(initialCapture)) return null;
      const next = extractListing();
      const signature = unitOptionSignature(next);
      capture = next;
      if (signature === previous) break;
      previous = signature;
    }
    return capture;
  }

  function observeLiveUnitChanges(session, initialCapture, review, pillPicker) {
    if (!pillPicker || typeof MutationObserver !== "function") return;
    const buildingKey = buildingAddressKey(initialCapture.address);
    let appliedSignature = unitOptionSignature(initialCapture);
    let pendingSignature = null;
    let pendingCapture = null;
    let consecutiveMatches = 0;
    let checks = 0;
    let checkTimer = null;
    let expirationTimer = null;
    let analysisRevision = 0;

    const stop = () => {
      analysisRevision += 1;
      observer.disconnect();
      if (checkTimer !== null) globalThis.clearTimeout(checkTimer);
      if (expirationTimer !== null) globalThis.clearTimeout(expirationTimer);
      checkTimer = null;
      expirationTimer = null;
    };

    const scheduleCheck = () => {
      if (checkTimer !== null || checks >= 14) return;
      checkTimer = globalThis.setTimeout(check, 650);
    };

    const check = () => {
      checkTimer = null;
      checks += 1;
      if (
        !session.ui.host.isConnected
        || pageScanSession !== session
        || !isCaptureCurrent(initialCapture)
      ) {
        stop();
        return;
      }

      const nextCapture = extractListing();
      const nextBuildingKey = buildingAddressKey(nextCapture.address);
      if (
        nextCapture.detailPage !== true
        || (buildingKey && nextBuildingKey && buildingKey !== nextBuildingKey)
      ) return;

      const nextSignature = unitOptionSignature(nextCapture);
      if (nextSignature === appliedSignature) {
        pendingSignature = null;
        pendingCapture = null;
        consecutiveMatches = 0;
        return;
      }
      if (nextSignature === pendingSignature) {
        consecutiveMatches += 1;
      } else {
        pendingSignature = nextSignature;
        pendingCapture = nextCapture;
        consecutiveMatches = 1;
      }

      if (consecutiveMatches < 2) {
        scheduleCheck();
        return;
      }

      appliedSignature = pendingSignature;
      const settledCapture = pendingCapture;
      pendingSignature = null;
      pendingCapture = null;
      consecutiveMatches = 0;
      const revision = ++analysisRevision;
      analyzePageCapture(settledCapture, { allowSystemModel: true }).then((analysis) => {
        if (revision !== analysisRevision || pageScanSession !== session || !session.ui.host.isConnected || !isCaptureCurrent(settledCapture)) return;
        review.applyAnalysis(settledCapture, analysis);
        pillPicker.applyAnalysis(settledCapture, analysis);
      });
    };

    const observer = new MutationObserver((records) => {
      if (records.every((record) => record.target === session.ui.host)) return;
      scheduleCheck();
    });
    observer.observe(document.body || document.documentElement, {
      attributes: true,
      attributeFilter: ["aria-hidden", "class", "hidden"],
      characterData: true,
      childList: true,
      subtree: true
    });
    session.stopObserving = stop;
    // Include changes that finished loading while the initial native analysis ran.
    scheduleCheck();
    expirationTimer = globalThis.setTimeout(() => {
      observer.disconnect();
      if (checkTimer !== null) globalThis.clearTimeout(checkTimer);
      // Let an already requested final analysis finish after observation ends.
      if (session.ui.completeCard.classList.contains("hidden")) session.ui.host.remove();
    }, 12_000);
  }

  async function startPageScan({ presentation = "visual" } = {}) {
    if (pageScanSession?.running) return true;
    pageScanSession?.ui?.host.remove();

    const visualTracking = presentation === "visual";
    const mobilePillPicker = presentation === "mobile-pills";
    let capture = extractListing();
    if (mobilePillPicker && !isLikelyListingCapture(capture)) {
      pageScanSession = null;
      return false;
    }
    const ui = createPageScanUI({
      compact: presentation === "compact",
      pillPicker: mobilePillPicker
    });
    const session = { running: true, ui };
    pageScanSession = session;
    if (mobilePillPicker) {
      capture = await settledPageCapture(capture);
      if (!capture || pageScanSession !== session || !ui.host.isConnected || !isLikelyListingCapture(capture)) {
        ui.host.remove();
        session.running = false;
        return false;
      }
    }
    let analysisFinished = false;
    const analysisTask = analyzePageCapture(capture, {
      allowSystemModel: visualTracking || mobilePillPicker
    }).then((result) => {
      analysisFinished = true;
      return result;
    });

    if (visualTracking) {
      const ranges = readableSentenceRanges();
      await animateSentenceRanges(ui, ranges);
    } else {
      ui.phase.textContent = "Checking listing details";
    }
    if (!ui.host.isConnected) {
      session.running = false;
      if (pageScanSession === session) pageScanSession = null;
      return false;
    }
    ui.highlightLayer.replaceChildren();
    if (!analysisFinished) {
      ui.phase.textContent = "Checking the listing details";
    }

    const analysis = await analysisTask;
    if (!ui.host.isConnected || pageScanSession !== session || !isCaptureCurrent(capture)) {
      ui.host.remove();
      session.running = false;
      return false;
    }
    const resolved = mergedCapture(capture, analysis);
    const source = listingSource(resolved);
    session.running = false;
    ui.tag.classList.add("hidden");
    ui.completeTitle.textContent = "Listing ready";
    ui.completeSource.textContent = `HOMEBOARD · ${source}`;
    ui.panelSource.textContent = `${source} · REVIEW BEFORE SAVING`;
    ui.completeSummary.textContent = listingSummary(resolved);
    ui.completeCard.classList.remove("hidden");
    const review = configureReview(ui, capture, analysis);
    const pillPicker = mobilePillPicker
      ? configureMobilePillPicker(ui, capture, analysis, review)
      : null;
    observeLiveUnitChanges(session, capture, review, pillPicker);

    if (!visualTracking && !mobilePillPicker) {
      analyzePageCapture(capture, { allowSystemModel: true })
        .then((enhancedAnalysis) => {
          if (!ui.host.isConnected || pageScanSession !== session || !isCaptureCurrent(capture)) return;
          review.applyEnhancedAnalysis(enhancedAnalysis);
          pillPicker?.applyEnhancedAnalysis(enhancedAnalysis);
          if (!mobilePillPicker) {
            ui.completeSummary.textContent = listingSummary(
              mergedCapture(capture, enhancedAnalysis)
            );
          }
        })
        .catch(() => {
          // The fast grounded review remains usable if deeper analysis is unavailable.
        });
    }
    return true;
  }

  function showPageScanFailure(error) {
    const session = pageScanSession;
    const ui = session?.ui;
    if (!ui?.host?.isConnected) {
      pageScanSession = null;
      return;
    }
    session.running = false;
    ui.highlightLayer.replaceChildren();
    ui.tag.classList.add("hidden");
    ui.completeSource.textContent = "HOMEBOARD · SAFARI";
    ui.host.classList.add("scan-failed");
    ui.completeTitle.textContent = "This page did not finish scanning";
    ui.completeSummary.textContent = error instanceof Error && error.message
      ? error.message
      : "Try again, or open Homeboard for setup help.";
    ui.reviewButton.textContent = "Dismiss";
    ui.reviewButton.disabled = false;
    ui.reviewButton.addEventListener("click", () => {
      ui.host.remove();
      if (pageScanSession === session) pageScanSession = null;
    }, { once: true });
    ui.completeCard.classList.remove("hidden");
  }

  function isMobileSafariContext() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isVisibleInViewport(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect || rect.width < 1 || rect.height < 1) return false;
    return rect.bottom > 0
      && rect.right > 0
      && rect.top < innerHeight
      && rect.left < innerWidth;
  }

  function hasActiveMapResultsUI() {
    const map = [...document.querySelectorAll([
      '[data-testid*="search-page-map" i]',
      '[data-testid*="map-container" i]',
      '[aria-label*="map search results" i]',
      '[class*="search-map" i]'
    ].join(','))].find((element) => {
      if (!isVisibleInViewport(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= innerWidth * 0.38 && rect.height >= innerHeight * 0.22;
    });
    if (!map) return false;
    const visibleCards = [...document.querySelectorAll(
      '[data-testid*="property-card" i],[data-testid*="listing-card" i],'
      + '[class*="property-card" i],[class*="listing-card" i]'
    )].filter(isVisibleInViewport);
    return visibleCards.length >= 1;
  }

  function listingURLKind() {
    let url;
    try {
      url = new URL(location.href);
    } catch {
      return "unknown";
    }
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    const segments = path.split('/').filter(Boolean);
    const lastSegment = segments.at(-1) || "";
    const mapQueryKeys = [
      "searchquerystate", "mapbounds", "mapbound", "viewport", "bbox"
    ];
    if (mapQueryKeys.some((key) => url.searchParams.has(key))) return "search";
    if (/\/(?:search|map)(?:\/|$)/.test(path)) return "search";

    if (host.endsWith("zillow.com")) {
      if (path.includes("/homedetails/")) return "detail";
      if (path.startsWith("/apartments/") && segments.length >= 4) return "detail";
      return "search";
    }
    if (host.endsWith("streeteasy.com")) {
      if (/^\/(?:building|rental|sale)\//.test(path)) return "detail";
      return "search";
    }
    if (host.endsWith("realtor.com")) {
      return path.includes("/realestateandhomes-detail/") ? "detail" : "search";
    }
    if (host.endsWith("apartments.com")) {
      return segments.length >= 2 && /^(?=.*\d)[a-z0-9]{5,}$/.test(lastSegment)
        ? "detail"
        : "search";
    }
    if (host.endsWith("redfin.com")) {
      return /\/home\/\d+/.test(path) ? "detail" : "search";
    }
    if (host.endsWith("craigslist.org")) {
      return /\/d\/[^/]+\/\d+\.html$/.test(path) ? "detail" : "search";
    }
    if (host.endsWith("renthop.com")) {
      return /\/listing\/|\/\d{5,}$/.test(path) ? "detail" : "search";
    }
    if (host.endsWith("rent.com")) {
      return /\d{3,}/.test(lastSegment) && segments.length >= 2 ? "detail" : "search";
    }
    if (host.endsWith("compass.com") || host.endsWith("corcoran.com")) {
      return path.includes("/listing/") ? "detail" : "search";
    }
    if (host.endsWith("elliman.com")) {
      return /\/(?:rentals|sales)\/detail\//.test(path) ? "detail" : "search";
    }
    if (host.endsWith("serhant.com")) {
      return path.includes("/properties/") ? "detail" : "search";
    }
    if (host.endsWith("sothebysrealty.com")) {
      return /\/(?:rentals|sales)\/detail\/|\/property\//.test(path) ? "detail" : "search";
    }
    return "unknown";
  }

  function isActualListingPage(nodes, primaryNode, address) {
    if (hasActiveMapResultsUI()) return false;
    const urlKind = listingURLKind();
    if (urlKind === "search") return false;
    if (urlKind === "detail") return true;

    const addressKey = buildingAddressKey(address);
    const headingKey = buildingAddressKey(
      document.querySelector('main h1,[role="main"] h1,h1')?.textContent
    );
    const matchingStructuredListing = nodes.some((candidate) =>
      structuredURLMatchesPage(candidate)
      && (
        candidate === primaryNode
        || types(candidate).some((type) => [
          "apartment", "apartmentcomplex", "accommodation", "residence",
          "singlefamilyresidence", "house", "product", "realestatelisting"
        ].includes(type))
      )
    );
    return Boolean(
      matchingStructuredListing
      && addressKey
      && headingKey
      && (addressKey === headingKey || headingKey.includes(addressKey) || addressKey.includes(headingKey))
    );
  }

  function isLikelyListingCapture(capture) {
    if (capture?.detailPage !== true) return false;
    if (pendingPageContent && capture.pageIdentity && JSON.stringify(JSON.parse(capture.pageIdentity).slice(1)) === pendingPageContent) return false;
    const unitOptions = Array.isArray(capture?.unitOptions)
      ? capture.unitOptions
      : [];
    if (capture?.listingScope === "building") {
      const availability = capture.availabilityPageEvidence || "";
      return Boolean(capture?.address && (
        unitOptions.length > 0
        || (priceFromText(availability) !== null && (bedroomsFromText(availability) !== null || bathroomsFromText(availability) !== null))
      ));
    }
    const listingFactCount = [capture?.price, capture?.bedrooms, capture?.bathrooms]
      .filter((value) => value !== null && value !== undefined).length;
    return Boolean(capture?.address && listingFactCount >= 2);
  }

  let automaticPageIdentity = currentPageIdentity();
  let pendingPageContent = null;
  let automaticScanURL = null;
  let automaticScanAttempts = 0;
  let automaticScanTimer = null;

  function synchronizePageNavigation() {
    if (!globalThis.document?.documentElement) return;
    const identity = currentPageIdentity();
    if (identity === automaticPageIdentity) return;
    const previous = JSON.parse(automaticPageIdentity);
    const next = JSON.parse(identity);
    if (next[0] !== previous[0]) pendingPageContent = JSON.stringify(previous.slice(1));
    if (JSON.stringify(next.slice(1)) !== pendingPageContent) pendingPageContent = null;
    automaticPageIdentity = identity;
    pageScanSession?.stopObserving?.();
    pageScanSession?.ui?.host.remove();
    pageScanSession = null;
    automaticScanURL = null;
    automaticScanAttempts = 0;
    if (automaticScanTimer) globalThis.clearTimeout(automaticScanTimer);
    automaticScanTimer = null;
    scheduleAutomaticListingScan();
  }

  function scheduleAutomaticListingScan(reset = false) {
    if (!isMobileSafariContext()) return;
    if (reset) {
      automaticScanAttempts = 0;
    }
    if (automaticScanTimer || automaticScanAttempts >= 40) return;

    automaticScanTimer = globalThis.setTimeout(() => {
      automaticScanTimer = null;
      if (currentPageIdentity() !== automaticPageIdentity) {
        synchronizePageNavigation();
        return;
      }
      // Do not spend the readiness retry budget while Safari is backgrounded.
      // This commonly happens just after installing or launching Homeboard.
      if (document.hidden) return;
      if (pageScanSession?.running) {
        scheduleAutomaticListingScan();
        return;
      }

      // Search and map pages change constantly. Wait for a real navigation instead
      // of repeatedly running the full listing extractor while results are browsed.
      if (listingURLKind() === "search") {
        automaticScanAttempts = 0;
        return;
      }

      automaticScanAttempts += 1;
      const capture = extractListing();
      const captureURL = capture.pageIdentity;
      if (isLikelyListingCapture(capture) && captureURL !== automaticScanURL) {
        automaticScanURL = captureURL;
        startPageScan({ presentation: "mobile-pills" })
          .then((started) => {
            if (started) return;
            automaticScanURL = null;
            scheduleAutomaticListingScan();
          })
          .catch((error) => {
            automaticScanURL = null;
            showPageScanFailure(error);
          });
        return;
      }
      scheduleAutomaticListingScan();
    }, automaticScanAttempts === 0 ? 350 : 1200);
  }

  browser.runtime.onMessage.addListener((request) => {
    if (request?.type === "homeboard.extractListing") {
      return Promise.resolve(extractListing());
    }
    if (request?.type === "homeboard.startPageScan") {
      startPageScan({ presentation: request.presentation }).catch((error) => {
        showPageScanFailure(error);
      });
      return Promise.resolve({ started: true });
    }
    return undefined;
  });

  if (isMobileSafariContext()) {
    scheduleAutomaticListingScan(true);
    const navigationObserver = new MutationObserver(() => {
      const previousIdentity = automaticPageIdentity;
      synchronizePageNavigation();
      if (automaticPageIdentity === previousIdentity && automaticScanURL === null) {
        scheduleAutomaticListingScan();
      }
    });
    navigationObserver.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    globalThis.addEventListener("popstate", synchronizePageNavigation);
    globalThis.addEventListener("hashchange", synchronizePageNavigation);
    globalThis.addEventListener("pageshow", () => {
      synchronizePageNavigation();
      scheduleAutomaticListingScan(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && automaticScanURL === null) scheduleAutomaticListingScan();
    });
    globalThis.setInterval(synchronizePageNavigation, 500);
  }
})();
