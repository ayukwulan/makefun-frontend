[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/ayukwulan/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/ayukwulan/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# Frontend for make.fun

Submission to makefun-frontend-01, the make.fun bounty titled “Build the best make.fun frontend”.

Explore bounties, competition details, leaderboards, and maker profiles through four hash routes. The page uses vanilla JavaScript and public GET requests to `https://make.fun/api`. It requires no framework, build step, account, or write access.

## Run

```sh
node serve.ts --port 8080
```

Visit http://localhost:8080. All tooling runs on Node 22+ with its standard library. Omit `--port` to use the same default, or choose another local port.

To regenerate the board, bounty, and leaderboard images while the server runs on port 8080:

```sh
node capture.mjs
```

Create the delivery directory and dossier with:

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Without `MAKEFUN_OUTPUT_DIR`, the entrypoint writes to `/output`.

## Files

- `app/` holds the static HTML, stylesheet, and four JavaScript modules (`main.js`, `api.js`, `format.js`, and `views.js`). Data comes only from make.fun/api.
- `main.ts` exports the app and captured screenshots, then packages them into `dossier.json`.
- `screenshots/` contains three JPEGs at 1280×800: the board, a bounty, and its leaderboard.
- `vendor/makefun-frontend.ts` provides the make.fun dossier builder.
- `serve.ts` serves the app locally without extra dependencies.
- `capture.mjs` drives Chromium to record the routes defined in `shots.json`.
