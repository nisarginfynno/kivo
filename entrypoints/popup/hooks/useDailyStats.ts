import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fetchAttendanceSummary } from "../../../utils/api";
import {
  calculateLeaveTimeInfo,
  calculateTimePairsAndBreaks,
  generateMetricsFromSeconds,
  getAttendanceLeaveDuration,
  getTodayLeaveDescription,
} from "../../../utils/calculations";
import type { Metrics, LeaveTimeInfo, TimePair, Break, TimeEntry } from "../../../utils/types";
import type { WorkHoursConfig } from "../../../utils/workHoursConfig";

interface UseDailyStatsResult {
  metrics: Metrics | null;
  totalWorkedSeconds: number;
  isClockedIn: boolean;
  leaveTimeInfo: LeaveTimeInfo | null;
  leaveFraction: number;
  leaveDescription: string | null;
  timePairs: TimePair[];
  breaks: Break[];
  unpairedInEntry: TimeEntry | null;
  loading: boolean;
  error: string | null;
}

export const useDailyStats = (
  accessToken: string | null,
  isHalfDay: boolean,
  selectedDate: Date,
  workHoursConfig: WorkHoursConfig,
  enabled: boolean
): UseDailyStatsResult => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [totalWorkedSeconds, setTotalWorkedSeconds] = useState(0);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [leaveTimeInfo, setLeaveTimeInfo] = useState<LeaveTimeInfo | null>(null);
  const [timePairs, setTimePairs] = useState<TimePair[]>([]);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [unpairedInEntry, setUnpairedInEntry] = useState<TimeEntry | null>(null);
  const [leaveFraction, setLeaveFraction] = useState(0);
  const [leaveDescription, setLeaveDescription] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (!enabled || !accessToken) return;

      setLoading(true);
      setError(null);

      try {
        const dateStr = format(selectedDate, "yyyy-MM-dd");
        const attendanceData = await fetchAttendanceSummary(accessToken, dateStr);

        // Keka might return an array of recent days. We need to find the exact match for dateStr
        const exactDayData = attendanceData?.filter(
          (entry) => entry.attendanceDate && entry.attendanceDate.startsWith(dateStr)
        );

        if (!exactDayData || exactDayData.length === 0) {
            setMetrics(null);
            setTotalWorkedSeconds(0);
            setIsClockedIn(false);
            setLeaveTimeInfo(null);
            setLeaveFraction(0);
            setLeaveDescription(null);
            setTimePairs([]);
            setBreaks([]);
            setUnpairedInEntry(null);
            setLoading(false);
            return;
        }

        // Calculate pairs and breaks directly from the data
        const calculatedPairs = calculateTimePairsAndBreaks(exactDayData);
        setTimePairs(calculatedPairs.timePairs);
        setBreaks(calculatedPairs.breaks);
        setUnpairedInEntry(calculatedPairs.unpairedInEntry);

        // For past days, calculate worked time without extrapolation.
        let totalWorkedSecs = calculatedPairs.timePairs.reduce(
          (sum, pair) => sum + (pair.durationSeconds || 0),
          0
        );

        // Prefer Keka's own totalEffectiveHours when available.
        const attendanceEntry = exactDayData[0]; // Assuming length 1 for a single day fetch or the relevant one

        if (
          typeof attendanceEntry.totalEffectiveHours === "number" &&
          Number.isFinite(attendanceEntry.totalEffectiveHours) &&
          attendanceEntry.totalEffectiveHours >= 0
        ) {
          totalWorkedSecs = Math.floor(attendanceEntry.totalEffectiveHours * 3600);
        }

        const computedLeaveFraction = getAttendanceLeaveDuration(attendanceEntry);
        const computedLeaveDescription = getTodayLeaveDescription(attendanceEntry);

        const finalMetrics = generateMetricsFromSeconds(
          totalWorkedSecs,
          isHalfDay,
          false,
          workHoursConfig,
          computedLeaveFraction,
        );
        const finalLeaveInfo = calculateLeaveTimeInfo(
          totalWorkedSecs,
          isHalfDay,
          workHoursConfig,
          computedLeaveFraction,
        );

        setMetrics(finalMetrics);
        setTotalWorkedSeconds(totalWorkedSecs);
        setIsClockedIn(!!calculatedPairs.unpairedInEntry);
        setLeaveTimeInfo(finalLeaveInfo);
        setLeaveFraction(computedLeaveFraction);
        setLeaveDescription(computedLeaveDescription);

      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [accessToken, isHalfDay, selectedDate, workHoursConfig, enabled]);

  return {
    metrics,
    totalWorkedSeconds,
    isClockedIn,
    leaveTimeInfo,
    leaveFraction,
    leaveDescription,
    timePairs,
    breaks,
    unpairedInEntry,
    loading,
    error,
  };
};
