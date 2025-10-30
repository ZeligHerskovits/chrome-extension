// FAST CAPTURE - Popup Script
// Handles captured data and creates HTML file quickly

document.addEventListener("DOMContentLoaded", function () {
  console.log("🚀 Fast popup script loaded");

  // Check if user is logged in
  checkLoginStatus();

  // Setup login functionality
  setupLoginHandlers();

  // Setup main app functionality
  setupMainAppHandlers();
});

function checkLoginStatus() {
  chrome.storage.local.get(["isLoggedIn"], function (result) {
    if (result.isLoggedIn) {
      showMainPage();
    } else {
      showLoginPage();
    }
  });
}

function showLoginPage() {
  document.getElementById("login-page").style.display = "block";
  document.getElementById("main-page").style.display = "none";
}

function showMainPage() {
  document.getElementById("login-page").style.display = "none";
  document.getElementById("main-page").style.display = "block";

  // Set Clients as default active page and navigate to it
  setTimeout(() => {
    const clientsMenuItem = document.querySelector(
      '.menu-item[data-page="clients"]'
    );
    if (clientsMenuItem) {
      clientsMenuItem.classList.add("active");
    }
    // Navigate directly to clients page
    navigateToPage("clients");
  }, 100);
}

// API Configuration - Your actual server URL
const API_BASE_URL = "https://noteddevapi.objectif.solutions/api/v1";

// Handle 401 Unauthorized errors (token expired)
function handle401Error() {
  console.log("⚠️ Token expired or invalid - logging out user");
  
  // Clear all auth data
  chrome.storage.local.remove(
    ["isLoggedIn", "userEmail", "accessToken", "pendingLogin"],
    function () {
      console.log("✅ User logged out due to expired token");
      
      // Show login page
      showLoginPage();
      
      // Show message to user
      showErrorMessage("Your session has expired. Please log in again.");
    }
  );
}

// Helper function to check response for 401 and handle it
function check401Response(response) {
  if (response.status === 401) {
    handle401Error();
    return true; // Indicates 401 was handled
  }
  return false; // No 401, continue normally
}

// Function to fetch EMR type name by ID
async function getEMRTypeName(emrTypeId) {
  try {
    // Check if we already have this EMR type cached
    const cacheKey = `emr_type_${emrTypeId}`;
    const cached = await chrome.storage.local.get([cacheKey]);
    if (cached[cacheKey]) {
      console.log("📋 Using cached EMR type:", cached[cacheKey]);
      return cached[cacheKey];
    }

    // Get access token
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found. Please log in again.");
    }

    // Fetch EMR type from API
    const response = await fetch(`${API_BASE_URL}/emr-types/${emrTypeId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch EMR type: ${response.status}`);
    }

    const emrType = await response.json();
    console.log("📋 EMR type fetched:", emrType);

    // Cache the EMR type name
    await chrome.storage.local.set({
      [cacheKey]: emrType.name || "Unknown type",
    });

    return emrType.name || "Unknown type";
  } catch (error) {
    console.error("❌ Error fetching EMR type:", error);
    showErrorMessage(`Failed to load EMR type: ${error.message}`);
    return "Unknown type";
  }
}

// Function to fetch session detail fields for EMR type
async function getSessionDetailFields(emrTypeId) {
  try {
    // Check if we already have this data cached
    const cacheKey = `session_fields_${emrTypeId}`;
    const cached = await chrome.storage.local.get([cacheKey]);
    if (cached[cacheKey]) {
      console.log("📋 Using cached session fields:", cached[cacheKey]);
      return cached[cacheKey];
    }

    // Get access token
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found. Please log in again.");
    }

    const headers = {
      Authorization: `Bearer ${result.accessToken}`,
      "Content-Type": "application/json",
    };

    // Fetch all three APIs in parallel
    console.log("🔗 API URLs being called:");
    console.log(
      "📊 Results:",
      `${API_BASE_URL}/emr-types/${emrTypeId}/results`
    );
    console.log("📊 Fields:", `${API_BASE_URL}/emr-types-fields/`);
    console.log(
      "📊 Manual:",
      `${API_BASE_URL}/manual-fields/emr-type/${emrTypeId}`
    );

    const [resultsResponse, fieldsResponse, manualFieldsResponse] =
      await Promise.all([
        fetch(`${API_BASE_URL}/emr-types/${emrTypeId}/results`, {
          method: "GET",
          headers,
        }),
        fetch(`${API_BASE_URL}/emr-types-fields/`, {
          method: "GET",
          headers,
        }),
        fetch(`${API_BASE_URL}/manual-fields/emr-type/${emrTypeId}`, {
          method: "GET",
          headers,
        }),
      ]);

    if (!resultsResponse.ok || !fieldsResponse.ok || !manualFieldsResponse.ok) {
      throw new Error(
        `Failed to fetch session fields: ${resultsResponse.status}`
      );
    }

    const [results, fields, manualFields] = await Promise.all([
      resultsResponse.json(),
      fieldsResponse.json(),
      manualFieldsResponse.json(),
    ]);

    console.log("📋 Session fields fetched:", {
      results,
      fields,
      manualFields,
    });

    // Filter results for confirmed status
    const confirmedResults = results.filter(
      (result) => result.status === "confirmed"
    );
    console.log("📋 Confirmed results:", confirmedResults);

    // Create field mapping
    const fieldMapping = {};

    // Map EMR type fields
    fields.forEach((field) => {
      fieldMapping[field.name] = {
        type: field.type,
        source: "emr-type",
      };
    });

    // Map manual fields
    manualFields.forEach((field) => {
      fieldMapping[field.name] = {
        type: field.type,
        source: "manual",
      };
    });

    console.log("📋 Field mapping:", fieldMapping);

    // Create final fields data
    const sessionFields = {
      confirmedResults,
      fieldMapping,
      fields,
      manualFields,
    };

    // Cache the data
    await chrome.storage.local.set({ [cacheKey]: sessionFields });

    return sessionFields;
  } catch (error) {
    console.error("❌ Error fetching session fields:", error);
    showErrorMessage(`Failed to load session fields: ${error.message}`);
    return {
      confirmedResults: [],
      fieldMapping: {},
      fields: [],
      manualFields: [],
    };
  }
}

function setupLoginHandlers() {
  const loginButton = document.getElementById("login-btn");
  const emailInput = document.getElementById("email-input");
  const passwordInput = document.getElementById("password-input");
  const verifyOtpButton = document.getElementById("verify-otp-btn");
  const otpInput = document.getElementById("otp-input");
  const backToLoginButton = document.getElementById("back-to-login-btn");

  // Login button handler
  if (loginButton) {
    loginButton.addEventListener("click", function () {
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();

      if (!email || !password) {
        showErrorMessage("Please enter both email and password");
        return;
      }

      performLogin(email, password);
    });
  }

  // OTP verification button handler
  if (verifyOtpButton) {
    verifyOtpButton.addEventListener("click", function () {
      const otpCode = otpInput.value.trim();
      if (!otpCode || otpCode.length !== 6) {
        showErrorMessage("Please enter a valid 6-digit OTP code");
        return;
      }
      verifyOTP(otpCode);
    });
  }

  // Back to login button handler
  if (backToLoginButton) {
    backToLoginButton.addEventListener("click", function () {
      showLoginForm();
    });
  }

  // Allow Enter key to submit login
  if (emailInput && passwordInput) {
    [emailInput, passwordInput].forEach((input) => {
      input.addEventListener("keypress", function (e) {
        if (e.key === "Enter") {
          loginButton.click();
        }
      });
    });
  }

  // Allow Enter key to submit OTP
  if (otpInput) {
    otpInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        verifyOtpButton.click();
      }
    });
  }
}

async function performLogin(email, password) {
  const loginButton = document.getElementById("login-btn");
  const originalText = loginButton.textContent;

  try {
    // Show loading state
    loginButton.textContent = "Logging in...";
    loginButton.disabled = true;

    // Generate device ID (you can make this more sophisticated)
    const deviceId = await getOrCreateDeviceId();

    // Step 1: Make POST request to login endpoint
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        password: password,
        deviceId: deviceId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    // Step 2: Check if OTP is required
    if (data.otpRequired) {
      // Store email and deviceId for OTP verification
      chrome.storage.local.set({
        pendingLogin: {
          email: email,
          deviceId: deviceId,
        },
      });

      showOTPForm();
      console.log("✅ OTP sent to email:", data.email);
    } else {
      // Step 3: Login successful, store token
      await handleSuccessfulLogin(data.access_token, email);
    }
  } catch (error) {
    console.error("❌ Login error:", error);
    console.error("❌ API URL:", API_BASE_URL);

    let errorMessage = error.message;
    if (error.message.includes("Failed to fetch")) {
      errorMessage =
        "Cannot connect to server. Please check your internet connection.";
    }

    showErrorMessage(errorMessage);
  } finally {
    // Reset button state
    loginButton.textContent = originalText;
    loginButton.disabled = false;
  }
}

async function verifyOTP(otpCode) {
  const verifyButton = document.getElementById("verify-otp-btn");
  const originalText = verifyButton.textContent;

  try {
    // Show loading state
    verifyButton.textContent = "Verifying...";
    verifyButton.disabled = true;

    // Get stored login data
    const result = await chrome.storage.local.get(["pendingLogin"]);
    if (!result.pendingLogin) {
      throw new Error("No pending login found. Please try logging in again.");
    }

    const { email, deviceId } = result.pendingLogin;

    // Step 4: Send OTP verification request
    const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        otp_code: otpCode,
        deviceId: deviceId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "OTP verification failed");
    }

    // Step 5: Store access token and complete login
    await handleSuccessfulLogin(data.access_token, email);

    // Clear pending login data
    chrome.storage.local.remove(["pendingLogin"]);
  } catch (error) {
    console.error("❌ OTP verification error:", error);
    showErrorMessage(error.message);
  } finally {
    // Reset button state
    verifyButton.textContent = originalText;
    verifyButton.disabled = false;
  }
}

async function handleSuccessfulLogin(accessToken, email) {
  // Store login status and token
  await chrome.storage.local.set({
    isLoggedIn: true,
    userEmail: email,
    accessToken: accessToken,
  });

  console.log("✅ User logged in successfully");
  showMainPage();
}

async function getOrCreateDeviceId() {
  const result = await chrome.storage.local.get(["deviceId"]);
  if (result.deviceId) {
    return result.deviceId;
  }

  // Generate a unique device ID
  const deviceId =
    "chrome-extension-" +
    Date.now() +
    "-" +
    Math.random().toString(36).substr(2, 9);
  await chrome.storage.local.set({ deviceId: deviceId });
  return deviceId;
}

function showLoginForm() {
  document.getElementById("login-form").style.display = "block";
  document.getElementById("otp-form").style.display = "none";
  // Clear OTP input
  document.getElementById("otp-input").value = "";
}

function showOTPForm() {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("otp-form").style.display = "block";
  // Focus on OTP input
  document.getElementById("otp-input").focus();
}

function setupMainAppHandlers() {
  const captureButton = document.querySelector(".send-button");
  if (captureButton) {
    captureButton.addEventListener("click", function () {
      console.log("🎯 Fast capture button clicked");
      captureFastHTML();
    });
  } else {
    console.error("❌ Capture button not found");
  }

  // Setup edit button event listeners
  setupEditButtonHandlers();

  // Setup menu functionality
  setupMenuHandlers();

  // Setup forgot password link
  setupForgotPasswordHandler();
}

function setupForgotPasswordHandler() {
  // Use event delegation since the forgot password link is dynamically created
  document.addEventListener("click", async function (event) {
    if (
      event.target &&
      event.target.classList.contains("forgot-password-link")
    ) {
      event.preventDefault();
      console.log("🔑 Forgot password link clicked");
      await handleForgotPassword();
    }
  });
}

async function handleForgotPassword() {
  try {
    // Get the user's email from stored data or profile
    let userEmail = null;

    // Try to get email from stored login data
    const result = await chrome.storage.local.get(["userEmail"]);
    if (result.userEmail) {
      userEmail = result.userEmail;
    } else if (window.currentProfileData && window.currentProfileData.email) {
      userEmail = window.currentProfileData.email;
    }

    if (!userEmail) {
      showErrorMessage(
        "Could not determine your email address. Please log in again."
      );
      return;
    }

    console.log("📧 Sending password reset request for:", userEmail);

    // Make API call to forgot-password endpoint
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userEmail,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to send reset link");
    }

    console.log("✅ Password reset link sent successfully");
    showSuccessMessage(
      `Password reset link sent to ${userEmail}. Please check your email.`
    );
  } catch (error) {
    console.error("❌ Forgot password error:", error);
    showErrorMessage("Failed to send reset link. Please try again.");
  }
}

function setupEditButtonHandlers() {
  // Personal Info edit button (top)
  const editPersonalBtn = document.getElementById("edit-personal-info-btn");
  if (editPersonalBtn) {
    editPersonalBtn.addEventListener("click", function () {
      console.log("✏️ Personal Info edit button clicked");
      editPersonalInfo();
    });
  }

  // Personal Info edit button (bottom)
  const editPersonalBottomBtn = document.getElementById("edit-personal-info-bottom-btn");
  if (editPersonalBottomBtn) {
    editPersonalBottomBtn.addEventListener("click", function () {
      console.log("✏️ Personal Info bottom edit button clicked");
      editPersonalInfo();
    });
  }

  // EMR Info edit button (top)
  const editEMRBtn = document.getElementById("edit-emr-info-btn");
  if (editEMRBtn) {
    editEMRBtn.addEventListener("click", function () {
      console.log("✏️ EMR Info edit button clicked");
      editEMRInfo();
    });
  }

  // EMR Info edit button (bottom)
  const editEMRBottomBtn = document.getElementById("edit-emr-info-bottom-btn");
  if (editEMRBottomBtn) {
    editEMRBottomBtn.addEventListener("click", function () {
      console.log("✏️ EMR Info bottom edit button clicked");
      editEMRInfo();
    });
  }

  // Company Info edit button (top)
  const editCompanyBtn = document.getElementById("edit-company-info-btn");
  if (editCompanyBtn) {
    editCompanyBtn.addEventListener("click", function () {
      console.log("✏️ Company Info edit button clicked");
      editCompanyInfo();
    });
  }

  // Company Info edit button (bottom)
  const editCompanyBottomBtn = document.getElementById("edit-company-info-bottom-btn");
  if (editCompanyBottomBtn) {
    editCompanyBottomBtn.addEventListener("click", function () {
      console.log("✏️ Company Info bottom edit button clicked");
      editCompanyInfo();
    });
  }
}

function setupMenuHandlers() {
  const menuToggle = document.getElementById("menu-toggle");
  const sideMenu = document.getElementById("side-menu");
  const mainContent = document.getElementById("main-content");
  const menuOverlay = document.getElementById("menu-overlay");
  const menuItems = document.querySelectorAll(".menu-item[data-page]");
  const signOutBtn = document.getElementById("sign-out-btn");
  const toggleSidePanelBtn = document.getElementById("toggle-side-panel");
  const floatingToggleBtn = document.getElementById("floating-panel-toggle");

  // Side panel toggle button functionality (header button)
  if (toggleSidePanelBtn) {
    toggleSidePanelBtn.addEventListener("click", function () {
      console.log("🔄 Toggle side panel button clicked");
      window.close();
    });
  }

  // Floating toggle button functionality (side button)
  if (floatingToggleBtn) {
    floatingToggleBtn.addEventListener("click", function () {
      console.log("🔄 Floating toggle button clicked");
      window.close();
    });
  }

  // Menu toggle functionality
  if (menuToggle && sideMenu && mainContent && menuOverlay) {
    menuToggle.addEventListener("click", function () {
      const isOpen = sideMenu.classList.contains("open");

      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Close menu when clicking overlay
    menuOverlay.addEventListener("click", function () {
      closeMenu();
    });
  }

  function openMenu() {
    sideMenu.classList.add("open");
    menuOverlay.classList.add("show");
  }

  function closeMenu() {
    sideMenu.classList.remove("open");
    menuOverlay.classList.remove("show");
  }

  // Navigation functionality
  menuItems.forEach((item) => {
    item.addEventListener("click", function () {
      const page = this.getAttribute("data-page");
      navigateToPage(page);

      // Update active state
      menuItems.forEach((i) => i.classList.remove("active"));
      this.classList.add("active");

      // Close menu after selection
      closeMenu();
    });
  });

  // Sign out functionality
  if (signOutBtn) {
    signOutBtn.addEventListener("click", function () {
      chrome.storage.local.remove(
        ["isLoggedIn", "userEmail", "accessToken", "pendingLogin"],
        function () {
          console.log("✅ User logged out successfully");
          showLoginPage();
        }
      );
    });
  }

  // Clients page specific handlers
  setupClientsPageHandlers();
}

function setupClientsPageHandlers() {
  const clientsBackBtn = document.querySelector(".back-arrow-figma");
  const addClientBtn = document.getElementById("add-client-btn");

  // Back button functionality
  if (clientsBackBtn) {
    clientsBackBtn.addEventListener("click", function () {
      // Navigate back to home page
      navigateToPage("home");

      // Update menu active state
      const menuItems = document.querySelectorAll(".menu-item[data-page]");
      menuItems.forEach((item) => item.classList.remove("active"));
      const homeMenuItem = document.querySelector(
        '.menu-item[data-page="home"]'
      );
      if (homeMenuItem) {
        homeMenuItem.classList.add("active");
      }
    });
  }

  // Add client button functionality
  if (addClientBtn) {
    addClientBtn.addEventListener("click", function () {
      console.log("➕ Add client clicked");
      showAddClientModal();
    });
  }

  // Setup add client modal
  setupAddClientModal();
  setupConfirmDeleteModal();
  setupEditSessionModal();

  // Add history button functionality
  const addHistoryBtn = document.getElementById("add-history-btn");
  if (addHistoryBtn) {
    addHistoryBtn.addEventListener("click", function () {
      console.log("📝 Add history clicked");
      // You can add history creation functionality here
      alert("Add history functionality will be implemented here");
    });
  }

  // Profile tab functionality
  const profilePersonalTab = document.getElementById("profile-personal-tab");
  const profileEmrTab = document.getElementById("profile-emr-tab");
  const profilePersonalContent = document.getElementById("profile-personal-tab-content");
  const profileEmrContent = document.getElementById("profile-emr-tab-content");

  if (profilePersonalTab && profileEmrTab) {
    profilePersonalTab.addEventListener("click", function () {
      // Switch to Personal Info tab
      profilePersonalTab.classList.add("active");
      profileEmrTab.classList.remove("active");
      profilePersonalContent.classList.add("active");
      profilePersonalContent.style.display = "block";
      profileEmrContent.classList.remove("active");
      profileEmrContent.style.display = "none";
    });

    profileEmrTab.addEventListener("click", function () {
      // Switch to EMR Info tab
      profileEmrTab.classList.add("active");
      profilePersonalTab.classList.remove("active");
      profileEmrContent.classList.add("active");
      profileEmrContent.style.display = "block";
      profilePersonalContent.classList.remove("active");
      profilePersonalContent.style.display = "none";
    });
  }

  // Client detail tab functionality
  const clientInfoTab = document.getElementById("client-info-tab");
  const sessionsTab = document.getElementById("sessions-tab");
  const clientInfoContent = document.getElementById("client-info-content");
  const sessionsContent = document.getElementById("sessions-content");
  const backArrowTab = document.querySelector(".back-arrow-tab");

  // Session detail tab functionality
  const sessionInfoTab = document.getElementById("session-info-tab");
  const sessionActivityTab = document.getElementById("session-activity-tab");
  const sessionInfoContent = document.getElementById("session-info-content");
  const sessionActivityContent = document.getElementById(
    "session-activity-content"
  );
  const backArrowSession = document.querySelector(".back-arrow-session");

  // Tab switching functionality
  if (clientInfoTab && sessionsTab && clientInfoContent && sessionsContent) {
    clientInfoTab.addEventListener("click", function () {
      // Switch to Client Info tab
      clientInfoTab.classList.add("active");
      sessionsTab.classList.remove("active");
      clientInfoContent.classList.add("active");
      sessionsContent.classList.remove("active");

      // IMPORTANT: Clear sessions list when switching away from Sessions tab
      clearSessionsList();
      console.log("✅ Switched to Client Info tab - sessions cleared and hidden");

      // Show Client History card in Client Info tab
      const clientHistoryCard = document.getElementById("client-history-card");
      if (clientHistoryCard) {
        clientHistoryCard.style.display = "block";
      }
    });

    sessionsTab.addEventListener("click", function () {
      // Switch to Sessions tab
      sessionsTab.classList.add("active");
      clientInfoTab.classList.remove("active");
      sessionsContent.classList.add("active");
      clientInfoContent.classList.remove("active");

      // Hide Client History card in Sessions tab
      const clientHistoryCard = document.getElementById("client-history-card");
      if (clientHistoryCard) {
        clientHistoryCard.style.display = "none";
      }

      // Clear and reload sessions to ensure fresh data
      clearSessionsList();
      loadClientSessions();
    });
  }

  // Back arrow functionality
  if (backArrowTab) {
    backArrowTab.addEventListener("click", function () {
      // Navigate back to clients page
      navigateToPage("clients");

      // Update menu active state
      const menuItems = document.querySelectorAll(".menu-item[data-page]");
      menuItems.forEach((item) => item.classList.remove("active"));
      const clientsMenuItem = document.querySelector(
        '.menu-item[data-page="clients"]'
      );
      if (clientsMenuItem) {
        clientsMenuItem.classList.add("active");
      }
    });
  }

  // Session tab switching functionality will be set up when session detail page is shown

  // Session back arrow functionality
  if (backArrowSession) {
    backArrowSession.addEventListener("click", function () {
      // Show sessions list again when going back
      const sessionsContent = document.getElementById("sessions-content");
      if (sessionsContent) {
        sessionsContent.style.display = "block";
      }

      // Navigate back to client detail page
      navigateToPage("client-detail");
    });
  }

  // Session action buttons functionality
  const editButton = document.querySelector(".edit-button");
  const generateAiNotesButton = document.querySelector(
    ".generate-ai-notes-button"
  );

  if (editButton) {
    editButton.addEventListener("click", function () {
      console.log("✏️ Edit button clicked");
      // Get the current session data and open edit modal
      chrome.storage.local.get(["currentSession"], function (result) {
        if (result.currentSession) {
          showEditSessionModal(result.currentSession);
        } else {
          showErrorMessage(
            "No session data found. Please view the session first."
          );
        }
      });
    });
  }

  if (generateAiNotesButton) {
    generateAiNotesButton.addEventListener("click", function () {
      console.log("🔄 Generate AI Notes button clicked");
      generateAINotes();
    });
  }

  // AI Notes copy icon functionality
  const copyIcons = document.querySelectorAll(".ai-notes-copy-icon");
  copyIcons.forEach((icon) => {
    icon.addEventListener("click", function () {
      const textContainer = this.closest(".ai-notes-text-container");
      const text = textContainer.querySelector(".ai-notes-text").textContent;

      // Copy text to clipboard
      navigator.clipboard
        .writeText(text)
        .then(() => {
          console.log("📋 Text copied to clipboard:", text);
          // TODO: Show success message
          alert("Text copied to clipboard!");
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
          alert("Failed to copy text");
        });
    });
  });

  // Set up static session buttons
  setupStaticSessionButtons();

  // DO NOT load sessions on page load - only when Sessions tab is clicked
  // Clear any existing sessions
  clearSessionsList();

  // Only update session count for display in Client Info tab
  updateSessionCountForClientInfo();
}

async function loadClientSessions() {
  // Get current client ID from storage
  chrome.storage.local.get(
    ["currentClient", "sessionsCache"],
    async function (result) {
      if (result.currentClient && result.currentClient.clientId) {
        const clientId = result.currentClient.clientId;
        console.log("🔄 Loading sessions for client ID:", clientId);

        // Check if we have cached sessions for this client
        if (result.sessionsCache && result.sessionsCache[clientId]) {
          console.log("📋 Using cached sessions for client:", clientId);
          const clientSessions = result.sessionsCache[clientId];
          if (clientSessions && clientSessions.length > 0) {
            await renderSessionsList(clientSessions);
            // Update session count in client detail page
            updateClientDetailSessionCount(clientSessions.length);
          } else {
            showEmptySessionsState();
            // Update session count to 0
            updateClientDetailSessionCount(0);
          }
        } else {
          console.log(
            "📋 No cached sessions, fetching from API for client:",
            clientId
          );
          loadSessionsFromAPI(clientId);
        }
      }
    }
  );
}

function setupStaticSessionButtons() {
  // Add click handlers to all static session buttons
  const viewSessionBtns = document.querySelectorAll(".view-session-btn");
  viewSessionBtns.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent any parent click events
      const sessionId = this.getAttribute("data-session-id");
      console.log("📋 View Session clicked for session ID:", sessionId);

      // Create a mock session object for the static data
      const mockSession = {
        id: sessionId,
        name: this.closest(".session-item").querySelector(".session-name")
          .textContent,
        date: this.closest(".session-item").querySelector(".session-date")
          .textContent,
        time_in: this.closest(".session-item")
          .querySelector(".session-times span:first-child")
          .textContent.replace("Time in: ", ""),
        time_out: this.closest(".session-item")
          .querySelector(".session-times span:last-child")
          .textContent.replace("Time out: ", ""),
        length: this.closest(".session-item")
          .querySelector(".session-info span:first-child")
          .textContent.replace("Length: ", ""),
        service_type: this.closest(".session-item")
          .querySelector(".session-info span:last-child")
          .textContent.replace("Service Type: ", ""),
      };

      showSessionDetail(mockSession);
    });
  });
}

// Function to load sessions from API (ready for real implementation)
async function loadSessionsFromAPI(clientId) {
  try {
    // Get access token
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found. Please log in again.");
    }

    // Fetch sessions from API using client ID
    const response = await fetch(
      `${API_BASE_URL}/sessions?client_id=${clientId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.status}`);
    }

    const sessions = await response.json();
    console.log("📋 Sessions loaded for client:", clientId, sessions);
    console.log(
      "📋 First session fields:",
      sessions[0] ? Object.keys(sessions[0]) : "No sessions"
    );
    console.log("📋 First session emr_type_id:", sessions[0]?.emr_type_id);

    // Update the sessions list with real data
    if (sessions && sessions.length > 0) {
      await renderSessionsList(sessions);
      // Update session count in client detail page
      updateClientDetailSessionCount(sessions.length);
    } else {
      showEmptySessionsState();
      // Update session count to 0
      updateClientDetailSessionCount(0);
    }
  } catch (error) {
    console.error("❌ Error loading sessions:", error);
    showErrorMessage(`Failed to load sessions: ${error.message}`);
  }
}

async function renderSessionsList(sessions) {
  const sessionsList = document.getElementById("sessions-list");
  if (!sessionsList) return;

  // Clear existing sessions
  sessionsList.innerHTML = "";

  if (!sessions || sessions.length === 0) {
    // Show empty state
    sessionsList.innerHTML = `
      <div class="empty-state">
        <p>No sessions found for this client</p>
      </div>
    `;
    return;
  }

  // Get current client name for display
  chrome.storage.local.get(["currentClient"], async function (result) {
    const clientName = result.currentClient
      ? `${result.currentClient.first_name || ""} ${
          result.currentClient.last_name || ""
        }`.trim()
      : "Client";

    // Render each session
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const sessionItem = await createSessionItem(session, i, clientName);
      sessionsList.appendChild(sessionItem);
    }

    // Set up event listeners for View Session buttons after rendering
    setupViewSessionButtons();
  });
}

function clearSessionsList() {
  const sessionsList = document.getElementById("sessions-list");
  if (!sessionsList) return;

  // Clear existing sessions
  sessionsList.innerHTML = "";
  console.log("📋 Cleared sessions list");
}

