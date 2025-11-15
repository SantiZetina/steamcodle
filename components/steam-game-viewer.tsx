"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import type { SteamGame } from "@/lib/steam";

import { SteamGameCard } from "./steam-game-card";

const MAX_GUESSES = 5;
const WIN_THRESHOLD = 2; // percentage points difference allowed
const DAILY_LOSS_LIMIT = 3;
const STORAGE_KEY = "steamcodleStats";
const RECENT_APPS_KEY = "steamcodleRecentAppIds";
const RECENT_APPS_LIMIT = 25;

type StatsSnapshot = {
  totalGuesses: number;
  correctGames: number;
  incorrectGames: number;
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string;
  lossesToday: number;
};

const getToday = () => new Date().toISOString().slice(0, 10);

const getDefaultStats = (): StatsSnapshot => ({
  totalGuesses: 0,
  correctGames: 0,
  incorrectGames: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastPlayedDate: getToday(),
  lossesToday: 0,
});

function normalizeStats(stats: StatsSnapshot): StatsSnapshot {
  const today = getToday();
  const currentLosses =
    typeof stats.lossesToday === "number" && Number.isFinite(stats.lossesToday)
      ? stats.lossesToday
      : 0;
  if (stats.lastPlayedDate === today) {
    return { ...stats, lossesToday: currentLosses };
  }

  return {
    ...stats,
    lastPlayedDate: today,
    lossesToday: 0,
  };
}

type SteamGameState =
  | { status: "idle"; game: SteamGame }
  | { status: "loading"; game: SteamGame | null }
  | { status: "error"; game: SteamGame | null; message: string };

