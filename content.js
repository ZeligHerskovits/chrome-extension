// Create and inject the floating toggle button on web pages
(async function () {
  // Check if button already exists
  if (document.getElementById("sessynote-toggle-btn")) {
    return;
  }

  // Check if user is logged in before showing button
  const storage = await chrome.storage.local.get(["isLoggedIn"]);
  if (!storage.isLoggedIn) {
    console.log(
      "SessyNote: User not logged in, toggle button will not be shown"
    );
    return;
  }

  // Load saved position from storage
  const savedPosition = await chrome.storage.local.get(["toggleButtonTop"]);
  const initialTop = savedPosition.toggleButtonTop || "50%";

  // Create the toggle button
  const toggleBtn = document.createElement("div");
  toggleBtn.id = "sessynote-toggle-btn";
  toggleBtn.innerHTML =
    '<img src="' +
    chrome.runtime.getURL("icons/icon48.png") +
    '" style="width: 44px; height: 44px; object-fit: contain;">';
  toggleBtn.title = "Toggle SessyNote (Drag to move)";

  // Add styles
  toggleBtn.style.cssText = `
    position: fixed;
    right: 0;
    top: ${initialTop};
    transform: translateY(-50%);
    width: 48px;
    height: 48px;
    background-color: white;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 8px 0 0 8px;
    box-shadow: -2px 2px 12px rgba(0, 0, 0, 0.15);
    z-index: 2147483647;
    transition: background-color 0.3s ease, width 0.3s ease;
    user-select: none;
    border: 1px solid #e0e0e0;
    border-right: none;
    padding: 4px;
  `;

  // Drag functionality
  let isDragging = false;
  let dragStartY = 0;
  let dragStartTop = 0;
  let clickStartTime = 0;
  let clickStartY = 0;

  toggleBtn.addEventListener("mousedown", (e) => {
    clickStartTime = Date.now();
    clickStartY = e.clientY;

    // Start dragging
    isDragging = true;
    dragStartY = e.clientY;

    // Get current top position
    const currentTop = toggleBtn.style.top;
    dragStartTop = currentTop.includes("%")
      ? (parseFloat(currentTop) / 100) * window.innerHeight
      : parseFloat(currentTop);

    toggleBtn.style.cursor = "grabbing";
    toggleBtn.style.transition = "none"; // Disable transition during drag
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (isDragging) {
      const deltaY = e.clientY - dragStartY;
      let newTop = dragStartTop + deltaY;

      // Constrain to viewport bounds
      const buttonHeight = 48;
      const minTop = buttonHeight / 2;
      const maxTop = window.innerHeight - buttonHeight / 2;
      newTop = Math.max(minTop, Math.min(maxTop, newTop));

      toggleBtn.style.top = `${newTop}px`;
      toggleBtn.style.transform = "translateY(-50%)";
    }
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      const clickDuration = Date.now() - clickStartTime;
      const clickDistance = Math.abs(dragStartY - clickStartY);

      isDragging = false;
      toggleBtn.style.cursor = "pointer"; // Back to pointer cursor
      toggleBtn.style.transition =
        "background-color 0.3s ease, width 0.3s ease";

      // Save position to storage
      const currentTop = toggleBtn.style.top;
      chrome.storage.local.set({ toggleButtonTop: currentTop });

      // Only toggle if it was a quick click (not a drag)
      if (clickDuration < 200 && clickDistance < 5) {
        console.log("SessyNote: Toggle button clicked");
        chrome.runtime.sendMessage(
          { action: "toggleSidePanel" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "SessyNote: Error sending message:",
                chrome.runtime.lastError
              );
            } else {
              console.log("SessyNote: Message sent successfully");
            }
          }
        );
      }
    }
  });

  // Hover effect
  toggleBtn.addEventListener("mouseenter", () => {
    if (!isDragging) {
      toggleBtn.style.backgroundColor = "#f8f8f8";
      toggleBtn.style.width = "52px";
    }
  });

  toggleBtn.addEventListener("mouseleave", () => {
    if (!isDragging) {
      toggleBtn.style.backgroundColor = "white";
      toggleBtn.style.width = "48px";
    }
  });

  // Update button title based on side panel state
  let blinkInterval = null;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "sidePanelClosed") {
      toggleBtn.title = "Open SessyNote";
    } else if (message.action === "sidePanelOpened") {
      toggleBtn.title = "Close SessyNote";
      // Stop blinking when panel opens
      if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
        toggleBtn.style.backgroundColor = "white";
      }
    } else if (message.action === "startBlinking") {
      // Start blinking animation
      console.log("SessyNote: Starting blink animation");
      let isBlue = false;
      blinkInterval = setInterval(() => {
        toggleBtn.style.backgroundColor = isBlue ? "white" : "#4A90E2";
        isBlue = !isBlue;
      }, 500);
      toggleBtn.title = "Session detected! Click to open";
    } else if (message.action === "stopBlinking") {
      // Stop blinking animation
      console.log("SessyNote: Stopping blink animation");
      if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
        toggleBtn.style.backgroundColor = "white";
      }
      toggleBtn.title = "Toggle SessyNote";
    } else if (message.action === "checkAndScrape") {
      // Trigger the scraping flow (called after login)
      console.log(
        "SessyNote: Received checkAndScrape message - triggering scrape"
      );
      checkAndScrapeIfMatch();
    }
  });

  // Handle window resize to keep button within bounds
  window.addEventListener("resize", () => {
    const currentTop = toggleBtn.style.top;
    if (currentTop && !currentTop.includes("%")) {
      const topValue = parseFloat(currentTop);
      const buttonHeight = 48;
      const minTop = buttonHeight / 2;
      const maxTop = window.innerHeight - buttonHeight / 2;

      if (topValue < minTop || topValue > maxTop) {
        const constrainedTop = Math.max(minTop, Math.min(maxTop, topValue));
        toggleBtn.style.top = `${constrainedTop}px`;
        chrome.storage.local.set({ toggleButtonTop: `${constrainedTop}px` });
      }
    }
  });

  // Inject into page
  document.body.appendChild(toggleBtn);
})();