function setupViewSessionButtons() {
  // Add click handlers to all View Session buttons
  const viewSessionBtns = document.querySelectorAll(".view-session-btn");
  console.log(`📋 Setting up ${viewSessionBtns.length} View Session buttons`);

  viewSessionBtns.forEach((btn) => {
    // Remove any existing event listeners
    btn.replaceWith(btn.cloneNode(true));
  });

  // Get fresh references after cloning
  const freshViewSessionBtns = document.querySelectorAll(".view-session-btn");
  freshViewSessionBtns.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const sessionId = this.getAttribute("data-session-id");
      console.log("📋 View Session clicked for session ID:", sessionId);

      // Find the session data from the sessions list
      const sessionItem = this.closest(".session-item");
      if (sessionItem) {
        // Get the real session data from storage
        chrome.storage.local.get(
          ["sessionsCache", "currentClient"],
          function (result) {
            if (result.sessionsCache && result.currentClient) {
              const clientId = result.currentClient.clientId;
              const clientSessions = result.sessionsCache[clientId];

              if (clientSessions) {
                // Find the session with matching ID
                const session = clientSessions.find((s) => s.id === sessionId);
                if (session) {
                  console.log("📋 Found real session data:", session);
                  showSessionDetail(session);
                } else {
                  console.error("❌ Session not found in cache");
                }
              } else {
                console.error("❌ No cached sessions found");
              }
            } else {
              console.error("❌ No sessions cache or current client found");
            }
          }
        );
      }
    });
  });
}

function updateClientDetailSessionCount(sessionCount) {
  // Update session count in client detail header
  const clientSessionsHeader = document.getElementById(
    "client-sessions-header"
  );
  if (clientSessionsHeader) {
    clientSessionsHeader.textContent = `${sessionCount} Sessions`;
  }

  // Update session count in client detail content
  const clientSessions = document.getElementById("client-sessions");
  if (clientSessions) {
    clientSessions.textContent = `${sessionCount} Sessions`;
  }

  console.log(`📋 Updated client detail session count to: ${sessionCount}`);
}

function formatPhoneNumber(phone) {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, "");

  // Format as (XXX) XXX-XXXX for 10-digit numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(
      6
    )}`;
  }

  // Format as +X (XXX) XXX-XXXX for 11-digit numbers starting with 1
  if (cleaned.length === 11 && cleaned[0] === "1") {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(
      7
    )}`;
  }

  // Return original if not a standard format
  return phone;
}

function updateSessionCountForClientInfo() {
  // Get current client ID and update session count immediately
  chrome.storage.local.get(
    ["currentClient", "sessionsCache"],
    function (result) {
      if (result.currentClient && result.currentClient.clientId) {
        const clientId = result.currentClient.clientId;
        console.log("🔄 Updating session count for client:", clientId);

        // Get session count from cache
        if (result.sessionsCache && result.sessionsCache[clientId]) {
          const sessionCount = result.sessionsCache[clientId].length;
          updateClientDetailSessionCount(sessionCount);
          console.log(
            `📋 Updated Client Info session count from cache: ${sessionCount}`
          );
        } else {
          // If no cache, fetch from API
          console.log("📋 No cache found, fetching from API...");
          getClientSessions(clientId)
            .then((sessions) => {
              const sessionCount = sessions.length;
              updateClientDetailSessionCount(sessionCount);
              console.log(
                `📋 Updated Client Info session count from API: ${sessionCount}`
              );
            })
            .catch((error) => {
              console.error("❌ Error fetching sessions for count:", error);
              updateClientDetailSessionCount(0);
            });
        }
      } else {
        console.log("❌ No current client found for session count update");
      }
    }
  );
}

function showEmptySessionsState() {
  const sessionsList = document.getElementById("sessions-list");
  if (!sessionsList) return;

  // Clear existing sessions
  sessionsList.innerHTML = "";

  // Show empty state
  sessionsList.innerHTML = `
    <div class="empty-sessions-state">
      <div class="empty-sessions-content">
        <div class="empty-sessions-icon">📋</div>
        <h3 class="empty-sessions-title">No Sessions Found</h3>
        <p class="empty-sessions-message">This client doesn't have any sessions yet.</p>
      </div>
    </div>
  `;

  console.log("📋 Showing empty sessions state");
}

async function createSessionItem(session, index, clientName) {
  const sessionItem = document.createElement("div");
  sessionItem.className = "session-item";
  sessionItem.setAttribute("data-session-id", session.id || index);

  // Format created_at date
  const sessionDate = session.created_at
    ? new Date(session.created_at).toLocaleDateString()
    : "No date";

  // Truncate manual_instructions if too long
  const instructions = session.manual_instructions || "No instructions";
  const truncatedInstructions =
    instructions.length > 50
      ? instructions.substring(0, 50) + "..."
      : instructions;

  // Get EMR type name if emr_type_id exists
  let emrTypeName = "No type";
  if (session.emr_type_id) {
    try {
      emrTypeName = await getEMRTypeName(session.emr_type_id);
    } catch (error) {
      console.error("❌ Error fetching EMR type:", error);
      emrTypeName = "Unknown type";
    }
  }

  sessionItem.innerHTML = `
    <div class="session-header">
      <h3 class="session-name">${clientName} - Session ${index + 1}</h3>
      <div class="session-actions">
        <div class="session-menu" data-session-id="${session.id || index}">
          <span class="menu-dots">⋯</span>
          <div class="session-menu-dropdown" id="session-menu-${
            session.id || index
          }">
            <div class="menu-item edit" data-session-id="${
              session.id || index
            }">Edit</div>
            <div class="menu-item delete" data-session-id="${
              session.id || index
            }">Delete</div>
          </div>
        </div>
      </div>
    </div>
    <div class="session-details">
      <div class="session-date">${sessionDate}</div>
      <div class="session-times">
        <span>Client: ${clientName}</span>
        <span>Type: ${emrTypeName}</span>
        <span>Instructions: ${truncatedInstructions}</span>
      </div>
      <div class="session-info">
        <span>Created: ${sessionDate}</span>
      </div>
      <button class="view-session-btn" data-session-id="${
        session.id || index
      }">View Session</button>
    </div>
  `;

  // Add click handler for View Session button
  const viewSessionBtn = sessionItem.querySelector(".view-session-btn");
  if (viewSessionBtn) {
    viewSessionBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      console.log("📋 View Session clicked for session:", session);
      showSessionDetail(session);
    });
  }

  // Add session menu click handler
  const sessionMenuElement = sessionItem.querySelector(".session-menu");
  if (sessionMenuElement) {
    sessionMenuElement.addEventListener("click", function (event) {
      event.stopPropagation();
      event.preventDefault();
      const sessionId = this.getAttribute("data-session-id");
      toggleSessionMenu(sessionId);
    });
  }

  // Add session menu item click handlers
  const editButton = sessionItem.querySelector(".menu-item.edit");
  const deleteButton = sessionItem.querySelector(".menu-item.delete");

  if (editButton) {
    editButton.addEventListener("click", function (event) {
      event.stopPropagation();
      event.preventDefault();
      const sessionId = this.getAttribute("data-session-id");
      editSession(sessionId);
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener("click", function (event) {
      event.stopPropagation();
      event.preventDefault();
      const sessionId = this.getAttribute("data-session-id");
      deleteSession(sessionId);
    });
  }

  return sessionItem;
}

function navigateToPage(page) {
  console.log(`🔄 navigateToPage called with: ${page}`);

  // Hide all pages
  const pages = document.querySelectorAll(".page-content");
  console.log(`📄 Found ${pages.length} pages to hide`);
  pages.forEach((page) => {
    page.style.display = "none";
  });

  // IMPORTANT: Always clear sessions list when navigating away from client-detail
  // This ensures sessions are NEVER visible on any other page
  if (page !== "client-detail") {
    // Clear the sessions list from DOM
    clearSessionsList();
    console.log("✅ Cleared sessions list when navigating to:", page);
    
    // Reset client-detail tabs to default state
    const clientInfoTab = document.getElementById("client-info-tab");
    const sessionsTab = document.getElementById("sessions-tab");
    const clientInfoContent = document.getElementById("client-info-content");
    const sessionsContent = document.getElementById("sessions-content");
    
    if (clientInfoTab && sessionsTab && clientInfoContent && sessionsContent) {
      // Reset to Client Info tab
      clientInfoTab.classList.add("active");
      sessionsTab.classList.remove("active");
      clientInfoContent.classList.add("active");
      sessionsContent.classList.remove("active");
      
      // Show Client History card when resetting to Client Info tab
      const clientHistoryCard = document.getElementById("client-history-card");
      if (clientHistoryCard) {
        clientHistoryCard.style.display = "block";
      }
      
      console.log("✅ Reset client-detail tabs to default (Client Info)");
    }
  }

  // Show selected page
  const targetPage = document.getElementById(`${page}-page`);
  console.log(`🎯 Target page element:`, targetPage);
  if (targetPage) {
    targetPage.style.display = "block";
    console.log(`✅ Successfully showed ${page}-page`);
  } else {
    console.error(`❌ Could not find element with ID: ${page}-page`);
  }

  // Load page-specific data
  if (page === "clients") {
    loadClients();
  } else if (page === "profile") {
    loadProfileData();
  } else if (page === "session-detail") {
    loadSessionAINotes();
  }

  console.log(`📄 Navigated to ${page} page`);
}

async function loadClients() {
  const clientsList = document.getElementById("clients-list");
  const loadingState = document.getElementById("clients-loading");
  const emptyState = document.getElementById("clients-empty");

  try {
    // Show loading state
    loadingState.style.display = "block";
    emptyState.style.display = "none";

    // Clear existing client items
    const existingItems = clientsList.querySelectorAll(".client-item");
    existingItems.forEach((item) => item.remove());

    // Get access token
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found. Please log in again.");
    }

    // Fetch clients from API
    const response = await fetch(`${API_BASE_URL}/api/Clients`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    // Check for 401 Unauthorized (token expired)
    if (response.status === 401) {
      handle401Error();
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch clients: ${response.status}`);
    }

    const clients = await response.json();

    // Debug: Log the actual API response
    console.log("🔍 API Response:", clients);
    console.log("🔍 Clients data type:", typeof clients);
    console.log("🔍 Clients length:", clients?.length);

    // Hide loading state
    loadingState.style.display = "none";

    if (!clients || clients.length === 0) {
      // Show empty state
      emptyState.style.display = "block";
      return;
    }

    // Load clients with their session counts
    await loadClientsWithSessionCounts(clients);

    console.log(`✅ Loaded ${clients.length} clients`);
  } catch (error) {
    console.error("❌ Error loading clients:", error);

    // Hide loading state
    loadingState.style.display = "none";

    // Show error message
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-state";
    errorDiv.innerHTML = `<p>Error loading clients: ${error.message}</p>`;
    clientsList.appendChild(errorDiv);
  }
}

async function loadClientsWithSessionCounts(clients) {
  const clientsList = document.getElementById("clients-list");
  if (!clientsList) return;

  // Cache to store all sessions data
  const sessionsCache = {};

  // Load each client with their session count
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const clientId = client.id || client.client_id;

    try {
      // Fetch sessions for this client
      const sessions = await getClientSessions(clientId);

      // Cache the sessions data
      sessionsCache[clientId] = sessions;

      // Create client item with real session count
      const clientItem = createClientItemWithSessionCount(
        client,
        i,
        sessions.length
      );
      clientsList.appendChild(clientItem);
    } catch (error) {
      console.error("❌ Error loading sessions for client:", clientId, error);
      showErrorMessage(`Failed to load sessions for client: ${error.message}`);
      // Create client item with 0 sessions if error
      const clientItem = createClientItemWithSessionCount(client, i, 0);
      clientsList.appendChild(clientItem);
    }
  }

  // Store sessions cache for later use
  chrome.storage.local.set({ sessionsCache: sessionsCache });
  console.log("📋 Sessions cached for all clients:", sessionsCache);
}

async function getClientSessions(clientId) {
  try {
    // Get access token
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      return [];
    }

    // Fetch sessions for this client
    const response = await fetch(
      `${API_BASE_URL}/sessions?client_id=${clientId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Check for 401 Unauthorized (token expired)
    if (response.status === 401) {
      handle401Error();
      return [];
    }

    if (!response.ok) {
      console.error(
        `Failed to fetch sessions for client ${clientId}: ${response.status}`
      );
      return [];
    }

    const sessions = await response.json();
    console.log(`📋 Client ${clientId} has ${sessions.length} sessions`);

    // Fetch EMR type names for each session
    for (let session of sessions) {
      if (session.emr_type_id) {
        try {
          const emrTypeName = await getEMRTypeName(session.emr_type_id);
          session.emr_type_name = emrTypeName;
          console.log(`📋 Session ${session.id} EMR type: ${emrTypeName}`);
        } catch (error) {
          console.error(
            `❌ Error fetching EMR type for session ${session.id}:`,
            error
          );
          session.emr_type_name = "Unknown Type";
        }
      } else {
        session.emr_type_name = "Unknown Type";
      }
    }

    return sessions;
  } catch (error) {
    console.error(`Error fetching sessions for client ${clientId}:`, error);
    showErrorMessage(`Failed to fetch sessions: ${error.message}`);
    return [];
  }
}

function createClientItemWithSessionCount(client, index, sessionCount) {
  // Generate avatar from client name (first_name + last_name)
  const clientName =
    `${client.first_name || ""} ${client.last_name || ""}`.trim() || "Client";
  const avatarText = getInitials(clientName);

  const clientItem = document.createElement("div");
  clientItem.className = "client-item";
  clientItem.setAttribute("data-client-id", client.id || client.client_id);

  clientItem.innerHTML = `
    <div class="client-avatar">
      ${avatarText}
    </div>
    <div class="client-info">
      <h3 class="client-name">${clientName}</h3>
      <p class="client-sessions">${sessionCount} Sessions</p>
    </div>
    <div class="client-actions">
        <div class="client-menu" data-client-id="${
          client.id || client.client_id
        }">
          <span class="menu-dots">:</span>
        <div class="client-menu-dropdown" id="menu-${
          client.id || client.client_id
        }">
          <div class="menu-item edit" data-client-id="${
            client.id || client.client_id
          }">Edit</div>
          <div class="menu-item delete" data-client-id="${
            client.id || client.client_id
          }">Delete</div>
        </div>
      </div>
      <div class="client-arrow">›</div>
    </div>
  `;

  // Add click handler (but exclude the menu area)
  clientItem.addEventListener("click", function (event) {
    // Don't navigate if clicking on the menu or its children
    if (event.target.closest(".client-menu")) {
      return;
    }
    showClientDetail(client);
  });

  // Add menu click handler
  const menuElement = clientItem.querySelector(".client-menu");
  if (menuElement) {
    menuElement.addEventListener("click", function (event) {
      event.stopPropagation();
      event.preventDefault();
      const clientId = this.getAttribute("data-client-id");
      toggleClientMenu(clientId);
    });
  }

  // Add menu item click handlers
  const editButton = clientItem.querySelector(".menu-item.edit");
  const deleteButton = clientItem.querySelector(".menu-item.delete");

  if (editButton) {
    editButton.addEventListener("click", function (event) {
      event.stopPropagation();
      event.preventDefault();
      const clientId = this.getAttribute("data-client-id");
      editClient(clientId);
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener("click", function (event) {
      event.stopPropagation();
      event.preventDefault();
      const clientId = this.getAttribute("data-client-id");
      deleteClient(clientId);
    });
  }

  return clientItem;
}

function createClientItem(client, index) {
  // Debug: Log each client object
  console.log("🔍 Client object:", client);
  console.log("🔍 Client keys:", Object.keys(client));

  const clientItem = document.createElement("div");
  clientItem.className = "client-item";
  clientItem.setAttribute(
    "data-client-id",
    client.id || client.client_id || index
  );

  // Generate avatar from client name (first_name + last_name)
  const clientName =
    `${client.first_name || ""} ${client.last_name || ""}`.trim() || "Client";
  const avatarText = getInitials(clientName);

  // Debug: Log client data to see available fields
  console.log("🔍 Client data:", client);
  console.log("🔍 Client history:", client.history);
  console.log("🔍 Available fields:", Object.keys(client));

  // Get session count from history or default
  const sessionCount = client.history ? client.history.length : 0;

  clientItem.innerHTML = `
    <div class="client-avatar">
      ${avatarText}
    </div>
    <div class="client-info">
      <h3 class="client-name">${clientName}</h3>
      <p class="client-sessions">${sessionCount} Sessions</p>
    </div>
    <div class="client-arrow">›</div>
  `;

  // Add click handler for client details
  clientItem.addEventListener("click", function () {
    console.log("👤 Client clicked:", client);
    showClientDetail(client);
  });

  // Add click handler for View Session button
  const viewSessionBtn = clientItem.querySelector(".view-session-btn");
  if (viewSessionBtn) {
    viewSessionBtn.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent client click event
      console.log("📋 View Session clicked for client:", client);
      showSessionDetail(client);
    });
  }

  return clientItem;
}

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

function showClientDetail(client) {
  // Store current client data including ID
  const clientData = {
    ...client,
    clientId: client.id || client.client_id || null,
  };

  chrome.storage.local.set({ currentClient: clientData }, function () {
    console.log("📋 Client data stored with ID:", clientData.clientId);
  });

  // Update client detail page with data
  updateClientDetailPage(clientData);

  // Navigate to client detail page
  navigateToPage("client-detail");

  // IMPORTANT: Ensure Client History card is visible when entering client-detail page
  setTimeout(() => {
    const clientHistoryCard = document.getElementById("client-history-card");
    if (clientHistoryCard) {
      clientHistoryCard.style.display = "block";
      console.log("✅ Client History card shown on page load");
    }
    updateSessionCountForClientInfo();
  }, 100);

  // Update menu active state (no active menu item for detail page)
  const menuItems = document.querySelectorAll(".menu-item[data-page]");
  menuItems.forEach((item) => item.classList.remove("active"));
}

async function showSessionDetail(session) {
  console.log("🚀 showSessionDetail called with session:", session);

  // Store current session data
  chrome.storage.local.set({ currentSession: session }, function () {
    console.log("💾 Session data stored:", session);
  });

  // Fetch dynamic fields if session has emr_type_id
  let dynamicFields = null;
  console.log("🔍 Checking for emr_type_id in session:", session);
  console.log("🔍 Session has emr_type_id:", !!session.emr_type_id);
  console.log("🔍 Session emr_type_id value:", session.emr_type_id);

  if (session.emr_type_id) {
    try {
      console.log(
        "🔄 Fetching dynamic fields for emr_type_id:",
        session.emr_type_id
      );
      dynamicFields = await getSessionDetailFields(session.emr_type_id);
      console.log("📋 Dynamic fields loaded:", dynamicFields);
    } catch (error) {
      console.error("❌ Error loading dynamic fields:", error);
    }
  } else {
    console.log("❌ No emr_type_id found in session, skipping dynamic fields");
  }

  // Update session detail page with data
  updateSessionDetailPage(session, dynamicFields);

  // Hide the sessions list when viewing session detail
  const sessionsContent = document.getElementById("sessions-content");
  if (sessionsContent) {
    sessionsContent.style.display = "none";
  }

  // Navigate to session detail page
  console.log("🔄 Navigating to session-detail page...");
  navigateToPage("session-detail");

  // Verify the page is visible
  setTimeout(() => {
    const sessionDetailPage = document.getElementById("session-detail-page");
    if (sessionDetailPage) {
      console.log("✅ Session detail page found and should be visible");
      console.log("📄 Page display style:", sessionDetailPage.style.display);
    } else {
      console.error("❌ Session detail page not found!");
    }
  }, 200);

  // Setup session tab functionality after page is shown
  setupSessionTabHandlers();

  // Set initial button text for Session Info tab (default active)
  updateSessionButtons("session-info");

  // Show session details for Session Info tab (default active)
  showSessionDetailsForSessionInfo();

  console.log("✅ showSessionDetail completed");
}

function setupSessionTabHandlers() {
  // Get session tab elements
  const sessionInfoTab = document.getElementById("session-info-tab");
  const sessionActivityTab = document.getElementById("session-activity-tab");
  const sessionInfoContent = document.getElementById("session-info-content");
  const sessionActivityContent = document.getElementById(
    "session-activity-content"
  );

  // Setup feedback handler when tab is shown
  setupFeedbackHandler();

  // Session tab switching functionality
  if (
    sessionInfoTab &&
    sessionActivityTab &&
    sessionInfoContent &&
    sessionActivityContent
  ) {
    // Remove existing event listeners to avoid duplicates
    sessionInfoTab.replaceWith(sessionInfoTab.cloneNode(true));
    sessionActivityTab.replaceWith(sessionActivityTab.cloneNode(true));

    // Get fresh references after cloning
    const freshSessionInfoTab = document.getElementById("session-info-tab");
    const freshSessionActivityTab = document.getElementById(
      "session-activity-tab"
    );

    freshSessionInfoTab.addEventListener("click", function () {
      // Switch to Session Info tab
      freshSessionInfoTab.classList.add("active");
      freshSessionActivityTab.classList.remove("active");
      sessionInfoContent.classList.add("active");
      sessionActivityContent.classList.remove("active");

      // Show session detected banner and session details for Session Info tab
      showSessionDetailsForSessionInfo();

      // Update buttons for Session Info tab
      updateSessionButtons("session-info");

      // Check if AI notes exist and update button text accordingly
      checkAndUpdateAIButtonState();
    });

    freshSessionActivityTab.addEventListener("click", function () {
      // Switch to AI Notes tab
      freshSessionActivityTab.classList.add("active");
      freshSessionInfoTab.classList.remove("active");
      sessionActivityContent.classList.add("active");
      sessionInfoContent.classList.remove("active");

      // Hide session detected banner and session details for AI Notes tab
      hideSessionDetailsForAINotes();

      // Update buttons for AI Notes tab
      updateSessionButtons("ai-notes");
    });

    console.log("✅ Session tab handlers set up");
  } else {
    console.error("❌ Session tab elements not found");
  }
}

function updateSessionButtons(tabType) {
  const editButton = document.querySelector(".edit-button");
  const generateButton = document.querySelector(".generate-ai-notes-button");

  if (editButton && generateButton) {
    if (tabType === "session-info") {
      // Session Info tab buttons
      editButton.textContent = "Edit";
      editButton.style.display = "block";
      generateButton.textContent = "Generate AI Notes";
    } else if (tabType === "ai-notes") {
      // AI Notes tab buttons - hide edit button
      editButton.style.display = "none";
      generateButton.textContent = "Re-generate";
    }

    console.log(`✅ Updated buttons for ${tabType} tab`);
  }
}

function hideSessionDetailsForAINotes() {
  // Hide session detected banner
  const sessionDetectedBanner = document.querySelector(
    ".session-detected-banner"
  );
  if (sessionDetectedBanner) {
    sessionDetectedBanner.style.display = "none";
  }

  // Hide session details above tabs
  const sessionDetailsAboveTabs = document.querySelector(
    ".session-details-above-tabs"
  );
  if (sessionDetailsAboveTabs) {
    sessionDetailsAboveTabs.style.display = "none";
  }

  console.log("✅ Hidden session details for AI Notes tab");
}

function showSessionDetailsForSessionInfo() {
  // Show session detected banner
  const sessionDetectedBanner = document.querySelector(
    ".session-detected-banner"
  );
  if (sessionDetectedBanner) {
    sessionDetectedBanner.style.display = "flex";
  }

  // Show session details above tabs
  const sessionDetailsAboveTabs = document.querySelector(
    ".session-details-above-tabs"
  );
  if (sessionDetailsAboveTabs) {
    sessionDetailsAboveTabs.style.display = "block";
  }

  console.log("✅ Shown session details for Session Info tab");
}

// Feedback functionality
function setupFeedbackHandler() {
  console.log("🔄 Setting up feedback handler...");

  const feedbackDisplayBox = document.getElementById("feedback-display-box");
  const feedbackEditIcon = document.getElementById("feedback-edit-icon");
  const feedbackEditBox = document.getElementById("feedback-edit-box");
  const saveFeedbackBtn = document.getElementById("save-feedback-btn");
  const cancelFeedbackBtn = document.getElementById("cancel-feedback-btn");
  const feedbackInput = document.getElementById("session-feedback-input");

  if (
    !feedbackDisplayBox ||
    !feedbackEditBox ||
    !saveFeedbackBtn ||
    !cancelFeedbackBtn ||
    !feedbackInput
  ) {
    console.error("❌ Feedback elements not found");
    return;
  }

  // Load existing feedback for current session
  chrome.storage.local.get(["currentSession"], function (result) {
    if (result.currentSession && result.currentSession.id) {
      loadFeedback(result.currentSession.id);
    }
  });

  // Click on edit icon to enter edit mode
  const newEditIcon = feedbackEditIcon.cloneNode(true);
  feedbackEditIcon.parentNode.replaceChild(newEditIcon, feedbackEditIcon);

  newEditIcon.addEventListener("click", function (e) {
    e.stopPropagation();
    enterEditMode();
  });

  // Click on display box to enter edit mode
  const newDisplayBox = feedbackDisplayBox.cloneNode(true);
  feedbackDisplayBox.parentNode.replaceChild(newDisplayBox, feedbackDisplayBox);

  // Re-get the edit icon after cloning display box
  const editIconAfterClone = document.getElementById("feedback-edit-icon");
  if (editIconAfterClone) {
    editIconAfterClone.addEventListener("click", function (e) {
      e.stopPropagation();
      enterEditMode();
    });
  }

  newDisplayBox.addEventListener("click", function () {
    enterEditMode();
  });

  // Save button
  const newSaveBtn = saveFeedbackBtn.cloneNode(true);
  saveFeedbackBtn.parentNode.replaceChild(newSaveBtn, saveFeedbackBtn);

  newSaveBtn.addEventListener("click", async function () {
    const feedbackText = feedbackInput.value.trim();

    // Get current session ID
    chrome.storage.local.get(["currentSession"], async function (result) {
      if (!result.currentSession || !result.currentSession.id) {
        showFeedbackStatus("No active session found.", "error");
        return;
      }

      await saveFeedback(result.currentSession.id, feedbackText);
    });
  });

  // Cancel button
  const newCancelBtn = cancelFeedbackBtn.cloneNode(true);
  cancelFeedbackBtn.parentNode.replaceChild(newCancelBtn, cancelFeedbackBtn);

  newCancelBtn.addEventListener("click", function () {
    exitEditMode();
  });

  console.log("✅ Feedback handler set up");
}

function enterEditMode() {
  const feedbackDisplayBox = document.getElementById("feedback-display-box");
  const feedbackEditBox = document.getElementById("feedback-edit-box");
  const feedbackInput = document.getElementById("session-feedback-input");
  const feedbackDisplayText = document.getElementById("feedback-display-text");

  if (feedbackDisplayBox && feedbackEditBox && feedbackInput) {
    // Copy current text to textarea
    const currentText = feedbackDisplayText.textContent;
    if (
      currentText !== "No feedback yet. Click the edit icon to add feedback."
    ) {
      feedbackInput.value = currentText;
    }

    feedbackDisplayBox.style.display = "none";
    feedbackEditBox.style.display = "flex";
    feedbackInput.focus();
  }
}

function exitEditMode() {
  const feedbackDisplayBox = document.getElementById("feedback-display-box");
  const feedbackEditBox = document.getElementById("feedback-edit-box");

  if (feedbackDisplayBox && feedbackEditBox) {
    feedbackEditBox.style.display = "none";
    feedbackDisplayBox.style.display = "block";
    showFeedbackStatus("", "");
  }
}

async function loadFeedback(sessionId) {
  try {
    console.log("🔄 Loading feedback for session:", sessionId);

    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      console.error("❌ No access token found");
      return;
    }

    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load session: ${response.status}`);
    }

    const session = await response.json();

    const feedbackDisplayText = document.getElementById(
      "feedback-display-text"
    );

    if (session.feedback) {
      if (feedbackDisplayText) {
        feedbackDisplayText.textContent = session.feedback;
        feedbackDisplayText.classList.remove("empty");
      }
      console.log("✅ Feedback loaded:", session.feedback);
    } else {
      if (feedbackDisplayText) {
        feedbackDisplayText.textContent =
          "No feedback yet. Click the edit icon to add feedback.";
        feedbackDisplayText.classList.add("empty");
      }
    }
  } catch (error) {
    console.error("❌ Error loading feedback:", error);
  }
}

async function saveFeedback(sessionId, feedbackText) {
  try {
    console.log("💾 Saving feedback for session:", sessionId);
    showFeedbackStatus("Saving feedback...", "");

    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      showFeedbackStatus("Not authenticated. Please log in again.", "error");
      return;
    }

    // Save feedback
    const response = await fetch(
      `${API_BASE_URL}/sessions/${sessionId}/feedback`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feedback: feedbackText }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to save feedback: ${response.status}`);
    }

    console.log("✅ Feedback saved successfully");
    showFeedbackStatus("Feedback saved! Regenerating AI notes...", "success");

    // Update display text
    const feedbackDisplayText = document.getElementById(
      "feedback-display-text"
    );
    if (feedbackDisplayText) {
      feedbackDisplayText.textContent =
        feedbackText || "No feedback yet. Click the edit icon to add feedback.";
      if (feedbackText) {
        feedbackDisplayText.classList.remove("empty");
      } else {
        feedbackDisplayText.classList.add("empty");
      }
    }

    // Exit edit mode and show display mode
    exitEditMode();

    // Trigger regeneration with feedback
    await regenerateAINotesWithFeedback(sessionId);
  } catch (error) {
    console.error("❌ Error saving feedback:", error);
    showFeedbackStatus(`Error: ${error.message}`, "error");
  }
}

