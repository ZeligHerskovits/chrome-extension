// New background script for capturing complete web pages
// This captures the current tab's HTML, CSS, and data and downloads it as a standalone HTML file

// API Base URL
const API_BASE_URL = "https://noteddevapi.objectif.solutions/api/v1";

// Track side panel state per window
const sidePanelState = new Map();
let clickCount = 0;
let lastClickTime = 0;

// Handle extension icon click to toggle side panel
chrome.action.onClicked.addListener(async (tab) => {
  clickCount++;
  const now = Date.now();
  const timeSinceLastClick = now - lastClickTime;
  lastClickTime = now;
  
  console.log("======================================");
  console.log(`SessyNote: Extension icon clicked #${clickCount}`);
  console.log(`SessyNote: Time since last click: ${timeSinceLastClick}ms`);
  console.log("SessyNote: Tab info:", {
    id: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    status: tab.status
  });
  console.log("SessyNote: Current side panel state:", sidePanelState.get(tab.windowId));
  
  try {
    console.log("SessyNote: Attempting to open side panel...");
    const startTime = Date.now();
    
    await chrome.sidePanel.open({ windowId: tab.windowId });
    
    const duration = Date.now() - startTime;
    console.log(`SessyNote: ✅ Side panel opened successfully in ${duration}ms`);
    sidePanelState.set(tab.windowId, true);
  } catch (error) {
    console.error("SessyNote: ❌ Error opening side panel:", error);
    console.error("SessyNote: Error name:", error.name);
    console.error("SessyNote: Error message:", error.message);
    console.error("SessyNote: Error stack:", error.stack);
    
    // Try to get more info about why it failed
    try {
      const windows = await chrome.windows.getAll();
      console.log("SessyNote: Available windows:", windows.map(w => w.id));
    } catch (e) {
      console.error("SessyNote: Could not get windows:", e);
    }
  }
  console.log("======================================");
});

// ===============================
// AUTO-LOGOUT ON INACTIVITY
// ===============================
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
let inactivityTimer = null;

// Function to perform logout
function performAutoLogout() {
  console.log("⏰ Background: Auto-logout triggered due to inactivity");
  
  // Clear all auth data
  chrome.storage.local.remove(
    [
      "isLoggedIn",
      "userEmail",
      "accessToken",
      "pendingLogin",
      "emrUrl",
      "emrTypeId",
      "emrResponse",
      "pendingSessionData",
      "sessionDataTimestamp",
    ],
    function () {
      console.log("✅ Background: User auto-logged out due to inactivity");
    }
  );
}

// Function to reset the inactivity timer
function resetInactivityTimer() {
  // Check if user is logged in
  chrome.storage.local.get(["isLoggedIn"], function (result) {
    if (!result.isLoggedIn) {
      // Don't set timer if not logged in
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      return;
    }

    // Clear existing timer
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }

    // Set new timer
    inactivityTimer = setTimeout(performAutoLogout, INACTIVITY_TIMEOUT);
    
    console.log("🔄 Background: Inactivity timer reset (15 minutes)");
  });
}

// Listen for storage changes to detect login/logout
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.isLoggedIn) {
    if (changes.isLoggedIn.newValue === true) {
      // User logged in, start timer
      console.log("✅ Background: User logged in, starting inactivity timer");
      resetInactivityTimer();
    } else if (changes.isLoggedIn.newValue === false) {
      // User logged out, clear timer
      console.log("🚫 Background: User logged out, clearing inactivity timer");
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    }
  }
  
  // Reset timer on any activity indicator
  if (namespace === "local" && changes.lastActivityTime) {
    resetInactivityTimer();
  }
});

