import { useEffect, useState } from "react";
import "./App.css";
import TodayOverview from "./components/TodayOverview";
import MonthlyOverview from "./components/MonthlyOverview";
import Settings from "./components/Settings";
import Setup from "./components/Setup";
import { browser } from "wxt/browser";

import { useAuth } from "./hooks/useAuth";
import { useCurrentMetrics } from "./hooks/useCurrentMetrics";
import { useHalfDay } from "./hooks/useHalfDay";
import { useWorkHoursConfig } from "./hooks/useWorkHoursConfig";

import { useWeeklyStats } from "./hooks/useWeeklyStats";
import { useMonthlyStats } from "./hooks/useMonthlyStats";
import WeeklyOverview from "./components/WeeklyOverview";
import { Settings as SettingsIcon, X } from "lucide-react";
import { AppLoadingSkeleton } from "./components/Skeleton";

const SHOW_MONTHLY_AVG_TARGET_STORAGE_KEY = "show_monthly_avg_target";
const SHOW_LEAVE_NOW_PROJECTION_STORAGE_KEY = "show_leave_now_projection";

function App() {
  const { accessToken, loading: authLoading, error: authError } = useAuth();

  // View State: 'main' or 'settings' or 'setup'
  const [activeView, setActiveView] = useState<
    "main" | "settings" | "setup" | "loading"
  >("loading");
  const [showMonthlyAvgTarget, setShowMonthlyAvgTarget] = useState(false);
  const [showLeaveNowProjection, setShowLeaveNowProjection] = useState(false);

  useEffect(() => {
    const checkSetup = async () => {
      const {
        keka_domain,
        keka_font_preference,
        show_monthly_avg_target,
        show_leave_now_projection,
      } =
        await browser.storage.local.get([
          "keka_domain",
          "keka_font_preference",
          SHOW_MONTHLY_AVG_TARGET_STORAGE_KEY,
          SHOW_LEAVE_NOW_PROJECTION_STORAGE_KEY,
        ]);

      if (keka_font_preference === "mono") {
        document.body.classList.add("font-mono");
      } else {
        document.body.classList.remove("font-mono");
      }
      if (typeof show_monthly_avg_target === "boolean") {
        setShowMonthlyAvgTarget(show_monthly_avg_target);
      }
      if (typeof show_leave_now_projection === "boolean") {
        setShowLeaveNowProjection(show_leave_now_projection);
      }

      if (keka_domain) {
        setActiveView("main");
      } else {
        setActiveView("setup");
      }
    };
    checkSetup();

    const handleStorageChange = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (
        areaName === "local" &&
        changes[SHOW_MONTHLY_AVG_TARGET_STORAGE_KEY] &&
        typeof changes[SHOW_MONTHLY_AVG_TARGET_STORAGE_KEY].newValue ===
          "boolean"
      ) {
        setShowMonthlyAvgTarget(
          changes[SHOW_MONTHLY_AVG_TARGET_STORAGE_KEY].newValue as boolean,
        );
      }
      if (
        areaName === "local" &&
        changes[SHOW_LEAVE_NOW_PROJECTION_STORAGE_KEY] &&
        typeof changes[SHOW_LEAVE_NOW_PROJECTION_STORAGE_KEY].newValue ===
          "boolean"
      ) {
        setShowLeaveNowProjection(
          changes[SHOW_LEAVE_NOW_PROJECTION_STORAGE_KEY].newValue as boolean,
        );
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleShowMonthlyAvgTargetChange = async (value: boolean) => {
    const previousValue = showMonthlyAvgTarget;
    setShowMonthlyAvgTarget(value);
    try {
      await browser.storage.local.set({
        [SHOW_MONTHLY_AVG_TARGET_STORAGE_KEY]: value,
      });
    } catch (error) {
      console.error("Error saving monthly target visibility:", error);
      setShowMonthlyAvgTarget(previousValue);
    }
  };

  const handleShowLeaveNowProjectionChange = async (value: boolean) => {
    const previousValue = showLeaveNowProjection;
    setShowLeaveNowProjection(value);
    try {
      await browser.storage.local.set({
        [SHOW_LEAVE_NOW_PROJECTION_STORAGE_KEY]: value,
      });
    } catch (error) {
      console.error("Error saving leave-now projection visibility:", error);
      setShowLeaveNowProjection(previousValue);
    }
  };

  const returnToToday = () => {
    setActiveTab("today");
    setActiveView("main");
  };

  const { isHalfDay, setIsHalfDay } = useHalfDay();
  const { workHoursConfig, loading: workHoursLoading } = useWorkHoursConfig();

  const {
    metrics,
    isClockedIn,
    leaveTimeInfo,
    timePairs,
    breaks,
    unpairedInEntry,
    loading: metricsLoading,
    error: metricsError,
    totalWorkedSeconds,
  } = useCurrentMetrics(isHalfDay, workHoursConfig);

  const [activeTab, setActiveTab] = useState<"today" | "weekly" | "monthly">(
    "today"
  );

  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [currentDate] = useState(new Date());
  const weeklyStats = useWeeklyStats(
    accessToken,
    isHalfDay,
    currentDate,
    workHoursConfig,
  );
  const monthlyStats = useMonthlyStats(accessToken, currentDate, workHoursConfig);

  // Combine loading/error states appropriately
  const appLoading =
    authLoading || workHoursLoading || (activeTab === "today" && metricsLoading);
  // If we have an auth error, we shouldn't even try to show metrics error yet
  const appError = activeTab === "today" ? metricsError : null;


  if (activeView === "loading") {
    return (
      <div className="popup-container">
        <AppLoadingSkeleton />
      </div>
    );
  }

  if (activeView === "setup") {
    return <Setup onComplete={() => setActiveView("main")} />;
  }

  return (
    <div className="popup-container">
      {/* Header Area */}
      <header className="header">
        <div className="header-title">
          <img src="/icon/32.png" alt="logo" className="header-logo" />
          <span>{activeView === "settings" ? "Settings" : "Kivo"}</span>
          {activeView === "main" && !metricsLoading && (
            <div
              className={`status-badge ${!isClockedIn ? "punched-out" : ""}`}
            >
              <span className="status-dot" />
              {isClockedIn ? "Punched In" : "Punched Out"}
            </div>
          )}
        </div>
        <button
          className="icon-button"
          onClick={() =>
            setActiveView(activeView === "main" ? "settings" : "main")
          }
          title={activeView === "settings" ? "Back to Dashboard" : "Settings"}
          aria-label={activeView === "settings" ? "Back to dashboard" : "Open settings"}
        >
          {activeView === "settings" ? <X /> : <SettingsIcon />}
        </button>
      </header>

      {/* Main Dashboard View */}
      {activeView === "main" && (
        <>
          {/* Auth Check Block */}
          {!accessToken && !authLoading ? (
            <div className="auth-error-container">
              <div className="auth-error-icon">🔒</div>
              <div className="auth-error-message">Authentication Required</div>
              <div className="auth-error-subtext">
                {authError || "Please log in to Keka in a new tab to continue."}
              </div>
              <div className="auth-actions">
                <button
                  className="open-keka-button"
                  onClick={async () => {
                    const { keka_domain } = await browser.storage.local.get(
                      "keka_domain"
                    );
                    const kekaDomain = keka_domain as string;
                    const url = kekaDomain.startsWith("http")
                      ? kekaDomain
                      : `https://${kekaDomain}`;
                    browser.tabs.create({ url });
                  }}
                >
                  Open Keka
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setActiveView("settings")}
                >
                  Change Domain
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="tabs-container" role="tablist" aria-label="Dashboard views">
                <button
                  className={`tab-button ${
                    activeTab === "today" ? "active" : ""
                  }`}
                  role="tab"
                  aria-selected={activeTab === "today"}
                  onClick={() => {
                    setActiveTab("today");
                  }}
                >
                  Today
                </button>
                <button
                  className={`tab-button ${
                    activeTab === "weekly" ? "active" : ""
                  }`}
                  role="tab"
                  aria-selected={activeTab === "weekly"}
                  onClick={() => {
                    setActiveTab("weekly");
                  }}
                >
                  Weekly
                </button>
                <button
                  className={`tab-button ${
                    activeTab === "monthly" ? "active" : ""
                  }`}
                  role="tab"
                  aria-selected={activeTab === "monthly"}
                  onClick={() => {
                    setActiveTab("monthly");
                  }}
                >
                  Monthly
                </button>
              </div>

              {activeTab === "today" && (
                <TodayOverview
                  accessToken={accessToken}
                  loading={appLoading}
                  error={appError}
                  metrics={metrics}
                  isHalfDay={isHalfDay}
                  leaveTimeInfo={leaveTimeInfo}
                  timePairs={timePairs}
                  breaks={breaks}
                  unpairedInEntry={unpairedInEntry}
                  totalWorkedSeconds={totalWorkedSeconds}
                  weeklyHoursNeededPerDay={weeklyStats.hoursNeededPerDay}
                  monthlyHoursNeededPerDay={monthlyStats.hoursNeededPerDay}
                  weeklyStats={weeklyStats}
                  monthlyStats={monthlyStats}
                  showLeaveNowProjection={showLeaveNowProjection}
                  showMonthlyAvgTarget={showMonthlyAvgTarget}
                  workHoursConfig={workHoursConfig}
                />
              )}

              {activeTab === "weekly" && (
                <WeeklyOverview
                  accessToken={accessToken}
                  isHalfDay={isHalfDay}
                  workHoursConfig={workHoursConfig}
                />
              )}

              {activeTab === "monthly" && (
                <MonthlyOverview
                  accessToken={accessToken}
                  selectedMonth={selectedMonth}
                  onMonthChange={setSelectedMonth}
                  workHoursConfig={workHoursConfig}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Settings View */}
      {activeView === "settings" && (
        <Settings
          isHalfDay={isHalfDay}
          setIsHalfDay={setIsHalfDay}
          showMonthlyAvgTarget={showMonthlyAvgTarget}
          setShowMonthlyAvgTarget={handleShowMonthlyAvgTargetChange}
          showLeaveNowProjection={showLeaveNowProjection}
          setShowLeaveNowProjection={handleShowLeaveNowProjectionChange}
          onReturnToToday={returnToToday}
        />
      )}
    </div>
  );
}

export default App;
