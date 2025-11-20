// FAST CAPTURE - Popup Script
// Handles captured data and creates HTML file quickly
// Auto-detected session page support

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

function showMainPage() {
  document.getElementById("login-page").style.display = "none";
  document.getElementById("main-page").style.display = "block";

  // Check for pending session data from auto-scraping
  chrome.storage.local.get(
    ["pendingSessionData", "sessionDataTimestamp"],
    (result) => {
      if (result.pendingSessionData && result.sessionDataTimestamp) {
        // Check if data is recent (within 5 minutes)
        const age = Date.now() - result.sessionDataTimestamp;
        if (age < 5 * 60 * 1000) {
          console.log("SessyNote: Found pending session data, auto-filling...");
          // Auto-fill the session
          setTimeout(() => {
            autoFillSessionFromScrapedData(result.pendingSessionData);
            // Clear the pending data
            chrome.storage.local.remove([
              "pendingSessionData",
              "sessionDataTimestamp",
            ]);
          }, 500);
          return;
        }
      }

      // No pending data - show clients page as normal
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
  );
}

function showLoginPage() {
  document.getElementById("login-page").style.display = "block";
  document.getElementById("main-page").style.display = "none";
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

  // Fetch and cache emr_url
  await fetchAndCacheEMRUrl(accessToken);

  // After login, trigger the scraping flow on the current page (if on EMR domain)
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "checkAndScrape" });
    }
  });

  showMainPage();
}

