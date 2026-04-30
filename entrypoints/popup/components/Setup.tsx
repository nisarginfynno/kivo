import { useState } from "react";
import { browser } from "wxt/browser";
import confetti from "canvas-confetti";

interface SetupProps {
  onComplete: () => void;
}

const normalizeWorkspaceInput = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\.keka\.com$/, "");

const isValidWorkspaceSubdomain = (value: string) =>
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);

export default function Setup({ onComplete }: SetupProps) {
  const [subdomain, setSubdomain] = useState("");
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [loading, setLoading] = useState(false);
  const [setupError, setSetupError] = useState("");

  const isDomainValid = isValidWorkspaceSubdomain(subdomain);

  const handleSave = async () => {
    const normalizedSubdomain = normalizeWorkspaceInput(subdomain);
    if (!normalizedSubdomain) {
      setSetupError("Enter your Keka workspace name.");
      return;
    }
    if (!isValidWorkspaceSubdomain(normalizedSubdomain)) {
      setSetupError("Use only letters, numbers, and hyphens.");
      return;
    }

    setLoading(true);

    const fullDomain = `${normalizedSubdomain}.keka.com`;

    try {
      await browser.storage.local.set({
        keka_domain: fullDomain,
        notifications_enabled: enableNotifications,
      });

      const count = 200;
      const defaults = {
        origin: { y: 0.7 },
      };

      function fire(particleRatio: number, opts: any) {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
        });
      }

      fire(0.25, {
        spread: 26,
        startVelocity: 55,
      });
      fire(0.2, {
        spread: 60,
      });
      fire(0.35, {
        spread: 100,
        decay: 0.91,
        scalar: 0.8,
      });
      fire(0.1, {
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2,
      });
      fire(0.1, {
        spread: 120,
        startVelocity: 45,
      });

      // Wait for confetti to show before transitioning
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Auto-open Keka in a new tab for login
      try {
        await browser.tabs.create({ url: `https://${fullDomain}` });
      } catch (e) {
        console.error("Failed to open Keka tab", e);
      }

      onComplete();
    } catch (error) {
      console.error("Failed to save domain", error);
      setSetupError("Could not save your workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && subdomain && isDomainValid) {
      handleSave();
    }
  };

  return (
    <div className="setup-view">
      <img src="/icon/128.png" alt="Kivo Logo" className="setup-logo" />
      <h1 className="setup-title">Welcome to Kivo</h1>
      <p className="setup-subtitle">
        Your personal Keka productivity companion. Let's get you set up.
      </p>

      <div className="setup-card">
        <div className="setup-input-group">
          <label className="setup-label" htmlFor="workspace-url">
            Workspace URL
          </label>
          <div className="setup-input-wrapper">
            <input
              id="workspace-url"
              type="text"
              className="setup-input"
              value={subdomain}
              onChange={(e) => {
                const nextValue = normalizeWorkspaceInput(e.target.value);
                setSubdomain(nextValue);
                setSetupError(
                  nextValue && !isValidWorkspaceSubdomain(nextValue)
                    ? "Use only letters, numbers, and hyphens."
                    : "",
                );
              }}
              onKeyDown={handleKeyDown}
              placeholder="company"
              aria-invalid={!!setupError}
              aria-describedby={setupError ? "workspace-error" : undefined}
              autoFocus
            />
            <span className="setup-input-suffix">.keka.com</span>
          </div>
          {setupError && (
            <div className="setup-error" id="workspace-error">
              {setupError}
            </div>
          )}
        </div>

        <div className="setup-checkbox-wrapper">
          <input
            type="checkbox"
            id="notifications"
            className="setup-checkbox"
            checked={enableNotifications}
            onChange={(e) => setEnableNotifications(e.target.checked)}
          />
          <label htmlFor="notifications">
            <div className="setup-checkbox-label">Enable Notifications</div>
            <div className="setup-checkbox-description">
              Get alerts for targets, breaks, and overtime
            </div>
          </label>
        </div>

        <button
          className="setup-button"
          onClick={handleSave}
          disabled={!subdomain || !isDomainValid || loading}
        >
          {loading ? "Setting up..." : "Get Started →"}
        </button>
      </div>

      <div className="setup-footer">
        You can change this anytime in Settings
      </div>
    </div>
  );
}
