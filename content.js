// Create and inject the floating toggle button on web pages
(async function () {
  // Check if button already exists
  if (
    document.getElementById("sessynote-toggle-btn") ||
    document.getElementById("sessynote-detect-btn")
  ) {
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
                chrome.runtime.lastError.message || chrome.runtime.lastError
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

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "sidePanelClosed") {
      toggleBtn.title = "Open SessyNote";
    } else if (message.action === "sidePanelOpened") {
      toggleBtn.title = "Close SessyNote";
    } else if (message.action === "startBlinking") {
      // Blinking has been intentionally disabled (UI change request)
      toggleBtn.style.backgroundColor = "white";
      toggleBtn.title = "Open SessyNote";
    } else if (message.action === "stopBlinking") {
      // Blinking has been intentionally disabled (UI change request)
      toggleBtn.style.backgroundColor = "white";
      toggleBtn.title = "Toggle SessyNote";
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

  // Create a top-right "Detect Session" button (manual detection trigger)
  const detectBtn = document.createElement("button");
  detectBtn.id = "sessynote-detect-btn";
  detectBtn.type = "button";
  detectBtn.innerHTML = "📋 Detect Session";
  detectBtn.title = "Detect session on this page";
  detectBtn.style.cssText = `
    position: fixed;
    top: 92px;
    right: 16px;
    height: 40px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background: #43a047;
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 2147483647;
  `;

  detectBtn.addEventListener("click", async () => {
    if (detectBtn.disabled) return;

    detectBtn.disabled = true;
    const originalLabel = detectBtn.innerHTML;
    detectBtn.innerHTML = "⏳ Detecting...";
    detectBtn.style.opacity = "0.9";

    try {
      const matchedConfigs = await resolveActiveEmrConfigsForCurrentUrl(
        window.location.href
      );
      if (!Array.isArray(matchedConfigs) || !matchedConfigs.length) {
        showDetectionStatus(
          "No EMR configuration matched this URL. Please verify your EMR setup.",
          "error",
          { duration: 5000 }
        );
        return;
      }

      const matchedConfig = await showEmrMatchSelector(matchedConfigs);
      if (!matchedConfig?.emrTypeId) {
        showDetectionStatus("Detection canceled. No EMR type selected.", "warning");
        return;
      } 

      activeEmrConfig = matchedConfig;

      const fullBodyHtml = await withExpandedScrollableContent(async () => {
        await autoScrollForLazyContent();
        return buildLiveBodyHtmlSnapshot();
      });
      const linkedSessionContext = getLastClickedSessionContext();

      if (!fullBodyHtml.trim()) {
        showDetectionStatus("Page body is empty. Nothing to analyze.", "warning");
        return;
      }

      showPageProcessingLoader("Analyzing page...");

      showDetectionStatus("Sending page HTML to AI...", "info", {
        autoHide: false,
      });

      const aiResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "extractSessionFromBodyHtml",
            bodyHtml: fullBodyHtml,
            linkedRowHtml: linkedSessionContext.linkedRowHtml,
            linkedTableHeaderHtml: linkedSessionContext.linkedTableHeaderHtml,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({
                success: false,
                error: chrome.runtime.lastError.message,
              });
              return;
            }
            resolve(response || { success: false, error: "No response" });
          }
        );
      });

      if (!aiResponse.success) {
        showDetectionStatus(
          `AI HTML detection failed: ${aiResponse.error || "Unknown error"}`,
          "error",
          { duration: 5000 }
        );
        return;
      }

      console.log("SessyNote: AI HTML extraction result:", aiResponse.scrapedData);

      const rawExtractedData =
        aiResponse.scrapedData && typeof aiResponse.scrapedData === "object"
          ? aiResponse.scrapedData
          : null;
      const extractedNotes =
        rawExtractedData &&
        rawExtractedData.session_notes &&
        typeof rawExtractedData.session_notes === "object"
          ? rawExtractedData.session_notes
          : null;
      const extractedData = rawExtractedData
        ? {
            ...(extractedNotes || {}),
            ...(rawExtractedData.xpath ? { xpath: rawExtractedData.xpath } : {}),
            _rawAiExtraction: rawExtractedData,
          }
        : null;

      if (extractedData && Object.keys(extractedData).length > 0) {
        chrome.runtime.sendMessage({
          action: "autoFillSession",
          data: {
            scrapedData: extractedData,
            emrTypeId: matchedConfig.emrTypeId,
          },
        });
      }

      if (extractedNotes) {
        showDetectionStatus("AI found session notes from page HTML.", "success");
      } else if (extractedData && Object.keys(extractedData).length > 0) {
        showDetectionStatus("AI detected session fields from page HTML.", "success");
      } else {
        showDetectionStatus(
          "AI completed, but no session notes were found.",
          "warning"
        );
      }
    } catch (error) {
      console.error("SessyNote: Error during manual detect:", error);
      showDetectionStatus(
        `Detect failed: ${error?.message || "Unexpected error"}`,
        "error",
        { duration: 5000 }
      );
    } finally {
      hidePageProcessingLoader();
      setTimeout(() => {
        detectBtn.disabled = false;
        detectBtn.innerHTML = originalLabel;
        detectBtn.style.opacity = "1";
      }, 1200);
    }
  });

  document.body.appendChild(detectBtn);

  // Flag indicating the content script was injected and is active
  try {
    window.__sessynote_content_injected = true;
    console.log("SessyNote: Content script injected and active");
  } catch (e) {
    // ignore
  }
})();

