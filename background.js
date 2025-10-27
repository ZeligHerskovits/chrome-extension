// CHROME EXTENSION THAT CALLS SINGLEFILE
// Your button triggers SingleFile extension, then uses its HTML

// Track side panel state per window
const sidePanelState = new Map();

// Handle extension icon click to toggle side panel
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    sidePanelState.set(tab.windowId, true);
  } catch (error) {
    console.error('Error opening side panel:', error);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "triggerSingleFile") {
    console.log("🚀 Calling SingleFile extension...");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        callSingleFileExtension(tabs[0].id, sendResponse);
      }
    });
    return true;
  }
  
  // Handle toggle side panel from content script
  if (request.action === "toggleSidePanel") {
    console.log('SessyNote: Received toggleSidePanel message');
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        console.log('SessyNote: Active tab found:', tabs[0].id);
        const windowId = tabs[0].windowId;
        const isOpen = sidePanelState.get(windowId);
        
        try {
          if (isOpen) {
            // Close by setting panel to disabled, then re-enabling
            await chrome.sidePanel.setOptions({
              tabId: tabs[0].id,
              enabled: false
            });
            await chrome.sidePanel.setOptions({
              tabId: tabs[0].id,
              path: 'popup.html',
              enabled: true
            });
            sidePanelState.set(windowId, false);
            console.log('SessyNote: Side panel closed');
            chrome.tabs.sendMessage(tabs[0].id, { action: 'sidePanelClosed' });
          } else {
            // Open the side panel
            await chrome.sidePanel.open({ windowId: windowId });
            sidePanelState.set(windowId, true);
            console.log('SessyNote: Side panel opened successfully');
            chrome.tabs.sendMessage(tabs[0].id, { action: 'sidePanelOpened' });
          }
        } catch (error) {
          console.error('SessyNote: Error toggling side panel:', error);
        }
      } else {
        console.error('SessyNote: No active tab found');
      }
    });
    return true;
  }
});

// CALL SINGLEFILE EXTENSION
async function callSingleFileExtension(tabId, sendResponse) {
  try {
    console.log("🎯 Calling SingleFile extension...");

    // Get the current URL to check if it's Quickbase
    const tab = await chrome.tabs.get(tabId);
    const isQuickbase = tab.url.includes("quickbase.com");

    if (isQuickbase) {
      console.log("🔍 Quickbase detected - using intelligent loading");
      await handleQuickbaseCapture(tabId, sendResponse);
    } else {
      console.log("⚡ Regular website - using fast timing");
      // Normal wait time for other websites
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await performStandardCapture(tabId, sendResponse);
    }
  } catch (error) {
    console.error("❌ Error calling SingleFile:", error);
    sendResponse({ 
      success: false, 
      error: error.message,
      displayError: `Failed to capture page: ${error.message}` 
    });
  }
}

// HANDLE QUICKBASE CAPTURE WITH INTELLIGENT LOADING
async function handleQuickbaseCapture(tabId, sendResponse) {
  try {
    console.log("🔍 Starting intelligent Quickbase capture...");

    // Step 1: Find the correct frame and wait for Quickbase elements
    const frameInfo = await findQuickbaseFrame(tabId);

    if (!frameInfo) {
      console.log(
        "⚠️ Quickbase frame not found after 120 seconds, trying main frame capture"
      );
      // Try capturing the main frame anyway
      await tryMainFrameCapture(tabId, sendResponse);
      return;
    }

    // Step 2: Perform full autoscroll in the target frame
    await performAutoscrollInFrame(tabId, frameInfo.frameId);

    // Step 3: Freeze scripts to prevent DOM changes
    await freezeScriptsInFrame(tabId, frameInfo.frameId);

    // Step 4: Try SingleFile in the frame context
    const singleFileSuccess = await trySingleFileInFrame(
      tabId,
      frameInfo.frameId,
      sendResponse
    );

    if (!singleFileSuccess) {
      console.log("⚠️ SingleFile failed, using MHTML fallback");
      await fallbackToMHTML(tabId, sendResponse);
    } else {
      console.log("✅ SingleFile capture successful for Quickbase");
    }
  } catch (error) {
    console.error("❌ Error in Quickbase capture:", error);
    sendResponse({ 
      success: false, 
      error: error.message,
      displayError: `Quickbase capture failed: ${error.message}` 
    });
    await fallbackToMHTML(tabId, sendResponse);
  }
}

