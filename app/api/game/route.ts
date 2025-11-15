import { NextResponse } from "next/server";

import { fetchRandomSteamGame } from "@/lib/steam";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const excludeParam = url.searchParams.get("exclude");
    const excludeIds =
      excludeParam
        ?.split(",")
        .map((value) => Number(value))
        .filter((num) => Number.isFinite(num)) ?? [];

    const game = await fetchRandomSteamGame(excludeIds);
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