async function fetchAndCacheEMRUrl(accessToken) {
  try {
    console.log("🔑 Fetching EMR URL...");

    // Step 1: Fetch user profile
    const profileResponse = await fetch(`${API_BASE_URL}/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!profileResponse.ok) {
      console.error("❌ Failed to fetch profile:", profileResponse.status);
      return;
    }

    const profileData = await profileResponse.json();
    console.log("👤 Profile data:", profileData);

    // Step 2: Get EMR type ID from first pair
    const pairs = profileData.emr_type_documentation_pairs;
    if (!pairs || pairs.length === 0) {
      console.log("⚠️ No EMR type pairs found in profile");
      await chrome.storage.local.set({ emrUrl: null });
      return;
    }

    const emrTypeId = pairs[0].emr_type_id;
    console.log("🔑 EMR Type ID:", emrTypeId);

    // Step 3: Fetch EMR type details
    const emrTypeResponse = await fetch(
      `${API_BASE_URL}/emr-types/${emrTypeId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!emrTypeResponse.ok) {
      console.error("❌ Failed to fetch EMR type:", emrTypeResponse.status);
      return;
    }

    const emrTypeData = await emrTypeResponse.json();
    console.log("📋 EMR Type data:", emrTypeData);

    // Parse json_response field if it's a JSON string
    let emrResponse = emrTypeData.json_response;
    if (emrResponse && typeof emrResponse === "string") {
      try {
        emrResponse = JSON.parse(emrResponse);
      } catch (e) {
        console.error("❌ Failed to parse json_response field:", e);
      }
    }

    // Step 4: Cache emr_url, emr_type_id, and response
    const emrUrl = emrTypeData.emr_url || "";
    await chrome.storage.local.set({
      emrUrl: emrUrl,
      emrTypeId: emrTypeId,
      emrResponse: emrResponse || null,
    });
    console.log("✅ EMR URL cached:", emrUrl);
    console.log("✅ EMR Type ID cached:", emrTypeId);
    console.log("✅ EMR Response cached:", emrResponse);
  } catch (error) {
    console.error("❌ Error fetching EMR URL:", error);
  }
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

  // Setup auto-detected session page handlers
  setupAutoDetectedSessionHandlers();

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
  const editPersonalBottomBtn = document.getElementById(
    "edit-personal-info-bottom-btn"
  );
  if (editPersonalBottomBtn) {
    editPersonalBottomBtn.addEventListener("click", function () {
      console.log("✏️ Personal Info bottom edit button clicked");
      editPersonalInfo();
    });
  }

  // EMR Personalization edit button (top)
  const editEMRBtn = document.getElementById("edit-emr-info-btn");
  if (editEMRBtn) {
    editEMRBtn.addEventListener("click", function () {
      console.log("✏️ EMR Personalization edit button clicked");
      editEMRInfo();
    });
  }

  // EMR Personalization edit button (bottom)
  const editEMRBottomBtn = document.getElementById("edit-emr-info-bottom-btn");
  if (editEMRBottomBtn) {
    editEMRBottomBtn.addEventListener("click", function () {
      console.log("✏️ EMR Personalization bottom edit button clicked");
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
  const editCompanyBottomBtn = document.getElementById(
    "edit-company-info-bottom-btn"
  );
  if (editCompanyBottomBtn) {
    editCompanyBottomBtn.addEventListener("click", function () {
      console.log("✏️ Company Info bottom edit button clicked");
      editCompanyInfo();
    });
  }
}

function setupAutoDetectedSessionHandlers() {
  console.log("🔧 setupAutoDetectedSessionHandlers called");

  const autoEditBtn = document.getElementById("auto-edit-button");
  console.log("🔍 autoEditBtn found:", !!autoEditBtn);

  if (autoEditBtn) {
    autoEditBtn.addEventListener("click", function () {
      console.log("✒️ Auto-detected session Edit button clicked");
      switchAutoDetectedSessionToEditMode();
    });
  }

  const autoGenerateButton = document.getElementById("auto-generate-button");
  console.log("🔍 autoGenerateButton found:", !!autoGenerateButton);

  if (autoGenerateButton) {
    const newButton = autoGenerateButton.cloneNode(true);
    autoGenerateButton.parentNode.replaceChild(newButton, autoGenerateButton);
    newButton.addEventListener("click", handleGenerateAINotesFromDetected);
    console.log("✅ Auto-generate button set up");
  } else {
    console.log("❌ Auto-generate button NOT FOUND!");
  }
}

async function switchAutoDetectedSessionToEditMode() {
  console.log("🔄 Switching auto-detected session to edit mode...");

  // Get dynamic fields data (should be stored globally)
  if (!currentAutoDetectedDynamicFields || !currentAutoDetectedScrapedData) {
    console.error("❌ No dynamic fields or scraped data found");
    showErrorMessage("Unable to switch to edit mode. Please refresh the page.");
    return;
  }

  const dynamicFields = currentAutoDetectedDynamicFields;
  const scrapedData = currentAutoDetectedScrapedData;

  // Convert static fields (Instructions only - Client and Type are NEVER editable)
  const staticFields = [
    {
      containerId: "auto-instructions-container",
      valueId: "auto-instructions",
      fieldName: "Instructions",
    },
  ];

  staticFields.forEach((field) => {
    const container = document.getElementById(field.containerId);
    const valueElement = document.getElementById(field.valueId);

    if (container && valueElement) {
      const currentValue = valueElement.textContent;

      // Replace with input field (or textarea for Instructions)
      const label = container.querySelector(".detail-label");
      const detailValue = container.querySelector(".detail-value");

      if (label && detailValue) {
        // Instructions always shows as textarea (big box)
        if (field.fieldName === "Instructions") {
          // Escape HTML entities for textarea content
          const escapedValue = currentValue
            ? String(currentValue)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;")
            : "";
          // Instructions in edit mode: scrollable if long text
          detailValue.innerHTML = `<textarea data-field-name="${field.fieldName}" class="editable-input" rows="3" style="width: 100%; min-height: 60px; max-height: 200px; resize: vertical; overflow-y: auto;">${escapedValue}</textarea>`;
        } else {
          // Escape HTML entities for input value
          const escapedValue = currentValue
            ? String(currentValue)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;")
            : "";
          detailValue.innerHTML = `<input type="text" value="${escapedValue}" data-field-name="${field.fieldName}" class="editable-input">`;
        }
      }
    }
  });

  // Recreate confirmed results fields in edit mode with proper types from EMR type fields
  const confirmedContainer = document.getElementById(
    "auto-confirmed-results-container"
  );
  if (confirmedContainer) {
    // First, collect current values from existing view fields before clearing
    const existingValues = {};
    const viewFields = confirmedContainer.querySelectorAll(
      ".session-detail-item"
    );
    viewFields.forEach((fieldElement) => {
      const label = fieldElement.querySelector(".detail-label");
      const valueSpan = fieldElement.querySelector(".detail-value");
      if (label && valueSpan) {
        const labelText = label.textContent.trim();
        // Check if it's a checkbox
        const checkboxInput = valueSpan.querySelector('input[type="checkbox"]');
        if (checkboxInput) {
          existingValues[labelText] = checkboxInput.checked;
        } else {
          existingValues[labelText] = valueSpan.textContent.trim();
        }
      }
    });

    // Clear existing fields
    confirmedContainer.innerHTML = "";

    // Recreate all confirmed results fields in edit mode with correct types
    dynamicFields.confirmedResults.forEach((result) => {
      // Skip client field - it's already shown as static field
      const keyLower = result.key ? result.key.toLowerCase().trim() : "";
      if (keyLower === "client" || keyLower === "client name") {
        return;
      }

      // Find field definition from EMR type fields
      let fieldDef = dynamicFields.fields.find((f) => f.name === result.key);

      // Try case-insensitive matching if exact match not found
      if (!fieldDef) {
        fieldDef = dynamicFields.fields.find((field) => {
          if (!field.name) return false;
          const normalizedFieldName = field.name
            .toLowerCase()
            .replace(/-/g, " ")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const normalizedResultKey = result.key
            .toLowerCase()
            .replace(/-/g, " ")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return normalizedFieldName === normalizedResultKey;
        });
      }

      if (fieldDef) {
        // Get the api_name to look up value in scraped data
        const fieldMapping = dynamicFields.fieldMapping;
        let apiName = fieldMapping[result.key];

        if (!apiName && fieldDef) {
          apiName = fieldDef.api_name;
        }

        // Get current value: for date/datetime fields, prefer original scraped data value
        // to avoid formatting issues (view mode shows formatted dates like "10/6/13")
        let fieldValue = "";
        if (fieldDef.type === "date" || fieldDef.type === "datetime") {
          // For date/datetime fields, prefer original value from scrapedData
          if (apiName && scrapedData.hasOwnProperty(apiName)) {
            fieldValue = scrapedData[apiName];
            // Convert to proper format if needed
            if (fieldDef.type === "date" && fieldValue) {
              // Check if already in YYYY-MM-DD format (e.g., after saving)
              const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
              if (dateRegex.test(fieldValue)) {
                // Already in correct format, use as-is
                // fieldValue is already correct
              } else {
                // Try to parse and format as YYYY-MM-DD
                const parsedDate = parseDate(fieldValue);
                if (parsedDate) {
                  fieldValue = parsedDate;
                } else {
                  // If parseDate fails, try direct Date parsing
                  try {
                    const date = new Date(fieldValue);
                    if (!isNaN(date.getTime())) {
                      fieldValue = date.toISOString().split("T")[0];
                    }
                  } catch (e) {
                    console.warn("Failed to parse date:", fieldValue);
                  }
                }
              }
            } else if (fieldDef.type === "datetime" && fieldValue) {
              // Check if already in YYYY-MM-DDTHH:MM format (e.g., after saving)
              const datetimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
              if (datetimeRegex.test(fieldValue)) {
                // Already in correct format, use as-is
                // fieldValue is already correct
              } else {
                // Try to parse and format as YYYY-MM-DDTHH:MM
                const parsedDateTime = parseDateTime(fieldValue);
                if (parsedDateTime) {
                  fieldValue = parsedDateTime;
                } else {
                  // If parseDateTime fails, try direct Date parsing
                  try {
                    const date = new Date(fieldValue);
                    if (!isNaN(date.getTime())) {
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(
                        2,
                        "0"
                      );
                      const day = String(date.getDate()).padStart(2, "0");
                      const hours = String(date.getHours()).padStart(2, "0");
                      const minutes = String(date.getMinutes()).padStart(
                        2,
                        "0"
                      );
                      fieldValue = `${year}-${month}-${day}T${hours}:${minutes}`;
                    }
                  } catch (e) {
                    console.warn("Failed to parse datetime:", fieldValue);
                  }
                }
              }
            }
          } else if (existingValues.hasOwnProperty(result.key)) {
            // Fallback: try to parse the formatted date string from view mode
            const formattedValue = existingValues[result.key];
            if (fieldDef.type === "date") {
              const parsedDate = parseDate(formattedValue);
              fieldValue = parsedDate || formattedValue;
            } else if (fieldDef.type === "datetime") {
              const parsedDateTime = parseDateTime(formattedValue);
              fieldValue = parsedDateTime || formattedValue;
            } else {
              fieldValue = formattedValue;
            }
          }
        } else {
          // For non-date fields, prefer existing view value, then scraped data
          if (existingValues.hasOwnProperty(result.key)) {
            fieldValue = existingValues[result.key];
          } else if (apiName && scrapedData.hasOwnProperty(apiName)) {
            fieldValue = scrapedData[apiName];
          }
        }

        // Create editable field element with correct type from EMR type field
        const fieldElement = createEditableFieldElement(
          result.key, // Display name
          fieldValue !== null && fieldValue !== undefined ? fieldValue : "",
          fieldDef.type, // Use type from EMR type field
          fieldDef.dropdown_values || null // Pass dropdown values if available
        );

        // Store api_name in data attribute for saving
        const inputElement = fieldElement.querySelector(
          "input, textarea, select"
        );
        if (inputElement && apiName) {
          inputElement.setAttribute("data-api-name", apiName);
        }

        confirmedContainer.appendChild(fieldElement);
      } else {
        console.log(`❌ No field definition found for key '${result.key}'`);
      }
    });
  }

  // Manual fields are already in edit mode, but ensure they have correct types
  const manualContainer = document.getElementById(
    "auto-manual-fields-container"
  );
  if (manualContainer) {
    // Manual fields should already be in edit mode, but we can verify types are correct
    // They're created with createEditableFieldElement which uses correct types
  }

  // Change Edit button to Save button
  const autoEditBtn = document.getElementById("auto-edit-button");
  if (autoEditBtn) {
    autoEditBtn.textContent = "Save";
    // Remove any existing event listeners by cloning the button
    const newBtn = autoEditBtn.cloneNode(true);
    autoEditBtn.parentNode.replaceChild(newBtn, autoEditBtn);
    // Add the event listener to the new button
    newBtn.addEventListener("click", function () {
      console.log("💾 Save button clicked");
      saveAutoDetectedSession();
    });
  }

  console.log(
    "✅ Auto-detected session switched to edit mode with proper field types"
  );
}

function saveAutoDetectedSession() {
  console.log("💾 Saving changes and switching back to view mode...");

  if (!currentAutoDetectedDynamicFields || !currentAutoDetectedScrapedData) {
    console.error("❌ No dynamic fields or scraped data found");
    showErrorMessage("Unable to save. Please refresh the page.");
    return;
  }

  const dynamicFields = currentAutoDetectedDynamicFields;
  const scrapedData = currentAutoDetectedScrapedData;

  // Collect updated Instructions value (can be input or textarea)
  const instructionsInput = document.querySelector(
    '#auto-instructions-container input[data-field-name="Instructions"], #auto-instructions-container textarea[data-field-name="Instructions"]'
  );
  if (instructionsInput) {
    const newInstructions =
      instructionsInput.value || instructionsInput.textContent;
    scrapedData.Instructions = newInstructions;
    scrapedData.instructions = newInstructions;

    // Restore view-mode DOM for Instructions (plain text, no textarea)
    const instructionsContainer = document.getElementById(
      "auto-instructions-container"
    );
    if (instructionsContainer) {
      const detailValue = instructionsContainer.querySelector(".detail-value");
      if (detailValue) {
        // Clear any edit-mode controls and recreate the span used in view mode
        detailValue.innerHTML = "";
        const span = document.createElement("span");
        span.id = "auto-instructions";
        span.textContent = newInstructions;
        span.title = newInstructions; // Tooltip for full text
        detailValue.appendChild(span);
      }
    }
  }

  // Collect all edited values from confirmed results fields
  const confirmedContainer = document.getElementById(
    "auto-confirmed-results-container"
  );
  if (confirmedContainer) {
    const editedFields = confirmedContainer.querySelectorAll(
      ".session-detail-item"
    );

    editedFields.forEach((fieldElement) => {
      const label = fieldElement.querySelector(".detail-label");
      const valueSpan = fieldElement.querySelector(".detail-value");
      const input = valueSpan
        ? valueSpan.querySelector("input, textarea, select")
        : null;

      if (label && input) {
        const fieldName = label.textContent.trim();
        const apiName = input.getAttribute("data-api-name");

        if (apiName) {
          let newValue = "";
          if (input.type === "checkbox") {
            newValue = input.checked;
          } else if (input.tagName === "SELECT") {
            newValue = input.value;
          } else {
            newValue = input.value || "";
          }

          // Update scrapedData with new value
          scrapedData[apiName] = newValue;
          console.log(`💾 Updated ${apiName} = ${scrapedData[apiName]}`);
        }
      }
    });

    // Clear and recreate confirmed results fields in view mode (plain text)
    confirmedContainer.innerHTML = "";

    dynamicFields.confirmedResults.forEach((result) => {
      // Skip client field
      const keyLower = result.key ? result.key.toLowerCase().trim() : "";
      if (keyLower === "client" || keyLower === "client name") {
        return;
      }

      // Find field definition
      let fieldDef = dynamicFields.fields.find((f) => f.name === result.key);
      if (!fieldDef) {
        fieldDef = dynamicFields.fields.find((field) => {
          if (!field.name) return false;
          const normalizedFieldName = field.name
            .toLowerCase()
            .replace(/-/g, " ")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const normalizedResultKey = result.key
            .toLowerCase()
            .replace(/-/g, " ")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return normalizedFieldName === normalizedResultKey;
        });
      }

      if (fieldDef) {
        // Get the api_name to look up value in updated scrapedData
        const fieldMapping = dynamicFields.fieldMapping;
        let apiName = fieldMapping[result.key];
        if (!apiName && fieldDef) {
          apiName = fieldDef.api_name;
        }

        // Get value from updated scrapedData
        const fieldValue =
          apiName && scrapedData.hasOwnProperty(apiName)
            ? scrapedData[apiName]
            : "";

        // Create plain-text view field (same style as initial view mode)
        const fieldElement = createAutoSessionViewFieldElement(
          result.key,
          fieldValue !== null && fieldValue !== undefined ? fieldValue : "",
          fieldDef.type
        );
        confirmedContainer.appendChild(fieldElement);
      }
    });
  }

  // Collect all edited values from manual fields and update scrapedData
  const manualContainer = document.getElementById(
    "auto-manual-fields-container"
  );
  if (manualContainer) {
    const manualFields = manualContainer.querySelectorAll(
      ".session-detail-item"
    );

    manualFields.forEach((fieldElement) => {
      const label = fieldElement.querySelector(".detail-label");
      const input = fieldElement.querySelector("input, textarea, select");

      if (label && input) {
        const fieldName = label.textContent.trim();
        const apiName = input.getAttribute("data-api-name");

        if (apiName) {
          let newValue = "";
          if (input.type === "checkbox") {
            newValue = input.checked;
          } else if (input.tagName === "SELECT") {
            newValue = input.value;
          } else {
            newValue = input.value || "";
          }

          // Update scrapedData with new value
          scrapedData[apiName] = newValue;
          console.log(
            `💾 Updated manual field ${apiName} = ${scrapedData[apiName]}`
          );
        } else {
          // For Modality and Modality Steps, use field name as key
          // These are UUID strings in DB, save as string or null
          if (fieldName === "Modality") {
            scrapedData.modality = input.value || null;
          } else if (fieldName === "Modality Steps") {
            scrapedData.modality_step = input.value || null;
          }
        }
      }
    });
  }

  // Update global scrapedData
  currentAutoDetectedScrapedData = scrapedData;

  // Change Save button back to Edit button
  const autoEditBtn = document.getElementById("auto-edit-button");
  if (autoEditBtn) {
    autoEditBtn.textContent = "Edit";
    // Remove any existing event listeners by cloning the button
    const newBtn = autoEditBtn.cloneNode(true);
    autoEditBtn.parentNode.replaceChild(newBtn, autoEditBtn);
    // Add the event listener to the new button
    newBtn.addEventListener("click", function () {
      console.log("✏️ Auto-detected session Edit button clicked");
      switchAutoDetectedSessionToEditMode();
    });
  }

  console.log("✅ Changes saved, switched back to view mode with truncation");
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
      chrome.runtime.sendMessage({ action: "closeSidePanel" });
    });
  }

  // Floating toggle button functionality (side button)
  if (floatingToggleBtn) {
    floatingToggleBtn.addEventListener("click", function () {
      console.log("🔄 Floating toggle button clicked");
      chrome.runtime.sendMessage({ action: "closeSidePanel" });
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

  // Close menu when clicking anywhere outside the menu
  document.addEventListener("click", function (event) {
    const isOpen = sideMenu.classList.contains("open");

    // Only check if menu is open
    if (!isOpen) return;

    // Check if click is outside both the menu and the toggle button
    const clickedInsideMenu = sideMenu.contains(event.target);
    const clickedMenuToggle = menuToggle.contains(event.target);

    if (!clickedInsideMenu && !clickedMenuToggle) {
      closeMenu();
    }
  });

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
          console.log("✅ User logged out successfully - all data cleared");
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
  setupAddSessionModal();

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
  const profilePersonalContent = document.getElementById(
    "profile-personal-tab-content"
  );
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
      // Switch to EMR Personalization tab
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
      console.log(
        "✅ Switched to Client Info tab - sessions cleared and hidden"
      );

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

      // IMPORTANT: Ensure sessions content is visible
      sessionsContent.style.display = "block";

      // Hide Client History card in Sessions tab
      const clientHistoryCard = document.getElementById("client-history-card");
      if (clientHistoryCard) {
        clientHistoryCard.style.display = "none";
      }

      // Show add session button when in Sessions tab
      const addSessionBtnContainer = document.getElementById(
        "add-session-btn-container"
      );
      if (addSessionBtnContainer) {
        addSessionBtnContainer.style.display = "block";
      }

      // Clear and reload sessions to ensure fresh data
      clearSessionsList();
      loadClientSessions();
    });
  }

  // Client Info tab - hide add session button
  if (clientInfoTab) {
    clientInfoTab.addEventListener("click", function () {
      // Hide add session button when not in Sessions tab
      const addSessionBtnContainer = document.getElementById(
        "add-session-btn-container"
      );
      if (addSessionBtnContainer) {
        addSessionBtnContainer.style.display = "none";
      }
    });
  }

  // Add session button functionality
  const addSessionBtn = document.getElementById("add-session-btn");
  if (addSessionBtn) {
    addSessionBtn.addEventListener("click", function () {
      console.log("➕ Add session button clicked");
      showAddSessionModal();
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
    backArrowSession.addEventListener("click", async function () {
      try {
        // Use the current session's client to go back to the correct client detail
        const result = await chrome.storage.local.get(["currentSession"]);
        const currentSession = result.currentSession;

        if (currentSession && currentSession.client_id) {
          console.log(
            "SessyNote: Back from session detail to client detail for client:",
            currentSession.client_id
          );
          await navigateToClientDetail(currentSession.client_id);
        } else {
          console.warn(
            "SessyNote: No current session/client_id found, going back to clients list"
          );
          navigateToPage("clients");
        }
      } catch (error) {
        console.error(
          "SessyNote: Error handling session back navigation:",
          error
        );
        navigateToPage("clients");
      }
    });
  }

  // Session action buttons functionality
  const editButton = document.querySelector(".edit-button");
  const generateAiNotesButton = document.querySelector(
    ".generate-ai-notes-button"
  );

  if (editButton) {
    editButton.addEventListener("click", async function () {
      console.log("✏️ Edit button clicked");
      // Get the current session ID and fetch fresh data from API
      chrome.storage.local.get(["currentSession"], async function (result) {
        if (result.currentSession && result.currentSession.id) {
          // Always fetch fresh session data from API instead of using cached data
          await editSession(result.currentSession.id);
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
          // Show small, subtle copy notification
          showCopyNotification(icon);
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
          // Show small error notification
          showCopyNotification(icon, false);
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
  // Always load sessions fresh from API for reliability
  chrome.storage.local.get(["currentClient"], async function (result) {
    if (result.currentClient && result.currentClient.clientId) {
      const clientId = result.currentClient.clientId;
      console.log("🔄 Loading sessions from API for client ID:", clientId);

      // Ensure Sessions tab is active and content is visible before loading
      const sessionsTab = document.getElementById("sessions-tab");
      const sessionsContent = document.getElementById("sessions-content");
      if (sessionsTab && sessionsContent) {
        sessionsTab.classList.add("active");
        sessionsContent.classList.add("active");
        sessionsContent.style.display = "block";
      }

      await loadSessionsFromAPI(clientId);
    } else {
      console.warn("❌ No current client found when loading sessions");
      showEmptySessionsState();
    }
  });
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

    // Update the sessions cache
    chrome.storage.local.get(["sessionsCache"], (cacheResult) => {
      const sessionsCache = cacheResult.sessionsCache || {};
      sessionsCache[clientId] = sessions;
      chrome.storage.local.set({ sessionsCache });
      console.log("✅ Updated sessions cache for client:", clientId);
    });

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
  if (!sessionsList) {
    console.warn("❌ Sessions list element not found");
    return;
  }

  // Ensure sessions content is visible
  const sessionsContent = document.getElementById("sessions-content");
  if (sessionsContent) {
    sessionsContent.style.display = "block";
    sessionsContent.classList.add("active");
  }

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

    console.log(`✅ Rendered ${sessions.length} sessions`);
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
    btn.addEventListener("click", async function (e) {
      e.stopPropagation();
      const sessionId = this.getAttribute("data-session-id");
      console.log("📋 View Session clicked for session ID:", sessionId);

      // Find the session data from the sessions list
      const sessionItem = this.closest(".session-item");
      if (sessionItem) {
        // Get the real session data from storage
        chrome.storage.local.get(
          ["sessionsCache", "currentClient"],
          async function (result) {
            if (result.sessionsCache && result.currentClient) {
              const clientId = result.currentClient.clientId;
              const clientSessions = result.sessionsCache[clientId];

              if (clientSessions) {
                // Find the session with matching ID
                const session = clientSessions.find(
                  (s) => s.id === sessionId || s.id == sessionId
                );
                if (session) {
                  console.log("📋 Found real session data:", session);
                  showSessionDetail(session);
                } else {
                  console.log(
                    "⚠️ Session not found in cache, fetching from API..."
                  );
                  // Fallback: fetch session from API if not in cache
                  await fetchAndShowSession(sessionId);
                }
              } else {
                console.log(
                  "⚠️ No cached sessions found, fetching from API..."
                );
                // Fallback: fetch session from API if cache is empty
                await fetchAndShowSession(sessionId);
              }
            } else {
              console.log(
                "⚠️ No sessions cache or current client found, fetching from API..."
              );
              // Fallback: fetch session from API
              await fetchAndShowSession(sessionId);
            }
          }
        );
      }
    });
  });
}

// Helper function to fetch session from API and show it
async function fetchAndShowSession(sessionId) {
  try {
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      showErrorMessage("Please log in again");
      return;
    }

    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const session = await response.json();
      console.log("✅ Fetched session from API:", session);
      showSessionDetail(session);
    } else {
      console.error("❌ Failed to fetch session:", response.status);
      showErrorMessage("Failed to load session. Please try again.");
    }
  } catch (error) {
    console.error("❌ Error fetching session:", error);
    showErrorMessage("Failed to load session. Please try again.");
  }
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

  // Ensure sessions content is visible
  const sessionsContent = document.getElementById("sessions-content");
  if (sessionsContent) {
    sessionsContent.style.display = "block";
    sessionsContent.classList.add("active");
  }

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
  } else if (page === "emr-types") {
    loadDocumentationMethods();
    checkPendingEMRRequests();
  } else if (page === "auto-detected-session") {
    // Auto-detected session page loaded by populateAutoDetectedSessionPage()
  } else if (page === "client-detail") {
    // Check if Sessions tab is active and load sessions if so
    setTimeout(() => {
      const sessionsTab = document.getElementById("sessions-tab");
      const sessionsContent = document.getElementById("sessions-content");
      if (sessionsTab && sessionsContent) {
        const isSessionsTabActive = sessionsTab.classList.contains("active");
        if (isSessionsTabActive) {
          console.log("🔄 Sessions tab is active, loading sessions...");
          // Ensure sessions content is visible
          sessionsContent.style.display = "block";
          sessionsContent.classList.add("active");
          // Load sessions
          loadClientSessions();
        } else {
          // Ensure sessions content is hidden if Client Info tab is active
          sessionsContent.style.display = "none";
          sessionsContent.classList.remove("active");
        }
      }
    }, 100);
  }

  console.log(`📄 Navigated to ${page} page`);
}

async function loadDocumentationMethods() {
  const documentationMethodSelect = document.getElementById(
    "documentation-method"
  );

  if (!documentationMethodSelect) {
    console.error("❌ Documentation method select element not found");
    return;
  }

  try {
    // Get access token
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found. Please log in again.");
    }

    // Fetch documentation methods from API
    const response = await fetch(`${API_BASE_URL}/documentation-methods/`, {
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
      throw new Error(
        `Failed to fetch documentation methods: ${response.status}`
      );
    }

    const methods = await response.json();
    console.log("📋 Documentation methods fetched:", methods);

    // Clear existing options (except the first placeholder)
    documentationMethodSelect.innerHTML =
      '<option value="">Select Documentation Method</option>';

    // Add each documentation method as an option
    methods.forEach((method) => {
      const option = document.createElement("option");
      option.value = method.id;
      option.textContent = method.name;
      documentationMethodSelect.appendChild(option);
    });

    console.log(`✅ Loaded ${methods.length} documentation methods`);
  } catch (error) {
    console.error("❌ Error loading documentation methods:", error);
    showErrorMessage(`Failed to load documentation methods: ${error.message}`);
  }
}

// Check for pending EMR requests created by the logged-in user
async function checkPendingEMRRequests() {
  try {
    console.log("🔍 Checking for pending EMR requests...");

    // Get access token
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      console.log("⚠️ No access token, skipping pending request check");
      return;
    }

    // Step 1: Get user ID from profile
    const profileResponse = await fetch(`${API_BASE_URL}/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!profileResponse.ok) {
      console.error("❌ Failed to fetch profile:", profileResponse.status);
      return;
    }

    const profileData = await profileResponse.json();
    const userId = profileData.id || profileData.user_id;

    if (!userId) {
      console.log("⚠️ No user ID found in profile");
      return;
    }

    console.log("👤 User ID:", userId);

    // Step 2: Fetch all EMR types
    const emrTypesResponse = await fetch(`${API_BASE_URL}/emr-types/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!emrTypesResponse.ok) {
      console.error("❌ Failed to fetch EMR types:", emrTypesResponse.status);
      return;
    }

    const emrTypes = await emrTypesResponse.json();
    console.log("📋 Fetched EMR types:", emrTypes.length);

    // Step 3: Check for pending requests matching criteria
    const pendingRequests = emrTypes.filter((emrType) => {
      const matchesUserId =
        emrType.user_id === userId || emrType.user_id == userId;
      const createdFromChrome = emrType.created_from_chrome === true;
      const isNotActive =
        emrType.status !== "active" && emrType.status !== "Active";

      return matchesUserId && createdFromChrome && isNotActive;
    });

    console.log("📋 Pending EMR requests found:", pendingRequests.length);

    // Step 4: Display message if there are pending requests
    const messageElement = document.getElementById(
      "pending-emr-request-message"
    );
    if (messageElement) {
      if (pendingRequests.length > 0) {
        messageElement.style.display = "block";
        console.log("✅ Displaying pending EMR request message");
      } else {
        messageElement.style.display = "none";
        console.log("✅ No pending requests, hiding message");
      }
    }
  } catch (error) {
    console.error("❌ Error checking pending EMR requests:", error);
    // Don't show error to user, just log it
  }
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

    // Check if Sessions tab is active and load sessions if so
    const sessionsTab = document.getElementById("sessions-tab");
    const sessionsContent = document.getElementById("sessions-content");
    if (sessionsTab && sessionsContent) {
      const isSessionsTabActive = sessionsTab.classList.contains("active");
      if (isSessionsTabActive) {
        console.log(
          "🔄 Sessions tab is active on page load, loading sessions..."
        );
        // Ensure sessions content is visible
        sessionsContent.style.display = "block";
        sessionsContent.classList.add("active");
        // Load sessions
        loadClientSessions();
      } else {
        // Ensure sessions content is hidden if Client Info tab is active
        sessionsContent.style.display = "none";
        sessionsContent.classList.remove("active");
      }
    }
  }, 150);

  // Update menu active state (no active menu item for detail page)
  const menuItems = document.querySelectorAll(".menu-item[data-page]");
  menuItems.forEach((item) => item.classList.remove("active"));
}

async function showSessionDetail(session) {
  console.log("🚀 showSessionDetail called with session:", session);
  console.log("🔍 Session emr_type_id:", session.emr_type_id);
  console.log("🔍 Session emr_type_name:", session.emr_type_name);

  // If session doesn't have emr_type_id or emr_type_name, fetch fresh from API
  if (!session.emr_type_id && !session.emr_type_name && session.id) {
    console.log(
      "⚠️ Session missing emr_type_id/emr_type_name, fetching fresh from API..."
    );
    try {
      const tokenResult = await chrome.storage.local.get(["accessToken"]);
      if (tokenResult.accessToken) {
        const response = await fetch(`${API_BASE_URL}/sessions/${session.id}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          session = await response.json();
          console.log("✅ Fetched fresh session from API:", session);
        }
      }
    } catch (error) {
      console.error("❌ Error fetching fresh session:", error);
    }
  }

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

    freshSessionInfoTab.addEventListener("click", async function () {
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

      // Reload session data to ensure all fields are properly displayed
      await reloadSessionInfoData();
    });

    freshSessionActivityTab.addEventListener("click", function () {
      // Switch to AI Notes tab
      switchToAINotesTab();
    });

    console.log("✅ Session tab handlers set up");
  } else {
    console.error("❌ Session tab elements not found");
  }
}

// Helper function to switch to AI Notes tab
function switchToAINotesTab() {
  const sessionInfoTab = document.getElementById("session-info-tab");
  const sessionActivityTab = document.getElementById("session-activity-tab");
  const sessionInfoContent = document.getElementById("session-info-content");
  const sessionActivityContent = document.getElementById(
    "session-activity-content"
  );

  if (
    sessionInfoTab &&
    sessionActivityTab &&
    sessionInfoContent &&
    sessionActivityContent
  ) {
    // Switch to AI Notes tab
    sessionActivityTab.classList.add("active");
    sessionInfoTab.classList.remove("active");
    sessionActivityContent.classList.add("active");
    sessionInfoContent.classList.remove("active");

    // Hide session detected banner and session details for AI Notes tab
    hideSessionDetailsForAINotes();

    // Update buttons for AI Notes tab
    updateSessionButtons("ai-notes");
  }
}

// Reload session info data when switching to Session Info tab
async function reloadSessionInfoData() {
  try {
    console.log("🔄 Reloading session info data...");

    // Get current session from storage
    const sessionResult = await chrome.storage.local.get(["currentSession"]);
    if (!sessionResult.currentSession || !sessionResult.currentSession.id) {
      console.error("❌ No current session found in storage");
      return;
    }

    let session = sessionResult.currentSession;
    console.log("📋 Reloading session:", session.id);

    // If session doesn't have emr_type_id or emr_type_name, fetch fresh from API
    if (!session.emr_type_id && !session.emr_type_name) {
      console.log(
        "⚠️ Session missing emr_type_id/emr_type_name, fetching fresh from API..."
      );
      try {
        const tokenResult = await chrome.storage.local.get(["accessToken"]);
        if (tokenResult.accessToken) {
          const response = await fetch(
            `${API_BASE_URL}/sessions/${session.id}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${tokenResult.accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );
          if (response.ok) {
            session = await response.json();
            console.log("✅ Fetched fresh session from API:", session);
            // Update stored session
            chrome.storage.local.set({ currentSession: session });
          }
        }
      } catch (error) {
        console.error("❌ Error fetching fresh session:", error);
      }
    }

    // Ensure client is stored in storage (needed for updateSessionDetailPage)
    const clientResult = await chrome.storage.local.get(["currentClient"]);
    if (!clientResult.currentClient && session.client_id) {
      try {
        console.log(
          "🔄 Fetching client data for client_id:",
          session.client_id
        );
        const tokenResult = await chrome.storage.local.get(["accessToken"]);
        if (tokenResult.accessToken) {
          const clientResponse = await fetch(
            `${API_BASE_URL}/api/Clients/${session.client_id}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${tokenResult.accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );
          if (clientResponse.ok) {
            const client = await clientResponse.json();
            chrome.storage.local.set({ currentClient: client });
            console.log("✅ Client data stored:", client);
          }
        }
      } catch (error) {
        console.error("❌ Error fetching client:", error);
      }
    }

    // Fetch dynamic fields if session has emr_type_id
    let dynamicFields = null;
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
      console.log(
        "❌ No emr_type_id found in session, skipping dynamic fields"
      );
    }

    // Update session detail page with fresh data
    updateSessionDetailPage(session, dynamicFields);

    console.log("✅ Session info data reloaded successfully");
  } catch (error) {
    console.error("❌ Error reloading session info data:", error);
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
      // Button text will be set by checkAndUpdateAIButtonState()
    } else if (tabType === "ai-notes") {
      // AI Notes tab buttons - hide edit button
      editButton.style.display = "none";
      // Keep the same button text as Session Info tab - don't change it
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

    // Show loading state on generate button (with spinner)
    setGenerateButtonsLoading("Generating...");

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
      resetGenerateButtons("Re-generate");

      showFeedbackStatus("AI notes updated successfully!", "success");
      setTimeout(() => showFeedbackStatus("", ""), 3000);

      // Switch to AI Notes tab to show the regenerated content
      switchToAINotesTab();
    }, 2000);
  } catch (error) {
    console.error("❌ Error regenerating AI notes:", error);
    showFeedbackStatus(`Regeneration error: ${error.message}`, "error");

    // Reset button state on error
    resetGenerateButtons("Re-generate");
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

// Helper function to check if text is truncated and set tooltip only if needed
function checkAndSetTruncationTooltip(element, fullText) {
  if (!element || !fullText) return;

  // Use setTimeout to ensure element is rendered before checking
  setTimeout(() => {
    // Check if element is in the DOM
    if (!element.isConnected) {
      // Element not in DOM yet, try again after a short delay
      setTimeout(() => checkAndSetTruncationTooltip(element, fullText), 50);
      return;
    }

    // Check if text is actually truncated (scrollWidth > clientWidth)
    // Add a small tolerance (1px) to account for rounding differences
    const isTruncated = element.scrollWidth > element.clientWidth + 1;

    if (isTruncated) {
      // Text is truncated - add title and class for hover tooltip
      element.setAttribute("title", fullText);
      element.classList.add("is-truncated");
    } else {
      // Text is not truncated - remove title and class
      element.removeAttribute("title");
      element.classList.remove("is-truncated");
    }
  }, 0);
}

function updateSessionDetailPage(session, dynamicFields = null) {
  console.log("🔄 updateSessionDetailPage called with session:", session);
  console.log("🔍 Session emr_type_id:", session.emr_type_id);
  console.log("🔍 Session emr_type_name:", session.emr_type_name);
  console.log("🔍 Session session_type:", session.session_type);
  console.log("🔍 All session keys:", Object.keys(session));

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

    // Update the 4 static fields: Client, EMR Type, Instructions, Created
    const clientNameTab = document.getElementById("session-client-name");
    const typeTab = document.getElementById("session-type");
    const instructionsTab = document.getElementById("session-instructions");
    const createdTab = document.getElementById("session-created");

    if (clientNameTab) {
      clientNameTab.textContent = clientName;
      // Only add title if text is truncated
      checkAndSetTruncationTooltip(clientNameTab, clientName);
    }

    // EMR Type: prefer server-provided name; otherwise resolve from emr_type_id
    // IMPORTANT: Do NOT use session_type (that's "Individual Therapy", etc.) - use emr_type_name or fetch from emr_type_id
    if (typeTab) {
      let emrTypeName = "Unknown Type";

      // Check if session has emr_type_name (the actual EMR type like "MyEnvolve", "Dragon Test", etc.)
      if (session.emr_type_name) {
        emrTypeName = session.emr_type_name;
        console.log("✅ Using session.emr_type_name:", emrTypeName);
        typeTab.textContent = emrTypeName;
        // Only add title if text is truncated
        checkAndSetTruncationTooltip(typeTab, emrTypeName);
      } else if (session.emr_type_id) {
        // Fetch EMR type name from API using emr_type_id
        console.log(
          "🔄 Fetching EMR type name for emr_type_id:",
          session.emr_type_id
        );
        getEMRTypeName(session.emr_type_id)
          .then((name) => {
            emrTypeName = name || "Unknown Type";
            console.log("✅ Fetched EMR type name:", emrTypeName);
            typeTab.textContent = emrTypeName;
            typeTab.setAttribute("title", emrTypeName); // Add title for hover tooltip
          })
          .catch((error) => {
            console.error("❌ Error fetching EMR type name:", error);
            typeTab.textContent = emrTypeName;
            typeTab.setAttribute("title", emrTypeName); // Add title for hover tooltip
          });
      } else {
        console.warn("⚠️ No emr_type_name or emr_type_id found in session");
        typeTab.textContent = emrTypeName;
        // Only add title if text is truncated
        checkAndSetTruncationTooltip(typeTab, emrTypeName);
      }
    }

    if (instructionsTab) {
      const instructions =
        session.manual_instructions || "No instructions provided";
      instructionsTab.textContent = instructions;
      // Only add title if text is truncated
      checkAndSetTruncationTooltip(instructionsTab, instructions);
    }
    if (createdTab) {
      const createdText = session.created_at
        ? new Date(session.created_at).toLocaleString()
        : "No date";
      createdTab.textContent = createdText;
      // Only add title if text is truncated
      checkAndSetTruncationTooltip(createdTab, createdText);
    }

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
  chrome.storage.local.get(["currentSession"], async function (result) {
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
            session[sessionKey] !== null && session[sessionKey] !== undefined
              ? session[sessionKey]
              : "", // Preserve false/0 values for booleans
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

    // Add divider line before Modality fields
    const dividerLine = document.createElement("div");
    dividerLine.style.cssText =
      "width: 100%; height: 1px; background-color: #e5e7eb; margin: 4px 0;";
    dynamicFieldsSection.appendChild(dividerLine);

    // Add Modality and Modality Steps fields (right after confirmed results, before manual fields)
    await addModalityFieldsToView(session, dynamicFields, dynamicFieldsSection);

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
            session[sessionKey] !== null && session[sessionKey] !== undefined
              ? session[sessionKey]
              : "", // Preserve false/0 values for booleans
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

// Function to add Modality and Modality Steps fields to session view
async function addModalityFieldsToView(session, dynamicFields, container) {
  // Modality and Modality Steps are stored on the session as
  // `modality` and `modality_step` (UUID strings). Always read those keys
  // so the view matches what we saved when generating from the detected session.
  const modalityId = session.modality;
  const modalityStepsId = session.modality_step;

  console.log("🔍 Modality ID from session:", modalityId);
  console.log("🔍 Modality Steps ID from session:", modalityStepsId);

  // Fetch modality and modality steps names
  try {
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) return;

    let modalityName = "Not specified";
    let modalityStepsName = "Not specified";

    // Fetch modality name if ID exists
    if (modalityId) {
      const modalitiesResponse = await fetch(`${API_BASE_URL}/modalities/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        },
      });
      if (modalitiesResponse.ok) {
        const modalities = await modalitiesResponse.json();
        const modality = modalities.find(
          (m) => m.id === modalityId || m.id == modalityId
        );
        if (modality) {
          modalityName = modality.name;
        }
      }
    }

    // Fetch modality steps name if ID exists
    if (modalityStepsId) {
      const modalityStepsResponse = await fetch(
        `${API_BASE_URL}/modality-steps/`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (modalityStepsResponse.ok) {
        const modalitySteps = await modalityStepsResponse.json();
        const modalityStep = modalitySteps.find(
          (ms) => ms.id === modalityStepsId || ms.id == modalityStepsId
        );
        if (modalityStep) {
          modalityStepsName = modalityStep.name;
        }
      }
    }

    // Add modality field
    const modalityElement = createDynamicFieldElement(
      "Modality",
      modalityName,
      "text"
    );
    container.appendChild(modalityElement);

    // Add modality steps field
    const modalityStepsElement = createDynamicFieldElement(
      "Modality Steps",
      modalityStepsName,
      "text"
    );
    container.appendChild(modalityStepsElement);

    console.log("✅ Added Modality and Modality Steps fields");
  } catch (error) {
    console.error("❌ Error fetching modality data:", error);
  }
}

// Function to create a dynamic field element for the manual session view page
// In view mode, we want the same plain-text style as the auto-detected session page
function createDynamicFieldElement(fieldName, fieldValue, fieldType) {
  // Reuse the auto-session plain-text renderer so both pages look consistent
  return createAutoSessionViewFieldElement(fieldName, fieldValue, fieldType);
}

// Helper function to format field names to Title Case for UI display
function formatFieldNameForDisplay(fieldName) {
  if (!fieldName) return "";
  // Convert snake_case and kebab-case to spaces, then Title Case
  return fieldName
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();
}

// Function to create a plain-text view field for auto-detected session page
function createAutoSessionViewFieldElement(fieldName, fieldValue, fieldType) {
  const fieldElement = document.createElement("div");
  fieldElement.className = "session-detail-item dynamic-field view-mode";

  // Format field name (convert snake_case to Title Case)
  const formattedName = formatFieldNameForDisplay(fieldName);

  // Handle booleans as a read-only checkbox (still makes sense visually)
  if (fieldType === "boolean") {
    const isChecked =
      fieldValue === true ||
      fieldValue === "true" ||
      fieldValue === "True" ||
      fieldValue === 1 ||
      fieldValue === "1" ||
      (typeof fieldValue === "string" && fieldValue.toLowerCase() === "true");

    fieldElement.innerHTML = `
      <span class="detail-label">${formattedName}</span>
      <span class="detail-value">
        <input type="checkbox" ${
          isChecked ? "checked" : ""
        } disabled style="pointer-events: none; width: 18px; height: 18px; cursor: not-allowed;">
      </span>
    `;
    return fieldElement;
  }

  // Format dates nicely
  let formattedValue = fieldValue;
  if (fieldType === "date" && fieldValue) {
    try {
      formattedValue = new Date(fieldValue).toLocaleDateString();
    } catch (e) {
      formattedValue = fieldValue;
    }
  }

  const rawValue =
    formattedValue !== null && formattedValue !== undefined
      ? String(formattedValue)
      : "";

  // Escape for HTML text and title attribute
  const escapedText = rawValue
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  fieldElement.innerHTML = `
    <span class="detail-label">${formattedName}</span>
    <span class="detail-value">${escapedText || "-"}</span>
  `;

  // Only add title if text is truncated (check after element is in DOM)
  const detailValue = fieldElement.querySelector(".detail-value");
  if (detailValue && escapedText) {
    checkAndSetTruncationTooltip(detailValue, escapedText);
  }

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

  // Update EMR Personalization section - show all pairs as tags
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
          badge.className = "coping-skill-badge";
          badge.textContent = skill.short_description || skill.name || skillId;
          badge.title = skill.long_description || skill.description || ""; // Tooltip on hover
          copingSkillsContainer.appendChild(badge);
        } else {
          // If skill not found, show ID as fallback
          const badge = document.createElement("span");
          badge.className = "coping-skill-badge";
          badge.textContent = `Unknown (${skillId})`;
          badge.title = "Skill not found in database";
          copingSkillsContainer.appendChild(badge);
        }
      });
    } else {
      // Show "Not specified" if no coping skills
      copingSkillsContainer.innerHTML =
        '<span class="coping-skill-badge">Not specified</span>';
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
          badge.className = "clinical-specialty-badge";
          badge.textContent =
            specialty.short_description || specialty.name || specialtyId;
          badge.title =
            specialty.long_description || specialty.description || ""; // Tooltip on hover
          specialtiesContainer.appendChild(badge);
        } else {
          // If specialty not found, show ID as fallback
          const badge = document.createElement("span");
          badge.className = "clinical-specialty-badge";
          badge.textContent = `Unknown (${specialtyId})`;
          badge.title = "Specialty not found in database";
          specialtiesContainer.appendChild(badge);
        }
      });
    } else {
      // Show "Not specified" if no clinical specialties
      specialtiesContainer.innerHTML =
        '<span class="clinical-specialty-badge">Not specified</span>';
    }
  }

  // Update type writing - show as blue tags (like EMR)
  const typeWritingContainer = document.getElementById("profile-type-writing");
  if (typeWritingContainer) {
    if (profileData.type_writing && profileData.type_writing.length > 0) {
      typeWritingContainer.innerHTML = "";
      // Create container for tags
      const tagsContainer = document.createElement("div");
      tagsContainer.className = "emr-tags-container";
      tagsContainer.style.display = "flex";
      tagsContainer.style.flexWrap = "wrap";
      tagsContainer.style.gap = "4px";
      tagsContainer.style.justifyContent = "flex-end";

      profileData.type_writing.forEach((type) => {
        const tag = document.createElement("span");
        tag.className = "emr-view-tag";
        tag.textContent = type;
        tagsContainer.appendChild(tag);
      });

      typeWritingContainer.appendChild(tagsContainer);
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
    if (companyEmr) {
      // Handle emr as array - display as blue tags
      const emrArray = profileData.company.emr;
      if (emrArray && Array.isArray(emrArray) && emrArray.length > 0) {
        // Clear existing content
        companyEmr.innerHTML = "";
        // Create container for tags
        const tagsContainer = document.createElement("div");
        tagsContainer.className = "emr-tags-container";
        tagsContainer.style.display = "flex";
        tagsContainer.style.flexWrap = "wrap";
        tagsContainer.style.gap = "4px";
        tagsContainer.style.justifyContent = "flex-end";

        // Create a tag for each EMR
        emrArray.forEach((emrValue) => {
          const tag = document.createElement("span");
          tag.className = "emr-view-tag";
          tag.textContent = emrValue;
          tagsContainer.appendChild(tag);
        });

        companyEmr.appendChild(tagsContainer);
      } else {
        companyEmr.textContent = "Not specified";
      }
    }
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
  const bottomEditBtn = document.getElementById(
    "edit-personal-info-bottom-btn"
  );
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
    } else if (fieldName === "user-type") {
      input = document.createElement("select");
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Select user type...";
      input.appendChild(defaultOption);

      const userTypeOptions = [
        "Technology",
        "Healthcare",
        "Finance",
        "Education",
        "Retail",
        "Energy",
        "Nonprofit",
        "Other",
      ];

      userTypeOptions.forEach((option) => {
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
      addDiv.innerHTML = "<label>Select Coping Skill:</label>";

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
      addDiv.innerHTML = "<label>Select Clinical Specialty:</label>";

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
  console.log("✏️ Editing EMR Personalization...");

  const emrInfoSection = document.getElementById("emr-info-content");
  if (!emrInfoSection) {
    console.error(
      "❌ EMR Personalization section not found. Make sure you're on the profile page."
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
      <h5>Existing EMR Personalizations:</h5>
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
    <div style="text-align: center; margin-top: 12px; color: #6B7280; font-size: 13px; font-weight: 500;">
      Personalize Your Notes
    </div>
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

  // Add other EMR Personalization fields (Coping Skills, Clinical Specialties, Type Writing)
  const otherFieldsSection = document.createElement("div");
  otherFieldsSection.style.marginTop = "20px";
  otherFieldsSection.innerHTML = `
    <div class="form-group" style="margin-bottom: 16px;">
      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 8px; font-size: 14px;">Coping Skills:</label>
      <div class="badges-container" id="edit-coping-skills" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;"></div>
      <select id="add-coping-skill" class="edit-input">
        <option value="">Select Coping Skill...</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom: 16px;">
      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 8px; font-size: 14px;">Clinical Specialties:</label>
      <div class="badges-container" id="edit-clinical-specialties" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;"></div>
      <select id="add-clinical-specialty" class="edit-input">
        <option value="">Select Clinical Specialty...</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom: 16px;">
      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 8px; font-size: 14px;">Type Writing:</label>
      <div id="type-writing-dropdown-container" class="array-edit-container"></div>
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

  // Create custom dropdown for Type Writing (multi-select like EMR)
  const typeWritingContainer = document.getElementById(
    "type-writing-dropdown-container"
  );
  if (typeWritingContainer) {
    // Store original Type Writing values for cancel
    const currentTypeWritingArray = Array.isArray(
      window.currentProfileData?.type_writing
    )
      ? window.currentProfileData.type_writing
      : window.currentProfileData?.type_writing
      ? [window.currentProfileData.type_writing]
      : [];

    window.originalTypeWriting = JSON.parse(
      JSON.stringify(currentTypeWritingArray)
    );

    // Create custom dropdown wrapper
    const dropdownWrapper = document.createElement("div");
    dropdownWrapper.className = "custom-emr-dropdown-wrapper";

    // Create the dropdown button/input
    const dropdownButton = document.createElement("div");
    dropdownButton.className = "custom-emr-dropdown-button";

    // Create container for selected tags
    const selectedTagsContainer = document.createElement("div");
    selectedTagsContainer.className = "dropdown-selected-tags";

    // Create placeholder
    const placeholder = document.createElement("span");
    placeholder.className = "dropdown-placeholder";
    placeholder.textContent = "Search options...";

    // Create arrow icon
    const arrowIcon = document.createElement("span");
    arrowIcon.className = "dropdown-arrow-icon";
    arrowIcon.textContent = "▼";

    // Function to update button content
    const updateTypeWritingButton = () => {
      const currentArray = Array.isArray(
        window.currentProfileData?.type_writing
      )
        ? window.currentProfileData.type_writing
        : window.currentProfileData?.type_writing
        ? [window.currentProfileData.type_writing]
        : [];

      selectedTagsContainer.innerHTML = "";

      if (currentArray.length > 0) {
        currentArray.forEach((value) => {
          const tag = document.createElement("span");
          tag.className = "dropdown-tag";
          tag.innerHTML = `
            <span class="dropdown-tag-text">${value}</span>
            <button class="dropdown-tag-remove" data-value="${value}" title="Remove">×</button>
          `;
          selectedTagsContainer.appendChild(tag);
        });

        // Add event listeners to remove buttons
        selectedTagsContainer
          .querySelectorAll(".dropdown-tag-remove")
          .forEach((btn) => {
            btn.addEventListener("click", function (e) {
              e.stopPropagation();
              const typeWritingValue = this.getAttribute("data-value");
              // Find the menu item and toggle it to remove
              const menuItem = dropdownMenu.querySelector(
                `[data-value="${typeWritingValue}"]`
              );
              if (menuItem) {
                toggleTypeWritingSelection(
                  typeWritingValue,
                  menuItem,
                  dropdownMenu,
                  updateTypeWritingButton
                );
              }
            });
          });

        placeholder.style.display = "none";
      } else {
        placeholder.style.display = "inline";
      }
    };

    // Initial update
    updateTypeWritingButton();

    dropdownButton.appendChild(selectedTagsContainer);
    dropdownButton.appendChild(placeholder);
    dropdownButton.appendChild(arrowIcon);

    // Create the dropdown menu
    const dropdownMenu = document.createElement("div");
    dropdownMenu.className = "custom-emr-dropdown-menu";
    dropdownMenu.style.display = "none";

    // Type Writing options
    const typeWritingOptions = ["Soft", "Medium", "Hard"];

    // Add all options to dropdown (show selected with checkmarks)
    typeWritingOptions.forEach((optionValue) => {
      const isSelected = currentTypeWritingArray.includes(optionValue);

      const menuItem = document.createElement("div");
      menuItem.className = `custom-emr-dropdown-item ${
        isSelected ? "selected" : ""
      }`;
      menuItem.dataset.value = optionValue;
      menuItem.innerHTML = `
        <span class="item-text">${optionValue}</span>
        ${isSelected ? '<span class="checkmark">✓</span>' : ""}
      `;

      // Toggle selection on click
      menuItem.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleTypeWritingSelection(
          optionValue,
          menuItem,
          dropdownMenu,
          updateTypeWritingButton
        );
      });

      dropdownMenu.appendChild(menuItem);
    });

    dropdownWrapper.appendChild(dropdownButton);
    dropdownWrapper.appendChild(dropdownMenu);
    typeWritingContainer.appendChild(dropdownWrapper);

    // Toggle dropdown on button click
    let clickOutsideHandler = null;
    dropdownButton.addEventListener("click", function (e) {
      e.stopPropagation();
      const isOpen = dropdownMenu.style.display === "block";
      dropdownMenu.style.display = isOpen ? "none" : "block";
      if (!isOpen) {
        dropdownButton.classList.add("active");
        clickOutsideHandler = function (e) {
          if (!dropdownWrapper.contains(e.target)) {
            dropdownMenu.style.display = "none";
            dropdownButton.classList.remove("active");
            document.removeEventListener("click", clickOutsideHandler);
            clickOutsideHandler = null;
          }
        };
        setTimeout(() => {
          document.addEventListener("click", clickOutsideHandler);
        }, 0);
      } else {
        dropdownButton.classList.remove("active");
        if (clickOutsideHandler) {
          document.removeEventListener("click", clickOutsideHandler);
          clickOutsideHandler = null;
        }
      }
    });

    // Store reference for updates
    window.currentTypeWritingDropdown = {
      wrapper: dropdownWrapper,
      menu: dropdownMenu,
      button: dropdownButton,
      currentArray: currentTypeWritingArray,
      updateButton: updateTypeWritingButton,
    };
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

  // Add save/cancel buttons for EMR Personalization
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "edit-buttons";
  buttonContainer.style.marginTop = "20px";
  buttonContainer.style.paddingTop = "20px";
  buttonContainer.style.borderTop = "1px solid #e9ecef";
  buttonContainer.innerHTML = `
    <button class="btn btn-primary" id="save-emr-info-btn" style="display: block !important; visibility: visible !important;">Save</button>
    <button class="btn btn-secondary" id="cancel-emr-info-btn" style="display: block !important; visibility: visible !important;">Cancel</button>
  `;

  emrInfoSection.appendChild(buttonContainer);
  console.log("✅ EMR Personalization Save/Cancel buttons added");
  console.log("🔍 Button container HTML:", buttonContainer.innerHTML);
  console.log(
    "🔍 EMR Personalization section children count:",
    emrInfoSection.children.length
  );

  // Add event listeners for EMR Personalization buttons using event delegation

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

    // Get filtered EMR types (only those in company.emr)
    const filteredEmrTypes = getFilteredEmrTypes();

    // Repopulate with available options
    filteredEmrTypes.forEach((emrType) => {
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

  // Get filtered EMR types (only those in company.emr)
  const filteredEmrTypes = getFilteredEmrTypes();

  // Refresh all dropdowns
  allForms.forEach((form) => {
    const select = form.querySelector(".emr-type-select");
    if (select && filteredEmrTypes.length > 0) {
      const currentValue = select.value;

      // Clear and repopulate
      select.innerHTML = '<option value="">Select EMR Type...</option>';

      filteredEmrTypes.forEach((emrType) => {
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

// Helper function to filter EMR types based on company.emr
function getFilteredEmrTypes() {
  if (!window.profileAdditionalData || !window.profileAdditionalData.emrTypes) {
    return [];
  }

  // Get company EMR array
  const companyEmrArray = Array.isArray(window.currentProfileData?.company?.emr)
    ? window.currentProfileData.company.emr
    : window.currentProfileData?.company?.emr
    ? [window.currentProfileData.company.emr]
    : [];

  // If no company EMR specified, return empty array (show nothing)
  if (companyEmrArray.length === 0) {
    return [];
  }

  // Filter EMR types to only include those in company.emr
  return window.profileAdditionalData.emrTypes.filter((emrType) =>
    companyEmrArray.includes(emrType.name)
  );
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

  // Get filtered EMR types (only those in company.emr)
  const filteredEmrTypes = getFilteredEmrTypes();
  console.log(
    "📋 Filtered EMR Types based on company.emr:",
    filteredEmrTypes.length
  );

  // Populate EMR Types (excluding already-used ones)
  if (filteredEmrTypes.length > 0) {
    console.log("📋 Populating EMR Types dropdown...");
    let addedCount = 0;
    filteredEmrTypes.forEach((emrType) => {
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
  console.log("💾 Saving EMR Personalization...");

  try {
    // Get token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      showErrorMessage("Please log in again to save EMR Personalization.");
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

    // Get Type Writing values (now an array from custom dropdown)
    const typeWritingArray = Array.isArray(
      window.currentProfileData?.type_writing
    )
      ? window.currentProfileData.type_writing
      : window.currentProfileData?.type_writing
      ? [window.currentProfileData.type_writing]
      : [];

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
      type_writing: typeWritingArray,
    };

    console.log("📦 Saving pairs:", allPairs);

    // Make API call to save EMR Personalization
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
    console.log("✅ EMR Personalization updated:", updatedData);

    // Update stored data
    window.currentProfileData = updatedData;

    // Show success message
    showSuccessMessage("EMR Personalization saved successfully!");

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
      console.log("✅ Restored EMR Personalization view mode HTML structure");
    }

    // Clear stored original Type Writing after successful save
    if (window.originalTypeWriting) {
      delete window.originalTypeWriting;
    }

    // Reload profile page to populate the view mode with updated data
    updateProfilePage(updatedData, window.profileAdditionalData);

    // Show bottom edit button again
    const emrBottomBtn = document.getElementById("edit-emr-info-bottom-btn");
    if (emrBottomBtn) {
      emrBottomBtn.style.display = "flex";
    }

    showSuccessMessage("EMR Personalization saved successfully!");

    // Re-fetch and update EMR URL cache after saving
    await fetchAndCacheEMRUrl(tokenResult.accessToken);
    console.log("✅ EMR URL cache updated after save");
  } catch (error) {
    console.error("❌ Error saving EMR Personalization:", error);
    showErrorMessage("Failed to save EMR Personalization. Please try again.");
  }
}

function cancelEditEMRInfo() {
  console.log("❌ Canceling EMR Personalization edit...");

  // Restore original Type Writing values if they were stored
  if (window.originalTypeWriting !== undefined) {
    window.currentProfileData.type_writing = JSON.parse(
      JSON.stringify(window.originalTypeWriting)
    );
    delete window.originalTypeWriting;
  }

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
    console.log("✅ Restored EMR Personalization HTML structure");
  }

  // Now reload the profile data which will populate the restored structure
  loadProfileData();

  // Show bottom edit button again
  const emrBottomBtn = document.getElementById("edit-emr-info-bottom-btn");
  if (emrBottomBtn) {
    emrBottomBtn.style.display = "flex";
  }

  console.log("✅ EMR Personalization edit cancelled - reloading profile data");
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
    const personalBottomBtn = document.getElementById(
      "edit-personal-info-bottom-btn"
    );
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
  const personalBottomBtn = document.getElementById(
    "edit-personal-info-bottom-btn"
  );
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
async function editCompanyInfo() {
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

  // Fetch EMR types if not already available
  let emrTypes = [];
  if (window.profileAdditionalData?.emrTypes) {
    emrTypes = window.profileAdditionalData.emrTypes;
    console.log("✅ Using cached EMR types:", emrTypes);
  } else {
    console.log("🔄 Fetching EMR types from API...");
    try {
      const result = await chrome.storage.local.get(["accessToken"]);
      if (result.accessToken) {
        const response = await fetch(`${API_BASE_URL}/emr-types/`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${result.accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          emrTypes = await response.json();
          console.log("✅ EMR types fetched:", emrTypes);
        } else {
          console.error("❌ Failed to fetch EMR types:", response.status);
        }
      }
    } catch (error) {
      console.error("❌ Error fetching EMR types:", error);
    }
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
    } else if (fieldName === "industry") {
      input = document.createElement("select");
      // Add placeholder option first
      const placeholderOption = document.createElement("option");
      placeholderOption.value = "";
      placeholderOption.textContent = "Select a industry...";
      input.appendChild(placeholderOption);
      // Add industry options
      const industryOptions = [
        "Technology",
        "Healthcare",
        "Finance",
        "Education",
        "Retail",
        "Energy",
        "Nonprofit",
        "Other",
      ];
      industryOptions.forEach((optionValue) => {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
        input.appendChild(option);
      });
    } else if (fieldName === "emr") {
      // Create container for EMR multi-select management
      const container = document.createElement("div");
      container.className = "array-edit-container";

      // Get current EMR values (handle both array and string for backward compatibility)
      const currentEmrArray = Array.isArray(
        window.currentProfileData.company?.emr
      )
        ? window.currentProfileData.company.emr
        : window.currentProfileData.company?.emr
        ? [window.currentProfileData.company.emr]
        : [];

      // Store original EMR array for cancel functionality
      window.originalCompanyEmr = JSON.parse(JSON.stringify(currentEmrArray));

      // Create custom dropdown that stays open and shows selected items inside
      const addDiv = document.createElement("div");
      addDiv.className = "add-item";

      // Create custom dropdown wrapper
      const dropdownWrapper = document.createElement("div");
      dropdownWrapper.className = "custom-emr-dropdown-wrapper";

      // Create the dropdown button/input
      const dropdownButton = document.createElement("div");
      dropdownButton.className = "custom-emr-dropdown-button";

      // Create container for selected tags
      const selectedTagsContainer = document.createElement("div");
      selectedTagsContainer.className = "dropdown-selected-tags";

      // Create placeholder
      const placeholder = document.createElement("span");
      placeholder.className = "dropdown-placeholder";
      placeholder.textContent = "Search options...";

      // Create arrow icon
      const arrowIcon = document.createElement("span");
      arrowIcon.className = "dropdown-arrow-icon";
      arrowIcon.textContent = "▼";

      // Function to update button content
      const updateDropdownButton = () => {
        const currentEmrArray = Array.isArray(
          window.currentProfileData.company?.emr
        )
          ? window.currentProfileData.company.emr
          : window.currentProfileData.company?.emr
          ? [window.currentProfileData.company.emr]
          : [];

        selectedTagsContainer.innerHTML = "";

        if (currentEmrArray.length > 0) {
          currentEmrArray.forEach((emrValue) => {
            const tag = document.createElement("span");
            tag.className = "dropdown-tag";
            tag.innerHTML = `
              <span class="dropdown-tag-text">${emrValue}</span>
              <button class="dropdown-tag-remove" data-emr="${emrValue}" title="Remove">×</button>
            `;
            selectedTagsContainer.appendChild(tag);
          });

          // Add event listeners to remove buttons
          selectedTagsContainer
            .querySelectorAll(".dropdown-tag-remove")
            .forEach((btn) => {
              btn.addEventListener("click", function (e) {
                e.stopPropagation();
                e.preventDefault();
                const emrName = this.getAttribute("data-emr");
                // Find the menu item and toggle it to remove
                const menuItem = dropdownMenu.querySelector(
                  `[data-value="${emrName}"]`
                );
                if (menuItem) {
                  toggleEmrSelection(emrName, menuItem, dropdownMenu);
                }
              });
            });

          placeholder.style.display = "none";
        } else {
          placeholder.style.display = "inline";
        }
      };

      // Initial update
      updateDropdownButton();

      dropdownButton.appendChild(selectedTagsContainer);
      dropdownButton.appendChild(placeholder);
      dropdownButton.appendChild(arrowIcon);

      // Create the dropdown menu
      const dropdownMenu = document.createElement("div");
      dropdownMenu.className = "custom-emr-dropdown-menu";
      dropdownMenu.style.display = "none";

      // Add all EMR types to dropdown (show selected with checkmarks)
      emrTypes.forEach((emrType) => {
        const emrName = emrType.name || emrType.id || "Unknown";
        const isSelected = currentEmrArray.includes(emrName);

        const menuItem = document.createElement("div");
        menuItem.className = `custom-emr-dropdown-item ${
          isSelected ? "selected" : ""
        }`;
        menuItem.dataset.value = emrName;
        menuItem.innerHTML = `
          <span class="item-text">${emrName}</span>
          ${isSelected ? '<span class="checkmark">✓</span>' : ""}
        `;

        // Toggle selection on click
        menuItem.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleEmrSelection(emrName, menuItem, dropdownMenu);
        });

        dropdownMenu.appendChild(menuItem);
      });

      dropdownWrapper.appendChild(dropdownButton);
      dropdownWrapper.appendChild(dropdownMenu);
      addDiv.appendChild(dropdownWrapper);
      container.appendChild(addDiv);

      // Toggle dropdown on button click
      let clickOutsideHandler = null;
      dropdownButton.addEventListener("click", function (e) {
        e.stopPropagation();
        const isOpen = dropdownMenu.style.display === "block";
        dropdownMenu.style.display = isOpen ? "none" : "block";
        if (!isOpen) {
          dropdownButton.classList.add("active");
          // Add click outside handler when opening
          clickOutsideHandler = function (e) {
            if (!dropdownWrapper.contains(e.target)) {
              dropdownMenu.style.display = "none";
              dropdownButton.classList.remove("active");
              document.removeEventListener("click", clickOutsideHandler);
              clickOutsideHandler = null;
            }
          };
          // Use setTimeout to avoid immediate closure
          setTimeout(() => {
            document.addEventListener("click", clickOutsideHandler);
          }, 0);
        } else {
          dropdownButton.classList.remove("active");
          if (clickOutsideHandler) {
            document.removeEventListener("click", clickOutsideHandler);
            clickOutsideHandler = null;
          }
        }
      });

      // Store reference for updates (after all elements are created)
      window.currentEmrDropdown = {
        wrapper: dropdownWrapper,
        menu: dropdownMenu,
        button: dropdownButton,
        currentArray: currentEmrArray,
        updateButton: updateDropdownButton,
      };

      field.innerHTML = "";
      field.appendChild(container);
      return; // Skip normal input creation
    } else {
      input = document.createElement("input");
      input.type = "text";
    }

    // Set the value - for dropdowns, if empty or "Not specified", use empty string to show placeholder
    if (fieldName === "industry") {
      // For dropdowns, if current value is empty, "Not specified", or doesn't match any option, use empty string
      const trimmedValue = (currentValue || "").trim();
      if (trimmedValue === "" || trimmedValue === "Not specified") {
        // Show placeholder when value is empty
        input.value = "";
        input.selectedIndex = 0;
      } else {
        // Try to find matching option by value first, then by text content
        let matchingOption = null;
        for (let i = 0; i < input.options.length; i++) {
          const opt = input.options[i];
          if (opt.value === trimmedValue || opt.textContent === trimmedValue) {
            matchingOption = opt;
            break;
          }
        }

        if (matchingOption && matchingOption.value !== "") {
          // Found a match - select that option
          input.value = matchingOption.value;
        } else {
          // No match found - show placeholder
          input.value = "";
          input.selectedIndex = 0;
        }
      }
    } else {
      input.value = currentValue === "Not specified" ? "" : currentValue;
    }

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

  // Add event listeners for remove EMR buttons
  const removeEmrBtns = companyInfoSection.querySelectorAll(
    ".remove-company-emr-btn"
  );
  removeEmrBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      const index = parseInt(this.getAttribute("data-index"));
      removeCompanyEmr(index);
    });
  });
}

// Toggle Type Writing selection in custom dropdown
function toggleTypeWritingSelection(
  optionValue,
  menuItem,
  dropdownMenu,
  updateButton
) {
  // Get current Type Writing array
  const currentArray = Array.isArray(window.currentProfileData?.type_writing)
    ? window.currentProfileData.type_writing
    : window.currentProfileData?.type_writing
    ? [window.currentProfileData.type_writing]
    : [];

  const isSelected = currentArray.includes(optionValue);

  // Initialize type_writing if needed
  if (!window.currentProfileData.type_writing) {
    window.currentProfileData.type_writing = [];
  }

  if (isSelected) {
    // Remove from array
    const index = currentArray.indexOf(optionValue);
    if (index > -1) {
      window.currentProfileData.type_writing = currentArray;
      window.currentProfileData.type_writing.splice(index, 1);
      menuItem.classList.remove("selected");
      menuItem.querySelector(".checkmark")?.remove();
    }
  } else {
    // Add to array
    window.currentProfileData.type_writing = currentArray;
    window.currentProfileData.type_writing.push(optionValue);
    menuItem.classList.add("selected");
    const checkmark = document.createElement("span");
    checkmark.className = "checkmark";
    checkmark.textContent = "✓";
    menuItem.querySelector(".item-text").after(checkmark);
  }

  // Update stored reference and button display
  if (window.currentTypeWritingDropdown && updateButton) {
    window.currentTypeWritingDropdown.currentArray =
      window.currentProfileData.type_writing || [];
    updateButton();
  }
}

// Toggle EMR selection in custom dropdown
function toggleEmrSelection(emrName, menuItem, dropdownMenu) {
  // Get current EMR array
  const currentEmrArray = Array.isArray(window.currentProfileData.company?.emr)
    ? window.currentProfileData.company.emr
    : window.currentProfileData.company?.emr
    ? [window.currentProfileData.company.emr]
    : [];

  const isSelected = currentEmrArray.includes(emrName);

  // Initialize company.emr if needed
  if (!window.currentProfileData.company) {
    window.currentProfileData.company = {};
  }

  if (isSelected) {
    // Remove from array
    const index = currentEmrArray.indexOf(emrName);
    if (index > -1) {
      window.currentProfileData.company.emr = currentEmrArray;
      window.currentProfileData.company.emr.splice(index, 1);
      menuItem.classList.remove("selected");
      menuItem.querySelector(".checkmark")?.remove();
    }
  } else {
    // Add to array
    window.currentProfileData.company.emr = currentEmrArray;
    window.currentProfileData.company.emr.push(emrName);
    menuItem.classList.add("selected");
    const checkmark = document.createElement("span");
    checkmark.className = "checkmark";
    checkmark.textContent = "✓";
    menuItem.querySelector(".item-text").after(checkmark);
  }

  // Update stored reference and button display
  if (window.currentEmrDropdown && window.currentEmrDropdown.updateButton) {
    window.currentEmrDropdown.currentArray =
      window.currentProfileData.company.emr || [];
    window.currentEmrDropdown.updateButton();
  }
}

function addCompanyEmr() {
  // This function is no longer used with custom dropdown, but keeping for compatibility
  console.log("⚠️ addCompanyEmr called but custom dropdown is in use");
}

function removeCompanyEmr(index) {
  console.log("🗑️ Removing company EMR at index:", index);

  const currentEmrArray = Array.isArray(window.currentProfileData.company?.emr)
    ? window.currentProfileData.company.emr
    : window.currentProfileData.company?.emr
    ? [window.currentProfileData.company.emr]
    : [];

  if (currentEmrArray && currentEmrArray.length > index) {
    const removedValue = currentEmrArray[index];
    currentEmrArray.splice(index, 1);
    window.currentProfileData.company.emr =
      currentEmrArray.length > 0 ? currentEmrArray : null;

    // Update custom dropdown if it exists
    if (window.currentEmrDropdown && window.currentEmrDropdown.menu) {
      const menuItem = window.currentEmrDropdown.menu.querySelector(
        `[data-value="${removedValue}"]`
      );
      if (menuItem) {
        menuItem.classList.remove("selected");
        menuItem.querySelector(".checkmark")?.remove();
      }
      // Update stored reference and button display
      if (window.currentEmrDropdown && window.currentEmrDropdown.updateButton) {
        window.currentEmrDropdown.currentArray =
          window.currentProfileData.company.emr || [];
        window.currentEmrDropdown.updateButton();
      }
    }
  }
}

// Save Company Info function
async function saveCompanyInfo() {
  try {
    console.log("💾 Saving Company Info...");

    // Get form data
    const nameField = document.getElementById("edit-company-name");
    const industryField = document.getElementById("edit-company-industry");
    const addressField = document.getElementById("edit-company-address");
    // The edit function creates it as edit-company-status (from profile-company-status)
    const isActiveField = document.getElementById("edit-company-status");

    console.log("🔍 Company form fields:", {
      nameField: !!nameField,
      industryField: !!industryField,
      addressField: !!addressField,
      isActiveField: !!isActiveField,
    });

    if (!nameField || !industryField || !addressField || !isActiveField) {
      showErrorMessage("Edit form not found. Please try editing again.");
      console.log("❌ Missing fields - cannot save");
      return;
    }

    // Get EMR array from current profile data (updated by add/remove functions)
    const emrArray = Array.isArray(window.currentProfileData.company?.emr)
      ? window.currentProfileData.company.emr
      : window.currentProfileData.company?.emr
      ? [window.currentProfileData.company.emr]
      : null;

    const formData = {
      name: nameField.value,
      industry: industryField.value,
      emr: emrArray, // Send as array (or null if empty)
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

    // Clear stored original EMR array after successful save
    if (window.originalCompanyEmr) {
      delete window.originalCompanyEmr;
    }

    // Show bottom edit button again
    const companyBottomBtn = document.getElementById(
      "edit-company-info-bottom-btn"
    );
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

      // Also remove array edit containers (for EMR multi-select)
      const arrayContainers = field.querySelectorAll(".array-edit-container");
      arrayContainers.forEach((container) => container.remove());

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
        // Restore original EMR array (before any edits)
        if (window.originalCompanyEmr) {
          window.currentProfileData.company.emr = JSON.parse(
            JSON.stringify(window.originalCompanyEmr)
          );
        }
        // Handle emr as array
        const emrArray = window.currentProfileData.company?.emr;
        if (emrArray && Array.isArray(emrArray) && emrArray.length > 0) {
          originalValue = emrArray.join(", ");
        } else {
          originalValue = "Not specified";
        }
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

  // Clear stored original EMR array
  if (window.originalCompanyEmr) {
    delete window.originalCompanyEmr;
  }

  // Show bottom edit button again
  const companyBottomBtn = document.getElementById(
    "edit-company-info-bottom-btn"
  );
  if (companyBottomBtn) {
    companyBottomBtn.style.display = "flex";
  }

  console.log("✅ Company Info edit cancelled");
}

// Helper: set all Generate / Re-generate buttons into loading state with spinner
function setGenerateButtonsLoading(label) {
  const generateButtons = document.querySelectorAll(
    ".generate-ai-notes-button, .re-generate-button"
  );
  generateButtons.forEach((button) => {
    button.disabled = true;
    button.innerHTML = `<span class="button-spinner"></span><span class="button-label">${label}</span>`;
  });
}

// Helper: reset all Generate / Re-generate buttons to a given label
function resetGenerateButtons(label) {
  const generateButtons = document.querySelectorAll(
    ".generate-ai-notes-button, .re-generate-button"
  );
  generateButtons.forEach((button) => {
    button.disabled = false;
    button.textContent = label;
  });
}

// Helper: loading state for a single button (e.g. auto-detected page)
function setSingleGenerateButtonLoading(button, label) {
  if (!button) return;
  button.disabled = true;
  button.innerHTML = `<span class="button-spinner"></span><span class="button-label">${label}</span>`;
}

function resetSingleGenerateButton(button, label) {
  if (!button) return;
  button.disabled = false;
  button.textContent = label;
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

    // Show loading state for both buttons (with spinner)
    setGenerateButtonsLoading("Generating...");

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
    resetGenerateButtons("Re-generate");

    // Show success message
    showSuccessMessage("AI Notes generated successfully!");

    // Switch to AI Notes tab to show the generated content
    switchToAINotesTab();
  } catch (error) {
    console.error("❌ Error generating AI notes:", error);
    showErrorMessage("Failed to generate AI notes. Please try again.");

    // Reset button state for both buttons
    resetGenerateButtons("Generate AI Notes");
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

    let session = sessionResult.currentSession;
    console.log("📋 Loading AI Notes for session:", session.id);

    // Always fetch fresh session data from API to ensure we have the latest AI notes from database
    try {
      const tokenResult = await chrome.storage.local.get(["accessToken"]);
      if (tokenResult.accessToken) {
        console.log(
          "🔄 Fetching fresh session data from API to get latest AI notes..."
        );
        const response = await fetch(`${API_BASE_URL}/sessions/${session.id}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          session = await response.json();
          console.log("✅ Fetched fresh session from API with AI notes:", {
            hasMethods: !!session.methods_response,
            hasProgress: !!session.progress_towards_goal_response,
            hasRecommended: !!session.recommended_changes_response,
          });
          // Update stored session with fresh data
          chrome.storage.local.set({ currentSession: session });
        }
      }
    } catch (error) {
      console.error("❌ Error fetching fresh session:", error);
      // Continue with stored session data if API fetch fails
    }

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

function setupAddSessionModal() {
  // Close modal when clicking X
  const closeBtn = document.getElementById("close-add-session");
  if (closeBtn) {
    closeBtn.addEventListener("click", hideAddSessionModal);
  }

  // Close modal when clicking outside
  const modal = document.getElementById("add-session-modal");
  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        hideAddSessionModal();
      }
    });
  }

  // Save session button
  const saveBtn = document.getElementById("save-add-session");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveNewSession);
  }
}

