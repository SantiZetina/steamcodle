import Image from "next/image";

import type { SteamGame } from "@/lib/steam";

type SteamGameCardProps = {
  game: SteamGame;
};

export function SteamGameCard({ game }: SteamGameCardProps) {
  return (
    <article className="flex flex-col items-center gap-3 rounded-[28px] border-4 border-[#111b2b] bg-[#f4f7fb] p-3 text-center shadow-[8px_8px_0px_#050a12] sm:gap-5 sm:p-6">
      <div className="relative h-40 w-full max-w-[220px] overflow-hidden rounded-[20px] border-2 border-[#0f1b2b] bg-[#0c121c] sm:h-64 sm:max-w-xs sm:rounded-[24px]">
        <Image
          src={game.headerImage}
          alt={game.name}
          fill
          sizes="(max-width: 640px) 90vw, 320px"
          className="object-cover"
          priority
        />
      </div>

      <h2 className="text-lg font-semibold uppercase tracking-wide text-[#0f1b2b] sm:text-2xl">
        {game.name}
      </h2>

      {game.genres.length > 0 ? (
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#0ea5e9] sm:text-xs">
          {game.genres.slice(0, 3).join(" • ")}
        </p>
      ) : (
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#0ea5e9] sm:text-xs">
          Steam Featured
        </p>
      )}
    </article>
  );
}
