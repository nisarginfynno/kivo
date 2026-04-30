import type { LeaveNowProjection, PeriodProjection } from "../../../utils/types";

interface LeaveNowProjectionCardProps {
  projection: LeaveNowProjection;
}

const formatHours = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  const safeValue = Math.max(0, value);
  let hours = Math.floor(safeValue);
  let minutes = Math.round((safeValue - hours) * 60);

  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }

  return `${hours}h ${minutes}m`;
};

const formatNeed = (period: PeriodProjection | null): string => {
  if (!period) {
    return "-";
  }

  if (period.neededPerFutureDay === null) {
    return period.remainingHours > 0 ? "No days left" : "Completed";
  }

  if (period.neededPerFutureDay === 0) {
    return "Completed";
  }

  return formatHours(period.neededPerFutureDay);
};

const getSourceLabel = (
  source: LeaveNowProjection["recommendationSource"],
): string => {
  if (source === "weekly") return "Weekly target";
  if (source === "monthly") return "Monthly target";
  if (source === "daily") return "Normal day";
  return "No recovery target";
};

export default function LeaveNowProjectionCard({
  projection,
}: LeaveNowProjectionCardProps) {
  const showMonthlyProjection = projection.monthly !== null;

  return (
    <div className={`leave-now-card leave-now-card-${projection.status}`}>
      <div className="leave-now-header">
        <div>
          <div className="leave-now-title">If I Leave Now</div>
          <div className="leave-now-subtitle">
            Recovery starts from the next working day
          </div>
        </div>
        <div className={`leave-now-status leave-now-status-${projection.status}`}>
          {projection.statusLabel}
        </div>
      </div>

      <div className="leave-now-grid">
        <div className="leave-now-metric">
          <div className="leave-now-label">Today Short</div>
          <div className="leave-now-value">
            {formatHours(projection.todayShortfallHours)}
          </div>
        </div>
        <div className="leave-now-metric">
          <div className="leave-now-label">Weekly Avg</div>
          <div className="leave-now-value">
            {formatHours(projection.weekly?.averageIfLeaveNow ?? null)}
          </div>
        </div>
        {showMonthlyProjection && (
          <div className="leave-now-metric">
            <div className="leave-now-label">Monthly Avg</div>
            <div className="leave-now-value">
              {formatHours(projection.monthly?.averageIfLeaveNow ?? null)}
            </div>
          </div>
        )}
        <div className="leave-now-metric">
          <div className="leave-now-label">Weekly Need/Day</div>
          <div className="leave-now-value">{formatNeed(projection.weekly)}</div>
        </div>
        {showMonthlyProjection && (
          <div className="leave-now-metric">
            <div className="leave-now-label">Monthly Need/Day</div>
            <div className="leave-now-value">{formatNeed(projection.monthly)}</div>
          </div>
        )}
        <div className="leave-now-metric leave-now-metric-primary">
          <div className="leave-now-label">Next Workday</div>
          <div className="leave-now-value">
            {formatHours(projection.recommendedTomorrowTarget)}
          </div>
        </div>
      </div>

      <div className="leave-now-footnote">
        Based on {getSourceLabel(projection.recommendationSource)}
      </div>
    </div>
  );
}
