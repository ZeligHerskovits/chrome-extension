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

  // Flag indicating the content script was injected and is active
  try {
    window.__sessynote_content_injected = true;
    console.log("SessyNote: Content script injected and active");
  } catch (e) {
    // ignore
  }
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

// Determine if an element is visible (not hidden/collapsed)
function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  return el.getClientRects().length > 0;
}

// Get the popup root element if configured
function getPopupRoot() {
  if (
    activeEmrConfig &&
    activeEmrConfig.isPopup &&
    activeEmrConfig.popupRootSelector
  ) {
    try {
      return document.querySelector(activeEmrConfig.popupRootSelector);
    } catch (e) {
      console.error(
        "SessyNote: Error querying popup_root_selector:",
        e
      );
    }
  }
  return null;
}

// Decide what DOM subtree to scrape from.
// For normal pages, this is the whole document.
// For popup-based EMR types, this will be the popup container when visible.
function getScrapeRoot() {
  if (activeEmrConfig && activeEmrConfig.isPopup) {
    const popup = getPopupRoot();
    if (popup && isElementVisible(popup)) {
      console.log(
        "SessyNote: Using popup root for scrape:",
        activeEmrConfig.popupRootSelector
      );
      return popup;
    }
  }

  // Fallback: scrape entire document (non-popup types)
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

  // For popup types, only scrape when popup is visible
  if (activeEmrConfig.isPopup) {
    const popup = getPopupRoot();
    if (!popup || !isElementVisible(popup)) {
      console.log(
        "SessyNote: ⏸️ Popup not visible yet. Waiting for popup to open..."
      );
      return;
    }
    console.log(
      "SessyNote: ✅ Popup is visible. Scraping popup data now."
    );
  }

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
          // Popup metadata comes from backend EMR type definition,
          // but fall back to json_response if present there.
          isPopup: !!emrType.is_popup || !!emrResponse?.is_popup,
          popupRootSelector:
            emrType.popup_root_selector ||
            emrResponse?.popup_root_selector ||
            null,
        };
        sessionAlreadyScraped = false;

        console.log("SessyNote: ⚙️ EMR Type Configuration:", {
          emrTypeId,
          isPopup: activeEmrConfig.isPopup,
          popupRootSelector: activeEmrConfig.popupRootSelector,
          emrType_is_popup: emrType.is_popup,
          emrResponse_is_popup: emrResponse?.is_popup,
          fieldCount: Array.isArray(emrResponse?.fields)
            ? emrResponse.fields.length
            : 0,
        });

        // For popup EMR types, skip initial scrape and only watch for popup to appear
        if (activeEmrConfig.isPopup) {
          console.log(
            "SessyNote: 🔍 Popup-based EMR type detected. Starting observer to watch for popup..."
          );
          ensureLateContentObserver();
          return; // DON'T scrape - wait for popup to appear
        }
        
        console.log("SessyNote: 📄 Non-popup EMR type. Waiting 10 seconds then scraping...");

        // Wait for QuickBase page to fully load (takes longer due to dynamic content)
        // Only for NON-popup types
        await new Promise((resolve) => setTimeout(resolve, 10000));

        // Scrape data from page (non-popup types only)
        const root = getScrapeRoot();
        const scrapedData = scrapePageData(emrResponse, root);

        console.log("SessyNote: Scraped data:", scrapedData);

        // Check if enough values were found
        const foundValuesCount = Object.keys(scrapedData).length;
        const minFields = 5;
        if (foundValuesCount < minFields) {
          console.log(
            `SessyNote: Only found ${foundValuesCount} value(s). Need at least ${minFields} to consider this a session page.`
          );
          return;
        }

        console.log(
          `SessyNote: Found ${foundValuesCount} values - this appears to be a session page. Proceeding...`
        );

        sessionAlreadyScraped = true;

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

// Helper to determine the appropriate context root for selector evaluation
// For row-relative selectors (starting with './/'), use the clicked row
// For popup/document selectors, use popup root or document
function getContextRoot(isRowRelative, defaultRoot = document) {
  const popupRootSelector =
    activeEmrConfig && activeEmrConfig.isPopup
      ? activeEmrConfig.popupRootSelector || null
      : null;

  if (isRowRelative) {
    // Row/grid field → use the last clicked <tr> as context when available
    if (!lastClickedSessionRow) {
      console.warn(
        "⚠️ SessyNote: Row-relative selector used but no lastClickedSessionRow is set. Falling back to default root."
      );
    } else {
      console.log(
        "🔍 SessyNote: Using last clicked session row as context for row-relative field."
      );
    }
    return lastClickedSessionRow || defaultRoot || document;
  } else {
    // Popup or full-document field → use popup root if configured/found, else default root/document
    if (popupRootSelector) {
      try {
        const popupRoot = document.querySelector(popupRootSelector);
        if (popupRoot) {
          console.log(
            "🔍 SessyNote: Using popup_root_selector as context:",
            popupRootSelector
          );
          return popupRoot;
        }
      } catch (e) {
        console.error(
          "❌ SessyNote: Error querying popup_root_selector:",
          e
        );
      }
    }
    return defaultRoot || document;
  }
}

