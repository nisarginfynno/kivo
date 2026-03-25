import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Kivo Time Tracker",
    version: "1.8.0",
    description: "Track daily work hours, manage breaks, and calculate monthly averages with real-time insights for Keka.",
    permissions: ["scripting", "tabs", "storage", "notifications", "alarms", "offscreen"],
    host_permissions: [
      "https://*.keka.com/*",
      "http://*.keka.com/*",
      "https://meme-api.com/*",
      "https://*.redd.it/*",
      "https://*.redditmedia.com/*",
      "https://*.imgur.com/*",
    ],
  },
});
