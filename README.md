[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/ayukwulan/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/ayukwulan/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# Frontend for make.fun

Entry for make.fun bounty makefun-frontend-01 ("Build the best make.fun frontend").

A vanilla JS frontend for make.fun: bounty board, bounty page, leaderboard, and public profile, with hash routes. It reads only `https://make.fun/api` GET endpoints — no other network.

## Run

```sh
node serve.ts --port 8091
```

Then open http://localhost:8091. Node 22+, standard library only.

## Files

- `main.ts` — entrypoint: builds the dossier and screenshots
- `app/` — the static page (index.html, main.js, api.js, views.js, format.js, style.css), no network except make.fun/api
- `screenshots/` — board, bounty, leaderboard views (1280x800)
- `vendor/makefun-frontend.ts` — make.fun's dossier library
- `serve.ts` — local dev server
- `capture.mjs` — screenshot capture
