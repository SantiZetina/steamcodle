import Image from "next/image";

import type { SteamGame } from "@/lib/steam";

type SteamGameCardProps = {
  game: SteamGame;
};

export function SteamGameCard({ game }: SteamGameCardProps) {
  return (
    <article className="flex flex-col items-center gap-6 rounded-[32px] border-4 border-[#111b2b] bg-[#f4f7fb] p-6 text-center shadow-[8px_8px_0px_#050a12]">
      <div className="relative h-64 w-full max-w-xs overflow-hidden rounded-[24px] border-2 border-[#0f1b2b] bg-[#0c121c]">
        <Image
          src={game.headerImage}
          alt={game.name}
          fill
          sizes="(max-width: 640px) 90vw, 320px"
          className="object-cover"
          priority
        />
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-[#4f91c6]">
          App #{game.appId}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[#0f1b2b]">
          {game.name}
        </h2>
      </div>

      <p className="text-sm leading-relaxed text-[#445266]">
        {game.shortDescription}
      </p>

      {game.genres.length > 0 ? (
        <p className="text-xs uppercase tracking-[0.3em] text-[#0ea5e9]">
          {game.genres.slice(0, 3).join(" • ")}
        </p>
      ) : (
        <p className="text-xs uppercase tracking-[0.3em] text-[#0ea5e9]">
          Steam Featured
        </p>
      )}
    </article>
  );
}
