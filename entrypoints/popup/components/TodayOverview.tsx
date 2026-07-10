import { Fragment, useEffect, useState } from "react";
import {
  format,
  differenceInSeconds,
  subDays,
  addDays,
  isSameDay,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { browser } from "wxt/browser";
import type {
  Metrics,
  LeaveTimeInfo,
  TimePair,
  Break,
  TimeEntry,
  WeeklyStats,
} from "../../../utils/types";
import { useDailyStats } from "../hooks/useDailyStats";
import LeaveNowProjectionCard from "./LeaveNowProjectionCard";
import { TodaySkeleton } from "./Skeleton";
import { calculateLeaveNowProjection } from "../../../utils/calculations";
import {
  formatMinutesAsHoursAndMinutes,
  getDailyTargetMinutes,
  type WorkHoursConfig,
} from "../../../utils/workHoursConfig";
import { formatDuration } from "../../../utils/calculations";

const TIME_ENTRIES_EXPANDED_STORAGE_KEY = "time_entries_expanded";

interface TodayOverviewProps {
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  metrics: Metrics | null;
  isHalfDay: boolean;
  leaveTimeInfo: LeaveTimeInfo | null;
  timePairs: TimePair[];
  breaks: Break[];
  unpairedInEntry: TimeEntry | null;
  totalWorkedSeconds: number;
  weeklyHoursNeededPerDay: number | null;
  monthlyHoursNeededPerDay: number | null;
  weeklyStats: WeeklyStats | null;
  monthlyStats: {
    totalWorkingDays: number | null;
    futureWorkingDays: number | null;
    monthlyTarget: number;
    totalWorked: number;
  } | null;
  showLeaveNowProjection: boolean;
  showMonthlyAvgTarget: boolean;
  workHoursConfig: WorkHoursConfig;
}

export default function TodayOverview({
  accessToken,
  loading: liveLoading,
  error: liveError,
  metrics: liveMetrics,
  isHalfDay,
  leaveTimeInfo: liveLeaveTimeInfo,
  timePairs: liveTimePairs,
  breaks: liveBreaks,
  unpairedInEntry: liveUnpairedInEntry,
  totalWorkedSeconds: liveTotalWorkedSeconds,
  weeklyHoursNeededPerDay,
  monthlyHoursNeededPerDay,
  weeklyStats,
  monthlyStats,
  showLeaveNowProjection,
  showMonthlyAvgTarget,
  workHoursConfig,
}: TodayOverviewProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showTimeEntries, setShowTimeEntries] = useState(false);

  useEffect(() => {
    const loadTimeEntriesPreference = async () => {
      const stored = await browser.storage.local.get(
        TIME_ENTRIES_EXPANDED_STORAGE_KEY,
      );
      const storedValue = stored[TIME_ENTRIES_EXPANDED_STORAGE_KEY];

      setShowTimeEntries(
        typeof storedValue === "boolean" ? storedValue : false,
      );
    };

    void loadTimeEntriesPreference();
  }, []);

  const handleToggleTimeEntries = async () => {
    const nextValue = !showTimeEntries;
    setShowTimeEntries(nextValue);

    try {
      await browser.storage.local.set({
        [TIME_ENTRIES_EXPANDED_STORAGE_KEY]: nextValue,
      });
    } catch (error) {
      console.error("Error saving time entries visibility:", error);
      setShowTimeEntries(!nextValue);
    }
  };

  const isToday = isSameDay(selectedDate, new Date());

  const formatTargetHours = (hoursNeeded: number) => {
    let hours = Math.floor(hoursNeeded);
    let minutes = Math.round((hoursNeeded - hours) * 60);

    if (minutes === 60) {
      hours += 1;
      minutes = 0;
    }

    return `${hours}h ${minutes}m`;
  };

  const getTargetLeaveTime = (hoursNeeded: number) => {
    const now = new Date();
    const targetSeconds = Math.floor(hoursNeeded * 3600);

    if (totalWorkedSeconds >= targetSeconds) {
      return "-";
    }

    const remainingSeconds = Math.max(0, targetSeconds - totalWorkedSeconds);
    const leaveTime = new Date(now.getTime() + remainingSeconds * 1000);
    const hours = leaveTime.getHours();
    const minutes = leaveTime.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    const hours12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;

    return `${hours12}:${minutes} ${ampm}`;
  };

  const renderAverageTargetCard = (label: string, hoursNeeded: number) => (
    <div
      className="leave-card"
      style={{ borderColor: "#818cf8", backgroundColor: "#e0e7ff" }}
    >
      <div className="leave-label" style={{ color: "#3730a3" }}>
        {label}
      </div>
      <div className="leave-sub-label" style={{ color: "#4338ca" }}>
        ({formatTargetHours(hoursNeeded)})
      </div>
      <div className="leave-time">{getTargetLeaveTime(hoursNeeded)}</div>
    </div>
  );

  const handlePrevDay = () => {
    setSelectedDate(subDays(selectedDate, 1));
  };

  const handleNextDay = () => {
    if (!isToday) {
      setSelectedDate(addDays(selectedDate, 1));
    }
  };

  const pastStats = useDailyStats(
    accessToken,
    isHalfDay,
    selectedDate,
    workHoursConfig,
    !isToday,
  );

  // Determine which data to use based on the selected date
  const loading = isToday ? liveLoading : pastStats.loading;
  const error = isToday ? liveError : pastStats.error;
  const metrics = isToday ? liveMetrics : pastStats.metrics;
  const leaveTimeInfo = isToday ? liveLeaveTimeInfo : pastStats.leaveTimeInfo;
  const timePairs = isToday ? liveTimePairs : pastStats.timePairs;
  const breaks = isToday ? liveBreaks : pastStats.breaks;
  const unpairedInEntry = isToday
    ? liveUnpairedInEntry
    : pastStats.unpairedInEntry;
  const totalWorkedSeconds = isToday
    ? liveTotalWorkedSeconds
    : pastStats.totalWorkedSeconds;
  const dailyTargetLabel = formatMinutesAsHoursAndMinutes(
    getDailyTargetMinutes(isHalfDay, workHoursConfig),
  );
  const leaveNowProjection =
    isToday && metrics
      ? calculateLeaveNowProjection({
          totalWorkedSeconds,
          isHalfDay,
          weeklyStats,
          monthlyStats:
            showMonthlyAvgTarget && monthlyStats
              ? {
                  monthlyTarget: monthlyStats.monthlyTarget,
                  totalWorked: monthlyStats.totalWorked,
                  totalWorkingDays: monthlyStats.totalWorkingDays,
                  futureWorkingDays: monthlyStats.futureWorkingDays,
                }
              : null,
          workHoursConfig,
        })
      : null;

  const headerContent = (
    <div className="monthly-header" style={{ marginBottom: "16px" }}>
      <div
        className="week-selector-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fff",
          borderRadius: "6px",
          border: "1px solid #e5e7eb",
          padding: "4px",
        }}
      >
        <button
          className="icon-button"
          onClick={handlePrevDay}
          aria-label="Show previous day"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: "4px 8px",
            color: "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft />
        </button>
        <span style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>
          {isToday ? "Today" : format(selectedDate, "EEE, dd MMM yyyy")}
        </span>
        <button
          className="icon-button"
          onClick={handleNextDay}
          disabled={isToday}
          aria-label="Show next day"
          style={{
            border: "none",
            background: "transparent",
            cursor: isToday ? "not-allowed" : "pointer",
            padding: "4px 8px",
            color: isToday ? "#d1d5db" : "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="monthly-overview">
        {headerContent}
        <TodaySkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="monthly-overview">
        {headerContent}
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="monthly-overview">
        {headerContent}
        <p className="no-data">No attendance data found</p>
      </div>
    );
  }

  return (
    <div className="monthly-overview">
      {headerContent}
      <div className="metrics-row">
        <div
          className={`metric-card total-worked-${metrics.totalWorkedStatus}`}
        >
          <div className="metric-label">Total Worked</div>
          <div className="metric-value">{metrics.totalWorked}</div>
          {metrics.isOvertime && (
            <div className="overtime-indicator">
              Overtime: {formatDuration(metrics.overtimeSeconds)}
            </div>
          )}
        </div>
        {isToday && (
          <div
            className={`metric-card ${
              metrics.isCompleted
                ? "completed"
                : metrics.isCloseToCompletion
                  ? "warning"
                  : ""
            }`}
          >
            <div className="metric-label">Remaining</div>
            <div className="metric-value">{metrics.remaining}</div>
          </div>
        )}
        <div className="metric-card">
          <div className="metric-label">Total Break</div>
          <div className="metric-value">
            {(() => {
              const totalBreakSeconds = breaks.reduce(
                (acc, b) => acc + (b.durationSeconds || 0),
                0,
              );
              return formatDuration(totalBreakSeconds);
            })()}
          </div>
        </div>
      </div>
      {isToday && leaveTimeInfo && (
        <div className="leave-info">
          <div className="leave-cards-row">
            <div className="leave-card normal-leave">
              <div className="leave-label">Normal Leave Time</div>
              <div className="leave-sub-label">({dailyTargetLabel})</div>
              <div className="leave-time">{leaveTimeInfo.normalLeaveTime}</div>
            </div>
            {weeklyHoursNeededPerDay !== null &&
              weeklyHoursNeededPerDay > 0 &&
              renderAverageTargetCard(
                "Weekly Avg Target",
                weeklyHoursNeededPerDay,
              )}
            {showMonthlyAvgTarget &&
              monthlyHoursNeededPerDay !== null &&
              monthlyHoursNeededPerDay > 0 &&
              renderAverageTargetCard(
                "Monthly Avg Target",
                monthlyHoursNeededPerDay,
              )}
          </div>
        </div>
      )}

      {isToday && showLeaveNowProjection && leaveNowProjection && (
        <LeaveNowProjectionCard projection={leaveNowProjection} />
      )}

      {(timePairs.length > 0 || unpairedInEntry) && (
        <div className="attendance-list">
          <button
            className="details-toggle"
            type="button"
            aria-expanded={showTimeEntries}
            onClick={() => void handleToggleTimeEntries()}
          >
            <span>Time Entries</span>
            <span className="details-toggle-meta">
              {showTimeEntries
                ? "Hide"
                : `${timePairs.length + (unpairedInEntry ? 1 : 0)} entries`}
            </span>
          </button>
          {showTimeEntries && (
            <ul>
              {timePairs.map((pair, index) => (
                <Fragment key={`pair-${index}`}>
                  <li className="time-entry">
                    <span className="time-range">
                      {format(new Date(pair.startTime), "h:mm a")} -{" "}
                      {format(new Date(pair.endTime), "h:mm a")}
                    </span>
                    <span className="duration">({pair.duration})</span>
                  </li>
                  {breaks[index] && (
                    <li className="break-entry">
                      <span className="time-range">
                        {format(new Date(breaks[index].startTime), "h:mm a")} to{" "}
                        {format(new Date(breaks[index].endTime), "h:mm a")}
                      </span>
                      <span className="break-duration">
                        → {breaks[index].duration}
                      </span>
                    </li>
                  )}
                </Fragment>
              ))}
              {unpairedInEntry && (
                <li className="time-entry not-logged-out">
                  <span className="time-range">
                    {format(
                      new Date(unpairedInEntry.timestamp || unpairedInEntry.actualTimestamp),
                      "h:mm a",
                    )}{" "}
                    - not logged out
                  </span>
                  {isToday && (
                    <span className="duration">
                      (
                      {(() => {
                        const startDate = new Date(
                          unpairedInEntry.timestamp || unpairedInEntry.actualTimestamp,
                        );
                        const now = new Date();
                        const totalSeconds = differenceInSeconds(
                          now,
                          startDate,
                        );
                        return formatDuration(totalSeconds);
                      })()}
                      )
                    </span>
                  )}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
