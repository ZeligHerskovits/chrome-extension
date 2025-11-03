// Create and inject the floating toggle button on web pages
(function() {
  // Check if button already exists
  if (document.getElementById('sessynote-toggle-btn')) {
    return;
  }

  // Create the toggle button
  const toggleBtn = document.createElement('div');
  toggleBtn.id = 'sessynote-toggle-btn';
  toggleBtn.innerHTML = '<img src="' + chrome.runtime.getURL('icons/icon48.png') + '" style="width: 32px; height: 32px; object-fit: contain;">';
  toggleBtn.title = 'Toggle SessyNote';
  
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
  toggleBtn.addEventListener('mouseenter', () => {
    toggleBtn.style.backgroundColor = '#f8f8f8';
    toggleBtn.style.width = '52px';
  });
  
  toggleBtn.addEventListener('mouseleave', () => {
    toggleBtn.style.backgroundColor = 'white';
    toggleBtn.style.width = '48px';
  });
  
  // Click handler - toggles the side panel
  toggleBtn.addEventListener('click', () => {
    console.log('SessyNote: Toggle button clicked');
    chrome.runtime.sendMessage({ action: 'toggleSidePanel' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('SessyNote: Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('SessyNote: Message sent successfully');
      }
    });
  });
  
  // Update button title based on side panel state
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'sidePanelClosed') {
      toggleBtn.title = 'Open SessyNote';
    } else if (message.action === 'sidePanelOpened') {
      toggleBtn.title = 'Close SessyNote';
    }
  });
  
  // Inject into page
  document.body.appendChild(toggleBtn);
})();

// ===============================
// AUTO-SCRAPING AND SESSION AUTO-FILL
// ===============================

// Check URL on page load and navigation
(async function() {
  console.log('SessyNote: Auto-scraping initialized');
  
  // Check URL when page loads
  await checkAndScrapeIfMatch();
  
  // Listen for URL changes (for SPAs)
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(async () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('SessyNote: URL changed to', lastUrl);
      await checkAndScrapeIfMatch();
    }
  });
  
  urlObserver.observe(document.body, { childList: true, subtree: true });
})();

async function checkAndScrapeIfMatch() {
  try {
    // Get stored EMR URL and type ID
    const storage = await chrome.storage.local.get(['emrUrl', 'emrTypeId']);
    
    if (!storage.emrUrl || !storage.emrTypeId) {
      console.log('SessyNote: No EMR URL or type ID stored, skipping');
      return;
    }
    
    // Extract domain from current URL
    const currentDomain = window.location.hostname;
    
    console.log('SessyNote: Comparing domains:', currentDomain, 'vs', storage.emrUrl);
    
    // Check if domains match
    if (currentDomain === storage.emrUrl) {
      console.log('SessyNote: Domain match! Starting scrape...');
      
      // Ask background script to fetch EMR type (to avoid CORS)
      chrome.runtime.sendMessage(
        { action: 'fetchEMRType', emrTypeId: storage.emrTypeId },
        async (response) => {
          if (response && response.success && response.emrType) {
            const emrType = response.emrType;
            
            if (!emrType.response) {
              console.error('SessyNote: No response field in EMR type');
              return;
            }
            
            // Wait a bit for page to fully load
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Scrape data from page
            const scrapedData = scrapePageData(emrType.response);
            
            console.log('SessyNote: Scraped data:', scrapedData);
            
            // Send to background script
            chrome.runtime.sendMessage({
              action: 'autoFillSession',
              data: {
                scrapedData: scrapedData,
                emrTypeId: storage.emrTypeId
              }
            });
          } else {
            console.error('SessyNote: Failed to fetch EMR type:', response?.error);
          }
        }
      );
      
    } else {
      console.log('SessyNote: Domain does not match, skipping');
    }
  } catch (error) {
    console.error('SessyNote: Error in checkAndScrapeIfMatch:', error);
  }
}

function scrapePageData(responseFields) {
  const scrapedData = {};
  
  // Iterate through each field in the response
  for (const [fieldName, fieldConfig] of Object.entries(responseFields)) {
    try {
      const source = fieldConfig.source;
      if (!source || !source.selector) {
        console.warn(`SessyNote: No selector for field ${fieldName}`);
        continue;
      }
      
      // Find element using selector
      const element = document.querySelector(source.selector);
      
      if (!element) {
        console.warn(`SessyNote: Element not found for selector: ${source.selector}`);
        continue;
      }
      
      // Extract value based on attribute
      let value = '';
      const attribute = source.attribute || 'textContent';
      
      if (attribute === 'textContent') {
        value = element.textContent.trim();
      } else if (attribute === 'value') {
        value = element.value;
      } else {
        value = element.getAttribute(attribute) || '';
      }
      
      // Store with api_name as key
      scrapedData[fieldConfig.api_name] = value;
      console.log(`SessyNote: Scraped ${fieldConfig.api_name}:`, value);
      
    } catch (error) {
      console.error(`SessyNote: Error scraping field ${fieldName}:`, error);
    }
  }
  
  return scrapedData;
}
