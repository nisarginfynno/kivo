import { useState, useEffect } from "react";
import { browser } from "wxt/browser";
import { fetchAttendanceCaptureScheme } from "../../../utils/api";
import { format } from "date-fns";

export interface AttendanceSchemeConfig {
  attendanceCapture?: {
    allowMissingSwipeAdjustment: boolean;
    maxAllowedAdjustmentsEnabled: boolean;
    maxAllowedMissingSwipeAdjustments: number;
    maxAllowedMissingSwipeAdjustmentDuration: number;
  };
  workFromHome?: {
    allowWorkFromHome: boolean;
    maxAllowedWorkFromHomeEnabled: boolean;
    maxAllowedWorkFromHomeLimit: number;
    maxAllowedWorkFromHomeLimitDuration: number;
  };
  regularisation?: {
    allowRegularisation: boolean;
    hasRegularisationRequestsLimit: boolean;
    regularisationRequestLimit: number;
    regularisationRequestsDuration: number;
  };
}

export const useAttendanceScheme = (accessToken: string | null) => {
  const [scheme, setScheme] = useState<AttendanceSchemeConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadScheme = async (forceFetch = false) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const todayStr = format(new Date(), "yyyy-MM-dd");

      if (!forceFetch) {
        const stored = await browser.storage.local.get("attendance_scheme_cache");
        const cache = stored.attendance_scheme_cache as {
          date?: string;
          data?: any;
          timestamp?: number;
        } | undefined;
        if (
          cache &&
          cache.date === todayStr &&
          cache.data &&
          cache.timestamp &&
          Date.now() - cache.timestamp < 4 * 60 * 60 * 1000
        ) {
          const config = cache.data?.data?.configuration || null;
          setScheme(config);
          setLoading(false);
          return;
        }
      }

      const res = await fetchAttendanceCaptureScheme(accessToken);
      const config = res?.data?.configuration || null;
      setScheme(config);

      // Cache it
      await browser.storage.local.set({
        attendance_scheme_cache: {
          data: res,
          date: todayStr,
          timestamp: Date.now(),
        },
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch attendance scheme");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScheme();
  }, [accessToken]);

  return {
    scheme,
    loading,
    error,
    refreshScheme: () => loadScheme(true),
  };
};
