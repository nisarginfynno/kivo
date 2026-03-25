import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fetchAttendanceSummary } from "../../../utils/api";
import { calculateMetrics, calculateTimePairsAndBreaks } from "../../../utils/calculations";
import type { Metrics, LeaveTimeInfo, TimePair, Break, TimeEntry } from "../../../utils/types";

interface UseDailyStatsResult {
  metrics: Metrics | null;
  totalWorkedSeconds: number;
  isClockedIn: boolean;
  leaveTimeInfo: LeaveTimeInfo | null;
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
  enabled: boolean
): UseDailyStatsResult => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [totalWorkedSeconds, setTotalWorkedSeconds] = useState(0);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [leaveTimeInfo, setLeaveTimeInfo] = useState<LeaveTimeInfo | null>(null);
  const [timePairs, setTimePairs] = useState<TimePair[]>([]);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [unpairedInEntry, setUnpairedInEntry] = useState<TimeEntry | null>(null);
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

        // For past days, we calculate the total worked time based purely on the exact pairs, plus any unpaired entry without extrapolation
        let totalWorkedSecs = calculatedPairs.timePairs.reduce(
          (sum, pair) => sum + (pair.durationSeconds || 0),
          0
        );
        
        // OR better yet, let's use the calculateMetrics utility, but since it's a past day, it won't extrapolate if we bypass the extrapolator, or we just rely on calculateMetrics which extrapolates, but we should override the seconds with totalEffectiveHours if Keka provides it, OR we just let calculateMetrics do it's thing but we freeze it at that moment.
        // Actually, calculateMetrics calls calculateSecondsFromAttendance which extrapolates using new Date() for any unpairedInEntry.
        // For past days, an unpairedInEntry shouldn't tick up to `new Date()`. But typically past days don't have unpaired entries unless there's an error in punching.
        
        // Alternatively, use Keka's totalEffectiveHours if available
        const attendanceEntry = exactDayData[0]; // Assuming length 1 for a single day fetch or the relevant one
        
        if (attendanceEntry.totalEffectiveHours && typeof attendanceEntry.totalEffectiveHours === 'number' && attendanceEntry.totalEffectiveHours > 0) {
            totalWorkedSecs = Math.floor(attendanceEntry.totalEffectiveHours * 3600);
        } else {
            // Recalculate without extrapolating
            totalWorkedSecs = calculatedPairs.timePairs.reduce(
                (sum, pair) => sum + (pair.durationSeconds || 0),
                0
            );
        }

        const calculatedMetricsData = calculateMetrics(exactDayData, isHalfDay);

        // However, calculateMetrics might have wrong totalWorkedSeconds because of extrapolation, so we overwrite it with our calculated one.
        const correctMetrics = {
             ...calculatedMetricsData.metrics,
             // Regenerate some formatted strings based on the static totalWorkedSecs
        };
        
        // Re-generate metrics from static seconds
        const { generateMetricsFromSeconds, calculateLeaveTimeInfo } = await import("../../../utils/calculations");
        const finalMetrics = generateMetricsFromSeconds(totalWorkedSecs, isHalfDay, false);
        const finalLeaveInfo = calculateLeaveTimeInfo(totalWorkedSecs, isHalfDay);

        setMetrics(finalMetrics);
        setTotalWorkedSeconds(totalWorkedSecs);
        setIsClockedIn(!!calculatedPairs.unpairedInEntry);
        setLeaveTimeInfo(finalLeaveInfo);

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
  }, [accessToken, isHalfDay, selectedDate, enabled]);

  return {
    metrics,
    totalWorkedSeconds,
    isClockedIn,
    leaveTimeInfo,
    timePairs,
    breaks,
    unpairedInEntry,
    loading,
    error,
  };
};
