type MemeNotificationConfig = {
  subreddits: readonly string[];
  preferredTerms: readonly string[];
  blockedTerms?: readonly string[];
};

const DEFAULT_BLOCKED_TERMS = [
  "nsfw",
  "politics",
  "political",
  "election",
  "religion",
  "religious",
  "war",
  "death",
  "kill",
  "killed",
] as const;

const memeConfigs = {
  completion: {
    subreddits: [
      "ProgrammerHumor",
      "wholesomememes",
      "MadeMeSmile",
      "memes",
    ],
    preferredTerms: [
      "work",
      "office",
      "job",
      "done",
      "finish",
      "finished",
      "complete",
      "success",
      "win",
      "developer",
      "programmer",
    ],
  },

  completionHalfDay: {
    subreddits: [
      "wholesomememes",
      "MadeMeSmile",
      "ProgrammerHumor",
    ],
    preferredTerms: [
      "half day",
      "early",
      "done",
      "finish",
      "finished",
      "free",
      "happy",
      "work",
    ],
  },

  monthlyAverage: {
    subreddits: [
      "GetMotivated",
      "wholesomememes",
      "MadeMeSmile",
    ],
    preferredTerms: [
      "progress",
      "goal",
      "goals",
      "target",
      "month",
      "monthly",
      "motivation",
      "success",
      "win",
    ],
  },

  weeklyAverage: {
    subreddits: [
      "GetMotivated",
      "wholesomememes",
      "ProgrammerHumor",
    ],
    preferredTerms: [
      "week",
      "weekly",
      "friday",
      "progress",
      "goal",
      "target",
      "motivation",
      "success",
      "win",
    ],
  },

  overtime: {
    subreddits: [
      "ProgrammerHumor",
      "meirl",
      "memes",
    ],
    preferredTerms: [
      "overtime",
      "late",
      "work",
      "working",
      "office",
      "job",
      "tired",
      "exhausted",
      "deadline",
      "developer",
      "programmer",
    ],
  },

  clockedInTooLong: {
    subreddits: [
      "ProgrammerHumor",
      "meirl",
      "memes",
    ],
    preferredTerms: [
      "long day",
      "tired",
      "exhausted",
      "work",
      "working",
      "office",
      "job",
      "late",
      "sleep",
      "developer",
      "programmer",
    ],
  },

  lunch: {
    subreddits: [
      "FoodMemes",
      "food",
      "memes",
    ],
    preferredTerms: [
      "lunch",
      "food",
      "eat",
      "eating",
      "hungry",
      "meal",
      "snack",
      "break",
    ],
  },

  tea: {
    subreddits: [
      "tea",
      "ProgrammerHumor",
      "memes",
    ],
    preferredTerms: [
      "tea",
      "chai",
      "coffee",
      "break",
      "snack",
      "office",
      "work",
      "tired",
    ],
  },

  leaveApproaching: {
    subreddits: [
      "ProgrammerHumor",
      "wholesomememes",
      "MadeMeSmile",
    ],
    preferredTerms: [
      "home",
      "leaving",
      "leave",
      "done",
      "finish",
      "finished",
      "office",
      "work",
      "free",
    ],
  },

  weeklySummary: {
    subreddits: [
      "wholesomememes",
      "MadeMeSmile",
      "ProgrammerHumor",
    ],
    preferredTerms: [
      "friday",
      "weekend",
      "week",
      "done",
      "finish",
      "finished",
      "progress",
      "work",
      "success",
    ],
  },

  sessionExpired: {
    subreddits: [
      "ProgrammerHumor",
      "meirl",
      "memes",
    ],
    preferredTerms: [
      "login",
      "logged out",
      "session",
      "token",
      "password",
      "error",
      "bug",
      "developer",
      "programmer",
    ],
  },
} as const satisfies Record<string, MemeNotificationConfig>;

export type MemeNotificationType = keyof typeof memeConfigs;