// ===============================
// AUTO-SCRAPING AND SESSION AUTO-FILL
// ===============================

// Check URL on page load and navigation
// Track the currently matched EMR config so we can reuse it (e.g. for popups)
let activeEmrConfig = null; // { emrTypeId, emrResponse }

// Track popup / late-content scraping state
let lateContentObserver = null;
let lateScrapeScheduled = false;
let sessionAlreadyScraped = false;

// Track the last clicked table row (used when a session popup is opened).
// This lets us evaluate XPath for row-based fields (like Date of Session,
// Time In/Out, Length, Service Type) specifically within the row that
// triggered the popup, without hard-coding any column indices.
let lastClickedSessionRow = null;

// Capture clicks anywhere in the document so we remember which row
// the user interacted with most recently. When the blue "view" icon
// (or any element inside the row) is clicked to open a popup, this
// will store that <tr> as the context node for row-level XPath queries.
document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (!target) return;

    const row = target.closest("tr");
    if (!row) return;

    lastClickedSessionRow = row;
    console.log(
      "SessyNote: Stored last clicked session row for potential row-based scraping."
    );
  },
  true
);

// Helper to stop late-content monitoring once we successfully scrape
function stopLateContentObserver() {
  if (lateContentObserver) {
    lateContentObserver.disconnect();
    lateContentObserver = null;
  }
}

// Decide what DOM subtree to scrape from.
// For normal pages, this is the whole document.
// For popup-based EMR types (is_popup + popup_root_selector), this will be the popup container.
function getScrapeRoot() {
  // If current EMR type is marked as popup-based and has a popup_root_selector,
  // try to find that popup container and use it as the scraping root.
  if (
    activeEmrConfig &&
    activeEmrConfig.isPopup &&
    activeEmrConfig.popupRootSelector
  ) {
    try {
      const popup = document.querySelector(activeEmrConfig.popupRootSelector);
      if (popup) {
        console.log(
          "SessyNote: Using popup root for scrape:",
          activeEmrConfig.popupRootSelector
        );
        return popup;
      }
    } catch (e) {
      console.error(
        "SessyNote: Error using popup_root_selector as scrape root:",
        e
      );
    }
  }

  // Fallback: scrape entire document (existing behavior)
  return document;
}

// Try scraping again after new content appears (e.g. popup opened)
async function tryLateScrape() {
  if (!activeEmrConfig || sessionAlreadyScraped) {
    return;
  }

  console.log(
    "SessyNote: Detected DOM changes after initial check, trying late scrape (e.g. popup)..."
  );

  const root = getScrapeRoot();
  const scrapedData = scrapePageData(activeEmrConfig.emrResponse, root);
  console.log("SessyNote: Late-scrape data:", scrapedData);

  const foundValuesCount = Object.keys(scrapedData).length;
  // Require at least 5 values to consider this a valid session (same as non-popup)
  const minFields = 5;
  if (foundValuesCount < minFields) {
    console.log(
      `SessyNote: Late scrape only found ${foundValuesCount} value(s). Need at least ${minFields}. Waiting for more content...`
    );
    return;
  }

  console.log(
    `SessyNote: Late scrape found ${foundValuesCount} values - treating this as a session page (likely popup). Proceeding...`
  );

  sessionAlreadyScraped = true;
  stopLateContentObserver();

  chrome.runtime.sendMessage({
    action: "autoFillSession",
    data: {
      scrapedData: scrapedData,
      emrTypeId: activeEmrConfig.emrTypeId,
    },
  });
}