// Initialize timer on startup if user is already logged in
chrome.storage.local.get(["isLoggedIn"], function (result) {
  if (result.isLoggedIn) {
    console.log("✅ Background: User already logged in on startup, starting inactivity timer");
    resetInactivityTimer();
  }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle page capture for download
  if (message.action === "captureAndDownload") {
    // Get the active tab since message comes from popup/side panel
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        handlePageCapture(tabs[0].id, tabs[0].url);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "No active tab found" });
      }
    });
    return true; // Keep channel open for async response
  }

  // Handle page capture for API (returns HTML instead of downloading)
  if (message.action === "captureForAPI") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        try {
          const html = await handlePageCaptureForAPI(tabs[0].id, tabs[0].url);
          sendResponse({ success: true, html: html });
        } catch (error) {
          console.error("Error capturing page for API:", error);
          sendResponse({ success: false, error: error.message });
        }
      } else {
        sendResponse({ success: false, error: "No active tab found" });
      }
    });
    return true; // Keep channel open for async response
  }

  // Handle check URL against all EMR type pairs
  if (message.action === "checkUrlAgainstAllPairs") {
    console.log(
      "SessyNote: Checking URL against all pairs:",
      message.currentUrl
    );

    chrome.storage.local.get(["accessToken"], async (tokenResult) => {
      if (!tokenResult.accessToken) {
        sendResponse({ success: false, error: "No access token" });
        return;
      }

      try {
        const currentDomain = new URL(message.currentUrl).hostname;
        console.log("SessyNote: Current domain:", currentDomain);

        // Step 1: Fetch user profile
        const profileResponse = await fetch(`${API_BASE_URL}/me`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!profileResponse.ok) {
          throw new Error(`Failed to fetch profile: ${profileResponse.status}`);
        }

        const profileData = await profileResponse.json();
        const pairs = profileData.emr_type_documentation_pairs || [];

        if (pairs.length === 0) {
          console.log("SessyNote: No EMR type pairs found in profile");
          sendResponse({ success: false, error: "No EMR type pairs found" });
          return;
        }

        console.log(
          `SessyNote: Found ${pairs.length} pair(s), checking each...`
        );

        // Step 2: Loop through all pairs and check URL match
        for (const pair of pairs) {
          const emrTypeId = pair.emr_type_id;
          console.log(
            `SessyNote: Checking pair with EMR Type ID: ${emrTypeId}`
          );

          // Fetch EMR type details
          const emrTypeResponse = await fetch(
            `${API_BASE_URL}/emr-types/${emrTypeId}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${tokenResult.accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!emrTypeResponse.ok) {
            console.warn(
              `SessyNote: Failed to fetch EMR type ${emrTypeId}, skipping`
            );
            continue;
          }

          const emrTypeData = await emrTypeResponse.json();
          const emrUrl = emrTypeData.emr_url || "";

          console.log(`SessyNote: EMR Type ${emrTypeId} URL: ${emrUrl}`);

          // Check if URL matches
          if (currentDomain === emrUrl) {
            console.log(
              `SessyNote: ✅ URL match found! Using EMR Type ID: ${emrTypeId}`
            );

            // Parse json_response field if it's a JSON string
            let emrResponse = emrTypeData.json_response;
            if (emrResponse && typeof emrResponse === "string") {
              try {
                emrResponse = JSON.parse(emrResponse);
              } catch (e) {
                console.error(
                  "SessyNote: Failed to parse json_response field:",
                  e
                );
              }
            }

            sendResponse({
              success: true,
              matched: true,
              emrTypeId: emrTypeId,
              emrType: emrTypeData,
              emrResponse: emrResponse,
            });
            return;
          } else {
            console.log(
              `SessyNote: ❌ No match for EMR Type ${emrTypeId}, continuing...`
            );
          }
        }

        // No match found
        console.log("SessyNote: No URL match found in any pair");
        sendResponse({
          success: true,
          matched: false,
        });
      } catch (error) {
        console.error("SessyNote: Error checking URL against pairs:", error);
        sendResponse({ success: false, error: error.message });
      }
    });
    return true; // Keep channel open for async response
  }

  // Handle fetch EMR type request from content script
  if (message.action === "fetchEMRType") {
    console.log("SessyNote: Fetching EMR type from cache:", message.emrTypeId);

    chrome.storage.local.get(["emrResponse", "emrTypeId"], async (result) => {
      // Use cached response if available
      if (result.emrResponse && result.emrTypeId === message.emrTypeId) {
        console.log("SessyNote: Using cached EMR response");
        sendResponse({
          success: true,
          emrType: {
            id: message.emrTypeId,
            response: result.emrResponse,
          },
        });
      } else {
        console.warn("SessyNote: No cached response found, fetching from API");

        chrome.storage.local.get(["accessToken"], async (tokenResult) => {
          if (!tokenResult.accessToken) {
            sendResponse({ success: false, error: "No access token" });
            return;
          }

          try {
            const response = await fetch(
              `${API_BASE_URL}/emr-types/${message.emrTypeId}`,
              {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${tokenResult.accessToken}`,
                  "Content-Type": "application/json",
                },
              }
            );

            if (!response.ok) {
              throw new Error(`Failed to fetch EMR type: ${response.status}`);
            }

            const emrType = await response.json();

            // Parse json_response field if it's a JSON string
            if (
              emrType.json_response &&
              typeof emrType.json_response === "string"
            ) {
              try {
                emrType.json_response = JSON.parse(emrType.json_response);
              } catch (e) {
                console.error(
                  "SessyNote: Failed to parse json_response field:",
                  e
                );
              }
            }

            console.log("SessyNote: EMR type fetched from API:", emrType);
            sendResponse({ success: true, emrType: emrType });
          } catch (error) {
            console.error("SessyNote: Error fetching EMR type:", error);
            sendResponse({ success: false, error: error.message });
          }
        });
      }
    });
    return true; // Keep channel open for async response
  }

  // Handle auto-fill session from content script
  if (message.action === "autoFillSession") {
    console.log("SessyNote: Received autoFillSession message", message.data);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        const windowId = tabs[0].windowId;

        // Store the data regardless
        chrome.storage.local.set({
          pendingSessionData: message.data,
          sessionDataTimestamp: Date.now(),
        });

        // Try to send message to popup - if it responds, panel is open
        chrome.runtime.sendMessage(
          { action: "fillSessionData", data: message.data },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              // No response = panel is closed
              console.log(
                "SessyNote: Panel is closed (no response), making button blink"
              );
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "startBlinking",
              });
            } else {
              // Got response = panel is open
              console.log("SessyNote: Panel is open, auto-filled immediately");
            }
          }
        );
      }
    });
    return true;
  }

  // Handle close side panel from popup
  if (message.action === "closeSidePanel") {
    console.log("SessyNote: Received closeSidePanel message");
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        const windowId = tabs[0].windowId;

        try {
          // Close by setting panel to disabled, then re-enabling
          await chrome.sidePanel.setOptions({
            tabId: tabs[0].id,
            enabled: false,
          });
          await chrome.sidePanel.setOptions({
            tabId: tabs[0].id,
            path: "popup.html",
            enabled: true,
          });
          sidePanelState.set(windowId, false);
          console.log("SessyNote: Side panel closed");
          chrome.tabs.sendMessage(tabs[0].id, { action: "sidePanelClosed" });
        } catch (error) {
          console.error("SessyNote: Error closing side panel:", error);
        }
      }
    });
    return true;
  }

  // Handle toggle side panel from content script
  if (message.action === "toggleSidePanel") {
    console.log("SessyNote: Received toggleSidePanel message");
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        console.log("SessyNote: Active tab found:", tabs[0].id);
        const windowId = tabs[0].windowId;
        const isOpen = sidePanelState.get(windowId);

        try {
          if (isOpen) {
            // Close by setting panel to disabled, then re-enabling
            await chrome.sidePanel.setOptions({
              tabId: tabs[0].id,
              enabled: false,
            });
            await chrome.sidePanel.setOptions({
              tabId: tabs[0].id,
              path: "popup.html",
              enabled: true,
            });
            sidePanelState.set(windowId, false);
            console.log("SessyNote: Side panel closed");
            chrome.tabs.sendMessage(tabs[0].id, { action: "sidePanelClosed" });
          } else {
            // Open the side panel
            await chrome.sidePanel.open({ windowId: windowId });
            sidePanelState.set(windowId, true);
            console.log("SessyNote: Side panel opened successfully");
            chrome.tabs.sendMessage(tabs[0].id, { action: "sidePanelOpened" });
          }
        } catch (error) {
          console.error("SessyNote: Error toggling side panel:", error);
        }
      } else {
        console.error("SessyNote: No active tab found");
      }
    });
    return true;
  }

  return true;
});