// FIND QUICKBASE FRAME AND WAIT FOR ELEMENTS
async function findQuickbaseFrame(tabId) {
  console.log("⏳ Finding Quickbase frame and waiting for elements...");

  const maxWaitTime = 120000; // 120 seconds
  const checkInterval = 2000; // Check every 2 seconds
  let elapsed = 0;

  while (elapsed < maxWaitTime) {
    try {
      // First try the main frame (frameId: 0)
      try {
        const mainFrameResults = await chrome.scripting.executeScript({
          target: { tabId: tabId, frameIds: [0] },
          func: checkForQuickbaseElement,
        });

        if (
          mainFrameResults &&
          mainFrameResults[0] &&
          mainFrameResults[0].result
        ) {
          console.log("✅ Quickbase elements found in main frame!");
          return { frameId: 0, frame: { frameId: 0 } };
        }
      } catch (e) {
        console.log("Main frame not accessible, trying other frames...");
      }

      // Get all frames in the tab
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tabId });
      console.log(`Found ${frames.length} frames`);

      for (const frame of frames) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tabId, frameIds: [frame.frameId] },
            func: checkForQuickbaseElement,
          });

          if (results && results[0] && results[0].result) {
            console.log(
              `✅ Quickbase elements found in frame ${frame.frameId}!`
            );
            return { frameId: frame.frameId, frame: frame };
          }
        } catch (e) {
          // Frame might not be accessible, continue
          console.log(`Frame ${frame.frameId} not accessible`);
        }
      }
    } catch (e) {
      console.log("Error checking frames:", e);
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
    elapsed += checkInterval;
    console.log(`Still waiting... ${elapsed / 1000}s elapsed`);
  }

  console.log("❌ Quickbase elements not found after 120 seconds");
  return null;
}

// CHECK FOR QUICKBASE ELEMENT
function checkForQuickbaseElement() {
  const selectors = [
    '[aria-label="Session Details"]',
    '[aria-label="Demographics"]',
    ".qb-form-layout",
    ".qb-page-content",
    // More flexible selectors
    '[class*="session"]',
    '[class*="demographics"]',
    '[class*="form-layout"]',
    '[class*="page-content"]',
    // Check for any Quickbase-specific content
    '[class*="qb-"]',
    '[id*="session"]',
    '[id*="demographics"]',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.offsetHeight > 0) {
      console.log(`Found Quickbase element: ${selector}`);
      return true;
    }
  }

  // Also check for any content that looks like session data
  const sessionContent = document.querySelector(
    '[class*="session"], [id*="session"]'
  );
  if (sessionContent && sessionContent.textContent.length > 50) {
    console.log("Found session content by text length");
    return true;
  }

  // Check if we're on a Quickbase page with any meaningful content
  const bodyText = document.body.textContent;
  if (
    bodyText.includes("Session") ||
    bodyText.includes("Demographics") ||
    bodyText.includes("Quickbase")
  ) {
    console.log("Found Quickbase content by text search");
    return true;
  }

  return false;
}