// Start observing the DOM for new content (e.g. popup or lazy-loaded panel)
function ensureLateContentObserver() {
  // Only enable late-content watching for popup EMR types.
  if (
    !activeEmrConfig ||
    !activeEmrConfig.isPopup ||
    lateContentObserver ||
    sessionAlreadyScraped
  ) {
    return;
  }

  console.log(
    "SessyNote: Starting DOM observer to watch for late content (e.g. popup session)..."
  );

  lateContentObserver = new MutationObserver(() => {
    if (sessionAlreadyScraped) {
      stopLateContentObserver();
      return;
    }

    // Debounce multiple rapid mutations
    if (lateScrapeScheduled) return;
    lateScrapeScheduled = true;

    setTimeout(async () => {
      lateScrapeScheduled = false;
      await tryLateScrape();
    }, 1000);
  });

  lateContentObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });
}

async function checkAndScrapeIfMatch() {
  try {
    const currentUrl = window.location.href;
    console.log("SessyNote: Checking URL against all pairs:", currentUrl);

    // Ask background script to check URL against all pairs
    chrome.runtime.sendMessage(
      { action: "checkUrlAgainstAllPairs", currentUrl: currentUrl },
      async (response) => {
        if (!response || !response.success) {
          console.error(
            "SessyNote: Failed to check URL against pairs:",
            response?.error
          );
          return;
        }

        if (!response.matched) {
          console.log("SessyNote: No URL match found in any pair, skipping");
          return;
        }

        // Match found! Use the matched EMR type
        const emrTypeId = response.emrTypeId;
        const emrResponse = response.emrResponse;
        const emrType = response.emrType || {};

        console.log(
          "SessyNote: ✅ URL match found! Using EMR Type ID:",
          emrTypeId
        );

        if (!emrResponse) {
          console.error("SessyNote: No response field in EMR type");
          return;
        }

        // Cache active EMR config so we can reuse it if more content (like a popup) appears later
        activeEmrConfig = {
          emrTypeId,
          emrResponse,
          // Popup metadata comes from backend EMR type definition
          isPopup: !!emrType.is_popup,
          popupRootSelector: emrType.popup_root_selector || null,
        };
        sessionAlreadyScraped = false;

        // Wait for QuickBase page to fully load (takes longer due to dynamic content)
        await new Promise((resolve) => setTimeout(resolve, 10000));

        // Scrape data from page (or popup if one is open)
        const root = getScrapeRoot();
        const scrapedData = scrapePageData(emrResponse, root);

        console.log("SessyNote: Scraped data:", scrapedData);

        // Check if enough values were found
        const foundValuesCount = Object.keys(scrapedData).length;
        // Require at least 5 fields for both popup and non-popup EMR types
        const minFields = 5;
        if (foundValuesCount < minFields) {
          console.log(
            `SessyNote: Only found ${foundValuesCount} value(s). Need at least ${minFields} to consider this a session page.`
          );

          // For popup EMR types, start watching for DOM changes so we can
          // rescrape when the popup actually appears. For non-popup EMR
          // types, we just stop here (no repeated automatic scraping).
          if (activeEmrConfig.isPopup) {
            ensureLateContentObserver();
          }
          return;
        }

        console.log(
          `SessyNote: Found ${foundValuesCount} values - this appears to be a session page. Proceeding...`
        );

        sessionAlreadyScraped = true;
        stopLateContentObserver();

        // Send to background script
        chrome.runtime.sendMessage({
          action: "autoFillSession",
          data: {
            scrapedData: scrapedData,
            emrTypeId: emrTypeId,
          },
        });
      }
    );
  } catch (error) {
    console.error("SessyNote: Error in checkAndScrapeIfMatch:", error);
  }
}

// Initialize auto-scraping on page load and URL changes
(async function () {
  console.log("SessyNote: Auto-scraping initialized");

  // Check URL when page loads
  await checkAndScrapeIfMatch();

  // Listen for URL changes (for SPAs)
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(async () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log("SessyNote: URL changed to", lastUrl);

      // Reset state for the new URL
      activeEmrConfig = null;
      sessionAlreadyScraped = false;
      stopLateContentObserver();

      await checkAndScrapeIfMatch();
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });
})();

