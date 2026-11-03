# Fairway Ledger

A beginner-friendly golf round tracker that looks like a paper scorecard. It runs as a static site: plain HTML, CSS, and JavaScript, with no build step and no server. A manifest and a service worker let a phone install it and open it offline.

You track strokes, lost balls, and a “win of the day.” The tone stays encouraging. There is no handicap math and no list of worst rounds.

## Try it locally

Serve the folder so storage and the offline cache behave the way they will on the public site. Opening the file directly can block storage, and it will not install the service worker:

```bash
python3 -m http.server 8080
```

Then visit [http://localhost:8080](http://localhost:8080).

## Put it on GitHub Pages

GitHub Pages has to be turned on once. The site is not published until these settings are saved:

1. Merge this project to `main`.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose branch **main** and folder **/ (root)**.
5. Save.

After a minute or so the card is served from the site URL for this repository (for this repo, that is `https://claireacoding.github.io/golf-tracker/`). An empty `.nojekyll` file is included so Pages serves these files as-is and does not run them through Jekyll. Paths in the page, the manifest, and the service worker are relative, so the same files also work from a subfolder such as `https://claireacoding.digital/golf-tracker/`.

## Install on a phone, and offline

Fairway Ledger is a progressive web app. The manifest names it Fairway Ledger, short name Ledger, with a cream background, an olive theme color, and `start_url` and `scope` of `./`. A phone can add it to the home screen. The icons are a scorecard frame with an olive flag and ball; the maskable ones are an olive field so a round crop still looks finished.

`sw.js` stores the page, styles, script, icons, and fonts in a versioned cache (`fairway-ledger-v1`) and deletes older caches when that name changes. Bump `CACHE_VERSION` at the top of `sw.js` when you change one of those files. The comments in `sw.js` explain what the cache is doing.

The rounds themselves are not in that cache. They stay in `localStorage`. Offline, you still have both the card and your scores.

Fonts are the files in `fonts/` (Special Elite, Libre Baskerville, and Architects Daughter), so the type does not depend on Google once the cache is filled. If a font file is missing, the card falls back to Courier, Palatino, and a print font. Architects Daughter is set in capitals.

### Check the cache

1. Serve the folder and open the site.
2. Open DevTools, then **Application**.
3. **Manifest** should list the name, short name, cream background, olive theme, start URL and scope `./`, and standalone display.
4. **Service Workers** should show `sw.js` activated and running.
5. **Cache Storage** should show `fairway-ledger-v1` with the app files and fonts.
6. In **Network**, choose **Offline**, then reload. The scorecard should still open. A stroke you log is still saved on this phone.

## How a round works

- Start a round with a date, a course name, 9 or 18 holes, and a par. Every hole starts at par 4 unless you set them one by one. You can still change a hole’s par on the card.
- Strokes use large + and − buttons. Lost balls (or other penalties you want to remember) have their own + and −.
- Lost balls are a side note. They are **not** added on top of strokes. If your group counts a penalty as a stroke, tap both buttons. A hole left at “–” has not been played yet.
- The big number is the running total. Over and under par only include holes you have scored, and the wording stays gentle.
- **Win of the day** is a free-text note for a best shot or a proud moment.
- Every change is saved immediately in this browser (`localStorage`, key `fairway-ledger.v1`). There is no separate save button, so a refresh on the course does not clear the card. History is the same book of rounds.

Personal bests (best 9-hole score, best 18-hole score, fewest lost balls) only count rounds where every hole has a score. They are framed as a ribbon board, not a grade.

Delete asks you to confirm. It only removes the round from this browser.

## Backup

`localStorage` is per browser. Export downloads a JSON file. Import reads that file back and merges it: new rounds are added, a newer copy of the same round updates the old one, and anything else is left alone.

```json
{
  "app": "fairway-ledger",
  "version": 1,
  "exportedAt": "2026-11-03T12:00:00.000Z",
  "rounds": [
    {
      "id": "round-example",
      "date": "2026-11-03",
      "course": "Meadow Links",
      "holeCount": 9,
      "holes": [{ "par": 4, "strokes": 5, "penalties": 0 }],
      "win": "The tee shot on 3",
      "savedAt": "2026-11-03T18:00:00.000Z"
    }
  ]
}
```

A file that is just a JSON array of rounds also imports. Each round needs `"holeCount": 9` or `18`.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page: crest header, navigation, and the spot `app.js` fills in |
| `style.css` | Paper card, felt table, olive ink, big tap targets |
| `app.js` | Scoring, saving, history, backup. Commented for someone learning JavaScript. Registers `sw.js` |
| `sw.js` | Offline cache. The comments at the top explain what caching does |
| `manifest.webmanifest` | Install name, colors, icons, and scope |
| `apple-touch-icon.png` | Home screen icon for iPhone |
| `icons/` | Installed app icons, including the maskable pair. The SVG files are the source |
| `fonts/` | Self-hosted typefaces, so offline matches online |
| `.nojekyll` | Tells GitHub Pages not to run Jekyll |

If you are reading the code, start at the top of `app.js`. The scoring functions come first and do not touch the page. Then storage, then drawing, then the click handler. For offline, read `sw.js` next.
