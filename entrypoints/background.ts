// Background service worker for continuous Keka monitoring and notifications
import { browser } from "wxt/browser";
import type { NotificationStates } from "../utils/types";
import { fetchAttendanceSummary, fetchHolidays, fetchLeaveSummary, fetchRangeStats } from "../utils/api";
import { calculateMetrics, processMonthlyStats, processWeeklyStats } from "../utils/calculations";
import { getRandomMessage } from "../utils/notificationMessages";
import { getRelevantMeme, shouldShowMeme, type MemeNotificationType } from "../utils/memes";
import { format, startOfWeek, endOfWeek } from "date-fns";
import {
  WORK_HOURS_CONFIG_STORAGE_KEY,
  getDailyTargetMinutes,
  minutesToHourDecimal,
  normalizeWorkHoursConfig,
} from "../utils/workHoursConfig";

// Get current date/week keys
function getCurrentDay(): string {
  return new Date().toISOString().split("T")[0];
}

function getCurrentWeek(): string {
  return `week_${new Date().getFullYear()}-${Math.floor(new Date().getDate() / 7)}`;
}

// Play notification sound via Offscreen Document (service workers can't use Audio API directly)
let offscreenCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenCreated) return;
  try {
    // Check if an offscreen document already exists
    const existingContexts = await (browser as any).runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    if (existingContexts && existingContexts.length > 0) {
      offscreenCreated = true;
      return;
    }
    await (browser as any).offscreen.createDocument({
      url: "sound-player.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play notification sound when alerts fire",
    });
    offscreenCreated = true;
  } catch (error) {
    // May fail if document already exists (race condition) — that's fine
    if ((error as Error)?.message?.includes("single offscreen")) {
      offscreenCreated = true;
    } else {
      console.error("Error creating offscreen document:", error);
    }
  }
}

async function playNotificationSound() {
  try {
    await ensureOffscreenDocument();
    await browser.runtime.sendMessage({ type: "PLAY_NOTIFICATION_SOUND" });
  } catch (error) {
    console.error("Error playing notification sound:", error);
  }
}

// Optimized notification helper (supports optional meme images)
async function showNotification(
  title: string,
  message: string,
  requireInteraction = false,
  imageUrl?: string | null,
) {
  try {
    const { notifications_enabled } = await browser.storage.local.get("notifications_enabled");
    if (notifications_enabled !== true) {
      return;
    }

    if (!browser || !browser.notifications) {
      console.error("Notifications API not available");
      return;
    }
    // Use image-type notification when a meme URL is available
    if (imageUrl) {
      try {
        await browser.notifications.create({
          type: "image",
          iconUrl: "icon/128.png",
          title,
          message,
          imageUrl,
          requireInteraction,
          silent: true,
        });
      } catch (error) {
        console.warn(
          "Image notification not supported; falling back to basic notification.",
          error,
        );
        await browser.notifications.create({
          type: "basic",
          iconUrl: "icon/128.png",
          title,
          message,
          requireInteraction,
          silent: true,
        });
      }
    } else {
      await browser.notifications.create({
        type: "basic",
        iconUrl: "icon/128.png",
        title,
        message,
        requireInteraction,
        silent: true, // Suppress OS sound; we play our own.
      });
    }

    // Play custom notification sound via offscreen document
    await playNotificationSound();
  } catch (error) {
    console.error("Error showing notification:", error);
  }
}

async function setInStorage(key: string, value: any): Promise<void> {
  try {
    await browser.storage.local.set({ [key]: value });
  } catch (error) {
    console.error("Error writing to storage:", error);
  }
}