// ===============================
// MESSAGE LISTENER FOR CHECKAND SCRAPE (OUTSIDE TOGGLE BUTTON CODE)
// This listener works even if user wasn't logged in when page loaded
// ===============================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("========================================");
  console.log("SessyNote: 📨 Message received at:", new Date().toISOString());
  console.log("SessyNote: Message action:", message.action);
  console.log("========================================");
  
  if (message.action === "checkAndScrape") {
    // Manual-only mode: ignore external auto-trigger messages
    console.log(
      "SessyNote: Manual-only mode active - ignoring checkAndScrape message"
    );
    if (typeof sendResponse === "function") {
      sendResponse({ success: false, manualOnly: true });
    }
    return true;
  }

  if (message.action === "applyAiResponsesToEmrFields") {
    const assignments = Array.isArray(message.assignments)
      ? message.assignments
      : [];

    const result = applyAiResponsesToEmrFields(assignments);

    if (result.filled > 0) {
      showDetectionStatus(
        `Filled ${result.filled}/${result.total} EMR field(s) from AI notes.`,
        "success",
        { duration: 4200 }
      );
    } else {
      showDetectionStatus(
        "Could not match EMR fields for AI autofill.",
        "warning",
        { duration: 4200 }
      );
    }

    if (typeof sendResponse === "function") {
      sendResponse({ success: true, ...result });
    }

    return true;
  }
});

// ===============================
// AUTO-SCRAPING AND SESSION AUTO-FILL
// ===============================

// Check URL on page load and navigation
// Track the currently matched EMR config so we can reuse it (e.g. for popups)
let activeEmrConfig = null; // { emrTypeId, emrResponse }
let detectionStatusHideTimer = null;

