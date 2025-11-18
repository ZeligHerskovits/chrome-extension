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

  // Create the toggle button
  const toggleBtn = document.createElement("div");
  toggleBtn.id = "sessynote-toggle-btn";
  toggleBtn.innerHTML =
    '<img src="' +
    chrome.runtime.getURL("icons/icon48.png") +
    '" style="width: 32px; height: 32px; object-fit: contain;">';
  toggleBtn.title = "Toggle SessyNote";

  // Add styles
  toggleBtn.style.cssText = `
    position: fixed;
    right: 0;
    top: 50%;
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
    transition: all 0.3s ease;
    user-select: none;
    border: 1px solid #e0e0e0;
    border-right: none;
  `;

  // Hover effect
  toggleBtn.addEventListener("mouseenter", () => {
    toggleBtn.style.backgroundColor = "#f8f8f8";
    toggleBtn.style.width = "52px";
  });

  toggleBtn.addEventListener("mouseleave", () => {
    toggleBtn.style.backgroundColor = "white";
    toggleBtn.style.width = "48px";
  });

  // Click handler - toggles the side panel
  toggleBtn.addEventListener("click", () => {
    console.log("SessyNote: Toggle button clicked");
    chrome.runtime.sendMessage({ action: "toggleSidePanel" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "SessyNote: Error sending message:",
          chrome.runtime.lastError
        );
      } else {
        console.log("SessyNote: Message sent successfully");
      }
    });
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

  // Inject into page
  document.body.appendChild(toggleBtn);
})();

// ===============================
// AUTO-SCRAPING AND SESSION AUTO-FILL
// ===============================

// Check URL on page load and navigation
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
      await checkAndScrapeIfMatch();
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });
})();

async function checkAndScrapeIfMatch() {
  try {
    // Get stored EMR URL and type ID
    const storage = await chrome.storage.local.get(["emrUrl", "emrTypeId"]);

    if (!storage.emrUrl || !storage.emrTypeId) {
      console.log("SessyNote: No EMR URL or type ID stored, skipping");
      return;
    }

    // Extract domain from current URL
    const currentDomain = window.location.hostname;

    console.log(
      "SessyNote: Comparing domains:",
      currentDomain,
      "vs",
      storage.emrUrl
    );

    // Check if domains match
    if (currentDomain === storage.emrUrl) {
      console.log("SessyNote: Domain match! Starting scrape...");

      // Ask background script to fetch EMR type (to avoid CORS)
      chrome.runtime.sendMessage(
        { action: "fetchEMRType", emrTypeId: storage.emrTypeId },
        async (response) => {
          if (response && response.success && response.emrType) {
            const emrType = response.emrType;

            if (!emrType.response) {
              console.error("SessyNote: No response field in EMR type");
              return;
            }

            // Wait for QuickBase page to fully load (takes longer due to dynamic content)
            await new Promise((resolve) => setTimeout(resolve, 10000));

            // Scrape data from page
            const scrapedData = scrapePageData(emrType.response);

            console.log("SessyNote: Scraped data:", scrapedData);

            // Check if at least 5 values were found
            const foundValuesCount = Object.keys(scrapedData).length;
            if (foundValuesCount < 5) {
              console.log(
                `SessyNote: Only found ${foundValuesCount} value(s). Need at least 5 to consider this a session page. Skipping...`
              );
              return;
            }

            console.log(
              `SessyNote: Found ${foundValuesCount} values - this appears to be a session page. Proceeding...`
            );

            // Send to background script
            chrome.runtime.sendMessage({
              action: "autoFillSession",
              data: {
                scrapedData: scrapedData,
                emrTypeId: storage.emrTypeId,
              },
            });
          } else {
            console.error(
              "SessyNote: Failed to fetch EMR type:",
              response?.error
            );
          }
        }
      );
    } else {
      console.log("SessyNote: Domain does not match, skipping");
    }
  } catch (error) {
    console.error("SessyNote: Error in checkAndScrapeIfMatch:", error);
  }
}

function scrapePageData(responseFields) {
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
        try {
          const result = document.evaluate(
            source.xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          element = result.singleNodeValue;

          if (element) {
            value = element.textContent.trim();
            console.log(`✅ SessyNote: Found ${fieldName} via XPath:`, value);
          } else {
            console.warn(
              `❌ SessyNote: XPath returned no element for ${fieldName}`
            );
          }
        } catch (xpathError) {
          console.error(
            `❌ SessyNote: XPath error for ${fieldName}:`,
            xpathError
          );
        }
      }
      // Handle CSS selectors (fallback)
      else if (source.selector) {
        console.log(
          `🔍 SessyNote: Using CSS selector for ${fieldName}:`,
          source.selector
        );
        element = document.querySelector(source.selector);

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
