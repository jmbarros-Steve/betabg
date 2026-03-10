import { Context } from 'hono';

/**
 * Serves the signup form widget as a self-contained JavaScript file.
 * GET /api/email-form-widget?form_id=XXX
 *
 * Loaded via Shopify ScriptTag. Fetches form config from the API,
 * applies trigger rules, renders the form using Shadow DOM for
 * style isolation, and handles submission.
 */
export function formWidget(c: Context) {
  const jsCode = `(function(){
"use strict";

var SCRIPT_TAG = document.currentScript;
var PARAMS = new URL(SCRIPT_TAG.src).searchParams;
var FORM_ID = PARAMS.get("form_id");
var API_URL = PARAMS.get("api_url") || "https://steve-api-850416724643.us-central1.run.app";

if (!FORM_ID) {
  console.warn("[SteveForms] Missing form_id parameter. Widget disabled.");
  return;
}

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
var formConfig = null;
var hasTriggered = false;

// ---------------------------------------------------------------
// Fetch config from API
// ---------------------------------------------------------------
function loadConfig(callback) {
  fetch(API_URL + "/api/email-signup-form-public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_config", form_id: FORM_ID })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.form) {
      callback(data.form);
    } else {
      console.warn("[SteveForms] Form not found or inactive.");
    }
  })
  .catch(function(err) {
    console.error("[SteveForms] Failed to load config:", err);
  });
}

// ---------------------------------------------------------------
// Trigger rule evaluation
// ---------------------------------------------------------------
function shouldShowByFrequency(rules) {
  var freq = rules.show_frequency || "always";
  var storageKey = "steve_form_shown_" + FORM_ID;

  if (freq === "once") {
    try { if (localStorage.getItem(storageKey)) return false; } catch(e) {}
  } else if (freq === "session") {
    try { if (sessionStorage.getItem(storageKey)) return false; } catch(e) {}
  }
  return true;
}

function markAsShown(rules) {
  var freq = rules.show_frequency || "always";
  var storageKey = "steve_form_shown_" + FORM_ID;

  if (freq === "once") {
    try { localStorage.setItem(storageKey, "1"); } catch(e) {}
  } else if (freq === "session") {
    try { sessionStorage.setItem(storageKey, "1"); } catch(e) {}
  }
}

function matchesPageUrl(rules) {
  if (!rules.page_url_contains) return true;
  return window.location.href.indexOf(rules.page_url_contains) !== -1;
}

function matchesDevice(rules) {
  if (!rules.device) return true;
  var isMobile = window.innerWidth < 768;
  if (rules.device === "mobile") return isMobile;
  if (rules.device === "desktop") return !isMobile;
  return true;
}

function setupTriggers(config) {
  var rules = config.trigger_rules || {};

  // Pre-checks
  if (!shouldShowByFrequency(rules)) return;
  if (!matchesPageUrl(rules)) return;
  if (!matchesDevice(rules)) return;

  var triggers = rules.triggers || [];

  // Default: show after 3 seconds if no specific triggers
  if (triggers.length === 0 && !rules.exit_intent && !rules.scroll_depth && !rules.time_on_page) {
    setTimeout(function() { fireForm(config); }, 3000);
    return;
  }

  // Exit intent
  if (rules.exit_intent || triggers.indexOf("exit_intent") !== -1) {
    document.addEventListener("mouseleave", function onLeave(e) {
      if (e.clientY <= 0) {
        document.removeEventListener("mouseleave", onLeave);
        fireForm(config);
      }
    });
  }

  // Scroll depth
  var scrollTarget = rules.scroll_depth;
  if (scrollTarget || triggers.indexOf("scroll_depth") !== -1) {
    var pct = scrollTarget || 50;
    window.addEventListener("scroll", function onScroll() {
      var scrolled = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      if (scrolled >= pct) {
        window.removeEventListener("scroll", onScroll);
        fireForm(config);
      }
    });
  }

  // Time on page
  var timeDelay = rules.time_on_page;
  if (timeDelay || triggers.indexOf("time_on_page") !== -1) {
    var seconds = timeDelay || 5;
    setTimeout(function() { fireForm(config); }, seconds * 1000);
  }
}

function fireForm(config) {
  if (hasTriggered) return;
  hasTriggered = true;
  markAsShown(config.trigger_rules || {});
  renderForm(config);
}

// ---------------------------------------------------------------
// Render form with Shadow DOM
// ---------------------------------------------------------------
function renderForm(config) {
  var design = config.design || {};
  var formType = config.form_type || "popup";

  var bgColor = design.bg_color || "#ffffff";
  var textColor = design.text_color || "#111111";
  var buttonColor = design.button_color || "#111111";
  var buttonTextColor = getContrastColor(buttonColor);

  var headline = design.headline || "Stay in the loop";
  var subtext = design.subtext || "Subscribe to get the latest updates and exclusive offers.";
  var buttonText = design.button_text || "Subscribe";
  var showFirstName = design.show_first_name !== false;
  var successMessage = design.success_message || "Thanks for subscribing!";

  // Host element
  var host = document.createElement("div");
  host.id = "steve-signup-form-host";
  var shadow = host.attachShadow({ mode: "open" });

  // Styles
  var style = document.createElement("style");
  style.textContent = buildStyles(formType, bgColor, textColor, buttonColor, buttonTextColor);
  shadow.appendChild(style);

  // Overlay / container
  var isOverlay = formType === "popup" || formType === "slide_in" || formType === "full_page";
  var container;

  if (isOverlay) {
    container = document.createElement("div");
    container.className = "steve-overlay steve-type-" + formType;
    container.innerHTML =
      '<div class="steve-form-card">' +
        '<button class="steve-close" type="button">&times;</button>' +
        '<div class="steve-form-view">' +
          '<h2 class="steve-headline">' + escapeHtml(headline) + '</h2>' +
          '<p class="steve-subtext">' + escapeHtml(subtext) + '</p>' +
          (showFirstName ? '<input type="text" class="steve-input steve-input-name" placeholder="First name" autocomplete="given-name">' : '') +
          '<input type="email" class="steve-input steve-input-email" placeholder="Email address" autocomplete="email">' +
          '<div class="steve-error" style="display:none;"></div>' +
          '<button class="steve-submit" type="button">' + escapeHtml(buttonText) + '</button>' +
        '</div>' +
        '<div class="steve-success-view" style="display:none;">' +
          '<div class="steve-check-icon">&#10003;</div>' +
          '<p class="steve-success-msg">' + escapeHtml(successMessage) + '</p>' +
        '</div>' +
      '</div>';
    shadow.appendChild(container);

    // Show with animation
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        container.classList.add("visible");
      });
    });

    // Close handlers
    var closeBtn = container.querySelector(".steve-close");
    closeBtn.addEventListener("click", function() { hideOverlay(container, host); });
    container.addEventListener("click", function(e) {
      if (e.target === container) hideOverlay(container, host);
    });
  } else {
    // Inline: no overlay, just append the card
    container = document.createElement("div");
    container.className = "steve-inline-container";
    container.innerHTML =
      '<div class="steve-form-card">' +
        '<div class="steve-form-view">' +
          '<h2 class="steve-headline">' + escapeHtml(headline) + '</h2>' +
          '<p class="steve-subtext">' + escapeHtml(subtext) + '</p>' +
          (showFirstName ? '<input type="text" class="steve-input steve-input-name" placeholder="First name" autocomplete="given-name">' : '') +
          '<input type="email" class="steve-input steve-input-email" placeholder="Email address" autocomplete="email">' +
          '<div class="steve-error" style="display:none;"></div>' +
          '<button class="steve-submit" type="button">' + escapeHtml(buttonText) + '</button>' +
        '</div>' +
        '<div class="steve-success-view" style="display:none;">' +
          '<div class="steve-check-icon">&#10003;</div>' +
          '<p class="steve-success-msg">' + escapeHtml(successMessage) + '</p>' +
        '</div>' +
      '</div>';
    shadow.appendChild(container);
  }

  // Wire up submit
  var emailInput = shadow.querySelector(".steve-input-email");
  var nameInput = shadow.querySelector(".steve-input-name");
  var submitBtn = shadow.querySelector(".steve-submit");
  var errorEl = shadow.querySelector(".steve-error");
  var formView = shadow.querySelector(".steve-form-view");
  var successView = shadow.querySelector(".steve-success-view");

  if (emailInput) {
    emailInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") submitBtn.click();
    });
  }

  submitBtn.addEventListener("click", function() {
    var email = (emailInput.value || "").trim();
    var firstName = nameInput ? (nameInput.value || "").trim() : "";

    if (!email || !email.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)) {
      errorEl.textContent = "Please enter a valid email address.";
      errorEl.style.display = "block";
      return;
    }

    errorEl.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    var payload = {
      action: "submit",
      form_id: FORM_ID,
      email: email
    };
    if (firstName) payload.first_name = firstName;

    fetch(API_URL + "/api/email-signup-form-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success) {
        formView.style.display = "none";
        successView.style.display = "block";

        // Show incentive if provided
        if (data.incentive_type && data.incentive_type !== "none" && data.incentive_value) {
          var incentiveMsg = "";
          if (data.incentive_type === "discount_code") {
            incentiveMsg = "Use code: " + data.incentive_value;
          } else if (data.incentive_type === "free_shipping") {
            incentiveMsg = "You qualify for free shipping!";
          }
          if (incentiveMsg) {
            var incentiveEl = document.createElement("p");
            incentiveEl.className = "steve-incentive";
            incentiveEl.textContent = incentiveMsg;
            successView.appendChild(incentiveEl);
          }
        }

        // Auto-close overlays after 4 seconds
        if (isOverlay) {
          setTimeout(function() { hideOverlay(container, host); }, 4000);
        }
      } else {
        errorEl.textContent = data.error || "Something went wrong. Please try again.";
        errorEl.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.textContent = escapeHtml(buttonText);
      }
    })
    .catch(function() {
      errorEl.textContent = "Network error. Please try again.";
      errorEl.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = escapeHtml(buttonText);
    });
  });

  document.body.appendChild(host);
}

function hideOverlay(overlay, host) {
  overlay.classList.remove("visible");
  setTimeout(function() {
    if (host.parentNode) host.parentNode.removeChild(host);
  }, 300);
}

// ---------------------------------------------------------------
// CSS builder
// ---------------------------------------------------------------
function buildStyles(formType, bg, text, btn, btnText) {
  var base = [
    ":host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }",
    "",
    ".steve-overlay {",
    "  position: fixed; top: 0; left: 0; width: 100%; height: 100%;",
    "  display: flex; align-items: center; justify-content: center;",
    "  z-index: 2147483647; opacity: 0; transition: opacity 0.3s ease;",
    "  pointer-events: none;",
    "}",
    ".steve-overlay.visible { opacity: 1; pointer-events: auto; }",
    "",
    ".steve-type-popup { background: rgba(0,0,0,0.5); }",
    ".steve-type-full_page { background: rgba(0,0,0,0.85); }",
    "",
    ".steve-type-slide_in {",
    "  align-items: flex-end; justify-content: flex-end;",
    "  padding: 20px; background: transparent;",
    "}",
    ".steve-type-slide_in .steve-form-card {",
    "  transform: translateY(20px);",
    "  transition: transform 0.3s ease;",
    "}",
    ".steve-type-slide_in.visible .steve-form-card {",
    "  transform: translateY(0);",
    "}",
    "",
    ".steve-type-popup .steve-form-card,",
    ".steve-type-full_page .steve-form-card {",
    "  transform: scale(0.95); transition: transform 0.3s ease;",
    "}",
    ".steve-type-popup.visible .steve-form-card,",
    ".steve-type-full_page.visible .steve-form-card {",
    "  transform: scale(1);",
    "}",
    "",
    ".steve-form-card {",
    "  background: " + bg + "; color: " + text + ";",
    "  border-radius: 12px; padding: 32px; max-width: 440px; width: 90%;",
    "  position: relative;",
    "  box-shadow: 0 20px 60px rgba(0,0,0,0.15);",
    "}",
    "",
    ".steve-inline-container .steve-form-card {",
    "  box-shadow: 0 2px 12px rgba(0,0,0,0.08);",
    "  max-width: 100%; width: 100%;",
    "}",
    "",
    ".steve-close {",
    "  position: absolute; top: 10px; right: 14px; background: none; border: none;",
    "  font-size: 26px; cursor: pointer; color: " + text + "; opacity: 0.5;",
    "  padding: 4px 8px; line-height: 1;",
    "}",
    ".steve-close:hover { opacity: 1; }",
    "",
    ".steve-headline {",
    "  margin: 0 0 8px; font-size: 22px; font-weight: 700; color: " + text + ";",
    "}",
    ".steve-subtext {",
    "  margin: 0 0 20px; font-size: 14px; color: " + text + "; opacity: 0.75; line-height: 1.5;",
    "}",
    "",
    ".steve-input {",
    "  display: block; width: 100%; padding: 12px 14px;",
    "  border: 1.5px solid " + text + "22; border-radius: 8px;",
    "  font-size: 15px; outline: none; box-sizing: border-box;",
    "  margin-bottom: 10px; background: transparent; color: " + text + ";",
    "  transition: border-color 0.2s ease;",
    "}",
    ".steve-input::placeholder { color: " + text + "; opacity: 0.4; }",
    ".steve-input:focus { border-color: " + btn + "; }",
    "",
    ".steve-submit {",
    "  display: block; width: 100%; padding: 14px;",
    "  background: " + btn + "; color: " + btnText + ";",
    "  border: none; border-radius: 8px; font-size: 15px; font-weight: 600;",
    "  cursor: pointer; transition: opacity 0.2s ease; margin-top: 4px;",
    "}",
    ".steve-submit:hover { opacity: 0.9; }",
    ".steve-submit:disabled { opacity: 0.6; cursor: not-allowed; }",
    "",
    ".steve-error { color: #ef4444; font-size: 13px; margin-bottom: 8px; }",
    "",
    ".steve-success-view { text-align: center; padding: 20px 0; }",
    ".steve-check-icon {",
    "  display: inline-flex; align-items: center; justify-content: center;",
    "  width: 48px; height: 48px; border-radius: 50%;",
    "  background: #22c55e; color: #fff; font-size: 24px; margin-bottom: 12px;",
    "}",
    ".steve-success-msg { font-size: 16px; color: " + text + "; margin: 0 0 8px; }",
    ".steve-incentive {",
    "  font-size: 14px; font-weight: 700; color: " + btn + ";",
    "  margin-top: 8px; padding: 8px 12px;",
    "  background: " + btn + "11; border-radius: 6px; display: inline-block;",
    "}",
  ];

  return base.join("\\n");
}

// ---------------------------------------------------------------
// Utility
// ---------------------------------------------------------------
function escapeHtml(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str || ""));
  return div.innerHTML;
}

function getContrastColor(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) {
    hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  }
  var r = parseInt(hex.substr(0,2), 16);
  var g = parseInt(hex.substr(2,2), 16);
  var b = parseInt(hex.substr(4,2), 16);
  var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#111111" : "#ffffff";
}

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
function init() {
  loadConfig(function(config) {
    formConfig = config;
    setupTriggers(config);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

})();`;

  return c.text(jsCode, 200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
  });
}
