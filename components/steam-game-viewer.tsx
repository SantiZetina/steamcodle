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

const MAX_GUESSES = 6;
const WIN_THRESHOLD = 4; // percentage points difference allowed
const DAILY_GAME_LIMIT = 3;
const STORAGE_KEY = "steamcodleStats";

type StatsSnapshot = {
  totalGuesses: number;
  correctGames: number;
  incorrectGames: number;
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string;
  gamesPlayedToday: number;
};

const getToday = () => new Date().toISOString().slice(0, 10);

const getDefaultStats = (): StatsSnapshot => ({
  totalGuesses: 0,
  correctGames: 0,
  incorrectGames: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastPlayedDate: getToday(),
  gamesPlayedToday: 0,
});

function normalizeStats(stats: StatsSnapshot): StatsSnapshot {
  const today = getToday();
  if (stats.lastPlayedDate === today) {
    return stats;
  }

  return {
    ...stats,
    lastPlayedDate: today,
    gamesPlayedToday: 0,
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
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StatsSnapshot;
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

  const dailyLimitReached =
    !isDevMode && stats.gamesPlayedToday >= DAILY_GAME_LIMIT;

  const fetchGame = useCallback(async () => {
    if (!statsLoaded) return;
    if (dailyLimitReached) {
      setState((prev) => ({
        status: "error",
        game: prev.game,
        message: "Daily limit reached. Come back tomorrow.",
      }));
      return;
    }

    setState((prev) => ({
      status: "loading",
      game: prev.game,
    }));

    try {
      const response = await fetch("/api/game", {
        method: "GET",
        cache: "no-store",
      });

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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to fetch game";
      setState((prev) => ({
        status: "error",
        game: prev.game,
        message,
      }));
    }
  }, [dailyLimitReached, statsLoaded]);

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
        const sameDay = normalized.lastPlayedDate === today;
        const updated: StatsSnapshot = {
          ...normalized,
          lastPlayedDate: today,
          gamesPlayedToday: sameDay
            ? normalized.gamesPlayedToday + 1
            : 1,
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
    if (dailyLimitReached && !state.game) {
      return "Daily limit reached. Come back tomorrow.";
    }
    if (didWin) return "Nice! You nailed the English review percentage.";
    if (guesses.length >= MAX_GUESSES) {
      return "Out of guesses. Hit New Game to try another title.";
    }
    if (dailyLimitReached && gameResolved) {
      return "Daily limit reached. Come back tomorrow.";
    }
    return "Guess the English Steam review % (0 — 100).";
  }, [state, didWin, guesses.length, dailyLimitReached, gameResolved]);

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
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-[32px] border-4 border-[#050a12] bg-[#cfd5e0] p-6 text-[#0b1420] shadow-[18px_18px_0_#050a12]">
      <header className="relative flex items-center justify-between border-b-4 border-[#050a12] pb-4">
        <div className="flex items-center gap-3 text-2xl font-black tracking-widest text-[#0ea5e9]">
          <span className="text-[#facc15]">?</span>
          STEAMCODLE
        </div>
        <button
          type="button"
          aria-label="Toggle stats"
          onClick={() => setShowStats((prev) => !prev)}
          className="rounded-2xl border-2 border-[#050a12] bg-[#0f172a] px-3 py-2 text-white transition hover:bg-[#1d283a]"
        >
          <div className="flex items-center gap-2">
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

      <div className="text-center">
        <p className="text-lg font-semibold">Review Guess: {guessCounterLabel}</p>
        {revealAnswer ? (
          <p className="text-sm font-bold text-[#0ea5e9]">
            Actual: {actualScore}%
          </p>
        ) : (
          <p className="text-sm text-[#4b5563]">
            Target: Steam English review percentage
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {Array.from({ length: MAX_GUESSES }).map((_, index) => {
          const guess = guesses[index];
          const trend = getTrendIcon(guess, actualScore);
          return (
            <li
              key={index}
              className="flex items-center justify-between rounded-full border-2 border-[#050a12] bg-[#7c8899] px-4 py-2 text-lg font-black tracking-wide text-white"
            >
              <span>{typeof guess === "number" ? `${guess}%` : "\u00A0"}</span>
              <span className="text-xl font-semibold">{trend}</span>
            </li>
          );
        })}
      </ul>

      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={handleSubmitGuess}
      >
        <label className="flex flex-1 items-center rounded-full border-2 border-[#050a12] bg-white px-4 py-2 text-sm text-[#0b1420]">
          <span className="mr-2 text-[#0ea5e9]">★</span>
          <input
            type="text"
            className="w-full bg-transparent text-base font-semibold uppercase tracking-wide text-[#0b1420] placeholder:text-[#94a3b8] focus:outline-none"
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
          className="rounded-full border-2 border-[#050a12] bg-[#0ea5e9] px-6 py-2 text-sm font-black uppercase tracking-widest text-white transition hover:bg-[#0284c7] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Submit
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t-4 border-[#050a12] pt-4 text-xs font-semibold uppercase tracking-[0.4em] text-[#4b5563]">
        <button
          type="button"
          onClick={handleNewGame}
          className="rounded-full border-2 border-[#050a12] bg-[#0f172a] px-4 py-2 text-white transition hover:bg-[#1d283a] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={state.status === "loading" || dailyLimitReached}
        >
          {didWin || gameResolved ? "New Game" : "Skip"}
        </button>
        <span className="text-[#0b1420]">Community Score Challenge</span>
      </div>

      <p className="text-center text-sm text-[#0f172a]">{statusLabel}</p>
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
    <div className="h-72 w-full max-w-xs animate-pulse rounded-[32px] border-4 border-dashed border-[#7c8899] bg-[#e2e8f0]" />
  );
}

function getTrendIcon(guess?: number, actual?: number | null) {
  if (typeof guess !== "number" || typeof actual !== "number") {
    return "";
  }

  if (Math.abs(guess - actual) <= WIN_THRESHOLD) {
    return "";
  }

  return guess > actual ? "▼" : "▲";
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
            Games Today
          </dt>
          <dd className="font-bold text-[#0b1420]">
            {isDevMode
              ? `${stats.gamesPlayedToday} (dev)`
              : `${Math.min(stats.gamesPlayedToday, DAILY_GAME_LIMIT)}/${DAILY_GAME_LIMIT}`}
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