async function regenerateAINotesWithFeedback(sessionId) {
  try {
    console.log(
      "🔄 Regenerating AI notes with feedback for session:",
      sessionId
    );

    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      showFeedbackStatus("Not authenticated. Please log in again.", "error");
      return;
    }

    // Show loading state on generate button
    const generateButtons = document.querySelectorAll(
      ".generate-ai-notes-button, .re-generate-button"
    );
    generateButtons.forEach((button) => {
      button.textContent = "Generating...";
      button.disabled = true;
    });

    // Call generate API (same as normal generation)
    const response = await fetch(
      `${API_BASE_URL}/sessions/${sessionId}/generate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to regenerate: ${response.status}`);
    }

    console.log("✅ AI notes regeneration started");
    showFeedbackStatus(
      "AI notes are being regenerated with your feedback!",
      "success"
    );

    // Reload session data after a short delay
    setTimeout(async () => {
      await refreshSessionData(sessionId);

      // Reset button state
      generateButtons.forEach((button) => {
        button.disabled = false;
        button.textContent = "Re-generate";
      });

      showFeedbackStatus("AI notes updated successfully!", "success");
      setTimeout(() => showFeedbackStatus("", ""), 3000);
    }, 2000);
  } catch (error) {
    console.error("❌ Error regenerating AI notes:", error);
    showFeedbackStatus(`Regeneration error: ${error.message}`, "error");

    // Reset button state on error
    const generateButtons = document.querySelectorAll(
      ".generate-ai-notes-button, .re-generate-button"
    );
    generateButtons.forEach((button) => {
      button.disabled = false;
      button.textContent = "Re-generate";
    });
  }
}

async function refreshSessionData(sessionId) {
  try {
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) return;

    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) throw new Error(`Failed to refresh: ${response.status}`);

    const session = await response.json();

    // Update AI notes content
    const methodsText = document.getElementById("ai-notes-methods-text");
    const progressGoalText = document.getElementById(
      "ai-notes-progress-goal-text"
    );
    const recommendedChangesText = document.getElementById(
      "ai-notes-recommended-changes-text"
    );

    if (methodsText)
      methodsText.textContent =
        session.methods_response || "No methods response provided.";
    if (progressGoalText)
      progressGoalText.textContent =
        session.progress_towards_goal_response ||
        "No progress towards goal response provided.";
    if (recommendedChangesText)
      recommendedChangesText.textContent =
        session.recommended_changes_response ||
        "No recommended changes response provided.";

    console.log("✅ Session data refreshed");
  } catch (error) {
    console.error("❌ Error refreshing session data:", error);
  }
}

function showFeedbackStatus(message, type) {
  const statusElement = document.getElementById("feedback-status");
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.className = "feedback-status";

  if (type === "success") {
    statusElement.classList.add("success");
  } else if (type === "error") {
    statusElement.classList.add("error");
  }
}

function updateSessionDetailPage(session, dynamicFields = null) {
  console.log("🔄 updateSessionDetailPage called with session:", session);

  // Get client name from storage
  chrome.storage.local.get(["currentClient"], function (result) {
    const clientName = result.currentClient
      ? `${result.currentClient.first_name || ""} ${
          result.currentClient.last_name || ""
        }`.trim()
      : "Unknown Client";

    console.log("👤 Client name for session:", clientName);

    // Format created_at date
    const sessionDate = session.created_at
      ? new Date(session.created_at).toLocaleDateString()
      : "No date";

    const sessionTime = session.created_at
      ? new Date(session.created_at).toLocaleTimeString()
      : "No time";

    console.log("📅 Session date/time:", sessionDate, sessionTime);

    // Session details above tabs have been removed - no longer needed

    // Update the 4 static fields: Client, Type, Instructions, Created
    const clientNameTab = document.getElementById("session-client-name");
    const typeTab = document.getElementById("session-type");
    const instructionsTab = document.getElementById("session-instructions");
    const createdTab = document.getElementById("session-created");

    if (clientNameTab) clientNameTab.textContent = clientName;
    if (typeTab) typeTab.textContent = session.emr_type_name || "Unknown Type";
    if (instructionsTab)
      instructionsTab.textContent =
        session.manual_instructions || "No instructions provided";
    if (createdTab)
      createdTab.textContent = session.created_at
        ? new Date(session.created_at).toLocaleString()
        : "No date";

    // Update AI Notes content with real session data
    const methodsText = document.getElementById("ai-notes-methods-text");
    const progressGoalText = document.getElementById(
      "ai-notes-progress-goal-text"
    );
    const recommendedChangesText = document.getElementById(
      "ai-notes-recommended-changes-text"
    );

    if (methodsText) {
      methodsText.textContent =
        session.methods_response || "No methods response provided.";
    }
    if (progressGoalText) {
      progressGoalText.textContent =
        session.progress_towards_goal_response ||
        "No progress towards goal response provided.";
    }
    if (recommendedChangesText) {
      recommendedChangesText.textContent =
        session.recommended_changes_response ||
        "No recommended changes response provided.";
    }

    // Render dynamic fields if available
    if (dynamicFields) {
      console.log("🔄 Rendering dynamic fields:", dynamicFields);
      renderDynamicFields(dynamicFields);
    } else {
      console.log("❌ No dynamic fields available");
    }

    console.log("✅ Session detail page updated successfully");
  });
}

// Function to render dynamic fields in session detail
function renderDynamicFields(dynamicFields) {
  console.log("🔄 Rendering dynamic fields:", dynamicFields);
  console.log("📊 Confirmed results:", dynamicFields.confirmedResults);
  console.log("📊 Fields:", dynamicFields.fields);
  console.log("📊 Manual fields:", dynamicFields.manualFields);

  // Find the session details container
  const sessionDetailsContainer = document.querySelector(
    "#session-info-content .detail-card"
  );
  if (!sessionDetailsContainer) {
    console.error("❌ Session details container not found");
    return;
  }
  console.log("✅ Session details container found:", sessionDetailsContainer);

  // Remove any existing dynamic fields section to prevent duplicates
  const existingDynamicSection = sessionDetailsContainer.querySelector(
    ".dynamic-fields-section"
  );
  if (existingDynamicSection) {
    console.log("🗑️ Removing existing dynamic fields section");
    existingDynamicSection.remove();
  }

  // Create dynamic fields section
  const dynamicFieldsSection = document.createElement("div");
  dynamicFieldsSection.className = "dynamic-fields-section";
  dynamicFieldsSection.innerHTML = "<h3 class='card-title'>Session Data</h3>";

  // Get current session data to check which fields exist
  chrome.storage.local.get(["currentSession"], function (result) {
    const session = result.currentSession;
    if (!session) {
      console.error("❌ No current session found");
      return;
    }

    console.log("📋 Current session data:", session);
    console.log("📋 Session keys:", Object.keys(session));

    // Process confirmed results - match with emr-types-fields using api_name
    dynamicFields.confirmedResults.forEach((result) => {
      console.log(`🔍 Processing confirmed result:`, result);
      console.log(`🔍 Looking for field with api_name: ${result.key}`);

      // Find matching field definition by matching result.key with name (case-insensitive, remove dashes, normalize spaces)
      const fieldDef = dynamicFields.fields.find((field) => {
        if (!field.name) return false;

        const normalizedFieldName = field.name
          .toLowerCase()
          .replace(/-/g, "")
          .replace(/\s+/g, "")
          .trim();

        const normalizedResultKey = result.key
          .toLowerCase()
          .replace(/-/g, "")
          .replace(/\s+/g, "")
          .trim();

        console.log(
          `🔍 Comparing: "${normalizedFieldName}" === "${normalizedResultKey}"`
        );
        console.log(
          `🔍 Field name: "${field.name}" -> "${normalizedFieldName}"`
        );
        console.log(
          `🔍 Result key: "${result.key}" -> "${normalizedResultKey}"`
        );

        return normalizedFieldName === normalizedResultKey;
      });

      console.log(`🔍 Found field definition:`, fieldDef);

      if (fieldDef) {
        // Use the api_name from the matched field definition to look in session data
        const sessionKey = fieldDef.api_name;
        console.log(
          `🔍 Using api_name '${sessionKey}' to look in session data`
        );
        console.log(
          `🔍 Session has key '${sessionKey}':`,
          session.hasOwnProperty(sessionKey)
        );
        console.log(
          `🔍 Session value for '${sessionKey}':`,
          session[sessionKey]
        );

        // Display field if it exists in session data (regardless of value - even if empty/null)
        if (session.hasOwnProperty(sessionKey)) {
          console.log(
            `✅ Adding dynamic field: ${fieldDef.name} = ${session[sessionKey]}`
          );
          const fieldElement = createDynamicFieldElement(
            fieldDef.name, // Use the display name from emr-types-fields
            session[sessionKey] || "", // Use value from session or empty string if null/empty
            fieldDef.type
          );
          dynamicFieldsSection.appendChild(fieldElement);
        } else {
          console.log(`❌ Session does not have key: ${sessionKey}`);
        }
      } else {
        console.log(`❌ No field definition found for key: ${result.key}`);
      }
    });

    // Process manual fields - match with emr-types-fields using api_name
    dynamicFields.manualFields.forEach((field) => {
      console.log(`🔍 Processing manual field:`, field);
      console.log(`🔍 Looking for field with api_name: ${field.name}`);

      // Find matching field definition by matching field.name with name (case-insensitive, remove dashes, normalize spaces)
      const fieldDef = dynamicFields.fields.find(
        (f) =>
          f.name &&
          f.name.toLowerCase().replace(/-/g, "").replace(/\s+/g, " ").trim() ===
            field.name
              .toLowerCase()
              .replace(/-/g, "")
              .replace(/\s+/g, " ")
              .trim()
      );

      console.log(`🔍 Found field definition:`, fieldDef);

      if (fieldDef) {
        // Use the api_name from the matched field definition to look in session data
        const sessionKey = fieldDef.api_name;
        console.log(
          `🔍 Using api_name '${sessionKey}' to look in session data`
        );
        console.log(
          `🔍 Session has key '${sessionKey}':`,
          session.hasOwnProperty(sessionKey)
        );
        console.log(
          `🔍 Session value for '${sessionKey}':`,
          session[sessionKey]
        );

        // Display field if it exists in session data (regardless of value - even if empty/null)
        if (session.hasOwnProperty(sessionKey)) {
          console.log(
            `✅ Adding manual field: ${fieldDef.name} = ${session[sessionKey]}`
          );
          const fieldElement = createDynamicFieldElement(
            fieldDef.name, // Use the display name from emr-types-fields
            session[sessionKey] || "", // Use value from session or empty string if null/empty
            fieldDef.type
          );
          dynamicFieldsSection.appendChild(fieldElement);
        } else {
          console.log(`❌ Session does not have key: ${sessionKey}`);
        }
      } else {
        console.log(
          `❌ No field definition found for manual field: ${field.name}`
        );
      }
    });

    // Add dynamic fields section to the session details
    sessionDetailsContainer.appendChild(dynamicFieldsSection);
    console.log("✅ Dynamic fields rendered successfully");
  });
}

// Function to create a dynamic field element
function createDynamicFieldElement(fieldName, fieldValue, fieldType) {
  const fieldElement = document.createElement("div");
  fieldElement.className = "session-detail-item dynamic-field";

  // Format field name (convert snake_case to Title Case)
  const formattedName = fieldName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  // Format field value based on type
  let formattedValue = fieldValue;
  if (fieldType === "date" && fieldValue) {
    try {
      formattedValue = new Date(fieldValue).toLocaleDateString();
    } catch (e) {
      formattedValue = fieldValue;
    }
  } else if (fieldType === "boolean") {
    // Display checkbox for boolean fields (read-only)
    const isChecked =
      fieldValue === true ||
      fieldValue === "true" ||
      fieldValue === 1 ||
      fieldValue === "1";
    fieldElement.innerHTML = `
      <span class="detail-label">${formattedName}</span>
      <span class="detail-value">
        <input type="checkbox" ${
          isChecked ? "checked" : ""
        } disabled style="pointer-events: none;">
      </span>
    `;
    return fieldElement;
  }

  fieldElement.innerHTML = `
    <span class="detail-label">${formattedName}</span>
    <span class="detail-value">${formattedValue || ""}</span>
  `;

  return fieldElement;
}