// Evaluate a single selector (XPath or CSS) and return the extracted value
function evaluateSelector(selector, selectorType, context = document) {
  try {
    let node = null;
    let value = "";

    if (selectorType === "xpath") {
      // Evaluate XPath
      const result = document.evaluate(
        selector,
        context,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      node = result.singleNodeValue;
      if (node) {
        // For INPUT, TEXTAREA, SELECT elements, use .value attribute
        if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') {
          value = (node.value || "").trim();
        } else {
          // For other elements, use textContent
          value = (node.textContent || "").trim();
        }
        // 🐛 DEBUG: Log the element details
        console.log(`🐛 XPath Debug:`, {
          xpath: selector,
          tagName: node.tagName,
          className: node.className,
          textContent: node.textContent?.trim().substring(0, 100),
          valueAttr: node.value || '(no value attribute)',
          extractedValue: value,
          innerHTML: node.innerHTML?.substring(0, 150)
        });
      }
    } else if (selectorType === "css") {
      // Evaluate CSS selector
      node = context.querySelector(selector);
      if (node) {
        // For INPUT, TEXTAREA, SELECT elements, use .value attribute
        if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') {
          value = (node.value || "").trim();
        } else {
          // For other elements, use textContent
          value = (node.textContent || "").trim();
        }
        // 🐛 DEBUG: Log the element details
        console.log(`🐛 CSS Debug:`, {
          selector: selector,
          tagName: node.tagName,
          className: node.className,
          textContent: node.textContent?.trim().substring(0, 100),
          valueAttr: node.value || '(no value attribute)',
          extractedValue: value,
          innerHTML: node.innerHTML?.substring(0, 150)
        });
      }
    }

    return { node, value, success: !!value };
  } catch (e) {
    console.error(
      `❌ SessyNote: Error evaluating ${selectorType} selector:`,
      selector,
      e
    );
    return { node: null, value: "", success: false };
  }
}

// Try a sequence of selectors (primary + fallbacks) for a single field
// Returns { value, selectorUsed } if found, or { value: "", selectorUsed: null } if not
function tryFieldSelectors(fieldConfig, fieldKey, context = document) {
  const isRowRelative =
    fieldConfig.primary_selector?.startsWith("./") ||
    fieldConfig.primary_selector?.startsWith(".//");
  const contextRoot = getContextRoot(isRowRelative, context);

  // Try primary selector first
  if (fieldConfig.primary_selector) {
    const selectorType = fieldConfig.selector_type || "xpath";
    console.log(
      `🔍 SessyNote: Trying primary ${selectorType} for ${fieldKey}:`,
      fieldConfig.primary_selector
    );

    const result = evaluateSelector(
      fieldConfig.primary_selector,
      selectorType,
      contextRoot
    );
    if (result.success) {
      console.log(
        `✅ SessyNote: Found ${fieldKey} via primary ${selectorType}:`,
        result.value
      );
      return { value: result.value, selectorUsed: "primary" };
    }
  }

  // Try fallback selectors in order
  if (fieldConfig.selector_fallbacks && Array.isArray(fieldConfig.selector_fallbacks)) {
    for (let i = 0; i < fieldConfig.selector_fallbacks.length; i++) {
      const fallback = fieldConfig.selector_fallbacks[i];
      const fallbackType = fallback.type || "xpath";
      console.log(
        `🔍 SessyNote: Trying fallback #${i + 1} (${fallbackType}) for ${fieldKey}:`,
        fallback.selector
      );

      const result = evaluateSelector(
        fallback.selector,
        fallbackType,
        contextRoot
      );
      if (result.success) {
        console.log(
          `✅ SessyNote: Found ${fieldKey} via fallback #${i + 1} (${fallbackType}):`,
          result.value
        );
        return { value: result.value, selectorUsed: `fallback_${i + 1}` };
      }
    }
  }

  // All selectors failed for this field
  console.warn(
    `❌ SessyNote: No selectors matched for field ${fieldKey}. Skipping this field.`
  );
  return { value: "", selectorUsed: null };
}

function scrapePageData(xpathPatternsConfig, root = document) {
  const scrapedData = {};

  // Handle both old format (direct field object) and new format (JSONB with fields array)
  let fields = [];
  if (Array.isArray(xpathPatternsConfig?.fields)) {
    // New format: { fields: [...], is_popup: bool, popup_root_selector: string }
    fields = xpathPatternsConfig.fields;
  } else if (typeof xpathPatternsConfig === "object" && xpathPatternsConfig !== null) {
    // Fallback: if it looks like old format, log a warning but try to process
    console.warn(
      "⚠️ SessyNote: Received xpath_patterns in unexpected format. Expected { fields: [...] }"
    );
    // If it's a direct field object, convert it to array format for compatibility
    if (xpathPatternsConfig.field_key) {
      fields = [xpathPatternsConfig];
    } else {
      console.warn(
        "⚠️ SessyNote: No fields array found in json_response. Skipping scrape."
      );
      return scrapedData; // Can't process
    }
  }

  console.log(
    "🔍 SessyNote: Starting page scrape with",
    fields.length,
    "field(s)"
  );

  // Iterate through each field in the new structure
  for (const fieldConfig of fields) {
    try {
      const fieldKey = fieldConfig.field_key;
      const apiName = fieldConfig.api_name;
      if (!fieldKey) {
        console.warn(
          "⚠️ SessyNote: Field config missing field_key. Skipping."
        );
        continue;
      }

      // Try primary selector, then fallbacks in order
      const { value, selectorUsed } = tryFieldSelectors(
        fieldConfig,
        fieldKey,
        root
      );

      // Store the value using api_name (snake_case) as the storage key
      if (value) {
        const storageKey = apiName || fieldKey;
        scrapedData[storageKey] = value;
        console.log(
          `💾 SessyNote: Stored ${storageKey} (via ${selectorUsed}):`,
          value
        );
      } else {
        console.warn(
          `⚠️ SessyNote: No value found for field ${fieldKey} after trying all selectors`
        );
      }
    } catch (error) {
      console.error(
        `❌ SessyNote: Error scraping field ${fieldConfig.field_key || "unknown"}:`,
        error
      );
    }
  }

  console.log(
    "✅ SessyNote: Scrape complete. Collected",
    Object.keys(scrapedData).length,
    "fields"
  );
  return scrapedData;
}
