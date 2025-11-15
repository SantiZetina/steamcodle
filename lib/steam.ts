import fallbackAppIds from "@/data/fallback-app-ids.json";

type SteamStoreGenres = {
  id: string;
  description: string;
};

type SteamStorePayload = {
  success: boolean;
  data?: {
    type?: string;
    name: string;
    header_image: string;
    short_description: string;
    genres?: SteamStoreGenres[];
    price_overview?: { final_formatted: string };
    metacritic?: { score: number; url: string };
    release_date?: { date: string };
  };
};

type SteamReviewPayload = {
  success: number;
  query_summary: {
    total_reviews: number;
    total_positive: number;
    total_negative: number;
    review_score: number;
    review_score_desc: string;
  };
};

type FeaturedCategoriesResponse = {
  status: number;
  [key: string]: unknown;
  top_sellers?: FeaturedCategory;
  great_deals?: FeaturedCategory;
  new_releases?: FeaturedCategory;
  coming_soon?: FeaturedCategory;
  specials?: FeaturedCategory;
  top_wishlisted?: FeaturedCategory;
};

type FeaturedCategory = {
  id: string;
  name: string;
  items?: FeaturedItem[];
};

type FeaturedItem = {
  id: number;
  type?: string;
};

export type SteamGame = {
  appId: number;
  type: string;
  name: string;
  headerImage: string;
  shortDescription: string;
  reviewScore: number | null;
  reviewSummary: string | null;
  positive: number | null;
  negative: number | null;
  totalReviews: number | null;
  genres: string[];
};

const FEATURED_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const APP_LIST_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MIN_TOTAL_REVIEWS = 100;
const MAX_TOTAL_ATTEMPTS = 50;
const RECENT_HISTORY_LIMIT = 25;

let cachedFeaturedIds: number[] | null = null;
let cachedFeaturedExpiry = 0;
let cachedAllAppIds: number[] | null = null;
let cachedAllAppIdsExpiry = 0;
const recentHistory: number[] = [];
let warnedFeaturedFallback = false;

function normalizeReviewScore(
  positive: number | null | undefined,
  total: number | null | undefined,
  fallbackScore: number | null | undefined,
) {
  if (typeof positive === "number" && typeof total === "number" && total > 0) {
    return Math.round((positive / total) * 100);
  }

  if (typeof fallbackScore === "number") {
    if (fallbackScore <= 10) {
      return fallbackScore * 10;
    }
    return fallbackScore;
  }

  return null;
}

async function fetchStoreDetails(appId: number) {
  const response = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&l=en`,
    {
      cache: "no-store",
      headers: {
        "User-Agent": "Steamcodle/1.0 (+https://steamcodle.local)",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Steam store API failed with status ${response.status}`);
  }

  const json = (await response.json()) as Record<string, SteamStorePayload>;
  const payload = json[String(appId)];

  if (!payload?.success || !payload.data) {
    throw new Error(`No store data for app ${appId}`);
  }

  return payload.data;
}