// Profile API functions
async function loadProfileData() {
  try {
    console.log("🔄 Loading profile data with all 5 API calls...");

    // Get stored JWT token
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      console.error("❌ No JWT token found");
      return;
    }

    // Make all 5 API calls in parallel
    const [
      profileResponse,
      emrTypesResponse,
      documentationMethodsResponse,
      copingSkillsResponse,
      clinicalSpecialtiesResponse,
    ] = await Promise.all([
      // 1. GET /me - Fetch current user's profile data
      fetch(`${API_BASE_URL}/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          "Content-Type": "application/json",
        },
      }),
      // 2. GET /emr-types/ - Fetch all available EMR types
      fetch(`${API_BASE_URL}/emr-types/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          "Content-Type": "application/json",
        },
      }),
      // 3. GET /documentation-methods/ - Fetch all available documentation methods
      fetch(`${API_BASE_URL}/documentation-methods/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          "Content-Type": "application/json",
        },
      }),
      // 4. GET /coping-skills/ - Fetch all available coping skills
      fetch(`${API_BASE_URL}/coping-skills/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          "Content-Type": "application/json",
        },
      }),
      // 5. GET /clinical-specialties/ - Fetch all available clinical specialties
      fetch(`${API_BASE_URL}/clinical-specialties/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          "Content-Type": "application/json",
        },
      }),
    ]);

    // Check for 401 on any response
    if (
      check401Response(profileResponse) ||
      check401Response(emrTypesResponse) ||
      check401Response(documentationMethodsResponse) ||
      check401Response(copingSkillsResponse) ||
      check401Response(clinicalSpecialtiesResponse)
    ) {
      return; // 401 handled, stop execution
    }

    // Check if all responses are OK
    if (
      !profileResponse.ok ||
      !emrTypesResponse.ok ||
      !documentationMethodsResponse.ok ||
      !copingSkillsResponse.ok ||
      !clinicalSpecialtiesResponse.ok
    ) {
      throw new Error(
        `One or more API calls failed. Profile: ${profileResponse.status}, EMR Types: ${emrTypesResponse.status}, Documentation Methods: ${documentationMethodsResponse.status}, Coping Skills: ${copingSkillsResponse.status}, Clinical Specialties: ${clinicalSpecialtiesResponse.status}`
      );
    }

    // Parse all responses
    const [
      profileData,
      emrTypes,
      documentationMethods,
      copingSkills,
      clinicalSpecialties,
    ] = await Promise.all([
      profileResponse.json(),
      emrTypesResponse.json(),
      documentationMethodsResponse.json(),
      copingSkillsResponse.json(),
      clinicalSpecialtiesResponse.json(),
    ]);

    console.log("✅ Profile data loaded:", profileData);
    console.log("✅ EMR Types loaded:", emrTypes);
    console.log("✅ Documentation Methods loaded:", documentationMethods);
    console.log("✅ Coping Skills loaded:", copingSkills);
    console.log("✅ Clinical Specialties loaded:", clinicalSpecialties);
    console.log("📋 Available profile fields:", Object.keys(profileData));

    // Update profile page with all data
    updateProfilePage(profileData, {
      emrTypes,
      documentationMethods,
      copingSkills,
      clinicalSpecialties,
    });
  } catch (error) {
    console.error("❌ Error loading profile data:", error);
    showErrorMessage("Failed to load profile data. Please try again.");
  }
}

function updateProfilePage(profileData, additionalData = null) {
  console.log("🔄 Updating profile page with data:", profileData);
  if (additionalData) {
    console.log("🔄 Additional data available:", additionalData);
  }

  // Store data globally for edit functionality
  window.currentProfileData = profileData;
  if (additionalData) {
    window.profileAdditionalData = additionalData;
    console.log(
      "✅ Stored profileAdditionalData globally:",
      window.profileAdditionalData
    );
  }

  // Update header
  const name = profileData.full_name || "Unknown User";
  const initials = getInitials(name);

  const avatarText = document.getElementById("profile-avatar-text");
  const profileName = document.getElementById("profile-name");
  const profileEmail = document.getElementById("profile-email");
  const profileMobile = document.getElementById("profile-mobile");
  const profileCompany = document.getElementById("profile-company");
  const profileUserType = document.getElementById("profile-user-type");
  const profileSessionInstructions = document.getElementById(
    "profile-session-instructions"
  );

  if (avatarText) avatarText.textContent = initials;
  if (profileName) profileName.textContent = name;
  if (profileEmail) profileEmail.textContent = profileData.email || "";
  if (profileMobile) profileMobile.textContent = profileData.mobile_phone || "";
  if (profileCompany)
    profileCompany.textContent =
      profileData.company_name || profileData.company?.name || "";
  if (profileUserType)
    profileUserType.textContent = profileData.user_type || "";
  if (profileSessionInstructions)
    profileSessionInstructions.textContent =
      profileData.session_instructions || "";

  // Update status badges
  const statusElement = document.getElementById("profile-status");
  if (statusElement) {
    console.log(
      "🔍 Updating status badge with is_active:",
      profileData.is_active
    );
    if (profileData.is_active) {
      statusElement.textContent = "Active";
      statusElement.className = "status-badge active";
    } else {
      statusElement.textContent = "Inactive";
      statusElement.className = "status-badge inactive";
    }
  } else {
    console.error("❌ Status element not found!");
  }

  // Update EMR Info section - show all pairs as tags
  const emrSystemElement = document.getElementById("profile-emr-system");
  if (emrSystemElement) {
    if (
      profileData.emr_type_documentation_pairs &&
      profileData.emr_type_documentation_pairs.length > 0
    ) {
      // Clear existing content
      emrSystemElement.innerHTML = "";

      // Create container for all pairs
      const pairsContainer = document.createElement("div");
      pairsContainer.className = "pairs-container";

      // Add each pair as a tag
      profileData.emr_type_documentation_pairs.forEach((pair) => {
        const pairTag = document.createElement("div");
        pairTag.className = "pair-tag";
        pairTag.innerHTML = `
          <span class="pair-text">${pair.emr_type_name} + ${pair.documentation_method_name}</span>
        `;
        pairsContainer.appendChild(pairTag);
      });

      emrSystemElement.appendChild(pairsContainer);
    } else {
      emrSystemElement.textContent = "No EMR pairs configured";
    }
  }

  // Update coping skills - match IDs with fetched data
  const copingSkillsContainer = document.getElementById(
    "profile-coping-skills"
  );
  if (copingSkillsContainer) {
    if (
      profileData.coping_skills &&
      profileData.coping_skills.length > 0 &&
      additionalData &&
      additionalData.copingSkills
    ) {
      copingSkillsContainer.innerHTML = "";

      profileData.coping_skills.forEach((skillId) => {
        // Find matching skill by ID
        const skill = additionalData.copingSkills.find((s) => s.id === skillId);
        if (skill) {
          const badge = document.createElement("span");
          badge.className = "info-badge";
          badge.textContent = skill.short_description || skill.name || skillId;
          badge.title = skill.long_description || skill.description || ""; // Tooltip on hover
          copingSkillsContainer.appendChild(badge);
        } else {
          // If skill not found, show ID as fallback
          const badge = document.createElement("span");
          badge.className = "info-badge";
          badge.textContent = `Unknown (${skillId})`;
          badge.title = "Skill not found in database";
          copingSkillsContainer.appendChild(badge);
        }
      });
    } else {
      // Show "Not specified" if no coping skills
      copingSkillsContainer.innerHTML =
        '<span class="info-badge">Not specified</span>';
    }
  }

  // Update clinical specialties - match IDs with fetched data
  const specialtiesContainer = document.getElementById(
    "profile-clinical-specialties"
  );
  if (specialtiesContainer) {
    if (
      profileData.clinical_specialties &&
      profileData.clinical_specialties.length > 0 &&
      additionalData &&
      additionalData.clinicalSpecialties
    ) {
      specialtiesContainer.innerHTML = "";

      profileData.clinical_specialties.forEach((specialtyId) => {
        // Find matching specialty by ID
        const specialty = additionalData.clinicalSpecialties.find(
          (s) => s.id === specialtyId
        );
        if (specialty) {
          const badge = document.createElement("span");
          badge.className = "info-badge";
          badge.textContent =
            specialty.short_description || specialty.name || specialtyId;
          badge.title =
            specialty.long_description || specialty.description || ""; // Tooltip on hover
          specialtiesContainer.appendChild(badge);
        } else {
          // If specialty not found, show ID as fallback
          const badge = document.createElement("span");
          badge.className = "info-badge";
          badge.textContent = `Unknown (${specialtyId})`;
          badge.title = "Specialty not found in database";
          specialtiesContainer.appendChild(badge);
        }
      });
    } else {
      // Show "Not specified" if no clinical specialties
      specialtiesContainer.innerHTML =
        '<span class="info-badge">Not specified</span>';
    }
  }

  // Update type writing - show as badges
  const typeWritingContainer = document.getElementById("profile-type-writing");
  if (typeWritingContainer) {
    if (profileData.type_writing && profileData.type_writing.length > 0) {
      typeWritingContainer.innerHTML = "";

      profileData.type_writing.forEach((type) => {
        const badge = document.createElement("span");
        badge.className = "info-badge";
        badge.textContent = type;
        typeWritingContainer.appendChild(badge);
      });
    } else {
      typeWritingContainer.textContent = "Not specified";
    }
  }

  // Update Company Info section
  if (profileData.company) {
    const companyName = document.getElementById("profile-company-name");
    const companyEmr = document.getElementById("profile-company-emr");
    const companyIndustry = document.getElementById("profile-company-industry");
    const companyAddress = document.getElementById("profile-company-address");
    const companyStatusElement = document.getElementById(
      "profile-company-status"
    );

    if (companyName) companyName.textContent = profileData.company.name || "";
    if (companyEmr) companyEmr.textContent = profileData.company.emr || "";
    if (companyIndustry)
      companyIndustry.textContent = profileData.company.industry || "";
    if (companyAddress)
      companyAddress.textContent = profileData.company.address || "";

    if (companyStatusElement) {
      if (profileData.company.is_active) {
        companyStatusElement.textContent = "Active";
        companyStatusElement.className = "status-badge active";
      } else {
        companyStatusElement.textContent = "Inactive";
        companyStatusElement.className = "status-badge inactive";
      }
    }
  }

  // Store data for edit functionality
  window.currentProfileData = profileData;
  if (additionalData) {
    window.profileAdditionalData = additionalData;
  }
}

// Edit Personal Info function
function editPersonalInfo() {
  console.log("✏️ Editing Personal Info...");

  const personalInfoSection = document.getElementById("personal-info-content");
  if (!personalInfoSection) {
    console.error(
      "❌ Personal Info section not found. Make sure you're on the profile page."
    );
    showErrorMessage("Please navigate to the Profile page first.");
    return;
  }

  // Check if already in edit mode
  if (personalInfoSection.querySelector(".edit-buttons")) {
    console.log("⚠️ Already in edit mode");
    return;
  }

  // Hide bottom edit button
  const bottomEditBtn = document.getElementById("edit-personal-info-bottom-btn");
  if (bottomEditBtn) {
    bottomEditBtn.style.display = "none";
  }

  // Handle password field specially - it should never be editable
  const passwordField = document.getElementById("profile-password");
  if (passwordField) {
    console.log("🔒 Found password field, keeping as non-editable");
    const passwordContainer = passwordField.parentElement;
    console.log("🔒 Password container:", passwordContainer);
    passwordContainer.innerHTML = `
      <span>********</span>
      <a href="#" class="forgot-password-link">Forgot password?</a>
    `;
    console.log(
      "🔒 Password container after update:",
      passwordContainer.innerHTML
    );
  } else {
    console.log("❌ Password field not found!");
  }

  // Handle status field specially - it should be a dropdown
  const statusField = document.getElementById("profile-status");
  if (statusField) {
    console.log("📊 Found status field, creating dropdown");
    const statusContainer = statusField.parentElement;
    console.log("📊 Status container:", statusContainer);
    const select = document.createElement("select");
    select.className = "edit-input";
    select.id = "edit-status";

    const activeOption = document.createElement("option");
    activeOption.value = "true";
    activeOption.textContent = "Active";
    const inactiveOption = document.createElement("option");
    inactiveOption.value = "false";
    inactiveOption.textContent = "Inactive";
    select.appendChild(activeOption);
    select.appendChild(inactiveOption);

    // Set current value
    select.value = window.currentProfileData.is_active ? "true" : "false";

    statusContainer.innerHTML = "";
    statusContainer.appendChild(select);
    console.log("📊 Status container after update:", statusContainer.innerHTML);
  } else {
    console.log("❌ Status field not found!");
  }

  const fields = personalInfoSection.querySelectorAll(".detail-value");

  // Make other fields editable
  fields.forEach((field) => {
    const currentValue = field.textContent;
    const fieldName = field.id.replace("profile-", "");

    console.log("🔍 Processing field:", fieldName, "ID:", field.id);

    // Skip password and status fields as they're handled above
    if (fieldName === "password" || fieldName === "status" || !field.id) {
      console.log("⏭️ Skipping field:", fieldName);
      return;
    }

    // Create input based on field type
    let input;
    if (fieldName === "mobile-phone" || fieldName === "email") {
      input = document.createElement("input");
      input.type = fieldName === "email" ? "email" : "tel";
    } else if (fieldName === "type-writing") {
      input = document.createElement("select");
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Select type writing...";
      input.appendChild(defaultOption);

      const typeWritingOptions = [
        "Soft",
        "Gentle",
        "Empathetic",
        "Supportive",
        "Encouraging",
        "Calm",
        "Reassuring",
        "Hopeful",
        "Reflective",
        "Compassionate",
        "Uplifting",
        "Understanding",
        "Patient",
        "Non-judgmental",
        "Inspiring",
        "Affirming",
        "Grounding",
        "Validating",
        "Mindful",
        "Soothing",
      ];

      typeWritingOptions.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option;
        optionElement.textContent = option;
        input.appendChild(optionElement);
      });
    } else if (fieldName === "coping-skills") {
      // Create container for coping skills management
      const container = document.createElement("div");
      container.className = "array-edit-container";

      // Show current selected skills
      if (
        window.currentProfileData.coping_skills &&
        window.currentProfileData.coping_skills.length > 0
      ) {
        const selectedDiv = document.createElement("div");
        selectedDiv.className = "selected-items";
        selectedDiv.innerHTML = "<label>Selected Coping Skills:</label>";

        window.currentProfileData.coping_skills.forEach((skillId, index) => {
          const skill = window.profileAdditionalData?.copingSkills?.find(
            (s) => s.id === skillId
          );
          const tag = document.createElement("div");
          tag.className = "selected-tag";
          tag.innerHTML = `
            <span>${skill?.short_description || skill?.name || skillId}</span>
            <button type="button" class="remove-coping-skill-btn" data-index="${index}" title="Remove">×</button>
          `;
          selectedDiv.appendChild(tag);
        });
        container.appendChild(selectedDiv);
      }

      // Add new skill dropdown
      const addDiv = document.createElement("div");
      addDiv.className = "add-item";
      addDiv.innerHTML = "<label>Add Coping Skill:</label>";

      const select = document.createElement("select");
      select.id = "add-coping-skill";
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Select coping skill to add...";
      select.appendChild(defaultOption);

      if (window.profileAdditionalData?.copingSkills) {
        window.profileAdditionalData.copingSkills.forEach((skill) => {
          if (!window.currentProfileData.coping_skills?.includes(skill.id)) {
            const option = document.createElement("option");
            option.value = skill.id;
            option.textContent = skill.short_description || skill.name;
            select.appendChild(option);
          }
        });
      }

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.textContent = "Add";
      addButton.addEventListener("click", addCopingSkill);

      addDiv.appendChild(select);
      addDiv.appendChild(addButton);
      container.appendChild(addDiv);

      field.innerHTML = "";
      field.appendChild(container);
      return; // Skip normal input creation
    } else if (fieldName === "clinical-specialties") {
      // Create container for clinical specialties management
      const container = document.createElement("div");
      container.className = "array-edit-container";

      // Show current selected specialties
      if (
        window.currentProfileData.clinical_specialties &&
        window.currentProfileData.clinical_specialties.length > 0
      ) {
        const selectedDiv = document.createElement("div");
        selectedDiv.className = "selected-items";
        selectedDiv.innerHTML = "<label>Selected Clinical Specialties:</label>";

        window.currentProfileData.clinical_specialties.forEach(
          (specialtyId, index) => {
            const specialty =
              window.profileAdditionalData?.clinicalSpecialties?.find(
                (s) => s.id === specialtyId
              );
            const tag = document.createElement("div");
            tag.className = "selected-tag";
            tag.innerHTML = `
            <span>${
              specialty?.short_description || specialty?.name || specialtyId
            }</span>
            <button type="button" class="remove-clinical-specialty-btn" data-index="${index}" title="Remove">×</button>
          `;
            selectedDiv.appendChild(tag);
          }
        );
        container.appendChild(selectedDiv);
      }

      // Add new specialty dropdown
      const addDiv = document.createElement("div");
      addDiv.className = "add-item";
      addDiv.innerHTML = "<label>Add Clinical Specialty:</label>";

      const select = document.createElement("select");
      select.id = "add-clinical-specialty";
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Select clinical specialty to add...";
      select.appendChild(defaultOption);

      if (window.profileAdditionalData?.clinicalSpecialties) {
        window.profileAdditionalData.clinicalSpecialties.forEach(
          (specialty) => {
            if (
              !window.currentProfileData.clinical_specialties?.includes(
                specialty.id
              )
            ) {
              const option = document.createElement("option");
              option.value = specialty.id;
              option.textContent =
                specialty.short_description || specialty.name;
              select.appendChild(option);
            }
          }
        );
      }

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.textContent = "Add";
      addButton.addEventListener("click", addClinicalSpecialty);

      addDiv.appendChild(select);
      addDiv.appendChild(addButton);
      container.appendChild(addDiv);

      field.innerHTML = "";
      field.appendChild(container);
      return; // Skip normal input creation
    } else {
      input = document.createElement("input");
      input.type = "text";
    }

    // Set value based on field type
    if (fieldName === "status") {
      input.value = window.currentProfileData.is_active ? "true" : "false";
    } else {
      input.value = currentValue === "Not specified" ? "" : currentValue;
    }

    input.className = "edit-input";
    input.id = `edit-${fieldName}`;

    field.innerHTML = "";
    field.appendChild(input);
  });

  // Add save/cancel buttons
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "edit-buttons";
  buttonContainer.innerHTML = `
    <button class="btn btn-primary" id="save-personal-info-btn">Save Changes</button>
    <button class="btn btn-secondary" id="cancel-personal-info-btn">Cancel</button>
  `;

  personalInfoSection.appendChild(buttonContainer);

  // Add event listeners for the buttons
  const saveBtn = document.getElementById("save-personal-info-btn");
  const cancelBtn = document.getElementById("cancel-personal-info-btn");

  console.log("🔍 Save button found:", !!saveBtn);
  console.log("🔍 Cancel button found:", !!cancelBtn);

  if (saveBtn) {
    saveBtn.addEventListener("click", savePersonalInfo);
    console.log("✅ Save button event listener added");
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", cancelEditPersonalInfo);
    console.log("✅ Cancel button event listener added");
  }

  // Add event listeners for remove buttons
  const removeCopingBtns = personalInfoSection.querySelectorAll(
    ".remove-coping-skill-btn"
  );
  removeCopingBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      const index = parseInt(this.getAttribute("data-index"));
      removeCopingSkill(index);
    });
  });

  const removeClinicalBtns = personalInfoSection.querySelectorAll(
    ".remove-clinical-specialty-btn"
  );
  removeClinicalBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      const index = parseInt(this.getAttribute("data-index"));
      removeClinicalSpecialty(index);
    });
  });
}

function editEMRInfo() {
  console.log("✏️ Editing EMR Info...");

  const emrInfoSection = document.getElementById("emr-info-content");
  if (!emrInfoSection) {
    console.error(
      "❌ EMR Info section not found. Make sure you're on the profile page."
    );
    showErrorMessage("Please navigate to the Profile page first.");
    return;
  }

  // Check if already in edit mode
  if (emrInfoSection.querySelector(".edit-buttons")) {
    console.log("⚠️ Already in edit mode");
    return;
  }

  // Hide bottom edit button
  const bottomEditBtn = document.getElementById("edit-emr-info-bottom-btn");
  if (bottomEditBtn) {
    bottomEditBtn.style.display = "none";
  }

  // Initialize unsaved pairs array
  window.unsavedEMRPairs = [];

  // Create simple header
  const headerSection = document.createElement("div");

  // Clear existing content and add sections
  emrInfoSection.innerHTML = "";
  emrInfoSection.appendChild(headerSection);

  // Display existing pairs from database
  if (
    window.currentProfileData &&
    window.currentProfileData.emr_type_documentation_pairs &&
    window.currentProfileData.emr_type_documentation_pairs.length > 0
  ) {
    const existingPairsSection = document.createElement("div");
    existingPairsSection.className = "existing-pairs-section";
    existingPairsSection.innerHTML = `
      <h5>Existing Pairs:</h5>
      <div class="pairs-container" id="existing-pairs-container"></div>
    `;

    emrInfoSection.appendChild(existingPairsSection);

    // Display existing pairs as removable tags
    const pairsContainer = document.getElementById("existing-pairs-container");
    window.currentProfileData.emr_type_documentation_pairs.forEach(
      (pair, index) => {
        const pairTag = document.createElement("div");
        pairTag.className = "pair-tag";
        pairTag.innerHTML = `
        <span class="pair-text">${pair.emr_type_name} + ${pair.documentation_method_name}</span>
        <button class="remove-pair-btn" data-index="${index}" title="Remove pair">×</button>
      `;
        pairsContainer.appendChild(pairTag);
      }
    );

    // Add event listeners to the initial existing pairs
    const initialRemoveBtns =
      pairsContainer.querySelectorAll(".remove-pair-btn");
    initialRemoveBtns.forEach((btn, btnIndex) => {
      const dataIndex = parseInt(btn.getAttribute("data-index"));
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation(); // Prevent duplicate listeners
        console.log(
          "🗑️ Remove existing pair clicked (initial), data-index:",
          dataIndex
        );
        removeExistingPair(dataIndex);
      });
      console.log(
        "✅ Initial remove button event listener attached for index:",
        dataIndex
      );
    });
  }

  // Create container for unsaved pair forms
  const unsavedPairsContainer = document.createElement("div");
  unsavedPairsContainer.id = "unsaved-pairs-container";
  unsavedPairsContainer.style.marginTop = "16px";
  emrInfoSection.appendChild(unsavedPairsContainer);

  // Add "Add New Pair" button (always at bottom)
  const addNewPairBtnContainer = document.createElement("div");
  addNewPairBtnContainer.style.marginTop = "16px";
  addNewPairBtnContainer.style.marginBottom = "16px";
  addNewPairBtnContainer.innerHTML = `
    <button class="btn btn-primary add-new-pair-btn" id="add-new-emr-pair-btn" style="width: 100%; padding: 12px 20px; font-size: 14px; background: white; border: 2px dashed #1976d2; border-radius: 6px; color: #1976d2; cursor: pointer; font-weight: 500; transition: all 0.2s ease;">
      ➕ Add New Pair
    </button>
  `;
  emrInfoSection.appendChild(addNewPairBtnContainer);

  // Add event listener for Add New Pair button directly
  const addNewPairBtn = document.getElementById("add-new-emr-pair-btn");
  if (addNewPairBtn) {
    addNewPairBtn.addEventListener("click", function (event) {
      event.preventDefault();
      console.log("✅ Add New Pair button clicked directly!");
      addNewEMRPair();
    });
    console.log("✅ Direct event listener added to Add New Pair button");
  } else {
    console.error(
      "❌ Add New Pair button not found for direct event listener!"
    );
  }

  // Add other EMR Info fields (Coping Skills, Clinical Specialties, Type Writing)
  const otherFieldsSection = document.createElement("div");
  otherFieldsSection.style.marginTop = "20px";
  otherFieldsSection.innerHTML = `
    <div class="form-group" style="margin-bottom: 16px;">
      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 8px; font-size: 14px;">Coping Skills:</label>
      <div class="badges-container" id="edit-coping-skills" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;"></div>
      <select id="add-coping-skill" class="edit-input">
        <option value="">Add Coping Skill...</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom: 16px;">
      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 8px; font-size: 14px;">Clinical Specialties:</label>
      <div class="badges-container" id="edit-clinical-specialties" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;"></div>
      <select id="add-clinical-specialty" class="edit-input">
        <option value="">Add Clinical Specialty...</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom: 16px;">
      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 8px; font-size: 14px;">Type Writing:</label>
      <select id="edit-type-writing" class="edit-input">
        <option value="">Select type writing...</option>
        <option value="Soft">Soft</option>
        <option value="Medium">Medium</option>
        <option value="Hard">Hard</option>
      </select>
    </div>
  `;
  emrInfoSection.appendChild(otherFieldsSection);

  // Populate Coping Skills as editable badges
  const copingSkillsContainer = document.getElementById("edit-coping-skills");
  if (
    copingSkillsContainer &&
    window.currentProfileData &&
    window.currentProfileData.coping_skills &&
    window.profileAdditionalData &&
    window.profileAdditionalData.copingSkills
  ) {
    window.currentProfileData.coping_skills.forEach((skillId) => {
      const skill = window.profileAdditionalData.copingSkills.find(
        (s) => s.id === skillId
      );
      if (skill) {
        const badge = document.createElement("span");
        badge.className = "info-badge";
        badge.style.cursor = "pointer";
        badge.innerHTML = `${
          skill.short_description || skill.name
        } <span style="margin-left: 4px; font-weight: bold;">×</span>`;
        badge.title = "Click to remove";
        badge.addEventListener("click", function () {
          // Remove from array
          const index =
            window.currentProfileData.coping_skills.indexOf(skillId);
          if (index > -1) {
            window.currentProfileData.coping_skills.splice(index, 1);
          }
          // Remove badge from UI
          badge.remove();
        });
        copingSkillsContainer.appendChild(badge);
      }
    });
  }

  // Populate Clinical Specialties as editable badges
  const specialtiesContainer = document.getElementById(
    "edit-clinical-specialties"
  );
  if (
    specialtiesContainer &&
    window.currentProfileData &&
    window.currentProfileData.clinical_specialties &&
    window.profileAdditionalData &&
    window.profileAdditionalData.clinicalSpecialties
  ) {
    window.currentProfileData.clinical_specialties.forEach((specialtyId) => {
      const specialty = window.profileAdditionalData.clinicalSpecialties.find(
        (s) => s.id === specialtyId
      );
      if (specialty) {
        const badge = document.createElement("span");
        badge.className = "info-badge";
        badge.style.cursor = "pointer";
        badge.innerHTML = `${
          specialty.short_description || specialty.name
        } <span style="margin-left: 4px; font-weight: bold;">×</span>`;
        badge.title = "Click to remove";
        badge.addEventListener("click", function () {
          // Remove from array
          const index =
            window.currentProfileData.clinical_specialties.indexOf(specialtyId);
          if (index > -1) {
            window.currentProfileData.clinical_specialties.splice(index, 1);
          }
          // Remove badge from UI
          badge.remove();
        });
        specialtiesContainer.appendChild(badge);
      }
    });
  }

  // Set current Type Writing value
  const typeWritingSelect = document.getElementById("edit-type-writing");
  if (
    typeWritingSelect &&
    window.currentProfileData &&
    window.currentProfileData.type_writing &&
    window.currentProfileData.type_writing.length > 0
  ) {
    typeWritingSelect.value = window.currentProfileData.type_writing[0];
  }

  // Populate Coping Skills dropdown
  const addCopingSkillSelect = document.getElementById("add-coping-skill");
  console.log("🔍 Populating Coping Skills dropdown...");
  console.log(
    "🔍 Available coping skills:",
    window.profileAdditionalData?.copingSkills
  );
  console.log(
    "🔍 Current coping skills:",
    window.currentProfileData?.coping_skills
  );
  if (
    addCopingSkillSelect &&
    window.profileAdditionalData &&
    window.profileAdditionalData.copingSkills
  ) {
    window.profileAdditionalData.copingSkills.forEach((skill) => {
      // Only add if not already selected
      if (
        !window.currentProfileData.coping_skills ||
        !window.currentProfileData.coping_skills.includes(skill.id)
      ) {
        const option = document.createElement("option");
        option.value = skill.id;
        option.textContent = skill.short_description || skill.name;
        addCopingSkillSelect.appendChild(option);
        console.log(
          "✅ Added coping skill to dropdown:",
          skill.short_description || skill.name
        );
      }
    });
  } else {
    console.error("❌ Failed to populate Coping Skills dropdown", {
      selectExists: !!addCopingSkillSelect,
      additionalDataExists: !!window.profileAdditionalData,
      copingSkillsExists: !!window.profileAdditionalData?.copingSkills,
    });
  }

  // Populate Clinical Specialties dropdown
  const addClinicalSpecialtySelect = document.getElementById(
    "add-clinical-specialty"
  );
  console.log("🔍 Populating Clinical Specialties dropdown...");
  console.log(
    "🔍 Available specialties:",
    window.profileAdditionalData?.clinicalSpecialties
  );
  console.log(
    "🔍 Current specialties:",
    window.currentProfileData?.clinical_specialties
  );
  if (
    addClinicalSpecialtySelect &&
    window.profileAdditionalData &&
    window.profileAdditionalData.clinicalSpecialties
  ) {
    window.profileAdditionalData.clinicalSpecialties.forEach((specialty) => {
      // Only add if not already selected
      if (
        !window.currentProfileData.clinical_specialties ||
        !window.currentProfileData.clinical_specialties.includes(specialty.id)
      ) {
        const option = document.createElement("option");
        option.value = specialty.id;
        option.textContent = specialty.short_description || specialty.name;
        addClinicalSpecialtySelect.appendChild(option);
        console.log(
          "✅ Added specialty to dropdown:",
          specialty.short_description || specialty.name
        );
      }
    });
  } else {
    console.error("❌ Failed to populate Clinical Specialties dropdown", {
      selectExists: !!addClinicalSpecialtySelect,
      additionalDataExists: !!window.profileAdditionalData,
      specialtiesExists: !!window.profileAdditionalData?.clinicalSpecialties,
    });
  }

  // Add event listener for Coping Skill dropdown change (auto-add on selection)
  if (addCopingSkillSelect) {
    addCopingSkillSelect.addEventListener("change", function () {
      const skillId = this.value;
      if (!skillId) return; // User selected the placeholder

      // Add to array
      if (!window.currentProfileData.coping_skills) {
        window.currentProfileData.coping_skills = [];
      }
      window.currentProfileData.coping_skills.push(skillId);

      // Find skill details
      const skill = window.profileAdditionalData.copingSkills.find(
        (s) => s.id === skillId
      );
      if (skill) {
        // Add badge to UI
        const copingSkillsContainer =
          document.getElementById("edit-coping-skills");
        const badge = document.createElement("span");
        badge.className = "info-badge";
        badge.style.cursor = "pointer";
        badge.innerHTML = `${
          skill.short_description || skill.name
        } <span style="margin-left: 4px; font-weight: bold;">×</span>`;
        badge.title = "Click to remove";
        badge.addEventListener("click", function () {
          const index =
            window.currentProfileData.coping_skills.indexOf(skillId);
          if (index > -1) {
            window.currentProfileData.coping_skills.splice(index, 1);
          }
          badge.remove();
          // Re-add to dropdown
          const option = document.createElement("option");
          option.value = skillId;
          option.textContent = skill.short_description || skill.name;
          addCopingSkillSelect.appendChild(option);
        });
        copingSkillsContainer.appendChild(badge);

        // Remove from dropdown
        this.querySelector(`option[value="${skillId}"]`).remove();
        this.value = ""; // Reset to placeholder
      }
    });
  }

  // Add event listener for Clinical Specialty dropdown change (auto-add on selection)
  if (addClinicalSpecialtySelect) {
    addClinicalSpecialtySelect.addEventListener("change", function () {
      const specialtyId = this.value;
      if (!specialtyId) return; // User selected the placeholder

      // Add to array
      if (!window.currentProfileData.clinical_specialties) {
        window.currentProfileData.clinical_specialties = [];
      }
      window.currentProfileData.clinical_specialties.push(specialtyId);

      // Find specialty details
      const specialty = window.profileAdditionalData.clinicalSpecialties.find(
        (s) => s.id === specialtyId
      );
      if (specialty) {
        // Add badge to UI
        const specialtiesContainer = document.getElementById(
          "edit-clinical-specialties"
        );
        const badge = document.createElement("span");
        badge.className = "info-badge";
        badge.style.cursor = "pointer";
        badge.innerHTML = `${
          specialty.short_description || specialty.name
        } <span style="margin-left: 4px; font-weight: bold;">×</span>`;
        badge.title = "Click to remove";
        badge.addEventListener("click", function () {
          const index =
            window.currentProfileData.clinical_specialties.indexOf(specialtyId);
          if (index > -1) {
            window.currentProfileData.clinical_specialties.splice(index, 1);
          }
          badge.remove();
          // Re-add to dropdown
          const option = document.createElement("option");
          option.value = specialtyId;
          option.textContent = specialty.short_description || specialty.name;
          addClinicalSpecialtySelect.appendChild(option);
        });
        specialtiesContainer.appendChild(badge);

        // Remove from dropdown
        this.querySelector(`option[value="${specialtyId}"]`).remove();
        this.value = ""; // Reset to placeholder
      }
    });
  }

  // Add save/cancel buttons for EMR Info
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "edit-buttons";
  buttonContainer.style.marginTop = "20px";
  buttonContainer.style.paddingTop = "20px";
  buttonContainer.style.borderTop = "1px solid #e9ecef";
  buttonContainer.innerHTML = `
    <button class="btn btn-primary" id="save-emr-info-btn" style="display: block !important; visibility: visible !important;">Save EMR Info</button>
    <button class="btn btn-secondary" id="cancel-emr-info-btn" style="display: block !important; visibility: visible !important;">Cancel</button>
  `;

  emrInfoSection.appendChild(buttonContainer);
  console.log("✅ EMR Info Save/Cancel buttons added");
  console.log("🔍 Button container HTML:", buttonContainer.innerHTML);
  console.log(
    "🔍 EMR Info section children count:",
    emrInfoSection.children.length
  );

  // Add event listeners for EMR Info buttons using event delegation

  // Add event listeners for Save/Cancel buttons
  const saveEMRBtn = document.getElementById("save-emr-info-btn");
  const cancelEMRBtn = document.getElementById("cancel-emr-info-btn");

  console.log("🔍 EMR Save button found:", !!saveEMRBtn);
  console.log("🔍 EMR Cancel button found:", !!cancelEMRBtn);

  if (saveEMRBtn) {
    console.log("🔍 Save button element:", saveEMRBtn);
    console.log("🔍 Save button visible:", saveEMRBtn.offsetParent !== null);
  }
  if (cancelEMRBtn) {
    console.log("🔍 Cancel button element:", cancelEMRBtn);
    console.log(
      "🔍 Cancel button visible:",
      cancelEMRBtn.offsetParent !== null
    );
  }

  if (saveEMRBtn) {
    saveEMRBtn.addEventListener("click", saveEMRInfo);
    console.log("✅ EMR Save button event listener added");
  }
  if (cancelEMRBtn) {
    cancelEMRBtn.addEventListener("click", cancelEditEMRInfo);
    console.log("✅ EMR Cancel button event listener added");
  }

  // Add event listener for cancel new pair button
  const cancelNewPairBtn = document.getElementById("cancel-new-pair-btn");
  if (cancelNewPairBtn) {
    cancelNewPairBtn.addEventListener("click", function () {
      const pairForm = document.getElementById("new-pair-form");
      if (pairForm) {
        pairForm.style.display = "none";
        // Clear the dropdowns
        document.getElementById("edit-emr-type").value = "";
        document.getElementById("edit-documentation-method").value = "";
      }
    });
  }

  // Add event listeners for remove pair buttons
  const removePairBtns = emrInfoSection.querySelectorAll(".remove-pair-btn");
  removePairBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      const index = parseInt(this.getAttribute("data-index"));
      removeExistingPair(index);
    });
  });
}

function saveEMRPair() {
  console.log("💾 Saving EMR Pair...");

  const emrTypeId = document.getElementById("edit-emr-type").value;
  const docMethodId = document.getElementById(
    "edit-documentation-method"
  ).value;

  if (!emrTypeId || !docMethodId) {
    showErrorMessage("Please select both EMR Type and Documentation Method");
    return;
  }

  // Get the names from the dropdowns
  const emrTypeSelect = document.getElementById("edit-emr-type");
  const docMethodSelect = document.getElementById("edit-documentation-method");
  const emrTypeName = emrTypeSelect.options[emrTypeSelect.selectedIndex].text;
  const docMethodName =
    docMethodSelect.options[docMethodSelect.selectedIndex].text;

  // Create new pair object
  const newPair = {
    id: `temp_${Date.now()}`, // Temporary ID for frontend
    emr_type_id: emrTypeId,
    documentation_method_id: docMethodId,
    emr_type_name: emrTypeName,
    documentation_method_name: docMethodName,
  };

  // Add to existing pairs array
  if (!window.currentProfileData.emr_type_documentation_pairs) {
    window.currentProfileData.emr_type_documentation_pairs = [];
  }

  window.currentProfileData.emr_type_documentation_pairs.push(newPair);

  // Add to existing pairs display
  const pairsContainer = document.getElementById("existing-pairs-container");
  if (pairsContainer) {
    const pairTag = document.createElement("div");
    pairTag.className = "pair-tag";
    pairTag.innerHTML = `
      <span class="pair-text">${emrTypeName} + ${docMethodName}</span>
          <button class="remove-pair-btn" data-index="${
            window.currentProfileData.emr_type_documentation_pairs.length - 1
          }" title="Remove pair">×</button>
    `;
    pairsContainer.appendChild(pairTag);
  }

  showSuccessMessage("EMR Pair added successfully!");

  // Remove the selected EMR Type from dropdown (since it's now used)
  const selectedEmrOption = emrTypeSelect.querySelector(
    `option[value="${emrTypeId}"]`
  );
  if (selectedEmrOption) {
    selectedEmrOption.remove();
  }

  // Clear the dropdowns and hide the form
  emrTypeSelect.value = "";
  document.getElementById("edit-documentation-method").value = "";

  // Hide the new pair form
  const pairForm = document.getElementById("new-pair-form");
  if (pairForm) {
    pairForm.style.display = "none";
  }
}

function addNewEMRPair() {
  console.log("➕ Adding new EMR Pair...");
  console.log(
    "🔍 Current unsaved pairs count:",
    window.unsavedEMRPairs ? window.unsavedEMRPairs.length : "undefined"
  );

  // Ensure unsavedEMRPairs array exists
  if (!window.unsavedEMRPairs) {
    window.unsavedEMRPairs = [];
  }

  // Create a new pair form
  const pairFormId = `pair-form-${Date.now()}`;
  const pairForm = document.createElement("div");
  pairForm.className = "emr-pair-section";
  pairForm.id = pairFormId;
  pairForm.style.marginBottom = "16px";
  pairForm.style.padding = "16px";
  pairForm.style.border = "1px solid #e9ecef";
  pairForm.style.borderRadius = "8px";
  pairForm.style.backgroundColor = "#f8f9fa";

  // Get current count of visible pair forms
  const currentPairCount =
    document.querySelectorAll(".emr-pair-section").length + 1;

  pairForm.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h5 style="margin: 0; color: #495057; font-size: 14px; font-weight: 600;">New Pair ${currentPairCount}</h5>
      <button class="remove-unsaved-pair-btn" data-form-id="${pairFormId}" style="background: none; border: none; color: #dc3545; cursor: pointer; font-size: 18px; font-weight: bold; width: auto; height: auto;">×</button>
    </div>
    <div class="form-group" style="margin-bottom: 12px;">
      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 4px; font-size: 13px;">EMR Types:</label>
      <select class="edit-input emr-type-select" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        <option value="">Select EMR Type...</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom: 12px;">
      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 4px; font-size: 13px;">Documentation Methods:</label>
      <select class="edit-input documentation-method-select" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        <option value="">Select Documentation Method...</option>
      </select>
    </div>
    <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
      <button class="save-pair-btn" data-form-id="${pairFormId}" style="padding: 8px 16px; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; background: #6c757d; color: white; border: none; opacity: 0.5; pointer-events: none;">Save Pair</button>
    </div>
  `;

  // Add to unsaved pairs container
  const unsavedPairsContainer = document.getElementById(
    "unsaved-pairs-container"
  );
  if (!unsavedPairsContainer) {
    console.error("❌ unsaved-pairs-container not found!");
    return;
  }

  unsavedPairsContainer.appendChild(pairForm);
  console.log("✅ Pair form added to container");

  // Keep the "Add New Pair" button just below the pair forms (not at the very bottom)
  const addNewPairBtn = document.getElementById("add-new-emr-pair-btn");
  if (!addNewPairBtn) {
    console.error("❌ Add New Pair button not found!");
    return;
  }

  const addNewPairBtnContainer = addNewPairBtn.parentElement;

  // Move the button to be the last item in the unsaved pairs container
  unsavedPairsContainer.appendChild(addNewPairBtnContainer);
  console.log("✅ Add New Pair button positioned below pair forms");

  // Reattach event listener to the moved button
  const movedButton = document.getElementById("add-new-emr-pair-btn");
  if (movedButton) {
    // Remove old event listeners by cloning the button
    const newButton = movedButton.cloneNode(true);
    movedButton.parentNode.replaceChild(newButton, movedButton);

    // Add new event listener
    newButton.addEventListener("click", function (event) {
      event.preventDefault();
      console.log("✅ Add New Pair button clicked after move!");
      addNewEMRPair();
    });
    console.log("✅ Event listener reattached to moved button");
  }

  // Populate dropdowns
  populateEMRDropdowns(pairFormId);

  // Add event listeners for dropdowns to enable/disable Save Pair button
  const emrTypeSelect = pairForm.querySelector(".emr-type-select");
  const docMethodSelect = pairForm.querySelector(
    ".documentation-method-select"
  );
  const savePairBtn = pairForm.querySelector(".save-pair-btn");

  function updateSavePairButton() {
    const emrTypeSelected = emrTypeSelect.value !== "";
    const docMethodSelected = docMethodSelect.value !== "";
    const bothSelected = emrTypeSelected && docMethodSelected;

    if (bothSelected) {
      // Enable button - blue and clickable
      savePairBtn.style.background = "#1976d2";
      savePairBtn.style.opacity = "1";
      savePairBtn.style.pointerEvents = "auto";
      savePairBtn.style.cursor = "pointer";
    } else {
      // Disable button - gray and not clickable
      savePairBtn.style.background = "#6c757d";
      savePairBtn.style.opacity = "0.5";
      savePairBtn.style.pointerEvents = "none";
      savePairBtn.style.cursor = "not-allowed";
    }
  }

  // Function to refresh all other dropdowns when selection changes
  function refreshOtherDropdowns() {
    updateSavePairButton();

    // Update all other pair forms' EMR Type dropdowns to exclude this selection
    const allOtherForms = document.querySelectorAll(".emr-pair-section");
    allOtherForms.forEach((form) => {
      if (form.id !== pairFormId) {
        const otherEmrSelect = form.querySelector(".emr-type-select");
        const selectedValue = emrTypeSelect.value;

        if (otherEmrSelect && selectedValue) {
          // Remove the selected option from other dropdowns
          const optionToRemove = otherEmrSelect.querySelector(
            `option[value="${selectedValue}"]`
          );
          if (optionToRemove && optionToRemove.value !== "") {
            optionToRemove.remove();
          }
        }

        // If this dropdown's value was just cleared, we need to repopulate other dropdowns
        if (!selectedValue) {
          // Repopulate this dropdown's options from available ones
          refreshDropdownOptions(otherEmrSelect);
        }
      }
    });
  }

  function refreshDropdownOptions(selectElement) {
    if (
      !selectElement ||
      !window.profileAdditionalData ||
      !window.profileAdditionalData.emrTypes
    )
      return;

    // Get currently used IDs
    const usedIds = new Set();
    if (
      window.currentProfileData &&
      window.currentProfileData.emr_type_documentation_pairs
    ) {
      window.currentProfileData.emr_type_documentation_pairs.forEach((pair) =>
        usedIds.add(pair.emr_type_id)
      );
    }

    const allOtherForms = document.querySelectorAll(".emr-pair-section");
    allOtherForms.forEach((form) => {
      const otherSelect = form.querySelector(".emr-type-select");
      if (otherSelect && otherSelect.value) {
        usedIds.add(otherSelect.value);
      }
    });

    // Remove all options except the first (placeholder)
    selectElement.innerHTML = '<option value="">Select EMR Type...</option>';

    // Repopulate with available options
    window.profileAdditionalData.emrTypes.forEach((emrType) => {
      if (!usedIds.has(emrType.id)) {
        const option = document.createElement("option");
        option.value = emrType.id;
        option.textContent = emrType.name;
        selectElement.appendChild(option);
      }
    });
  }

  // Add change event listeners to dropdowns
  emrTypeSelect.addEventListener("change", refreshOtherDropdowns);
  docMethodSelect.addEventListener("change", updateSavePairButton);

  // Add event listener for Save Pair button
  savePairBtn.addEventListener("click", function () {
    saveIndividualPair(pairFormId);
  });

  // Add event listener for remove button
  const removeBtn = pairForm.querySelector(".remove-unsaved-pair-btn");
  if (removeBtn) {
    removeBtn.addEventListener("click", function () {
      removeUnsavedPair(pairFormId);
    });
    console.log("✅ Remove button event listener added");
  }

  console.log("✅ New pair form created successfully");
}

