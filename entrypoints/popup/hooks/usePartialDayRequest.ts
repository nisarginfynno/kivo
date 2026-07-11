import { useEffect, useState } from "react";
import { format } from "date-fns";
import { fetchPartialDayRequests } from "../../../utils/api";
import type { PartialDayRequest } from "../../../utils/types";

/** Returns the approved partial-day request for exactly the selected date. */
export const usePartialDayRequest = (
  accessToken: string | null,
  selectedDate: Date,
) => {
  const [request, setRequest] = useState<PartialDayRequest | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setRequest(null);
      return;
    }

    let cancelled = false;
    const date = format(selectedDate, "yyyy-MM-dd");

    const loadRequest = async () => {
      try {
        const requests = await fetchPartialDayRequests(accessToken, date, date);
        const matchingRequest = requests.find(
          (item) => item.requestDate === date && item.requestStatus === 2,
        );
        if (!cancelled) {
          setRequest(matchingRequest ?? null);
        }
      } catch (error) {
        // Attendance details stay usable if the optional request endpoint is unavailable.
        console.error("Unable to load partial-day requests:", error);
        if (!cancelled) setRequest(null);
      }
    };

    void loadRequest();
    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedDate]);

  return request;
};
