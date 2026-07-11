import {
  differenceInSeconds,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  format,
  startOfWeek,
  endOfWeek,
  isSameWeek,
  isSameDay,
} from "date-fns";
import type {
  AttendanceData,
  LeaveTimeInfo,
  Metrics,
  TimeEntry,
  TimePair,
  Break,
  HolidayResponse,
  LeaveResponse,
  LeaveNowProjection,
  MonthlyStats,
  PeriodProjection,
  WeeklyStats,
} from "./types";
import {
  DEFAULT_WORK_HOURS_CONFIG,
  STATUS_GREEN_WINDOW_MINUTES,
  getDailyTargetSeconds,
  getEarlyLeaveTargetSeconds,
  minutesToHourDecimal,
  type WorkHoursConfig,
} from "./workHoursConfig";

/**
 * Formats a duration given in total seconds into a human-readable string.
 * Rules:
 *   - Hours present  → "Xh Ym"  (seconds are dropped for readability)
 *   - Minutes only   → "Xm Ys"  (seconds kept so short breaks are precise)
 *   - Seconds only   → "Xs"
 */
export const formatDuration = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    // When hours are shown, always include minutes (even if 0) and drop seconds
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${s}s`;
};

const getKekaDateKey = (value: string | null | undefined): string | null => {
  if (!value) return null;

  const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnlyMatch) {
    return dateOnlyMatch[1] as string;
  }

  const parsedDate = parseISO(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return format(parsedDate, "yyyy-MM-dd");
};

const parseKekaDateKey = (dateKey: string): Date => parseISO(dateKey);

const normalizeLeaveDuration = (duration: unknown): number => {
  if (typeof duration !== "number" || !Number.isFinite(duration)) {
    return 0;
  }

  return Math.max(0, duration);
};

const clampLeaveDayFraction = (value: number): number =>
  Math.min(1, Math.max(0, value));

const getAttendanceShiftHours = (entry: AttendanceData): number =>
  entry.shiftEffectiveDuration ||
  entry.shiftDuration ||
  (entry.halfDayDuration ? entry.halfDayDuration * 2 : 0);

const getWorkedHours = (entry: AttendanceData): number =>
  entry.totalEffectiveHours ?? 0;

const getLeaveDetailHours = (detail: {
  startTime?: string;
  endTime?: string;
  duration?: { duration?: number };
}): number => {
  const explicitDuration = normalizeLeaveDuration(detail.duration?.duration);
  if (explicitDuration > 0) {
    return explicitDuration;
  }

  if (!detail.startTime || !detail.endTime) {
    return 0;
  }

  const startTime = parseISO(detail.startTime);
  const endTime = parseISO(detail.endTime);
  if (
    Number.isNaN(startTime.getTime()) ||
    Number.isNaN(endTime.getTime()) ||
    endTime <= startTime
  ) {
    return 0;
  }

  return differenceInSeconds(endTime, startTime) / 3600;
};

export const getAttendanceLeaveDuration = (entry: AttendanceData): number => {
  const explicitLeaveDuration = normalizeLeaveDuration(entry.leaveDayDuration);
  if (explicitLeaveDuration > 0) {
    return clampLeaveDayFraction(explicitLeaveDuration);
  }

  const hasLeaveMarkers =
    (entry.leaveDayStatuses?.length ?? 0) > 0 ||
    (entry.leaveDetails?.length ?? 0) > 0;
  if (!hasLeaveMarkers) {
    return 0;
  }

  const shiftHours = getAttendanceShiftHours(entry);
  const leaveHours = (entry.leaveDetails ?? []).reduce(
    (total, detail) => total + getLeaveDetailHours(detail),
    0,
  );

  if (shiftHours > 0 && leaveHours > 0) {
    return clampLeaveDayFraction(leaveHours / shiftHours);
  }

  if (getWorkedHours(entry) === 0) {
    return 1;
  }

  if (entry.halfDayDuration && getWorkedHours(entry) <= entry.halfDayDuration) {
    return 0.5;
  }

  return 0;
};

export const getTodayLeaveDescription = (
  entry: AttendanceData | undefined,
): string | null => {
  if (!entry) return null;

  const details = entry.leaveDetails || [];
  if (details.length === 0) {
    if (entry.leaveDayDuration && entry.leaveDayDuration > 0) {
      return `Leave (${entry.leaveDayDuration} day)`;
    }
    return null;
  }

  return details
    .map((detail) => {
      const type = detail.leaveTypeName || "Leave";
      const dur = detail.duration?.durationString ||
                  (detail.duration?.duration ? `${detail.duration.duration} day(s)` : null) ||
                  (entry.leaveDayDuration ? `${entry.leaveDayDuration} day` : "Partial Day");
      return `${type} (${dur})`;
    })
    .join(", ");
};

const buildLeaveDurations = (
  attendanceData: AttendanceData[],
  _leaveData: LeaveResponse | null,
  isInPeriod: (date: Date) => boolean,
): { leaveDurations: Map<string, number>; leaveCount: number } => {
  const leaveDurations = new Map<string, number>();

  attendanceData.forEach((entry) => {
    const dateKey = getKekaDateKey(entry.attendanceDate);
    if (!dateKey) return;

    const leaveDuration = getAttendanceLeaveDuration(entry);
    if (leaveDuration <= 0 || !isInPeriod(parseKekaDateKey(dateKey))) {
      return;
    }

    leaveDurations.set(
      dateKey,
      (leaveDurations.get(dateKey) || 0) + leaveDuration,
    );
  });

  const leaveCount = Array.from(leaveDurations.values()).reduce(
    (total, duration) => total + duration,
    0,
  );

  return { leaveDurations, leaveCount };
};

// Helper to calculate total seconds from attendance data
export const calculateSecondsFromAttendance = (
  attendanceData: AttendanceData[],
): {
  totalWorkedSeconds: number;
  isClockedIn: boolean;
} => {
  // Reuse the working logic from calculateTimePairsAndBreaks
  const { timePairs, unpairedInEntry } = calculateTimePairsAndBreaks(attendanceData);

  // Calculate total worked seconds from pairs
  let calculatedTotalWorkedSeconds = timePairs.reduce(
    (sum, pair) => sum + (pair.durationSeconds || 0),
    0,
  );

  // Add time from unpaired entry
  if (unpairedInEntry) {
    const startDate = new Date(unpairedInEntry.actualTimestamp);
    const now = new Date();
    const additionalSeconds = differenceInSeconds(now, startDate);
    calculatedTotalWorkedSeconds += additionalSeconds;
  }

  const isClockedIn = !!unpairedInEntry;

  return { totalWorkedSeconds: calculatedTotalWorkedSeconds, isClockedIn };
};

export const calculateTimePairsAndBreaks = (
  attendanceData: AttendanceData[],
): {
  timePairs: TimePair[];
  breaks: Break[];
  unpairedInEntry: TimeEntry | null;
} => {
  if (!attendanceData.length) {
    return { timePairs: [], breaks: [], unpairedInEntry: null };
  }

  const lastEntry = attendanceData[attendanceData.length - 1];
  const pairs: TimePair[] = [];
  const breakList: Break[] = [];
  let currentStart: TimeEntry | null = null;
  let unpairedInEntry: TimeEntry | null = null;

  if (lastEntry.timeEntries && Array.isArray(lastEntry.timeEntries)) {
    // Sort time entries chronologically to ensure pairs and breaks are calculated in order
    const sortedEntries = [...lastEntry.timeEntries].sort((a, b) => {
      if (!a.actualTimestamp || !b.actualTimestamp) return 0;
      const timeDiff = new Date(a.actualTimestamp).getTime() - new Date(b.actualTimestamp).getTime();
      if (timeDiff === 0) {
        // If timestamps are identical, put "In" (0) before "Out" (1)
        return a.punchStatus - b.punchStatus;
      }
      return timeDiff;
    });

    sortedEntries.forEach((entry: TimeEntry) => {
      if (!entry.actualTimestamp) return;

      // punchStatus 0 = In (start), 1 = Out (end)
      if (entry.punchStatus === 0) {
        // Start time
        currentStart = entry;
      } else if (entry.punchStatus === 1 && currentStart) {
        // End time - create a pair
        const startDate = new Date(currentStart.actualTimestamp);
        const endDate = new Date(entry.actualTimestamp);
        const totalSeconds = differenceInSeconds(endDate, startDate);
        const duration = formatDuration(totalSeconds);

        pairs.push({
          startTime: currentStart.actualTimestamp,
          endTime: entry.actualTimestamp,
          duration,
          durationMinutes: Math.floor(totalSeconds / 60),
          durationSeconds: totalSeconds,
        });

        currentStart = null; // Reset for next pair
      }
    });

    // Check if there's an unpaired "In" entry (no out record)
    if (currentStart) {
      unpairedInEntry = currentStart;
    }
  }

  // Calculate breaks between consecutive time pairs
  for (let i = 0; i < pairs.length - 1; i++) {
    const currentPair = pairs[i];
    const nextPair = pairs[i + 1];

    // Break is from end of current pair to start of next pair
    const breakStart = new Date(currentPair.endTime);
    const breakEnd = new Date(nextPair.startTime);
    const breakSeconds = differenceInSeconds(breakEnd, breakStart);

    if (breakSeconds > 0) {
      breakList.push({
        startTime: currentPair.endTime,
        endTime: nextPair.startTime,
        duration: formatDuration(breakSeconds),
        durationMinutes: Math.floor(breakSeconds / 60),
        durationSeconds: breakSeconds,
      });
    }
  }

  // Check for break after the last pair if there's an unpaired "In" entry
  if (pairs.length > 0 && unpairedInEntry) {
    const entry = unpairedInEntry as TimeEntry;
    const lastPair = pairs[pairs.length - 1];
    const breakStart = new Date(lastPair.endTime);
    const breakEnd = new Date(entry.actualTimestamp);
    const breakSeconds = differenceInSeconds(breakEnd, breakStart);

    if (breakSeconds > 0) {
      breakList.push({
        startTime: lastPair.endTime,
        endTime: entry.actualTimestamp,
        duration: formatDuration(breakSeconds),
        durationMinutes: Math.floor(breakSeconds / 60),
        durationSeconds: breakSeconds,
      });
    }
  }

  return {
    timePairs: pairs,
    breaks: breakList,
    unpairedInEntry,
  };
};

// Helper to generate metrics object from seconds
export const generateMetricsFromSeconds = (
  totalWorkedSeconds: number,
  isHalfDay: boolean,
  isClockedIn: boolean = false,
  workHoursConfig: WorkHoursConfig = DEFAULT_WORK_HOURS_CONFIG,
  leaveFraction: number = 0,
): Metrics => {
  // Determine target
  const targetSeconds = getDailyTargetSeconds(isHalfDay, workHoursConfig, leaveFraction);
  const remainingSeconds = Math.max(0, targetSeconds - totalWorkedSeconds);
  const isOvertime = totalWorkedSeconds > targetSeconds;
  const overtimeSeconds = isOvertime ? totalWorkedSeconds - targetSeconds : 0;

  // Calculate completion status
  const isCompleted = remainingSeconds === 0;
  // Close to completion if within 30 minutes
  const isCloseToCompletion = remainingSeconds <= 30 * 60 && remainingSeconds > 0;

  // Determine status color
  let totalWorkedStatus: "yellow" | "green" | "red";
  const maxAcceptableSeconds =
    targetSeconds + STATUS_GREEN_WINDOW_MINUTES * 60;
  if (totalWorkedSeconds < targetSeconds) {
    totalWorkedStatus = "yellow";
  } else if (totalWorkedSeconds <= maxAcceptableSeconds) {
    totalWorkedStatus = "green";
  } else {
    totalWorkedStatus = "red";
  }

  // Format total worked
  const totalWorked = formatDuration(totalWorkedSeconds);

  // Format remaining
  const remaining = formatDuration(remainingSeconds);

  // Calculate estimated completion
  const now = new Date();
  let estCompletionTime: Date;
  if (isOvertime) {
    // Show when they should have completed
    estCompletionTime = new Date(now.getTime() - overtimeSeconds * 1000);
  } else if (isClockedIn) {
    // Show when they will complete
    estCompletionTime = new Date(now.getTime() + remainingSeconds * 1000);
  } else {
    // If not clocked in, we can't really estimate exactly, but preserving old behavior:
    // logic assumes "if I worked continuously from now"
    estCompletionTime = new Date(now.getTime() + remainingSeconds * 1000);
  }

  const estCompletion = `${estCompletionTime.getHours().toString().padStart(2, "0")}:${estCompletionTime.getMinutes().toString().padStart(2, "0")}`;

  return {
    totalWorked,
    remaining,
    estCompletion,
    isCompleted,
    isCloseToCompletion,
    totalWorkedStatus,
    isOvertime,
    overtimeMinutes: Math.floor(overtimeSeconds / 60),
    overtimeSeconds,
  };
};

export const calculateLeaveTimeInfo = (
  totalWorkedSeconds: number,
  halfDay: boolean,
  workHoursConfig: WorkHoursConfig = DEFAULT_WORK_HOURS_CONFIG,
  leaveFraction: number = 0,
): LeaveTimeInfo => {
  const now = new Date();
  const normalTargetSeconds = getDailyTargetSeconds(halfDay, workHoursConfig, leaveFraction);

  let normalLeaveTimeStr: string;
  if (totalWorkedSeconds >= normalTargetSeconds) {
    normalLeaveTimeStr = "-";
  } else {
    const normalRemainingSeconds = Math.max(
      0,
      normalTargetSeconds - totalWorkedSeconds,
    );
    const normalLeaveTime = new Date(
      now.getTime() + normalRemainingSeconds * 1000,
    );
    normalLeaveTimeStr = `${normalLeaveTime.getHours() > 12 ? normalLeaveTime.getHours() - 12 : normalLeaveTime.getHours()}:${normalLeaveTime.getMinutes().toString().padStart(2, "0")} ${normalLeaveTime.getHours() >= 12 ? "pm" : "am"}`;
  }

  const earlyTargetSeconds = getEarlyLeaveTargetSeconds(
    halfDay,
    workHoursConfig,
    leaveFraction,
  );

  let earlyLeaveTimeStr: string;
  if (totalWorkedSeconds >= earlyTargetSeconds) {
    earlyLeaveTimeStr = "-";
  } else {
    const earlyRemainingSeconds = Math.max(0, earlyTargetSeconds - totalWorkedSeconds);
    const earlyLeaveTime = new Date(
      now.getTime() + earlyRemainingSeconds * 1000,
    );
    earlyLeaveTimeStr = `${earlyLeaveTime.getHours() > 12 ? earlyLeaveTime.getHours() - 12 : earlyLeaveTime.getHours()}:${earlyLeaveTime.getMinutes().toString().padStart(2, "0")} ${earlyLeaveTime.getHours() >= 12 ? "pm" : "am"}`;
  }

  return {
    normalLeaveTime: normalLeaveTimeStr,
    earlyLeaveTime: earlyLeaveTimeStr,
  };
};

export const calculateMetrics = (
  attendanceData: AttendanceData[],
  halfDay: boolean,
  workHoursConfig: WorkHoursConfig = DEFAULT_WORK_HOURS_CONFIG,
): {
  metrics: Metrics;
  totalWorkedSeconds: number;
  isClockedIn: boolean;
  leaveTimeInfo: LeaveTimeInfo | null;
  leaveFraction: number;
  leaveDescription: string | null;
} => {
  const { totalWorkedSeconds, isClockedIn } =
    calculateSecondsFromAttendance(attendanceData);

  if (!attendanceData.length) {
    // Default empty
    return {
      metrics: generateMetricsFromSeconds(0, halfDay, false, workHoursConfig),
      totalWorkedSeconds: 0,
      isClockedIn: false,
      leaveTimeInfo: null,
      leaveFraction: 0,
      leaveDescription: null,
    };
  }

  // Calculate today's leave fraction and description automatically from attendance data
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const lastEntry = attendanceData[attendanceData.length - 1];
  const isTodayEntry = lastEntry?.attendanceDate &&
                       getKekaDateKey(lastEntry.attendanceDate) === todayStr;
  const leaveFraction = isTodayEntry ? getAttendanceLeaveDuration(lastEntry) : 0;
  const leaveDescription = isTodayEntry ? getTodayLeaveDescription(lastEntry) : null;

  const metrics = generateMetricsFromSeconds(
    totalWorkedSeconds,
    halfDay,
    isClockedIn,
    workHoursConfig,
    leaveFraction,
  );
  const leaveTimeInfo = calculateLeaveTimeInfo(
    totalWorkedSeconds,
    halfDay,
    workHoursConfig,
    leaveFraction,
  );

  return {
    metrics,
    totalWorkedSeconds,
    isClockedIn,
    leaveTimeInfo,
    leaveFraction,
    leaveDescription,
  };
};

export const processMonthlyStats = (
  attendanceData: AttendanceData[],
  holidaysData: HolidayResponse | null,
  leaveData: LeaveResponse | null,
  selectedDate: Date = new Date(),
  workHoursConfig: WorkHoursConfig = DEFAULT_WORK_HOURS_CONFIG,
): MonthlyStats => {
  const now = selectedDate;
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Process Holidays
  const holidayDates: string[] = [];
  if (holidaysData?.data && Array.isArray(holidaysData.data)) {
    holidaysData.data.forEach((holiday) => {
      if (holiday.date) {
        const holidayDate = parseISO(holiday.date);
        if (isSameMonth(holidayDate, now)) {
          holidayDates.push(holiday.date);
        }
      }
    });
  }

  const { leaveDurations, leaveCount } = buildLeaveDurations(
    attendanceData,
    leaveData,
    (date) => isSameMonth(date, now),
  );

  // Calculate Working Days
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  let totalWorkingDaysCount = 0;
  let currentWorkingDayCount = 0;
  let futureWorkingDaysCount = 0;

  allDays.forEach((day) => {
    const dayOfWeek = getDay(day);
    // Skip weekends (0 is Sunday, 6 is Saturday)
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    const dayStr = format(day, "yyyy-MM-dd");

    // Skip holidays
    if (holidayDates.includes(dayStr)) return;

    // Check for leave duration on this day
    const leaveDuration = leaveDurations.get(dayStr) || 0;

    // Calculate effective working day value (1 for full day, 0.5 for half day, etc.)
    // Ensure strictly non-negative
    const workingValue = Math.max(0, 1 - leaveDuration);

    totalWorkingDaysCount += workingValue;

    const dayDate = new Date(day);
    dayDate.setHours(0, 0, 0, 0);
    if (dayDate < today) {
      currentWorkingDayCount += workingValue;
    } else if (dayDate > today) {
      futureWorkingDaysCount += workingValue;
    }
  });

  const remainingWorkingDaysCount =
    totalWorkingDaysCount - currentWorkingDayCount;

  // Process Average Hours
  let averageHours = 0;
  let hoursNeededPerDay = 0;
  let totalWorkedHours = 0;
  let pastWorkedHours = 0;

  if (attendanceData && attendanceData.length > 0) {
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyAttendance = attendanceData.filter((entry) => {
      if (!entry.attendanceDate) return false;
      const entryDate = new Date(entry.attendanceDate);
      entryDate.setHours(0, 0, 0, 0);
      return (
        entryDate.getMonth() === currentMonth &&
        entryDate.getFullYear() === currentYear
      );
    });

    monthlyAttendance.forEach((entry) => {
      if (!entry.attendanceDate) return;
      const entryDate = new Date(entry.attendanceDate);
      entryDate.setHours(0, 0, 0, 0);

      let entryHours = 0;
      if (isSameDay(entryDate, today)) {
        const { totalWorkedSeconds } = calculateSecondsFromAttendance([entry]);
        entryHours = totalWorkedSeconds / 3600;
      } else if (
        entry.totalEffectiveHours !== undefined &&
        entry.totalEffectiveHours !== null
      ) {
        entryHours = entry.totalEffectiveHours;
      }

      totalWorkedHours += entryHours;
      if (entryDate < today) {
        pastWorkedHours += entryHours;
      }
    });

    if (currentWorkingDayCount > 0) {
      averageHours = pastWorkedHours / currentWorkingDayCount;
    } else if (totalWorkedHours > 0) {
      averageHours = totalWorkedHours;
    }
  }

  // Calculate Needed/Day independently of past attendance check
  const TARGET_AVERAGE_HOURS = minutesToHourDecimal(
    workHoursConfig.fullDayMinutes,
  );
  const totalHoursNeeded = totalWorkingDaysCount * TARGET_AVERAGE_HOURS;

  if (remainingWorkingDaysCount > 0 && totalWorkingDaysCount > 0) {
    const hoursWorkedSoFar = pastWorkedHours;

    // Ensure we don't have negative remaining due to floating point or over-work
    const hoursRemaining = Math.max(0, totalHoursNeeded - hoursWorkedSoFar);

    hoursNeededPerDay = hoursRemaining / remainingWorkingDaysCount;

    if (hoursNeededPerDay < 0) hoursNeededPerDay = 0;
  }

  return {
    holidayDates,
    leaveCount,
    totalWorkingDaysCount,
    currentWorkingDayCount,
    remainingWorkingDaysCount,
    futureWorkingDaysCount,
    averageHours: averageHours || null,
    hoursNeededPerDay: hoursNeededPerDay > 0 ? hoursNeededPerDay : null,
    monthlyTarget: totalHoursNeeded,
    totalWorked: totalWorkedHours,
    remaining: Math.max(0, totalHoursNeeded - totalWorkedHours),
  };
};

export const processWeeklyStats = (
  attendanceData: AttendanceData[],
  holidaysData: HolidayResponse | null,
  leaveData: LeaveResponse | null,
  isManualHalfDay: boolean,
  selectedDate: Date = new Date(),
  workHoursConfig: WorkHoursConfig = DEFAULT_WORK_HOURS_CONFIG,
): WeeklyStats => {
  const now = selectedDate;
  // Use ISO week (Monday start)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  // Process Holidays
  const holidayDates: string[] = [];
  if (holidaysData && holidaysData.data && Array.isArray(holidaysData.data)) {
    holidaysData.data.forEach((holiday) => {
      if (holiday.date) {
        const holidayDate = parseISO(holiday.date);
        if (isSameWeek(holidayDate, now, { weekStartsOn: 1 })) {
          holidayDates.push(holiday.date);
        }
      }
    });
  }

  const { leaveDurations, leaveCount } = buildLeaveDurations(
    attendanceData,
    leaveData,
    (date) => isSameWeek(date, now, { weekStartsOn: 1 }),
  );

  // Calculate Working Days & Targets
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const fullDayHours = minutesToHourDecimal(workHoursConfig.fullDayMinutes);
  const halfDayHours = minutesToHourDecimal(workHoursConfig.halfDayMinutes);

  let totalWorkingDaysCount = 0;
  let currentWorkingDayCount = 0;
  let futureWorkingDaysCount = 0;
  let weeklyTargetHours = 0;

  allDays.forEach((day) => {
    const dayOfWeek = getDay(day);
    const dayStr = format(day, "yyyy-MM-dd");

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    let dayTarget = fullDayHours;

    if (holidayDates.includes(dayStr)) {
      dayTarget = 0;
    } else {
      // Deduct leave
      const leaveDuration = leaveDurations.get(dayStr) || 0;
      dayTarget -= leaveDuration * fullDayHours;

      // Manual Half Day check (Today Only)
      if (isManualHalfDay && isSameDay(day, now)) {
        if (dayTarget > halfDayHours) {
          dayTarget = halfDayHours;
        }
      }
    }

    dayTarget = Math.max(0, dayTarget);
    weeklyTargetHours += dayTarget;

    let workingValue = Math.max(0, 1 - (leaveDurations.get(dayStr) || 0));
    if (holidayDates.includes(dayStr)) workingValue = 0;

    totalWorkingDaysCount += workingValue;

    const dayDate = new Date(day);
    dayDate.setHours(0, 0, 0, 0);
    if (dayDate < today) {
      currentWorkingDayCount += workingValue;
    } else if (dayDate > today) {
      futureWorkingDaysCount += workingValue;
    }
  });

  const remainingWorkingDaysCount =
    totalWorkingDaysCount - currentWorkingDayCount;

  // Calculate Total Worked (including today's real-time)
  let totalWorkedHours = 0;

  // Find today's entry for real-time calculation
  const nowDateKey = format(now, "yyyy-MM-dd");
  const todayEntry = attendanceData.find(
    (entry) => getKekaDateKey(entry.attendanceDate) === nowDateKey,
  );

  let todayRealTimeHours = 0;
  if (todayEntry) {
    const { totalWorkedSeconds } = calculateSecondsFromAttendance([todayEntry]);
    todayRealTimeHours = totalWorkedSeconds / 3600;
  }

  if (attendanceData && attendanceData.length > 0) {
    const weeklyAttendance = attendanceData.filter((entry) => {
      if (!entry.attendanceDate) return false;
      const dateKey = getKekaDateKey(entry.attendanceDate);
      if (!dateKey) return false;
      const entryDate = parseKekaDateKey(dateKey);
      return isSameWeek(entryDate, now, { weekStartsOn: 1 });
    });

    weeklyAttendance.forEach((entry) => {
      if (getKekaDateKey(entry.attendanceDate) === nowDateKey) {
        totalWorkedHours += todayRealTimeHours;
      } else {
        if (entry.totalEffectiveHours) {
          totalWorkedHours += entry.totalEffectiveHours;
        }
      }
    });
  }

  const remainingHours = Math.max(0, weeklyTargetHours - totalWorkedHours);

  // Average Hours (Past days only)
  let averageHours = 0;
  let pastDaysWorkedHours = 0;

  if (attendanceData) {
    const pastAttendance = attendanceData.filter((entry) => {
      if (!entry.attendanceDate) return false;
      const dateKey = getKekaDateKey(entry.attendanceDate);
      if (!dateKey) return false;
      const entryDate = parseKekaDateKey(dateKey);
      // consistent with currentWorkingDayCount: days < today
      return (
        isSameWeek(entryDate, now, { weekStartsOn: 1 }) && entryDate < today
      );
    });
    pastAttendance.forEach(
      (entry) => (pastDaysWorkedHours += entry.totalEffectiveHours || 0),
    );
  }

  if (currentWorkingDayCount > 0) {
    averageHours = pastDaysWorkedHours / currentWorkingDayCount;
  } else if (currentWorkingDayCount === 0 && totalWorkedHours > 0 && !holidayDates.includes(format(now, "yyyy-MM-dd"))) {
    // If it's the first working day of the week (and not a holiday), show today's total work as average
    averageHours = totalWorkedHours;
  }

  let hoursNeededPerDay = 0;
  if (remainingWorkingDaysCount > 0) {
    const remainingForPeriod = Math.max(
      0,
      weeklyTargetHours - pastDaysWorkedHours,
    );
    hoursNeededPerDay = remainingForPeriod / remainingWorkingDaysCount;
  }

  return {
    holidays: holidayDates,
    leaveDaysCount: leaveCount,
    totalWorkingDays: totalWorkingDaysCount,
    currentWorkingDay: currentWorkingDayCount,
    remainingWorkingDays: remainingWorkingDaysCount,
    futureWorkingDays: futureWorkingDaysCount,
    averageHours: averageHours || null,
    hoursNeededPerDay: hoursNeededPerDay || null,
    weeklyTarget: weeklyTargetHours,
    totalWorked: totalWorkedHours,
    remaining: remainingHours,
  };
};

export const calculateLeaveNowProjection = ({
  totalWorkedSeconds,
  isHalfDay,
  weeklyStats,
  monthlyStats,
  workHoursConfig = DEFAULT_WORK_HOURS_CONFIG,
  leaveFraction = 0,
}: {
  totalWorkedSeconds: number;
  isHalfDay: boolean;
  weeklyStats?: WeeklyStats | null;
  monthlyStats?: {
    monthlyTarget: number;
    totalWorked: number;
    totalWorkingDays?: number | null;
    totalWorkingDaysCount?: number | null;
    futureWorkingDays?: number | null;
    futureWorkingDaysCount?: number | null;
  } | null;
  workHoursConfig?: WorkHoursConfig;
  leaveFraction?: number;
}): LeaveNowProjection => {
  const todayWorkedHours = totalWorkedSeconds / 3600;
  const dailyTargetHours =
    getDailyTargetSeconds(isHalfDay, workHoursConfig, leaveFraction) / 3600;
  const todayShortfallHours = Math.max(0, dailyTargetHours - todayWorkedHours);

  const buildPeriodProjection = (
    targetHours: number,
    workedHours: number,
    totalWorkingDays: number | null | undefined,
    futureWorkingDays: number | null | undefined,
  ): PeriodProjection | null => {
    if (
      totalWorkingDays === null ||
      totalWorkingDays === undefined ||
      futureWorkingDays === null ||
      futureWorkingDays === undefined
    ) {
      return null;
    }

    const safeTotalWorkingDays = Math.max(0, totalWorkingDays);
    const safeFutureWorkingDays = Math.max(0, futureWorkingDays);
    const workedDaysThroughToday = Math.max(
      0,
      safeTotalWorkingDays - safeFutureWorkingDays,
    );
    const remainingHours = Math.max(0, targetHours - workedHours);

    let neededPerFutureDay: number | null = null;
    if (safeFutureWorkingDays > 0) {
      neededPerFutureDay = remainingHours / safeFutureWorkingDays;
    } else if (remainingHours === 0) {
      neededPerFutureDay = 0;
    }

    return {
      averageIfLeaveNow:
        workedDaysThroughToday > 0
          ? workedHours / workedDaysThroughToday
          : null,
      remainingHours,
      neededPerFutureDay,
      futureWorkingDays: safeFutureWorkingDays,
    };
  };

  const weekly = weeklyStats
    ? buildPeriodProjection(
        weeklyStats.weeklyTarget,
        weeklyStats.totalWorked,
        weeklyStats.totalWorkingDays,
        weeklyStats.futureWorkingDays,
      )
    : null;

  const monthly = monthlyStats
    ? buildPeriodProjection(
        monthlyStats.monthlyTarget,
        monthlyStats.totalWorked,
        monthlyStats.totalWorkingDaysCount ?? monthlyStats.totalWorkingDays,
        monthlyStats.futureWorkingDaysCount ?? monthlyStats.futureWorkingDays,
      )
    : null;

  const candidates: Array<{
    source: "weekly" | "monthly" | "daily";
    hours: number;
  }> = [{ source: "daily", hours: dailyTargetHours }];

  if (
    weekly?.neededPerFutureDay !== null &&
    weekly?.neededPerFutureDay !== undefined &&
    weekly.futureWorkingDays > 0
  ) {
    candidates.push({ source: "weekly", hours: weekly.neededPerFutureDay });
  }

  if (
    monthly?.neededPerFutureDay !== null &&
    monthly?.neededPerFutureDay !== undefined &&
    monthly.futureWorkingDays > 0
  ) {
    candidates.push({ source: "monthly", hours: monthly.neededPerFutureDay });
  }

  const highestCandidate = candidates.reduce((highest, candidate) =>
    candidate.hours > highest.hours ? candidate : highest,
  );

  const blockedPeriods = [
    weekly && weekly.remainingHours > 0 && weekly.futureWorkingDays === 0
      ? "weekly"
      : null,
    monthly && monthly.remainingHours > 0 && monthly.futureWorkingDays === 0
      ? "monthly"
      : null,
  ].filter(Boolean);

  const hasBlockedPeriod = blockedPeriods.length > 0;
  const hasOnlyBlockedPeriods = [weekly, monthly].some(Boolean) && [weekly, monthly]
    .filter(Boolean)
    .every(
      (period) =>
        period &&
        period.remainingHours > 0 &&
        period.futureWorkingDays === 0,
    );

  const hasAnyUnavailablePeriod = [weekly, monthly].some(
    (period) =>
      period &&
      period.remainingHours > 0 &&
      period.futureWorkingDays === 0,
  );

  const fullDayHours = minutesToHourDecimal(workHoursConfig.fullDayMinutes);
  const recommendedTomorrowTarget = hasOnlyBlockedPeriods
    ? null
    : highestCandidate.hours;

  let status: LeaveNowProjection["status"] = "safe";
  let statusLabel = "Safe";

  if (hasOnlyBlockedPeriods) {
    status = "blocked";
    statusLabel = "No recovery days left";
  } else if (
    recommendedTomorrowTarget !== null &&
    recommendedTomorrowTarget > fullDayHours + 1.5
  ) {
    status = "heavy";
    statusLabel = "Heavy recovery";
  } else if (
    recommendedTomorrowTarget !== null &&
    recommendedTomorrowTarget > fullDayHours
  ) {
    status = "recoverable";
    statusLabel = "Recoverable";
  } else if (hasBlockedPeriod || hasAnyUnavailablePeriod) {
    status = "recoverable";
    statusLabel =
      blockedPeriods.includes("monthly") ? "Month closes today" : "Week closes today";
  }

  return {
    todayShortfallHours,
    weekly,
    monthly,
    recommendedTomorrowTarget,
    recommendationSource: hasOnlyBlockedPeriods ? null : highestCandidate.source,
    status,
    statusLabel,
  };
};
