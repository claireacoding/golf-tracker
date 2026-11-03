# Fairway Ledger

A beginner-friendly golf round tracker that looks like a paper scorecard. It runs as a static site: plain HTML, CSS, and JavaScript, with no build step and no server.

You track strokes, lost balls, and a “win of the day.” The tone stays encouraging. There is no handicap math and no list of worst rounds.

## Try it locally

Open `index.html` in a browser, or serve the folder so storage behaves the way it will on GitHub Pages:

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

After a minute or so the card is served from the site URL for this repository (for this repo, that is `https://claireacoding.github.io/golf-tracker/`). An empty `.nojekyll` file is included so Pages serves these files as-is and does not run them through Jekyll.

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
| `app.js` | Scoring, saving, history, backup. Commented for someone learning JavaScript |
| `.nojekyll` | Tells GitHub Pages not to run Jekyll |

If you are reading the code, start at the top of `app.js`. The scoring functions come first and do not touch the page. Then storage, then drawing, then the click handler.

Fonts are loaded from Google Fonts (Special Elite, Libre Baskerville, and Caveat). If those are blocked, the card falls back to Courier, Palatino, and a script font.
