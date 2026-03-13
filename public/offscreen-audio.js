// Offscreen document: plays notification sounds on request from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PLAY_NOTIFICATION_SOUND") {
    const audio = new Audio(message.soundFile || "/notification-tune.mp3");
    audio.volume = message.volume ?? 1.0;
    audio.play().catch((err) => {
      console.error("Failed to play notification sound:", err);
    });
  }
});
