const memeSubreddits = {
  completion: [
    "ProgrammerHumor",
    "wholesomememes",
    "IndianDankMemes",
    "memes"
  ],

  completionHalfDay: [
    "wholesomememes",
    "IndianDankMemes",
    "MadeMeSmile"
  ],

  monthlyAverage: [
    "GetMotivated",
    "wholesomememes",
    "MadeMeSmile"
  ],

  weeklyAverage: [
    "GetMotivated",
    "wholesomememes",
    "IndianDankMemes"
  ],

  overtime: [
    "ProgrammerHumor",
    "meirl",
    "IndianDankMemes",
    "memes"
  ],

  clockedInTooLong: [
    "ProgrammerHumor",
    "meirl",
    "2meirl4meirl"
  ],

  lunch: [
    "FoodMemes",
    "memes",
    "IndianFoodPhotos"
  ],

  tea: [
    "memes",
    "IndianDankMemes",
    "ProgrammerHumor"
  ],

  leaveApproaching: [
    "wholesomememes",
    "MadeMeSmile",
    "memes"
  ],

  weeklySummary: [
    "wholesomememes",
    "MadeMeSmile",
    "memes"
  ],

  sessionExpired: [
    "ProgrammerHumor",
    "meirl",
    "IndianDankMemes"
  ]
} as const;

export type MemeNotificationType = keyof typeof memeSubreddits;

// Valid image extensions for notification imageUrl (avoid .gif due to Notification API issues)
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// Meme frequency: ~25% of notifications get a meme
const MEME_PROBABILITY = 1;

// API timeout: don't wait longer than 5 seconds
const FETCH_TIMEOUT_MS = 5000;

// ── Types ────────────────────────────────────────────────────────────
interface MemeApiResponse {
  title: string;
  url: string;
  nsfw: boolean;
  spoiler: boolean;
  postLink: string;
  preview?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isImageUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Fetch with a timeout so we never hang waiting for the meme API.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Core: fetch a relevant meme ──────────────────────────────────────

/**
 * Fetch a context-relevant, SFW meme image URL for the given notification type.
 * Returns `null` if anything goes wrong (API down, NSFW, timeout, etc.).
 *
 * Uses caching (1 hour) and should be called inside a try/catch or
 * with the understanding that it never throws.
 */
export async function getRelevantMeme(
  type: MemeNotificationType,
): Promise<string | null> {
  try {
    // 2. Pick a random subreddit for this notification type
    const subreddits = memeSubreddits[type];
    const subreddit = pickRandom(subreddits);

    // 3. Fetch from API with timeout
    const response = await fetchWithTimeout(
      `https://meme-api.com/gimme/${subreddit}`,
      FETCH_TIMEOUT_MS,
    );

    if (!response.ok) return null;

    const data = (await response.json()) as MemeApiResponse;

    // 4. Safety checks
    if (data.nsfw || data.spoiler) return null;

    // Handle previews for smaller file size and faster loading
    let finalUrl = data.url;
    if (data.preview && data.preview.length > 0) {
      finalUrl = data.preview[data.preview.length - 1] as string;
    }

    if (!finalUrl || !isImageUrl(finalUrl)) return null;

    return finalUrl;
  } catch {
    // Network error, timeout, JSON parse error — all silently ignored
    return null;
  }
}

/**
 * Decide whether this notification should attempt to include a meme.
 * Returns true ~25% of the time.
 */
export function shouldShowMeme(): boolean {
  return Math.random() < MEME_PROBABILITY;
}