function hideAddSessionModal() {
  const modal = document.getElementById("add-session-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

async function showAddSessionModal() {
  const modal = document.getElementById("add-session-modal");
  if (!modal) return;

  // Clear the form first
  const form = document.getElementById("add-session-form");
  if (form) {
    form.reset();
  }

  // Clear dynamic fields container
  const container = document.getElementById(
    "add-session-dynamic-fields-container"
  );
  if (container) {
    container.innerHTML =
      '<p style="color: #666; text-align: center;">Select an EMR Type to load fields</p>';
  }

  modal.style.display = "block";

  // Load clients and EMR types
  await loadClientsForSessionModal();
  await loadEMRTypesForSessionModal();

  // Setup EMR type change handler to load dynamic fields
  const emrTypeSelect = document.getElementById("new-session-emr-type");
  if (emrTypeSelect) {
    // Remove existing listeners to prevent duplicates
    const newEmrTypeSelect = emrTypeSelect.cloneNode(true);
    emrTypeSelect.parentNode.replaceChild(newEmrTypeSelect, emrTypeSelect);

    newEmrTypeSelect.addEventListener("change", async function () {
      const emrTypeId = this.value;
      if (emrTypeId) {
        console.log("🔑 EMR Type selected:", emrTypeId);
        await loadAddSessionDynamicFields(emrTypeId);
      } else {
        // Clear fields if no EMR type selected
        const container = document.getElementById(
          "add-session-dynamic-fields-container"
        );
        if (container) {
          container.innerHTML =
            '<p style="color: #666; text-align: center;">Select an EMR Type to load fields</p>';
        }
      }
    });
  }

  // Pre-select current client if viewing from client detail page
  chrome.storage.local.get(["currentClient"], function (result) {
    if (result.currentClient && result.currentClient.clientId) {
      const clientSelect = document.getElementById("new-session-client");
      if (clientSelect) {
        clientSelect.value = result.currentClient.clientId;
      }
    }
  });
}

async function loadClientsForSessionModal() {
  const clientSelect = document.getElementById("new-session-client");
  if (!clientSelect) return;

  try {
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_BASE_URL}/api/Clients`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      handle401Error();
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch clients: ${response.status}`);
    }

    const clients = await response.json();
    console.log("👥 Clients loaded for modal:", clients);

    // Clear existing options except the first one
    clientSelect.innerHTML = '<option value="">Select Client</option>';

    // Add clients to dropdown
    clients.forEach((client) => {
      const option = document.createElement("option");
      option.value = client.id || client.client_id;
      option.textContent =
        `${client.first_name || ""} ${client.last_name || ""}`.trim() ||
        "Unknown Client";
      clientSelect.appendChild(option);
    });
  } catch (error) {
    console.error("❌ Error loading clients:", error);
    showErrorMessage("Failed to load clients");
  }
}

