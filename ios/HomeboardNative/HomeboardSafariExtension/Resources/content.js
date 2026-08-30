(() => {
  if (window.__homeboardListingExtractorInstalled) return;
  window.__homeboardListingExtractorInstalled = true;

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
    return canonical || location.href;
  }

  function metaContent(selector) {
    return cleanText(document.querySelector(selector)?.content);
  }

  function parseStructuredData() {
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
    const visit = (value, depth = 0) => {
      if (
        !value
        || typeof value !== "object"
        || depth > 10
        || seen.has(value)
        || nodes.length > 12_000
      ) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      if (types(value).includes("itemlist")) return;
      nodes.push(value);
      Object.values(value).forEach((item) => visit(item, depth + 1));
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

  function bestStructuredNode(nodes) {
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

  function imageValue(node) {
    const value = first(
      metaContent('meta[property="og:image"]'),
      metaContent('meta[name="twitter:image"]'),
      node.image
    );
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const item = value[0];
      return typeof item === "string" ? item : cleanText(item?.url);
    }
    return cleanText(value?.url || value?.contentUrl);
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
    roots
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
      `STRUCTURED FACT CANDIDATES:\n${structured.map((candidate) => JSON.stringify(candidate)).join("\n")}`
    ].join("\n\n").slice(0, 14_000);
  }

  function unitOptions(nodes) {
    const options = [];
    const seen = new Set();
    for (const candidate of nodes) {
      const unit = cleanText(valueForKeys(
        candidate,
        ["unit", "unitNumber", "apartmentNumber", "unitCode", "apartmentSuite", "floorPlanName"]
      ));
      const label = unit;
      const price = numeric(valueForKeys(
        candidate,
        ["price", "rent", "monthlyRent", "minPrice", "lowPrice"]
      ));
      const bedrooms = numeric(valueForKeys(
        candidate,
        ["bedrooms", "beds", "bedCount", "minBeds", "numberOfBedrooms"]
      ));
      const bathrooms = numeric(valueForKeys(
        candidate,
        ["bathrooms", "baths", "bathCount", "minBaths", "numberOfBathrooms"]
      ));
      const squareFeet = numeric(valueForKeys(
        candidate,
        ["squareFeet", "livingArea", "floorSize"]
      ));
      const factCount = [price, bedrooms, bathrooms, squareFeet]
        .filter((value) => value !== null).length;
      if (!unit || !label || factCount < 2) continue;

      const key = `${label}|${price}|${bedrooms}|${bathrooms}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        id: unit || key,
        label,
        unit: unit?.toUpperCase() || null,
        price,
        bedrooms,
        bathrooms,
        squareFeet,
        availableDate: cleanText(valueForKeys(
          candidate,
          ["availableDate", "availabilityDate", "dateAvailable"]
        ))
      });
      if (options.length >= 12) break;
    }
    return options;
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
    const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:bd|bed|beds|bedroom|bedrooms)\b/i);
    return numeric(match?.[1]);
  }

  function bathroomsFromText(text) {
    const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:ba|bath|baths|bathroom|bathrooms)\b/i);
    return numeric(match?.[1]);
  }

  function squareFeetFromText(text) {
    const match = text.match(/\b([1-9][0-9]{2,4}(?:,[0-9]{3})?)\s*(?:sq\.?\s*ft|square\s*feet)\b/i);
    return numeric(match?.[1]);
  }

  function addressFromText(text) {
    const match = text.match(
      /\b(\d{1,6}\s+[A-Za-z0-9.' -]+?\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Parkway|Pkwy|Terrace|Ter)(?:\s*(?:#|Apt|Apartment|Unit)\s*[A-Za-z0-9-]+)?(?:,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5})?)/i
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
    const match = text.match(/(?:\b(?:apt|apartment|unit)\s*|#\s*)([A-Za-z0-9-]{1,16})\b/i);
    return cleanText(match?.[1])?.toUpperCase() || null;
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

  function extractListing() {
    const nodes = parseStructuredData();
    const node = bestStructuredNode(nodes);
    const coordinate = structuredCoordinate(node);
    const roots = recommendationRoots();
    const primaryValues = primaryTextValues(roots);
    const text = [
      metaContent('meta[name="description"]'),
      metaContent('meta[property="og:description"]'),
      primaryValues.join("\n").slice(0, 60_000)
    ].filter(Boolean).join(" ");

    const floorSize = typeof node.floorSize === "object" ? node.floorSize.value : node.floorSize;
    const pageTitle = cleanText(
      first(
        metaContent('meta[property="og:title"]'),
        node.name,
        document.title
      )
    );
    const baseAddress = first(
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
    const isBuildingPage =
      /\/apartments?\//i.test(location.pathname)
      || types(node).includes("apartmentcomplex")
      || /\b(?:floor plans|units available)\b/i.test(text.slice(0, 10_000));

    const factCount = [address, price, bedrooms, bathrooms, squareFeet]
      .filter((value) => value !== null && value !== undefined).length;

    return {
      url: location.href,
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
      imageURL: imageValue(node),
      summary: cleanText(metaContent('meta[property="og:description"]') || metaContent('meta[name="description"]')),
      listingScope: isBuildingPage ? "building" : "unit",
      extractionConfidence: factCount >= 4 ? "high" : factCount >= 2 ? "medium" : "low",
      pageEvidence: pageEvidence(
        nodes,
        node,
        isBuildingPage,
        primaryValues,
        roots
      ),
      unitOptions: isBuildingPage ? unitOptions(nodes) : []
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

  function createPageScanUI({ compact = false } = {}) {
    document.querySelector("#homeboard-page-scan-root")?.remove();

    const host = document.createElement("div");
    host.id = "homeboard-page-scan-root";
    host.setAttribute("aria-live", "polite");
    host.classList.toggle("compact", compact);
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
        <button class="review-button" id="reviewButton" type="button">Review and save</button>
        <button class="close-button" id="dismissButton" type="button" aria-label="Dismiss Homeboard">×</button>
      </section>
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
    };
    byID("dismissButton").addEventListener("click", () => host.remove());
    byID("panelClose").addEventListener("click", hideReview);
    byID("cancelReview").addEventListener("click", hideReview);
    byID("backdrop").addEventListener("click", hideReview);

    return {
      host,
      shadow,
      phase: byID("scanPhase"),
      tag: byID("scanTag"),
      highlightLayer: byID("highlightLayer"),
      completeCard: byID("completeCard"),
      completeTitle: byID("completeTitle"),
      completeSource: byID("completeSource"),
      completeSummary: byID("completeSummary"),
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

  function configureReview(ui, originalCapture, analysis) {
    let reviewCapture = mergedCapture(originalCapture, analysis);
    let selectedExactOption = (analysis?.options || []).length === 0;
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

    const renderOptions = (options) => {
      if (options.length === 0 || ui.optionList.childElementCount > 0) return;
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
    renderOptions(analysis?.options || []);
    if ((analysis?.options || []).length === 0 && analysis?.missingFields?.length) {
      ui.panelNote.textContent =
        "Homeboard left uncertain details blank. Confirm them before saving.";
    }

    const showReview = () => {
      reviewOpened = true;
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
      const required = ["address", "price", "bedrooms", "bathrooms"];
      const missing = required.filter((key) =>
        reviewed[key] === null || reviewed[key] === undefined || reviewed[key] === ""
      );
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
        const response = await browser.runtime.sendMessage({
          type: "homeboard.saveListing",
          capture: reviewed
        });
        if (!response?.saved) {
          throw new Error(response?.error || "Homeboard could not save this rental.");
        }
        ui.hideReview();
        ui.completeTitle.textContent = "Saved to Homeboard";
        ui.completeSummary.textContent = response.synced
          ? "This reviewed listing is now on the same board on every device."
          : "Saved locally. Open Homeboard to finish syncing this board.";
        ui.reviewButton.textContent = "Saved";
        ui.reviewButton.disabled = true;
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
      applyEnhancedAnalysis(enhancedAnalysis) {
        const enhancedCapture = mergedCapture(originalCapture, enhancedAnalysis);
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
        renderOptions(enhancedAnalysis?.options || []);
        if (
          (enhancedAnalysis?.options || []).length === 0
          && enhancedAnalysis?.missingFields?.length === 0
        ) {
          ui.panelNote.textContent = enhancedAnalysis.usedOnDeviceModel
            ? "Homeboard’s deeper check agreed with these listing details."
            : "These details came from the main listing, not nearby or similar cards.";
        }
      }
    };
  }

  async function startPageScan({ presentation = "visual" } = {}) {
    if (pageScanSession?.running) return;
    pageScanSession?.ui?.host.remove();

    const visualTracking = presentation !== "compact";
    const ui = createPageScanUI({ compact: !visualTracking });
    const session = { running: true, ui };
    pageScanSession = session;
    const capture = extractListing();
    let analysisFinished = false;
    const analysisTask = analyzePageCapture(capture, {
      allowSystemModel: visualTracking
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
      return;
    }
    ui.highlightLayer.replaceChildren();
    if (!analysisFinished) {
      ui.phase.textContent = "Checking the listing details";
    }

    const analysis = await analysisTask;
    if (!ui.host.isConnected || pageScanSession !== session) return;
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

    if (!visualTracking) {
      analyzePageCapture(capture, { allowSystemModel: true })
        .then((enhancedAnalysis) => {
          if (!ui.host.isConnected || pageScanSession !== session) return;
          review.applyEnhancedAnalysis(enhancedAnalysis);
          ui.completeSummary.textContent = listingSummary(
            mergedCapture(capture, enhancedAnalysis)
          );
        })
        .catch(() => {
          // The fast grounded review remains usable if deeper analysis is unavailable.
        });
    }
  }

  browser.runtime.onMessage.addListener((request) => {
    if (request?.type === "homeboard.extractListing") {
      return Promise.resolve(extractListing());
    }
    if (request?.type === "homeboard.startPageScan") {
      startPageScan({ presentation: request.presentation }).catch(() => {
        pageScanSession?.ui?.host.remove();
        pageScanSession = null;
      });
      return Promise.resolve({ started: true });
    }
    return undefined;
  });
})();
