import { useState, useEffect } from "react";
import { browser } from "wxt/browser";

interface SettingsProps {
  isHalfDay: boolean;
  setIsHalfDay: (value: boolean) => void;
}

export default function Settings({ isHalfDay, setIsHalfDay }: SettingsProps) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [fontPreference, setFontPreference] = useState<"sans" | "mono">("sans");
  const [lunchTime, setLunchTime] = useState("12:30");

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { notifications_enabled, keka_domain } =
          await browser.storage.local.get([
            "notifications_enabled",
            "keka_domain",
          ]);
        setNotificationsEnabled(!!notifications_enabled);
        if (keka_domain) {
          setDomain(keka_domain as string);
        }

        const { keka_font_preference, lunch_time } =
          await browser.storage.local.get([
            "keka_font_preference",
            "lunch_time",
          ]);
        if (keka_font_preference) {
          setFontPreference(keka_font_preference as "sans" | "mono");
        }
        if (lunch_time) {
          setLunchTime(lunch_time as string);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSaveDomain = async () => {
    try {
      await browser.storage.local.set({ keka_domain: domain });
      setSaveStatus("Saved!");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (error) {
      console.error("Error saving domain:", error);
      setSaveStatus("Error saving");
    }
  };

  const toggleNotifications = async () => {
    try {
      const newState = !notificationsEnabled;
      setNotificationsEnabled(newState);
      await browser.storage.local.set({ notifications_enabled: newState });
    } catch (error) {
      console.error("Error saving settings:", error);
      // Revert state on error
      setNotificationsEnabled(!notificationsEnabled);
    }
  };

  const handleFontChange = async (font: "sans" | "mono") => {
    try {
      setFontPreference(font);
      await browser.storage.local.set({ keka_font_preference: font });

      // Apply immediately
      if (font === "mono") {
        document.body.classList.add("font-mono");
      } else {
        document.body.classList.remove("font-mono");
      }
    } catch (error) {
      console.error("Error saving font preference:", error);
    }
  };

  if (loading) {
    return <div className="loading">Loading settings...</div>;
  }

  return (
    <div className="settings-view popup-container">
      <div className="settings-section">
        <div
          className="settings-row"
          style={{ marginBottom: "16px", display: "block" }}
        >
          <div className="settings-label">Keka Domain</div>
          <div className="settings-description" style={{ marginBottom: "8px" }}>
            Your organization's Keka URL
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yourcompany.keka.com"
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
                fontSize: "14px",
                backgroundColor: "#f8fafc",
                outline: "none",
              }}
            />
            <button
              onClick={handleSaveDomain}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#3b82f6",
                color: "white",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              {saveStatus || "Save"}
            </button>
          </div>
        </div>

        <div
          className="settings-row"
          style={{
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div className="settings-label">Test Notifications</div>
            <div className="settings-description">
              Send a test notification to verify delivery
            </div>
          </div>
          <button
            onClick={async () => {
              if (!browser || !browser.notifications) {
                alert("Notifications API not available");
                return;
              }
              try {
                await browser.notifications.create({
                  type: "basic",
                  iconUrl: "icon/128.png",
                  title: "Test Notification! 🔔",
                  message: "Your notifications are working perfectly! 🎉",
                  silent: false,
                });
                try {
                  const audio = new Audio("/notification-tune.mp3");
                  await audio.play();
                } catch (e) {
                  console.error("Failed to play test notification audio:", e);
                }
              } catch (error) {
                console.error("Error showing test notification:", error);
                alert("Failed to show notification. Check permissions.");
              }
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #e2e8f0",
              backgroundColor: "white",
              color: "#3b82f6",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Test Now
          </button>
        </div>

        <div
          className="settings-row"
          style={{
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div className="settings-label">Lunch Time</div>
            <div className="settings-description">
              When to notify for lunch break
            </div>
          </div>
          <div>
            <input
              type="time"
              value={lunchTime}
              onChange={async (e) => {
                const newTime = e.target.value;
                setLunchTime(newTime);
                await browser.storage.local.set({ lunch_time: newTime });
              }}
              style={{
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
                fontSize: "14px",
                backgroundColor: "#f8fafc",
                outline: "none",
                fontFamily: "inherit",
                color: "inherit",
              }}
            />
          </div>
        </div>

        <div className="settings-row" style={{ marginBottom: "16px" }}>
          <div>
            <div className="settings-label">Enable Notifications</div>
            <div className="settings-description">
              Get alerts for targets, breaks, and overtime
            </div>
          </div>
          <div className="toggle-wrapper">
            <label className="toggle-label">
              <input
                type="checkbox"
                className="toggle-switch"
                checked={notificationsEnabled}
                onChange={toggleNotifications}
              />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">
              Half Day{" "}
              {isHalfDay && (
                <>
                  | <b>Enjoy!!</b>
                </>
              )}
            </div>
            <div className="settings-description">
              Toggle it on if today is your half day.
            </div>
          </div>
          <label className="toggle-label">
            <input
              type="checkbox"
              className="toggle-switch"
              checked={isHalfDay}
              onChange={(e) => setIsHalfDay(e.target.checked)}
            />
          </label>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Font Preference</div>
          <div className="settings-description">
            Choose between Sans-Serif and Monospace
          </div>
        </div>
        <div className="toggle-wrapper" style={{ gap: "8px" }}>
          <button
            onClick={() => handleFontChange("sans")}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              border:
                fontPreference === "sans"
                  ? "1px solid #3b82f6"
                  : "1px solid #e5e7eb",
              backgroundColor:
                fontPreference === "sans" ? "#eff6ff" : "transparent",
              color: fontPreference === "sans" ? "#1d4ed8" : "#6b7280",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            Inter
          </button>
          <button
            onClick={() => handleFontChange("mono")}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              border:
                fontPreference === "mono"
                  ? "1px solid #3b82f6"
                  : "1px solid #e5e7eb",
              backgroundColor:
                fontPreference === "mono" ? "#eff6ff" : "transparent",
              color: fontPreference === "mono" ? "#1d4ed8" : "#6b7280",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            Mono
          </button>
        </div>
      </div>
    </div>
  );
}