function showPageProcessingLoader(message = "Processing...") {
  let overlay = document.getElementById("sessynote-page-loader-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sessynote-page-loader-overlay";
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.18);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
    `;

    overlay.innerHTML = `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:10px;
        background:#ffffff;
        border-radius:12px;
        padding:16px 18px;
        box-shadow:0 10px 28px rgba(0,0,0,0.22);
        min-width:170px;
      ">
        <span class="sessynote-page-loader-ring" aria-hidden="true"></span>
        <span id="sessynote-page-loader-message" style="
          color:#0f172a;
          font-size:13px;
          font-weight:600;
          text-align:center;
        "></span>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  const messageEl = overlay.querySelector("#sessynote-page-loader-message");
  if (messageEl) {
    messageEl.textContent = message;
  }

  overlay.style.display = "flex";

  if (!document.getElementById("sessynote-page-loader-style")) {
    const styleEl = document.createElement("style");
    styleEl.id = "sessynote-page-loader-style";
    styleEl.textContent = `
      @keyframes sessynote-page-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .sessynote-page-loader-ring {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 4px solid rgba(30, 136, 229, 0.18);
        border-top-color: #1e88e5;
        animation: sessynote-page-spin 0.9s linear infinite;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(styleEl);
  }
}

function hidePageProcessingLoader() {
  const overlay = document.getElementById("sessynote-page-loader-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}

// Track the last clicked table row (used when a session popup is opened).
// This lets us evaluate XPath for row-based fields (like Date of Session,
// Time In/Out, Length, Service Type) specifically within the row that
// triggered the popup, without hard-coding any column indices.
let lastClickedSessionRow = null;

function showDetectionStatus(message, type = "info", options = {}) {
  const { autoHide = true, duration = 3200, loading = false } = options;

  let toast = document.getElementById("sessynote-detection-status");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "sessynote-detection-status";
    toast.style.cssText = `
      position: fixed;
      top: 140px;
      right: 16px;
      max-width: 340px;
      padding: 12px 14px;
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      z-index: 2147483647;
      transition: opacity 0.2s ease, transform 0.2s ease;
      opacity: 0;
      transform: translateY(-6px);
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  const palette = {
    info: "#1e88e5",
    success: "#2e7d32",
    warning: "#ef6c00",
    error: "#c62828",
  };

  if (loading) {
    toast.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:10px;">
        <span class="sessynote-loader-ring" aria-hidden="true"></span>
        <span class="sessynote-loader-message"></span>
      </span>
    `;

    const messageEl = toast.querySelector(".sessynote-loader-message");
    if (messageEl) {
      messageEl.textContent = message;
    }

    if (!document.getElementById("sessynote-loader-style")) {
      const styleEl = document.createElement("style");
      styleEl.id = "sessynote-loader-style";
      styleEl.textContent = `
        @keyframes sessynote-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .sessynote-loader-ring {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #ffffff;
          animation: sessynote-spin 0.8s linear infinite;
          flex: 0 0 auto;
        }
      `;
      document.head.appendChild(styleEl);
    }
  } else {
    toast.textContent = message;
  }

  toast.style.background = palette[type] || palette.info;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  if (detectionStatusHideTimer) {
    clearTimeout(detectionStatusHideTimer);
    detectionStatusHideTimer = null;
  }

  if (autoHide) {
    detectionStatusHideTimer = setTimeout(() => {
      const currentToast = document.getElementById("sessynote-detection-status");
      if (!currentToast) return;
      currentToast.style.opacity = "0";
      currentToast.style.transform = "translateY(-6px)";
    }, duration);
  }
}

function getDisplayNameForEmrMatch(match, index) {
  const emrType = match?.emrType || {};
  return (
    emrType.name ||
    emrType.emr_name ||
    emrType.title ||
    `EMR Type ${match?.emrTypeId || index + 1}`
  );
}

function resolveActiveEmrConfigsForCurrentUrl(currentUrl) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "checkUrlAgainstAllPairs", currentUrl },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "SessyNote: Failed to resolve EMR config for manual detect:",
            chrome.runtime.lastError
          );
          resolve(null);
          return;
        }

        if (
          !response?.success ||
          !response?.matched ||
          !Array.isArray(response.matches)
        ) {
          resolve([]);
          return;
        }

        const matches = response.matches
          .map((match) => {
            const emrType = match.emrType || {};
            const emrResponse = match.emrResponse || null;
            return {
              emrTypeId: match.emrTypeId,
              emrResponse,
              emrType,
              isPopup: !!emrType.is_popup || !!emrResponse?.is_popup,
              popupRootSelector:
                emrType.popup_root_selector ||
                emrResponse?.popup_root_selector ||
                null,
            };
          });

        if (!matches.length) {
          resolve([]);
          return;
        }

        resolve(matches);
      }
    );
  });
}

function showEmrMatchSelector(matches) {
  return new Promise((resolve) => {
    if (!Array.isArray(matches) || !matches.length) {
      resolve(null);
      return;
    }

    const existingModal = document.getElementById("sessynote-emr-selector-modal");
    if (existingModal) {
      existingModal.remove();
    }

    const backdrop = document.createElement("div");
    backdrop.id = "sessynote-emr-selector-modal";
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      width: min(440px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.28);
      padding: 18px;
      color: #1f2937;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const title = document.createElement("div");
    title.textContent = "Select EMR Type";
    title.style.cssText = "font-size: 17px; font-weight: 700; margin-bottom: 8px;";

    const subtitle = document.createElement("div");
    subtitle.textContent = `Found ${matches.length} matching EMR configuration${matches.length > 1 ? "s" : ""}.`;
    subtitle.style.cssText = "font-size: 13px; color: #4b5563; margin-bottom: 12px;";

    const select = document.createElement("select");
    select.style.cssText = `
      width: 100%;
      height: 40px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 0 10px;
      font-size: 14px;
      margin-bottom: 14px;
      outline: none;
      background: #fff;
      color: #111827;
    `;

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Choose an EMR type";
    select.appendChild(placeholderOption);

    matches.forEach((match, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = getDisplayNameForEmrMatch(match, index);
      select.appendChild(option);
    });

    if (matches.length === 1) {
      select.value = "0";
    }

    const actions = document.createElement("div");
    actions.style.cssText = "display: flex; gap: 10px; justify-content: flex-end;";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      border: 1px solid #d1d5db;
      background: #fff;
      color: #374151;
      height: 36px;
      padding: 0 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    `;

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.textContent = "Continue";
    confirmBtn.style.cssText = `
      border: none;
      background: #2e7d32;
      color: #fff;
      height: 36px;
      padding: 0 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 700;
    `;

    const cleanupAndResolve = (value) => {
      backdrop.remove();
      resolve(value);
    };

    cancelBtn.addEventListener("click", () => cleanupAndResolve(null));

    confirmBtn.addEventListener("click", () => {
      const selectedIndex = Number(select.value);
      if (Number.isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= matches.length) {
        showDetectionStatus("Please choose an EMR type from the list.", "warning");
        return;
      }

      cleanupAndResolve(matches[selectedIndex]);
    });

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        cleanupAndResolve(null);
      }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(select);
    card.appendChild(actions);
    backdrop.appendChild(card);

    document.body.appendChild(backdrop);
    select.focus();
  });
}

