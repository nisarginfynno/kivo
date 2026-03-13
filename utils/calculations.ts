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
  MonthlyStats,
  WeeklyStats,
} from "./types";

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
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const duration = `${hours}h ${minutes}m ${seconds}s`;

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
      const breakHours = Math.floor(breakSeconds / 3600);
      const breakMins = Math.floor((breakSeconds % 3600) / 60);
      const breakSecs = breakSeconds % 60;

      let breakDuration = "";
      if (breakHours > 0) breakDuration += `${breakHours}h `;
      if (breakMins > 0) breakDuration += `${breakMins}m `;
      breakDuration += `${breakSecs}s`;

      breakList.push({
        startTime: currentPair.endTime,
        endTime: nextPair.startTime,
        duration: breakDuration.trim(),
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
      const breakHours = Math.floor(breakSeconds / 3600);
      const breakMins = Math.floor((breakSeconds % 3600) / 60);
      const breakSecs = breakSeconds % 60;

      let breakDuration = "";
      if (breakHours > 0) breakDuration += `${breakHours}h `;
      if (breakMins > 0) breakDuration += `${breakMins}m `;
      breakDuration += `${breakSecs}s`;

      breakList.push({
        startTime: lastPair.endTime,
        endTime: entry.actualTimestamp,
        duration: breakDuration.trim(),
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
): Metrics => {
  // Determine target
  const targetSeconds = isHalfDay ? (4 * 60 + 30) * 60 : (8 * 60 + 15) * 60;
  const remainingSeconds = Math.max(0, targetSeconds - totalWorkedSeconds);
  const isOvertime = totalWorkedSeconds > targetSeconds;
  const overtimeSeconds = isOvertime ? totalWorkedSeconds - targetSeconds : 0;

  // Calculate completion status
  const isCompleted = remainingSeconds === 0;
  // Close to completion if within 30 minutes
  const isCloseToCompletion = remainingSeconds <= 30 * 60 && remainingSeconds > 0;

  // Determine status color
  let totalWorkedStatus: "yellow" | "green" | "red";
  if (isHalfDay) {
    const halfDayMax = (4 * 60 + 45) * 60;
    if (totalWorkedSeconds < targetSeconds) {
      totalWorkedStatus = "yellow";
    } else if (totalWorkedSeconds <= halfDayMax) {
      totalWorkedStatus = "green";
    } else {
      totalWorkedStatus = "red";
    }
  } else {
    const maxAcceptable = (8 * 60 + 30) * 60;
    if (totalWorkedSeconds < targetSeconds) {
      totalWorkedStatus = "yellow";
    } else if (totalWorkedSeconds <= maxAcceptable) {
      totalWorkedStatus = "green";
    } else {
      totalWorkedStatus = "red";
    }
  }

  // Format total worked
  const totalHours = Math.floor(totalWorkedSeconds / 3600);
  const totalMins = Math.floor((totalWorkedSeconds % 3600) / 60);
  const totalSecs = totalWorkedSeconds % 60;
  const totalWorked = `${totalHours}h ${totalMins}m ${totalSecs}s`;

  // Format remaining
  const remainingHours = Math.floor(remainingSeconds / 3600);
  const remainingMins = Math.floor((remainingSeconds % 3600) / 60);
  const remainingSecs = remainingSeconds % 60;
  const remaining = `${remainingHours}h ${remainingMins}m ${remainingSecs}s`;

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
): LeaveTimeInfo => {
  const now = new Date();
  const normalTargetSeconds = halfDay ? (4 * 60 + 30) * 60 : (8 * 60 + 15) * 60;

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

  const earlyTargetSeconds = halfDay ? (3 * 60 + 30) * 60 : (7 * 60) * 60;

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
): {
  metrics: Metrics;
  totalWorkedSeconds: number;
  isClockedIn: boolean;
  leaveTimeInfo: LeaveTimeInfo | null;
} => {
  const { totalWorkedSeconds, isClockedIn } =
    calculateSecondsFromAttendance(attendanceData);

  if (!attendanceData.length) {
    // Default empty
    return {
      metrics: generateMetricsFromSeconds(0, halfDay, false),
      totalWorkedSeconds: 0,
      isClockedIn: false,
      leaveTimeInfo: null,
    };
  }

  const metrics = generateMetricsFromSeconds(
    totalWorkedSeconds,
    halfDay,
    isClockedIn,
  );
  const leaveTimeInfo = calculateLeaveTimeInfo(totalWorkedSeconds, halfDay);

  return {
    metrics,
    totalWorkedSeconds,
    isClockedIn,
    leaveTimeInfo,
  };
};

export const processMonthlyStats = (
  attendanceData: AttendanceData[],
  holidaysData: HolidayResponse | null,
  leaveData: LeaveResponse | null,
  selectedDate: Date = new Date(),
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

  // Process Leaves
  const leaveDurations = new Map<string, number>();
  let leaveCount = 0;
  if (
    leaveData?.data?.leaveHistory &&
    Array.isArray(leaveData.data.leaveHistory)
  ) {
    leaveData.data.leaveHistory.forEach((leaveEntry) => {
      if (
        leaveEntry.date &&
        leaveEntry.change &&
        leaveEntry.change.duration < 0
      ) {
        const leaveDate = parseISO(leaveEntry.date);
        if (isSameMonth(leaveDate, now)) {
          const duration = Math.abs(leaveEntry.change.duration);
          leaveCount += duration;
          const existing = leaveDurations.get(leaveEntry.date) || 0;
          leaveDurations.set(leaveEntry.date, existing + duration);
        }
      }
    });
  }

  // Calculate Working Days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  let totalWorkingDaysCount = 0;
  let currentWorkingDayCount = 0;

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
    }
  });

  const remainingWorkingDaysCount =
    totalWorkingDaysCount - currentWorkingDayCount;

  // Process Average Hours
  let averageHours = 0;
  let hoursNeededPerDay = 0;

  if (
    attendanceData &&
    attendanceData.length > 0 &&
    currentWorkingDayCount > 0
  ) {
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyAttendance = attendanceData.filter((entry) => {
      if (!entry.attendanceDate) return false;
      const entryDate = new Date(entry.attendanceDate);
      entryDate.setHours(0, 0, 0, 0);
      return (
        entryDate.getMonth() === currentMonth &&
        entryDate.getFullYear() === currentYear &&
        entryDate < today
      );
    });

    let totalHours = 0;
    monthlyAttendance.forEach((entry) => {
      if (
        entry.totalEffectiveHours !== undefined &&
        entry.totalEffectiveHours !== null
      ) {
        totalHours += entry.totalEffectiveHours;
      }
    });

    const daysToDivideBy = currentWorkingDayCount;
    averageHours = daysToDivideBy > 0 ? totalHours / daysToDivideBy : 0;

    // If it's the first working day (daysToDivideBy === 0), show today's hours as average
    if (daysToDivideBy === 0) {
      const todayEntry = attendanceData.find((entry) => {
        if (!entry.attendanceDate) return false;
        const entryDate = new Date(entry.attendanceDate);
        return isSameDay(entryDate, now);
      });

      if (todayEntry) {
        const { totalWorkedSeconds } = calculateSecondsFromAttendance([todayEntry]);
        if (totalWorkedSeconds > 0) {
          averageHours = totalWorkedSeconds / 3600;
        }
      }
    }
  }

  // Calculate Needed/Day independently of past attendance check
  if (remainingWorkingDaysCount > 0 && totalWorkingDaysCount > 0) {
    const TARGET_AVERAGE_HOURS = 8.25;
    const totalHoursNeeded = totalWorkingDaysCount * TARGET_AVERAGE_HOURS;
    const hoursWorkedSoFar = averageHours * currentWorkingDayCount;

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
    averageHours: averageHours || null,
    hoursNeededPerDay: hoursNeededPerDay > 0 ? hoursNeededPerDay : null,
  };
};