async function handlePageCapture(tabId, url) {
  try {
    console.log("📸 Starting progressive capture...");

    // Progressive capture: scroll and capture at each position
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: progressiveCapture,
    });

    if (result && result[0] && result[0].result) {
      const capturedData = result[0].result;
      console.log(`✅ Captured using method: ${capturedData.method}`);

      // Build complete HTML
      const completeHTML = buildProgressiveHTML(capturedData);

      // Trigger download
      downloadHTML(completeHTML, url);
    }
  } catch (error) {
    console.error("Error capturing page:", error);
  }
}

async function handlePageCaptureForAPI(tabId, url) {
  try {
    console.log("📸 Starting page capture for API...");

    // Use same progressive capture method
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: progressiveCapture,
    });

    if (result && result[0] && result[0].result) {
      const capturedData = result[0].result;
      console.log(`✅ Captured using method: ${capturedData.method}`);

      // Build complete HTML
      const completeHTML = buildProgressiveHTML(capturedData);

      // Return HTML instead of downloading
      return completeHTML;
    } else {
      throw new Error("Failed to capture page content");
    }
  } catch (error) {
    console.error("Error capturing page for API:", error);
    throw error;
  }
}

// NEW APPROACH: Disable virtual scrolling to force ALL content to load at once
async function progressiveCapture() {
  console.log("🔄 Finding scrollable container...");

  // Find the scrollable element (could be window or a div)
  function findScrollableContainer() {
    const candidates = [];
    const allElements = document.querySelectorAll("*");

    for (const el of allElements) {
      try {
        const style = getComputedStyle(el);
        const overflowY = style.overflowY || style.overflow;

        if (overflowY === "auto" || overflowY === "scroll") {
          const scrollable = el.scrollHeight - el.clientHeight;
          if (scrollable > 100) {
            candidates.push({ element: el, scrollable: scrollable });
          }
        }
      } catch (e) {}
    }

    // Return the one with most scrollable content
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.scrollable - a.scrollable);
      return candidates[0].element;
    }
    return null;
  }

  const scrollContainer = findScrollableContainer();

  if (scrollContainer) {
    console.log(
      "✅ Found scrollable div:",
      scrollContainer.tagName,
      scrollContainer.className
    );
    console.log(
      "📏 Original height:",
      scrollContainer.style.height,
      "Overflow:",
      scrollContainer.style.overflow
    );

    // STEP 1: Save original CSS
    const originalHeight = scrollContainer.style.height;
    const originalMaxHeight = scrollContainer.style.maxHeight;
    const originalOverflow = scrollContainer.style.overflow;
    const originalOverflowY = scrollContainer.style.overflowY;

    console.log("💾 Saved original styles");

    // STEP 2: Force all content to load by disabling virtual scrolling
    console.log("🔧 Disabling virtual scrolling...");
    scrollContainer.style.height = "auto";
    scrollContainer.style.maxHeight = "none";
    scrollContainer.style.overflow = "visible";
    scrollContainer.style.overflowY = "visible";

    // Wait for DOM to expand and all content to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("✅ All content should now be loaded in DOM");
    console.log("📏 New height:", scrollContainer.scrollHeight, "px");

    // STEP 3: Capture complete HTML with ALL data
    const completeHTML = document.documentElement.outerHTML;

    console.log(
      "📸 Captured complete HTML:",
      completeHTML.length,
      "characters"
    );

    // STEP 4: Restore original CSS (optional - page will reload anyway usually)
    scrollContainer.style.height = originalHeight;
    scrollContainer.style.maxHeight = originalMaxHeight;
    scrollContainer.style.overflow = originalOverflow;
    scrollContainer.style.overflowY = originalOverflowY;

    console.log("🔄 Restored original styles");

    // Get styles
    const inlineStyles = [];
    document.querySelectorAll("style").forEach((style) => {
      inlineStyles.push(style.textContent);
    });

    const styleSheets = Array.from(document.styleSheets);
    const externalStyles = [];
    const stylesheetUrls = [];

    for (const sheet of styleSheets) {
      try {
        if (sheet.cssRules || sheet.rules) {
          const rules = Array.from(sheet.cssRules || sheet.rules || []);
          const css = rules.map((rule) => rule.cssText).join("\n");
          externalStyles.push(css);
        }
      } catch (e) {
        if (sheet.href) {
          stylesheetUrls.push(sheet.href);
        }
      }
    }

    // Fetch external styles
    const fetchedStyles = [];
    for (const url of stylesheetUrls) {
      try {
        const response = await fetch(url);
        const cssText = await response.text();
        fetchedStyles.push(cssText);
      } catch (e) {
        console.warn("Could not fetch stylesheet:", url);
      }
    }

    return {
      mergedHTML: completeHTML,
      inlineStyles: inlineStyles,
      externalStyles: externalStyles,
      fetchedStyles: fetchedStyles,
      title: document.title,
      url: window.location.href,
      method: "disable-virtual-scrolling",
    };
  } else {
    // No scrollable container found - just capture as-is
    console.log("⚠️ No scrollable div found, capturing without modification");

    const completeHTML = document.documentElement.outerHTML;

    // Get styles
    const inlineStyles = [];
    document.querySelectorAll("style").forEach((style) => {
      inlineStyles.push(style.textContent);
    });

    const styleSheets = Array.from(document.styleSheets);
    const externalStyles = [];
    const stylesheetUrls = [];

    for (const sheet of styleSheets) {
      try {
        if (sheet.cssRules || sheet.rules) {
          const rules = Array.from(sheet.cssRules || sheet.rules || []);
          const css = rules.map((rule) => rule.cssText).join("\n");
          externalStyles.push(css);
        }
      } catch (e) {
        if (sheet.href) {
          stylesheetUrls.push(sheet.href);
        }
      }
    }

    // Fetch external styles
    const fetchedStyles = [];
    for (const url of stylesheetUrls) {
      try {
        const response = await fetch(url);
        const cssText = await response.text();
        fetchedStyles.push(cssText);
      } catch (e) {
        console.warn("Could not fetch stylesheet:", url);
      }
    }

    return {
      mergedHTML: completeHTML,
      inlineStyles: inlineStyles,
      externalStyles: externalStyles,
      fetchedStyles: fetchedStyles,
      title: document.title,
      url: window.location.href,
      method: "direct-capture",
    };
  }
}