function getLastClickedSessionContext() {
  if (!lastClickedSessionRow) {
    return {
      linkedRowHtml: "",
      linkedTableHeaderHtml: "",
    };
  }

  const table = lastClickedSessionRow.closest("table");
  const thead = table?.querySelector("thead");
  const headerRow = thead?.querySelector("tr");

  return {
    linkedRowHtml: lastClickedSessionRow.outerHTML || "",
    linkedTableHeaderHtml: headerRow?.outerHTML || thead?.outerHTML || "",
  };
}

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

// Initialize manual mode helpers (no auto-scraping)
(async function () {
  console.log("SessyNote: Manual detection mode initialized");

  // Listen for URL changes (for SPAs)
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(async () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log("SessyNote: URL changed to", lastUrl);

      // Reset state for the new URL
      activeEmrConfig = null;
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

function notifySaveSessionPrompt(reason) {
  try {
    chrome.storage.local.set({
      pendingSavePrompt: true,
      pendingSavePromptReason: reason,
      pendingSavePromptAt: Date.now(),
    });
  } catch (e) {
    console.error("SessyNote: Failed to set pending save prompt:", e);
  }

  chrome.runtime.sendMessage({ action: "showSavePrompt", reason }, () => {
    if (chrome.runtime.lastError) {
      // Side panel may be closed - pending flag will show prompt later
      console.log(
        "SessyNote: Save prompt message not delivered (panel likely closed)"
      );
    }
  });
}

function normalizeLabelText(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .replace(/[:*]+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dispatchFormUpdateEvents(element) {
  if (!element) return;

  ["input", "change", "blur"].forEach((eventName) => {
    try {
      element.dispatchEvent(new Event(eventName, { bubbles: true }));
    } catch (e) {
      // Ignore dispatch errors for non-standard controls
    }
  });
}

function setNativeFieldValue(element, value) {
  if (!element) return;

  const stringValue = value == null ? "" : String(value);
  const tagName = (element.tagName || "").toUpperCase();

  if (tagName === "INPUT") {
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    );
    if (descriptor?.set) {
      descriptor.set.call(element, stringValue);
    } else {
      element.value = stringValue;
    }
    return;
  }

  if (tagName === "TEXTAREA") {
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    );
    if (descriptor?.set) {
      descriptor.set.call(element, stringValue);
    } else {
      element.value = stringValue;
    }
    return;
  }

  if (tagName === "SELECT") {
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    );
    if (descriptor?.set) {
      descriptor.set.call(element, stringValue);
    } else {
      element.value = stringValue;
    }
    return;
  }

  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    element.textContent = stringValue;
  }
}

function isEditableFieldElement(element) {
  if (!element) return false;
  if (element.disabled) return false;

  const tagName = (element.tagName || "").toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (element.isContentEditable) return true;
  if (element.getAttribute && element.getAttribute("contenteditable") === "true") {
    return true;
  }

  return false;
}

function isVisibleEditableField(element) {
  if (!isEditableFieldElement(element)) return false;

  try {
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    const style = window.getComputedStyle(element);
    if (!style) return false;
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity || "1") === 0) return false;

    return true;
  } catch (error) {
    return true;
  }
}

function getEditableFieldPriority(element) {
  if (!isEditableFieldElement(element)) return 0;

  const tagName = (element.tagName || "").toUpperCase();
  const inputType = (element.type || "text").toLowerCase();

  if (tagName === "TEXTAREA") return 100;
  if (element.isContentEditable || element.getAttribute?.("contenteditable") === "true") {
    return 95;
  }
  if (tagName === "INPUT" && inputType === "text") return 90;
  if (tagName === "INPUT") return 70;
  if (tagName === "SELECT") return 60;

  return 50;
}

function isFollowingNode(referenceNode, candidateNode) {
  if (!referenceNode || !candidateNode || referenceNode === candidateNode) {
    return false;
  }

  try {
    return Boolean(
      referenceNode.compareDocumentPosition(candidateNode) &
        Node.DOCUMENT_POSITION_FOLLOWING
    );
  } catch (error) {
    return false;
  }
}

function pickNearestEditableField(labelElement, candidates) {
  const visibleCandidates = (candidates || []).filter(isVisibleEditableField);
  if (!visibleCandidates.length) {
    return (candidates || []).find(isEditableFieldElement) || null;
  }

  const followingCandidates = visibleCandidates.filter((candidate) =>
    isFollowingNode(labelElement, candidate)
  );

  if (followingCandidates.length) {
    return followingCandidates[0];
  }

  return visibleCandidates[0];
}