async function loadEMRTypesForSessionModal() {
  const emrTypeSelect = document.getElementById("new-session-emr-type");
  if (!emrTypeSelect) return;

  try {
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_BASE_URL}/emr-types/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      handle401Error();
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch EMR types: ${response.status}`);
    }

    const emrTypes = await response.json();
    console.log("📋 EMR types loaded for modal:", emrTypes);

    // Clear existing options except the first one
    emrTypeSelect.innerHTML = '<option value="">Select EMR Type</option>';

    // Add EMR types to dropdown
    emrTypes.forEach((emrType) => {
      const option = document.createElement("option");
      option.value = emrType.id;
      option.textContent = emrType.name || "Unknown Type";
      emrTypeSelect.appendChild(option);
    });
  } catch (error) {
    console.error("❌ Error loading EMR types:", error);
    showErrorMessage("Failed to load EMR types");
  }
}
// Fetch all modalities
async function fetchModalities() {
  try {
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_BASE_URL}/modalities/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      handle401Error();
      return [];
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch modalities: ${response.status}`);
    }

    const modalities = await response.json();
    console.log("📋 Modalities loaded:", modalities);
    return modalities;
  } catch (error) {
    console.error("❌ Error loading modalities:", error);
    return [];
  }
}

// Fetch all modality steps
async function fetchModalitySteps() {
  try {
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_BASE_URL}/modality-steps/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      handle401Error();
      return [];
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch modality steps: ${response.status}`);
    }

    const modalitySteps = await response.json();
    console.log("📋 Modality Steps loaded:", modalitySteps);
    return modalitySteps;
  } catch (error) {
    console.error("❌ Error loading modality steps:", error);
    return [];
  }
}
async function loadAddSessionDynamicFields(emrTypeId) {
  const container = document.getElementById(
    "add-session-dynamic-fields-container"
  );
  if (!container) return;

  // Clear existing dynamic fields
  container.innerHTML = "<p>Loading fields...</p>";

  try {
    // Get dynamic fields data (just the field definitions, not values)
    const dynamicFields = await getSessionDetailFields(emrTypeId);
    console.log("📋 Dynamic fields for new session:", dynamicFields);

    // Check if there are any fields available (confirmed results OR manual fields)
    const hasConfirmedResults =
      dynamicFields &&
      dynamicFields.confirmedResults &&
      dynamicFields.confirmedResults.length > 0;
    const hasManualFields =
      dynamicFields &&
      dynamicFields.manualFields &&
      dynamicFields.manualFields.length > 0;

    if (!hasConfirmedResults && !hasManualFields) {
      container.innerHTML = "<p>No fields available for this session type.</p>";
      return;
    }

    // Clear loading message
    container.innerHTML = "";

    // Create EMPTY form fields for each dynamic field (for creating new session)
    if (hasConfirmedResults) {
      dynamicFields.confirmedResults.forEach((result) => {
        // Skip "client" or "client name" field as it's already shown as a static field at the top
        const keyLower = result.key ? result.key.toLowerCase().trim() : "";
        if (keyLower === "client" || keyLower === "client name") {
          console.log(
            "⏭️ Skipping client field - already shown as static field:",
            result.key
          );
          return;
        }

        // Get the field type from EMR type fields
        let emrField = dynamicFields.fields.find(
          (field) => field.name === result.key
        );

        // Try case-insensitive matching if exact match not found
        if (!emrField) {
          emrField = dynamicFields.fields.find((field) => {
            if (!field.name) return false;
            const normalizedFieldName = field.name
              .toLowerCase()
              .replace(/-/g, " ") // Replace hyphens with spaces
              .replace(/_/g, " ") // Replace underscores with spaces
              .replace(/\s+/g, " ") // Normalize multiple spaces to single space
              .trim();
            const normalizedResultKey = result.key
              .toLowerCase()
              .replace(/-/g, " ") // Replace hyphens with spaces
              .replace(/_/g, " ") // Replace underscores with spaces
              .replace(/\s+/g, " ") // Normalize multiple spaces to single space
              .trim();
            return normalizedFieldName === normalizedResultKey;
          });
        }

        const fieldMapping = dynamicFields.fieldMapping;
        let fieldName = fieldMapping[result.key];

        if (!fieldName && emrField) {
          fieldName = emrField.api_name;
        }

        let fieldType = emrField ? emrField.type : result.type;

        if (
          result.type === "boolean" &&
          (!emrField || emrField.type !== "boolean")
        ) {
          fieldType = "boolean";
        }

        if (fieldName) {
          const fieldContainer = document.createElement("div");
          fieldContainer.className = "form-group";

          const label = document.createElement("label");
          label.textContent = formatFieldNameForDisplay(result.key);
          label.setAttribute(
            "for",
            `new-${result.key.replace(/\s+/g, "-").toLowerCase()}`
          );

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

          input.className = "form-input";
          input.name = fieldName;
          input.id = `new-${result.key.replace(/\s+/g, "-").toLowerCase()}`;

          fieldContainer.appendChild(label);
          fieldContainer.appendChild(input);
          container.appendChild(fieldContainer);
        }
      });
    }

    // Add static Modality and Modality Steps dropdowns (always shown)
    const modalities = await fetchModalities();
    const modalitySteps = await fetchModalitySteps();

    // Find the Modality field in EMR Type Fields to get the correct api_name
    const modalityEmrField = dynamicFields.fields.find(
      (field) => field.name && field.name.toLowerCase().trim() === "modality"
    );
    const modalityApiName = modalityEmrField
      ? modalityEmrField.api_name
      : "modality";

    // Find the Modality Steps field in EMR Type Fields to get the correct api_name
    const modalityStepsEmrField = dynamicFields.fields.find(
      (field) =>
        field.name &&
        field.name.toLowerCase().replace(/\s+/g, " ").trim() ===
          "modality steps"
    );
    const modalityStepsApiName = modalityStepsEmrField
      ? modalityStepsEmrField.api_name
      : "modality_step";

    console.log("🔍 Modality API names:", {
      modalityApiName,
      modalityStepsApiName,
    });

    // Create Modality dropdown
    const modalityContainer = document.createElement("div");
    modalityContainer.className = "form-group";

    const modalityLabel = document.createElement("label");
    modalityLabel.textContent = "Modality";
    modalityLabel.setAttribute("for", "new-modality");

    const modalitySelect = document.createElement("select");
    modalitySelect.className = "form-input";
    modalitySelect.name = modalityApiName; // Use api_name from EMR Type Fields
    modalitySelect.id = "new-modality";

    // Add empty option
    const emptyModalityOption = document.createElement("option");
    emptyModalityOption.value = "";
    emptyModalityOption.textContent = "Select Modality";
    modalitySelect.appendChild(emptyModalityOption);

    // Add modality options
    modalities.forEach((modality) => {
      const option = document.createElement("option");
      option.value = modality.id || modality.name;
      option.textContent = modality.name;
      modalitySelect.appendChild(option);
    });

    modalityContainer.appendChild(modalityLabel);
    modalityContainer.appendChild(modalitySelect);
    container.appendChild(modalityContainer);

    // Add event listener to Modality dropdown to filter Modality Steps
    modalitySelect.addEventListener("change", function () {
      const selectedModalityId = this.value;

      // Clear current options except the first empty option
      modalityStepsSelect.innerHTML = "";
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "Select Modality Steps";
      modalityStepsSelect.appendChild(emptyOption);

      if (selectedModalityId) {
        // Filter modality steps by modality_id
        const filteredSteps = modalitySteps.filter(
          (step) =>
            step.modality_id === selectedModalityId ||
            step.modality_id == selectedModalityId
        );

        console.log(
          "🔍 Filtered modality steps for modality ID:",
          selectedModalityId,
          filteredSteps
        );

        // Add filtered options
        filteredSteps.forEach((step) => {
          const option = document.createElement("option");
          option.value = step.id || step.name;
          option.textContent = step.name;
          modalityStepsSelect.appendChild(option);
        });
      }
    });

    // Create Modality Steps dropdown
    const modalityStepsContainer = document.createElement("div");
    modalityStepsContainer.className = "form-group";

    const modalityStepsLabel = document.createElement("label");
    modalityStepsLabel.textContent = "Modality Steps";
    modalityStepsLabel.setAttribute("for", "new-modality-steps");

    const modalityStepsSelect = document.createElement("select");
    modalityStepsSelect.className = "form-input";
    modalityStepsSelect.name = modalityStepsApiName;
    modalityStepsSelect.id = "new-modality-steps";

    // Add empty option
    const emptyStepsOption = document.createElement("option");
    emptyStepsOption.value = "";
    emptyStepsOption.textContent = "Select Modality Steps";
    modalityStepsSelect.appendChild(emptyStepsOption);

    // Add modality steps options
    modalitySteps.forEach((step) => {
      const option = document.createElement("option");
      option.value = step.id || step.name;
      option.textContent = step.name;
      modalityStepsSelect.appendChild(option);
    });

    modalityStepsContainer.appendChild(modalityStepsLabel);
    modalityStepsContainer.appendChild(modalityStepsSelect);
    container.appendChild(modalityStepsContainer);

    // ALSO create form fields for manual fields
    console.log("📋 Manual fields for EMR type:", dynamicFields.manualFields);
    if (dynamicFields.manualFields && dynamicFields.manualFields.length > 0) {
      dynamicFields.manualFields.forEach((manualField) => {
        // Skip client field
        const keyLower = manualField.name
          ? manualField.name.toLowerCase().trim()
          : "";
        if (
          keyLower === "client" ||
          keyLower === "client_id" ||
          keyLower === "client id"
        ) {
          console.log(
            "⏭️ Skipping client manual field - already shown as static field:",
            manualField.name
          );
          return;
        }

        // Match manual field with EMR Type Fields to get correct type and dropdown values
        let emrField = dynamicFields.fields.find(
          (field) => field.name === manualField.name
        );

        // Try case-insensitive matching if exact match not found
        if (!emrField) {
          emrField = dynamicFields.fields.find((field) => {
            if (!field.name) return false;
            const normalizedFieldName = field.name
              .toLowerCase()
              .replace(/-/g, " ")
              .replace(/_/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            const normalizedManualFieldName = manualField.name
              .toLowerCase()
              .replace(/-/g, " ")
              .replace(/_/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            return normalizedFieldName === normalizedManualFieldName;
          });
        }

        console.log("📋 Manual field matching:", {
          manualFieldName: manualField.name,
          emrFieldFound: !!emrField,
          emrFieldName: emrField?.name,
          emrFieldType: emrField?.type,
        });

        // Use EMR field type if found, otherwise fallback to manual field type
        const fieldType = emrField ? emrField.type : manualField.type || "text";
        const fieldName = emrField
          ? emrField.api_name
          : manualField.api_name || manualField.name;

        if (fieldName) {
          const fieldContainer = document.createElement("div");
          fieldContainer.className = "form-group";

          const label = document.createElement("label");
          label.textContent = formatFieldNameForDisplay(manualField.name);
          label.setAttribute(
            "for",
            `new-${manualField.name.replace(/\s+/g, "-").toLowerCase()}`
          );

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
            // Use EMR field dropdown values if available, otherwise fallback to manual field
            const dropdownValues =
              emrField?.dropdown_values || manualField.dropdown_values;
            if (dropdownValues) {
              const options = dropdownValues
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

          input.className = "form-input";
          input.name = fieldName;
          input.id = `new-${manualField.name
            .replace(/\s+/g, "-")
            .toLowerCase()}`;

          fieldContainer.appendChild(label);
          fieldContainer.appendChild(input);
          container.appendChild(fieldContainer);
        }
      });
    }
  } catch (error) {
    console.error("❌ Error loading dynamic fields:", error);
    container.innerHTML = "<p>Error loading fields. Please try again.</p>";
  }
}

// Find or create client by name
async function findOrCreateClient(clientName, accessToken) {
  try {
    console.log("🔍 Looking for client:", clientName);

    const response = await fetch(`${API_BASE_URL}/api/Clients`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      handle401Error();
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch clients: ${response.status}`);
    }

    const clients = await response.json();

    const nameParts = clientName.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const matchingClient = clients.find((client) => {
      const clientFullName = `${client.first_name || ""} ${
        client.last_name || ""
      }`.trim();
      return clientFullName.toLowerCase() === clientName.toLowerCase().trim();
    });

    if (matchingClient) {
      console.log("✅ Found existing client:", matchingClient);
      return matchingClient.id || matchingClient.client_id;
    }

    console.log("📝 Creating new client (auto DOB required):", {
      firstName,
      lastName,
    });

    // Generate a deterministic placeholder DOB (e.g. 25 years ago today)
    const today = new Date();
    const placeholderDOB = new Date(
      today.getFullYear() - 25,
      today.getMonth(),
      today.getDate()
    );
    const dobString = placeholderDOB.toISOString().split("T")[0]; // YYYY-MM-DD

    const createResponse = await fetch(`${API_BASE_URL}/api/Clients`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dobString,
      }),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create client`);
    }

    const newClient = await createResponse.json();
    console.log("✅ Created new client:", newClient);

    return newClient.id || newClient.client_id;
  } catch (error) {
    console.error("❌ Error in findOrCreateClient:", error);
    throw error;
  }
}

// Find or create/update session
async function findOrCreateSession(
  clientId,
  emrTypeId,
  sessionData,
  accessToken
) {
  try {
    console.log(
      "🔍 Looking for session with client_id:",
      clientId,
      "appt_date:",
      sessionData.appt_date
    );

    const response = await fetch(
      `${API_BASE_URL}/sessions?client_id=${clientId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 401) {
      handle401Error();
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.status}`);
    }

    const sessions = await response.json();

    // Get appointment date from sessionData (appt_date is timestamp without timezone)
    const apptDate = sessionData.appt_date;

    console.log("🔍 Looking for session with appt_date:", apptDate);

    // Find matching session by client_id (already filtered) and appointment date
    const matchingSession = sessions.find((session) => {
      // Get appointment date from session (appt_date is timestamp without timezone)
      const sessionApptDate = session.appt_date;

      // If either is missing, they don't match
      if (!apptDate || !sessionApptDate) {
        return false;
      }

      // Normalize timestamps to date-only for comparison (YYYY-MM-DD)
      // appt_date is timestamp without timezone, so we extract just the date portion
      const normalizeTimestampToDate = (timestampValue) => {
        if (!timestampValue) return null;
        // Parse the timestamp and extract date portion
        const date = new Date(timestampValue);
        if (isNaN(date.getTime())) return null;
        // Return date in YYYY-MM-DD format for consistent comparison
        return date.toISOString().split("T")[0];
      };

      const normalizedApptDate = normalizeTimestampToDate(apptDate);
      const normalizedSessionApptDate =
        normalizeTimestampToDate(sessionApptDate);

      // Compare normalized dates
      return normalizedApptDate && normalizedSessionApptDate
        ? normalizedApptDate === normalizedSessionApptDate
        : false;
    });

    if (matchingSession) {
      console.log(
        "✅ Found existing session (matching client_id and appt_date), updating:",
        matchingSession.id
      );

      const updateResponse = await fetch(
        `${API_BASE_URL}/sessions/${matchingSession.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sessionData),
        }
      );

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update session`);
      }

      await updateResponse.json();
      return matchingSession.id;
    }

    console.log("📝 Creating new session");

    const createResponse = await fetch(`${API_BASE_URL}/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionData),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create session`);
    }

    const newSession = await createResponse.json();
    console.log("✅ Created new session:", newSession);

    return newSession.id;
  } catch (error) {
    console.error("❌ Error in findOrCreateSession:", error);
    throw error;
  }
}

// Main handler for Generate AI Notes from detected session
async function handleGenerateAINotesFromDetected() {
  console.log("🚀 Function called!");
  console.log(
    "🔍 currentAutoDetectedScrapedData:",
    currentAutoDetectedScrapedData
  );
  console.log("🔍 currentAutoDetectedEmrTypeId:", currentAutoDetectedEmrTypeId);

  const generateButton = document.getElementById("auto-generate-button");

  try {
    console.log("🚀 Starting AI Notes generation from detected session...");

    if (generateButton) {
      setSingleGenerateButtonLoading(generateButton, "Generating...");
    }

    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      showErrorMessage("Please log in again");
      return;
    }

    if (!currentAutoDetectedScrapedData || !currentAutoDetectedDynamicFields) {
      showErrorMessage("No detected session data found");
      return;
    }

    const scrapedData = currentAutoDetectedScrapedData;

    const clientName = scrapedData.Client || scrapedData.client;
    if (!clientName) {
      showErrorMessage("Client name not found");
      return;
    }

    const clientId = await findOrCreateClient(
      clientName,
      tokenResult.accessToken
    );

    const emrTypeId = currentAutoDetectedEmrTypeId;
    console.log("🔍 DEBUG emrTypeId:", emrTypeId, typeof emrTypeId);
    console.log("🔍 DEBUG scrapedData:", scrapedData);
    if (!emrTypeId) {
      showErrorMessage("EMR Type not found");
      return;
    }

    // Collect current values from DOM (including manual fields and modality/steps that are always editable)
    const updatedScrapedData = { ...scrapedData };

    // Collect from manual fields container (always in edit mode)
    const manualContainer = document.getElementById(
      "auto-manual-fields-container"
    );
    if (manualContainer) {
      const manualFields = manualContainer.querySelectorAll(
        ".session-detail-item"
      );
      manualFields.forEach((fieldElement) => {
        const label = fieldElement.querySelector(".detail-label");
        const input = fieldElement.querySelector("input, textarea, select");

        if (label && input) {
          const fieldName = label.textContent.trim();
          const apiName = input.getAttribute("data-api-name");

          if (apiName) {
            let newValue = "";
            if (input.type === "checkbox") {
              newValue = input.checked;
            } else if (input.tagName === "SELECT") {
              newValue = input.value;
            } else {
              newValue = input.value || "";
            }
            updatedScrapedData[apiName] = newValue;
          } else {
            // For Modality and Modality Steps, use field name as key
            if (fieldName === "Modality") {
              updatedScrapedData.modality = input.value || null;
            } else if (fieldName === "Modality Steps") {
              updatedScrapedData.modality_step = input.value || null;
            }
          }
        }
      });
    }

    const sessionData = {
      client_id: clientId,
      emr_type_id: emrTypeId,
      manual_instructions:
        updatedScrapedData.Instructions ||
        updatedScrapedData.instructions ||
        "",
    };

    Object.keys(updatedScrapedData).forEach((key) => {
      if (
        ![
          "Client",
          "client",
          "emr_type_id",
          "Instructions",
          "instructions",
        ].includes(key)
      ) {
        // For modality and modality_step, ensure null instead of empty string (they are UUID strings in DB)
        if (key === "modality" || key === "modality_step") {
          sessionData[key] = updatedScrapedData[key] || null;
        } else {
          sessionData[key] = updatedScrapedData[key];
        }
      }
    });

    const sessionId = await findOrCreateSession(
      clientId,
      emrTypeId,
      sessionData,
      tokenResult.accessToken
    );

    const generateResponse = await fetch(
      `${API_BASE_URL}/sessions/${sessionId}/generate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (generateResponse.status === 401) {
      handle401Error();
      return;
    }

    if (!generateResponse.ok) {
      const errorData = await generateResponse.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to generate AI notes");
    }

    await generateResponse.json();

    // Step 5: Fetch session with AI notes
    const sessionResponse = await fetch(
      `${API_BASE_URL}/sessions/${sessionId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!sessionResponse.ok) {
      throw new Error("Failed to fetch session");
    }

    const sessionDetails = await sessionResponse.json();

    // Step 6: Fetch and store client if available
    if (sessionDetails.client_id) {
      try {
        const clientResponse = await fetch(
          `${API_BASE_URL}/api/Clients/${sessionDetails.client_id}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${tokenResult.accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (clientResponse.ok) {
          const client = await clientResponse.json();
          chrome.storage.local.set({ currentClient: client });
          console.log("✅ Client data stored:", client);
        }
      } catch (error) {
        console.error("❌ Error fetching client:", error);
      }
    }

    // Step 7: Fetch dynamic fields
    let dynamicFields = null;
    if (sessionDetails.emr_type_id) {
      try {
        dynamicFields = await getSessionDetailFields(
          sessionDetails.emr_type_id
        );
      } catch (error) {
        console.error("❌ Error loading dynamic fields:", error);
      }
    }

    // Store and redirect
    chrome.storage.local.set({ currentSession: sessionDetails }, () => {
      navigateToPage("session-detail");

      // Wait for page to load, then populate and switch to AI Notes tab
      setTimeout(() => {
        // Update the page with session data (AFTER navigation)
        updateSessionDetailPage(sessionDetails, dynamicFields);

        // Setup the tab handlers
        setupSessionTabHandlers();

        const sessionInfoTab = document.getElementById("session-info-tab");
        const activityTab = document.getElementById("session-activity-tab");
        const sessionInfoContent = document.getElementById(
          "session-info-content"
        );
        const activityContent = document.getElementById(
          "session-activity-content"
        );

        if (
          sessionInfoTab &&
          activityTab &&
          sessionInfoContent &&
          activityContent
        ) {
          // Remove active from Session Info
          sessionInfoTab.classList.remove("active");
          sessionInfoContent.classList.remove("active");
          // Add active to AI Notes
          activityTab.classList.add("active");
          activityContent.classList.add("active");

          // Hide session details for AI Notes tab
          hideSessionDetailsForAINotes();

          // Update buttons to hide edit button for AI Notes tab
          updateSessionButtons("ai-notes");

          console.log("✅ Switched to AI Notes tab!");
        }

        showSuccessMessage("AI Notes generated successfully!");
      }, 300);
    });
  } catch (error) {
    console.error("❌ Error:", error);
    showErrorMessage(`Failed: ${error.message}`);
  } finally {
    if (generateButton) {
      resetSingleGenerateButton(generateButton, "Generate AI Notes");
    }
  }
}

