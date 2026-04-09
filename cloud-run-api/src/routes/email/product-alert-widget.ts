import { Context } from 'hono';

/**
 * Serves the product alert widget as a self-contained JavaScript file.
 * GET /api/email-product-alert-widget?client_id=XXX&api_url=YYY
 *
 * Usage on Shopify storefront:
 *   <script src="https://steve-api-850416724643.us-central1.run.app/api/email-product-alert-widget?client_id=YOUR_ID"></script>
 */
export function productAlertWidget(c: Context) {
  const jsCode = `(function(){
"use strict";

var SCRIPT_TAG = document.currentScript;
var PARAMS = new URL(SCRIPT_TAG.src).searchParams;
var CLIENT_ID = PARAMS.get("client_id");
var API_URL = PARAMS.get("api_url") || "https://steve-api-850416724643.us-central1.run.app";

if (!CLIENT_ID) {
  console.warn("[SteveAlerts] Missing client_id parameter. Widget disabled.");
  return;
}

// ---------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------

function getProductMeta() {
  // Try Shopify global
  if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
    var p = window.ShopifyAnalytics.meta.product;
    return {
      id: String(p.id || ""),
      variantId: String(p.variants && p.variants[0] ? p.variants[0].id : ""),
      title: p.title || document.title,
      image: p.images && p.images[0] ? p.images[0] : ""
    };
  }

  // Try meta[property="product:*"] tags
  var metaId = document.querySelector('meta[property="product:retailer_item_id"]');
  var metaTitle = document.querySelector('meta[property="og:title"]');
  var metaImage = document.querySelector('meta[property="og:image"]');

  if (metaId) {
    return {
      id: metaId.getAttribute("content") || "",
      variantId: "",
      title: metaTitle ? metaTitle.getAttribute("content") || document.title : document.title,
      image: metaImage ? metaImage.getAttribute("content") || "" : ""
    };
  }

  // Fallback: extract from URL path if it looks like /products/handle
  var match = window.location.pathname.match(/\\/products\\/([^/?#]+)/);
  if (match) {
    return {
      id: match[1],
      variantId: "",
      title: document.title,
      image: ""
    };
  }

  return null;
}

function isProductPage() {
  var ogType = document.querySelector('meta[property="og:type"]');
  if (ogType && ogType.getAttribute("content") === "product") return true;
  if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) return true;
  if (window.location.pathname.match(/\\/products\\//)) return true;
  return false;
}

function isOutOfStock() {
  // Check Shopify variant availability
  if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
    var variants = window.ShopifyAnalytics.meta.product.variants;
    if (variants && variants.length > 0) {
      var allUnavailable = variants.every(function(v) { return !v.available; });
      if (allUnavailable) return true;
    }
  }

  // Check add-to-cart button text
  var addToCartSelectors = [
    'button[type="submit"][name="add"]',
    'button.product-form__submit',
    'button.add-to-cart',
    '[data-add-to-cart]',
    '.product-form button[type="submit"]',
    '#AddToCart',
    '#add-to-cart',
    '.btn--add-to-cart',
    'form[action*="/cart/add"] button[type="submit"]'
  ];

  for (var i = 0; i < addToCartSelectors.length; i++) {
    var btn = document.querySelector(addToCartSelectors[i]);
    if (btn) {
      var text = (btn.textContent || btn.innerText || "").toLowerCase().trim();
      if (text.indexOf("sold out") !== -1 || text.indexOf("out of stock") !== -1 || text.indexOf("unavailable") !== -1 || text.indexOf("agotado") !== -1) {
        return true;
      }
      if (btn.disabled) {
        if (text.indexOf("add to cart") === -1 && text.indexOf("buy") === -1) {
          return true;
        }
      }
    }
  }

  // Check for any visible "sold out" badges
  var badges = document.querySelectorAll('.sold-out, .product__badge--sold-out, [data-sold-out]');
  if (badges.length > 0) return true;

  return false;
}

function findAddToCartArea() {
  var selectors = [
    'form[action*="/cart/add"]',
    '.product-form',
    '.product-form__buttons',
    '[data-product-form]',
    '#AddToCartForm',
    '#product-form',
    '.product__form'
  ];

  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    if (el) return el;
  }

  // Fallback: find the add-to-cart button and use its parent
  var btn = document.querySelector('button[type="submit"][name="add"]') ||
            document.querySelector('.add-to-cart') ||
            document.querySelector('[data-add-to-cart]');
  if (btn && btn.parentElement) return btn.parentElement;

  return null;
}

// ---------------------------------------------------------------
// Widget injection
// ---------------------------------------------------------------

function injectWidget(product) {
  var host = document.createElement("div");
  host.id = "steve-product-alert-host";

  var shadow = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = [
    ":host { display: block; margin: 12px 0; }",
    ".steve-notify-btn {",
    "  display: inline-flex; align-items: center; justify-content: center; gap: 8px;",
    "  width: 100%; padding: 14px 20px; border: 2px solid #111; border-radius: 6px;",
    "  background: transparent; color: #111; font-size: 15px; font-weight: 600;",
    "  font-family: inherit; cursor: pointer; transition: all 0.2s ease;",
    "  letter-spacing: 0.02em; text-transform: uppercase;",
    "}",
    ".steve-notify-btn:hover { background: #111; color: #fff; }",
    ".steve-notify-btn svg { width: 18px; height: 18px; flex-shrink: 0; }",
    "",
    ".steve-overlay {",
    "  position: fixed; top: 0; left: 0; width: 100%; height: 100%;",
    "  background: rgba(0,0,0,0.5); display: flex; align-items: center;",
    "  justify-content: center; z-index: 999999; opacity: 0; transition: opacity 0.2s ease;",
    "}",
    ".steve-overlay.visible { opacity: 1; }",
    "",
    ".steve-modal {",
    "  background: #fff; border-radius: 12px; padding: 32px; max-width: 420px;",
    "  width: 90%; position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.15);",
    "  transform: translateY(20px); transition: transform 0.2s ease;",
    "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "}",
    ".steve-overlay.visible .steve-modal { transform: translateY(0); }",
    "",
    ".steve-close {",
    "  position: absolute; top: 12px; right: 12px; background: none; border: none;",
    "  font-size: 24px; cursor: pointer; color: #999; padding: 4px 8px; line-height: 1;",
    "}",
    ".steve-close:hover { color: #333; }",
    "",
    ".steve-modal h3 {",
    "  margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #111;",
    "}",
    ".steve-modal p {",
    "  margin: 0 0 20px; font-size: 14px; color: #666; line-height: 1.5;",
    "}",
    "",
    ".steve-product-info {",
    "  display: flex; align-items: center; gap: 12px; margin-bottom: 20px;",
    "  padding: 12px; background: #f8f8f8; border-radius: 8px;",
    "}",
    ".steve-product-info img {",
    "  width: 56px; height: 56px; object-fit: cover; border-radius: 6px;",
    "}",
    ".steve-product-info span { font-size: 14px; font-weight: 600; color: #333; }",
    "",
    ".steve-input {",
    "  width: 100%; padding: 12px 14px; border: 1.5px solid #ddd; border-radius: 8px;",
    "  font-size: 15px; outline: none; transition: border-color 0.2s ease;",
    "  box-sizing: border-box; margin-bottom: 12px;",
    "}",
    ".steve-input:focus { border-color: #111; }",
    "",
    ".steve-submit {",
    "  width: 100%; padding: 14px; background: #111; color: #fff; border: none;",
    "  border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;",
    "  transition: background 0.2s ease;",
    "}",
    ".steve-submit:hover { background: #333; }",
    ".steve-submit:disabled { background: #999; cursor: not-allowed; }",
    "",
    ".steve-success {",
    "  text-align: center; padding: 20px 0;",
    "}",
    ".steve-success svg { width: 48px; height: 48px; margin-bottom: 12px; color: #22c55e; }",
    ".steve-success h3 { margin: 0 0 8px; font-size: 18px; color: #111; }",
    ".steve-success p { margin: 0; font-size: 14px; color: #666; }",
    "",
    ".steve-error { color: #ef4444; font-size: 13px; margin-top: 8px; }",
  ].join("\\n");

  shadow.appendChild(style);

  // Notify Me button
  var btnContainer = document.createElement("div");
  btnContainer.innerHTML = '<button class="steve-notify-btn" type="button">' +
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>' +
    'Notify Me When Available</button>';
  shadow.appendChild(btnContainer);

  var btn = btnContainer.querySelector("button");
  btn.addEventListener("click", function() { showModal(); });

  // Modal overlay
  var overlay = document.createElement("div");
  overlay.className = "steve-overlay";

  var safeImage = sanitizeUrl(product.image);
  var productImgHtml = safeImage ?
    '<div class="steve-product-info"><img src="' + safeImage + '" alt=""><span>' + escapeHtml(product.title) + '</span></div>' :
    '<div class="steve-product-info"><span>' + escapeHtml(product.title) + '</span></div>';

  overlay.innerHTML =
    '<div class="steve-modal">' +
      '<button class="steve-close" type="button">&times;</button>' +
      '<div class="steve-form-view">' +
        '<h3>Get Notified</h3>' +
        '<p>Enter your email and we\\'ll let you know when this item is back in stock.</p>' +
        productImgHtml +
        '<input type="email" class="steve-input" placeholder="Enter your email address" autocomplete="email">' +
        '<div class="steve-error" style="display:none;"></div>' +
        '<button class="steve-submit" type="button">Notify Me</button>' +
      '</div>' +
      '<div class="steve-success" style="display:none;">' +
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>' +
        '<h3>You\\'re on the list!</h3>' +
        '<p>We\\'ll email you as soon as this item is back in stock.</p>' +
      '</div>' +
    '</div>';

  shadow.appendChild(overlay);

  // Wire up modal events
  var modal = overlay.querySelector(".steve-modal");
  var closeBtn = overlay.querySelector(".steve-close");
  var input = overlay.querySelector(".steve-input");
  var submitBtn = overlay.querySelector(".steve-submit");
  var errorEl = overlay.querySelector(".steve-error");
  var formView = overlay.querySelector(".steve-form-view");
  var successView = overlay.querySelector(".steve-success");

  function showModal() {
    overlay.style.display = "flex";
    requestAnimationFrame(function() {
      overlay.classList.add("visible");
    });
    if (input) input.focus();
  }

  function hideModal() {
    overlay.classList.remove("visible");
    setTimeout(function() {
      overlay.style.display = "none";
      // Reset state
      formView.style.display = "";
      successView.style.display = "none";
      errorEl.style.display = "none";
      errorEl.textContent = "";
      if (input) input.value = "";
    }, 200);
  }

  closeBtn.addEventListener("click", hideModal);
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) hideModal();
  });

  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") submitBtn.click();
  });

  submitBtn.addEventListener("click", function() {
    var email = (input.value || "").trim();

    if (!email || !email.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)) {
      errorEl.textContent = "Please enter a valid email address.";
      errorEl.style.display = "block";
      return;
    }

    errorEl.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    var payload = {
      action: "subscribe",
      client_id: CLIENT_ID,
      email: email,
      product_id: product.id,
      variant_id: product.variantId || undefined,
      product_title: product.title || undefined,
      product_image: product.image || undefined,
      alert_type: "back_in_stock"
    };

    fetch(API_URL + "/api/email-product-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success) {
        formView.style.display = "none";
        successView.style.display = "block";
        // Auto-close after 3 seconds
        setTimeout(hideModal, 3000);
      } else {
        errorEl.textContent = data.error || "Something went wrong. Please try again.";
        errorEl.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.textContent = "Notify Me";
      }
    })
    .catch(function() {
      errorEl.textContent = "Network error. Please try again.";
      errorEl.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = "Notify Me";
    });
  });

  // Insert into page
  var target = findAddToCartArea();
  if (target) {
    target.parentNode.insertBefore(host, target.nextSibling);
  } else {
    // Last resort: append to main content area
    var main = document.querySelector("main") || document.querySelector(".product") || document.body;
    main.appendChild(host);
  }
}

function sanitizeUrl(url) {
  if (!url) return '';
  if (!/^https?:\\/\\//i.test(url)) return '';
  return url.replace(/['"<>]/g, '');
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ---------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------

function init() {
  if (!isProductPage()) return;
  if (!isOutOfStock()) return;

  var product = getProductMeta();
  if (!product) {
    console.warn("[SteveAlerts] Could not detect product metadata.");
    return;
  }

  injectWidget(product);
}

// Run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

})();`;

  return c.text(jsCode, 200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });
}