async function getNotificationStates(): Promise<NotificationStates> {
  const currentDay = getCurrentDay();
  const currentWeek = getCurrentWeek();

  /* 
   * Storage Keys Mapping:
   * Old keys are reused where possible, but new logic uses them differently or uses new keys.
   * To prevent issues with legacy data, we interpret them safely.
   */
  const keys = [
    `completion_notified_${currentDay}`,
    `overtime_notified_${currentDay}`,
    `clocked_in_too_long_notified_${currentDay}`,
    `leave_time_approaching_notified_${currentDay}`,
    `monthly_progress_notified_${currentWeek}`,
    `weekly_summary_notified_${currentWeek}`,
    `last_overtime_minutes_${currentDay}`,
    `lunch_break_notified_${currentDay}`,
    `tea_break_notified_${currentDay}`,
    `average_target_notified_${currentDay}`,
    `weekly_average_target_notified_${currentDay}`,
    `token_expired_notified_${currentDay}`
  ];

  const result = await browser.storage.local.get(keys);

  return {
    completionNotifiedToday: Boolean(result[keys[0]]),
    overtimeNotifiedToday: Boolean(result[keys[1]]),
    clockedInTooLongNotifiedToday: Boolean(result[keys[2]]),
    leaveTimeApproachingNotifiedToday: Boolean(result[keys[3]]),
    monthlyProgressNotifiedThisWeek: Boolean(result[keys[4]]),
    weeklySummaryNotified: Boolean(result[keys[5]]),
    lastOvertimeNotifiedMinutes: typeof result[keys[6]] === 'number' ? (result[keys[6]] as number) : 0,
    lunchBreakNotifiedToday: Boolean(result[keys[7]]),
    teaBreakNotifiedToday: Boolean(result[keys[8]]),
    averageTargetNotifiedToday: Boolean(result[keys[9]]),
    weeklyAverageTargetNotifiedToday: Boolean(result[keys[10]]),
    tokenExpiredNotifiedToday: Boolean(result[keys[11]]),
  };
}

async function updateNotificationState(stateKey: keyof NotificationStates, value: any): Promise<void> {
  const currentDay = getCurrentDay();
  const currentWeek = getCurrentWeek();

  const keyMap: Record<keyof NotificationStates, string> = {
    completionNotifiedToday: `completion_notified_${currentDay}`,
    overtimeNotifiedToday: `overtime_notified_${currentDay}`,
    clockedInTooLongNotifiedToday: `clocked_in_too_long_notified_${currentDay}`,
    leaveTimeApproachingNotifiedToday: `leave_time_approaching_notified_${currentDay}`,
    monthlyProgressNotifiedThisWeek: `monthly_progress_notified_${currentWeek}`,
    weeklySummaryNotified: `weekly_summary_notified_${currentWeek}`,
    lastOvertimeNotifiedMinutes: `last_overtime_minutes_${currentDay}`,
    lunchBreakNotifiedToday: `lunch_break_notified_${currentDay}`,
    teaBreakNotifiedToday: `tea_break_notified_${currentDay}`,
    averageTargetNotifiedToday: `average_target_notified_${currentDay}`,
    weeklyAverageTargetNotifiedToday: `weekly_average_target_notified_${currentDay}`,
    tokenExpiredNotifiedToday: `token_expired_notified_${currentDay}`,
  };

  await setInStorage(keyMap[stateKey], value);
}

// Helper to handle token expiration
async function handleTokenExpiration(accessToken: string) {
  try {
    // 1. Try to find a fresh token in opened tabs
    const { keka_domain } = await browser.storage.local.get("keka_domain");

    if (!keka_domain) return;

    const domain = keka_domain as string;
    const hostname = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const kekaTabs = await browser.tabs.query({
      url: [
        `*://${hostname}/*`,
        `*://*.${hostname}/*`
      ]
    });
    if (kekaTabs.length > 0) {
      const activeTab = kekaTabs.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0))[0];
      if (activeTab.id) {
        const result = await browser.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => localStorage.getItem("access_token")
        });

        const freshToken = result[0]?.result;
        if (freshToken && freshToken !== accessToken) {
          await browser.storage.local.set({ access_token: freshToken });
          console.log("Automatically refreshed expired token from tab.");
          return; // Token refreshed, next tick will pick it up
        }
      }
    }

    // 2. If no tab/token found, notify user ONCE per day (only if token is actually missing or invalid)

    // If the token is invalid/expired and we couldn't refresh it from a tab, 
    // we must clear it so the UI prompts the user to log in again.
    if (accessToken) {
      await browser.storage.local.remove("access_token");
    }

    const { tokenExpiredNotifiedToday } = await getNotificationStates();
    if (!tokenExpiredNotifiedToday) {
      await showNotification(
        "Session Expired ⚠️",
        getRandomMessage("sessionExpired"),
        true
      );
      await updateNotificationState("tokenExpiredNotifiedToday", true);
    }

  } catch (e) {
    console.error("Error handling token expiration:", e);
  }
}