// UNUSED - OLD APPROACH
// Separate function to scroll the page and load all content
// function scrollPageToLoadAll() {
//   console.log('🔄 Starting auto-scroll...');
//   console.log('Page height:', document.body.scrollHeight, 'px');
//   console.log('Current position:', window.scrollY, 'px');
//
//   return new Promise((resolve) => {
//     const scrollStep = 200; // Scroll 200px at a time
//     const scrollDelay = 500; // Wait 500ms between scrolls (SLOW, very visible)
//     let scrollCount = 0;
//     const maxScrolls = 50; // Maximum number of scroll attempts
//
//     const scrollInterval = setInterval(() => {
//       const beforeScroll = window.scrollY;
//       const scrollHeight = document.body.scrollHeight;
//       const windowHeight = window.innerHeight;
//
//       console.log(`Scroll #${scrollCount}: position ${beforeScroll}px, height ${scrollHeight}px`);
//
//       // Scroll down
//       window.scrollBy(0, scrollStep);
//       scrollCount++;
//
//       // Wait a bit then check if we actually scrolled
//       setTimeout(() => {
//         const afterScroll = window.scrollY;
//         const isAtBottom = (afterScroll + windowHeight) >= scrollHeight - 10;
//         const didntMove = Math.abs(afterScroll - beforeScroll) < 5;
//
//         console.log(`After scroll: ${afterScroll}px, moved: ${afterScroll - beforeScroll}px, atBottom: ${isAtBottom}`);
//
//         if (isAtBottom || didntMove || scrollCount >= maxScrolls) {
//           clearInterval(scrollInterval);
//           console.log('✅ Scroll complete, going back to top');
//
//           // Scroll back to top
//           window.scrollTo(0, 0);
//
//           setTimeout(() => {
//             console.log('✅ Auto-scroll complete!');
//             resolve();
//           }, 500);
//         }
//       }, 100);
//     }, scrollDelay);
//   });
// }