// PERFORM AUTOSCROLL IN TARGET FRAME
async function performAutoscrollInFrame(tabId, frameId) {
  console.log("📜 Performing autoscroll in target frame...");

  await chrome.scripting.executeScript({
    target: { tabId: tabId, frameIds: [frameId] },
    func: autoscrollPage,
  });

  // Wait for lazy content to load
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

// AUTOSCROLL FUNCTION
function autoscrollPage() {
  return new Promise((resolve) => {
    console.log("📜 Starting comprehensive autoscroll...");

    let scrollPosition = 0;
    const scrollStep = 300; // Smaller steps for better lazy loading
    const scrollInterval = 200; // Slower to allow content to load
    let maxHeight = document.body.scrollHeight;
    let scrollCount = 0;

    const scroll = () => {
      window.scrollTo(0, scrollPosition);
      scrollPosition += scrollStep;
      scrollCount++;

      console.log(
        `📜 Scrolling... position: ${scrollPosition}, count: ${scrollCount}`
      );

      // Check if we've reached the bottom or if content has grown
      const currentHeight = document.body.scrollHeight;
      if (currentHeight > maxHeight) {
        maxHeight = currentHeight;
        console.log(`📜 Content grew to ${maxHeight}px - continuing scroll`);
      }

      if (scrollPosition >= maxHeight) {
        // Wait for any remaining lazy content
        setTimeout(() => {
          // Scroll back to top
          window.scrollTo(0, 0);
          console.log("✅ Autoscroll completed - all content loaded");
          resolve();
        }, 3000); // Wait 3 seconds for lazy content
      } else {
        setTimeout(scroll, scrollInterval);
      }
    };

    scroll();
  });
}

// FREEZE SCRIPTS IN TARGET FRAME
async function freezeScriptsInFrame(tabId, frameId) {
  console.log("🧊 Freezing scripts in target frame...");

  await chrome.scripting.executeScript({
    target: { tabId: tabId, frameIds: [frameId] },
    func: freezePageScripts,
  });
}

// FREEZE SCRIPTS FUNCTION
function freezePageScripts() {
  console.log("🧊 Starting script freezing...");

  // Stop all timers and intervals
  const highestTimeoutId = setTimeout(() => {}, 0);
  for (let i = 0; i < highestTimeoutId; i++) {
    clearTimeout(i);
    clearInterval(i);
  }

  // Disable all script execution
  const scripts = document.querySelectorAll("script");
  console.log(`Removing ${scripts.length} script tags`);
  scripts.forEach((script) => {
    script.remove();
  });

  // Remove all event attributes and listeners
  const allElements = document.querySelectorAll("*");
  allElements.forEach((element) => {
    // Remove all event attributes (onclick, onmouseover, etc.)
    const attributes = element.attributes;
    if (attributes) {
      for (let i = attributes.length - 1; i >= 0; i--) {
        const attr = attributes[i];
        if (attr.name.startsWith("on")) {
          element.removeAttribute(attr.name);
        }
      }
    }

    // Clone element to remove event listeners
    const newElement = element.cloneNode(true);
    if (element.parentNode) {
      element.parentNode.replaceChild(newElement, element);
    }
  });

  // Disable form submissions and XHR
  const forms = document.querySelectorAll("form");
  forms.forEach((form) => {
    form.onsubmit = () => false;
    form.addEventListener = () => {}; // Block addEventListener
  });

  // Override XMLHttpRequest to prevent further requests
  if (window.XMLHttpRequest) {
    window.XMLHttpRequest = function () {
      throw new Error("XMLHttpRequest blocked");
    };
  }

  // Block fetch as well
  if (window.fetch) {
    window.fetch = function () {
      throw new Error("fetch blocked");
    };
  }

  // Block the specific error functions we're seeing
  const errorFunctions = [
    "StdMouseOverProc",
    "StdMouseMoveProc",
    "StdLoadProc",
    "StdKeyDownProc",
    "StdResizeProc",
  ];

  errorFunctions.forEach((funcName) => {
    window[funcName] = function () {
      console.log(`Blocked function call: ${funcName}`);
    };
  });

  console.log("✅ Script freezing completed");
}

// TRY SINGLEFILE IN FRAME CONTEXT
async function trySingleFileInFrame(tabId, frameId, sendResponse) {
  try {
    console.log("🎯 Trying SingleFile in frame context...");

    // Method 1: Try actual SingleFile extension with frame targeting
    try {
      const singleFileResponse = await chrome.runtime.sendMessage(
        "mpiodijhchojoemfpepijjdlalnkobpd",
        {
          action: "savePage",
          frameId: frameId,
          options: {
            removeScripts: true,
            includeIframes: true,
            removeUnusedCSS: false,
            removeUnusedFonts: false,
            includeHiddenElements: true,
            loadDeferredImages: true,
            includeShadowDOM: true,
            networkIdleWait: 3000,
          },
        }
      );

      if (singleFileResponse && singleFileResponse.success) {
        console.log("✅ SingleFile extension responded with frame options");
        sendResponse({ success: true, data: singleFileResponse.data });
        return true;
      }
    } catch (e) {
      console.log(
        "⚠️ SingleFile extension not available, trying custom frame capture"
      );
    }

    // Method 2: Custom capture in frame with SingleFile-style options
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId, frameIds: [frameId] },
      func: singleFileCaptureWithOptions,
      args: [],
    });

    if (results && results[0] && results[0].result) {
      const data = results[0].result;
      console.log("✅ Custom SingleFile-style frame capture completed");
      sendResponse({ success: true, data: data });
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Error in SingleFile frame capture:", error);
    return false;
  }
}

// TRY MAIN FRAME CAPTURE FOR QUICKBASE
async function tryMainFrameCapture(tabId, sendResponse) {
  try {
    console.log("🔄 Trying main frame capture for Quickbase...");

    // Wait a bit for content to load
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Try SingleFile in main frame
    const singleFileSuccess = await trySingleFileInFrame(
      tabId,
      0,
      sendResponse
    );

    if (!singleFileSuccess) {
      console.log("⚠️ Main frame SingleFile failed, using MHTML fallback");
      await fallbackToMHTML(tabId, sendResponse);
    }
  } catch (error) {
    console.error("❌ Error in main frame capture:", error);
    await fallbackToMHTML(tabId, sendResponse);
  }
}

