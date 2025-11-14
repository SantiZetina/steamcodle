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
const MIN_TOTAL_REVIEWS = 100;
const MAX_RANDOM_ATTEMPTS = 8;

let cachedFeaturedIds: number[] | null = null;
let cachedFeaturedExpiry = 0;

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

  const response = await fetch(
    "https://store.steampowered.com/api/featuredcategories",
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load Steam featured categories (${response.status})`,
    );
  }

  const json = (await response.json()) as FeaturedCategoriesResponse;

  if (json.status !== 1) {
    throw new Error("Steam featured categories returned an error");
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
    throw new Error("No featured games available from Steam");
  }

  cachedFeaturedIds = ids;
  cachedFeaturedExpiry = now + FEATURED_CACHE_TTL_MS;
  return ids;
}

export async function fetchRandomSteamGame() {
  const ids = await fetchFeaturedAppIds();
  const pool = [...ids];
  let lastError: Error | null = null;

  for (
    let attempt = 0;
    attempt < Math.min(MAX_RANDOM_ATTEMPTS, pool.length);
    attempt += 1
  ) {
    const idx = Math.floor(Math.random() * pool.length);
    const [appId] = pool.splice(idx, 1);
    if (typeof appId !== "number") {
      continue;
    }

    try {
      const game = await fetchSteamGame(appId);
      if (isEligibleGame(game)) {
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
