import { useState, useEffect } from "react";
import { browser } from "wxt/browser";
import { fetchLeaveSummary } from "../../../utils/api";
import type { LeaveSummary } from "../../../utils/types";
import { format } from "date-fns";

export const useLeaveBalance = (accessToken: string | null) => {
  const [leaveSummaries, setLeaveSummaries] = useState<LeaveSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLeaveBalance = async (forceFetch = false) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const todayStr = format(new Date(), "yyyy-MM-dd");

      if (!forceFetch) {
        const stored = await browser.storage.local.get("leave_cache");
        const cache = stored.leave_cache as {
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
          const summaries = cache.data?.data?.leaveSummaries || [];
          setLeaveSummaries(summaries);
          setLoading(false);
          return;
        }
      }

      const res = await fetchLeaveSummary(accessToken, todayStr);
      const summaries = res?.data?.leaveSummaries || [];
      setLeaveSummaries(summaries);

      // Cache it
      await browser.storage.local.set({
        leave_cache: {
          data: res,
          date: todayStr,
          timestamp: Date.now(),
        },
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch leave balance");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaveBalance();
  }, [accessToken]);

  return {
    leaveSummaries,
    loading,
    error,
    refreshLeaves: () => loadLeaveBalance(true),
  };
};