// FALLBACK TO MHTML
async function fallbackToMHTML(tabId, sendResponse) {
  try {
    console.log("🔄 Using MHTML fallback...");

    // Try Chrome's built-in page capture
    try {
      const dataUrl = await chrome.pageCapture.saveAsMHTML({
        tabId: tabId,
      });

      // Convert MHTML to HTML-like format
      const response = await fetch(dataUrl);
      const mhtmlContent = await response.text();

      sendResponse({
        success: true,
        data: {
          html: mhtmlContent,
          url: (await chrome.tabs.get(tabId)).url,
          title: (await chrome.tabs.get(tabId)).title,
          method: "MHTML",
        },
      });
      return;
    } catch (mhtmlError) {
      console.log("⚠️ MHTML failed, trying basic HTML capture");
    }

    // Fallback to basic HTML capture
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: basicHTMLCapture,
    });

    if (results && results[0] && results[0].result) {
      const data = results[0].result;
      console.log("✅ Basic HTML capture completed");
      sendResponse({
        success: true,
        data: {
          ...data,
          method: "Basic HTML",
        },
      });
    } else {
      throw new Error("All capture methods failed");
    }
  } catch (error) {
    console.error("❌ All fallback methods failed:", error);
    sendResponse({ success: false, error: "All capture methods failed" });
  }
}