// UNUSED - OLD APPROACH
// This function runs in the context of the web page
// async function capturePageContent() {
//   console.log('📸 Starting page capture...');
//
//   // Get the full HTML
//   const html = document.documentElement.outerHTML;
//
//   // Get all inline styles
//   const inlineStyles = [];
//   document.querySelectorAll('style').forEach(style => {
//     inlineStyles.push(style.textContent);
//   });
//
//   // Get all stylesheets (including external ones)
//   const externalStyles = [];
//   const stylesheetUrls = [];
//   const styleSheets = Array.from(document.styleSheets);
//
//   for (const sheet of styleSheets) {
//     try {
//       // Try to access CSS rules directly
//       if (sheet.cssRules || sheet.rules) {
//         const rules = Array.from(sheet.cssRules || sheet.rules || []);
//         const css = rules.map(rule => rule.cssText).join('\n');
//         externalStyles.push(css);
//       }
//     } catch (e) {
//       // Cross-origin stylesheet - collect URL to fetch later
//       if (sheet.href) {
//         console.log('Will fetch external stylesheet:', sheet.href);
//         stylesheetUrls.push(sheet.href);
//       }
//     }
//   }
//
//   // Fetch external stylesheets that we couldn't access directly
//   const fetchedStyles = [];
//   for (const url of stylesheetUrls) {
//     try {
//       const response = await fetch(url);
//       const cssText = await response.text();
//       fetchedStyles.push(cssText);
//       console.log('Successfully fetched:', url);
//     } catch (e) {
//       console.warn('Could not fetch stylesheet:', url, e);
//     }
//   }
//
//   // Get all images and convert to base64
//   const images = [];
//   const imgElements = document.querySelectorAll('img');
//
//   for (const img of imgElements) {
//     if (img.src && img.complete) {
//       try {
//         const canvas = document.createElement('canvas');
//         canvas.width = img.naturalWidth || img.width || 1;
//         canvas.height = img.naturalHeight || img.height || 1;
//         const ctx = canvas.getContext('2d');
//         ctx.drawImage(img, 0, 0);
//         const base64 = canvas.toDataURL('image/png');
//         images.push({
//           src: img.src,
//           base64: base64
//         });
//       } catch (e) {
//         console.warn('Could not convert image to base64:', img.src, e);
//       }
//     }
//   }
//
//   // Get computed styles for body to preserve background
//   const bodyStyles = window.getComputedStyle(document.body);
//   const backgroundColor = bodyStyles.backgroundColor;
//   const backgroundImage = bodyStyles.backgroundImage;
//
//   console.log('Page capture complete');
//
//   return {
//     html: html,
//     inlineStyles: inlineStyles,
//     externalStyles: externalStyles,
//     fetchedStyles: fetchedStyles,
//     images: images,
//     backgroundColor: backgroundColor,
//     backgroundImage: backgroundImage,
//     title: document.title,
//     url: window.location.href
//   };
// }