async function saveNewSession() {
  console.log("🚀 Saving new session...");

  try {
    // Get form values
    const clientSelect = document.getElementById("new-session-client");
    const emrTypeSelect = document.getElementById("new-session-emr-type");
    const instructionsTextarea = document.getElementById(
      "new-session-instructions"
    );

    if (!clientSelect || !emrTypeSelect) {
      showErrorMessage("Please fill in all required fields");
      return;
    }

    const clientId = clientSelect.value;
    const emrTypeId = emrTypeSelect.value;
    const manualInstructions = instructionsTextarea
      ? instructionsTextarea.value.trim()
      : "";

    if (!clientId || !emrTypeId) {
      showErrorMessage("Please select both Client and EMR Type");
      return;
    }

    // Get access token
    const tokenResult = await chrome.storage.local.get(["accessToken"]);
    if (!tokenResult.accessToken) {
      showErrorMessage("Please log in again");
      return;
    }

    // Get dynamic fields data to know field types
    const dynamicFields = await getSessionDetailFields(emrTypeId);

    // Build request body
    const requestBody = {
      emr_type_id: emrTypeId,
      client_id: clientId,
      manual_instructions: manualInstructions || "",
    };

    // Collect dynamic field values from the form
    const dynamicFieldsContainer = document.getElementById(
      "add-session-dynamic-fields-container"
    );
    if (dynamicFieldsContainer) {
      const formGroups = dynamicFieldsContainer.querySelectorAll(".form-group");

      formGroups.forEach((formGroup) => {
        const input = formGroup.querySelector("input, textarea, select");
        if (!input || !input.name) return;

        const fieldName = input.name;
        let fieldValue = "";
        let fieldType = "text";

        // Find the field type from dynamicFields
        const emrField = dynamicFields.fields.find(
          (f) => f.api_name === fieldName
        );
        if (emrField) {
          fieldType = emrField.type;
        } else {
          // Try to infer from input type
          if (input.type === "date") fieldType = "date";
          else if (input.type === "datetime-local") fieldType = "datetime";
          else if (input.type === "checkbox") fieldType = "boolean";
          else if (input.tagName === "SELECT") fieldType = "dropdown";
          else if (input.tagName === "TEXTAREA") fieldType = "textarea";
        }

        // Get value based on input type
        if (input.type === "checkbox") {
          fieldValue = input.checked;
        } else {
          fieldValue = input.value.trim();
        }

        // Format value according to type
        if (fieldType === "date") {
          requestBody[fieldName] = fieldValue ? fieldValue : null;
        } else if (fieldType === "datetime") {
          if (fieldValue) {
            // Convert datetime-local format (YYYY-MM-DDTHH:mm) to YYYY-MM-DD HH:mm:ss
            const date = new Date(fieldValue);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              const hours = String(date.getHours()).padStart(2, "0");
              const minutes = String(date.getMinutes()).padStart(2, "0");
              const seconds = String(date.getSeconds()).padStart(2, "0");
              requestBody[
                fieldName
              ] = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            } else {
              requestBody[fieldName] = null;
            }
          } else {
            requestBody[fieldName] = null;
          }
        } else if (fieldType === "boolean") {
          requestBody[fieldName] = fieldValue ? "true" : "false";
        } else if (fieldName === "modality" || fieldName === "modality_step") {
          // modality and modality_step are UUID strings in DB, send null or string
          requestBody[fieldName] = fieldValue || null;
        } else {
          // text, textarea, dropdown, number, email, tel - empty string if empty
          requestBody[fieldName] = fieldValue || "";
        }
      });
    }

    console.log("📤 Request body:", requestBody);

    // Disable button and show loading state
    const saveBtn = document.getElementById("save-add-session");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Creating...";
    }

    // Make API POST request
    const response = await fetch(`${API_BASE_URL}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenResult.accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    // Check for 401 Unauthorized (token expired)
    if (response.status === 401) {
      handle401Error();
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Create Session";
      }
      return;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to create session: ${response.status}`
      );
    }

    const sessionData = await response.json();
    console.log("✅ Session created successfully:", sessionData);

    // Store session as current session
    chrome.storage.local.set({ currentSession: sessionData }, () => {
      console.log("💾 New session stored as currentSession");
    });

    // Close modal
    hideAddSessionModal();

    // Automatically generate AI notes for the new session
    console.log("🤖 Auto-generating AI Notes for new session...");
    try {
      // Show loading message
      showSuccessMessage("Session created! Generating AI Notes...");

      // Generate AI notes
      const generateResponse = await fetch(
        `${API_BASE_URL}/sessions/${sessionData.id}/generate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!generateResponse.ok) {
        throw new Error(
          `Failed to generate AI notes: ${generateResponse.status}`
        );
      }

      const aiNotesData = await generateResponse.json();
      console.log("✅ AI Notes generated:", aiNotesData);

      // Update session data with AI notes
      sessionData.methods_response = aiNotesData.methods;
      sessionData.progress_towards_goal_response =
        aiNotesData.progress_towards_goal;
      sessionData.recommended_changes_response =
        aiNotesData.recommended_changes;

      // Store updated session
      chrome.storage.local.set({ currentSession: sessionData });

      // Show session detail page and switch to AI Notes tab
      await showSessionDetail(sessionData);

      // Wait for page to load, then switch to AI Notes tab
      setTimeout(() => {
        const sessionInfoTab = document.getElementById("session-info-tab");
        const activityTab = document.getElementById("session-activity-tab");
        const sessionInfoContent = document.getElementById(
          "session-info-content"
        );
        const activityContent = document.getElementById(
          "session-activity-content"
        );

        if (
          sessionInfoTab &&
          activityTab &&
          sessionInfoContent &&
          activityContent
        ) {
          // Remove active from Session Info
          sessionInfoTab.classList.remove("active");
          sessionInfoContent.classList.remove("active");
          // Add active to AI Notes
          activityTab.classList.add("active");
          activityContent.classList.add("active");

          // Hide session details for AI Notes tab
          hideSessionDetailsForAINotes();

          // Update buttons to hide edit button for AI Notes tab
          updateSessionButtons("ai-notes");

          // Update AI Notes content with generated data
          updateAINotesContent(aiNotesData);

          console.log("✅ Switched to AI Notes tab with generated content!");
        }

        showSuccessMessage("AI Notes generated successfully!");
      }, 300);
    } catch (error) {
      console.error("❌ Error generating AI notes:", error);
      // Still show the session detail page even if AI notes generation fails
      await showSessionDetail(sessionData);
      showErrorMessage(
        "Session created, but failed to generate AI notes. You can generate them manually."
      );
    }

    // Refresh sessions list if on client detail page
    const currentPage = document.querySelector(
      ".page-content[style*='display: block'], .page-content:not([style*='display: none'])"
    );
    if (currentPage && currentPage.id === "client-detail-page") {
      // Get current client ID and reload sessions
      chrome.storage.local.get(["currentClient"], async (result) => {
        if (result.currentClient && result.currentClient.clientId) {
          const clientId = result.currentClient.clientId;

          // Check if sessions tab is active
          const sessionsTab = document.getElementById("sessions-tab");
          const sessionsContent = document.getElementById("sessions-content");
          const isSessionsTabActive =
            sessionsTab && sessionsTab.classList.contains("active");

          if (isSessionsTabActive) {
            // Reload sessions directly from API (bypasses cache)
            console.log("🔄 Reloading sessions after creating new session...");

            // Fetch fresh sessions from API
            const sessionsResponse = await fetch(
              `${API_BASE_URL}/sessions?client_id=${clientId}`,
              {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${tokenResult.accessToken}`,
                  "Content-Type": "application/json",
                },
              }
            );

            if (sessionsResponse.ok) {
              const updatedSessions = await sessionsResponse.json();

              // Update cache
              chrome.storage.local.get(["sessionsCache"], (cacheResult) => {
                const sessionsCache = cacheResult.sessionsCache || {};
                sessionsCache[clientId] = updatedSessions;
                chrome.storage.local.set({ sessionsCache });
              });

              // Render the updated sessions list
              await renderSessionsList(updatedSessions);
              updateClientDetailSessionCount(updatedSessions.length);
            } else {
              // Fallback to loadSessionsFromAPI if fetch fails
              await loadSessionsFromAPI(clientId);
            }
          } else {
            // If not on sessions tab, just update the session count
            updateSessionCountForClientInfo();
          }
        }
      });
    }
  } catch (error) {
    console.error("❌ Error creating session:", error);
    showErrorMessage(
      error.message || "Failed to create session. Please try again."
    );

    // Re-enable button
    const saveBtn = document.getElementById("save-add-session");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Create Session";
    }
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
      const input = field.querySelector("input, textarea, select");
      if (input && input.name) {
        // Handle checkbox fields differently
        if (input.type === "checkbox") {
          sessionData[input.name] = input.checked ? "true" : "false";
        } else {
          // For modality and modality_step, send null instead of empty string (they are UUID strings in DB)
          if (input.name === "modality" || input.name === "modality_step") {
            sessionData[input.name] = input.value || null;
          } else {
            sessionData[input.name] = input.value || "";
          }
        }
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

    const updatedSession = await response.json();
    console.log("✅ Session updated successfully", updatedSession);

    // Hide modal and refresh data
    hideEditSessionModal();

    // Refresh current session if we're viewing it
    const currentSession = await chrome.storage.local.get(["currentSession"]);
    if (
      currentSession.currentSession &&
      currentSession.currentSession.id === sessionId
    ) {
      // Fetch the COMPLETE session data from API (including all dynamic fields)
      console.log("🔄 Fetching complete session data from API...");
      const fullSessionResponse = await fetch(
        `${API_BASE_URL}/sessions/${sessionId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (fullSessionResponse.ok) {
        const fullSession = await fullSessionResponse.json();
        console.log("✅ Full session data fetched:", fullSession);
        console.log("📋 Session keys:", Object.keys(fullSession));

        // Update the stored session with COMPLETE data from server
        chrome.storage.local.set({ currentSession: fullSession }, () => {
          console.log("✅ Complete session stored successfully");

          // Re-fetch dynamic fields to show updated checkbox values in view mode
          if (fullSession.emr_type_id) {
            console.log(
              "🔄 Fetching dynamic fields for emr_type_id:",
              fullSession.emr_type_id
            );
            getSessionDetailFields(fullSession.emr_type_id)
              .then((dynamicFields) => {
                console.log("✅ Dynamic fields fetched:", dynamicFields);
                updateSessionDetailPage(fullSession, dynamicFields);
              })
              .catch((error) => {
                console.error("❌ Error fetching dynamic fields:", error);
              });
          } else {
            updateSessionDetailPage(fullSession, null);
          }
        });
      } else {
        console.error("❌ Failed to fetch full session data");
      }
    }

    // Clear the session fields cache to force refresh on next edit
    const cacheKey = `session_fields_${updatedSession.emr_type_id}`;
    chrome.storage.local.remove([cacheKey]);

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
      // Skip "client" or "client name" field as it's already shown as a static field at the top
      const keyLower = result.key ? result.key.toLowerCase().trim() : "";
      if (
        keyLower === "client" ||
        keyLower === "client name" ||
        keyLower === "client_id" ||
        keyLower === "client id"
      ) {
        console.log(
          "⏭️ Skipping client field in edit mode - already shown as static field:",
          result.key
        );
        return;
      }

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
        label.textContent = formatFieldNameForDisplay(result.key);
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
          console.log("🔍 Creating checkbox input for boolean field");
          input = document.createElement("input");
          input.type = "checkbox";
          // Ensure checkbox is always enabled and functional in edit mode
          input.disabled = false;
          input.readOnly = false;
          input.style.cssText =
            "width: 18px; height: 18px; cursor: pointer; pointer-events: auto !important; z-index: 999 !important; position: relative; margin: 0;";
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
        const fieldValue =
          sessionData[fieldName] !== undefined ? sessionData[fieldName] : "";
        console.log(
          "🔍 Field value for",
          fieldName,
          ":",
          fieldValue,
          "type:",
          typeof fieldValue
        );

        // Set value based on field type
        console.log(
          "🔍 Setting value for fieldType:",
          fieldType,
          "fieldValue:",
          fieldValue
        );

        if (fieldType === "boolean") {
          console.log("🔍 Setting checkbox value:", fieldValue);
          // Handle all possible boolean value formats
          const isChecked =
            fieldValue === true ||
            fieldValue === "true" ||
            fieldValue === "True" ||
            fieldValue === 1 ||
            fieldValue === "1" ||
            (typeof fieldValue === "string" &&
              fieldValue.toLowerCase() === "true") ||
            fieldValue === "yes" ||
            fieldValue === "Yes";
          input.checked = isChecked;
          console.log(
            "🔍 Checkbox checked:",
            input.checked,
            "from value:",
            fieldValue,
            "type:",
            typeof fieldValue
          );
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
          label.textContent = formatFieldNameForDisplay(result.key);
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
    // Add static Modality and Modality Steps dropdowns (always shown)
    const modalities = await fetchModalities();
    const modalitySteps = await fetchModalitySteps();

    // Find the Modality and Modality Steps field definitions to get api_name
    const modalityField = dynamicFields.fields.find(
      (f) =>
        f.name &&
        f.name.toLowerCase().includes("modality") &&
        !f.name.toLowerCase().includes("step")
    );
    const modalityStepsField = dynamicFields.fields.find(
      (f) =>
        f.name &&
        f.name.toLowerCase().includes("modality") &&
        f.name.toLowerCase().includes("step")
    );

    const modalityApiName = modalityField ? modalityField.api_name : "modality";
    const modalityStepsApiName = modalityStepsField
      ? modalityStepsField.api_name
      : "modality_step";

    console.log("🔍 Modality api_name:", modalityApiName);
    console.log("🔍 Modality Steps api_name:", modalityStepsApiName);
    console.log("🔍 Session modality value:", sessionData[modalityApiName]);
    console.log(
      "🔍 Session modality_step value:",
      sessionData[modalityStepsApiName]
    );

    // Create Modality dropdown
    const modalityContainer = document.createElement("div");
    modalityContainer.className = "form-group";

    const modalityLabel = document.createElement("label");
    modalityLabel.textContent = "Modality";
    modalityLabel.setAttribute("for", "edit-modality");

    const modalitySelect = document.createElement("select");
    modalitySelect.className = "form-input";
    modalitySelect.name = modalityApiName;
    modalitySelect.id = "edit-modality";

    // Add empty option
    const emptyModalityOption = document.createElement("option");
    emptyModalityOption.value = "";
    emptyModalityOption.textContent = "Select Modality";
    modalitySelect.appendChild(emptyModalityOption);

    // Add modality options
    modalities.forEach((modality) => {
      const option = document.createElement("option");
      option.value = modality.id || modality.name;
      option.textContent = modality.name;
      // Pre-select if session has modality value using api_name
      if (
        sessionData[modalityApiName] &&
        (sessionData[modalityApiName] == modality.id ||
          sessionData[modalityApiName] == modality.name)
      ) {
        option.selected = true;
      }
      modalitySelect.appendChild(option);
    });

    modalityContainer.appendChild(modalityLabel);
    modalityContainer.appendChild(modalitySelect);
    container.appendChild(modalityContainer);

    // Create Modality Steps dropdown (initially empty or pre-filled)
    const modalityStepsContainer = document.createElement("div");
    modalityStepsContainer.className = "form-group";

    const modalityStepsLabel = document.createElement("label");
    modalityStepsLabel.textContent = "Modality Steps";
    modalityStepsLabel.setAttribute("for", "edit-modality-steps");

    const modalityStepsSelect = document.createElement("select");
    modalityStepsSelect.className = "form-input";
    modalityStepsSelect.name = modalityStepsApiName;
    modalityStepsSelect.id = "edit-modality-steps";

    // Start with empty option
    const emptyStepsOption = document.createElement("option");
    emptyStepsOption.value = "";
    emptyStepsOption.textContent = "Select Modality Steps";
    modalityStepsSelect.appendChild(emptyStepsOption);

    // If session has modality selected, filter and show steps
    if (sessionData[modalityApiName]) {
      const filteredSteps = modalitySteps.filter(
        (step) =>
          step.modality_id === sessionData[modalityApiName] ||
          step.modality_id == sessionData[modalityApiName]
      );

      filteredSteps.forEach((step) => {
        const option = document.createElement("option");
        option.value = step.id || step.name;
        option.textContent = step.name;
        // Pre-select if session has modality_step value
        if (
          sessionData[modalityStepsApiName] &&
          (sessionData[modalityStepsApiName] == step.id ||
            sessionData[modalityStepsApiName] == step.name)
        ) {
          option.selected = true;
        }
        modalityStepsSelect.appendChild(option);
      });
    }

    modalityStepsContainer.appendChild(modalityStepsLabel);
    modalityStepsContainer.appendChild(modalityStepsSelect);
    container.appendChild(modalityStepsContainer);

    // Add event listener to Modality dropdown to filter Modality Steps
    modalitySelect.addEventListener("change", function () {
      const selectedModalityId = this.value;

      // Clear current options
      modalityStepsSelect.innerHTML = "";
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "Select Modality Steps";
      modalityStepsSelect.appendChild(emptyOption);

      if (selectedModalityId) {
        // Filter modality steps by modality_id
        const filteredSteps = modalitySteps.filter(
          (step) =>
            step.modality_id === selectedModalityId ||
            step.modality_id == selectedModalityId
        );

        console.log(
          "🔍 Filtered modality steps for modality ID:",
          selectedModalityId,
          filteredSteps
        );

        // Add filtered options
        filteredSteps.forEach((step) => {
          const option = document.createElement("option");
          option.value = step.id || step.name;
          option.textContent = step.name;
          modalityStepsSelect.appendChild(option);
        });
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
        label.textContent = formatFieldNameForDisplay(manualField.name);
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

        // Get the actual value from session data (preserve false/0 values)
        const fieldValue =
          sessionData[emrField.api_name] !== undefined
            ? sessionData[emrField.api_name]
            : "";
        console.log(
          "🔍 Field value for",
          emrField.api_name,
          ":",
          fieldValue,
          "type:",
          typeof fieldValue
        );

        // Set value based on field type
        console.log(
          "🔍 Setting value for fieldType:",
          fieldType,
          "fieldValue:",
          fieldValue
        );

        if (fieldType === "boolean") {
          console.log("🔍 Setting checkbox value:", fieldValue);
          // Handle all possible boolean value formats
          const isChecked =
            fieldValue === true ||
            fieldValue === "true" ||
            fieldValue === "True" ||
            fieldValue === 1 ||
            fieldValue === "1" ||
            (typeof fieldValue === "string" &&
              fieldValue.toLowerCase() === "true") ||
            fieldValue === "yes" ||
            fieldValue === "Yes";
          input.checked = isChecked;
          console.log(
            "🔍 Checkbox checked:",
            input.checked,
            "from value:",
            fieldValue,
            "type:",
            typeof fieldValue
          );
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

// Small, subtle copy notification function
function showCopyNotification(iconElement, success = true) {
  // Remove any existing notification
  const existingNotification =
    iconElement.parentElement.querySelector(".copy-notification");
  if (existingNotification) {
    existingNotification.remove();
  }

  // Create small notification element
  const notification = document.createElement("div");
  notification.className = "copy-notification";
  if (!success) {
    notification.classList.add("error");
  }
  notification.textContent = success ? "Copied" : "Failed";

  // Position it near the icon
  const container = iconElement.parentElement;
  container.style.position = "relative";

  // Insert notification after the icon
  iconElement.parentElement.appendChild(notification);

  // Show notification
  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  // Hide and remove after 1.5 seconds
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 200);
  }, 1500);
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
  // Use date_of_birth from API response; show "Not specified" if missing
  document.getElementById("client-dob").textContent =
    client.date_of_birth || "Not specified";
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

  // Set up edit button click handler
  const editClientBtn = document.getElementById("edit-client-from-detail-btn");
  if (editClientBtn) {
    // Remove any existing event listeners by cloning the button
    const newBtn = editClientBtn.cloneNode(true);
    editClientBtn.parentNode.replaceChild(newBtn, editClientBtn);

    // Add event listener to the new button
    newBtn.addEventListener("click", function () {
      const clientId = client.id || client.client_id || client.clientId;
      if (clientId) {
        console.log("✏️ Edit client button clicked, client ID:", clientId);
        editClient(clientId);
      } else {
        console.error("❌ No client ID found");
        showErrorMessage("Unable to edit client. Please try again.");
      }
    });
    console.log("✅ Edit client button event listener added");
  }
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

async function captureFastHTML() {
  console.log("📋 Starting fast HTML capture...");

  // Get form values
  const emrTypeInput = document.getElementById("emr-type");
  const sessionTypeSelect = document.getElementById("session-type");
  const documentationMethodSelect = document.getElementById(
    "documentation-method"
  );

  if (!emrTypeInput || !sessionTypeSelect || !documentationMethodSelect) {
    showErrorMessage("Form elements not found. Please try again.");
    return;
  }

  const emrTypeName = emrTypeInput.value.trim();
  const sessionType =
    sessionTypeSelect.options[sessionTypeSelect.selectedIndex]?.text;
  const documentationMethodId = documentationMethodSelect.value;

  // Validate form fields
  if (!emrTypeName || emrTypeName === "") {
    showErrorMessage("Please enter an EMR Type");
    return;
  }
  if (!sessionType || sessionTypeSelect.value === "") {
    showErrorMessage("Please select a Session Type");
    return;
  }
  if (!documentationMethodId || documentationMethodId === "") {
    showErrorMessage("Please select a Documentation Method");
    return;
  }

  console.log("📋 Form values:", {
    emrTypeName,
    sessionType,
    documentationMethodId,
  });

  // Show loading state
  const button = document.querySelector(".send-button");
  if (button) {
    button.textContent = "Sending...";
    button.disabled = true;
  }

  // Get the current tab and send capture message
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      // Send message to background script to capture page
      chrome.runtime.sendMessage(
        {
          action: "captureForAPI",
          url: tabs[0].url,
        },
        async function (response) {
          console.log("📨 Capture response:", response);

          if (response && response.success && response.html) {
            console.log("✅ Page captured successfully");

            // Send to API
            await sendEMRTypeToAPI({
              emrTypeName,
              sessionType,
              documentationMethodId,
              htmlContent: response.html,
              pageUrl: tabs[0].url,
            });
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

async function sendEMRTypeToAPI(data) {
  try {
    console.log("🚀 Sending EMR type to API...");

    // Get access token
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found. Please log in again.");
    }

    // Extract domain from current page URL
    const currentUrl = data.pageUrl || window.location.href;
    let emrUrl = "";
    try {
      const urlObj = new URL(currentUrl);
      emrUrl = urlObj.hostname; // e.g., "ysl.quickbase.com"
      console.log("🌐 Extracted EMR URL:", emrUrl, "from", currentUrl);
    } catch (error) {
      console.error("❌ Error extracting URL:", error);
      emrUrl = ""; // Fallback to empty if URL parsing fails
    }

    // Create FormData
    const formData = new FormData();
    formData.append("name", data.emrTypeName);
    formData.append("session_type", data.sessionType);
    formData.append("documentation_method_id", data.documentationMethodId);
    formData.append("emr_url", emrUrl);
    formData.append("created_from_chrome", "true");

    // Create HTML file from captured content
    const htmlBlob = new Blob([data.htmlContent], { type: "text/html" });
    const fileName = `${data.emrTypeName.replace(
      /[^a-z0-9]/gi,
      "_"
    )}_${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
    formData.append("files", htmlBlob, fileName);

    console.log("📦 FormData prepared:", {
      name: data.emrTypeName,
      session_type: data.sessionType,
      documentation_method_id: data.documentationMethodId,
      file: fileName,
    });

    // Send to API
    const response = await fetch(`${API_BASE_URL}/emr-types/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        // Don't set Content-Type header - browser will set it automatically with boundary for multipart/form-data
      },
      body: formData,
    });

    // Check for 401 Unauthorized (token expired)
    if (response.status === 401) {
      handle401Error();
      return;
    }

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Unknown error" }));
      throw new Error(
        errorData.message || `Failed to create EMR type: ${response.status}`
      );
    }

    const responseData = await response.json();
    console.log("✅ EMR type created successfully:", responseData);
    showSuccessMessage("EMR type created successfully!");

    // Clear form
    document.getElementById("emr-type").value = "";
    document.getElementById("session-type").value = "";
    document.getElementById("documentation-method").value = "";
  } catch (error) {
    console.error("❌ Error sending EMR type to API:", error);
    showErrorMessage(`Failed to create EMR type: ${error.message}`);
  }
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

// ===============================
// AUTO-FILL SESSION FROM SCRAPED DATA
// ===============================

// Listen for fillSessionData message from background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "fillSessionData") {
    console.log(
      "✅ SessyNote POPUP: Received fillSessionData - Panel is OPEN",
      message.data
    );

    try {
      // Navigate to Sessions tab
      navigateToPage("sessions");

      // Wait for page to load
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Trigger auto-fill
      await autoFillSessionFromScrapedData(message.data);

      console.log("✅ SessyNote POPUP: Auto-fill complete, sending response");
      sendResponse({ success: true });
    } catch (error) {
      console.error("❌ SessyNote POPUP: Error auto-filling session:", error);
      sendResponse({ success: false, error: error.message });
    }
  }
  return true;
});

async function autoFillSessionFromScrapedData(data) {
  const { scrapedData, emrTypeId } = data;

  console.log("SessyNote: Starting auto-fill with data:", scrapedData);
  console.log("SessyNote: EMR Type ID:", emrTypeId);

  // Navigate directly to the auto-detected session page
  navigateToPage("auto-detected-session");
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Store the scraped data and EMR type ID for the page to use
  await chrome.storage.local.set({
    autoDetectedSessionData: scrapedData,
    autoDetectedEmrTypeId: emrTypeId,
  });

  // Populate the new page with data
  await populateAutoDetectedSessionPage(scrapedData, emrTypeId);

  console.log("SessyNote: Auto-fill complete");

  // Stop the blinking icon
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "stopBlinking" });
    }
  });
}

let currentAutoDetectedDynamicFields = null;
let currentAutoDetectedScrapedData = null;
let currentAutoDetectedEmrTypeId = null; // ADD THIS LINE

// Global variables to store modalities and modality steps
let allModalities = [];
let allModalitySteps = [];

async function populateAutoDetectedSessionPage(scrapedData, emrTypeId) {
  console.log("🔄 Populating auto-detected session page...");
  console.log("📊 Scraped data:", scrapedData);
  console.log("📊 EMR Type ID:", emrTypeId);

  // Set button text to "Generate AI Notes" for new auto-detected session
  const autoGenerateButton = document.getElementById("auto-generate-button");
  if (autoGenerateButton) {
    autoGenerateButton.textContent = "Generate AI Notes";
    autoGenerateButton.disabled = false;
  }

  try {
    // Find client ID by name (optional - we no longer block if not found)
    const clientName = scrapedData.Client || scrapedData.client;
    const clientId = await findClientIdByName(clientName);

    if (!clientId) {
      console.warn(
        "SessyNote: No matching client found for auto-detected session:",
        clientName
      );
    }

    // Get EMR type name
    const emrTypeName = await getEMRTypeName(emrTypeId);

    // Fetch dynamic fields for this EMR type
    const dynamicFields = await getSessionDetailFields(emrTypeId);
    console.log("📊 Dynamic fields fetched:", dynamicFields);

    // Store globally for edit mode access
    currentAutoDetectedDynamicFields = dynamicFields;
    currentAutoDetectedScrapedData = scrapedData;
    currentAutoDetectedEmrTypeId = emrTypeId; // ADD THIS LINE

    // Populate static fields (Client, Type, Instructions) in plain text for view mode
    const autoClientValueEl = document.getElementById("auto-client");
    if (autoClientValueEl) {
      const text = clientName || "-";
      autoClientValueEl.textContent = text;
      autoClientValueEl.title = text;
    }

    const autoTypeValueEl = document.getElementById("auto-type");
    if (autoTypeValueEl) {
      const text = emrTypeName || "-";
      autoTypeValueEl.textContent = text;
      autoTypeValueEl.title = text;
    }

    const autoInstructionsValueEl =
      document.getElementById("auto-instructions");
    if (autoInstructionsValueEl) {
      const instructionsText =
        scrapedData.Instructions || scrapedData.instructions || "-";
      autoInstructionsValueEl.textContent = instructionsText;
      autoInstructionsValueEl.title = instructionsText;
    }

    // Show "Session Data" label before dynamic fields
    const sessionDataTitle = document.getElementById("auto-session-data-title");
    if (sessionDataTitle) {
      sessionDataTitle.style.display = "block";
    }

    // Populate confirmed results fields (view mode)
    const confirmedContainer = document.getElementById(
      "auto-confirmed-results-container"
    );
    confirmedContainer.innerHTML = ""; // Clear

    console.log(
      "📋 Confirmed Results count:",
      dynamicFields.confirmedResults.length
    );
    console.log("📋 Confirmed Results:", dynamicFields.confirmedResults);

    dynamicFields.confirmedResults.forEach((result, index) => {
      console.log(`🔍 Processing confirmed result #${index + 1}:`, result);

      // Skip client field - it's already shown as static field
      const keyLower = result.key ? result.key.toLowerCase().trim() : "";
      if (keyLower === "client" || keyLower === "client name") {
        console.log("⏭️ Skipping client field - already shown as static field");
        return;
      }

      // Find field definition from fields array using result.key (matching field.name)
      let fieldDef = dynamicFields.fields.find((f) => f.name === result.key);

      // Try case-insensitive matching if exact match not found
      if (!fieldDef) {
        fieldDef = dynamicFields.fields.find((field) => {
          if (!field.name) return false;
          const normalizedFieldName = field.name
            .toLowerCase()
            .replace(/-/g, " ")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const normalizedResultKey = result.key
            .toLowerCase()
            .replace(/-/g, " ")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return normalizedFieldName === normalizedResultKey;
        });
      }

      console.log(`🔍 Field definition for '${result.key}':`, fieldDef);

      if (fieldDef) {
        // Get the api_name to look up value in scraped data
        const fieldMapping = dynamicFields.fieldMapping;
        let apiName = fieldMapping[result.key];

        if (!apiName && fieldDef) {
          apiName = fieldDef.api_name;
        }

        console.log(
          `🔍 Using api_name '${apiName}' to get value from scraped data`
        );

        // Get value from scraped data using api_name, or empty if not present
        const fieldValue =
          apiName && scrapedData.hasOwnProperty(apiName)
            ? scrapedData[apiName]
            : "";
        console.log(
          `✅ Creating field '${result.key}' with value:`,
          fieldValue
        );

        // In view mode on the auto-detected session page, show plain text (no input boxes)
        const fieldElement = createAutoSessionViewFieldElement(
          result.key, // Display name (what user sees)
          fieldValue !== null && fieldValue !== undefined ? fieldValue : "",
          fieldDef.type
        );
        confirmedContainer.appendChild(fieldElement);
      } else {
        console.log(`❌ No field definition found for key '${result.key}'`);
      }
    });

    // Populate manual fields (edit mode)
    const manualContainer = document.getElementById(
      "auto-manual-fields-container"
    );
    manualContainer.innerHTML = ""; // Clear

    // Add divider line before Modality fields
    const dividerLine = document.createElement("div");
    dividerLine.style.cssText =
      "width: 100%; height: 1px; background-color: #e5e7eb; margin: 4px 0;";
    manualContainer.appendChild(dividerLine);

    // Fetch modalities and modality steps from API
    console.log("📥 Fetching modalities and modality steps...");
    allModalities = await fetchModalities();
    allModalitySteps = await fetchModalitySteps();

    // Add Modality field (always show for all EMR types) - dropdown
    const modalityFieldElement = document.createElement("div");
    modalityFieldElement.className =
      "session-detail-item dynamic-field editable-field";
    modalityFieldElement.innerHTML = `
      <span class="detail-label">Modality</span>
      <span class="detail-value">
        <select data-field-name="Modality" data-field-type="dropdown" class="editable-input" id="modality-select">
          <option value="">Select Modality</option>
        </select>
      </span>
    `;
    manualContainer.appendChild(modalityFieldElement);

    // Populate Modality dropdown (store ID as value, show name)
    const modalitySelect = document.getElementById("modality-select");
    if (modalitySelect && allModalities.length > 0) {
      allModalities.forEach((modality) => {
        const option = document.createElement("option");
        // Use ID if available, otherwise fall back to name
        option.value = modality.id || modality.name;
        option.textContent = modality.name;
        // Support both ID and name being present in scrapedData.modality
        if (
          scrapedData.modality &&
          (scrapedData.modality === modality.id ||
            scrapedData.modality === modality.name)
        ) {
          option.selected = true;
        }
        modalitySelect.appendChild(option);
      });

      // Add event listener to update Modality Steps when Modality changes
      modalitySelect.addEventListener("change", function () {
        const selectedModalityName = this.value;
        updateModalityStepsDropdown(selectedModalityName);
      });
    }

    // Add Modality Steps field (always show for all EMR types) - dropdown
    const modalityStepsFieldElement = document.createElement("div");
    modalityStepsFieldElement.className =
      "session-detail-item dynamic-field editable-field";
    modalityStepsFieldElement.innerHTML = `
      <span class="detail-label">Modality Steps</span>
      <span class="detail-value">
        <select data-field-name="Modality Steps" data-field-type="dropdown" class="editable-input" id="modality-steps-select">
          <option value="">Select Modality Steps</option>
        </select>
      </span>
    `;
    manualContainer.appendChild(modalityStepsFieldElement);

    // Populate Modality Steps dropdown based on selected Modality (if any)
    if (scrapedData.modality) {
      updateModalityStepsDropdown(scrapedData.modality);
    }

    // Add manual fields from EMR type
    console.log("📋 Manual Fields count:", dynamicFields.manualFields.length);
    console.log("📋 Manual Fields:", dynamicFields.manualFields);

    dynamicFields.manualFields.forEach((field, index) => {
      console.log(`🔍 Processing manual field #${index + 1}:`, field);

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

      console.log(
        `🔍 Field definition for manual field '${field.name}':`,
        fieldDef
      );

      if (fieldDef) {
        const sessionKey = fieldDef.api_name;
        let fieldValue = scrapedData[sessionKey];

        // Format date/datetime values to proper format for input fields
        if (fieldDef.type === "date" && fieldValue) {
          // Check if already in YYYY-MM-DD format
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(fieldValue)) {
            // Try to parse and format as YYYY-MM-DD
            const parsedDate = parseDate(fieldValue);
            if (parsedDate) {
              fieldValue = parsedDate;
            } else {
              // If parseDate fails, try direct Date parsing
              try {
                const date = new Date(fieldValue);
                if (!isNaN(date.getTime())) {
                  fieldValue = date.toISOString().split("T")[0];
                }
              } catch (e) {
                console.warn(
                  "Failed to parse date for manual field:",
                  fieldValue
                );
              }
            }
          }
        } else if (fieldDef.type === "datetime" && fieldValue) {
          // Check if already in YYYY-MM-DDTHH:MM format
          const datetimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
          if (!datetimeRegex.test(fieldValue)) {
            // Try to parse and format as YYYY-MM-DDTHH:MM
            const parsedDateTime = parseDateTime(fieldValue);
            if (parsedDateTime) {
              fieldValue = parsedDateTime;
            } else {
              // If parseDateTime fails, try direct Date parsing
              try {
                const date = new Date(fieldValue);
                if (!isNaN(date.getTime())) {
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, "0");
                  const day = String(date.getDate()).padStart(2, "0");
                  const hours = String(date.getHours()).padStart(2, "0");
                  const minutes = String(date.getMinutes()).padStart(2, "0");
                  fieldValue = `${year}-${month}-${day}T${hours}:${minutes}`;
                }
              } catch (e) {
                console.warn(
                  "Failed to parse datetime for manual field:",
                  fieldValue
                );
              }
            }
          }
        }

        console.log(
          `✅ Creating manual field '${fieldDef.name}' with value:`,
          fieldValue
        );
        const fieldElement = createEditableFieldElement(
          fieldDef.name,
          fieldValue !== null && fieldValue !== undefined ? fieldValue : "",
          fieldDef.type,
          fieldDef.dropdown_values || null
        );

        // IMPORTANT: tag manual fields with their API name so save & generate know where to store them
        const inputElement = fieldElement.querySelector(
          "input, textarea, select"
        );
        if (inputElement && fieldDef.api_name) {
          inputElement.setAttribute("data-api-name", fieldDef.api_name);
        }

        manualContainer.appendChild(fieldElement);
      } else {
        console.log(
          `❌ No field definition found for manual field '${field.name}'`
        );
      }
    });

    console.log("✅ Auto-detected session page populated successfully");

    // Set up the edit button handler after page is populated
    setupAutoDetectedSessionHandlers();
  } catch (error) {
    console.error("❌ Error populating auto-detected session page:", error);
    showErrorMessage(`Failed to load session data: ${error.message}`);
  }
}