// PERFORM STANDARD CAPTURE FOR NON-QUICKBASE SITES
async function performStandardCapture(tabId, sendResponse) {
  try {
    // Method 1: Try to send message to SingleFile extension
    try {
      const singleFileResponse = await chrome.runtime.sendMessage(
        "mpiodijhchojoemfpepijjdlalnkobpd",
        {
          action: "savePage",
        }
      );

      if (singleFileResponse && singleFileResponse.success) {
        console.log("✅ SingleFile extension responded");
        sendResponse({ success: true, data: singleFileResponse.data });
        return;
      }
    } catch (e) {
      console.log(
        "⚠️ SingleFile extension not available, trying alternative method"
      );
    }

    // Method 2: Inject SingleFile's capture script directly
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: singleFileCapture,
    });

    if (results && results[0] && results[0].result) {
      const data = results[0].result;
      console.log("✅ SingleFile-style capture completed");
      sendResponse({ success: true, data: data });
    } else {
      console.error("❌ No results from SingleFile capture");
      sendResponse({
        success: false,
        error: "No results from SingleFile capture",
      });
    }
  } catch (error) {
    console.error("❌ Error in standard capture:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// SINGLEFILE CAPTURE WITH OPTIONS (for Quickbase)
async function singleFileCaptureWithOptions() {
  try {
    console.log("🎯 Starting SingleFile capture with options...");

    // First, capture all form field values before getting HTML
    const formElements = document.querySelectorAll("input, select, textarea");
    const formValues = {};

    formElements.forEach((element, index) => {
      const key = element.name || element.id || `element_${index}`;
      if (element.type === "checkbox" || element.type === "radio") {
        formValues[key] = element.checked;
      } else {
        formValues[key] = element.value;
      }
    });

    // Get HTML and remove all scripts
    let html = document.documentElement.outerHTML;

    // Remove all script tags and their content
    html = html.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ""
    );

    // Remove all event attributes
    html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");

    // Remove any remaining JavaScript function calls
    html = html.replace(
      /StdMouseOverProc|StdMouseMoveProc|StdLoadProc|StdKeyDownProc|StdResizeProc/gi,
      ""
    );

    // Get CSS - Enhanced capture for Quickbase
    let css = "";

    // 1. Get all external stylesheets
    const linkTags = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of linkTags) {
      try {
        const response = await fetch(link.href);
        if (response.ok) {
          const cssText = await response.text();
          css += `/* External CSS: ${link.href} */\n${cssText}\n\n`;
        }
      } catch (e) {
        console.log(`Could not fetch CSS: ${link.href}`);
      }
    }

    // 2. Get computed styles for all elements
    const allElements = document.querySelectorAll("*");
    const computedStyles = new Set();

    allElements.forEach((element) => {
      const styles = window.getComputedStyle(element);
      const selector = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : "";
      const classes = element.className
        ? `.${element.className.split(" ").join(".")}`
        : "";
      const fullSelector = `${selector}${id}${classes}`;

      let elementCSS = `${fullSelector} {\n`;
      for (let i = 0; i < styles.length; i++) {
        const property = styles[i];
        const value = styles.getPropertyValue(property);
        if (value && value !== "initial" && value !== "inherit") {
          elementCSS += `  ${property}: ${value};\n`;
        }
      }
      elementCSS += `}\n`;
      computedStyles.add(elementCSS);
    });

    css += Array.from(computedStyles).join("\n");

    // 3. Get inline styles
    const styleTags = document.querySelectorAll("style");
    styleTags.forEach((tag) => {
      css += `/* Inline styles */\n${tag.textContent}\n\n`;
    });

    // 4. Get stylesheets from document.styleSheets
    const styleSheets = Array.from(document.styleSheets);
    for (const sheet of styleSheets) {
      try {
        if (sheet.cssRules) {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            css += `${rule.cssText}\n`;
          }
        }
      } catch (e) {
        console.log(`Could not access stylesheet: ${sheet.href || "inline"}`);
      }
    }

    // Embed CSS
    if (css) {
      console.log(`📝 CSS captured: ${css.length} characters`);
      const styleElement = `<style type="text/css">\n${css}\n</style>`;
      html = html.replace("</head>", styleElement + "</head>");
    } else {
      console.log("⚠️ No CSS captured!");
    }

    // Convert images to base64
    const imgElements = document.querySelectorAll("img");
    for (const img of imgElements) {
      try {
        if (img.complete && img.naturalWidth > 0) {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL("image/png");
          html = html.replace(
            new RegExp(`src="${img.src}"`, "g"),
            `src="${base64}"`
          );
        }
      } catch (e) {
        // Skip problematic images
      }
    }

    // Remove external links but keep iframes
    html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, "");
    html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/gi, "");

    // Remove interactivity
    html = html.replace(/href="[^"]*"/gi, 'href="#"');
    html = html.replace(/onclick="[^"]*"/gi, "");
    html = html.replace(/onmousedown="[^"]*"/gi, "");
    html = html.replace(/onmouseup="[^"]*"/gi, "");

    // Inject captured form values back into the HTML
    Object.keys(formValues).forEach((key) => {
      const value = formValues[key];
      if (value !== undefined && value !== null && value !== "") {
        // For input fields
        html = html.replace(
          new RegExp(
            `(<input[^>]*(?:name|id)="${key}"[^>]*)(?:value="[^"]*")?([^>]*>)`,
            "gi"
          ),
          `$1 value="${value}"$2`
        );
        // For select options
        html = html.replace(
          new RegExp(
            `(<select[^>]*(?:name|id)="${key}"[^>]*>)([\\s\\S]*?)(</select>)`,
            "gi"
          ),
          (match, openTag, options, closeTag) => {
            const selectedOptions = options.replace(
              new RegExp(`(<option[^>]*value="${value}"[^>]*>)`, "gi"),
              "$1 selected"
            );
            return openTag + selectedOptions + closeTag;
          }
        );
        // For textareas
        html = html.replace(
          new RegExp(
            `(<textarea[^>]*(?:name|id)="${key}"[^>]*>)([\\s\\S]*?)(</textarea>)`,
            "gi"
          ),
          `$1${value}$3`
        );
      }
    });

    console.log(
      "✅ SingleFile capture with options completed with form values"
    );
    return {
      html: html,
      url: window.location.href,
      title: document.title,
      formValues: formValues, // Include form values in response for debugging
    };
  } catch (error) {
    console.error("❌ Error in SingleFile capture with options:", error);
    return {
      html: document.documentElement.outerHTML,
      url: window.location.href,
      title: document.title,
      error: error.message,
    };
  }
}

// BASIC HTML CAPTURE (simple fallback)
function basicHTMLCapture() {
  try {
    console.log("🎯 Starting basic HTML capture...");

    // Get HTML
    let html = document.documentElement.outerHTML;

    // Get basic CSS
    let css = "";
    const styleTags = document.querySelectorAll("style");
    styleTags.forEach((tag) => {
      css += tag.textContent + "\n";
    });

    // Embed CSS
    if (css) {
      const styleElement = `<style type="text/css">\n${css}\n</style>`;
      html = html.replace("</head>", styleElement + "</head>");
    }

    // Remove external links
    html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, "");
    html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/gi, "");

    // Remove interactivity
    html = html.replace(/href="[^"]*"/gi, 'href="#"');
    html = html.replace(/onclick="[^"]*"/gi, "");
    html = html.replace(/onmousedown="[^"]*"/gi, "");
    html = html.replace(/onmouseup="[^"]*"/gi, "");

    console.log("✅ Basic HTML capture completed");
    return {
      html: html,
      url: window.location.href,
      title: document.title,
    };
  } catch (error) {
    console.error("❌ Error in basic HTML capture:", error);
    return {
      html: document.documentElement.outerHTML,
      url: window.location.href,
      title: document.title,
      error: error.message,
    };
  }
}