// Helper to evaluate an XPath for a field, using different context rules for
// row-relative vs. popup/global XPaths.
// - If xpath starts with ".//"  → treat as row‑relative and use the clicked <tr>.
// - If xpath starts with "//"   → treat as popup/document‑scoped and use
//   popup_root_selector (for popup EMRs) or the full document.
function evaluateFieldXPath(xpath, defaultRoot) {
  // Determine popup_root_selector from the active EMR config (if any)
  const popupRootSelector =
    activeEmrConfig && activeEmrConfig.isPopup
      ? activeEmrConfig.popupRootSelector || null
      : null;

  let context = null;

  try {
    if (xpath.startsWith(".//")) {
      // Row/grid field → use the last clicked <tr> as context when available
      context = lastClickedSessionRow || defaultRoot || document;
      if (!lastClickedSessionRow) {
        console.warn(
          "⚠️ SessyNote: Row-relative XPath used but no lastClickedSessionRow is set. Falling back to default root."
        );
      } else {
        console.log(
          "🔍 SessyNote: Using last clicked session row as XPath context for row-relative field."
        );
      }
    } else {
      // Popup or full-document field → use popup root if configured/found, else default root/document
      let popupRoot = null;
      if (popupRootSelector) {
        try {
          popupRoot = document.querySelector(popupRootSelector);
        } catch (e) {
          console.error(
            "❌ SessyNote: Error querying popup_root_selector for XPath context:",
            e
          );
        }
      }

      if (popupRoot) {
        console.log(
          "🔍 SessyNote: Using popup_root_selector as XPath context:",
          popupRootSelector
        );
        context = popupRoot;
      } else {
        context = defaultRoot || document;
      }
    }

    const result = document.evaluate(
      xpath,
      context || document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );

    const node = result.singleNodeValue;
    if (!node) {
      return { node: null, value: "" };
    }

    // Accept both elements and text nodes; textContent works for both.
    const value = (node.textContent || "").trim();
    return { node, value };
  } catch (e) {
    console.error("❌ SessyNote: XPath evaluation error:", e);
    return { node: null, value: "" };
  }
}

function scrapePageData(responseFields, root = document) {
  const scrapedData = {};
  console.log(
    "🔍 SessyNote: Starting page scrape with",
    Object.keys(responseFields).length,
    "fields"
  );

  // Iterate through each field in the response
  for (const [fieldName, fieldConfig] of Object.entries(responseFields)) {
    try {
      const source = fieldConfig.source;
      if (!source) {
        console.warn(`⚠️ SessyNote: No source config for field ${fieldName}`);
        continue;
      }

      let value = "";
      let element = null;

      // Handle XPath selectors
      if (source.type === "xpath" && source.xpath) {
        console.log(
          `🔍 SessyNote: Using XPath for ${fieldName}:`,
          source.xpath
        );

        const { node, value: xpathValue } = evaluateFieldXPath(
          source.xpath,
          root
        );

        if (node && xpathValue) {
          element = node;
          value = xpathValue;
          console.log(`✅ SessyNote: Found ${fieldName} via XPath:`, value);
        } else {
          console.warn(
            `❌ SessyNote: XPath returned no value for ${fieldName}`
          );
        }
      }
      // Handle CSS selectors (fallback)
      else if (source.selector) {
        console.log(
          `🔍 SessyNote: Using CSS selector for ${fieldName}:`,
          source.selector
        );
        element = root.querySelector(source.selector);

        if (element) {
          const attribute = source.attribute || "textContent";

          if (attribute === "textContent") {
            value = element.textContent.trim();
          } else if (attribute === "value") {
            value = element.value;
          } else {
            value = element.getAttribute(attribute) || "";
          }
          console.log(`✅ SessyNote: Found ${fieldName} via CSS:`, value);
        } else {
          console.warn(
            `❌ SessyNote: CSS selector returned no element for ${fieldName}`
          );
        }
      }

      // Store with api_name as key if value found
      if (value && fieldConfig.api_name) {
        scrapedData[fieldConfig.api_name] = value;
        console.log(`💾 SessyNote: Stored ${fieldConfig.api_name}:`, value);
      } else if (!value) {
        console.warn(`⚠️ SessyNote: No value found for field ${fieldName}`);
      }
    } catch (error) {
      console.error(`❌ SessyNote: Error scraping field ${fieldName}:`, error);
    }
  }

  console.log(
    "✅ SessyNote: Scrape complete. Collected",
    Object.keys(scrapedData).length,
    "fields"
  );
  return scrapedData;
}