// Main notification logic (optimized)
async function runNotificationLogic() {
  try {
    const currentDay = getCurrentDay();
    const storageKeys = ['access_token', `halfDay_${currentDay}`, 'attendance_data', 'current_total_worked_seconds', 'lunch_time', 'memes_enabled', 'holidays_cache', 'leave_cache', WORK_HOURS_CONFIG_STORAGE_KEY];
    const storageData = await browser.storage.local.get(storageKeys);

    const accessToken = storageData.access_token as string;

    // If no access token at all, maybe try to find one? 
    if (!accessToken) {
      await handleTokenExpiration(""); // pass empty string to trigger search
      return;
    }

    const isHalfDay = !!storageData[`halfDay_${currentDay}`];
    const workHoursConfig = normalizeWorkHoursConfig(
      storageData[WORK_HOURS_CONFIG_STORAGE_KEY] as
        | { fullDayMinutes?: number; halfDayMinutes?: number }
        | undefined,
    );
    const storedAttendanceData = storageData.attendance_data;

    // Fetch fresh data
    let attendanceData, holidaysData;
    let holidaysFetchNeeded = false;
    
    const holidaysCache = storageData.holidays_cache as { data: any, timestamp: number } | undefined;
    holidaysData = holidaysCache?.data;
    if (!holidaysData || !holidaysCache?.timestamp || (Date.now() - holidaysCache.timestamp > 4 * 60 * 60 * 1000)) {
        holidaysFetchNeeded = true;
    }

    try {
      const promises: Promise<any>[] = [fetchAttendanceSummary(accessToken)];
      if (holidaysFetchNeeded) {
          promises.push(fetchHolidays(accessToken));
      }
      
      const results = await Promise.all(promises);
      attendanceData = results[0];
      
      if (holidaysFetchNeeded) {
          holidaysData = results[1];
          await browser.storage.local.set({
              holidays_cache: {
                  data: holidaysData,
                  timestamp: Date.now()
              }
          });
      }
    } catch (error) {
      // Whether specific 'Unauthorized' or generic failure, handle as potential expiration
      // and suppress error logging to keep extension logs clean.
      if (error instanceof Error && error.message === 'Unauthorized') {
        await handleTokenExpiration(accessToken);
      }
      return;
    }

    // Fetch leave summary for today to check if on leave (needed for monthly stats mostly)
    let leaveData = null;
    try {
      const now = new Date();
      const currentDateStr = format(now, "yyyy-MM-dd");
      
      const leaveCache = storageData.leave_cache as { data: any, date: string, timestamp: number } | undefined;
      leaveData = leaveCache?.data;
      const leaveCacheValid = leaveData && 
                             leaveCache?.date === currentDateStr && 
                             leaveCache?.timestamp && 
                             (Date.now() - leaveCache.timestamp < 4 * 60 * 60 * 1000);

      if (!leaveCacheValid) {
          leaveData = await fetchLeaveSummary(accessToken, currentDateStr);
          await browser.storage.local.set({
              leave_cache: {
                  data: leaveData,
                  date: currentDateStr,
                  timestamp: Date.now()
              }
          });
      }
    } catch (e) {
      // Silently ignore leave data fetch failures
      /*
      if (e instanceof Error && e.message !== 'Unauthorized') {
        console.error("Failed to fetch leave data", e);
      }
      */
    }

    if (!attendanceData) {
      // console.log('Failed to fetch attendance data - possibly expired token');
      await handleTokenExpiration(accessToken);
      return;
    }

    // Calculate current metrics
    const { metrics, totalWorkedSeconds, isClockedIn, leaveTimeInfo } =
      calculateMetrics(attendanceData, isHalfDay, workHoursConfig);
    const totalWorkedMinutes = Math.floor(totalWorkedSeconds / 60);

    // Calculate monthly stats for "Average Target"
    const monthlyStats = processMonthlyStats(
      attendanceData,
      holidaysData,
      leaveData,
      new Date(),
      workHoursConfig,
    );
    const hoursNeededPerDay = monthlyStats.hoursNeededPerDay;

    // Calculate weekly stats for "Weekly Average Target"
    const weeklyStats = processWeeklyStats(
      attendanceData,
      holidaysData,
      leaveData,
      isHalfDay,
      new Date(),
      workHoursConfig,
    );
    const weeklyHoursNeededPerDay = weeklyStats.hoursNeededPerDay;

    // Get notification states
    const notificationStates = await getNotificationStates();

    const targetMinutes = getDailyTargetMinutes(isHalfDay, workHoursConfig);
    const notificationsToShow: Array<{ title: string; message: string; stateKey: keyof NotificationStates; newValue: any; memeType?: MemeNotificationType }> = [];
    const nowLocal = new Date();
    const currentHour = nowLocal.getHours();
    const currentMinute = nowLocal.getMinutes();

    // 1. Completion Notification
    if (!notificationStates.completionNotifiedToday) {
      const justCompleted = totalWorkedMinutes >= targetMinutes;
      if (justCompleted) {
        const completionType = isHalfDay ? "completionHalfDay" : "completion";
        notificationsToShow.push({
          title: "Work Target Completed! 🎯",
          message: getRandomMessage(completionType),
          stateKey: "completionNotifiedToday",
          newValue: true,
          memeType: completionType
        });
      }
    }

    // 2. Average Target Met (Monthly)
    // Only if hoursNeededPerDay is below the configured full-day target
    // and user has reached that target.
    if (!notificationStates.averageTargetNotifiedToday && hoursNeededPerDay !== null) {
      const standardTargetHours = minutesToHourDecimal(
        workHoursConfig.fullDayMinutes,
      );
      // If needed is less than standard, it's a "happy" early leave day potentially
      if (hoursNeededPerDay < standardTargetHours) {
        const neededMinutes = Math.ceil(hoursNeededPerDay * 60);
        if (totalWorkedMinutes >= neededMinutes) {
          notificationsToShow.push({
            title: "Monthly Average Met! 🌟",
            message: getRandomMessage("monthlyAverage"),
            stateKey: "averageTargetNotifiedToday",
            newValue: true,
            memeType: "monthlyAverage"
          });
        }
      }
    }

    // 2b. Average Target Met (Weekly)
    if (!notificationStates.weeklyAverageTargetNotifiedToday && weeklyHoursNeededPerDay !== null) {
      const standardTargetHours = minutesToHourDecimal(
        workHoursConfig.fullDayMinutes,
      );
      if (weeklyHoursNeededPerDay < standardTargetHours) {
        const neededMinutes = Math.ceil(weeklyHoursNeededPerDay * 60);
        if (totalWorkedMinutes >= neededMinutes) {
          notificationsToShow.push({
            title: "Weekly Average Met! 🌟",
            message: getRandomMessage("weeklyAverage"),
            stateKey: "weeklyAverageTargetNotifiedToday",
            newValue: true,
            memeType: "weeklyAverage"
          });
        }
      }
    }

    // 3. Overtime
    if (totalWorkedMinutes > targetMinutes) {
      const overtimeMinutes = totalWorkedMinutes - targetMinutes;

      // Notify every 30 minutes of overtime
      // Use logic: current chunk > last notified chunk
      const currentOvertimeBase = Math.floor(overtimeMinutes / 30) * 30; // 0, 30, 60, 90...

      if (currentOvertimeBase > 0 && currentOvertimeBase > notificationStates.lastOvertimeNotifiedMinutes) {
        const hours = Math.floor(overtimeMinutes / 60);
        const minutes = overtimeMinutes % 60;
        const timeString = hours > 0
          ? `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`
          : `${minutes}m`;

        notificationsToShow.push({
          title: "Overtime Alert! ⏰",
          message: `${getRandomMessage("overtime")} (${timeString} overtime)`,
          stateKey: "lastOvertimeNotifiedMinutes",
          newValue: currentOvertimeBase,
          memeType: "overtime"
        });

        // Also set the boolean flag for backward compatibility or general status
        if (!notificationStates.overtimeNotifiedToday) {
          notificationsToShow.push({
            title: "", // Hidden/Internal update
            message: "",
            stateKey: "overtimeNotifiedToday",
            newValue: true
          });
        }
      }
    }

    // 4. Clocked In Too Long
    if (!notificationStates.clockedInTooLongNotifiedToday && isClockedIn) {
      const nineHours = 9 * 60;
      const isTooLong = totalWorkedMinutes >= nineHours;
      if (isTooLong) {
        notificationsToShow.push({
          title: "Long Work Session Alert! ⚠️",
          message: getRandomMessage("clockedInTooLong"),
          stateKey: "clockedInTooLongNotifiedToday",
          newValue: true,
          memeType: "clockedInTooLong"
        });
      }
    }

    // 5. Lunch Break
    // if (!notificationStates.lunchBreakNotifiedToday && isClockedIn) {
    if (!notificationStates.lunchBreakNotifiedToday) {
      const lunchTimeSetting = (storageData.lunch_time as string) || "12:30";
      const [lunchHourStr, lunchMinuteStr] = lunchTimeSetting.split(":");
      const parsedHour = parseInt(lunchHourStr, 10);
      const lunchHour = isNaN(parsedHour) ? 12 : parsedHour;
      const parsedMin = parseInt(lunchMinuteStr, 10);
      const lunchMinute = isNaN(parsedMin) ? 30 : parsedMin;

      const currentTotalMinutes = currentHour * 60 + currentMinute;
      const lunchTotalMinutes = lunchHour * 60 + lunchMinute;

      if (currentTotalMinutes >= lunchTotalMinutes) {
        const period = lunchHour >= 12 ? "PM" : "AM";
        const formatHour = lunchHour % 12 || 12;
        const formatMin = lunchMinute.toString().padStart(2, "0");
        const timeString = `${formatHour}:${formatMin} ${period}`;

        notificationsToShow.push({
          title: "Lunch Break! 🥗",
          message: `It's ${timeString} — ${getRandomMessage("lunch")}`,
          stateKey: "lunchBreakNotifiedToday",
          newValue: true,
          memeType: "lunch"
        });
      }
    }

    // 6. Tea Break (4:00 PM)
    if (!notificationStates.teaBreakNotifiedToday && isClockedIn) {
      // Trigger at 4:00 PM (16:00)
      if (currentHour >= 16) {
        notificationsToShow.push({
          title: "Tea Break! ☕",
          message: getRandomMessage("tea"),
          stateKey: "teaBreakNotifiedToday",
          newValue: true,
          memeType: "tea"
        });
      }
    }

    // 7. Leave Time Approaching
    if (leaveTimeInfo && !notificationStates.leaveTimeApproachingNotifiedToday && isClockedIn) {
      try {
        const now = new Date();
        const timeParts = leaveTimeInfo.normalLeaveTime.split(/[:\s]/);
        if (timeParts.length >= 2) {
          let leaveHour = parseInt(timeParts[0]);
          // Check for PM and adjust if not 12
          if (leaveTimeInfo.normalLeaveTime.toLowerCase().includes('pm') && leaveHour !== 12) {
            leaveHour += 12;
          }
          // If AM and 12, it is midnight (0)
          if (leaveTimeInfo.normalLeaveTime.toLowerCase().includes('am') && leaveHour === 12) {
            leaveHour = 0;
          }

          const leaveTime = new Date();
          leaveTime.setHours(leaveHour, parseInt(timeParts[1] as string) || 0, 0, 0);

          const timeUntilLeave = (leaveTime.getTime() - now.getTime()) / (1000 * 60);
          if (timeUntilLeave <= 30 && timeUntilLeave > 0) {
            notificationsToShow.push({
              title: "Leave Time Approaching! 🏠",
              message: `${getRandomMessage("leaveApproaching")} (leave at ${leaveTimeInfo.normalLeaveTime})`,
              stateKey: "leaveTimeApproachingNotifiedToday",
              newValue: true,
              memeType: "leaveApproaching"
            });
          }
        }
      } catch (error) {
        console.error("Error calculating leave time:", error);
      }
    }

    // 8. Weekly Summary (Fridays only)
    if (!notificationStates.weeklySummaryNotified && nowLocal.getDay() === 5) {
      try {
        const weekStart = format(startOfWeek(nowLocal, { weekStartsOn: 1 }), "yyyy-MM-dd");
        const weekEnd = format(endOfWeek(nowLocal, { weekStartsOn: 1 }), "yyyy-MM-dd");
        const rangeStats = await fetchRangeStats(accessToken, weekStart, weekEnd);
        const weeklyAvg = rangeStats?.data?.myStats?.averageHoursPerDayInHHMM;
        const totalHours = rangeStats?.data?.myStats?.totalEffectiveHoursInHHMM;

        const message = totalHours
          ? `This week's total: ${totalHours} (avg ${weeklyAvg}/day). ${getRandomMessage("weeklySummary")}`
          : getRandomMessage("weeklySummary");

        notificationsToShow.push({
          title: "End of Week Summary 📈",
          message,
          stateKey: "weeklySummaryNotified",
          newValue: true,
          memeType: "weeklySummary"
        });
      } catch (e) {
        // Silently ignore — weekly summary is non-critical
      }
    }

    // Process notifications in batch
    if (notificationsToShow.length > 0) {
      console.log(`Showing ${notificationsToShow.length} notification(s)`);

      for (const notification of notificationsToShow) {
        // Show notification only if it has a title/message (might be internal update)
        if (notification.title && notification.message) {
          // Occasionally fetch a context-relevant meme (~25% of the time)
          let memeUrl: string | null = null;
          const memesEnabled = !!storageData.memes_enabled;
          if (memesEnabled && notification.memeType && shouldShowMeme()) {
            try {
              memeUrl = await getRelevantMeme(notification.memeType);
            } catch {
              // Silently ignore — meme is a nice-to-have
            }
          }
          await showNotification(
            notification.title,
            notification.message,
            false,
            memeUrl
          );
        }
        await updateNotificationState(notification.stateKey, notification.newValue);
      }
    }

    // Check if data actually changed to avoid unnecessary storage writes and UI jitter
    // Also check if storedTotalSeconds is different (e.g. for seconds update or migration)
    const storedTotalSeconds = storageData.current_total_worked_seconds;
    const hasDataChanged =
      JSON.stringify(attendanceData) !== JSON.stringify(storedAttendanceData) ||
      storedTotalSeconds !== totalWorkedSeconds;

    if (hasDataChanged) {
      // Store current metrics in storage for the popup to read
      await browser.storage.local.set({
        current_metrics: metrics,
        current_total_worked_seconds: totalWorkedSeconds,
        current_is_clocked_in: isClockedIn,
        current_leave_time_info: leaveTimeInfo,
        attendance_data: attendanceData,
        last_updated: Date.now()
      });
    }

  } catch (error) {
    console.error("Error in notification logic:", error);
  }
}