function setEditableFieldValue(element, value) {
  if (!element || !isEditableFieldElement(element)) {
    return false;
  }

  const stringValue = value == null ? "" : String(value);
  const tagName = (element.tagName || "").toUpperCase();

  if (tagName === "SELECT") {
    const options = Array.from(element.options || []);
    const normalizedTarget = normalizeLabelText(stringValue);

    const matchingOption = options.find((option) => {
      const optionValue = normalizeLabelText(option.value || "");
      const optionText = normalizeLabelText(option.textContent || "");
      return optionValue === normalizedTarget || optionText === normalizedTarget;
    });

    if (!matchingOption) {
      return false;
    }

    setNativeFieldValue(element, matchingOption.value);
    dispatchFormUpdateEvents(element);
    return true;
  }

  if (tagName === "INPUT") {
    const inputType = (element.type || "text").toLowerCase();
    if (inputType === "checkbox" || inputType === "radio") {
      const normalized = normalizeLabelText(stringValue);
      element.checked = ["true", "yes", "1", "on", "checked"].includes(normalized);
    } else {
      setNativeFieldValue(element, stringValue);
    }
    dispatchFormUpdateEvents(element);
    return true;
  }

  if (tagName === "TEXTAREA") {
    setNativeFieldValue(element, stringValue);
    dispatchFormUpdateEvents(element);
    return true;
  }

  // contenteditable fallback
  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    setNativeFieldValue(element, stringValue);
    dispatchFormUpdateEvents(element);
    return true;
  }

  return false;
}

function findEditableFieldNearLabel(labelElement) {
  if (!labelElement) return null;

  const directForId =
    labelElement.getAttribute && labelElement.getAttribute("for");
  if (directForId) {
    const linked = document.getElementById(directForId);
    if (isEditableFieldElement(linked)) return linked;
  }

  const directSelf = labelElement.matches?.(
    "input, textarea, select, [contenteditable='true']"
  )
    ? labelElement
    : null;
  if (isVisibleEditableField(directSelf)) {
    return directSelf;
  }

  const nearbySelectors =
    "input, textarea, select, [contenteditable='true'], [role='textbox']";

  if (labelElement.nextElementSibling) {
    const siblingCandidates = [
      labelElement.nextElementSibling.matches?.(nearbySelectors)
        ? labelElement.nextElementSibling
        : null,
      ...Array.from(
        labelElement.nextElementSibling.querySelectorAll?.(nearbySelectors) || []
      ),
    ].filter(Boolean);
    const siblingField = pickNearestEditableField(labelElement, siblingCandidates);
    if (siblingField) return siblingField;
  }

  if (labelElement.parentElement) {
    const parentCandidates = Array.from(
      labelElement.parentElement.querySelectorAll(nearbySelectors)
    );
    const parentField = pickNearestEditableField(labelElement, parentCandidates);
    if (parentField) return parentField;
  }

  const rowLike = labelElement.closest?.(
    "tr, .detail-item, .session-detail-item, .form-group, .input-group, li, .slds-form-element, .field-row, .row"
  );
  if (rowLike) {
    const rowCandidates = Array.from(rowLike.querySelectorAll(nearbySelectors));
    const rowField = pickNearestEditableField(labelElement, rowCandidates);
    if (rowField) return rowField;
  }

  return null;
}

function findEditableFieldByLabelText(labelText, root = document) {
  const normalizedLabel = normalizeLabelText(labelText);
  if (!normalizedLabel) return null;

  const selector = [
    "label",
    "span",
    "div",
    "td",
    "th",
    "p",
    "strong",
    "b",
    "li",
    ".detail-label",
    ".field-label",
    ".label",
    "[aria-label]",
    "[data-label]",
  ].join(", ");

  const elements = Array.from(root.querySelectorAll(selector));

  for (const element of elements) {
    const elementLabel = normalizeLabelText(
      element.getAttribute?.("aria-label") ||
        element.getAttribute?.("data-label") ||
        element.textContent ||
        ""
    );

    if (!elementLabel) continue;

    const isMatch =
      elementLabel === normalizedLabel ||
      elementLabel.startsWith(`${normalizedLabel} `) ||
      elementLabel.includes(`${normalizedLabel}:`) ||
      elementLabel.includes(` ${normalizedLabel} `);

    if (!isMatch) continue;

    const fieldElement = findEditableFieldNearLabel(element);
    if (isEditableFieldElement(fieldElement)) {
      return fieldElement;
    }
  }

  return null;
}