// Function to fetch modalities from API
async function fetchModalities() {
  try {
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found. Please log in again.");
    }

    const response = await fetch(`${API_BASE_URL}/modalities`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      handle401Error();
      return [];
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch modalities: ${response.status}`);
    }

    const modalities = await response.json();
    console.log("✅ Modalities fetched:", modalities);
    return modalities;
  } catch (error) {
    console.error("❌ Error fetching modalities:", error);
    showErrorMessage(`Failed to load modalities: ${error.message}`);
    return [];
  }
}

// Function to fetch modality steps from API
async function fetchModalitySteps() {
  try {
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found. Please log in again.");
    }

    const response = await fetch(`${API_BASE_URL}/modality-steps`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      handle401Error();
      return [];
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch modality steps: ${response.status}`);
    }

    const modalitySteps = await response.json();
    console.log("✅ Modality steps fetched:", modalitySteps);
    return modalitySteps;
  } catch (error) {
    console.error("❌ Error fetching modality steps:", error);
    showErrorMessage(`Failed to load modality steps: ${error.message}`);
    return [];
  }
}

// Function to filter modality steps by modality ID
function filterModalityStepsByModalityId(modalityId) {
  if (!modalityId) {
    return [];
  }
  return allModalitySteps.filter((step) => step.modality_id === modalityId);
}

