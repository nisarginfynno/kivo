export default defineContentScript({
  matches: ["*://*.keka.com/*"],
  main() {
    // Listen for messages from popup requesting access_token
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "getAccessToken") {
        try {
          const accessToken = localStorage.getItem("access_token");
          sendResponse({ success: true, accessToken });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
        return true; // Keep the message channel open for async response
      }
    });

    // Proactively send token to background script
    let lastToken = localStorage.getItem("access_token");
    
    // Send initial token if exists
    if (lastToken) {
      browser.runtime.sendMessage({ type: "TOKEN_UPDATE", token: lastToken }).catch(() => {});
    }

    // Listen for storage changes to detect token updates asynchronously without CPU polling
    window.addEventListener("storage", (event) => {
      if (event.key === "access_token" && event.newValue) {
        if (event.newValue !== lastToken) {
          lastToken = event.newValue;
          browser.runtime.sendMessage({ type: "TOKEN_UPDATE", token: event.newValue }).catch(() => {});
        }
      }
    });
  },
});
