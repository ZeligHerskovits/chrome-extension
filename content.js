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
