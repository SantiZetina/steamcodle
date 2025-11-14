import { SteamGameViewer } from "@/components/steam-game-viewer";

export default function Home() {
  return (
    <div className="min-h-dvh h-dvh bg-[#050a12] px-2 py-2 font-sans text-white sm:px-6 sm:py-6">
      <main className="mx-auto flex h-full w-full max-w-5xl flex-col items-center gap-2 overflow-hidden">
        <SteamGameViewer />
        <p className="text-center text-[10px] uppercase tracking-[0.4em] text-white/60">
          Steam data refreshes live from Valve&apos;s public APIs
        </p>
      </main>
    </div>
  );
}
