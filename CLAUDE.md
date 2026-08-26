# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LIFE,FIT web — a Flask server + static frontend that recommends a Seoul 행정동 (administrative
neighborhood, one of 427) based on a user's lifestyle preferences. This repo owns **only** the
UI and HTTP layer. All recommendation logic and LLM calls live in a sibling repository,
`life-fit-embed`, which this repo imports directly via `sys.path` (not pip-installed).

## Required folder layout

This repo must sit next to `life-fit-embed`:

```
Life_Fit/
├── life-fit-embed/   # recommendation engine (DB, LLM, pipeline) — separate repo
└── life-fit-web/     # this repo
```

`services/engine.py` inserts `../life-fit-embed` onto `sys.path` and imports
`app.features.pipeline_api.{search, recommend_by_weights}` and `app.core.db.{facilities, facility_counts}`
from it. If `life-fit-embed` is missing or misnamed, the server fails at import time with
`ModuleNotFoundError: No module named 'app'`. `life-fit-embed` also needs its own `.env` with
`ANTHROPIC_API_KEY` and a `data/life.db` (~216MB, not in git) — see that repo's README.

## Running

```bash
py -m pip install flask flask-cors pandas numpy
py main.py
```

Serves at `http://127.0.0.1:5000`. No test suite, linter, or build step exists in this repo —
each `services/*.py` file has an `if __name__ == "__main__":` smoke check instead; run them
directly (e.g. `py services/coords.py`, `py services/engine.py`, `py services/floorplan.py`) to
sanity-check that module in isolation.

The Kakao Maps JS key is embedded in `frontend/index.html`. The Kakao Developers console must
have `http://127.0.0.1:5000` registered under Web platform or the map silently fails to render.

## Architecture

**Request flow:** `frontend/*.js` → `POST /api/predict` or `/api/region` on the Flask app
(`main.py`) → `services/engine.py` calls into the sibling `life-fit-embed` package → response is
reshaped and returned as JSON → frontend renders map pins / cards.

- `main.py` — Flask app setup, static file serving (frontend + `data/LH평면도` images), and the
  two API routes. Route handlers do the input/output shaping; they delegate all real work to
  `services/`.
- `services/engine.py` — **the only file that knows about `life-fit-embed`.** Swapping in a
  different recommendation engine means changing the two import lines here only (see "Pluggable
  engine contract" below). Also owns the Korean⇄English key mapping for the 7 lifestyle metrics.
- `services/coords.py` — loads `data/동_좌표.csv` (427 rows) into an in-memory `(구, 동) → (lat,
  lng)` dict once at import time; `lookup_coords` reads from it. Uses `csv`, not pandas.
- `services/floorplan.py` — loads the LH floorplan CSV (cp949-encoded) with pandas at import
  time. `find_floorplan(area)` picks the closest-area floorplan *that actually has an image
  file on disk* — the CSV has 227 rows but only 66 have corresponding image folders, so it
  walks candidates sorted by area difference until one resolves to an existing path.
- `frontend/` — no build step, no framework. `index.html`/`search.css`/`search.js` are the
  initial search screen (floating clickable keywords, natural-language query box);
  `style.css`/`script.js` are the results screen (Kakao map, ranked list, recommendation-reason
  card per pin).

### API contract

- `POST /api/predict` — body is either `{ query: "..." }` (LLM turns text into the 7 metric
  weights) or slider values under the English keys `greenery, safety, transport, commercial,
  medical, education, culture` (used as weights directly). Both paths converge in
  `services.engine.get_regions` and return the same shape: score, `topRegions` (with coords
  attached), `floorplanPath`, `explanation`, and `weights` (so the frontend can sync sliders back).
- `POST /api/region` — body `{ gu, dong }`, returns nearby facility counts/items for the modal
  shown when a map pin is clicked. Deliberately separate from `/api/predict` so clicking a pin
  doesn't recompute scores for all 427 동.

### Pluggable engine contract

Any engine can replace `life-fit-embed` as long as it exposes two functions with these exact
return shapes (see README.md for full detail and a self-check snippet):

- `search(query, top_k=5)` → `{"weights": {<7 Korean metric names>: 1-5 float}, "regions": [{"name": "구 행정동명", "total": float, "scores": {<7 metrics>: 0-100}}], "explanation": str}`
- `recommend_by_weights(weights, top_k=5)` → just the `regions` list shape above

Hard constraints that will silently break the frontend if violated:
- The 7 metric names are fixed Korean strings: `녹지 안전 교통 상권 의료 교육 문화`.
- `name` must be exactly `"구 행정동명"` — one space, no `서울특별시` prefix. The backend does
  `name.split(" ", 1)` to look up map coordinates; anything else fails coordinate lookup.
- `scores` values must be 0-100 where higher is better (needn't be true percentiles).
- `weights` values must be numeric (`4.6`, not `"4.6"`), range 1-5.
- `explanation` must be `""` when absent, never `None`.

To swap engines, edit only the two import lines at the top of `services/engine.py` (path to the
sibling folder + the module path within it).

## Security note

API keys, tokens, and other secrets must go in `.env` (gitignored), never committed. The
Anthropic key used by the recommendation engine lives in `life-fit-embed/.env`, not this repo's
`.env`.