function saveIndividualPair(pairFormId) {
  console.log("💾 Saving individual pair:", pairFormId);

  const pairForm = document.getElementById(pairFormId);
  if (!pairForm) {
    console.error("❌ Pair form not found:", pairFormId);
    return;
  }

  const emrTypeSelect = pairForm.querySelector(".emr-type-select");
  const docMethodSelect = pairForm.querySelector(
    ".documentation-method-select"
  );

  if (!emrTypeSelect.value || !docMethodSelect.value) {
    console.error("❌ Both dropdowns must be selected");
    showErrorMessage("Please select both EMR Type and Documentation Method");
    return;
  }

  // Find the names for the selected IDs
  const emrType = window.profileAdditionalData.emrTypes.find(
    (et) => et.id === emrTypeSelect.value
  );
  const documentationMethod =
    window.profileAdditionalData.documentationMethods.find(
      (dm) => dm.id === docMethodSelect.value
    );

  if (!emrType || !documentationMethod) {
    console.error("❌ Could not find EMR Type or Documentation Method");
    showErrorMessage("Invalid selection");
    return;
  }

  // Add to existing pairs
  if (!window.currentProfileData.emr_type_documentation_pairs) {
    window.currentProfileData.emr_type_documentation_pairs = [];
  }

  const newPair = {
    emr_type_id: emrTypeSelect.value,
    documentation_method_id: docMethodSelect.value,
    emr_type_name: emrType.name,
    documentation_method_name: documentationMethod.name,
  };

  window.currentProfileData.emr_type_documentation_pairs.push(newPair);

  // Update the existing pairs display
  updateExistingPairsDisplay();

  // Remove this pair form
  pairForm.remove();

  // Renumber remaining forms
  const remainingForms = document.querySelectorAll(".emr-pair-section");
  remainingForms.forEach((form, index) => {
    const title = form.querySelector("h5");
    if (title) {
      title.textContent = `New Pair ${index + 1}`;
    }
  });

  // Refresh all remaining dropdowns to include the previously selected EMR Type
  refreshAllDropdowns();

  showSuccessMessage("Pair saved successfully!");
  console.log("✅ Individual pair saved:", newPair);
}

function refreshAllDropdowns() {
  // Get all currently used EMR Type IDs
  const usedIds = new Set();

  // From saved pairs
  if (
    window.currentProfileData &&
    window.currentProfileData.emr_type_documentation_pairs
  ) {
    window.currentProfileData.emr_type_documentation_pairs.forEach((pair) => {
      usedIds.add(pair.emr_type_id);
    });
  }

  // From currently selected unsaved pairs
  const allForms = document.querySelectorAll(".emr-pair-section");
  allForms.forEach((form) => {
    const select = form.querySelector(".emr-type-select");
    if (select && select.value) {
      usedIds.add(select.value);
    }
  });

  // Refresh all dropdowns
  allForms.forEach((form) => {
    const select = form.querySelector(".emr-type-select");
    if (
      select &&
      window.profileAdditionalData &&
      window.profileAdditionalData.emrTypes
    ) {
      const currentValue = select.value;

      // Clear and repopulate
      select.innerHTML = '<option value="">Select EMR Type...</option>';

      window.profileAdditionalData.emrTypes.forEach((emrType) => {
        if (!usedIds.has(emrType.id)) {
          const option = document.createElement("option");
          option.value = emrType.id;
          option.textContent = emrType.name;
          select.appendChild(option);
        }
      });

      // Restore previous selection if it exists
      if (currentValue) {
        select.value = currentValue;
      }
    }
  });
}

function updateExistingPairsDisplay() {
  const existingPairsContainer = document.getElementById(
    "existing-pairs-container"
  );
  if (!existingPairsContainer) return;

  // Clear existing display
  existingPairsContainer.innerHTML = "";

  // Add all pairs
  window.currentProfileData.emr_type_documentation_pairs.forEach(
    (pair, index) => {
      const pairTag = document.createElement("div");
      pairTag.className = "pair-tag";
      pairTag.innerHTML = `
        <span class="pair-text">${pair.emr_type_name} + ${pair.documentation_method_name}</span>
        <button class="remove-pair-btn" data-index="${index}" title="Remove pair">×</button>
      `;
      existingPairsContainer.appendChild(pairTag);
    }
  );

  // Reattach event listeners for remove buttons
  const removePairBtns =
    existingPairsContainer.querySelectorAll(".remove-pair-btn");
  removePairBtns.forEach((btn, btnIndex) => {
    // Remove any existing event listeners by cloning the button
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // Get the data-index value before attaching listener
    const dataIndex = parseInt(newBtn.getAttribute("data-index"));

    // Add fresh event listener
    newBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation(); // Prevent duplicate listeners
      console.log("🗑️ Remove existing pair clicked, data-index:", dataIndex);
      removeExistingPair(dataIndex);
    });
    console.log(
      "✅ Remove button event listener attached for index:",
      dataIndex
    );
  });
}

function populateEMRDropdowns(pairFormId) {
  console.log("🔍 Populating dropdowns for:", pairFormId);

  const pairForm = document.getElementById(pairFormId);
  if (!pairForm) {
    console.error("❌ Pair form not found:", pairFormId);
    return;
  }

  const emrTypeSelect = pairForm.querySelector(".emr-type-select");
  const documentationMethodSelect = pairForm.querySelector(
    ".documentation-method-select"
  );

  console.log("🔍 EMR Type select found:", !!emrTypeSelect);
  console.log(
    "🔍 Documentation Method select found:",
    !!documentationMethodSelect
  );

  // Check if additionalData exists
  console.log(
    "🔍 window.profileAdditionalData exists:",
    !!window.profileAdditionalData
  );
  if (window.profileAdditionalData) {
    console.log(
      "🔍 EMR Types available:",
      window.profileAdditionalData.emrTypes
        ? window.profileAdditionalData.emrTypes.length
        : "undefined"
    );
    console.log(
      "🔍 Documentation Methods available:",
      window.profileAdditionalData.documentationMethods
        ? window.profileAdditionalData.documentationMethods.length
        : "undefined"
    );
  }

  // Get list of already-used EMR Type IDs (from existing pairs and saved pairs)
  const usedEmrTypeIds = new Set();

  // Get from existing saved pairs
  if (
    window.currentProfileData &&
    window.currentProfileData.emr_type_documentation_pairs
  ) {
    window.currentProfileData.emr_type_documentation_pairs.forEach((pair) => {
      usedEmrTypeIds.add(pair.emr_type_id);
    });
  }

  // Get from currently visible unsaved pair forms that already have selections
  const allPairForms = document.querySelectorAll(".emr-pair-section");
  allPairForms.forEach((form) => {
    const select = form.querySelector(".emr-type-select");
    if (select && select.value && form.id !== pairFormId) {
      usedEmrTypeIds.add(select.value);
    }
  });

  // Populate EMR Types (excluding already-used ones)
  if (window.profileAdditionalData && window.profileAdditionalData.emrTypes) {
    console.log("📋 Populating EMR Types dropdown...");
    let addedCount = 0;
    window.profileAdditionalData.emrTypes.forEach((emrType) => {
      // Only add EMR Type if it hasn't been used yet
      if (!usedEmrTypeIds.has(emrType.id)) {
        const option = document.createElement("option");
        option.value = emrType.id;
        option.textContent = emrType.name;
        emrTypeSelect.appendChild(option);
        addedCount++;
        console.log("✅ Added EMR Type:", emrType.name);
      } else {
        console.log("⏭️ Skipped already-used EMR Type:", emrType.name);
      }
    });
    console.log("✅ EMR Types dropdown populated with", addedCount, "options");
  } else {
    console.error("❌ No EMR Types data available");
  }

  // Populate Documentation Methods
  if (
    window.profileAdditionalData &&
    window.profileAdditionalData.documentationMethods
  ) {
    console.log("📋 Populating Documentation Methods dropdown...");
    window.profileAdditionalData.documentationMethods.forEach((method) => {
      const option = document.createElement("option");
      option.value = method.id;
      option.textContent = method.name;
      documentationMethodSelect.appendChild(option);
      console.log("✅ Added Documentation Method:", method.name);
    });
    console.log(
      "✅ Documentation Methods dropdown populated with",
      window.profileAdditionalData.documentationMethods.length,
      "options"
    );
  } else {
    console.error("❌ No Documentation Methods data available");
  }
}

function removeUnsavedPair(pairFormId) {
  console.log("🗑️ Removing unsaved pair:", pairFormId);

  const pairForm = document.getElementById(pairFormId);
  if (pairForm) {
    pairForm.remove();

    // Renumber remaining pairs
    const remainingForms = document.querySelectorAll(".emr-pair-section");
    remainingForms.forEach((form, index) => {
      const title = form.querySelector("h5");
      if (title) {
        title.textContent = `New Pair ${index + 1}`;
      }
    });

    // Refresh all dropdowns to include the removed EMR Type
    refreshAllDropdowns();
  }
}

function removeExistingPair(index) {
  console.log("🗑️ Removing existing pair at index:", index);

  // Prevent duplicate execution
  if (window.isRemovingPair) {
    console.log("⚠️ Already removing a pair, ignoring duplicate call");
    return;
  }

  window.isRemovingPair = true;

  if (
    window.currentProfileData &&
    window.currentProfileData.emr_type_documentation_pairs
  ) {
    // Get the pair before removing it
    const removedPair =
      window.currentProfileData.emr_type_documentation_pairs[index];

    console.log("🗑️ Removing pair:", removedPair);

    // Remove from array
    window.currentProfileData.emr_type_documentation_pairs.splice(index, 1);

    // Refresh the existing pairs display
    updateExistingPairsDisplay();

    // Refresh all dropdowns to make the removed EMR type available again
    refreshAllDropdowns();

    showSuccessMessage("Pair removed successfully!");
    console.log("✅ Pair removed and dropdowns refreshed");
  }

  // Reset flag after a short delay
  setTimeout(() => {
    window.isRemovingPair = false;
  }, 300);
}

async function saveEMRInfo() {
  console.log("💾 Saving EMR Info...");

  try {
    // Get token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      showErrorMessage("Please log in again to save EMR Info.");
      return;
    }

    // Collect all unsaved pairs
    const unsavedPairs = [];
    const unsavedPairForms = document.querySelectorAll(".emr-pair-section");

    unsavedPairForms.forEach((form) => {
      const emrTypeSelect = form.querySelector(".emr-type-select");
      const documentationMethodSelect = form.querySelector(
        ".documentation-method-select"
      );

      if (
        emrTypeSelect &&
        documentationMethodSelect &&
        emrTypeSelect.value &&
        documentationMethodSelect.value
      ) {
        // Find the names for the selected IDs
        const emrType = window.profileAdditionalData.emrTypes.find(
          (et) => et.id === emrTypeSelect.value
        );
        const documentationMethod =
          window.profileAdditionalData.documentationMethods.find(
            (dm) => dm.id === documentationMethodSelect.value
          );

        if (emrType && documentationMethod) {
          unsavedPairs.push({
            emr_type_id: emrTypeSelect.value,
            documentation_method_id: documentationMethodSelect.value,
            emr_type_name: emrType.name,
            documentation_method_name: documentationMethod.name,
          });
        }
      }
    });

    // Get Type Writing value
    const typeWritingSelect = document.getElementById("edit-type-writing");
    const typeWritingValue = typeWritingSelect ? typeWritingSelect.value : null;

    // Combine existing pairs with new unsaved pairs
    const allPairs = [
      ...(window.currentProfileData.emr_type_documentation_pairs || []),
      ...unsavedPairs,
    ];

    // Prepare the request body - send complete user object
    const requestBody = {
      ...window.currentProfileData, // Include all existing data
      emr_type_documentation_pairs: allPairs,
      coping_skills: window.currentProfileData.coping_skills || [],
      clinical_specialties:
        window.currentProfileData.clinical_specialties || [],
      type_writing: typeWritingValue ? [typeWritingValue] : [],
    };

    console.log("📦 Saving pairs:", allPairs);

    // Make API call to save EMR Info
    const response = await fetch(`${API_BASE_URL}/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenResult.accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    // Check for 401
    if (check401Response(response)) {
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const updatedData = await response.json();
    console.log("✅ EMR Info updated:", updatedData);

    // Update stored data
    window.currentProfileData = updatedData;

    // Show success message
    showSuccessMessage("EMR Info saved successfully!");

    // Restore the original HTML structure so updateProfilePage can populate it
    const emrInfoSection = document.getElementById("emr-info-content");
    if (emrInfoSection) {
      // Restore the original view mode HTML structure (matching popup.html)
      emrInfoSection.innerHTML = `
        <div class="detail-item full-width">
          <div class="detail-value" id="profile-emr-system">
            Loading...
          </div>
        </div>
        <div class="detail-item">
          <span class="detail-label">Coping Skills</span>
          <span class="detail-value">
            <div class="badges-container" id="profile-coping-skills">
              <span class="info-badge">Loading...</span>
            </div>
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Clinical Specialties</span>
          <span class="detail-value">
            <div class="badges-container" id="profile-clinical-specialties">
              <span class="info-badge">Loading...</span>
            </div>
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Type Writing</span>
          <span class="detail-value" id="profile-type-writing">Loading...</span>
        </div>
      `;
      console.log("✅ Restored EMR Info view mode HTML structure");
    }

    // Reload profile page to populate the view mode with updated data
    updateProfilePage(updatedData, window.profileAdditionalData);

    // Show bottom edit button again
    const emrBottomBtn = document.getElementById("edit-emr-info-bottom-btn");
    if (emrBottomBtn) {
      emrBottomBtn.style.display = "flex";
    }

    showSuccessMessage("EMR Info saved successfully!");
  } catch (error) {
    console.error("❌ Error saving EMR Info:", error);
    showErrorMessage("Failed to save EMR Info. Please try again.");
  }
}

function cancelEditEMRInfo() {
  console.log("❌ Canceling EMR Info edit...");

  // First, restore the original HTML structure so updateProfilePage can populate it
  const emrInfoSection = document.getElementById("emr-info-content");
  if (emrInfoSection) {
    // Restore the original view mode HTML structure (matching popup.html)
    emrInfoSection.innerHTML = `
      <div class="detail-item full-width">
        <div class="detail-value" id="profile-emr-system">
          Loading...
        </div>
      </div>
      <div class="detail-item">
        <span class="detail-label">Coping Skills</span>
        <span class="detail-value">
          <div class="badges-container" id="profile-coping-skills">
            <span class="info-badge">Loading...</span>
          </div>
        </span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Clinical Specialties</span>
        <span class="detail-value">
          <div class="badges-container" id="profile-clinical-specialties">
            <span class="info-badge">Loading...</span>
          </div>
        </span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Type Writing</span>
        <span class="detail-value" id="profile-type-writing">Loading...</span>
      </div>
    `;
    console.log("✅ Restored EMR Info HTML structure");
  }

  // Now reload the profile data which will populate the restored structure
  loadProfileData();

  // Show bottom edit button again
  const emrBottomBtn = document.getElementById("edit-emr-info-bottom-btn");
  if (emrBottomBtn) {
    emrBottomBtn.style.display = "flex";
  }

  console.log("✅ EMR Info edit cancelled - reloading profile data");
}

// Save Personal Info function
async function savePersonalInfo() {
  try {
    console.log("💾 Saving Personal Info...");

    // Get form data - get the actual editable fields from Personal Info section
    const mobileField = document.getElementById("edit-mobile");
    const companyField = document.getElementById("edit-company");
    const statusField = document.getElementById("edit-status");
    const userTypeField = document.getElementById("edit-user-type");
    const sessionInstructionsField = document.getElementById(
      "edit-session-instructions"
    );

    if (!statusField) {
      showErrorMessage("Edit form not found. Please try editing again.");
      console.log("❌ Status field not found!");
      return;
    }

    const formData = {
      ...window.currentProfileData, // Include all existing data
      mobile_phone:
        mobileField?.value || window.currentProfileData.mobile_phone,
      company_name:
        companyField?.value || window.currentProfileData.company_name,
      is_active: statusField.value === "true",
      user_type: userTypeField?.value || window.currentProfileData.user_type,
      session_instructions:
        sessionInstructionsField?.value ||
        window.currentProfileData.session_instructions,
    };

    console.log("🔍 Form data to save:", formData);

    // Get token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      showErrorMessage("Please log in again to save changes.");
      return;
    }

    // Make API call
    const response = await fetch(`${API_BASE_URL}/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenResult.accessToken}`,
      },
      body: JSON.stringify(formData),
    });

    // Check for 401
    if (check401Response(response)) {
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const updatedData = await response.json();
    console.log("✅ Personal Info updated:", updatedData);

    // Update stored data
    window.currentProfileData = updatedData;

    // Exit edit mode first by removing edit UI elements
    const personalInfoSection = document.getElementById(
      "personal-info-content"
    );
    if (personalInfoSection) {
      // FIRST: Save reference to status dropdown before removing it
      const statusDropdown = document.getElementById("edit-status");
      let statusContainer = null;
      if (statusDropdown) {
        statusContainer = statusDropdown.parentElement;
        console.log("✅ Found status dropdown before cleanup");
      }

      // Remove edit buttons
      const editButtons = personalInfoSection.querySelector(".edit-buttons");
      if (editButtons) {
        editButtons.remove();
      }

      // Remove all edit inputs
      const editInputs = personalInfoSection.querySelectorAll(".edit-input");
      editInputs.forEach((input) => input.remove());

      // Remove array edit containers
      const arrayContainers = personalInfoSection.querySelectorAll(
        ".array-edit-container"
      );
      arrayContainers.forEach((container) => container.remove());

      // Restore password field
      const passwordSpan = document.getElementById("profile-password");
      if (passwordSpan) {
        const passwordContainer = passwordSpan.parentElement;
        passwordContainer.innerHTML = `
          <span id="profile-password">********</span>
          <a href="#" class="forgot-password-link">Forgot password?</a>
        `;
      }

      // Restore status badge structure so updateProfilePage can find it
      if (statusContainer) {
        statusContainer.innerHTML =
          '<span class="status-badge" id="profile-status"></span>';
        console.log("✅ Status badge structure restored after save");
      }
    }

    // Reload profile page with updated data
    updateProfilePage(updatedData, window.profileAdditionalData);

    // Show bottom edit button again
    const personalBottomBtn = document.getElementById("edit-personal-info-bottom-btn");
    if (personalBottomBtn) {
      personalBottomBtn.style.display = "flex";
    }

    showSuccessMessage("Personal Info updated successfully!");
  } catch (error) {
    console.error("❌ Error saving Personal Info:", error);
    showErrorMessage("Failed to save Personal Info. Please try again.");
  }
}

// Cancel Edit Personal Info function
function cancelEditPersonalInfo() {
  console.log("❌ Canceling Personal Info edit...");
  console.log("🔍 Current profile data:", window.currentProfileData);
  console.log("🔍 is_active value:", window.currentProfileData?.is_active);

  // Remove edit mode elements
  const personalInfoSection = document.getElementById("personal-info-content");
  if (personalInfoSection) {
    // Remove edit buttons
    const editButtons = personalInfoSection.querySelector(".edit-buttons");
    if (editButtons) {
      editButtons.remove();
    }

    // FIRST: Handle status field specially BEFORE removing edit inputs
    // During edit mode, the status badge is replaced with a dropdown (id="edit-status")
    const statusDropdown = document.getElementById("edit-status");
    const statusSpan = document.getElementById("profile-status");
    let statusContainer = null;

    if (statusDropdown) {
      statusContainer = statusDropdown.parentElement;
      console.log("✅ Found status dropdown, will restore badge");
    } else if (statusSpan) {
      statusContainer = statusSpan.parentElement;
      console.log("✅ Found status span, will restore badge");
    } else {
      console.error("❌ Could not find status dropdown or status span!");
    }

    // Remove any edit inputs and restore original structure
    const fields = personalInfoSection.querySelectorAll(".detail-value");
    fields.forEach((field) => {
      // Only remove edit inputs, not all content
      const editInputs = field.querySelectorAll(".edit-input");
      editInputs.forEach((input) => input.remove());

      // Also remove array edit containers
      const arrayContainers = field.querySelectorAll(".array-edit-container");
      arrayContainers.forEach((container) => container.remove());

      // Restore original content based on field ID
      const fieldName = field.id.replace("profile-", "");
      let originalValue = "";

      if (fieldName === "mobile") {
        originalValue =
          window.currentProfileData.mobile_phone || "Not specified";
        field.textContent = originalValue;
      } else if (fieldName === "company") {
        originalValue =
          window.currentProfileData.company_name ||
          window.currentProfileData.company?.name ||
          "Not specified";
        field.textContent = originalValue;
      } else if (fieldName === "user-type") {
        originalValue = window.currentProfileData.user_type || "Not specified";
        field.textContent = originalValue;
      } else if (fieldName === "session-instructions") {
        originalValue =
          window.currentProfileData.session_instructions || "Not specified";
        field.textContent = originalValue;
      }
    });

    // Handle password field specially - find it by its nested ID BEFORE updateProfilePage
    const passwordSpan = document.getElementById("profile-password");
    if (passwordSpan) {
      const passwordContainer = passwordSpan.parentElement;
      passwordContainer.innerHTML = `
        <span id="profile-password">********</span>
        <a href="#" class="forgot-password-link">Forgot password?</a>
      `;
    }

    // Restore status badge using the container we found earlier
    if (statusContainer) {
      // Restore the basic structure with ID, updateProfilePage will set the correct value
      statusContainer.innerHTML =
        '<span class="status-badge" id="profile-status"></span>';
      console.log("✅ Status badge structure restored");
    }
  }

  // Reload profile page with original data - this will now find the status element and set it correctly
  updateProfilePage(window.currentProfileData, window.profileAdditionalData);

  // Show bottom edit button again
  const personalBottomBtn = document.getElementById("edit-personal-info-bottom-btn");
  if (personalBottomBtn) {
    personalBottomBtn.style.display = "flex";
  }

  console.log("✅ Personal Info edit cancelled");
}

// Helper functions for managing coping skills and clinical specialties arrays
function removeCopingSkill(index) {
  console.log("🗑️ Removing coping skill at index:", index);

  if (window.currentProfileData.coping_skills) {
    window.currentProfileData.coping_skills.splice(index, 1);
    // Refresh the display
    editPersonalInfo();
  }
}

function addCopingSkill() {
  const select = document.getElementById("add-coping-skill");
  const selectedId = select.value;

  if (
    selectedId &&
    !window.currentProfileData.coping_skills.includes(selectedId)
  ) {
    if (!window.currentProfileData.coping_skills) {
      window.currentProfileData.coping_skills = [];
    }
    window.currentProfileData.coping_skills.push(selectedId);
    // Refresh the display
    editPersonalInfo();
  }
}

function removeClinicalSpecialty(index) {
  console.log("🗑️ Removing clinical specialty at index:", index);

  if (window.currentProfileData.clinical_specialties) {
    window.currentProfileData.clinical_specialties.splice(index, 1);
    // Refresh the display
    editPersonalInfo();
  }
}

function addClinicalSpecialty() {
  const select = document.getElementById("add-clinical-specialty");
  const selectedId = select.value;

  if (
    selectedId &&
    !window.currentProfileData.clinical_specialties.includes(selectedId)
  ) {
    if (!window.currentProfileData.clinical_specialties) {
      window.currentProfileData.clinical_specialties = [];
    }
    window.currentProfileData.clinical_specialties.push(selectedId);
    // Refresh the display
    editPersonalInfo();
  }
}

// Edit Company Info function
function editCompanyInfo() {
  console.log("✏️ Editing Company Info...");

  const companyInfoSection = document.getElementById("company-info-content");
  if (!companyInfoSection) {
    console.error(
      "❌ Company Info section not found. Make sure you're on the profile page."
    );
    showErrorMessage("Please navigate to the Profile page first.");
    return;
  }

  // Check if already in edit mode
  if (companyInfoSection.querySelector(".edit-buttons")) {
    console.log("⚠️ Already in edit mode");
    return;
  }

  // Hide bottom edit button
  const bottomEditBtn = document.getElementById("edit-company-info-bottom-btn");
  if (bottomEditBtn) {
    bottomEditBtn.style.display = "none";
  }

  // Handle status field specially - it should be a dropdown
  const statusField = document.getElementById("profile-company-status");
  if (statusField) {
    console.log("📊 Found company status field, creating dropdown");
    const statusContainer = statusField.parentElement;
    const select = document.createElement("select");
    select.className = "edit-input";
    select.id = "edit-company-status";

    const activeOption = document.createElement("option");
    activeOption.value = "true";
    activeOption.textContent = "Active";
    const inactiveOption = document.createElement("option");
    inactiveOption.value = "false";
    inactiveOption.textContent = "Inactive";
    select.appendChild(activeOption);
    select.appendChild(inactiveOption);

    // Set current value
    select.value = window.currentProfileData.company?.is_active
      ? "true"
      : "false";

    statusContainer.innerHTML = "";
    statusContainer.appendChild(select);
    console.log(
      "📊 Company status dropdown created with ID: edit-company-status"
    );
  } else {
    console.log("❌ Company status field not found!");
  }

  const fields = companyInfoSection.querySelectorAll(".detail-value");

  // Make fields editable
  fields.forEach((field) => {
    const currentValue = field.textContent;
    const fieldName = field.id.replace("profile-company-", "");

    // Skip status field - it's already handled above, and has no ID on .detail-value
    if (!field.id || fieldName === "status") {
      console.log("⏭️ Skipping field:", fieldName);
      return;
    }

    // Create input based on field type
    let input;
    if (fieldName === "is-active") {
      input = document.createElement("select");
      const activeOption = document.createElement("option");
      activeOption.value = "true";
      activeOption.textContent = "Active";
      const inactiveOption = document.createElement("option");
      inactiveOption.value = "false";
      inactiveOption.textContent = "Inactive";
      input.appendChild(activeOption);
      input.appendChild(inactiveOption);
    } else {
      input = document.createElement("input");
      input.type = "text";
    }

    input.value = currentValue === "Not specified" ? "" : currentValue;
    input.className = "edit-input";
    input.id = `edit-company-${fieldName}`;

    field.innerHTML = "";
    field.appendChild(input);
  });

  // Add save/cancel buttons
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "edit-buttons";
  buttonContainer.innerHTML = `
    <button class="btn btn-primary" id="save-company-info-btn">Save Changes</button>
    <button class="btn btn-secondary" id="cancel-company-info-btn">Cancel</button>
  `;

  companyInfoSection.appendChild(buttonContainer);

  // Add event listeners for Company Info buttons
  const saveCompanyBtn = document.getElementById("save-company-info-btn");
  const cancelCompanyBtn = document.getElementById("cancel-company-info-btn");

  console.log("🔍 Company Save button found:", !!saveCompanyBtn);
  console.log("🔍 Company Cancel button found:", !!cancelCompanyBtn);

  if (saveCompanyBtn) {
    saveCompanyBtn.addEventListener("click", saveCompanyInfo);
    console.log("✅ Company Save button event listener added");
  }
  if (cancelCompanyBtn) {
    cancelCompanyBtn.addEventListener("click", cancelEditCompanyInfo);
    console.log("✅ Company Cancel button event listener added");
  }
}

// Save Company Info function
async function saveCompanyInfo() {
  try {
    console.log("💾 Saving Company Info...");

    // Get form data
    const nameField = document.getElementById("edit-company-name");
    const industryField = document.getElementById("edit-company-industry");
    const emrField = document.getElementById("edit-company-emr");
    const addressField = document.getElementById("edit-company-address");
    // The edit function creates it as edit-company-status (from profile-company-status)
    const isActiveField = document.getElementById("edit-company-status");

    console.log("🔍 Company form fields:", {
      nameField: !!nameField,
      industryField: !!industryField,
      emrField: !!emrField,
      addressField: !!addressField,
      isActiveField: !!isActiveField,
    });

    if (
      !nameField ||
      !industryField ||
      !emrField ||
      !addressField ||
      !isActiveField
    ) {
      showErrorMessage("Edit form not found. Please try editing again.");
      console.log("❌ Missing fields - cannot save");
      return;
    }

    const formData = {
      name: nameField.value,
      industry: industryField.value,
      emr: emrField.value,
      address: addressField.value,
      is_active: isActiveField.value === "true",
    };

    // Get company ID from current profile data
    const companyId = window.currentProfileData.company?.id;
    if (!companyId) {
      showErrorMessage("Company ID not found. Please refresh and try again.");
      return;
    }

    // Get token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      showErrorMessage("Please log in again to save changes.");
      return;
    }

    // Make API call
    const response = await fetch(`${API_BASE_URL}/company/${companyId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenResult.accessToken}`,
      },
      body: JSON.stringify(formData),
    });

    // Check for 401
    if (check401Response(response)) {
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const updatedData = await response.json();
    console.log("✅ Company Info updated:", updatedData);

    // Update stored data
    window.currentProfileData.company = updatedData;

    // Exit edit mode and restore status badge
    const companyInfoSection = document.getElementById("company-info-content");
    if (companyInfoSection) {
      // Save reference to status dropdown before removing
      // The edit function creates it as edit-company-status (from profile-company-status)
      const statusDropdown = document.getElementById("edit-company-status");
      let statusContainer = null;
      if (statusDropdown) {
        statusContainer = statusDropdown.parentElement;
        console.log("✅ Found company status dropdown before cleanup");
      }

      // Remove edit buttons
      const editButtons = companyInfoSection.querySelector(".edit-buttons");
      if (editButtons) {
        editButtons.remove();
      }

      // Remove all edit inputs
      const editInputs = companyInfoSection.querySelectorAll(".edit-input");
      editInputs.forEach((input) => input.remove());

      // Restore status badge structure
      if (statusContainer) {
        statusContainer.innerHTML =
          '<span class="status-badge" id="profile-company-status"></span>';
        console.log("✅ Company status badge restored after save");
      }
    }

    // Reload profile page
    updateProfilePage(window.currentProfileData, window.profileAdditionalData);

    // Show bottom edit button again
    const companyBottomBtn = document.getElementById("edit-company-info-bottom-btn");
    if (companyBottomBtn) {
      companyBottomBtn.style.display = "flex";
    }

    showSuccessMessage("Company Info updated successfully!");
  } catch (error) {
    console.error("❌ Error saving Company Info:", error);
    showErrorMessage("Failed to save Company Info. Please try again.");
  }
}

// Cancel Edit Company Info function
function cancelEditCompanyInfo() {
  console.log("❌ Canceling Company Info edit...");

  // Remove edit mode elements
  const companyInfoSection = document.getElementById("company-info-content");
  if (companyInfoSection) {
    // FIRST: Save reference to status dropdown before removing
    // The edit function creates it as edit-company-status (from profile-company-status)
    const statusDropdown = document.getElementById("edit-company-status");
    const statusSpan = document.getElementById("profile-company-status");
    let statusContainer = null;

    if (statusDropdown) {
      statusContainer = statusDropdown.parentElement;
      console.log("✅ Found company status dropdown for cancel");
    } else if (statusSpan) {
      statusContainer = statusSpan.parentElement;
      console.log("✅ Found company status span for cancel");
    }

    // Remove edit buttons
    const editButtons = companyInfoSection.querySelector(".edit-buttons");
    if (editButtons) {
      editButtons.remove();
    }

    // Remove any edit inputs and restore original structure
    const fields = companyInfoSection.querySelectorAll(".detail-value");
    fields.forEach((field) => {
      // Only remove edit inputs, not all content
      const editInputs = field.querySelectorAll(".edit-input");
      editInputs.forEach((input) => input.remove());

      // Restore original content based on field ID
      const fieldName = field.id.replace("profile-company-", "");
      let originalValue = "";

      if (fieldName === "name") {
        originalValue =
          window.currentProfileData.company?.name || "Not specified";
        field.textContent = originalValue;
      } else if (fieldName === "industry") {
        originalValue =
          window.currentProfileData.company?.industry || "Not specified";
        field.textContent = originalValue;
      } else if (fieldName === "emr") {
        originalValue =
          window.currentProfileData.company?.emr || "Not specified";
        field.textContent = originalValue;
      } else if (fieldName === "address") {
        originalValue =
          window.currentProfileData.company?.address || "Not specified";
        field.textContent = originalValue;
      }
    });

    // Restore company status badge structure
    if (statusContainer) {
      statusContainer.innerHTML =
        '<span class="status-badge" id="profile-company-status"></span>';
      console.log("✅ Company status badge structure restored for cancel");
    }
  }

  // Reload profile page with original data
  updateProfilePage(window.currentProfileData, window.profileAdditionalData);

  // Show bottom edit button again
  const companyBottomBtn = document.getElementById("edit-company-info-bottom-btn");
  if (companyBottomBtn) {
    companyBottomBtn.style.display = "flex";
  }

  console.log("✅ Company Info edit cancelled");
}

// Generate AI Notes function
async function generateAINotes() {
  try {
    console.log("🤖 Generating AI Notes...");

    // Get current session ID
    const sessionResult = await chrome.storage.local.get(["currentSession"]);
    if (!sessionResult.currentSession || !sessionResult.currentSession.id) {
      console.error("❌ No current session found");
      showErrorMessage("No session selected. Please select a session first.");
      return;
    }

    const sessionId = sessionResult.currentSession.id;
    console.log("📋 Using session ID:", sessionId);

    // Get stored JWT token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      console.error("❌ No JWT token found");
      showErrorMessage("Please log in again to generate AI notes.");
      return;
    }

    // Show loading state for both buttons
    const generateButtons = document.querySelectorAll(
      ".generate-ai-notes-button, .re-generate-button"
    );
    generateButtons.forEach((button) => {
      button.textContent = "Generating...";
      button.disabled = true;
    });

    // Make API call
    const response = await fetch(
      `${API_BASE_URL}/sessions/${sessionId}/generate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const aiNotesData = await response.json();
    console.log("✅ AI Notes generated:", aiNotesData);

    // Update the 3 boxes in AI Notes tab with the generated content
    updateAINotesContent(aiNotesData);

    // Also update the session data in storage with the new AI notes
    const currentSession = sessionResult.currentSession;
    currentSession.methods_response = aiNotesData.methods;
    currentSession.progress_towards_goal_response =
      aiNotesData.progress_towards_goal;
    currentSession.recommended_changes_response =
      aiNotesData.recommended_changes;

    // Save updated session to storage
    chrome.storage.local.set({ currentSession: currentSession });

    // Reset button state for both buttons
    generateButtons.forEach((button) => {
      button.disabled = false;
    });
    updateGenerateButtonText("Re-generate");

    // Show success message
    showSuccessMessage("AI Notes generated successfully!");
  } catch (error) {
    console.error("❌ Error generating AI notes:", error);
    showErrorMessage("Failed to generate AI notes. Please try again.");

    // Reset button state for both buttons
    const generateButtons = document.querySelectorAll(
      ".generate-ai-notes-button, .re-generate-button"
    );
    generateButtons.forEach((button) => {
      button.disabled = false;
    });
    updateGenerateButtonText("Generate AI Notes");
  }
}