// Valid image extensions for notification imageUrl (avoid .gif due to Notification API issues)
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// Meme frequency: ~25% of notifications get a meme
const MEME_PROBABILITY = 0.25;

// API timeout: don't wait longer than 5 seconds
const FETCH_TIMEOUT_MS = 5000;

// Fetch a small batch so we can choose a more relevant title locally.
const MEMES_PER_SUBREDDIT = 6;
const MAX_SUBREDDITS_PER_NOTIFICATION = 2;

interface MemeApiResponse {
  title: string;
  url: string;
  nsfw: boolean;
  spoiler: boolean;
  postLink: string;
  subreddit?: string;
  ups?: number;
  preview?: string[];
}

interface MemeApiBatchResponse {
  count: number;
  memes: MemeApiResponse[];
}

type MemeCandidate = MemeApiResponse & {
  imageUrl: string;
  score: number;
};

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: readonly T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function isBatchResponse(data: unknown): data is MemeApiBatchResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as MemeApiBatchResponse).memes)
  );
}

function isImageUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

function getBestImageUrl(data: MemeApiResponse): string | null {
  const urls = [
    ...(data.preview ? [...data.preview].reverse() : []),
    data.url,
  ];

  return urls.find((url) => url && isImageUrl(url)) ?? null;
}

function getTermScore(text: string, terms: readonly string[], points: number): number {
  return terms.reduce((score, term) => {
    return text.includes(term.toLowerCase()) ? score + points : score;
  }, 0);
}

function scoreMeme(data: MemeApiResponse, config: MemeNotificationConfig): number {
  const searchableText = `${data.title} ${data.subreddit ?? ""}`.toLowerCase();
  const blockedTerms = [...DEFAULT_BLOCKED_TERMS, ...(config.blockedTerms ?? [])];

  if (blockedTerms.some((term) => searchableText.includes(term.toLowerCase()))) {
    return Number.NEGATIVE_INFINITY;
  }

  const keywordScore = getTermScore(searchableText, config.preferredTerms, 10);
  const safePopularityBoost = Math.min(Math.floor((data.ups ?? 0) / 1000), 8);

  return keywordScore + safePopularityBoost + Math.random();
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

async function fetchMemesFromSubreddit(subreddit: string): Promise<MemeApiResponse[]> {
  const response = await fetchWithTimeout(
    `https://meme-api.com/gimme/${subreddit}/${MEMES_PER_SUBREDDIT}`,
    FETCH_TIMEOUT_MS,
  );

  if (!response.ok) return [];

  const data = await response.json();
  if (isBatchResponse(data)) {
    return data.memes;
  }

  return [data as MemeApiResponse];
}

function toCandidate(
  data: MemeApiResponse,
  config: MemeNotificationConfig,
): MemeCandidate | null {
  if (data.nsfw || data.spoiler) return null;

  const imageUrl = getBestImageUrl(data);
  if (!imageUrl) return null;

  const score = scoreMeme(data, config);
  if (!Number.isFinite(score)) return null;

  return {
    ...data,
    imageUrl,
    score,
  };
}

// Core: fetch a relevant meme

/**
 * Fetch a context-relevant, SFW meme image URL for the given notification type.
 * Returns `null` if anything goes wrong (API down, NSFW, timeout, etc.).
 *
 * The meme API does not support keyword search, so we fetch a small batch from
 * notification-specific subreddits and rank candidates by title/subreddit terms.
 */
export async function getRelevantMeme(
  type: MemeNotificationType,
): Promise<string | null> {
  try {
    const config = memeConfigs[type];
    const subreddits = shuffle(config.subreddits).slice(0, MAX_SUBREDDITS_PER_NOTIFICATION);
    const responses = await Promise.allSettled(
      subreddits.map((subreddit) => fetchMemesFromSubreddit(subreddit)),
    );

    const candidates = responses
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .map((meme) => toCandidate(meme, config))
      .filter((candidate): candidate is MemeCandidate => candidate !== null)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.imageUrl ?? null;
  } catch {
    // Network error, timeout, JSON parse error - all silently ignored.
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