function buildProgressiveHTML(capturedData) {
  console.log("Building HTML from capture...");
  console.log(`Method: ${capturedData.method}`);

  // Get the complete HTML
  let html = capturedData.mergedHTML;

  if (!html) {
    console.error("No HTML content found!");
    return "<html><body>Error: No content captured</body></html>";
  }

  console.log(`HTML size: ${html.length} characters`);

  // Remove scripts and meta refresh
  html = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
  html = html.replace(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, "");
  html = html.replace(
    /<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi,
    ""
  );

  // Combine CSS
  let combinedCSS = "";
  if (capturedData.inlineStyles && capturedData.inlineStyles.length > 0) {
    combinedCSS += capturedData.inlineStyles.join("\n");
  }
  if (capturedData.externalStyles && capturedData.externalStyles.length > 0) {
    combinedCSS += "\n" + capturedData.externalStyles.join("\n");
  }
  if (capturedData.fetchedStyles && capturedData.fetchedStyles.length > 0) {
    combinedCSS += "\n" + capturedData.fetchedStyles.join("\n");
  }

  const styleTag = `<style id="captured-styles">\n${combinedCSS}\n</style>`;
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${styleTag}\n</head>`);
  } else {
    html = styleTag + html;
  }

  const comment = `<!-- Captured by SessyNote from ${capturedData.url} using ${capturedData.method} -->\n`;
  return comment + html;
}

// UNUSED - OLD APPROACH
// function buildCompleteHTML(pageData) {
//   let html = pageData.html;
//
//   // Remove all script tags to prevent auto-refresh and errors
//   html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
//
//   // Remove meta refresh tags
//   html = html.replace(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, '');
//
//   // Remove noscript tags (not needed without scripts)
//   html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
//
//   // Replace image sources with base64
//   pageData.images.forEach(img => {
//     html = html.replace(new RegExp(escapeRegExp(img.src), 'g'), img.base64);
//   });
//
//   // Create a combined style block with all CSS
//   let combinedCSS = '';
//
//   // Add inline styles
//   if (pageData.inlineStyles && pageData.inlineStyles.length > 0) {
//     combinedCSS += pageData.inlineStyles.join('\n');
//   }
//
//   // Add external styles (from same-origin or accessible stylesheets)
//   if (pageData.externalStyles && pageData.externalStyles.length > 0) {
//     combinedCSS += '\n' + pageData.externalStyles.join('\n');
//   }
//
//   // Add fetched external styles (from cross-origin stylesheets)
//   if (pageData.fetchedStyles && pageData.fetchedStyles.length > 0) {
//     combinedCSS += '\n/* Fetched external stylesheets */\n';
//     combinedCSS += pageData.fetchedStyles.join('\n');
//   }
//
//   // Add body background styles if needed
//   if (pageData.backgroundColor) {
//     combinedCSS += `\nbody { background-color: ${pageData.backgroundColor} !important; }`;
//   }
//   if (pageData.backgroundImage && pageData.backgroundImage !== 'none') {
//     combinedCSS += `\nbody { background-image: ${pageData.backgroundImage} !important; }`;
//   }
//
//   // Insert the combined CSS into the head
//   const styleTag = `<style id="captured-styles">\n${combinedCSS}\n</style>`;
//
//   // Find </head> and insert before it
//   if (html.includes('</head>')) {
//     html = html.replace('</head>', `${styleTag}\n</head>`);
//   } else {
//     // If no </head>, insert at the beginning
//     html = styleTag + html;
//   }
//
//   // Add a comment at the top indicating this is a captured page
//   const comment = `<!-- Captured by SessyNote from ${pageData.url} on ${new Date().toISOString()} -->\n`;
//   html = comment + html;
//
//   return html;
// }

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function downloadHTML(htmlContent, originalUrl) {
  // Generate filename from the URL or use timestamp
  let filename = "captured-page";
  try {
    const urlObj = new URL(originalUrl);
    const path = urlObj.pathname
      .split("/")
      .filter((p) => p)
      .join("-");
    filename = path || urlObj.hostname;
  } catch (e) {
    filename = "captured-page";
  }

  // Add timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  filename = `${filename}-${timestamp}.html`;

  // Convert HTML to data URL (works in service workers)
  const dataUrl =
    "data:text/html;charset=utf-8," + encodeURIComponent(htmlContent);

  // Trigger download
  chrome.downloads.download(
    {
      url: dataUrl,
      filename: filename,
      saveAs: false,
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Download error:", chrome.runtime.lastError);
      } else {
        console.log("Download started:", downloadId);
      }
    }
  );
}
