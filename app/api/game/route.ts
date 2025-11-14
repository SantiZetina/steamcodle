import { NextResponse } from "next/server";

import { fetchRandomSteamGame } from "@/lib/steam";

export async function GET() {
  try {
    const game = await fetchRandomSteamGame();
    return NextResponse.json(game, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Steam API error";
    return NextResponse.json(
      { error: message },
      {
        status: 502,
      },
    );
  }
}