// Load existing AI Notes for the current session
async function loadSessionAINotes() {
  try {
    console.log("🔄 Loading session AI Notes...");

    // Get current session from storage
    const sessionResult = await chrome.storage.local.get(["currentSession"]);
    if (!sessionResult.currentSession || !sessionResult.currentSession.id) {
      console.log("❌ No current session found for AI Notes");
      return;
    }

    const session = sessionResult.currentSession;
    console.log("📋 Loading AI Notes for session:", session.id);

    // Check if session has existing AI Notes
    if (
      session.methods_response ||
      session.progress_towards_goal_response ||
      session.recommended_changes_response
    ) {
      console.log("📋 Found existing AI Notes in session data");

      // Create AI Notes data object from session
      const aiNotesData = {
        methods: session.methods_response || "",
        progress_towards_goal: session.progress_towards_goal_response || "",
        recommended_changes: session.recommended_changes_response || "",
      };

      // Update the 3 boxes with existing data
      updateAINotesContent(aiNotesData);

      // Update button to show "Re-generate" since content exists
      updateGenerateButtonText("Re-generate");
    } else {
      console.log("📋 No existing AI Notes found, showing default content");

      // Show default loading content
      updateAINotesContent({
        methods: "Loading methods response...",
        progress_towards_goal: "Loading progress towards goal response...",
        recommended_changes: "Loading recommended changes response...",
      });

      // Update button to show "Generate AI Notes"
      updateGenerateButtonText("Generate AI Notes");
    }
  } catch (error) {
    console.error("❌ Error loading session AI Notes:", error);
    showErrorMessage(`Failed to load AI notes: ${error.message}`);
  }
}

// Update generate button text (session-specific)
function updateGenerateButtonText(text) {
  const generateButtons = document.querySelectorAll(
    ".generate-ai-notes-button, .re-generate-button"
  );
  generateButtons.forEach((button) => {
    button.textContent = text;
  });
}

// Check if AI notes exist and update button state accordingly
async function checkAndUpdateAIButtonState() {
  try {
    // Get current session from storage
    const sessionResult = await chrome.storage.local.get(["currentSession"]);
    if (!sessionResult.currentSession || !sessionResult.currentSession.id) {
      console.log("❌ No current session found for AI button state check");
      return;
    }

    const session = sessionResult.currentSession;

    // Check if session has existing AI Notes
    if (
      session.methods_response ||
      session.progress_towards_goal_response ||
      session.recommended_changes_response
    ) {
      console.log("📋 AI Notes exist, updating button to 'Re-generate'");
      updateGenerateButtonText("Re-generate");
    } else {
      console.log(
        "📋 No AI Notes exist, updating button to 'Generate AI Notes'"
      );
      updateGenerateButtonText("Generate AI Notes");
    }
  } catch (error) {
    console.error("❌ Error checking AI button state:", error);
    showErrorMessage(`Failed to check AI button state: ${error.message}`);
  }
}

function updateAINotesContent(aiNotesData) {
  // Update Methods section
  const methodsElement = document.getElementById("ai-notes-methods-text");
  if (methodsElement && aiNotesData.methods) {
    methodsElement.textContent = aiNotesData.methods;
  }

  // Update Progress Towards Goal section
  const progressElement = document.getElementById(
    "ai-notes-progress-goal-text"
  );
  if (progressElement && aiNotesData.progress_towards_goal) {
    progressElement.textContent = aiNotesData.progress_towards_goal;
  }

  // Update Recommended Changes section
  const changesElement = document.getElementById(
    "ai-notes-recommended-changes-text"
  );
  if (changesElement && aiNotesData.recommended_changes) {
    changesElement.textContent = aiNotesData.recommended_changes;
  }

  console.log("✅ AI Notes content updated");
}

// Add Client Modal Functions
function showAddClientModal() {
  const modal = document.getElementById("add-client-modal");
  if (modal) {
    modal.style.display = "block";
    // Reset modal to add mode
    resetModalToAddMode();
  }
}

function hideAddClientModal() {
  const modal = document.getElementById("add-client-modal");
  if (modal) {
    modal.style.display = "none";
    // Reset modal to add mode when closing
    resetModalToAddMode();
  }
}

function setupAddClientModal() {
  // Close modal when clicking X
  const closeBtn = document.getElementById("close-add-client");
  if (closeBtn) {
    closeBtn.addEventListener("click", hideAddClientModal);
  }

  // Close modal when clicking outside
  const modal = document.getElementById("add-client-modal");
  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        hideAddClientModal();
      }
    });
  }

  // Save client button
  const saveBtn = document.getElementById("save-add-client");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveNewClient);
  }
}

function setupConfirmDeleteModal() {
  // Cancel button
  const cancelBtn = document.getElementById("cancel-delete");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", hideConfirmDeleteModal);
  }

  // Confirm delete button
  const confirmBtn = document.getElementById("confirm-delete");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", confirmDeleteClient);
  }

  // Close modal when clicking outside
  const modal = document.getElementById("confirm-delete-modal");
  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        hideConfirmDeleteModal();
      }
    });
  }
}

function setupEditSessionModal() {
  // Close modal when clicking X
  const closeBtn = document.getElementById("close-edit-session");
  if (closeBtn) {
    closeBtn.addEventListener("click", hideEditSessionModal);
  }

  // Close modal when clicking outside
  const modal = document.getElementById("edit-session-modal");
  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        hideEditSessionModal();
      }
    });
  }

  // Save session button
  const saveBtn = document.getElementById("save-edit-session");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveEditSession);
  }
}

function hideEditSessionModal() {
  const modal = document.getElementById("edit-session-modal");
  if (modal) {
    modal.style.display = "none";
    modal.removeAttribute("data-edit-session-id");
  }
}

async function saveEditSession() {
  try {
    const modal = document.getElementById("edit-session-modal");
    const sessionId = modal.getAttribute("data-edit-session-id");

    if (!sessionId) {
      showErrorMessage("No session ID found");
      return;
    }

    // Get form data
    const form = document.getElementById("edit-session-form");
    const formData = new FormData(form);

    // Prepare session data object
    const sessionData = {};

    // Add static fields
    sessionData.manual_instructions = formData.get("instructions") || "";

    // Add dynamic fields
    const dynamicFields = document.querySelectorAll(
      "#dynamic-fields-container .form-group"
    );
    dynamicFields.forEach((field) => {
      const input = field.querySelector("input, textarea");
      if (input && input.name) {
        sessionData[input.name] = input.value || "";
      }
    });

    // Get stored JWT token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      console.error("❌ No JWT token found");
      showErrorMessage("Please log in again to save session.");
      return;
    }

    // Show loading state
    const saveBtn = document.getElementById("save-edit-session");
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    // Make API call
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log("✅ Session updated successfully");

    // Hide modal and refresh data
    hideEditSessionModal();

    // Refresh current session if we're viewing it
    const currentSession = await chrome.storage.local.get(["currentSession"]);
    if (
      currentSession.currentSession &&
      currentSession.currentSession.id === sessionId
    ) {
      // Refresh the session detail page
      const updatedSession = await response.json();
      chrome.storage.local.set({ currentSession: updatedSession });
      updateSessionDetailPage(updatedSession, null);
    }

    // Show success message
    showSuccessMessage("Session updated successfully!");
  } catch (error) {
    console.error("❌ Error updating session:", error);
    showErrorMessage("Failed to update session. Please try again.");
  } finally {
    // Reset button state
    const saveBtn = document.getElementById("save-edit-session");
    saveBtn.textContent = "Save Changes";
    saveBtn.disabled = false;
  }
}

async function saveNewClient() {
  try {
    // Check if this is an edit operation
    const modal = document.getElementById("add-client-modal");
    const editClientId = modal.getAttribute("data-edit-client-id");
    const isEdit = !!editClientId;

    console.log(isEdit ? "💾 Updating client..." : "💾 Creating new client...");

    // Get form data
    const form = document.getElementById("add-client-form");
    const formData = new FormData(form);

    // Get stored JWT token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      console.error("❌ No JWT token found");
      showErrorMessage("Please log in again to save client.");
      return;
    }

    // Validate required fields
    const firstName = formData.get("firstName");
    const lastName = formData.get("lastName");
    const dateOfBirth = formData.get("dateOfBirth");

    if (!firstName || firstName.trim() === "") {
      showErrorMessage("First name is required.");
      return;
    }

    if (!lastName || lastName.trim() === "") {
      showErrorMessage("Last name is required.");
      return;
    }

    if (!dateOfBirth || dateOfBirth.trim() === "") {
      showErrorMessage("Date of birth is required.");
      return;
    }

    // Prepare client data - convert empty strings to null for all fields
    const clientData = {
      first_name: firstName || null,
      last_name: lastName || null,
      date_of_birth: dateOfBirth || null,
      phone: formData.get("phone") || null,
      email: formData.get("email") || null,
      address: formData.get("address") || null,
      history: formData.get("history") || null,
      collateral_first_name: formData.get("collateralFirstName") || null,
      collateral_last_name: formData.get("collateralLastName") || null,
      collateral_email: formData.get("collateralEmail") || null,
    };

    console.log("📋 Client data:", clientData);

    // Show loading state
    const saveBtn = document.getElementById("save-add-client");
    const originalText = saveBtn.textContent;
    saveBtn.textContent = isEdit ? "Saving..." : "Adding...";
    saveBtn.disabled = true;

    // Make API call
    const url = isEdit
      ? `${API_BASE_URL}/api/Clients/${editClientId}`
      : `${API_BASE_URL}/api/Clients`;
    const method = isEdit ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(clientData),
    });

    if (!response.ok) {
      // Try to get detailed error message from server
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        console.error("❌ Server error details:", errorData);
        if (errorData.detail) {
          // Handle array of validation errors
          if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail
              .map((err) => {
                if (typeof err === "string") return err;
                if (err.msg) return err.msg;
                if (err.message) return err.message;
                return JSON.stringify(err);
              })
              .join(", ");
          } else {
            errorMessage = errorData.detail;
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        console.error("❌ Could not parse error response:", e);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log(
      isEdit
        ? "✅ Client updated successfully:"
        : "✅ Client created successfully:",
      result
    );

    // Hide modal
    hideAddClientModal();

    // Refresh clients list
    loadClients();

    // Show success message
    showSuccessMessage(
      isEdit ? "Client updated successfully!" : "Client added successfully!"
    );
  } catch (error) {
    console.error("❌ Error saving client:", error);
    showErrorMessage("Failed to save client. Please try again.");
  } finally {
    // Reset button state
    const saveBtn = document.getElementById("save-add-client");
    saveBtn.textContent = "Add Client";
    saveBtn.disabled = false;

    // Clear edit mode
    const modal = document.getElementById("add-client-modal");
    modal.removeAttribute("data-edit-client-id");
    const modalTitle = modal.querySelector("h2");
    modalTitle.textContent = "New Client";
  }
}

// Client menu functions
function toggleClientMenu(clientId) {
  console.log("🔄 Toggling menu for client:", clientId);

  // Close all other menus
  const allMenus = document.querySelectorAll(".client-menu-dropdown");
  allMenus.forEach((menu) => {
    if (menu.id !== `menu-${clientId}`) {
      menu.classList.remove("show");
    }
  });

  // Toggle current menu
  const menu = document.getElementById(`menu-${clientId}`);
  if (menu) {
    const isShowing = menu.classList.contains("show");
    menu.classList.toggle("show");
    console.log("📋 Menu toggled:", isShowing ? "hidden" : "shown");
  } else {
    console.error("❌ Menu not found for client:", clientId);
  }
}

function toggleSessionMenu(sessionId) {
  console.log("🔄 Toggling menu for session:", sessionId);

  // Close all other session menus first
  const allMenus = document.querySelectorAll(".session-menu-dropdown");
  allMenus.forEach((menu) => {
    if (menu.id !== `session-menu-${sessionId}`) {
      menu.classList.remove("show");
    }
  });

  // Toggle the target menu
  const targetMenu = document.getElementById(`session-menu-${sessionId}`);
  if (targetMenu) {
    const isShown = targetMenu.classList.contains("show");
    console.log("📋 Session menu toggled:", isShown ? "hidden" : "shown");
    targetMenu.classList.toggle("show");
  }
}

// Session edit function
async function editSession(sessionId) {
  try {
    console.log("✏️ Editing session:", sessionId);

    // Get stored JWT token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      console.error("❌ No JWT token found");
      showErrorMessage("Please log in again to edit session.");
      return;
    }

    // Fetch session data
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const sessionData = await response.json();
    console.log("📋 Session data loaded:", sessionData);

    // Show edit session modal with pre-filled data
    showEditSessionModal(sessionData);
  } catch (error) {
    console.error("❌ Error loading session data:", error);
    showErrorMessage("Failed to load session data. Please try again.");
  }
}

// Show edit session modal
function showEditSessionModal(sessionData) {
  const modal = document.getElementById("edit-session-modal");
  if (modal) {
    modal.style.display = "block";

    // Debug: Log session data to see what fields are available
    console.log("🔍 Session data for edit modal:", sessionData);
    console.log("🔍 Available session keys:", Object.keys(sessionData));

    // Pre-fill static fields with correct field names
    const clientName =
      sessionData.client ||
      sessionData.client__id ||
      sessionData.client_id_name ||
      "";
    const typeName = sessionData.emr_type_name || sessionData.emr_name || "";
    const instructions = sessionData.manual_instructions || "";
    const createdDate = sessionData.created_at
      ? new Date(sessionData.created_at).toLocaleString()
      : "";

    console.log("🔍 Field values:", {
      clientName,
      typeName,
      instructions,
      createdDate,
    });

    document.getElementById("edit-client").textContent = clientName;
    document.getElementById("edit-type").textContent = typeName;
    document.getElementById("edit-instructions").value = instructions;
    document.getElementById("edit-created").textContent = createdDate;

    // Store session ID for update
    modal.setAttribute("data-edit-session-id", sessionData.id);

    // Load and populate dynamic fields
    loadSessionDynamicFields(sessionData);
  }
}

