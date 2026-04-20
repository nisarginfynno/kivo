// Notification message pools — random selection makes notifications feel alive 🎯
// Add/remove messages freely; the system picks one at random each time.

export const notificationMessages = {
  // ── Work Target Completed ──────────────────────────────────────────
  completion: [
    "Target smashed! 🎯 Time to celebrate!",
    "Daily target done! You're officially free-range now 🐔",
    "Daily target completed! Mission accomplished 🏆",
    "Achievement unlocked: Full Day Warrior! 💪",
    "Work complete! Go enjoy the rest of your day 😎",
    "Compilation successful. Work day completed ✔️",
    "Task completed with 0 errors and 0 warnings 🚀",
    "Target hit! Your keyboard can finally rest 💤",
    "Full day? Done. You? Legend. 🫡",
    "Your daily quest is complete. Collect your XP! 🎮",
  ],

  completionHalfDay: [
    "Half day target crushed! 🎯 Enjoy the rest of the day!",
    "Half day target done! Half day warrior mode complete 💪",
    "Half day? More like half day HERO! 🦸",
    "Short day, big energy. You nailed it! ⚡",
    "Half day complete! Time for bonus life content 🎮",
  ],

  // ── Monthly Average Target Met ─────────────────────────────────────
  monthlyAverage: [
    "Monthly average on track! 🌟 Feel free to wrap up whenever you're ready!",
    "Your monthly target average is looking great! Leave guilt-free today 🥳",
    "Ahead of schedule! Your monthly average thanks you 📊",
    "Monthly target pace locked in. You're officially cruising 🚢",
    "Great discipline this month! Your average is on point 🎯",
    "Monthly stats say: you're a machine (the good kind) 🤖✨",
  ],

  // ── Weekly Average Target Met ──────────────────────────────────────
  weeklyAverage: [
    "Weekly average met! 🌟 Your pace this week is solid!",
    "You've hit your daily target for the weekly average! 🥳",
    "Weekly rhythm locked in! Consistent and crushing it 💪",
    "Your weekly numbers are looking beautiful 📈",
    "Week's average? On track. You? Unstoppable. 🚀",
  ],

  // ── Overtime Alerts ────────────────────────────────────────────────
  overtime: [
    "Overtime detected! Your couch misses you 🛋️",
    "You've entered overtime territory 🚨 Consider wrapping up!",
    "Still working? Your chair is concerned 😅",
    "Alert: You're speedrunning burnout. Please don't 🏃‍♂️💨",
    "Even robots take breaks, you know 🤖",
    "Warning: Human battery below optimal level 🔋",
    "Overtime unlocked! But rest matters more 🧘",
    "Your future self is begging you to stop 🙏",
    "Fun fact: rest makes you MORE productive tomorrow 💡",
  ],

  // ── Clocked In Too Long (9+ hours) ────────────────────────────────
  clockedInTooLong: [
    "9+ hours! You're a warrior, but even warriors rest ⚔️🛌",
    "Long session alert! Stretch, hydrate, breathe 🧘",
    "You've been clocked in for 9+ hours. Your eyes deserve a break 👀",
    "Marathon work session detected! Remember: health > deadlines 💚",
    "9 hours?! That's a full movie trilogy. Time to log off 🎬",
    "Your keyboard wants a divorce. Take a break 💔⌨️",
  ],

  // ── Lunch Break ────────────────────────────────────────────────────
  lunch: [
    "Lunch time! Your stomach has filed a bug report 🍛",
    "Fuel break! Even superheroes eat lunch 🦸‍♂️🍔",
    "Plot twist: food exists outside your screen 🍱",
    "System alert: Low glucose detected 🍜",
    "Pause work. Eat food. Return stronger 💪",
    "Your productivity drops without fuel. Go eat! 🔋🍕",
    "Lunch o'clock! Don't make your stomach send a follow-up 📝",
    "Recharge time! Your brain runs on food, not just coffee ☕🍛",
    "Breaking news: It's lunch time. Act accordingly 📰🍴",
  ],

  // ── Tea Break ──────────────────────────────────────────────────────
  tea: [
    "Tea break! Your brain deserves caffeine ☕",
    "4 PM energy boost time! ☕",
    "Your code will compile faster after tea 😉",
    "Pause work, sip tea, continue greatness 🫖",
    "Chai o'clock! Bugs fear caffeinated developers ☕",
    "Fun fact: 73% of bugs are solved by tea breaks (source: trust me) 🫖",
    "Time for a vibe check ☕ and by vibe we mean chai",
    "Your brain: 'I need caffeine.' Your body: 'Same.' ☕",
  ],

  // ── Leave Time Approaching ─────────────────────────────────────────
  leaveApproaching: [
    "Leave time approaching! Start wrapping things up 🏠",
    "Almost freedom time! Finish your last tasks 🎯",
    "Your exit window is opening soon 🚪",
    "Wrap-up mode activated! Save your work ⏳",
    "T-minus 30 minutes to freedom 🚀",
    "Time to land the plane. Wrap up and head out ✈️",
    "The finish line is in sight! Sprint to the end 🏁",
  ],

  // ── Weekly Summary (Fridays) ───────────────────────────────────────
  weeklySummary: [
    "Another productive week completed! 🎉 Have a great weekend!",
    "Weekly mission accomplished! Time to recharge 🔋",
    "You survived the week! Celebrate responsibly 🍻",
    "Work done. Weekend loading... ⏳",
    "Friday wrap! You earned this weekend. Enjoy every minute 🌅",
    "Weekly report: You crushed it. That is all 💅",
  ],

  // ── Session Expired ────────────────────────────────────────────────
  sessionExpired: [
    "Session expired ⚠️ Open Keka to refresh your tracking.",
    "Your Keka session needs a quick refresh 🔑",
    "Reconnect to Keka to resume tracking 📡",
    "Your session timed out. A quick Keka visit will fix it 🔄",
  ],
};

// Type-safe key type
export type NotificationMessageType = keyof typeof notificationMessages;

/**
 * Pick a random message from the pool for the given notification type.
 * Optionally pass a `replacer` to inject dynamic values via {{placeholder}}.
 *
 * @example
 *   getRandomMessage("completion")
 *   getRandomMessage("overtime", { time: "1h 30m" })
 */
export function getRandomMessage(
  type: NotificationMessageType,
  replacements?: Record<string, string>,
): string {
  const pool = notificationMessages[type];
  let message = pool[Math.floor(Math.random() * pool.length)] as string;

  if (replacements) {
    for (const [key, value] of Object.entries(replacements)) {
      message = message.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
  }

  return message;
}