// Main background initialization
export default defineBackground(() => {
  console.log('Keka Background Service Started! 🎯');

  // Check if browser APIs are available
  if (!browser || !browser.alarms || !browser.runtime) {
    console.error('Browser APIs not available');
    return;
  }

  // Message handling for communication with popup and content scripts
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FORCE_CHECK') {
      runNotificationLogic();
      sendResponse({ success: true });
    } else if (message.type === 'TOKEN_UPDATE' && message.token) {
      // Content script proactively sent a new token
      browser.storage.local.get("access_token").then((data) => {
        if (data.access_token !== message.token) {
          browser.storage.local.set({ access_token: message.token }).then(() => {
            console.log("Token updated from content script. Triggering check.");
            runNotificationLogic();
          });
        }
      });
      sendResponse({ success: true });
    }
    return true;
  });

  // Create periodic alarm to check metrics every minute
  browser.alarms.create('CHECK_METRICS', {
    periodInMinutes: 1, // Check every minute
    delayInMinutes: 0.1 // Start after 6 seconds
  }).catch((error) => {
    console.error('Error creating alarm:', error);
  });

  // Listen for alarm events
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'CHECK_METRICS') {
      await runNotificationLogic();
    }
  });

  // Run initial check
  setTimeout(() => {
    runNotificationLogic();
  }, 2000);

  console.log('Background service initialized with 1-minute metric checks');
});

