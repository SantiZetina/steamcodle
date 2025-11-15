import Image from "next/image";

import type { SteamGame } from "@/lib/steam";

type SteamGameCardProps = {
  game: SteamGame;
};

export function SteamGameCard({ game }: SteamGameCardProps) {
  return (
    <article className="flex w-full max-w-md flex-col items-center gap-2 rounded-[24px] border-4 border-[#111b2b] bg-[#f4f7fb] p-2 text-center shadow-[6px_6px_0px_#050a12] sm:mx-auto sm:gap-4 sm:p-5">
      <div className="relative h-40 w-full overflow-hidden rounded-[18px] border-2 border-[#0f1b2b] bg-[#0c121c] sm:h-64 sm:rounded-[24px]">
        <Image
          src={game.headerImage}
          alt={game.name}
          fill
          sizes="(max-width: 640px) 92vw, 512px"
          className="object-cover"
          priority
        />
      </div>

      <h2 className="text-base font-semibold uppercase tracking-wide text-[#0f1b2b] sm:text-2xl">
        {game.name}
      </h2>

      {game.genres.length > 0 ? (
        <p className="text-[9px] uppercase tracking-[0.3em] text-[#0ea5e9] sm:text-xs">
          {game.genres.slice(0, 3).join(" • ")}
        </p>
      ) : (
        <p className="text-[9px] uppercase tracking-[0.3em] text-[#0ea5e9] sm:text-xs">
          Steam Featured
        </p>
      )}
    </article>
  );
}