// Function to update Modality Steps dropdown based on selected Modality
// selectedModalityKey can be either a modality ID (preferred) or a name
function updateModalityStepsDropdown(selectedModalityKey) {
  const modalityStepsSelect = document.querySelector(
    'select[data-field-name="Modality Steps"]'
  );
  if (!modalityStepsSelect) {
    console.log("❌ Modality Steps select not found");
    return;
  }

  // If no modality is selected, clear the dropdown
  if (!selectedModalityKey) {
    modalityStepsSelect.innerHTML =
      '<option value="">Select Modality Steps</option>';
    return;
  }

  // Find the modality by ID or by name
  const selectedModality = allModalities.find(
    (m) => m.id === selectedModalityKey || m.name === selectedModalityKey
  );
  if (!selectedModality) {
    console.log("❌ Modality not found:", selectedModalityKey);
    modalityStepsSelect.innerHTML =
      '<option value="">Select Modality Steps</option>';
    return;
  }

  // Filter modality steps by modality ID
  const filteredSteps = filterModalityStepsByModalityId(selectedModality.id);
  console.log(
    `✅ Filtered ${filteredSteps.length} modality steps for modality: ${selectedModality.name}`
  );

  // Clear and populate dropdown
  modalityStepsSelect.innerHTML =
    '<option value="">Select Modality Steps</option>';
  filteredSteps.forEach((step) => {
    const option = document.createElement("option");
    // Use ID if available, otherwise fall back to name
    option.value = step.id || step.name;
    option.textContent = step.name;
    modalityStepsSelect.appendChild(option);
  });

  // If there's a saved value, try to select it
  if (
    currentAutoDetectedScrapedData &&
    currentAutoDetectedScrapedData.modality_step
  ) {
    const savedValue = currentAutoDetectedScrapedData.modality_step;
    const matchingOption = Array.from(modalityStepsSelect.options).find(
      (opt) => opt.value === savedValue || opt.textContent === savedValue
    );
    if (matchingOption) {
      modalityStepsSelect.value = matchingOption.value;
    }
  }
}