// ENHANCED CAPTURE SCRIPT - Preserves form field values
function singleFileCapture() {
  try {
    console.log("🎯 Starting enhanced capture with form values...");

    // First, capture all form field values before getting HTML
    const formElements = document.querySelectorAll("input, select, textarea");
    const formValues = {};

    formElements.forEach((element, index) => {
      const key = element.name || element.id || `element_${index}`;
      if (element.type === "checkbox" || element.type === "radio") {
        formValues[key] = element.checked;
      } else {
        formValues[key] = element.value;
      }
    });

    // Get HTML and remove all scripts
    let html = document.documentElement.outerHTML;

    // Remove all script tags and their content
    html = html.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ""
    );

    // Remove all event attributes
    html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");

    // Remove any remaining JavaScript function calls
    html = html.replace(
      /StdMouseOverProc|StdMouseMoveProc|StdLoadProc|StdKeyDownProc|StdResizeProc/gi,
      ""
    );

    // Get CSS
    let css = "";
    const styleSheets = Array.from(document.styleSheets);
    for (const sheet of styleSheets) {
      try {
        if (sheet.cssRules) {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            css += rule.cssText + "\n";
          }
        }
      } catch (e) {
        // Skip cross-origin
      }
    }

    // Get inline styles
    const styleTags = document.querySelectorAll("style");
    styleTags.forEach((tag) => {
      css += tag.textContent + "\n";
    });

    // Embed CSS
    if (css) {
      const styleElement = `<style type="text/css">\n${css}\n</style>`;
      html = html.replace("</head>", styleElement + "</head>");
    }

    // Convert images to base64
    const imgElements = document.querySelectorAll("img");
    for (const img of imgElements) {
      try {
        if (img.complete && img.naturalWidth > 0) {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL("image/png");
          html = html.replace(
            new RegExp(`src="${img.src}"`, "g"),
            `src="${base64}"`
          );
        }
      } catch (e) {
        // Skip problematic images
      }
    }

    // Remove external links
    html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, "");
    html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/gi, "");

    // Remove interactivity
    html = html.replace(/href="[^"]*"/gi, 'href="#"');
    html = html.replace(/onclick="[^"]*"/gi, "");
    html = html.replace(/onmousedown="[^"]*"/gi, "");
    html = html.replace(/onmouseup="[^"]*"/gi, "");

    // Inject captured form values back into the HTML
    Object.keys(formValues).forEach((key) => {
      const value = formValues[key];
      if (value !== undefined && value !== null && value !== "") {
        // For input fields
        html = html.replace(
          new RegExp(
            `(<input[^>]*(?:name|id)="${key}"[^>]*)(?:value="[^"]*")?([^>]*>)`,
            "gi"
          ),
          `$1 value="${value}"$2`
        );
        // For select options
        html = html.replace(
          new RegExp(
            `(<select[^>]*(?:name|id)="${key}"[^>]*>)([\\s\\S]*?)(</select>)`,
            "gi"
          ),
          (match, openTag, options, closeTag) => {
            const selectedOptions = options.replace(
              new RegExp(`(<option[^>]*value="${value}"[^>]*>)`, "gi"),
              "$1 selected"
            );
            return openTag + selectedOptions + closeTag;
          }
        );
        // For textareas
        html = html.replace(
          new RegExp(
            `(<textarea[^>]*(?:name|id)="${key}"[^>]*>)([\\s\\S]*?)(</textarea>)`,
            "gi"
          ),
          `$1${value}$3`
        );
      }
    });

    console.log("✅ Enhanced capture completed with form values");
    return {
      html: html,
      url: window.location.href,
      title: document.title,
      formValues: formValues, // Include form values in response for debugging
    };
  } catch (error) {
    console.error("❌ Error in SingleFile capture:", error);
    return {
      html: document.documentElement.outerHTML,
      url: window.location.href,
      title: document.title,
      error: error.message,
    };
  }
}
