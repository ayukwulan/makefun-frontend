[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/ayukwulan/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/ayukwulan/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# make.fun — Good ideas. Real rewards.

A small, thoughtfully spaced window into the make.fun builder community. Browse public bounties, read their briefs, follow live standings, and meet the makers. Vanilla JavaScript, system fonts, and static files; no framework or build step.

## Run locally

Use Node 22.18+ (native TypeScript support) or Node 24:

```sh
node serve.ts --port 8080
```

Open http://localhost:8080. The port defaults to 8080. Stop the server with Ctrl+C.

| Route | Surface |
| --- | --- |
| `#/` | Searchable board with category, state, and sorting controls |
| `#/bounty/tiny-chess-01` | Brief, rules, live reward split, and recent submissions |
| `#/bounty/tiny-chess-01/leaderboard` | API-defined columns and 50-row pagination |
| `#/u/eraerla` | Maker biography, competition record, wallet, and entries |

Leaderboard tabs preserve the API view in the hash query (`?view=performance`). Deadline timestamps decide whether bounties have ended. Amounts are USD and dates are UTC.

## Files

| File | Purpose |
| --- | --- |
| `app/index.html` | Accessible page shell and local module entry |
| `app/style.css` | Responsive layout, typography, and states |
| `app/main.js` | Routing, controls, and 30-second time updates |
| `app/api.js` | Public GET API, 60-second cache, ETags, request deduplication |
| `app/format.js` | Escaping, dates, amounts, and avatar URL handling |
| `app/views.js` | Initial board, loading, and error views |
| `app/pages.js`, `app/pages.css` | Lazily loaded detail surfaces and styling |
| `serve.ts` | Node standard-library local static server |
| `capture.mjs`, `shots.json` | Live Chromium captures and their route manifest |
| `main.ts` | Export app and screenshots; build the canonical dossier |
| `vendor/makefun-frontend.ts` | Unmodified make.fun dossier library |

The browser reads only `https://make.fun/api`. No authentication or write requests. Avatar URLs come from API data; images use anonymous CORS and lazy loading. Scripts and styles are local, and no fonts or dependencies are downloaded. Detail views load only when needed; filtering preserves the search field, and leaderboard pagination appends rows without fetching the full response again.

## Screenshots

With the server running on port 8080:

```sh
node capture.mjs
```

Add `--verify` to also exercise live filtering, mobile layouts, leaderboard pagination and view tabs, and profile navigation in Chromium.

The capture tool uses the installed Chromium and a local forwarding proxy for this VM’s egress connection. It waits for rendered live data, captures JPEGs at quality 82, and stops Chromium and the forwarding proxy on exit.

| Screenshot | Route | Size |
| --- | --- | --- |
| [Board](screenshots/1-board.jpg) | `#/` | 1280 × 800 |
| [Bounty](screenshots/2-bounty.jpg) | `#/bounty/tiny-chess-01` | 1280 × 800 |
| [Leaderboard](screenshots/3-leaderboard.jpg) | `#/bounty/tiny-chess-01/leaderboard` | 1280 × 800 |

## Package

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

This refreshes `out/app/`, `out/screenshots/`, and `out/dossier.json` using the entry kit’s caps. Without `MAKEFUN_OUTPUT_DIR`, the destination is `/output`. The package step reads local files and requires no network.