// Helper function to create editable field elements (for edit mode)
function createEditableFieldElement(
  fieldName,
  fieldValue,
  fieldType,
  dropdownValues
) {
  const fieldElement = document.createElement("div");
  fieldElement.className = "session-detail-item dynamic-field editable-field";

  // Format field name (convert snake_case to Title Case)
  const formattedName = fieldName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  let inputElement = "";

  if (fieldType === "boolean") {
    const isChecked =
      fieldValue === true ||
      fieldValue === "true" ||
      fieldValue === "True" ||
      fieldValue === 1 ||
      fieldValue === "1" ||
      (typeof fieldValue === "string" && fieldValue.toLowerCase() === "true");
    // Create checkbox element directly to ensure it's fully functional
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isChecked;
    checkbox.setAttribute("data-field-name", fieldName);
    checkbox.setAttribute("data-field-type", fieldType);
    checkbox.style.cssText =
      "width: 18px; height: 18px; cursor: pointer; pointer-events: auto !important; z-index: 999 !important; position: relative; margin: 0;";
    checkbox.disabled = false;
    checkbox.readOnly = false;

    // Return early with checkbox element
    fieldElement.innerHTML = `
      <span class="detail-label">${formattedName}</span>
      <span class="detail-value" style="pointer-events: auto !important; z-index: 999 !important; position: relative;">
      </span>
    `;
    const detailValue = fieldElement.querySelector(".detail-value");
    detailValue.appendChild(checkbox);
    return fieldElement;
  } else if (fieldType === "date") {
    inputElement = `<input type="date" value="${
      fieldValue || ""
    }" data-field-name="${fieldName}" data-field-type="${fieldType}" class="editable-input date-input">`;
  } else if (fieldType === "datetime") {
    inputElement = `<input type="datetime-local" value="${
      fieldValue || ""
    }" data-field-name="${fieldName}" data-field-type="${fieldType}" class="editable-input datetime-input">`;
  } else if (fieldType === "number") {
    inputElement = `<input type="number" value="${
      fieldValue || ""
    }" data-field-name="${fieldName}" data-field-type="${fieldType}" class="editable-input">`;
  } else if (fieldType === "email") {
    inputElement = `<input type="email" value="${
      fieldValue || ""
    }" data-field-name="${fieldName}" data-field-type="${fieldType}" class="editable-input">`;
  } else if (fieldType === "tel") {
    inputElement = `<input type="tel" value="${
      fieldValue || ""
    }" data-field-name="${fieldName}" data-field-type="${fieldType}" class="editable-input">`;
  } else if (fieldType === "dropdown") {
    let options = "";
    if (dropdownValues) {
      const optionsList = dropdownValues
        .split("\n")
        .filter((opt) => opt.trim());
      optionsList.forEach((option) => {
        const selected = option.trim() === fieldValue ? "selected" : "";
        options += `<option value="${option.trim()}" ${selected}>${option.trim()}</option>`;
      });
    }
    inputElement = `<select data-field-name="${fieldName}" data-field-type="${fieldType}" class="editable-input">${options}</select>`;
  } else if (fieldType === "textarea") {
    inputElement = `<textarea rows="3" data-field-name="${fieldName}" data-field-type="${fieldType}" class="editable-input">${
      fieldValue || ""
    }</textarea>`;
  } else {
    // Check if field value is long text (>100 chars) - show as textarea in edit mode too
    const fieldValueStr = fieldValue ? String(fieldValue) : "";
    if (fieldValueStr.length > 100) {
      // Escape HTML entities for textarea content
      const escapedValue = fieldValue
        ? String(fieldValue)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
        : "";
      inputElement = `<textarea rows="3" data-field-name="${fieldName}" data-field-type="${fieldType}" class="editable-input">${escapedValue}</textarea>`;
    } else {
      // Escape HTML entities for input value
      const escapedValue = fieldValue
        ? String(fieldValue)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
        : "";
      inputElement = `<input type="text" value="${escapedValue}" data-field-name="${fieldName}" data-field-type="${fieldType}" class="editable-input">`;
    }
  }

  fieldElement.innerHTML = `
    <span class="detail-label">${formattedName}</span>
    <span class="detail-value">${inputElement}</span>
  `;

  return fieldElement;
}

async function findClientIdByName(clientName) {
  console.log("SessyNote: Searching for client ID by name:", clientName);

  try {
    const result = await chrome.storage.local.get(["accessToken"]);
    if (!result.accessToken) {
      throw new Error("No access token found");
    }

    // Parse name into two parts (could be First+Last or Last+First)
    let part1 = "";
    let part2 = "";

    if (clientName.includes(",")) {
      // Has comma: "Last, First" or "First, Last"
      const parts = clientName.split(",").map((p) => p.trim());
      part1 = parts[0];
      part2 = parts[1] || "";
    } else {
      // No comma: "First Last" or "Last First"
      const parts = clientName.trim().split(/\s+/);
      part1 = parts[0] || "";
      part2 = parts.slice(1).join(" ");
    }

    console.log(
      "SessyNote: Searching for client with name parts:",
      part1,
      "+",
      part2
    );

    // Fetch all clients
    const response = await fetch(`${API_BASE_URL}/api/Clients`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch clients: ${response.status}`);
    }

    const clients = await response.json();
    console.log("SessyNote: Fetched clients:", clients.length);

    // Normalize both parts
    const normPart1 = part1.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normPart2 = part2.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Try to find matching client - try BOTH combinations
    for (const client of clients) {
      const clientFirstNorm = (client.first_name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const clientLastNorm = (client.last_name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      // Try: part1=First, part2=Last
      if (clientFirstNorm === normPart1 && clientLastNorm === normPart2) {
        console.log(
          "✅ SessyNote: Found client (First+Last):",
          client.first_name,
          client.last_name,
          "- ID:",
          client.id || client.client_id
        );
        return client.id || client.client_id;
      }

      // Try: part1=Last, part2=First
      if (clientFirstNorm === normPart2 && clientLastNorm === normPart1) {
        console.log(
          "✅ SessyNote: Found client (Last+First):",
          client.first_name,
          client.last_name,
          "- ID:",
          client.id || client.client_id
        );
        return client.id || client.client_id;
      }
    }

    console.warn("⚠️ SessyNote: No matching client found for:", clientName);
    return null;
  } catch (error) {
    console.error("❌ SessyNote: Error finding client by name:", error);
    return null;
  }
}

async function navigateToClientDetail(clientId) {
  console.log("SessyNote: Navigating to client detail:", clientId);

  try {
    // Fetch client details
    const result = await chrome.storage.local.get(["accessToken"]);
    const response = await fetch(`${API_BASE_URL}/api/Clients/${clientId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch client: ${response.status}`);
    }

    const client = await response.json();
    console.log("SessyNote: Client details fetched:", client);

    // Store as current client
    await chrome.storage.local.set({
      currentClient: {
        clientId: clientId,
        ...client,
      },
    });

    // Show client detail page
    showClientDetail(client);
  } catch (error) {
    console.error("SessyNote: Error navigating to client detail:", error);
    throw error;
  }
}

function parseDate(dateString) {
  // Parse various date formats to YYYY-MM-DD
  // Examples: "Tuesday 09-30-2025", "09/30/2025", "2025-09-30"

  if (!dateString) return null;

  try {
    // Remove day name if present ("Tuesday 09-30-2025" -> "09-30-2025")
    const cleaned = dateString.replace(/^\w+\s+/, "");

    // Try parsing as Date
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      // Format as YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    return null;
  } catch (error) {
    console.error("SessyNote: Error parsing date:", error);
    return null;
  }
}

function parseDateTime(dateTimeString) {
  // Parse to YYYY-MM-DDTHH:MM format for datetime-local input
  // Example: "Tuesday 09-30-2025 02:30 PM" -> "2025-09-30T14:30"

  if (!dateTimeString) return null;

  try {
    const date = new Date(dateTimeString);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    return null;
  } catch (error) {
    console.error("SessyNote: Error parsing datetime:", error);
    return null;
  }
}

function parseTime(timeString) {
  // Parse to HH:MM format for time input
  // Examples: "02:30 PM" -> "14:30", "2:30 PM" -> "14:30"

  if (!timeString) return null;

  try {
    // Try parsing with a date to handle AM/PM
    const date = new Date(`2000-01-01 ${timeString}`);
    if (!isNaN(date.getTime())) {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    }
    return null;
  } catch (error) {
    console.error("SessyNote: Error parsing time:", error);
    return null;
  }
}

function fillDynamicFields(scrapedData) {
  console.log("SessyNote: Filling dynamic fields with:", scrapedData);

  // Iterate through scraped data and fill corresponding fields
  for (const [apiName, value] of Object.entries(scrapedData)) {
    if (apiName === "client") continue; // Already handled

    // Try to find the field by various possible IDs/names
    const possibleIds = [
      `new-${apiName}`,
      `new-${apiName.replace(/_/g, "-")}`,
      apiName,
      apiName.replace(/_/g, "-"),
    ];

    let field = null;
    for (const id of possibleIds) {
      field = document.getElementById(id);
      if (field) break;

      // Also try querySelector with name attribute
      field = document.querySelector(`[name="${id}"]`);
      if (field) break;
    }

    if (field) {
      // Fill the field based on its type and data type
      if (field.type === "checkbox") {
        // Boolean fields
        field.checked =
          value === true ||
          value === "true" ||
          value === "1" ||
          value === 1 ||
          (typeof value === "string" && value.toLowerCase() === "yes");
      } else if (field.type === "date") {
        // Date fields (DATE type)
        const parsedDate = parseDate(value);
        if (parsedDate) {
          field.value = parsedDate;
        } else {
          console.warn(`SessyNote: Could not parse date: ${value}`);
        }
      } else if (field.type === "datetime-local") {
        // DateTime fields (TIMESTAMP type)
        const parsedDateTime = parseDateTime(value);
        if (parsedDateTime) {
          field.value = parsedDateTime;
        } else {
          console.warn(`SessyNote: Could not parse datetime: ${value}`);
        }
      } else if (field.type === "time") {
        // Time fields (TIME type)
        const parsedTime = parseTime(value);
        if (parsedTime) {
          field.value = parsedTime;
        } else {
          console.warn(`SessyNote: Could not parse time: ${value}`);
        }
      } else if (field.type === "number") {
        // Integer/Numeric fields
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          field.value = numValue;
        } else {
          console.warn(`SessyNote: Could not parse number: ${value}`);
        }
      } else if (field.tagName === "SELECT") {
        // Dropdown/Enum fields
        const options = Array.from(field.options);
        const matchingOption = options.find(
          (opt) =>
            opt.value.toLowerCase() === value.toLowerCase() ||
            opt.textContent.toLowerCase() === value.toLowerCase()
        );
        if (matchingOption) {
          field.value = matchingOption.value;
        } else {
          field.value = value;
        }
      } else if (field.tagName === "TEXTAREA") {
        // Text/JSONB fields
        field.value = value;
      } else {
        // Default: Text/VARCHAR/UUID fields
        field.value = value;
      }

      console.log(`SessyNote: Filled field ${apiName} with:`, value);
    } else {
      console.warn(`SessyNote: Field not found for ${apiName}`);
    }
  }
}
