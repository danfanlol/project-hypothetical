# Review Feature

See `review.md` for the full reference.

# Opening Auto-Classification — Progress

## What it does

As moves are added to a line in the editor (`/lines/<id>`), the label at the top-left auto-updates to the matched opening name for the current position — whether or not the line was given a manual name at creation. If the current position isn't in the opening database (e.g. before the first book move, or an offbeat line), whatever label is already there is left untouched.

## Data source

Seeded from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (public domain, ~3,700 entries: ECO code, name, move list) via `prisma/seed-openings.mjs`. Fetches the 5 TSV files (`a.tsv`–`e.tsv`) through jsdelivr's GitHub mirror (raw.githubusercontent.com rate-limits repeated fetches), replays each with chess.js to get the FEN, and upserts into the `Opening` table (`fenKey` = first 4 space-separated FEN fields, so halfmove/fullmove counters don't block a match).

Opening names are NOT standardized past the ECO code — chess.com, lichess, and other sources label variations differently for the same position. This is expected; there's no dataset that reconciles them, and chess.com does not expose an opening database via their public API.

## Files

| File | Role |
|---|---|
| `prisma/seed-openings.mjs` | One-time/rerunnable seed script for the `Opening` table |
| `src/app/api/openings/route.ts` | `GET ?fen=` → looks up `Opening` by `fenKey`, auth-guarded |
| `src/lib/types.ts` | `OpeningData` type |
| `src/app/lines/[id]/page.tsx` | Opening-lookup effect (~line 177) fires on every `currentFen` change, overwrites `label` when a match is found |

## ⚠️ Dev and production use separate Neon databases

`prisma/schema.prisma` changes are **not** applied automatically on deploy — `package.json`'s `build` script is just `prisma generate && next build`, no `prisma db push` / `migrate deploy` step. Local `.env` points to a dev-only Neon database; production's `DATABASE_URL` (set in Vercel) points to a different one.

Whenever `schema.prisma` changes (like adding the `Opening` model), or the seed data needs updating, run against **both** databases by hand:

```
npx prisma db push                                    # against whichever DATABASE_URL is active
node prisma/seed-openings.mjs
```

For production, override `DATABASE_URL` inline for just that command rather than editing `.env`:

```
DATABASE_URL="<production connection string>" npx prisma db push
DATABASE_URL="<production connection string>" node prisma/seed-openings.mjs
```

Get the production connection string from the Neon dashboard → production branch → Primary compute → "Connect" (use the pooled `-pooler` variant to match local).

Note: running `db push` while a long-lived process (`next dev`, or a warm Vercel lambda) already holds pooled DB connections open can cause transient 500s from stale prepared-statement state (Neon's PgBouncer pooling). Restarting `next dev` locally, or a fresh deploy / waiting for lambda recycle in production, clears it.