export function SteamGameViewer() {
  const [state, setState] = useState<SteamGameState>({
    status: "loading",
    game: null,
  });
  const [guesses, setGuesses] = useState<number[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [didWin, setDidWin] = useState(false);
  const [gameResolved, setGameResolved] = useState(false);
  const gameResolvedRef = useRef(false);
  const [stats, setStats] = useState<StatsSnapshot>(() => getDefaultStats());
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [recentAppIds, setRecentAppIds] = useState<number[]>([]);
  const recentAppIdsRef = useRef<number[]>([]);
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StatsSnapshot & {
          gamesPlayedToday?: number;
        };
        if (
          typeof parsed.lossesToday !== "number" &&
          typeof parsed.gamesPlayedToday === "number"
        ) {
          parsed.lossesToday = parsed.gamesPlayedToday;
          delete parsed.gamesPlayedToday;
        }
        setStats(normalizeStats(parsed));
      }
    } catch {
      setStats(getDefaultStats());
    } finally {
      setStatsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!statsLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  }, [stats, statsLoaded]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(RECENT_APPS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as number[];
        setRecentAppIds(parsed.filter((id) => Number.isFinite(id)));
      }
    } catch {
      setRecentAppIds([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        RECENT_APPS_KEY,
        JSON.stringify(recentAppIds),
      );
    }
    recentAppIdsRef.current = recentAppIds;
  }, [recentAppIds]);

  const dailyLossLimitReached =
    !isDevMode && stats.lossesToday >= DAILY_LOSS_LIMIT;

  const fetchGame = useCallback(async () => {
    if (!statsLoaded) return;
    if (dailyLossLimitReached) {
      setState((prev) => ({
        status: "error",
        game: prev.game,
        message: "Daily loss limit reached. Come back tomorrow.",
      }));
      return;
    }

    setState((prev) => ({
      status: "loading",
      game: prev.game,
    }));

    try {
      const params = new URLSearchParams();
      const excludeList = recentAppIdsRef.current;
      if (excludeList.length > 0) {
        params.set("exclude", excludeList.slice(0, 15).join(","));
      }
      const response = await fetch(
        params.toString() ? `/api/game?${params.toString()}` : "/api/game",
        {
        method: "GET",
        cache: "no-store",
        },
      );

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          details?.error ??
            `Steam API returned an error (status ${response.status})`,
        );
      }

      const game = (await response.json()) as SteamGame;
      setState({ status: "idle", game });
      setGuesses([]);
      setCurrentGuess("");
      setDidWin(false);
      setGameResolved(false);
      gameResolvedRef.current = false;
      setRecentAppIds((prev) => {
        const filtered = prev.filter((id) => id !== game.appId);
        const next = [game.appId, ...filtered].slice(0, RECENT_APPS_LIMIT);
        recentAppIdsRef.current = next;
        return next;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to fetch game";
      setState((prev) => ({
        status: "error",
        game: prev.game,
        message,
      }));
    }
  }, [dailyLossLimitReached, statsLoaded]);

  useEffect(() => {
    if (!statsLoaded) return;
    fetchGame();
  }, [fetchGame, statsLoaded]);

  const trimmedGuess = currentGuess.trim();
  const numericGuess = Number(trimmedGuess);
  const guessIsNumber =
    trimmedGuess.length > 0 &&
    Number.isFinite(numericGuess) &&
    numericGuess >= 0 &&
    numericGuess <= 100;

  const canSubmitGuess =
    state.status === "idle" &&
    Boolean(state.game) &&
    guesses.length < MAX_GUESSES &&
    !gameResolved &&
    !didWin &&
    guessIsNumber;

  const finalizeGame = useCallback(
    (result: "win" | "loss") => {
      if (gameResolvedRef.current) return;
      gameResolvedRef.current = true;
      setGameResolved(true);

      setStats((prev) => {
        const normalized = normalizeStats(prev);
        const today = getToday();
        const updated: StatsSnapshot = {
          ...normalized,
          lastPlayedDate: today,
          lossesToday:
            result === "loss"
              ? normalized.lossesToday + 1
              : normalized.lossesToday,
        };

        if (result === "win") {
          updated.correctGames += 1;
          updated.currentStreak += 1;
          updated.bestStreak = Math.max(
            updated.bestStreak,
            updated.currentStreak,
          );
        } else {
          updated.incorrectGames += 1;
          updated.currentStreak = 0;
        }

        return updated;
      });
    },
    [],
  );

  const handleSubmitGuess = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitGuess) return;
    const value = Number(currentGuess.trim());

    setStats((prev) => {
      const normalized = normalizeStats(prev);
      return {
        ...normalized,
        totalGuesses: normalized.totalGuesses + 1,
      };
    });

    const reviewScore = state.game?.reviewScore;
    const nextGuesses = [...guesses, value];
    setGuesses(nextGuesses);

    if (typeof reviewScore === "number") {
      const diff = Math.abs(value - reviewScore);
      if (diff <= WIN_THRESHOLD) {
        setDidWin(true);
        finalizeGame("win");
      } else if (nextGuesses.length >= MAX_GUESSES) {
        finalizeGame("loss");
      }
    } else if (nextGuesses.length >= MAX_GUESSES) {
      finalizeGame("loss");
    }

    setCurrentGuess("");
  };

  const guessCounterLabel = useMemo(() => {
    const current = Math.min(
      didWin ? guesses.length : guesses.length + 1,
      MAX_GUESSES,
    );
    return `${current}/${MAX_GUESSES}`;
  }, [didWin, guesses.length]);

  const statusLabel = useMemo(() => {
    if (state.status === "loading") return "Booting Steam servers…";
    if (state.status === "error") return state.message;
    if (dailyLossLimitReached) {
      return "Daily loss limit reached. Come back tomorrow.";
    }
    if (didWin) return "Nice! You nailed the English review percentage.";
    if (guesses.length >= MAX_GUESSES) {
      return "Out of guesses. Hit New Game to try another title.";
    }
    return "Guess the English Steam review % (0 — 100).";
  }, [state, didWin, guesses.length, dailyLossLimitReached]);

  const actualScore = state.game?.reviewScore ?? null;
  const revealAnswer = gameResolved && actualScore !== null;

  const handleNewGame = () => {
    if (!statsLoaded) return;
    if (state.status === "idle" && state.game && !gameResolved) {
      finalizeGame("loss");
    }
    fetchGame();
  };

  return (
    <section className="mx-auto flex w-full max-w-[420px] flex-col gap-2 bg-[#cfd5e0] p-2 text-xs text-[#0b1420] sm:max-w-2xl sm:rounded-[32px] sm:border-4 sm:border-[#050a12] sm:p-6 sm:text-base sm:shadow-[18px_18px_0_#050a12]">
      <header className="relative flex items-center justify-between border-b-2 border-[#050a12] pb-2 sm:border-b-4 sm:pb-3">
        <div className="flex items-center gap-1 text-lg font-black tracking-widest text-[#0ea5e9] sm:gap-2 sm:text-2xl">
          <span className="text-[#facc15]">?</span>
          STEAMCODLE
        </div>
        <button
          type="button"
          aria-label="Toggle stats"
          onClick={() => setShowStats((prev) => !prev)}
          className="rounded-2xl border-2 border-[#050a12] bg-[#0f172a] px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-[#1d283a] sm:text-xs"
        >
          <div className="flex items-center gap-1 sm:gap-2">
            <SignalDot filled />
            <SignalDot filled />
            <SignalDot filled={state.status === "idle"} />
          </div>
        </button>
        {showStats ? (
          <StatsPanel
            stats={stats}
            isDevMode={isDevMode}
            onClose={() => setShowStats(false)}
          />
        ) : null}
      </header>

      <div className="flex justify-center">
        {state.game ? <SteamGameCard game={state.game} /> : <CardPlaceholder />}
      </div>

      <div className="flex-shrink-0 text-center">
        <p className="text-sm font-semibold sm:text-lg">
          Review Guess: {guessCounterLabel}
        </p>
        {revealAnswer ? (
          <p className="text-[11px] font-bold text-[#0ea5e9] sm:text-sm">
            Actual: {actualScore}%
          </p>
        ) : (
          <p className="text-[11px] text-[#4b5563] sm:text-sm">
            Hit within ±2% of the English Steam score
          </p>
        )}
      </div>

      <ul className="flex w-full max-w-md flex-shrink-0 flex-col gap-2 self-center sm:max-w-lg">
        {Array.from({ length: MAX_GUESSES }).map((_, index) => {
          const guess = guesses[index];
          const { trend, tone } = getTrendData(guess, actualScore);
          return (
            <li
              key={index}
              className={`flex items-center justify-between rounded-full border-2 border-[#050a12] px-3 py-1 text-sm font-black tracking-wide text-white transition sm:px-4 sm:py-2 sm:text-lg ${tone.bg}`}
            >
              <span className={`${tone.text} transition`}>{typeof guess === "number" ? `${guess}%` : "\u00A0"}</span>
              <span className={`text-base font-semibold sm:text-xl ${tone.text}`}>{trend}</span>
            </li>
          );
        })}
      </ul>

      <form
        className="flex w-full max-w-md flex-shrink-0 flex-wrap items-center gap-3 self-center sm:max-w-lg"
        onSubmit={handleSubmitGuess}
      >
        <label className="flex flex-1 items-center rounded-full border-2 border-[#050a12] bg-white px-3 py-1.5 text-[11px] text-[#0b1420] sm:py-2 sm:text-sm">
          <span className="mr-2 text-[#0ea5e9]">★</span>
          <input
            type="text"
            className="w-full bg-transparent text-base font-semibold uppercase tracking-wide text-[#0b1420] placeholder:text-[#94a3b8] focus:outline-none sm:text-lg"
            placeholder="Enter a % from 0-100"
            value={currentGuess}
            onChange={(event) => setCurrentGuess(event.target.value)}
            disabled={
              guesses.length >= MAX_GUESSES ||
              state.status !== "idle" ||
              didWin
            }
          />
        </label>
        <button
          type="submit"
          disabled={!canSubmitGuess}
          className="rounded-full border-2 border-[#050a12] bg-[#0ea5e9] px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white transition hover:bg-[#0284c7] disabled:cursor-not-allowed disabled:opacity-60 sm:px-6 sm:text-sm"
        >
          Submit
        </button>
      </form>

      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t-2 border-[#050a12] pt-2 text-[9px] font-semibold uppercase tracking-[0.4em] text-[#4b5563] sm:border-t-4 sm:pt-3 sm:text-xs">
        <button
          type="button"
          onClick={handleNewGame}
          className="rounded-full border-2 border-[#050a12] bg-[#0f172a] px-4 py-2 text-xs text-white transition hover:bg-[#1d283a] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          disabled={state.status === "loading" || dailyLossLimitReached}
        >
          {didWin || gameResolved ? "New Game" : "Skip"}
        </button>
        <span className="text-[#0b1420]">Community Score Challenge</span>
      </div>

      <p className="text-center text-[11px] text-[#0f172a] sm:text-sm">
        {statusLabel}
      </p>
    </section>
  );
}

