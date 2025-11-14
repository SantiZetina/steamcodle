import { SteamGameViewer } from "@/components/steam-game-viewer";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#050a12] px-4 py-10 font-sans text-white sm:px-8">
      <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6">
        <SteamGameViewer />
        <p className="text-center text-xs uppercase tracking-[0.4em] text-white/60">
          Steam data refreshes live from Valve&apos;s public APIs
        </p>
      </main>
    </div>
  );
}
