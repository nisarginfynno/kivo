import { useState, useEffect, useRef } from "react";
import { browser } from "wxt/browser";
import { getRelevantMeme } from "../../../utils/memes";
import {
  DEFAULT_WORK_HOURS_CONFIG,
  WORK_HOURS_CONFIG_STORAGE_KEY,
  normalizeWorkHoursConfig,
  type WorkHoursConfig,
} from "../../../utils/workHoursConfig";

interface SettingsProps {
  isHalfDay: boolean;
  setIsHalfDay: (value: boolean) => void;
  showMonthlyAvgTarget: boolean;
  setShowMonthlyAvgTarget: (value: boolean) => void | Promise<void>;
}

export default function Settings({
  isHalfDay,
  setIsHalfDay,
  showMonthlyAvgTarget,
  setShowMonthlyAvgTarget,
}: SettingsProps) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [memesEnabled, setMemesEnabled] = useState(false);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [fontPreference, setFontPreference] = useState<"sans" | "mono">("sans");
  const [lunchTime, setLunchTime] = useState("12:30");
  const [fullDayTargetMinutes, setFullDayTargetMinutes] = useState(
    DEFAULT_WORK_HOURS_CONFIG.fullDayMinutes,
  );
  const [halfDayTargetMinutes, setHalfDayTargetMinutes] = useState(
    DEFAULT_WORK_HOURS_CONFIG.halfDayMinutes,
  );
  const saveWorkHoursTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const MIN_TARGET_MINUTES = 30;

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedSettings = await browser.storage.local.get([
          "notifications_enabled",
          "keka_domain",
          "memes_enabled",
          "keka_font_preference",
          "lunch_time",
          WORK_HOURS_CONFIG_STORAGE_KEY,
        ]);
        const {
          notifications_enabled,
          keka_domain,
          memes_enabled,
          keka_font_preference,
          lunch_time,
        } = storedSettings;
        setNotificationsEnabled(!!notifications_enabled);
        setMemesEnabled(!!memes_enabled);
        if (keka_domain) {
          setDomain(keka_domain as string);
        }

        if (keka_font_preference) {
          setFontPreference(keka_font_preference as "sans" | "mono");
        }
        if (lunch_time) {
          setLunchTime(lunch_time as string);
        }

        const normalizedWorkHours = normalizeWorkHoursConfig(
          storedSettings[WORK_HOURS_CONFIG_STORAGE_KEY] as
            | Partial<WorkHoursConfig>
            | undefined,
        );
        setFullDayTargetMinutes(normalizedWorkHours.fullDayMinutes);
        setHalfDayTargetMinutes(normalizedWorkHours.halfDayMinutes);
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();

    return () => {
      if (saveWorkHoursTimeoutRef.current) {
        clearTimeout(saveWorkHoursTimeoutRef.current);
      }
    };
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

  const persistWorkHours = async (
    fullDayMinutes: number,
    halfDayMinutes: number,
  ) => {
    try {
      const normalized = normalizeWorkHoursConfig({
        fullDayMinutes,
        halfDayMinutes: Math.min(halfDayMinutes, fullDayMinutes),
      });

      await browser.storage.local.set({
        [WORK_HOURS_CONFIG_STORAGE_KEY]: normalized,
      });

      setFullDayTargetMinutes(normalized.fullDayMinutes);
      setHalfDayTargetMinutes(normalized.halfDayMinutes);

      // Refresh background calculations immediately.
      browser.runtime.sendMessage({ type: "FORCE_CHECK" }).catch(() => {});
    } catch (error) {
      console.error("Error saving work hours:", error);
    }
  };

  const queueWorkHoursSave = (
    nextFullDayMinutes: number,
    nextHalfDayMinutes: number,
  ) => {
    if (saveWorkHoursTimeoutRef.current) {
      clearTimeout(saveWorkHoursTimeoutRef.current);
    }

    saveWorkHoursTimeoutRef.current = setTimeout(() => {
      void persistWorkHours(nextFullDayMinutes, nextHalfDayMinutes);
    }, 250);
  };

  const parseNumberInput = (value: string, fallback: number): number => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const clampTargetMinutes = (targetMinutes: number): number =>
    Math.max(MIN_TARGET_MINUTES, targetMinutes);

  const handleFullDayHoursChange = (nextHoursInput: string) => {
    const currentHours = Math.floor(fullDayTargetMinutes / 60);
    const nextHours = Math.min(23, Math.max(0, parseNumberInput(nextHoursInput, currentHours)));
    const minutePart = fullDayTargetMinutes % 60;
    const nextFullDayMinutes = clampTargetMinutes(nextHours * 60 + minutePart);
    const nextHalfDayMinutes = Math.min(halfDayTargetMinutes, nextFullDayMinutes);

    setFullDayTargetMinutes(nextFullDayMinutes);
    setHalfDayTargetMinutes(nextHalfDayMinutes);
    queueWorkHoursSave(nextFullDayMinutes, nextHalfDayMinutes);
  };

  const handleFullDayMinutesChange = (nextMinutesInput: string) => {
    const currentMinutes = fullDayTargetMinutes % 60;
    const nextMinutes = Math.min(
      59,
      Math.max(0, parseNumberInput(nextMinutesInput, currentMinutes)),
    );
    const hourPart = Math.floor(fullDayTargetMinutes / 60);
    const nextFullDayMinutes = clampTargetMinutes(hourPart * 60 + nextMinutes);
    const nextHalfDayMinutes = Math.min(halfDayTargetMinutes, nextFullDayMinutes);

    setFullDayTargetMinutes(nextFullDayMinutes);
    setHalfDayTargetMinutes(nextHalfDayMinutes);
    queueWorkHoursSave(nextFullDayMinutes, nextHalfDayMinutes);
  };

  const handleHalfDayHoursChange = (nextHoursInput: string) => {
    const currentHours = Math.floor(halfDayTargetMinutes / 60);
    const nextHours = Math.min(
      23,
      Math.max(0, parseNumberInput(nextHoursInput, currentHours)),
    );
    const minutePart = halfDayTargetMinutes % 60;
    const nextHalfDayMinutes = clampTargetMinutes(nextHours * 60 + minutePart);
    const safeHalfDayMinutes = Math.min(nextHalfDayMinutes, fullDayTargetMinutes);

    setHalfDayTargetMinutes(safeHalfDayMinutes);
    queueWorkHoursSave(fullDayTargetMinutes, safeHalfDayMinutes);
  };

  const handleHalfDayMinutesChange = (nextMinutesInput: string) => {
    const currentMinutes = halfDayTargetMinutes % 60;
    const nextMinutes = Math.min(
      59,
      Math.max(0, parseNumberInput(nextMinutesInput, currentMinutes)),
    );
    const hourPart = Math.floor(halfDayTargetMinutes / 60);
    const nextHalfDayMinutes = clampTargetMinutes(hourPart * 60 + nextMinutes);
    const safeHalfDayMinutes = Math.min(nextHalfDayMinutes, fullDayTargetMinutes);

    setHalfDayTargetMinutes(safeHalfDayMinutes);
    queueWorkHoursSave(fullDayTargetMinutes, safeHalfDayMinutes);
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

  const toggleMemes = async () => {
    try {
      const newState = !memesEnabled;
      setMemesEnabled(newState);
      await browser.storage.local.set({ memes_enabled: newState });
    } catch (error) {
      console.error("Error saving meme settings:", error);
      // Revert state on error
      setMemesEnabled(!memesEnabled);
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
                let imageUrl: string | null = null;
                if (memesEnabled) {
                  try {
                    imageUrl = await getRelevantMeme("completion");
                  } catch (e) {
                    console.error("Failed to fetch test meme:", e);
                  }
                }

                if (imageUrl) {
                  await browser.notifications.create({
                    type: "image",
                    iconUrl: "icon/128.png",
                    title: "Test Notification! 🔔",
                    message: "Your notifications are working perfectly! 🎉",
                    imageUrl,
                    silent: false,
                  });
                } else {
                  await browser.notifications.create({
                    type: "basic",
                    iconUrl: "icon/128.png",
                    title: "Test Notification! 🔔",
                    message: "Your notifications are working perfectly! 🎉",
                    silent: false,
                  });
                }

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

        <div
          className="settings-row"
          style={{ marginBottom: "16px", display: "block" }}
        >
          <div className="settings-label">Work Hours Targets</div>
          <div className="settings-description" style={{ marginBottom: "8px" }}>
            Configure your full day and half day targets (hours + minutes)
          </div>
          <div style={{ display: "grid", gap: "6px" }}>
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "12px", color: "#64748b" }}>Full Day</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={Math.floor(fullDayTargetMinutes / 60)}
                  onChange={(e) => handleFullDayHoursChange(e.target.value)}
                  style={{
                    width: "56px",
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
                <span style={{ fontSize: "12px", color: "#64748b" }}>hrs</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={fullDayTargetMinutes % 60}
                  onChange={(e) => handleFullDayMinutesChange(e.target.value)}
                  style={{
                    width: "56px",
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
                <span style={{ fontSize: "12px", color: "#64748b" }}>mins</span>
              </div>
            </label>
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "12px", color: "#64748b" }}>Half Day</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={Math.floor(halfDayTargetMinutes / 60)}
                  onChange={(e) => handleHalfDayHoursChange(e.target.value)}
                  style={{
                    width: "56px",
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
                <span style={{ fontSize: "12px", color: "#64748b" }}>hrs</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={halfDayTargetMinutes % 60}
                  onChange={(e) => handleHalfDayMinutesChange(e.target.value)}
                  style={{
                    width: "56px",
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
                <span style={{ fontSize: "12px", color: "#64748b" }}>mins</span>
              </div>
            </label>
          </div>
        </div>

        <div className="settings-row" style={{ marginBottom: "16px" }}>
          <div>
            <div className="settings-label">Show Monthly Avg Target</div>
            <div className="settings-description">
              Show or hide the Monthly Avg Target card in Today view
            </div>
          </div>
          <div className="toggle-wrapper">
            <label className="toggle-label">
              <input
                type="checkbox"
                className="toggle-switch"
                checked={showMonthlyAvgTarget}
                onChange={(e) => void setShowMonthlyAvgTarget(e.target.checked)}
              />
            </label>
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

        <div className="settings-row" style={{ marginBottom: "16px" }}>
          <div>
            <div className="settings-label">Enable Memes in Notifications</div>
            <div className="settings-description">
              Show fun context-relevant memes in alerts
            </div>
          </div>
          <div className="toggle-wrapper">
            <label className="toggle-label">
              <input
                type="checkbox"
                className="toggle-switch"
                checked={memesEnabled}
                onChange={toggleMemes}
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
