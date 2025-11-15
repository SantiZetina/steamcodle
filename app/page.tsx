import { SteamGameViewer } from "@/components/steam-game-viewer";

export default function Home() {
  return (
    <div className="min-h-dvh bg-[#050a12] px-2 py-4 font-sans text-white sm:px-6 sm:py-6">
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center gap-4">
        <SteamGameViewer />
        <p className="text-center text-[10px] uppercase tracking-[0.4em] text-white/60 sm:text-xs">
          Steam data refreshes live from Valve&apos;s public APIs
        </p>
      </main>
    </div>
  );
}
