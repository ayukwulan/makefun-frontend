[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/ayukwulan/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/ayukwulan/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# make.fun — keep the possibilities open

A warm, lightweight bounty explorer built with browser JavaScript and system fonts. The bounty board stays visible while a brief, leaderboard, or maker profile opens alongside it. All application data comes from public GET requests to `https://make.fun/api`.

## Run

Node 22.18 or newer is enough. No packages, compilation, or framework are required.

```sh
node serve.ts --port 8080
```

Open <http://localhost:8080>. Any static host can serve the contents of `app/`.

## One board, four routes

| Hash | Right pane |
| --- | --- |
| `#/` | An introduction and a link to a first bounty |
| `#/bounty/<slug>` | Brief, rules, live reward breakdown, dates, and eight recent entries |
| `#/bounty/<slug>/leaderboard` | API-defined metrics, prize badges, scoring views, and a 50-row window |
| `#/u/<handle>` | Maker bio, public links, wallet, record, and entries |

Leaderboard scoring views use `?view=<name>` inside the hash. Browser back/forward and direct links work. At widths below 900px, the board sits above the selected view. Search, category chips, state, sort chips, and board scroll remain available through every route. Status and countdowns use deadlines, including records the API still labels open after their deadline.

## Tiny first load

`app/index.html` is a **599-byte loading shell** with critical background/header/shimmer CSS, including reduced-motion support. A literal dynamic import of `main.js` runs after two animation frames. The lazy entry loads `style.css`; the shell has no stylesheet link or external module script. Full code loads only after the shell can paint.

The board is mounted once. Keyed DOM reconciliation updates changed text and attributes instead of rebuilding lists on refresh. A 60-second memory cache preserves response bodies and ETags, revalidates with `If-None-Match`, accepts 304 responses, and deduplicates concurrent reads. Countdown nodes tick every 30 seconds; visible data refreshes every minute. The request counters show actual network reads. A leaderboard window holds at most 50 rows, including after “Show 50 more.”

If a conditional response is blocked by CORS, the cache retries a regular GET of the same API URL. Matching ETags retain the existing body, and the counter includes the retry. Profiles accept both plain handles and the API's structured social and avatar fields.

## Files

| File | Purpose |
| --- | --- |
| `app/index.html` | Small shell and delayed entry import |
| `app/main.js` | Persistent workspace, route coordination, refresh, and event listeners |
| `app/views.js` | Board controls, keyed patching, and right-pane views |
| `app/api.js` | Public API, cache, ETags, and request counts |
| `app/format.js` | Dates, pots, deadline status, escaping, and safe links |
| `app/style.css` | Warm paper theme, split panes, mobile stack, and accessibility |
| `serve.ts` | Static development server using Node's standard library |
| `capture.mjs` / `shots.json` | Live Chromium capture and screenshot routes |
| `main.ts` | Package `app/`, `screenshots/`, and the vendored dossier |
| `vendor/makefun-frontend.ts` | Unchanged make.fun dossier library |

## Screenshots and packaging

With the server running, capture the real API-backed views:

```sh
node capture.mjs
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

`node capture.mjs --verify` also checks persistent board nodes and scroll, search/filter/sort controls, 50-row paging, scoring tabs, profiles, cached navigation, mobile stacking, and reduced motion against the running app.

The capture driver uses headless Chromium and CDP, waits for `window.__shotReady`, and rejects route failures. This VM's forwarding proxy rewrites CONNECT headers for its egress proxy; it is used only during capture. Each JPEG is 1280×800 at quality 82 and must fit within 256 KiB. `main.ts` defaults to `/output` when `MAKEFUN_OUTPUT_DIR` is absent and uses the kit's dossier caps.

| Capture | Surface |
| --- | --- |
| [1-board.jpg](screenshots/1-board.jpg) | Board beside the selected chess bounty (cover) |
| [2-bounty.jpg](screenshots/2-bounty.jpg) | Rewards and chess brief beside the board |
| [3-leaderboard.jpg](screenshots/3-leaderboard.jpg) | Chess standings beside the board |

Skip links, visible keyboard focus, reduced-motion support, horizontal table scrolling, polite loading announcements, and lazy anonymous-CORS avatars are included. There is no sign-in or write action. LICENSE is MIT.
