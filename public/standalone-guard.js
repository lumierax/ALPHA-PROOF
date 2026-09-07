"use strict";
(() => {
  window.__ALPHA_ENTRY_MODE__ = "LOCAL_STANDALONE";
  window.__ALPHA_RAILWAY_DISABLED__ = true;

  try {
    localStorage.removeItem("alphaProofApiBase");
  } catch (_) {}

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function alphaStandaloneFetch(input, init) {
    let raw = "";
    try {
      raw = typeof input === "string" ? input : (input && input.url) || String(input || "");
      const url = new URL(raw, location.href);
      const host = String(url.hostname || "").toLowerCase();
      if (host === "perfect-magic-production.up.railway.app" || host.endsWith(".railway.app")) {
        return Promise.reject(new TypeError("Railway is intentionally disabled in ALPHA PROOF GitHub Standalone Backup"));
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  Object.defineProperty(window, "__ALPHA_STANDALONE_READY__", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
})();