async function fetchReviewSummary(appId: number) {
  const response = await fetch(
    `https://store.steampowered.com/appreviews/${appId}?json=1&language=english&purchase_type=all&num_per_page=0`,
    {
      cache: "no-store",
      headers: {
        "User-Agent": "Steamcodle/1.0 (+https://steamcodle.local)",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Steam reviews API failed with status ${response.status}`);
  }

  const json = (await response.json()) as SteamReviewPayload;
  return json.success === 1 ? json.query_summary : null;
}

export async function fetchSteamGame(appId: number): Promise<SteamGame> {
  const [store, reviews] = await Promise.all([
    fetchStoreDetails(appId),
    fetchReviewSummary(appId),
  ]);

  return {
    appId,
    type: store.type ?? "unknown",
    name: store.name,
    headerImage: store.header_image,
    shortDescription: store.short_description,
    reviewScore: normalizeReviewScore(
      reviews?.total_positive ?? null,
      reviews?.total_reviews ?? null,
      store.metacritic?.score,
    ),
    reviewSummary: reviews?.review_score_desc ?? null,
    positive: reviews?.total_positive ?? null,
    negative: reviews?.total_negative ?? null,
    totalReviews: reviews?.total_reviews ?? null,
    genres: store.genres?.map((genre) => genre.description) ?? [],
  };
}

async function fetchFeaturedAppIds() {
  const now = Date.now();

  if (cachedFeaturedIds && cachedFeaturedExpiry > now) {
    return cachedFeaturedIds;
  }

  try {
    const response = await fetch(
      "https://store.steampowered.com/api/featuredcategories",
      {
        cache: "no-store",
        headers: {
          "User-Agent": "Steamcodle/1.0 (+https://steamcodle.local)",
        },
      },
    );

    if (!response.ok) {
      if (!warnedFeaturedFallback) {
        console.warn(
          `Steam featured categories returned ${response.status}, using fallback catalog.`,
        );
        warnedFeaturedFallback = true;
      }
      return loadFallbackCatalog();
    }

    const json = (await response.json()) as FeaturedCategoriesResponse;

    if (json.status !== 1) {
      if (!warnedFeaturedFallback) {
        console.warn("Steam featured categories returned error, using fallback.");
        warnedFeaturedFallback = true;
      }
      return loadFallbackCatalog();
    }

    const candidateCategories: (FeaturedCategory | undefined)[] = [
      json.top_sellers,
      json.great_deals,
      json.new_releases,
      json.coming_soon,
      json.specials,
      json.top_wishlisted,
    ];

    const ids = Array.from(
      new Set(
        candidateCategories.flatMap((category) =>
          category?.items
            ?.filter((item) => isGameItem(item))
            .map((item) => item.id) ?? [],
        ),
      ),
    );

    if (ids.length === 0) {
      if (!warnedFeaturedFallback) {
        console.warn("Steam featured categories empty, using fallback.");
        warnedFeaturedFallback = true;
      }
      return loadFallbackCatalog();
    }

    cachedFeaturedIds = ids;
    cachedFeaturedExpiry = now + FEATURED_CACHE_TTL_MS;
    return ids;
  } catch (error) {
    if (!warnedFeaturedFallback) {
      console.warn("Steam featured categories fetch failed, using fallback.", error);
      warnedFeaturedFallback = true;
    }
    return loadFallbackCatalog();
  }
}

async function fetchAllAppIds() {
  const now = Date.now();

  if (cachedAllAppIds && cachedAllAppIdsExpiry > now) {
    return cachedAllAppIds;
  }

  try {
    const response = await fetch(
      "https://api.steampowered.com/ISteamApps/GetAppList/v0002/?format=json",
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.warn(
        `Steam app list request returned ${response.status}, falling back to bundled catalog.`,
      );
      return loadFallbackCatalog();
    }

    const json = (await response.json()) as {
      applist?: { apps?: { appid: number }[] };
    };

    const ids =
      json.applist?.apps?.map((app) => app.appid).filter(Boolean) ?? [];

    if (ids.length === 0) {
      console.warn("Steam app list returned no entries, using fallback.");
      return loadFallbackCatalog();
    }

    cachedAllAppIds = ids;
    cachedAllAppIdsExpiry = now + APP_LIST_CACHE_TTL_MS;
    return ids;
  } catch (error) {
    console.error("Steam app list fetch failed:", error);
    return loadFallbackCatalog();
  }
}

export async function fetchRandomSteamGame(excludeIds: number[] = []) {
  const [featuredIds, allIds] = await Promise.all([
    fetchFeaturedAppIds(),
    fetchAllAppIds(),
  ]);

  const excludeSet = new Set<number>([
    ...excludeIds.filter((id) => Number.isFinite(id)),
    ...recentHistory,
  ]);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_TOTAL_ATTEMPTS; attempt += 1) {
    const selection = selectPool(featuredIds, allIds, excludeSet);
    if (!selection || selection.pool.length === 0) break;
    const { pool, filtered } = selection;
    const appId = pool[Math.floor(Math.random() * pool.length)];
    if (typeof appId !== "number" || Number.isNaN(appId)) continue;
    if (filtered && excludeSet.has(appId)) continue;

    try {
      const game = await fetchSteamGame(appId);
      if (isEligibleGame(game)) {
        recentHistory.push(appId);
        if (recentHistory.length > RECENT_HISTORY_LIMIT) {
          recentHistory.shift();
        }
        excludeSet.add(appId);
        return game;
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Unknown Steam API error while fetching game");
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("No eligible Steam games available at the moment.");
}

function selectPool(
  featuredIds: number[],
  allIds: number[],
  exclude: Set<number>,
) {
  const candidatePools: Array<{ pool: number[]; filtered: boolean }> = [];

  if (allIds.length > 0) {
    const pool = filterIds(allIds, exclude);
    if (pool.length > 0) {
      candidatePools.push({ pool, filtered: true });
    }
  }

  if (featuredIds.length > 0) {
    const pool = filterIds(featuredIds, exclude);
    if (pool.length > 0) {
      candidatePools.push({ pool, filtered: true });
    }
  }

  if (candidatePools.length > 0) {
    return candidatePools[Math.floor(Math.random() * candidatePools.length)];
  }

  const fallbackPools: Array<{ pool: number[]; filtered: boolean }> = [];
  if (allIds.length > 0) fallbackPools.push({ pool: allIds, filtered: false });
  if (featuredIds.length > 0)
    fallbackPools.push({ pool: featuredIds, filtered: false });

  if (fallbackPools.length === 0) {
    return null;
  }

  return fallbackPools[Math.floor(Math.random() * fallbackPools.length)];
}

function filterIds(source: number[], exclude: Set<number>) {
  return source.filter((id) => !exclude.has(id));
}

function loadFallbackCatalog() {
  cachedAllAppIds = fallbackAppIds;
  cachedAllAppIdsExpiry = Date.now() + APP_LIST_CACHE_TTL_MS;
  return fallbackAppIds;
}

function isGameItem(item?: FeaturedItem) {
  if (!item) return false;
  if (!item.type) return true;
  if (typeof item.type !== "string") return true;
  return item.type.toLowerCase() === "game";
}

function isEligibleGame(game: SteamGame) {
  const isBaseGame = game.type.toLowerCase() === "game";
  const reviewCount = game.totalReviews ?? 0;
  return isBaseGame && reviewCount >= MIN_TOTAL_REVIEWS;
}