function applyAiResponsesToEmrFields(assignments) {
  const result = {
    total: Array.isArray(assignments) ? assignments.length : 0,
    filled: 0,
    missing: [],
    details: [],
  };

  if (!Array.isArray(assignments) || !assignments.length) {
    console.log("SessyNote: No AI autofill assignments received.");
    return result;
  }

  console.log("SessyNote: Applying AI autofill assignments:", assignments);

  assignments.forEach((assignment) => {
    const fieldName = (assignment?.fieldName || "").toString().trim();
    const value = assignment?.value;

    if (!fieldName) {
      result.details.push({
        fieldName: "",
        status: "skipped",
        reason: "Missing fieldName in assignment",
      });
      return;
    }

    const valuePreview = (value == null ? "" : String(value)).slice(0, 120);

    console.log("SessyNote: Looking for field by label:", {
      fieldName,
      valuePreview,
    });

    const targetField = findEditableFieldByLabelText(fieldName, document);
    if (!targetField) {
      console.warn("SessyNote: No editable field matched label:", fieldName);
      result.missing.push(fieldName);
      result.details.push({
        fieldName,
        status: "missing",
        reason: "No editable field matched the label",
        valuePreview,
      });
      return;
    }

    console.log("SessyNote: Matched editable field:", describeEditableElement(targetField));

    const filled = setEditableFieldValue(targetField, value);
    if (filled) {
      result.filled += 1;
      const finalValue = getElementFieldValue(targetField);
      const matches = normalizeLabelText(finalValue) === normalizeLabelText(value);

      console.log("SessyNote: Field filled successfully:", {
        fieldName,
        finalValue,
        matchesExpectedValue: matches,
      });

      result.details.push({
        fieldName,
        status: matches ? "filled" : "filled-but-mismatch",
        reason: matches
          ? "Value set and verified"
          : "Value was set, but the element value does not match after write",
        targetField: describeEditableElement(targetField),
        valuePreview,
        finalValue,
      });
    } else {
      console.warn("SessyNote: Failed to set field value:", {
        fieldName,
        targetField: describeEditableElement(targetField),
      });
      result.missing.push(fieldName);
      result.details.push({
        fieldName,
        status: "missing",
        reason: "Field was matched, but the value could not be set",
        targetField: describeEditableElement(targetField),
        valuePreview,
      });
    }
  });

  console.log("SessyNote: AI autofill result summary:", result);

  return result;
}