export const processWeeklyStats = (
  attendanceData: AttendanceData[],
  holidaysData: HolidayResponse | null,
  leaveData: LeaveResponse | null,
  isManualHalfDay: boolean,
  selectedDate: Date = new Date(),
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

  // Process Leaves
  const leaveDurations = new Map<string, number>();
  let leaveCount = 0;
  if (
    leaveData &&
    leaveData.data &&
    leaveData.data.leaveHistory &&
    Array.isArray(leaveData.data.leaveHistory)
  ) {
    leaveData.data.leaveHistory.forEach((leaveEntry) => {
      if (
        leaveEntry.date &&
        leaveEntry.change &&
        leaveEntry.change.duration < 0
      ) {
        const leaveDate = parseISO(leaveEntry.date);
        if (isSameWeek(leaveDate, now, { weekStartsOn: 1 })) {
          const duration = Math.abs(leaveEntry.change.duration);
          leaveCount += duration;
          const existing = leaveDurations.get(leaveEntry.date) || 0;
          leaveDurations.set(leaveEntry.date, existing + duration);
        }
      }
    });
  }

  // Calculate Working Days & Targets
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  let totalWorkingDaysCount = 0;
  let currentWorkingDayCount = 0;
  let weeklyTargetHours = 0;

  allDays.forEach((day) => {
    const dayOfWeek = getDay(day);
    const dayStr = format(day, "yyyy-MM-dd");

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    let dayTarget = 8.25; // 8h 15m default

    if (holidayDates.includes(dayStr)) {
      dayTarget = 0;
    } else {
      // Deduct leave
      const leaveDuration = leaveDurations.get(dayStr) || 0;
      dayTarget -= leaveDuration * 8.25;

      // Manual Half Day check (Today Only)
      if (isManualHalfDay && isSameDay(day, now)) {
        // If manual half day, target is 4.5h max
        if (dayTarget > 4.5) {
          dayTarget = 4.5;
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
    }
  });

  const remainingWorkingDaysCount =
    totalWorkingDaysCount - currentWorkingDayCount;

  // Calculate Total Worked (including today's real-time)
  let totalWorkedHours = 0;

  // Find today's entry for real-time calculation
  const todayEntry = attendanceData.find((entry) => {
    const entryDate = new Date(entry.attendanceDate);
    return isSameDay(entryDate, now);
  });

  let todayRealTimeHours = 0;
  if (todayEntry) {
    const { totalWorkedSeconds } = calculateSecondsFromAttendance([todayEntry]);
    todayRealTimeHours = totalWorkedSeconds / 3600;
  }

  if (attendanceData && attendanceData.length > 0) {
    const weeklyAttendance = attendanceData.filter((entry) => {
      if (!entry.attendanceDate) return false;
      const entryDate = new Date(entry.attendanceDate);
      return isSameWeek(entryDate, now, { weekStartsOn: 1 });
    });

    weeklyAttendance.forEach((entry) => {
      const entryDate = new Date(entry.attendanceDate);
      if (isSameDay(entryDate, now)) {
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
      const entryDate = new Date(entry.attendanceDate);
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
    averageHours: averageHours || null,
    hoursNeededPerDay: hoursNeededPerDay || null,
    weeklyTarget: weeklyTargetHours,
    totalWorked: totalWorkedHours,
    remaining: remainingHours,
  };
};
