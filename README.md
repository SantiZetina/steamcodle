## Steamcodle

Steamcodle is a tiny guessing game modeled after Costcodle but fueled by live Steam Store data. Every round pulls a fresh featured game, hides the English review percentage, and gives you six chances to guess the score (0‑100). Get within four points and it’s a win. Otherwise the real percentage is revealed and the next title is queued up.

### Features

- Live data from Steam’s public store + review endpoints (no manual game list)
- Filtering for base games with at least 100 English reviews
- Numeric guessing with higher/lower hints and automatic win detection
- Local stats with streak tracking plus a three-games-per-day cap
- Optional dev mode (`NEXT_PUBLIC_DEV_MODE=true`) for unlimited rounds while building

### Running locally

```bash
npm install
npm run dev
# visit http://localhost:3000
```

Create a `.env.local` with `NEXT_PUBLIC_DEV_MODE=true` if you want unlimited rounds while testing. Leave it unset in production so the daily limit applies.

### Deploying

This is a standard Next.js 16 app. Build locally with `npm run build && npm start`, or deploy to any Next-compatible host (Vercel, Netlify, etc.). No extra environment variables are required unless you enable dev mode.
