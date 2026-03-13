import { Fragment, useState } from "react";
import { format, differenceInSeconds, subDays, addDays, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  Metrics,
  LeaveTimeInfo,
  TimePair,
  Break,
  TimeEntry,
} from "../../../utils/types";
import { useDailyStats } from "../hooks/useDailyStats";

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
  hoursNeededPerDay: number | null;
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
  hoursNeededPerDay,
}: TodayOverviewProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const isToday = isSameDay(selectedDate, new Date());
  
  const handlePrevDay = () => {
    setSelectedDate(subDays(selectedDate, 1));
  };

  const handleNextDay = () => {
    if (!isToday) {
      setSelectedDate(addDays(selectedDate, 1));
    }
  };

  const pastStats = useDailyStats(accessToken, isHalfDay, selectedDate, !isToday);

  // Determine which data to use based on the selected date
  const loading = isToday ? liveLoading : pastStats.loading;
  const error = isToday ? liveError : pastStats.error;
  const metrics = isToday ? liveMetrics : pastStats.metrics;
  const leaveTimeInfo = isToday ? liveLeaveTimeInfo : pastStats.leaveTimeInfo;
  const timePairs = isToday ? liveTimePairs : pastStats.timePairs;
  const breaks = isToday ? liveBreaks : pastStats.breaks;
  const unpairedInEntry = isToday ? liveUnpairedInEntry : pastStats.unpairedInEntry;
  const totalWorkedSeconds = isToday ? liveTotalWorkedSeconds : pastStats.totalWorkedSeconds;

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
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: "4px 8px",
            color: "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
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
          style={{
            border: "none",
            background: "transparent",
            cursor: isToday ? "not-allowed" : "pointer",
            padding: "4px 8px",
            color: isToday ? "#d1d5db" : "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
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
        <p className="loading">Loading attendance data...</p>
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
              Overtime: {Math.floor(metrics.overtimeSeconds / 3600)}h{" "}
              {Math.floor((metrics.overtimeSeconds % 3600) / 60)}m{" "}
              {metrics.overtimeSeconds % 60}s
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
                0
              );
              const h = Math.floor(totalBreakSeconds / 3600);
              const m = Math.floor((totalBreakSeconds % 3600) / 60);
              const s = totalBreakSeconds % 60;
              return `${h}h ${m}m ${s}s`;
            })()}
          </div>
        </div>
      </div>
      {isToday && leaveTimeInfo && (
        <div className="leave-info">
          <div className="leave-cards-row">
            <div className="leave-card normal-leave">
              <div className="leave-label">Normal Leave Time</div>
              <div className="leave-sub-label">
                ({isHalfDay ? "4h 30m" : "8h 15m"})
              </div>
              <div className="leave-time">{leaveTimeInfo.normalLeaveTime}</div>
            </div>
            {hoursNeededPerDay && (
              <div
                className="leave-card"
                style={{ borderColor: "#818cf8", backgroundColor: "#e0e7ff" }}
              >
                <div className="leave-label" style={{ color: "#3730a3" }}>
                  Weekly Avg Target
                </div>
                <div className="leave-sub-label" style={{ color: "#4338ca" }}>
                  (
                  {(() => {
                    const h = Math.floor(hoursNeededPerDay);
                    const m = Math.round((hoursNeededPerDay - h) * 60);
                    return `${h}h ${m}m`;
                  })()}
                  )
                </div>
                <div className="leave-time">
                  {(() => {
                    const now = new Date();
                    // Using minutes for target calculation as hoursNeededPerDay is in hours (float)
                    // We can convert target to seconds for better precision if needed, but the input is likely derived from hours.
                    // However, we are comparing against totalWorkedSeconds.
                    // Let's stick to minutes for this specific calculation if hoursNeededPerDay is rough, OR convert to seconds.
                    // hoursNeededPerDay is calculated in calculations.ts.
                    const targetSeconds = Math.floor(hoursNeededPerDay * 3600);

                    if (totalWorkedSeconds >= targetSeconds) {
                      return "-";
                    }

                    const remainingSeconds = Math.max(
                      0,
                      targetSeconds - totalWorkedSeconds
                    );
                    const leaveTime = new Date(
                      now.getTime() + remainingSeconds * 1000
                    );
                    const h = leaveTime.getHours();
                    const m = leaveTime
                      .getMinutes()
                      .toString()
                      .padStart(2, "0");
                    const ampm = h >= 12 ? "pm" : "am";
                    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                    return `${h12}:${m} ${ampm}`;
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(timePairs.length > 0 || unpairedInEntry) && (
        <div className="attendance-list">
          <h3 className="list-title">Time Entries</h3>
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
                  {format(new Date(unpairedInEntry.actualTimestamp), "h:mm a")}{" "}
                  - not logged out
                </span>
                {isToday && (
                  <span className="duration">
                    (
                    {(() => {
                      const startDate = new Date(unpairedInEntry.actualTimestamp);
                      const now = new Date();
                      const totalSeconds = differenceInSeconds(now, startDate);
                      const hours = Math.floor(totalSeconds / 3600);
                      const minutes = Math.floor((totalSeconds % 3600) / 60);
                      const seconds = totalSeconds % 60;
                      return `${hours}h ${minutes}m ${seconds}s`;
                    })()}
                    )
                  </span>
                )}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
