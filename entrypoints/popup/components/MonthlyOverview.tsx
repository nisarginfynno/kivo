import { useMonthlyStats } from "../hooks/useMonthlyStats";
import { format, subMonths, startOfMonth } from "date-fns";
import pluralize from "pluralize";
import type { WorkHoursConfig } from "../../../utils/workHoursConfig";
import { MonthlySkeleton } from "./Skeleton";

interface MonthlyOverviewProps {
  accessToken: string | null;
  selectedMonth: Date;
  onMonthChange: (date: Date) => void;
  workHoursConfig: WorkHoursConfig;
}

export default function MonthlyOverview({
  accessToken,
  selectedMonth,
  onMonthChange,
  workHoursConfig,
}: MonthlyOverviewProps) {
  const {
    loading,
    totalWorkingDays,
    currentWorkingDay,
    remainingWorkingDays,
    averageHours,
    hoursNeededPerDay,
    holidays,
    leaveDaysCount,
  } = useMonthlyStats(accessToken, selectedMonth, workHoursConfig);

  const holidaysCount = holidays.length;
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return startOfMonth(d);
  });

  if (loading) {
    return (
      <div className="monthly-overview">
        <div className="monthly-header">
          <div className="month-selector-container">
            <select
              className="month-select"
              value={startOfMonth(selectedMonth).toISOString()}
              disabled={true}
            >
              <option>{format(selectedMonth, "MMMM yyyy")}</option>
            </select>
          </div>
        </div>
        <MonthlySkeleton />
      </div>
    );
  }

  return (
    <div className="monthly-overview">
      <div className="monthly-header">
        <div className="month-selector-container">
          <select
            className="month-select"
            value={startOfMonth(selectedMonth).toISOString()}
            onChange={(e) => onMonthChange(new Date(e.target.value))}
          >
            {months.map((month) => (
              <option key={month.toISOString()} value={month.toISOString()}>
                {format(month, "MMMM yyyy")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {totalWorkingDays === null && !loading ? (
        <p className="no-data">Unable to load monthly data</p>
      ) : (
        <div className="monthly-content">
          <div className="monthly-cards-row">
            <div className="monthly-card monthly-card-yellow">
              <div className="monthly-label">Total Days</div>
              <div className="monthly-value">{totalWorkingDays}</div>
            </div>
            <div className="monthly-card monthly-card-yellow">
              <div className="monthly-label">Worked Days</div>
              <div className="monthly-value">
                {currentWorkingDay !== null ? currentWorkingDay : "—"}
              </div>
            </div>
            <div className="monthly-card monthly-card-yellow">
              <div className="monthly-label">Remaining Days</div>
              <div className="monthly-value">
                {remainingWorkingDays !== null ? remainingWorkingDays : "—"}
              </div>
            </div>
          </div>
          <div className="monthly-cards-row">
            <div className="monthly-card monthly-card-green">
              <div className="monthly-label">Average Hours</div>
              <div className="monthly-value">
                {averageHours !== null && averageHours > 0
                  ? (() => {
                      const hours = Math.floor(averageHours);
                      const minutes = Math.round((averageHours - hours) * 60);
                      return `${hours}h ${minutes}m`;
                    })()
                  : "—"}
              </div>
            </div>
            <div className="monthly-card">
              <div className="monthly-label">Hours Needed/Day</div>
              <div className="monthly-value">
                {hoursNeededPerDay !== null && hoursNeededPerDay > 0
                  ? (() => {
                      const hours = Math.floor(hoursNeededPerDay);
                      const minutes = Math.round(
                        (hoursNeededPerDay - hours) * 60,
                      );
                      return `${hours}h ${minutes}m`;
                    })()
                  : "—"}
              </div>
            </div>
          </div>
          {holidaysCount > 0 && (
            <div className="holidays-info">
              <div className="holidays-label">
                {pluralize("Holiday", holidaysCount, true)} this month
              </div>
            </div>
          )}
          {leaveDaysCount > 0 && (
            <div className="holidays-info">
              <div className="holidays-label">
                {pluralize("Leave", leaveDaysCount, true)} this month
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