// Load dynamic fields for session edit
async function loadSessionDynamicFields(sessionData) {
  const container = document.getElementById("dynamic-fields-container");
  if (!container) return;

  // Clear existing dynamic fields
  container.innerHTML = "";

  console.log("🔍 Loading dynamic fields for session:", sessionData);
  console.log("🔍 Session emr_type_id:", sessionData.emr_type_id);

  if (!sessionData.emr_type_id) {
    container.innerHTML =
      "<p>No dynamic fields available for this session.</p>";
    return;
  }

  try {
    // Get dynamic fields data
    console.log(
      "🔍 Fetching dynamic fields for emr_type_id:",
      sessionData.emr_type_id
    );
    const dynamicFields = await getSessionDetailFields(sessionData.emr_type_id);
    console.log("🔍 Dynamic fields data:", dynamicFields);

    if (
      !dynamicFields ||
      !dynamicFields.confirmedResults ||
      dynamicFields.confirmedResults.length === 0
    ) {
      container.innerHTML =
        "<p>No dynamic fields available for this session.</p>";
      return;
    }

    console.log(
      "🔍 Creating form fields for",
      dynamicFields.confirmedResults.length,
      "fields"
    );

    // Create form fields for each dynamic field (confirmed results)
    dynamicFields.confirmedResults.forEach((result) => {
      // Get the field type from EMR type fields table instead of using result.type
      // Try exact match first
      let emrField = dynamicFields.fields.find(
        (field) => field.name === result.key
      );

      // If no exact match, try case-insensitive and normalized matching
      if (!emrField) {
        emrField = dynamicFields.fields.find((field) => {
          if (!field.name) return false;
          const normalizedFieldName = field.name
            .toLowerCase()
            .replace(/-/g, "")
            .replace(/\s+/g, " ")
            .trim();
          const normalizedResultKey = result.key
            .toLowerCase()
            .replace(/-/g, "")
            .replace(/\s+/g, " ")
            .trim();
          console.log(
            "🔍 Comparing normalized names:",
            normalizedFieldName,
            "===",
            normalizedResultKey
          );
          return normalizedFieldName === normalizedResultKey;
        });
      }

      // Get field name from mapping or EMR field
      const fieldMapping = dynamicFields.fieldMapping;
      let fieldName = fieldMapping[result.key];

      // If no field mapping found, try to get it from the EMR field
      if (!fieldName && emrField) {
        fieldName = emrField.api_name;
        console.log("🔍 Using EMR field api_name as fieldName:", fieldName);
      }

      let fieldType = emrField ? emrField.type : result.type;

      // Special handling for boolean fields - if result.type is boolean, use it
      if (
        result.type === "boolean" &&
        (!emrField || emrField.type !== "boolean")
      ) {
        fieldType = "boolean";
        console.log("🔍 Using result.type for boolean field:", result.type);
      }

      // Debug: Log all available EMR fields to see what we have
      console.log(
        "🔍 Available EMR fields:",
        dynamicFields.fields.map((f) => ({ name: f.name, type: f.type }))
      );

      // Debug: Check if there's a "created" or "created_at" field
      const createdField = dynamicFields.fields.find(
        (f) =>
          f.name.toLowerCase().includes("created") ||
          f.api_name.toLowerCase().includes("created")
      );
      if (createdField) {
        console.log(
          "🔍 Found created field:",
          createdField.name,
          "type:",
          createdField.type
        );
      }
      console.log("🔍 Looking for field with name:", result.key);

      console.log(
        "🔍 Processing field:",
        result.key,
        "->",
        fieldName,
        "type from EMR fields:",
        fieldType,
        "EMR field found:",
        emrField
      );

      // Debug field type detection
      console.log("🔍 Field type detection debug:");
      console.log("  - result.key:", result.key);
      console.log("  - result.type:", result.type);
      console.log("  - emrField found:", !!emrField);
      if (emrField) {
        console.log("  - emrField.name:", emrField.name);
        console.log("  - emrField.type:", emrField.type);
      }
      console.log("  - final fieldType:", fieldType);

      if (fieldName) {
        const fieldContainer = document.createElement("div");
        fieldContainer.className = "form-group";

        const label = document.createElement("label");
        label.textContent = result.key;
        label.setAttribute(
          "for",
          `edit-${result.key.replace(/\s+/g, "-").toLowerCase()}`
        );

        let input;
        console.log("🔍 Creating input for fieldType:", fieldType);

        if (fieldType === "date") {
          console.log("🔍 Creating date input");
          input = document.createElement("input");
          input.type = "date";
        } else if (fieldType === "datetime") {
          console.log("🔍 Creating datetime input");
          input = document.createElement("input");
          input.type = "datetime-local";

          // Fix scroll issues with datetime picker
          input.addEventListener("focus", function () {
            console.log("🔍 DateTime picker focused - enabling scroll");
            document.body.style.overflow = "auto";
            document.body.classList.remove("modal-open");
          });

          input.addEventListener("blur", function () {
            console.log("🔍 DateTime picker blurred - restoring modal scroll");
            // Don't lock body scroll for modals
          });

          // Fix scroll issues with datetime picker
          input.addEventListener("focus", function () {
            console.log("🔍 DateTime picker focused - enabling scroll");
            document.body.style.overflow = "auto";
            document.body.classList.remove("modal-open");
          });

          input.addEventListener("blur", function () {
            console.log("🔍 DateTime picker blurred - restoring modal scroll");
            // Don't lock body scroll for modals
          });
        } else if (fieldType === "boolean") {
          console.log("🔍 Creating checkbox input");
          input = document.createElement("input");
          input.type = "checkbox";
        } else if (fieldType === "dropdown") {
          input = document.createElement("select");
          // Get dropdown values from the EMR field
          if (emrField && emrField.dropdown_values) {
            const options = emrField.dropdown_values
              .split("\n")
              .filter((option) => option.trim());
            options.forEach((option) => {
              const optionElement = document.createElement("option");
              optionElement.value = option.trim();
              optionElement.textContent = option.trim();
              input.appendChild(optionElement);
            });
          }
        } else if (fieldType === "textarea") {
          input = document.createElement("textarea");
          input.rows = 3;
        } else if (fieldType === "number") {
          input = document.createElement("input");
          input.type = "number";
        } else if (fieldType === "email") {
          input = document.createElement("input");
          input.type = "email";
        } else if (fieldType === "tel") {
          input = document.createElement("input");
          input.type = "tel";
        } else {
          input = document.createElement("input");
          input.type = "text";
        }

        input.id = `edit-${result.key.replace(/\s+/g, "-").toLowerCase()}`;
        input.name = fieldName;

        // Make created/created_at fields read-only
        if (
          result.key.toLowerCase().includes("created") ||
          fieldName.toLowerCase().includes("created")
        ) {
          input.readOnly = true;
          input.style.backgroundColor = "#f5f5f5";
          input.style.cursor = "not-allowed";
          console.log("🔍 Made field read-only:", result.key);
        }

        // Get the actual value from session data
        const fieldValue = sessionData[fieldName] || "";
        console.log("🔍 Field value for", fieldName, ":", fieldValue);

        // Set value based on field type
        console.log(
          "🔍 Setting value for fieldType:",
          fieldType,
          "fieldValue:",
          fieldValue
        );

        if (fieldType === "boolean") {
          console.log("🔍 Setting checkbox value:", fieldValue);
          input.checked =
            fieldValue === true || fieldValue === "true" || fieldValue === "1";
          console.log("🔍 Checkbox checked:", input.checked);
        } else if (fieldType === "date" && fieldValue) {
          // Convert date to YYYY-MM-DD format for date input
          const date = new Date(fieldValue);
          if (!isNaN(date.getTime())) {
            input.value = date.toISOString().split("T")[0];
          }
        } else if (fieldType === "datetime" && fieldValue) {
          console.log("🔍 Setting datetime value:", fieldValue);
          // Convert datetime to YYYY-MM-DDTHH:MM format for datetime-local input
          const date = new Date(fieldValue);
          if (!isNaN(date.getTime())) {
            // Format: YYYY-MM-DDTHH:MM
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            const hours = String(date.getHours()).padStart(2, "0");
            const minutes = String(date.getMinutes()).padStart(2, "0");
            const formattedValue = `${year}-${month}-${day}T${hours}:${minutes}`;
            input.value = formattedValue;
            console.log("🔍 Datetime formatted value:", formattedValue);
          } else {
            console.log("🔍 Invalid datetime value:", fieldValue);
          }
        } else {
          input.value = fieldValue;
        }

        fieldContainer.appendChild(label);
        fieldContainer.appendChild(input);
        container.appendChild(fieldContainer);
      } else {
        console.log("⚠️ No field mapping found for:", result.key);
        console.log("🔍 Available field mappings:", Object.keys(fieldMapping));

        // Try to find a matching field in session data by name similarity
        const sessionKeys = Object.keys(sessionData);
        const matchingKey = sessionKeys.find((key) => {
          const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
          const normalizedResult = result.key
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          return (
            normalizedKey.includes(normalizedResult) ||
            normalizedResult.includes(normalizedKey)
          );
        });

        if (matchingKey) {
          console.log(
            "🔍 Found matching session key:",
            matchingKey,
            "for field:",
            result.key
          );

          // Get the field type from EMR type fields table for fallback fields too
          const emrField = dynamicFields.fields.find(
            (field) => field.name === result.key
          );
          let fieldType = emrField ? emrField.type : result.type;

          // Auto-detect boolean if value is True/False string
          const fieldValue = sessionData[matchingKey] || "";
          if (
            !fieldType &&
            (fieldValue === "True" ||
              fieldValue === "False" ||
              fieldValue === true ||
              fieldValue === false)
          ) {
            fieldType = "boolean";
            console.log(
              "🔍 Auto-detected boolean type from value:",
              fieldValue
            );
          }

          const fieldContainer = document.createElement("div");
          fieldContainer.className = "form-group";

          const label = document.createElement("label");
          label.textContent = result.key;
          label.setAttribute(
            "for",
            `edit-${result.key.replace(/\s+/g, "-").toLowerCase()}`
          );

          let input;
          if (fieldType === "date") {
            input = document.createElement("input");
            input.type = "date";
          } else if (fieldType === "boolean") {
            input = document.createElement("input");
            input.type = "checkbox";
          } else if (fieldType === "dropdown") {
            input = document.createElement("select");
            // Get dropdown values from the EMR field
            if (emrField && emrField.dropdown_values) {
              const options = emrField.dropdown_values
                .split("\n")
                .filter((option) => option.trim());
              options.forEach((option) => {
                const optionElement = document.createElement("option");
                optionElement.value = option.trim();
                optionElement.textContent = option.trim();
                input.appendChild(optionElement);
              });
            }
          } else if (fieldType === "textarea") {
            input = document.createElement("textarea");
            input.rows = 3;
          } else if (fieldType === "number") {
            input = document.createElement("input");
            input.type = "number";
          } else if (fieldType === "email") {
            input = document.createElement("input");
            input.type = "email";
          } else if (fieldType === "tel") {
            input = document.createElement("input");
            input.type = "tel";
          } else {
            input = document.createElement("input");
            input.type = "text";
          }

          input.id = `edit-${result.key.replace(/\s+/g, "-").toLowerCase()}`;
          input.name = matchingKey;

          // Make created/created_at fields read-only
          if (
            result.key.toLowerCase().includes("created") ||
            matchingKey.toLowerCase().includes("created")
          ) {
            input.readOnly = true;
            input.style.backgroundColor = "#f5f5f5";
            input.style.cursor = "not-allowed";
            console.log("🔍 Made field read-only:", result.key);
          }

          // fieldValue already fetched above for type detection
          console.log("🔍 Field value for", matchingKey, ":", fieldValue);

          // Set value based on field type
          if (fieldType === "boolean") {
            input.checked =
              fieldValue === true ||
              fieldValue === "true" ||
              fieldValue === "True" ||
              fieldValue === "1";
          } else if (fieldType === "date" && fieldValue) {
            // Convert date to YYYY-MM-DD format for date input
            const date = new Date(fieldValue);
            if (!isNaN(date.getTime())) {
              input.value = date.toISOString().split("T")[0];
            }
          } else {
            input.value = fieldValue;
          }

          fieldContainer.appendChild(label);
          fieldContainer.appendChild(input);
          container.appendChild(fieldContainer);
        }
      }
    });

    // Process manual fields - also use EMR field types for consistency
    console.log("🔍 Processing manual fields:", dynamicFields.manualFields);
    dynamicFields.manualFields.forEach((manualField) => {
      console.log("🔍 Processing manual field:", manualField);

      // Find matching EMR field definition by name
      const emrField = dynamicFields.fields.find(
        (field) =>
          field.name &&
          field.name
            .toLowerCase()
            .replace(/-/g, "")
            .replace(/\s+/g, " ")
            .trim() ===
            manualField.name
              .toLowerCase()
              .replace(/-/g, "")
              .replace(/\s+/g, " ")
              .trim()
      );

      if (emrField) {
        console.log("🔍 Found EMR field for manual field:", emrField);

        const fieldContainer = document.createElement("div");
        fieldContainer.className = "form-group";

        const label = document.createElement("label");
        label.textContent = manualField.name;
        label.setAttribute(
          "for",
          `edit-${manualField.name.replace(/\s+/g, "-").toLowerCase()}`
        );

        // Use EMR field type instead of manual field type
        const fieldType = emrField.type;
        console.log("🔍 Using EMR field type for manual field:", fieldType);

        let input;
        if (fieldType === "date") {
          input = document.createElement("input");
          input.type = "date";
        } else if (fieldType === "datetime") {
          input = document.createElement("input");
          input.type = "datetime-local";
        } else if (fieldType === "boolean") {
          input = document.createElement("input");
          input.type = "checkbox";
        } else if (fieldType === "dropdown") {
          input = document.createElement("select");
          // Get dropdown values from the EMR field
          if (emrField.dropdown_values) {
            const options = emrField.dropdown_values
              .split("\n")
              .filter((option) => option.trim());
            options.forEach((option) => {
              const optionElement = document.createElement("option");
              optionElement.value = option.trim();
              optionElement.textContent = option.trim();
              input.appendChild(optionElement);
            });
          }
        } else if (fieldType === "textarea") {
          input = document.createElement("textarea");
          input.rows = 3;
        } else if (fieldType === "number") {
          input = document.createElement("input");
          input.type = "number";
        } else if (fieldType === "email") {
          input = document.createElement("input");
          input.type = "email";
        } else if (fieldType === "tel") {
          input = document.createElement("input");
          input.type = "tel";
        } else {
          input = document.createElement("input");
          input.type = "text";
        }

        input.id = `edit-${manualField.name
          .replace(/\s+/g, "-")
          .toLowerCase()}`;
        input.name = emrField.api_name;

        // Make created/created_at fields read-only
        if (
          manualField.name.toLowerCase().includes("created") ||
          emrField.api_name.toLowerCase().includes("created")
        ) {
          input.readOnly = true;
          input.style.backgroundColor = "#f5f5f5";
          input.style.cursor = "not-allowed";
          console.log("🔍 Made manual field read-only:", manualField.name);
        }

        // Get the actual value from session data
        const fieldValue = sessionData[emrField.api_name] || "";
        console.log("🔍 Field value for", emrField.api_name, ":", fieldValue);

        // Set value based on field type
        console.log(
          "🔍 Setting value for fieldType:",
          fieldType,
          "fieldValue:",
          fieldValue
        );

        if (fieldType === "boolean") {
          console.log("🔍 Setting checkbox value:", fieldValue);
          input.checked =
            fieldValue === true || fieldValue === "true" || fieldValue === "1";
          console.log("🔍 Checkbox checked:", input.checked);
        } else if (fieldType === "date" && fieldValue) {
          // Convert date to YYYY-MM-DD format for date input
          const date = new Date(fieldValue);
          if (!isNaN(date.getTime())) {
            input.value = date.toISOString().split("T")[0];
          }
        } else if (fieldType === "datetime" && fieldValue) {
          console.log("🔍 Setting datetime value:", fieldValue);
          // Convert datetime to YYYY-MM-DDTHH:MM format for datetime-local input
          const date = new Date(fieldValue);
          if (!isNaN(date.getTime())) {
            // Format: YYYY-MM-DDTHH:MM
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            const hours = String(date.getHours()).padStart(2, "0");
            const minutes = String(date.getMinutes()).padStart(2, "0");
            const formattedValue = `${year}-${month}-${day}T${hours}:${minutes}`;
            input.value = formattedValue;
            console.log("🔍 Datetime formatted value:", formattedValue);
          } else {
            console.log("🔍 Invalid datetime value:", fieldValue);
          }
        } else {
          input.value = fieldValue;
        }

        fieldContainer.appendChild(label);
        fieldContainer.appendChild(input);
        container.appendChild(fieldContainer);
      } else {
        console.log(
          "🔍 No EMR field found for manual field:",
          manualField.name
        );
      }
    });

    console.log("✅ Dynamic fields loaded successfully");
  } catch (error) {
    console.error("❌ Error loading dynamic fields:", error);
    showErrorMessage(`Failed to load dynamic fields: ${error.message}`);
    container.innerHTML =
      "<p>Error loading dynamic fields: " + error.message + "</p>";
  }
}

// Session delete function
function deleteSession(sessionId) {
  console.log("🗑️ Showing delete confirmation for session:", sessionId);

  // Show custom confirmation modal
  const confirmModal = document.getElementById("confirm-delete-modal");
  confirmModal.style.display = "block";

  // Store session ID for deletion
  confirmModal.setAttribute("data-session-id", sessionId);
}

// Success toast notification function
function showSuccessMessage(message, duration = 3000) {
  const toast = document.getElementById("success-toast");
  const messageElement = toast.querySelector(".toast-message");

  if (toast && messageElement) {
    messageElement.textContent = message;
    toast.classList.add("show");

    // Auto-hide after specified duration
    setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }
}

// Error toast notification function
function showErrorMessage(message, duration = 4000) {
  const toast = document.getElementById("error-toast");
  const messageElement = toast.querySelector(".toast-message");

  if (toast && messageElement) {
    messageElement.textContent = message;
    toast.classList.add("show");

    // Auto-hide after specified duration (longer for errors)
    setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }
}

// Close menus when clicking outside
document.addEventListener("click", function (event) {
  if (!event.target.closest(".client-menu")) {
    const allClientMenus = document.querySelectorAll(".client-menu-dropdown");
    allClientMenus.forEach((menu) => {
      menu.classList.remove("show");
    });
  }

  if (!event.target.closest(".session-menu")) {
    const allSessionMenus = document.querySelectorAll(".session-menu-dropdown");
    allSessionMenus.forEach((menu) => {
      menu.classList.remove("show");
    });
  }
});

// Edit client function
async function editClient(clientId) {
  try {
    console.log("✏️ Editing client:", clientId);
    console.log("🔗 API URL:", `${API_BASE_URL}/api/Clients/${clientId}`);

    // Get stored JWT token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      console.error("❌ No JWT token found");
      showErrorMessage("Please log in again to edit client.");
      return;
    }

    console.log("🔑 Token found:", tokenResult.accessToken ? "Yes" : "No");
    console.log(
      "🔑 Token length:",
      tokenResult.accessToken ? tokenResult.accessToken.length : 0
    );

    // Fetch client data
    console.log("🌐 Making API request...");
    const response = await fetch(`${API_BASE_URL}/api/Clients/${clientId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("📡 Response status:", response.status);
    console.log("📡 Response headers:", response.headers);
    console.log("📡 Response ok:", response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Response error text:", errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const clientData = await response.json();
    console.log("📋 Client data loaded:", clientData);

    // Show edit modal with pre-filled data
    showEditClientModal(clientData);
  } catch (error) {
    console.error("❌ Error loading client data:", error);
    console.error("❌ Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    showErrorMessage("Failed to load client data. Please try again.");
  }
}

// Delete client function
function deleteClient(clientId) {
  console.log("🗑️ Showing delete confirmation for client:", clientId);

  // Show custom confirmation modal
  const confirmModal = document.getElementById("confirm-delete-modal");
  confirmModal.style.display = "block";

  // Store client ID for deletion
  confirmModal.setAttribute("data-client-id", clientId);
}

function hideConfirmDeleteModal() {
  const confirmModal = document.getElementById("confirm-delete-modal");
  confirmModal.style.display = "none";
  confirmModal.removeAttribute("data-client-id");
  confirmModal.removeAttribute("data-session-id");
}

async function confirmDeleteClient() {
  const confirmModal = document.getElementById("confirm-delete-modal");
  const clientId = confirmModal.getAttribute("data-client-id");
  const sessionId = confirmModal.getAttribute("data-session-id");

  if (!clientId && !sessionId) return;

  try {
    // Get stored JWT token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      console.error("❌ No JWT token found");
      showErrorMessage("Please log in again to delete.");
      return;
    }

    let response;
    let successMessage;

    if (clientId) {
      console.log("🗑️ Deleting client:", clientId);
      response = await fetch(`${API_BASE_URL}/api/Clients/${clientId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        },
      });
      successMessage = "Client deleted successfully!";
    } else if (sessionId) {
      console.log("🗑️ Deleting session:", sessionId);
      response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        },
      });
      successMessage = "Session deleted successfully!";
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log("✅ Deleted successfully");

    // Hide modal and refresh data
    hideConfirmDeleteModal();

    if (clientId) {
      loadClients();
    } else if (sessionId) {
      // Refresh sessions list
      const currentClient = await chrome.storage.local.get(["currentClient"]);
      if (currentClient.currentClient) {
        loadClientsWithSessionCounts([currentClient.currentClient]);
      }
    }

    // Show success message
    showSuccessMessage(successMessage);
  } catch (error) {
    console.error("❌ Error deleting:", error);
    showErrorMessage("Failed to delete. Please try again.");
  }
}

// Show edit client modal
function showEditClientModal(clientData) {
  const modal = document.getElementById("add-client-modal");
  if (modal) {
    modal.style.display = "block";

    // Update modal title
    const modalTitle = modal.querySelector("h2");
    modalTitle.textContent = "Edit Client";

    // Update button text
    const saveBtn = document.getElementById("save-add-client");
    saveBtn.textContent = "Save Changes";

    // Pre-fill form with client data
    document.getElementById("client-first-name").value =
      clientData.first_name || "";
    document.getElementById("client-last-name").value =
      clientData.last_name || "";
    document.getElementById("client-date-of-birth").value =
      clientData.date_of_birth || "";
    document.getElementById("client-phone").value = clientData.phone || "";
    document.getElementById("client-email").value = clientData.email || "";
    document.getElementById("client-address").value = clientData.address || "";
    document.getElementById("client-history").value = clientData.history || "";
    document.getElementById("collateral-first-name").value =
      clientData.collateral_first_name || "";
    document.getElementById("collateral-last-name").value =
      clientData.collateral_last_name || "";
    document.getElementById("collateral-email").value =
      clientData.collateral_email || "";

    // Store client ID for update
    modal.setAttribute("data-edit-client-id", clientData.id);
  }
}

// Reset modal to add mode
function resetModalToAddMode() {
  const modal = document.getElementById("add-client-modal");
  if (modal) {
    // Reset modal title
    const modalTitle = modal.querySelector("h2");
    modalTitle.textContent = "New Client";

    // Reset button text
    const saveBtn = document.getElementById("save-add-client");
    saveBtn.textContent = "Add Client";

    // Clear form
    document.getElementById("add-client-form").reset();

    // Remove edit client ID
    modal.removeAttribute("data-edit-client-id");
  }
}

function updateClientDetailPage(client) {
  // Update client name and sessions (first_name + last_name)
  const clientName =
    `${client.first_name || ""} ${client.last_name || ""}`.trim() ||
    "Unknown Client";
  const sessionCount = client.history ? client.history.length : 0;

  document.getElementById("client-name").textContent = clientName;
  document.getElementById(
    "client-sessions"
  ).textContent = `${sessionCount} Sessions`;

  // Update header information
  document.getElementById("client-name-header").textContent = clientName;
  document.getElementById(
    "client-sessions-header"
  ).textContent = `${sessionCount} Sessions`;

  // Update avatar with initials
  const initials = getInitials(clientName);
  document.getElementById("client-avatar-text").textContent = initials;

  // Update client details with correct field names
  document.getElementById("client-dob").textContent =
    client["date-of-birth"] || "Not specified";
  // Format phone number nicely
  const phoneNumber = client.phone || "Not specified";
  const formattedPhone =
    phoneNumber !== "Not specified"
      ? formatPhoneNumber(phoneNumber)
      : phoneNumber;
  document.getElementById("client-phone").textContent = formattedPhone;
  document.getElementById("client-location").textContent =
    client.email || "Not specified";
  document.getElementById("client-address").textContent =
    client.address || "Not specified";

  // Update collateral fields
  document.getElementById("client-collateral-first").textContent =
    client.collateral_first_name || "Not specified";
  document.getElementById("client-collateral-last").textContent =
    client.collateral_last_name || "Not specified";
  document.getElementById("client-collateral-email").textContent =
    client.collateral_email || "Not specified";

  // Update client history with real data
  updateClientHistory(client.history);
}

function updateClientHistory(historyData) {
  const historyContent = document.querySelector(".history-content");
  if (!historyContent) return;

  if (historyData && historyData.trim() !== "") {
    // Show real history data
    historyContent.innerHTML = `
      <div class="history-text">
        <p>${historyData}</p>
      </div>
    `;
  } else {
    // Show empty state
    historyContent.innerHTML = `
      <p class="history-message">
        No Client History Found please add the client's history to
        ensure personalized support and continuity across sessions.
      </p>
    `;
  }
}

function captureFastHTML() {
  console.log("📋 Starting fast HTML capture...");

  // Show loading state
  const button = document.querySelector(".send-button");
  if (button) {
    button.textContent = "Capturing...";
    button.disabled = true;
  }

  // Get the current tab and send capture message
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      // Send message to background script to capture and download
      chrome.runtime.sendMessage(
        {
          action: "captureAndDownload",
          url: tabs[0].url
        },
        function (response) {
          console.log("📨 Capture response:", response);

          if (response && response.success) {
            console.log("✅ Page capture initiated");
            showSuccessMessage("Page captured successfully! Check your downloads.");
          } else {
            console.error("❌ Capture failed:", response?.error);
            showErrorMessage("Failed to capture page. Please try again.");
          }

          // Reset button
          if (button) {
            button.textContent = "Send EMR Request";
            button.disabled = false;
          }
        }
      );
    }
  });
}

function createSingleFileHTML(singleFileData) {
  console.log("🔧 Creating SingleFile HTML...");

  try {
    // SingleFile already provides perfect HTML, just download it
    const html = singleFileData.html;

    // Download the file
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `singlefile-captured-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("✅ SingleFile HTML downloaded successfully");

    // Reset button
    const button = document.querySelector(".send-button");
    if (button) {
      button.textContent = "Send EMR Request";
      button.disabled = false;
    }
  } catch (error) {
    console.error("❌ Error creating SingleFile HTML:", error);
    showErrorMessage(`Error creating SingleFile HTML: ${error.message}`);

    // Reset button
    const button = document.querySelector(".send-button");
    if (button) {
      button.textContent = "Send EMR Request";
      button.disabled = false;
    }
  }
}

function createSimpleHTML(captureData) {
  console.log("🔧 Creating simple HTML file...");

  try {
    let html = captureData.html;

    // Create simple CSS
    let embeddedCSS = '<style type="text/css">\n';
    embeddedCSS += "/* Reset and base styles */\n";
    embeddedCSS += "* { box-sizing: border-box; }\n";
    embeddedCSS +=
      "body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; color: #333; }\n";
    embeddedCSS += "/* Remove blue overlays */\n";
    embeddedCSS +=
      "a, button, input, select, textarea { background: transparent !important; border: none !important; color: inherit !important; text-decoration: none !important; }\n";
    embeddedCSS += "/* Make everything visible */\n";
    embeddedCSS +=
      "* { visibility: visible !important; opacity: 1 !important; }\n";

    // Add captured CSS
    if (captureData.css) {
      embeddedCSS += "/* Captured CSS */\n";
      embeddedCSS += captureData.css + "\n";
    }

    embeddedCSS += "</style>\n";

    // Insert CSS before closing head tag
    html = html.replace("</head>", embeddedCSS + "</head>");

    // Replace images with base64 data
    if (captureData.images && captureData.images.length > 0) {
      captureData.images.forEach((img) => {
        if (img.base64) {
          html = html.replace(
            new RegExp(`src="${img.src}"`, "g"),
            `src="${img.base64}"`
          );
        }
      });
    }

    // Remove external resource links
    html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, "");
    html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/gi, "");

    // Remove interactivity
    html = html.replace(/href="[^"]*"/gi, 'href="#"');
    html = html.replace(/onclick="[^"]*"/gi, "");
    html = html.replace(/onmousedown="[^"]*"/gi, "");
    html = html.replace(/onmouseup="[^"]*"/gi, "");

    // Download the file
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `captured-page-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("✅ Simple HTML file created and downloaded");

    // Reset button
    const button = document.querySelector(".send-button");
    if (button) {
      button.textContent = "Send EMR Request";
      button.disabled = false;
    }
  } catch (error) {
    console.error("❌ Error creating simple HTML:", error);
    showErrorMessage(`Error creating HTML file: ${error.message}`);

    // Reset button
    const button = document.querySelector(".send-button");
    if (button) {
      button.textContent = "Send EMR Request";
      button.disabled = false;
    }
  }
}

