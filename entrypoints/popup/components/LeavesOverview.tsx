import { useState, useEffect } from "react";
import { useLeaveBalance } from "../hooks/useLeaveBalance";
import { useAttendanceScheme } from "../hooks/useAttendanceScheme";
import { RefreshCw, Home, FileClock, ShieldAlert } from "lucide-react";
import { browser } from "wxt/browser";

interface LeavesOverviewProps {
  accessToken: string | null;
}

export default function LeavesOverview({ accessToken }: LeavesOverviewProps) {
  const [activeSubTab, setActiveSubTab] = useState<"balances" | "limits">("balances");
  const { leaveSummaries, loading: leavesLoading, error: leavesError, refreshLeaves } = useLeaveBalance(accessToken);
  const { scheme, loading: schemeLoading, error: schemeError, refreshScheme } = useAttendanceScheme(accessToken);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);

  // Usage counts from monthly logs
  const [usages, setUsages] = useState({
    wfhCount: 0,
    regularisationCount: 0,
    adjustmentsCount: 0,
  });

  useEffect(() => {
    const loadMonthlyLogs = async () => {
      try {
        const stored = await browser.storage.local.get("attendance_data") as { attendance_data?: any[] };
        const logs = stored.attendance_data || [];
        setAttendanceData(logs);

        // Count usages
        let wfh = 0;
        let reg = 0;
        let adj = 0;

        if (Array.isArray(logs)) {
          logs.forEach((entry: any) => {
            const isWFH =
              entry.attendanceDayStatus === 6 ||
              entry.isWorkFromHome === true ||
              entry.isOnWorkFromHome === true ||
              entry.workFromHomeStatus === 1 ||
              (entry.leaveDetails &&
                entry.leaveDetails.some(
                  (d: any) =>
                    d.leaveTypeName?.toLowerCase().includes("work from home") ||
                    d.leaveTypeName?.toLowerCase().includes("wfh")
                ));

            if (isWFH) wfh += 1;

            const isRegularized =
              entry.isRegularized === true ||
              entry.regularizationStatus === 1 ||
              entry.regularizationStatus === 2 ||
              entry.attendanceDayStatus === 9;

            if (isRegularized) reg += 1;

            if (
              entry.timeEntries &&
              entry.timeEntries.length > 0 &&
              entry.timeEntries.length % 2 !== 0
            ) {
              adj += 1;
            }
          });
        }

        setUsages({
          wfhCount: wfh,
          regularisationCount: reg,
          adjustmentsCount: adj,
        });
      } catch (err) {
        console.error("Error loading monthly logs for limits", err);
      }
    };

    if (activeSubTab === "limits") {
      loadMonthlyLogs();
    }
  }, [activeSubTab]);

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleRefreshAll = () => {
    if (activeSubTab === "balances") {
      refreshLeaves();
    } else {
      refreshScheme();
    }
  };

  const loading = activeSubTab === "balances" ? leavesLoading : schemeLoading;
  const error = activeSubTab === "balances" ? leavesError : schemeError;

  // Extract Limits from scheme config (Fallback to defaults if not available)
  const wfhLimit = scheme?.workFromHome?.maxAllowedWorkFromHomeLimit ?? 2;
  const regLimit = scheme?.regularisation?.regularisationRequestLimit ?? 3;
  const adjLimit = scheme?.attendanceCapture?.maxAllowedMissingSwipeAdjustments ?? 6;

  if (loading) {
    return (
      <div className="leaves-overview">
        <div className="leaves-header">
          <div className="leaves-title-section">
            <span className="leaves-tab-title">Leave & Limits</span>
          </div>
          <button className="icon-button disabled" disabled>
            <RefreshCw className="spinner" size={14} />
          </button>
        </div>

        {/* Sub-tabs segment control */}
        <div className="subtabs-container">
          <button
            className={`subtab-button ${activeSubTab === "balances" ? "active" : ""}`}
            onClick={() => setActiveSubTab("balances")}
          >
            Leave Balances
          </button>
          <button
            className={`subtab-button ${activeSubTab === "limits" ? "active" : ""}`}
            onClick={() => setActiveSubTab("limits")}
          >
            Monthly Limits
          </button>
        </div>

        <div className="leaves-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="leave-balance-card skeleton">
              <div className="leave-card-header-sk" />
              <div className="leave-card-balance-sk" />
              <div className="leave-card-progress-sk" />
              <div className="leave-card-footer-sk" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="leaves-overview">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <div className="error-message">Failed to load data</div>
          <div className="error-subtext">{error}</div>
          <button className="secondary-button" onClick={handleRefreshAll}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="leaves-overview">
      <div className="leaves-header">
        <div className="leaves-title-section">
          <span className="leaves-tab-title">Leaves & Limits</span>
        </div>
        <button className="icon-button" onClick={handleRefreshAll} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Sub-tabs segment control */}
      <div className="subtabs-container">
        <button
          className={`subtab-button ${activeSubTab === "balances" ? "active" : ""}`}
          onClick={() => setActiveSubTab("balances")}
        >
          Leave Balances
        </button>
        <button
          className={`subtab-button ${activeSubTab === "limits" ? "active" : ""}`}
          onClick={() => setActiveSubTab("limits")}
        >
          Monthly Limits
        </button>
      </div>

      {activeSubTab === "balances" ? (
        leaveSummaries.length === 0 ? (
          <div className="no-data">No leave categories found.</div>
        ) : (
          <div className="leaves-grid">
            {leaveSummaries.map((item) => {
              const leaveType = item.leaveTypeConfig?.leaveType;
              if (!leaveType) return null;

              const isExpanded = expandedId === item.id;
              const annual = item.annualQuota?.duration || 0;
              const consumed = item.consumedBalance?.duration || 0;
              const available = item.availableBalance?.duration || 0;

              const quota = annual > 0 ? annual : available + consumed;
              const hasQuota = quota > 0;
              // The fill represents the balance still available, so a full leave
              // balance is immediately readable instead of appearing as an empty bar.
              const progressPercent = hasQuota
                ? Math.min(100, Math.round((available / quota) * 100))
                : 0;

              return (
                <div
                  key={item.id}
                  className={`leave-balance-card ${isExpanded ? "expanded" : ""}`}
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="leave-balance-card-main">
                    <div className="leave-balance-header">
                      <div className="leave-type-info">
                        <span className="leave-name" title={leaveType.name}>
                          {leaveType.name}
                        </span>
                        <span className="leave-code">{leaveType.code}</span>
                      </div>
                      {leaveType.isPaid && <span className="paid-badge">Paid</span>}
                    </div>

                    <div className="leave-balance-display">
                      <span className="balance-num">{available}</span>
                      <span className="balance-unit">
                        {available === 1 ? "day" : "days"} available
                      </span>
                    </div>

                    <div className="leave-progress-meta">
                      <span>{hasQuota ? "Balance remaining" : "No quota limit"}</span>
                      {hasQuota && <span>{progressPercent}%</span>}
                    </div>
                    <div
                      className={`leave-progress-container ${hasQuota ? "" : "unlimited"}`}
                      role="progressbar"
                      aria-label={`${leaveType.name} balance remaining`}
                      aria-valuemin={0}
                      aria-valuemax={hasQuota ? 100 : undefined}
                      aria-valuenow={hasQuota ? progressPercent : undefined}
                    >
                      <div
                        className="leave-progress-bar"
                        style={{ width: `${hasQuota ? progressPercent : 100}%` }}
                      />
                    </div>

                    <div className="leave-balance-footer">
                      <span>Used: {consumed}d</span>
                      <span>Total: {annual > 0 ? `${annual}d` : "Unlimited"}</span>
                    </div>
                  </div>

                  {isExpanded && leaveType.description && (
                    <div className="leave-balance-description">
                      <p>{leaveType.description}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="limits-grid">
          {/* Card 1: WFH */}
          <div className="limit-card limit-card-wfh">
            <div className="limit-card-header">
              <div className="limit-icon-container bg-wfh">
                <Home size={18} />
              </div>
              <div className="limit-title-info">
                <span className="limit-name">Work From Home</span>
                <span className="limit-description">Remote workspace usage</span>
              </div>
            </div>
            <div className="limit-balance-display">
              <div className="limit-balance-numbers">
                <span className="limit-used">{usages.wfhCount}</span>
                <span className="limit-separator">/</span>
                <span className="limit-allowed">{wfhLimit}</span>
              </div>
              <span className="limit-unit">days used this month</span>
            </div>
            <div className="limit-progress-container">
              <div
                className="limit-progress-bar bg-wfh-bar"
                style={{ width: `${Math.min(100, (usages.wfhCount / wfhLimit) * 100)}%` }}
              />
            </div>
            <div className="limit-card-footer">
              <span>Remaining: {Math.max(0, wfhLimit - usages.wfhCount)} days</span>
              <span>Policy: Monthly Reset</span>
            </div>
          </div>

          {/* Card 2: Regularisation */}
          <div className="limit-card limit-card-regularisation">
            <div className="limit-card-header">
              <div className="limit-icon-container bg-reg">
                <FileClock size={18} />
              </div>
              <div className="limit-title-info">
                <span className="limit-name">Regularisations</span>
                <span className="limit-description">Attendance correction requests</span>
              </div>
            </div>
            <div className="limit-balance-display">
              <div className="limit-balance-numbers">
                <span className="limit-used">{usages.regularisationCount}</span>
                <span className="limit-separator">/</span>
                <span className="limit-allowed">{regLimit}</span>
              </div>
              <span className="limit-unit">requests used this month</span>
            </div>
            <div className="limit-progress-container">
              <div
                className="limit-progress-bar bg-reg-bar"
                style={{ width: `${Math.min(100, (usages.regularisationCount / regLimit) * 100)}%` }}
              />
            </div>
            <div className="limit-card-footer">
              <span>Remaining: {Math.max(0, regLimit - usages.regularisationCount)} requests</span>
              <span>Policy: Monthly Reset</span>
            </div>
          </div>

          {/* Card 3: Missing Swipes */}
          <div className="limit-card limit-card-adjustments">
            <div className="limit-card-header">
              <div className="limit-icon-container bg-adj">
                <ShieldAlert size={18} />
              </div>
              <div className="limit-title-info">
                <span className="limit-name">Missing Swipe Adjustments</span>
                <span className="limit-description">Forgot ID card / missing logs</span>
              </div>
            </div>
            <div className="limit-balance-display">
              <div className="limit-balance-numbers">
                <span className="limit-used">{usages.adjustmentsCount}</span>
                <span className="limit-separator">/</span>
                <span className="limit-allowed">{adjLimit}</span>
              </div>
              <span className="limit-unit">adjustments used this month</span>
            </div>
            <div className="limit-progress-container">
              <div
                className="limit-progress-bar bg-adj-bar"
                style={{ width: `${Math.min(100, (usages.adjustmentsCount / adjLimit) * 100)}%` }}
              />
            </div>
            <div className="limit-card-footer">
              <span>Remaining: {Math.max(0, adjLimit - usages.adjustmentsCount)} adjustments</span>
              <span>Policy: Monthly Reset</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