function SignalDot({ filled }: { filled: boolean }) {
  return (
    <span
      className={`h-2 w-6 rounded-[8px] border-2 border-[#050a12] ${
        filled ? "bg-[#0ea5e9]" : "bg-transparent"
      }`}
    />
  );
}

function CardPlaceholder() {
  return (
    <div className="h-32 w-full max-w-[200px] animate-pulse rounded-[24px] border-4 border-dashed border-[#7c8899] bg-[#e2e8f0] sm:h-64 sm:max-w-xs sm:rounded-[32px]" />
  );
}

function getTrendData(guess?: number, actual?: number | null) {
  if (typeof guess !== "number" || typeof actual !== "number") {
    return {
      trend: "",
      tone: { bg: "bg-[#7c8899]", text: "text-white" },
    };
  }

  if (Math.abs(guess - actual) <= WIN_THRESHOLD) {
    return {
      trend: "✔",
      tone: {
        bg: "bg-emerald-600 animate-pulse",
        text: "text-white",
      },
    };
  }

  if (guess > actual) {
    return {
      trend: "▼",
      tone: {
        bg: "bg-amber-500/80",
        text: "text-[#0b1420]",
      },
    };
  }

  return {
    trend: "▲",
    tone: {
      bg: "bg-rose-600/80",
      text: "text-white",
    },
  };
}