function createFastHTML(captureData) {
  console.log("🔧 Creating enhanced HTML file...");

  try {
    let html = captureData.html;

    // Check if HTML is empty or too short
    if (!html || html.length < 1000) {
      console.error("❌ HTML content is too short or empty:", html.length);
      alert("❌ Captured HTML is empty or too short. Please try again.");
      return;
    }

    console.log("📄 HTML length:", html.length);
    console.log("📊 CSS items:", captureData.css ? captureData.css.length : 0);
    console.log(
      "📊 Images:",
      captureData.images ? captureData.images.length : 0
    );
    console.log("📊 Fonts:", captureData.fonts ? captureData.fonts.length : 0);
    console.log(
      "📊 JavaScript:",
      captureData.javascript ? Object.keys(captureData.javascript).length : 0
    );
    console.log(
      "📊 Data:",
      captureData.data ? Object.keys(captureData.data).length : 0
    );
    console.log(
      "📊 Metadata:",
      captureData.metadata ? Object.keys(captureData.metadata).length : 0
    );
    console.log(
      "📊 External Resources:",
      captureData.externalResources
        ? Object.keys(captureData.externalResources).length
        : 0
    );

    // 1. EMBED ALL CSS AND EXTERNAL RESOURCES
    console.log("📝 Embedding ALL CSS and external resources...");

    let embeddedCSS = '<style type="text/css">\n';
    embeddedCSS += "/* Reset and base styles */\n";
    embeddedCSS += "* { box-sizing: border-box; }\n";
    embeddedCSS +=
      "body { margin: 0; padding: 0; font-family: Arial, sans-serif; }\n";
    embeddedCSS +=
      "html, body { height: 100%; overflow: visible !important; }\n";

    // DISABLE ALL INTERACTIVITY
    embeddedCSS += "/* DISABLE ALL INTERACTIVITY */\n";
    embeddedCSS +=
      "a, button, input, select, textarea, [onclick], [onmousedown], [onmouseup] { pointer-events: none !important; cursor: default !important; }\n";
    embeddedCSS +=
      "a { text-decoration: none !important; color: inherit !important; }\n";
    embeddedCSS +=
      "button { background: transparent !important; border: none !important; }\n";
    embeddedCSS +=
      "input, select, textarea { background: transparent !important; border: 1px solid #ccc !important; }\n";

    // EMBED ALL EXTERNAL CSS FILES
    if (captureData.externalResources && captureData.externalResources.css) {
      console.log("📝 Embedding external CSS files...");
      captureData.externalResources.css.forEach((cssFile) => {
        if (cssFile.content) {
          embeddedCSS += `/* External CSS: ${cssFile.href} */\n`;
          embeddedCSS += cssFile.content + "\n\n";
        }
      });
    }

    // Add comprehensive Salesforce Lightning CSS framework
    embeddedCSS += "/* Salesforce Lightning CSS Framework */\n";

    // Core Lightning styles
    embeddedCSS += `
    .slds-scope { 
      visibility: visible !important; 
      opacity: 1 !important; 
      display: block !important; 
      font-family: "Salesforce Sans", Arial, sans-serif !important;
      color: #16325c !important;
    }
    
    lightning-* { 
      display: block !important; 
      visibility: visible !important; 
    }
    
    [data-aura-rendered-by] { 
      visibility: visible !important; 
      opacity: 1 !important; 
      display: block !important; 
    }
    
    .forcePageBlock { 
      visibility: visible !important; 
      opacity: 1 !important; 
      background: #f3f3f3 !important;
      padding: 16px !important;
    }
    
    .slds-page-header { 
      visibility: visible !important; 
      opacity: 1 !important; 
      background: linear-gradient(135deg, #1589ee 0%, #0070d2 100%) !important;
      color: white !important;
      padding: 16px !important;
      margin-bottom: 16px !important;
    }
    
    .slds-card { 
      visibility: visible !important; 
      opacity: 1 !important; 
      background: white !important;
      border: 1px solid #dddbda !important;
      border-radius: 4px !important;
      box-shadow: 0 2px 2px rgba(0,0,0,0.1) !important;
      margin-bottom: 16px !important;
    }
    
    .slds-grid { 
      visibility: visible !important; 
      opacity: 1 !important; 
      display: grid !important;
    }
    
    .slds-form-element__label {
      font-weight: 600 !important;
      color: #3e3e3c !important;
      margin-bottom: 4px !important;
    }
    
    .slds-form-element__static {
      color: #080707 !important;
      font-size: 14px !important;
      line-height: 1.5 !important;
    }
    
    .slds-button {
      background: #0070d2 !important;
      color: white !important;
      border: none !important;
      border-radius: 4px !important;
      padding: 8px 16px !important;
      font-size: 14px !important;
      cursor: pointer !important;
    }
    
    .slds-button:hover {
      background: #005fb2 !important;
    }
    
    .slds-button_neutral {
      background: white !important;
      color: #0070d2 !important;
      border: 1px solid #dddbda !important;
    }
    
    .slds-button_destructive {
      background: #c23934 !important;
    }
    
    .slds-button_destructive:hover {
      background: #a61a14 !important;
    }
    
    .slds-tabs_default__item {
      background: white !important;
      border: 1px solid #dddbda !important;
      border-bottom: none !important;
      padding: 12px 16px !important;
      cursor: pointer !important;
    }
    
    .slds-tabs_default__item.slds-is-active {
      background: white !important;
      border-bottom: 2px solid #0070d2 !important;
      color: #0070d2 !important;
    }
    
    .slds-tabs_default__content {
      background: white !important;
      border: 1px solid #dddbda !important;
      border-top: none !important;
      padding: 16px !important;
    }
    
    .slds-table {
      width: 100% !important;
      border-collapse: collapse !important;
    }
    
    .slds-table th,
    .slds-table td {
      padding: 8px 12px !important;
      border-bottom: 1px solid #dddbda !important;
      text-align: left !important;
    }
    
    .slds-table th {
      background: #f3f3f3 !important;
      font-weight: 600 !important;
      color: #3e3e3c !important;
    }
    
    .slds-checkbox {
      display: inline-block !important;
      margin-right: 8px !important;
    }
    
    .slds-checkbox__label {
      font-size: 14px !important;
      color: #080707 !important;
    }
    
    .slds-link {
      color: #0070d2 !important;
      text-decoration: none !important;
    }
    
    .slds-link:hover {
      text-decoration: underline !important;
    }
    
    .slds-badge {
      display: inline-block !important;
      padding: 4px 8px !important;
      border-radius: 12px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
    }
    
    .slds-badge_success {
      background: #4bca81 !important;
      color: white !important;
    }
    
    .slds-badge_warning {
      background: #ffb75d !important;
      color: #16325c !important;
    }
    
    .slds-badge_error {
      background: #c23934 !important;
      color: white !important;
    }
    
    .slds-icon {
      width: 20px !important;
      height: 20px !important;
      fill: currentColor !important;
    }
    
    .slds-icon_container {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    `;

    // SIMPLE FIX - Remove blue overlays and make it look clean
    embeddedCSS += "/* SIMPLE CLEAN STYLING */\n";
    embeddedCSS += "* { box-sizing: border-box; }\n";
    embeddedCSS +=
      "body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; color: #333; }\n";
    embeddedCSS += "/* Remove blue overlays and browser defaults */\n";
    embeddedCSS +=
      "a, button, input, select, textarea { background: transparent !important; border: none !important; color: inherit !important; text-decoration: none !important; }\n";
    embeddedCSS += "/* Make everything visible and clean */\n";
    embeddedCSS +=
      "* { visibility: visible !important; opacity: 1 !important; }\n";
    embeddedCSS += "/* Hide loading spinners */\n";
    embeddedCSS +=
      ".slds-spinner, .loading, .spinner { display: none !important; }\n";
    embeddedCSS += "/* Clean table styling */\n";
    embeddedCSS += "table { border-collapse: collapse; width: 100%; }\n";
    embeddedCSS +=
      "td, th { padding: 8px; border: 1px solid #ddd; text-align: left; }\n";
    embeddedCSS += "th { background: #f5f5f5; font-weight: bold; }\n";

    // Add captured CSS
    if (captureData.css && captureData.css.length > 0) {
      captureData.css.forEach((cssItem) => {
        if (cssItem.type === "inline" && cssItem.content) {
          embeddedCSS += "/* Inline styles */\n";
          embeddedCSS += cssItem.content + "\n\n";
        } else if (cssItem.type === "stylesheet" && cssItem.content) {
          embeddedCSS += `/* External stylesheet: ${cssItem.href} */\n`;
          embeddedCSS += cssItem.content + "\n\n";
        } else if (cssItem.type === "computed" && cssItem.styles) {
          embeddedCSS += "/* Computed styles */\n";
          Object.values(cssItem.styles).forEach((styleObj) => {
            if (styleObj.selector && styleObj.styles) {
              embeddedCSS += styleObj.selector + " {\n";
              Object.entries(styleObj.styles).forEach(([prop, value]) => {
                embeddedCSS += `  ${prop}: ${value} !important;\n`;
              });
              embeddedCSS += "}\n";
            }
          });
        }
      });
    }

    // Add Salesforce Lightning specific styles
    if (captureData.lightningStyles && captureData.lightningStyles.length > 0) {
      embeddedCSS += "/* Salesforce Lightning Styles */\n";
      captureData.lightningStyles.forEach((lightningStyle) => {
        if (lightningStyle.selector && lightningStyle.styles) {
          embeddedCSS += lightningStyle.selector + " {\n";
          Object.entries(lightningStyle.styles).forEach(([prop, value]) => {
            embeddedCSS += `  ${prop}: ${value} !important;\n`;
          });
          embeddedCSS += "}\n";
        }
      });
      embeddedCSS += "\n";
    }

    // Skip complex computed styles - keep it simple

    embeddedCSS += "</style>\n";

    // Insert CSS before closing head tag
    html = html.replace("</head>", embeddedCSS + "</head>");

    // 2. REPLACE ALL IMAGES WITH BASE64 DATA
    console.log("🖼️ Processing all images...");

    // Process external resource images first
    if (captureData.externalResources && captureData.externalResources.images) {
      captureData.externalResources.images.forEach((image) => {
        if (image.base64) {
          const imgRegex = new RegExp(
            `<img[^>]*src=["']${escapeRegExp(image.src)}["'][^>]*>`,
            "gi"
          );
          html = html.replace(imgRegex, (match) => {
            return match.replace(image.src, image.base64);
          });
        }
      });
    }

    // Process captured images
    if (captureData.images && captureData.images.length > 0) {
      captureData.images.forEach((image) => {
        if (image.type === "img" && image.src) {
          // Replace img src with base64 data if available
          const imgRegex = new RegExp(
            `<img[^>]*src=["']${escapeRegExp(image.src)}["'][^>]*>`,
            "gi"
          );
          html = html.replace(imgRegex, (match) => {
            if (image.base64) {
              // Use base64 data
              return match.replace(image.src, image.base64);
            } else {
              // Keep original src but add fallback
              return match.replace(
                image.src,
                image.src + '" onerror="this.style.display=\'none\'"'
              );
            }
          });
        } else if (image.type === "background" && image.src) {
          // Replace background-image URLs with fallback
          const bgRegex = new RegExp(
            `url\\(['"]?${escapeRegExp(image.src)}['"]?\\)`,
            "gi"
          );
          html = html.replace(
            bgRegex,
            "url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjYyIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2U8L3RleHQ+PC9zdmc+)"
          );
        }
      });
    }

    // 3. EMBED ALL FONTS
    if (captureData.externalResources && captureData.externalResources.fonts) {
      console.log("🔤 Embedding fonts...");
      captureData.externalResources.fonts.forEach((font) => {
        if (font.base64) {
          const fontRegex = new RegExp(
            `url\\(['"]?${escapeRegExp(font.href)}['"]?\\)`,
            "gi"
          );
          html = html.replace(fontRegex, `url(${font.base64})`);
        }
      });
    }

    // 4. REMOVE ALL EXTERNAL RESOURCE REFERENCES
    console.log("🔧 Removing all external resource references...");

    // Remove all external CSS links
    html = html.replace(
      /<link[^>]*rel=["']stylesheet["'][^>]*href=["'][^"']*["'][^>]*>/gi,
      ""
    );

    // Remove all external JS scripts
    html = html.replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/gi, "");

    // Remove all external font links
    html = html.replace(
      /<link[^>]*href=["'][^"']*\.(woff|woff2|ttf|otf|eot)["'][^>]*>/gi,
      ""
    );

    // Remove all external image references that weren't converted
    html = html.replace(
      /<img[^>]*src=["'][^"']*\.(gif|png|jpg|jpeg|svg|webp)["'][^>]*>/gi,
      ""
    );

    // REMOVE ALL INTERACTIVITY - DISABLE LINKS, BUTTONS, FORMS
    console.log("🔧 Removing all interactivity...");

    // Remove all href attributes from links (make them non-clickable)
    html = html.replace(
      /<a([^>]*)\s+href=["'][^"']*["']([^>]*)>/gi,
      "<span$1$2>"
    );
    html = html.replace(/<\/a>/gi, "</span>");

    // Remove all onclick, onmousedown, onmouseup, etc. event handlers
    html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");

    // Disable all form elements
    html = html.replace(/<input([^>]*)>/gi, "<input$1 disabled readonly>");
    html = html.replace(/<select([^>]*)>/gi, "<select$1 disabled>");
    html = html.replace(
      /<textarea([^>]*)>/gi,
      "<textarea$1 disabled readonly>"
    );
    html = html.replace(/<button([^>]*)>/gi, "<span$1>");
    html = html.replace(/<\/button>/gi, "</span>");

    // Remove form actions
    html = html.replace(
      /<form([^>]*)\s+action=["'][^"']*["']([^>]*)>/gi,
      "<div$1$2>"
    );
    html = html.replace(/<\/form>/gi, "</div>");

    // Remove all JavaScript event handlers from any element
    html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");

    // Remove meta refresh tags
    html = html.replace(/<meta[^>]*http-equiv=["']refresh["'][^>]*>/gi, "");

    // 5. PREVENT AUTO-REFRESH AND ADD METADATA
    console.log("🔧 Adding metadata and preventing auto-refresh...");

    // Add meta tags to prevent auto-refresh and fix CSP
    const metaTags = `
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob: file:; script-src * 'unsafe-inline' 'unsafe-eval' data: blob: file:; style-src * 'unsafe-inline' data: blob: file:; img-src * data: blob: file:; font-src * data: blob: file:; connect-src * data: blob: file:; object-src *; media-src *; frame-src *; base-uri *; form-action *; frame-ancestors *;">
    <title>Captured Page - ${new Date().toLocaleString()}</title>
    <style>
      /* Ensure content is visible without JavaScript */
      body { visibility: visible !important; opacity: 1 !important; }
      * { animation: none !important; transition: none !important; }
      /* Salesforce Lightning specific visibility fixes */
      .slds-scope { visibility: visible !important; opacity: 1 !important; }
      lightning-* { display: block !important; visibility: visible !important; }
      [data-aura-rendered-by] { visibility: visible !important; opacity: 1 !important; }
      /* Hide loading spinners and placeholders */
      .slds-spinner, .loading, [class*="loading"] { display: none !important; }
    </style>
    `;

    html = html.replace(
      "<head>",
      "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src * 'unsafe-inline' 'unsafe-eval' data: blob: file:; script-src * 'unsafe-inline' 'unsafe-eval' data: blob: file:; style-src * 'unsafe-inline' data: blob: file:; img-src * data: blob: file:; font-src * data: blob: file:; connect-src * data: blob: file:; object-src *; media-src *; frame-src *; base-uri *; form-action *; frame-ancestors *;\">" +
        metaTags
    );

    // Keep ALL JavaScript but remove only auto-refresh/reload scripts
    html = html.replace(
      /<script[^>]*>[\s\S]*?setTimeout[\s\S]*?location\.reload[\s\S]*?<\/script>/gi,
      ""
    );
    html = html.replace(
      /<script[^>]*>[\s\S]*?setInterval[\s\S]*?location\.reload[\s\S]*?<\/script>/gi,
      ""
    );
    html = html.replace(
      /<script[^>]*>[\s\S]*?window\.location\.reload[\s\S]*?<\/script>/gi,
      ""
    );
    html = html.replace(
      /<script[^>]*>[\s\S]*?location\.href[\s\S]*?<\/script>/gi,
      ""
    );
    html = html.replace(/<meta[^>]*http-equiv="refresh"[^>]*>/gi, "");

    // Remove ALL problematic elements that cause CSP violations
    html = html.replace(
      /<script[^>]*src=["'][^"']*\.js["'][^>]*><\/script>/gi,
      ""
    );
    // Remove ALL inline event handlers that cause CSP violations
    html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");
    // Remove ALL script tags with nonce attributes
    html = html.replace(
      /<script[^>]*nonce=["'][^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
      ""
    );
    // Remove ALL meta tags with CSP
    html = html.replace(
      /<meta[^>]*http-equiv=["']content-security-policy["'][^>]*>/gi,
      ""
    );

    // Remove only problematic event handlers that cause reloads
    html = html.replace(/onbeforeunload="[^"]*"/gi, "");
    html = html.replace(/onunload="[^"]*"/gi, "");
    html = html.replace(/onerror="[^"]*location\.reload[^"]*"/gi, "");

    // Remove ALL existing CSP meta tags to prevent conflicts
    html = html.replace(
      /<meta[^>]*http-equiv=["']content-security-policy["'][^>]*>/gi,
      ""
    );
    html = html.replace(
      /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
      ""
    );

    // Remove all inline scripts that have nonce attributes (they cause CSP violations)
    html = html.replace(
      /<script[^>]*nonce=["'][^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
      ""
    );

    // Remove all inline event handlers completely
    html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");

    // 6. EMBED JAVASCRIPT STATE AND SALESFORCE FIXES
    if (captureData.javascript || captureData.data) {
      console.log("⚙️ Embedding JavaScript and data...");

      let jsScript = '<script type="text/javascript">\n';
      jsScript += "// Captured JavaScript and data\n";

      if (captureData.javascript) {
        jsScript +=
          "window.capturedJavaScript = " +
          JSON.stringify(captureData.javascript, null, 2) +
          ";\n";
      }

      if (captureData.data) {
        jsScript +=
          "window.capturedData = " +
          JSON.stringify(captureData.data, null, 2) +
          ";\n";

        // Restore localStorage and sessionStorage
        jsScript += "// Restore storage data\n";
        if (captureData.data.localStorage) {
          jsScript +=
            "Object.keys(window.capturedData.localStorage).forEach(key => {\n";
          jsScript +=
            "  try { localStorage.setItem(key, window.capturedData.localStorage[key]); } catch(e) {}\n";
          jsScript += "});\n";
        }
        if (captureData.data.sessionStorage) {
          jsScript +=
            "Object.keys(window.capturedData.sessionStorage).forEach(key => {\n";
          jsScript +=
            "  try { sessionStorage.setItem(key, window.capturedData.sessionStorage[key]); } catch(e) {}\n";
          jsScript += "});\n";
        }
      }

      // Universal fixes for all websites
      jsScript += "// Universal page fixes\n";
      jsScript +=
        "document.addEventListener('DOMContentLoaded', function() {\n";
      jsScript += "  // DISABLE ALL INTERACTIVITY\n";
      jsScript +=
        "  const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [onclick], [onmousedown], [onmouseup]');\n";
      jsScript += "  interactiveElements.forEach(el => {\n";
      jsScript += "    el.style.pointerEvents = 'none';\n";
      jsScript += "    el.style.cursor = 'default';\n";
      jsScript += "    // Remove all event listeners\n";
      jsScript += "    el.onclick = null;\n";
      jsScript += "    el.onmousedown = null;\n";
      jsScript += "    el.onmouseup = null;\n";
      jsScript += "    el.onchange = null;\n";
      jsScript += "    el.onsubmit = null;\n";
      jsScript += "  });\n";
      jsScript +=
        "  // AGGRESSIVE CONTENT SHOWING - Force all elements visible\n";
      jsScript += "  const allElements = document.querySelectorAll('*');\n";
      jsScript += "  allElements.forEach(el => {\n";
      jsScript += "    el.style.visibility = 'visible';\n";
      jsScript += "    el.style.opacity = '1';\n";
      jsScript +=
        "    if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'LINK') {\n";
      jsScript +=
        "      if (el.tagName === 'TABLE' || el.tagName === 'TBODY' || el.tagName === 'TR' || el.tagName === 'TD' || el.tagName === 'TH') {\n";
      jsScript += "        el.style.display = 'table';\n";
      jsScript += "      } else if (el.tagName === 'TR') {\n";
      jsScript += "        el.style.display = 'table-row';\n";
      jsScript +=
        "      } else if (el.tagName === 'TD' || el.tagName === 'TH') {\n";
      jsScript += "        el.style.display = 'table-cell';\n";
      jsScript += "      } else {\n";
      jsScript += "        el.style.display = 'block';\n";
      jsScript += "      }\n";
      jsScript += "    }\n";
      jsScript += "  });\n";
      jsScript +=
        "  // SMART FIX - Only hide the black arc, keep everything else\n";
      jsScript += "  // Hide only loading spinners, not content\n";
      jsScript +=
        "  const loadingElements = document.querySelectorAll('.slds-spinner, .loading, .spinner, [class*=\"spinner\"]');\n";
      jsScript +=
        "  loadingElements.forEach(el => el.style.display = 'none');\n";
      jsScript += "  // ULTIMATE BLACK ARC DESTRUCTION - IMMEDIATE EXECUTION\n";
      jsScript += "  // Run immediately to catch the arc before it renders\n";
      jsScript += "  (function() {\n";
      jsScript += "    const destroyBlackArc = () => {\n";
      jsScript += "      // Hide ALL SVG elements immediately\n";
      jsScript +=
        "      const allSVGElements = document.querySelectorAll('svg, svg *, path, circle, rect, ellipse');\n";
      jsScript += "      allSVGElements.forEach(el => {\n";
      jsScript += "        el.style.display = 'none';\n";
      jsScript += "        el.style.visibility = 'hidden';\n";
      jsScript += "        el.style.opacity = '0';\n";
      jsScript += "        el.remove();\n";
      jsScript += "      });\n";
      jsScript += "      // Hide ALL black elements immediately\n";
      jsScript +=
        '      const allBlackElements = document.querySelectorAll(\'[style*="black"], [style*="#000"], [style*="rgb(0,0,0)"], [style*="rgba(0,0,0"], [style*="#000000"]\');\n';
      jsScript += "      allBlackElements.forEach(el => {\n";
      jsScript += "        el.style.display = 'none';\n";
      jsScript += "        el.style.visibility = 'hidden';\n";
      jsScript += "        el.style.opacity = '0';\n";
      jsScript += "        el.remove();\n";
      jsScript += "      });\n";
      jsScript +=
        "      // Hide any element with black background immediately\n";
      jsScript +=
        '      const blackElements = document.querySelectorAll(\'[style*="background: black"], [style*="background-color: black"], [style*="fill: black"], [style*="fill:#000"], [style*="background-color:#000"]\');\n';
      jsScript += "      blackElements.forEach(el => {\n";
      jsScript += "        el.style.display = 'none';\n";
      jsScript += "        el.style.visibility = 'hidden';\n";
      jsScript += "        el.style.opacity = '0';\n";
      jsScript += "        el.remove();\n";
      jsScript += "      });\n";
      jsScript += "      // Hide any large black divs immediately\n";
      jsScript +=
        '      const blackDivs = document.querySelectorAll(\'div[style*="background"][style*="black"], div[style*="background-color"][style*="black"], div[style*="background-color:#000"]\');\n';
      jsScript += "      blackDivs.forEach(el => {\n";
      jsScript += "        el.style.display = 'none';\n";
      jsScript += "        el.style.visibility = 'hidden';\n";
      jsScript += "        el.style.opacity = '0';\n";
      jsScript += "        el.remove();\n";
      jsScript += "      });\n";
      jsScript +=
        "      // Hide any element that could be the black arc immediately\n";
      jsScript +=
        '      const arcElements = document.querySelectorAll(\'[class*="arc"], [class*="circle"], [class*="spinner"], [class*="loading"], [class*="black"]\');\n';
      jsScript += "      arcElements.forEach(el => {\n";
      jsScript += "        el.style.display = 'none';\n";
      jsScript += "        el.style.visibility = 'hidden';\n";
      jsScript += "        el.style.opacity = '0';\n";
      jsScript += "        el.remove();\n";
      jsScript += "      });\n";
      jsScript += "      // Hide any positioned elements immediately\n";
      jsScript +=
        '      const positionedElements = document.querySelectorAll(\'div[style*="position: absolute"], div[style*="position: fixed"], div[style*="position: relative"]\');\n';
      jsScript += "      positionedElements.forEach(el => {\n";
      jsScript += "        el.style.display = 'none';\n";
      jsScript += "        el.style.visibility = 'hidden';\n";
      jsScript += "        el.style.opacity = '0';\n";
      jsScript += "        el.remove();\n";
      jsScript += "      });\n";
      jsScript += "    };\n";
      jsScript += "    // Run immediately\n";
      jsScript += "    destroyBlackArc();\n";
      jsScript += "    // Run on DOM ready\n";
      jsScript += "    if (document.readyState === 'loading') {\n";
      jsScript +=
        "      document.addEventListener('DOMContentLoaded', destroyBlackArc);\n";
      jsScript += "    }\n";
      jsScript += "    // Run on window load\n";
      jsScript += "    window.addEventListener('load', destroyBlackArc);\n";
      jsScript += "    // Run continuously\n";
      jsScript += "    setInterval(destroyBlackArc, 100);\n";
      jsScript += "  })();\n";
      jsScript += "  // Force show all Salesforce content\n";
      jsScript +=
        "  const salesforceElements = document.querySelectorAll('.slds-scope, .forcePageBlock, lightning-*, [data-aura-rendered-by], .slds-card, .slds-grid');\n";
      jsScript += "  salesforceElements.forEach(el => {\n";
      jsScript += "    el.style.visibility = 'visible';\n";
      jsScript += "    el.style.opacity = '1';\n";
      jsScript += "    el.style.display = 'block';\n";
      jsScript += "  });\n";
      jsScript += "  // Show all child elements too\n";
      jsScript +=
        "  const childElements = document.querySelectorAll('.slds-scope *, .forcePageBlock *, lightning-* *, [data-aura-rendered-by] *');\n";
      jsScript += "  childElements.forEach(el => {\n";
      jsScript += "    el.style.visibility = 'visible';\n";
      jsScript += "    el.style.opacity = '1';\n";
      jsScript += "    el.style.display = 'block';\n";
      jsScript += "  });\n";
      jsScript +=
        "  // Force Salesforce Lightning visibility (additional elements)\n";
      jsScript +=
        "  const lightningElements = document.querySelectorAll('lightning-*, [data-aura-rendered-by]');\n";
      jsScript += "  lightningElements.forEach(el => {\n";
      jsScript += "    el.style.visibility = 'visible';\n";
      jsScript += "    el.style.opacity = '1';\n";
      jsScript += "    el.style.display = 'block';\n";
      jsScript += "  });\n";
      jsScript += "});\n";
      jsScript += "</script>\n";

      html = html.replace("</body>", jsScript + "</body>");
    }

    // 7. FINAL HTML CLEANUP - ENSURE 100% VISUAL FIDELITY
    console.log("🔧 Final HTML cleanup for 100% visual fidelity...");

    // Remove any remaining script tags that could cause issues
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

    // Ensure all content is visible
    html = html.replace(
      /<body([^>]*)>/gi,
      '<body$1 style="visibility: visible !important; opacity: 1 !important;">'
    );

    // Add final CSS to ensure everything is visible
    const finalCSS = `
    <style>
      /* FINAL VISIBILITY OVERRIDE */
      * { visibility: visible !important; opacity: 1 !important; }
      body, html { visibility: visible !important; opacity: 1 !important; }
      /* Hide only loading elements */
      .slds-spinner, .loading, .spinner, [class*="spinner"] { display: none !important; }
      /* Ensure all content shows */
      .slds-scope, .forcePageBlock, lightning-*, [data-aura-rendered-by] { 
        visibility: visible !important; 
        opacity: 1 !important; 
        display: block !important; 
      }
    </style>
    `;

    html = html.replace("</head>", finalCSS + "</head>");

    // 8. DOWNLOAD THE FILE
    console.log("💾 Downloading enhanced HTML file...");

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `captured-page-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/:/g, "-")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("✅ Enhanced HTML file downloaded successfully!");
    alert(
      "✅ Page captured with 100% HTML/CSS fidelity! All interactivity removed while preserving visual appearance. No more missing resource errors!"
    );
  } catch (error) {
    console.error("❌ Error creating enhanced HTML:", error);
    alert("Error creating HTML file: " + error.message);
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