function formatFieldNameForLabelLookup(value) {
  return (value || "")
    .toString()
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function getFieldLabelCandidates(fieldConfig) {
  const rawCandidates = [
    fieldConfig.label,
    fieldConfig.field_label,
    fieldConfig.display_label,
    fieldConfig.page_label,
    fieldConfig.name,
    fieldConfig.field_key,
    fieldConfig.api_name,
  ];

  if (Array.isArray(fieldConfig.labels)) {
    rawCandidates.push(...fieldConfig.labels);
  }

  if (Array.isArray(fieldConfig.aliases)) {
    rawCandidates.push(...fieldConfig.aliases);
  }

  const seen = new Set();
  const candidates = [];

  rawCandidates.forEach((candidate) => {
    if (!candidate) return;

    [candidate, formatFieldNameForLabelLookup(candidate)].forEach((variant) => {
      const normalized = normalizeLabelText(variant);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(variant.toString().trim());
    });
  });

  return candidates;
}

function getElementFieldValue(element) {
  if (!element) return "";

  const tagName = (element.tagName || "").toUpperCase();
  if (tagName === "INPUT") {
    const inputType = (element.type || "text").toLowerCase();
    if (inputType === "checkbox" || inputType === "radio") {
      return element.checked ? "Yes" : "";
    }
    return (element.value || "").trim();
  }

  if (tagName === "TEXTAREA") {
    return (element.value || element.textContent || "").trim();
  }

  if (tagName === "SELECT") {
    const selectedOption = element.options[element.selectedIndex];
    return ((selectedOption && selectedOption.textContent) || element.value || "")
      .toString()
      .trim();
  }

  return (element.textContent || "").trim();
}

function describeEditableElement(element) {
  if (!element) return null;

  return {
    tagName: element.tagName || "",
    id: element.id || "",
    name: element.name || "",
    type: element.type || "",
    placeholder: element.getAttribute?.("placeholder") || "",
    ariaLabel: element.getAttribute?.("aria-label") || "",
    className: element.className || "",
    value: getElementFieldValue(element),
  };
}

function isMeaningfulExtractedValue(value, normalizedLabel = "") {
  if (!value) return false;

  const normalizedValue = normalizeLabelText(value);
  if (!normalizedValue) return false;
  if (normalizedLabel && normalizedValue === normalizedLabel) return false;

  const emptyTokens = new Set([
    "-",
    "--",
    "na",
    "n a",
    "none",
    "null",
    "undefined",
    "select",
    "select option",
    "not specified",
  ]);

  return !emptyTokens.has(normalizedValue);
}

function extractValueNearLabelElement(labelElement, normalizedLabel) {
  if (!labelElement) return "";

  const directForId =
    labelElement.getAttribute && labelElement.getAttribute("for");
  if (directForId) {
    const linkedField = document.getElementById(directForId);
    const linkedValue = getElementFieldValue(linkedField);
    if (isMeaningfulExtractedValue(linkedValue, normalizedLabel)) {
      return linkedValue;
    }
  }

  const inlineText = (labelElement.textContent || "").trim();
  const inlineMatch = inlineText.match(/^(.+?):\s*(.+)$/);
  if (inlineMatch) {
    const possibleValue = inlineMatch[2].trim();
    if (isMeaningfulExtractedValue(possibleValue, normalizedLabel)) {
      return possibleValue;
    }
  }

  const siblingCandidates = [];
  if (labelElement.nextElementSibling) {
    siblingCandidates.push(labelElement.nextElementSibling);
  }
  if (labelElement.parentElement) {
    siblingCandidates.push(
      ...Array.from(labelElement.parentElement.children).filter(
        (child) => child !== labelElement
      )
    );
  }

  for (const candidate of siblingCandidates) {
    const nestedField = candidate.matches?.("input, textarea, select")
      ? candidate
      : candidate.querySelector?.(
          "input, textarea, select, .detail-value, [contenteditable='true']"
        );
    const value = getElementFieldValue(nestedField || candidate);
    if (isMeaningfulExtractedValue(value, normalizedLabel)) {
      return value;
    }
  }

  const rowLike = labelElement.closest?.(
    "tr, .detail-item, .session-detail-item, .form-group, .input-group, li, .slds-form-element, .field-row, .row"
  );
  if (rowLike) {
    const rowSpecific = rowLike.querySelector(
      ".detail-value, .value, .field-value, [data-value], input, textarea, select, [contenteditable='true']"
    );
    const rowValue = getElementFieldValue(rowSpecific);
    if (isMeaningfulExtractedValue(rowValue, normalizedLabel)) {
      return rowValue;
    }

    const rowCells = Array.from(rowLike.querySelectorAll("td, th, span, div"))
      .map((element) => getElementFieldValue(element))
      .filter((value) => isMeaningfulExtractedValue(value, normalizedLabel));
    const cellValue = rowCells.find(
      (value) => normalizeLabelText(value) !== normalizedLabel
    );
    if (cellValue) {
      return cellValue;
    }
  }

  return "";
}

function findValueByLabelCandidates(fieldConfig, root = document) {
  const labels = getFieldLabelCandidates(fieldConfig);
  if (!labels.length) {
    return { value: "", selectorUsed: null };
  }

  const selector = [
    "label",
    "span",
    "div",
    "td",
    "th",
    "p",
    "strong",
    "b",
    "li",
    ".detail-label",
    ".field-label",
    ".label",
    "[aria-label]",
    "[data-label]",
  ].join(", ");

  const elements = Array.from(root.querySelectorAll(selector));

  for (const label of labels) {
    const normalizedLabel = normalizeLabelText(label);
    if (!normalizedLabel) continue;

    for (const element of elements) {
      const elementLabel = normalizeLabelText(
        element.getAttribute?.("aria-label") ||
          element.getAttribute?.("data-label") ||
          element.textContent ||
          ""
      );

      if (!elementLabel) continue;

      const isMatch =
        elementLabel === normalizedLabel ||
        elementLabel.startsWith(`${normalizedLabel} `) ||
        elementLabel.includes(`${normalizedLabel}:`) ||
        elementLabel.includes(` ${normalizedLabel} `);

      if (!isMatch) continue;

      const extractedValue = extractValueNearLabelElement(
        element,
        normalizedLabel
      );
      if (isMeaningfulExtractedValue(extractedValue, normalizedLabel)) {
        console.log(
          `✅ SessyNote: Found value for ${
            fieldConfig.field_key || fieldConfig.api_name || label
          } via label match '${label}':`,
          extractedValue
        );
        return {
          value: extractedValue,
          selectorUsed: `label:${label}`,
        };
      }
    }
  }
  return { value: "", selectorUsed: null };
}

function buildLiveBodyHtmlSnapshot() {
  const liveBody = document.body;
  if (!liveBody) return "";

  // Clone first so we can inject runtime form state without mutating the live page.
  const snapshotBody = liveBody.cloneNode(true);

  const liveFields = liveBody.querySelectorAll("input, textarea, select");
  const snapshotFields = snapshotBody.querySelectorAll("input, textarea, select");

  liveFields.forEach((liveField, index) => {
    const snapshotField = snapshotFields[index];
    if (!snapshotField) return;

    const tagName = (liveField.tagName || "").toUpperCase();
    if (tagName === "INPUT") {
      const inputType = (liveField.type || "text").toLowerCase();
      if (inputType === "checkbox" || inputType === "radio") {
        if (liveField.checked) {
          snapshotField.checked = true;
          snapshotField.setAttribute("checked", "");
        } else {
          snapshotField.checked = false;
          snapshotField.removeAttribute("checked");
        }
      } else {
        const value = liveField.value || "";
        snapshotField.value = value;
        snapshotField.setAttribute("value", value);
      }
      return;
    }

    if (tagName === "TEXTAREA") {
      const value = liveField.value || "";
      snapshotField.value = value;
      snapshotField.textContent = value;
      return;
    }

    if (tagName === "SELECT") {
      const liveOptions = Array.from(liveField.options || []);
      const snapshotOptions = Array.from(snapshotField.options || []);

      snapshotOptions.forEach((option, optionIndex) => {
        const selected = !!liveOptions[optionIndex]?.selected;
        option.selected = selected;
        if (selected) {
          option.setAttribute("selected", "");
        } else {
          option.removeAttribute("selected");
        }
      });

      snapshotField.value = liveField.value;
    }
  });

  return snapshotBody.innerHTML || "";
}

async function withExpandedScrollableContent(task) {
  function findScrollableContainer() {
    const candidates = [];
    const allElements = document.querySelectorAll("*");

    for (const element of allElements) {
      try {
        const style = window.getComputedStyle(element);
        const overflowY = style.overflowY || style.overflow;
        if (overflowY === "auto" || overflowY === "scroll") {
          const scrollable = element.scrollHeight - element.clientHeight;
          if (scrollable > 100) {
            candidates.push({ element, scrollable });
          }
        }
      } catch (error) {
        // Ignore elements that can't be measured cleanly
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.scrollable - a.scrollable);
    return candidates[0].element;
  }

  const scrollContainer = findScrollableContainer();
  if (!scrollContainer) {
    return task();
  }

  const originalStyles = {
    height: scrollContainer.style.height,
    maxHeight: scrollContainer.style.maxHeight,
    overflow: scrollContainer.style.overflow,
    overflowY: scrollContainer.style.overflowY,
  };

  try {
    scrollContainer.style.height = "auto";
    scrollContainer.style.maxHeight = "none";
    scrollContainer.style.overflow = "visible";
    scrollContainer.style.overflowY = "visible";
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return await task();
  } finally {
    scrollContainer.style.height = originalStyles.height;
    scrollContainer.style.maxHeight = originalStyles.maxHeight;
    scrollContainer.style.overflow = originalStyles.overflow;
    scrollContainer.style.overflowY = originalStyles.overflowY;
  }
}

function getScrollableElements(minScrollableDistance = 120) {
  const elements = [];
  const allElements = document.querySelectorAll("*");

  for (const element of allElements) {
    try {
      if (!(element instanceof HTMLElement)) continue;

      const style = window.getComputedStyle(element);
      const overflowY = style.overflowY || style.overflow;
      if (overflowY !== "auto" && overflowY !== "scroll") continue;

      const scrollableDistance = element.scrollHeight - element.clientHeight;
      if (scrollableDistance < minScrollableDistance) continue;

      elements.push(element);
    } catch (error) {
      // Ignore elements that cannot be inspected
    }
  }

  elements.sort(
    (a, b) =>
      b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight)
  );

  return elements;
}

async function scrollElementToLoadContent(target, options = {}) {
  const {
    stepPx = 900,
    pauseMs = 120,
    maxSteps = 200,
    resetToTop = false,
  } = options;

  if (!target) return;

  const originalScrollTop = target.scrollTop;
  let previousHeight = 0;
  let stableHeightRounds = 0;

  for (let i = 0; i < maxSteps; i++) {
    const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight);
    if (target.scrollTop >= maxScrollTop) {
      stableHeightRounds += 1;
      if (stableHeightRounds >= 2) break;
    }

    const nextTop = Math.min(target.scrollTop + stepPx, maxScrollTop);
    target.scrollTop = nextTop;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));

    if (target.scrollHeight > previousHeight) {
      previousHeight = target.scrollHeight;
      stableHeightRounds = 0;
    }
  }

  if (resetToTop) {
    target.scrollTop = 0;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  target.scrollTop = originalScrollTop;
}

async function autoScrollForLazyContent() {
  const pageScroller = document.scrollingElement || document.documentElement;
  const originalWindowX = window.scrollX;
  const originalWindowY = window.scrollY;

  const scrollableElements = getScrollableElements();
  const elementOriginalPositions = scrollableElements.map((element) => ({
    element,
    top: element.scrollTop,
  }));

  try {
    await scrollElementToLoadContent(pageScroller, {
      stepPx: Math.max(700, Math.floor(window.innerHeight * 0.9)),
      pauseMs: 130,
      maxSteps: 180,
    });

    for (const element of scrollableElements) {
      await scrollElementToLoadContent(element, {
        stepPx: Math.max(500, Math.floor(element.clientHeight * 0.9)),
        pauseMs: 110,
        maxSteps: 120,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 160));
  } finally {
    for (const item of elementOriginalPositions) {
      item.element.scrollTop = item.top;
    }
    window.scrollTo(originalWindowX, originalWindowY);
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

  const labelBasedResult = findValueByLabelCandidates(fieldConfig, contextRoot);
  if (labelBasedResult.value) {
    return labelBasedResult;
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