type StatsPanelProps = {
  stats: StatsSnapshot;
  isDevMode: boolean;
  onClose: () => void;
};

function StatsPanel({ stats, isDevMode, onClose }: StatsPanelProps) {
  return (
    <div className="absolute right-0 top-full z-20 mt-3 w-64 rounded-2xl border-2 border-[#050a12] bg-white p-4 text-sm text-[#0b1420] shadow-[12px_12px_0_#050a12]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-[0.3em] text-[#0ea5e9]">
          {isDevMode ? "Stats · Dev" : "Stats"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold uppercase text-[#475569] hover:text-[#0b1420]"
        >
          Close
        </button>
      </div>
      <dl className="space-y-2">
        <div className="flex items-center justify-between">
          <dt className="text-[11px] uppercase tracking-[0.2em] text-[#94a3b8]">
            Losses Today
          </dt>
          <dd className="font-bold text-[#0b1420]">
            {isDevMode
              ? `${stats.lossesToday} (dev)`
              : `${Math.min(stats.lossesToday, DAILY_LOSS_LIMIT)}/${DAILY_LOSS_LIMIT}`}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-[11px] uppercase tracking-[0.2em] text-[#94a3b8]">
            Total Guesses
          </dt>
          <dd className="font-bold text-[#0b1420]">{stats.totalGuesses}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-[11px] uppercase tracking-[0.2em] text-[#94a3b8]">
            Correct
          </dt>
          <dd className="font-bold text-emerald-600">{stats.correctGames}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-[11px] uppercase tracking-[0.2em] text-[#94a3b8]">
            Incorrect
          </dt>
          <dd className="font-bold text-rose-600">{stats.incorrectGames}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-[11px] uppercase tracking-[0.2em] text-[#94a3b8]">
            Current Streak
          </dt>
          <dd className="font-bold text-[#0b1420]">{stats.currentStreak}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-[11px] uppercase tracking-[0.2em] text-[#94a3b8]">
            Best Streak
          </dt>
          <dd className="font-bold text-[#0b1420]">{stats.bestStreak}</dd>
        </div>
      </dl>
    </div>
  );
}
