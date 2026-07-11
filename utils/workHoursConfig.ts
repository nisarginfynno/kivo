export interface WorkHoursConfig {
  fullDayMinutes: number;
  halfDayMinutes: number;
  /** JavaScript day indexes that are non-working days (0 = Sun, 6 = Sat). */
  weekendDays: number[];
}

export const WORK_HOURS_CONFIG_STORAGE_KEY = "work_hours_config_v1";

export const DEFAULT_WORK_HOURS_CONFIG: WorkHoursConfig = {
  fullDayMinutes: 8 * 60 + 15,
  halfDayMinutes: 4 * 60 + 30,
  weekendDays: [0, 6],
};

const MIN_TARGET_MINUTES = 30;
const MAX_TARGET_MINUTES = 23 * 60 + 59;

export const STATUS_GREEN_WINDOW_MINUTES = 15;
const FULL_DAY_EARLY_LEAVE_OFFSET_MINUTES = 75;
const HALF_DAY_EARLY_LEAVE_OFFSET_MINUTES = 60;

const parseNumericMinutes = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
};

const clampMinutes = (value: number): number =>
  Math.min(MAX_TARGET_MINUTES, Math.max(MIN_TARGET_MINUTES, value));

export const normalizeWorkHoursConfig = (
  rawConfig: Partial<WorkHoursConfig> | null | undefined,
): WorkHoursConfig => {
  const parsedFullDay = parseNumericMinutes(rawConfig?.fullDayMinutes);
  const parsedHalfDay = parseNumericMinutes(rawConfig?.halfDayMinutes);
  const weekendDays = Array.isArray(rawConfig?.weekendDays)
    ? [...new Set(rawConfig.weekendDays.filter(
        (day): day is number => Number.isInteger(day) && day >= 0 && day <= 6,
      ))].sort((a, b) => a - b)
    : DEFAULT_WORK_HOURS_CONFIG.weekendDays;

  const fullDayMinutes = clampMinutes(
    parsedFullDay ?? DEFAULT_WORK_HOURS_CONFIG.fullDayMinutes,
  );

  const halfDayMinutes = clampMinutes(
    parsedHalfDay ?? DEFAULT_WORK_HOURS_CONFIG.halfDayMinutes,
  );

  return {
    fullDayMinutes,
    halfDayMinutes: Math.min(halfDayMinutes, fullDayMinutes),
    weekendDays,
  };
};

export const formatMinutesAsHoursAndMinutes = (totalMinutes: number): string => {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${minutes}m`;
};

export const formatMinutesAsTimeInput = (totalMinutes: number): string => {
  const safeMinutes = Math.min(
    MAX_TARGET_MINUTES,
    Math.max(0, Math.round(totalMinutes)),
  );
  const hours = Math.floor(safeMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (safeMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const parseTimeInputToMinutes = (value: string): number | null => {
  const matched = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!matched) {
    return null;
  }

  const hours = Number.parseInt(matched[1] as string, 10);
  const minutes = Number.parseInt(matched[2] as string, 10);
  return hours * 60 + minutes;
};

export const minutesToHourDecimal = (minutes: number): number => {
  const roundedMinutes = Math.round(minutes);
  return roundedMinutes / 60;
};

export const getDailyTargetMinutes = (
  isHalfDay: boolean,
  workHoursConfig: WorkHoursConfig,
  leaveFraction: number = 0,
): number => {
  if (isHalfDay || leaveFraction === 0.5) {
    return workHoursConfig.halfDayMinutes;
  }
  if (leaveFraction >= 1.0) {
    return 0;
  }
  if (leaveFraction > 0) {
    return Math.round(workHoursConfig.fullDayMinutes * (1 - leaveFraction));
  }
  return workHoursConfig.fullDayMinutes;
};

export const getDailyTargetSeconds = (
  isHalfDay: boolean,
  workHoursConfig: WorkHoursConfig,
  leaveFraction: number = 0,
): number => getDailyTargetMinutes(isHalfDay, workHoursConfig, leaveFraction) * 60;

export const getEarlyLeaveTargetSeconds = (
  isHalfDay: boolean,
  workHoursConfig: WorkHoursConfig,
  leaveFraction: number = 0,
): number => {
  const targetMinutes = getDailyTargetMinutes(isHalfDay, workHoursConfig, leaveFraction);
  const offset = (isHalfDay || leaveFraction === 0.5)
    ? HALF_DAY_EARLY_LEAVE_OFFSET_MINUTES
    : FULL_DAY_EARLY_LEAVE_OFFSET_MINUTES;
  return Math.max(0, targetMinutes - offset) * 60;
};
