/*
  Fairway Ledger
  --------------
  A beginner scorecard that runs as a plain web page. Nothing is sent
  to a server. Read this file from top to bottom:

  1. Scoring math. These functions only do arithmetic. Start here.
  2. Storage. The "book" of rounds is saved in localStorage.
  3. Rendering. render() draws the page from that book.
  4. Events. Clicks and typing update the book, then draw again.

  Scoring choice, on purpose:
  Strokes are the score. Lost balls are a separate note. They are NOT
  added into the stroke total, because the card has two different
  buttons and each one should do exactly what it says. If your group
  counts a penalty as a stroke, tap both. There is no handicap math.

  A hole left at 0 strokes means "not played yet". A real hole cannot
  be finished in zero swings, so 0 is a safe empty marker. Lost balls
  can honestly be 0, so that counter is allowed to show zero.
*/
"use strict";

var STORAGE_KEY = "fairway-ledger.v1";
var MIN_PAR = 3;
var MAX_PAR = 6;
var MAX_STROKES = 25;
var MAX_PENALTIES = 15;
var MAX_COURSE = 80;
var MAX_WIN = 280;
var MAX_IMPORT = 500;

// The book is the whole app's memory: every round, plus which one is open.
var book = { activeId: null, rounds: [] };
var view = "setup";
var activeHoleIndex = 0;
var storageOk = true;
var dialogResolver = null;
var rendering = false;

// Remembered form values, so redrawing the setup screen doesn't wipe them.
var setupState = {
  date: todayISO(),
  course: "",
  holeCount: 9,
  defaultPar: 4,
  customPars: false,
  pars: repeat(9, 4),
  error: ""
};

// ----- Small helpers ------------------------------------------------

function repeat(count, value) {
  var list = [];
  var i;
  for (i = 0; i < count; i += 1) list.push(value);
  return list;
}

function clamp(number, min, max) {
  if (!isFinite(number)) return min;
  if (number < min) return min;
  if (number > max) return max;
  return number;
}

function toInt(value, fallback) {
  // An empty box is "no answer", not zero. Number("") is 0, which
  // would sneak through as a real entry.
  if (value === "" || value == null) return fallback;
  var number = Number(value);
  if (!isFinite(number)) return fallback;
  return Math.round(number);
}

function plural(count, word) {
  return count === 1 ? count + " " + word : count + " " + word + "s";
}

function makeId() {
  // Fine for a personal card. Not a password and not a security token.
  return "round-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// ----- Dates --------------------------------------------------------
// The date input wants "2026-11-03". Building that from local parts
// avoids the classic bug where `toISOString()` shifts the day in
// timezones behind UTC.

function dateToISO(date) {
  var month = String(date.getMonth() + 1).padStart(2, "0");
  var day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

function todayISO() {
  return dateToISO(new Date());
}

function cleanDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return todayISO();
  var parts = value.split("-");
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var day = Number(parts[2]);
  if (year < 1990 || year > 2100) return todayISO();
  // `new Date(2026, 12, 40)` quietly rolls into another month. Reject that.
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return todayISO();
  }
  return value;
}

function formatDate(iso) {
  var parts = String(iso || "").split("-");
  if (parts.length !== 3) return String(iso || "");
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var day = Number(parts[2]);
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return String(iso);
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function cleanCourse(value) {
  var text = String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_COURSE);
  return text || "Practice round";
}

// ----- Scoring ------------------------------------------------------

function summarize(round) {
  var strokes = 0;
  var par = 0;
  var played = 0;
  var penalties = 0;
  var coursePar = 0;
  var i;
  for (i = 0; i < round.holes.length; i += 1) {
    var hole = round.holes[i];
    penalties += hole.penalties;
    coursePar += hole.par;
    if (hole.strokes > 0) {
      strokes += hole.strokes;
      par += hole.par;
      played += 1;
    }
  }
  return {
    strokes: strokes,
    par: par,
    played: played,
    penalties: penalties,
    coursePar: coursePar,
    // Over/under only looks at holes that have a score, so the holes
    // still ahead don't pretend to be par.
    diff: strokes - par
  };
}

function isComplete(round) {
  var i;
  if (!round.holes.length) return false;
  for (i = 0; i < round.holes.length; i += 1) {
    if (round.holes[i].strokes <= 0) return false;
  }
  return true;
}

function vsParPhrase(diff) {
  var amount;
  if (diff === 0) return "Even par";
  amount = Math.abs(diff);
  if (diff < 0) return amount === 1 ? "1 under" : amount + " under";
  return amount === 1 ? "1 over" : amount + " over";
}

function kindLine(diff) {
  if (diff < 0) return "Under par. Savor it.";
  if (diff === 0) return "Even par. Smooth.";
  if (diff <= 3) return "A little over. Still a good walk.";
  return "Keep going. The card is a record, not a grade.";
}

function toneClass(diff, played) {
  if (!played || diff > 0) return "tone-quiet";
  return "tone-good";
}

function lowestScore(list) {
  var best = null;
  var i;
  for (i = 0; i < list.length; i += 1) {
    var round = list[i];
    var roundSummary;
    var bestSummary;
    var scoreDiff;
    if (!best) {
      best = round;
      continue;
    }
    roundSummary = summarize(round);
    bestSummary = summarize(best);
    scoreDiff = roundSummary.strokes - bestSummary.strokes;
    if (scoreDiff < 0 || (scoreDiff === 0 && roundSummary.penalties < bestSummary.penalties)) {
      best = round;
    }
  }
  return best;
}

function fewestPenalties(list) {
  var best = null;
  var i;
  for (i = 0; i < list.length; i += 1) {
    var round = list[i];
    var roundSummary;
    var bestSummary;
    var ballDiff;
    if (!best) {
      best = round;
      continue;
    }
    roundSummary = summarize(round);
    bestSummary = summarize(best);
    ballDiff = roundSummary.penalties - bestSummary.penalties;
    if (ballDiff < 0 || (ballDiff === 0 && roundSummary.strokes < bestSummary.strokes)) {
      best = round;
    }
  }
  return best;
}

// Personal bests are celebrations. Only finished rounds count, so a
// card you just started cannot sneak in as a record.
function personalBests(rounds) {
  var finished = [];
  var nines = [];
  var eighteens = [];
  var i;
  for (i = 0; i < rounds.length; i += 1) {
    if (isComplete(rounds[i])) finished.push(rounds[i]);
  }
  finished.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if ((a.savedAt || "") === (b.savedAt || "")) return 0;
    return (a.savedAt || "") < (b.savedAt || "") ? 1 : -1;
  });
  for (i = 0; i < finished.length; i += 1) {
    if (finished[i].holeCount === 9) nines.push(finished[i]);
    if (finished[i].holeCount === 18) eighteens.push(finished[i]);
  }
  return {
    best9: lowestScore(nines),
    best18: lowestScore(eighteens),
    fewestLost: fewestPenalties(finished)
  };
}

function firstUnplayed(round) {
  var i;
  for (i = 0; i < round.holes.length; i += 1) {
    if (round.holes[i].strokes === 0) return i;
  }
  return 0;
}

function findRoundIn(rounds, id) {
  var i;
  for (i = 0; i < rounds.length; i += 1) {
    if (rounds[i].id === id) return rounds[i];
  }
  return null;
}

function activeRound() {
  return findRoundIn(book.rounds, book.activeId);
}

function historyOrder(rounds, activeId) {
  var copy = rounds.slice();
  // Copy first. Sorting the real list would shuffle what we save.
  copy.sort(function (a, b) {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if ((a.savedAt || "") === (b.savedAt || "")) return 0;
    return (a.savedAt || "") < (b.savedAt || "") ? 1 : -1;
  });
  return copy;
}

// ----- Turning raw data into a safe round --------------------------

function normalizeRound(raw) {
  var holeCount;
  var holes = [];
  var source;
  var i;
  if (!raw || typeof raw !== "object") return null;
  if (raw.holeCount === 18) holeCount = 18;
  else if (raw.holeCount === 9) holeCount = 9;
  else return null;
  source = Array.isArray(raw.holes) ? raw.holes : [];
  for (i = 0; i < holeCount; i += 1) {
    var hole = source[i] || {};
    holes.push({
      par: clamp(toInt(hole.par, 4), MIN_PAR, MAX_PAR),
      strokes: clamp(toInt(hole.strokes, 0), 0, MAX_STROKES),
      penalties: clamp(toInt(hole.penalties, 0), 0, MAX_PENALTIES)
    });
  }
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : makeId(),
    date: cleanDate(raw.date),
    course: cleanCourse(raw.course),
    holeCount: holeCount,
    holes: holes,
    win: typeof raw.win === "string" ? raw.win.slice(0, MAX_WIN) : "",
    // Missing timestamps sort as old, so a partial import can't
    // overwrite a card this phone already has.
    savedAt: typeof raw.savedAt === "string" && raw.savedAt.trim()
      ? raw.savedAt
      : "1970-01-01T00:00:00.000Z"
  };
}

// ----- Storage ------------------------------------------------------
// localStorage keeps strings, in this browser only. JSON.stringify
// turns the book into text. JSON.parse turns it back into objects.
// Closing the tab does not clear it. A private window may block it,
// so persistBook reports failure instead of assuming it worked.

function loadBook() {
  var empty = { activeId: null, rounds: [] };
  var raw;
  var data;
  var source;
  var rounds = [];
  var activeId = null;
  var i;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    data = JSON.parse(raw);
    source = Array.isArray(data) ? data : (data && data.rounds);
    if (!Array.isArray(source)) return empty;
    for (i = 0; i < source.length; i += 1) {
      var round = normalizeRound(source[i]);
      if (round) rounds.push(round);
    }
    if (data && typeof data.activeId === "string" && findRoundIn(rounds, data.activeId)) {
      activeId = data.activeId;
    }
    return { activeId: activeId, rounds: rounds };
  } catch (error) {
    return empty;
  }
}

function persistBook() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      activeId: book.activeId,
      rounds: book.rounds
    }));
    return true;
  } catch (error) {
    return false;
  }
}

function commit(round) {
  round.savedAt = new Date().toISOString();
  storageOk = persistBook();
  markSaved();
  if (!storageOk) {
    setStatus("This browser blocked storage. The card is on screen, but it may disappear if you close the tab.");
  }
}

function markSaved() {
  var note = document.getElementById("autosave-note");
  if (!note) return;
  note.textContent = storageOk ? "Saved on this phone" : "Not saved in this browser";
}

function setStatus(message) {
  var node = document.getElementById("status");
  if (node) node.textContent = message;
}

// ----- Building elements --------------------------------------------
// Course names and "win" notes are text a person typed. We put them in
// the page with text nodes, never HTML strings, so a name like
// "<b>hi</b>" shows up as those characters and can't change the page.

function h(tag, props) {
  var node = document.createElement(tag);
  var i;
  if (props) {
    var keys = Object.keys(props);
    for (i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var value = props[key];
      if (value == null || value === false) continue;
      if (key === "className") node.className = value;
      else if (key === "htmlFor") node.htmlFor = value;
      else if (key === "value") node.value = value;
      else if (key === "checked") node.checked = true;
      else if (key === "disabled") node.disabled = true;
      else node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  // `arguments` is every value that was passed in, including tag and props.
  for (i = 2; i < arguments.length; i += 1) appendChild(node, arguments[i]);
  return node;
}

function appendChild(node, child) {
  var i;
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    for (i = 0; i < child.length; i += 1) appendChild(node, child[i]);
    return;
  }
  if (child instanceof Node) node.append(child);
  else node.append(document.createTextNode(String(child)));
}

// ----- Setup screen -------------------------------------------------

function choiceRadio(value, label) {
  return h("label", { className: "choice" },
    h("input", {
      type: "radio",
      name: "holeCount",
      value: value,
      checked: setupState.holeCount === Number(value)
    }),
    h("span", null, label)
  );
}

function parFields() {
  var fields = [];
  var i;
  for (i = 0; i < setupState.holeCount; i += 1) {
    var number = i + 1;
    fields.push(h("label", { className: "par-cell" },
      h("span", null, String(number)),
      h("input", {
        type: "number",
        name: "par" + number,
        min: String(MIN_PAR),
        max: String(MAX_PAR),
        inputmode: "numeric",
        value: String(setupState.pars[i] || setupState.defaultPar)
      })
    ));
  }
  return fields;
}

function renderSetup() {
  return h("section", { "aria-labelledby": "setup-heading" },
    h("div", { className: "section-head" },
      h("div", null,
        h("h2", { id: "setup-heading" }, "New round"),
        h("p", { className: "lead" }, "Start simple. Par begins at 4, and you can change any hole while you play.")
      )
    ),
    activeRound()
      ? h("div", { className: "actions" },
        h("button", { type: "button", className: "btn", "data-action": "back-to-card" }, "Back to the open card")
      )
      : null,
    setupState.error
      ? h("p", { id: "form-error", className: "form-error", role: "alert" }, setupState.error)
      : null,
    h("form", { id: "setup-form", className: "setup-form", autocomplete: "off" },
      h("label", { className: "field" },
        h("span", { className: "label" }, "Date"),
        h("input", { type: "date", name: "date", value: setupState.date || todayISO() })
      ),
      h("label", { className: "field span-2" },
        h("span", { className: "label" }, "Course"),
        h("input", {
          type: "text",
          name: "course",
          maxlength: String(MAX_COURSE),
          placeholder: "e.g. Meadow Links",
          autocapitalize: "words",
          spellcheck: "false",
          value: setupState.course
        })
      ),
      h("fieldset", null,
        h("legend", { className: "label" }, "How many holes?"),
        h("div", { className: "choices" },
          choiceRadio("9", "9 holes"),
          choiceRadio("18", "18 holes")
        )
      ),
      h("label", { className: "field" },
        h("span", { className: "label" }, "Par for each hole"),
        h("input", {
          type: "number",
          name: "defaultPar",
          min: String(MIN_PAR),
          max: String(MAX_PAR),
          inputmode: "numeric",
          value: String(setupState.defaultPar)
        }),
        h("span", { className: "fine" }, "Most holes are par 4. Change this if your course is different.")
      ),
      h("details", { id: "custom-pars", className: "span-2", open: setupState.customPars },
        h("summary", null, "Set a different par for each hole"),
        h("p", { className: "fine" }, "These numbers are used only while this section is open. Close it to go back to one par for every hole."),
        h("div", { className: "par-grid" }, parFields())
      ),
      h("div", { className: "actions span-2" },
        h("button", { type: "submit", className: "btn btn-primary" }, "Start the round")
      )
    )
  );
}

function resizePars(count) {
  if (setupState.pars.length < count) {
    while (setupState.pars.length < count) setupState.pars.push(setupState.defaultPar);
  } else if (setupState.pars.length > count) {
    setupState.pars = setupState.pars.slice(0, count);
  }
}

function rememberSetupForm() {
  var form = document.getElementById("setup-form");
  var course;
  var date;
  var holeCountField;
  var defaultPar;
  var details;
  var nextPars;
  var i;
  if (!form) return;
  course = form.elements.namedItem("course");
  date = form.elements.namedItem("date");
  holeCountField = form.elements.namedItem("holeCount");
  defaultPar = form.elements.namedItem("defaultPar");
  if (course) setupState.course = String(course.value).slice(0, MAX_COURSE);
  if (date) setupState.date = String(date.value);
  if (holeCountField) setupState.holeCount = Number(holeCountField.value) === 18 ? 18 : 9;
  if (defaultPar) setupState.defaultPar = clamp(toInt(defaultPar.value, 4), MIN_PAR, MAX_PAR);
  details = document.getElementById("custom-pars");
  setupState.customPars = Boolean(details && details.open);
  nextPars = setupState.pars.slice();
  for (i = 0; i < setupState.holeCount; i += 1) {
    var field = form.elements.namedItem("par" + (i + 1));
    if (field) nextPars[i] = clamp(toInt(field.value, setupState.defaultPar), MIN_PAR, MAX_PAR);
  }
  setupState.pars = nextPars;
  resizePars(setupState.holeCount);
}

function fillParsWithDefault() {
  setupState.pars = repeat(setupState.holeCount, setupState.defaultPar);
}

function startRoundFromSetup() {
  var holeCount = setupState.holeCount === 18 ? 18 : 9;
  var pars;
  var holes = [];
  var i;
  var round;
  if (setupState.customPars) {
    pars = setupState.pars.slice(0, holeCount);
    while (pars.length < holeCount) pars.push(setupState.defaultPar);
  } else {
    pars = repeat(holeCount, setupState.defaultPar);
  }
  for (i = 0; i < holeCount; i += 1) {
    holes.push({
      par: clamp(pars[i], MIN_PAR, MAX_PAR),
      strokes: 0,
      penalties: 0
    });
  }
  round = {
    id: makeId(),
    date: cleanDate(setupState.date),
    course: cleanCourse(setupState.course),
    holeCount: holeCount,
    holes: holes,
    win: "",
    savedAt: new Date().toISOString()
  };
  book.rounds.push(round);
  book.activeId = round.id;
  activeHoleIndex = 0;
  setupState.error = "";
  setupState.course = "";
  view = "card";
  storageOk = persistBook();
  setStatus("Card's ready. Have a good round.");
  render({ focusView: true });
}

// ----- Scorecard ----------------------------------------------------

function stepButton(label, action, index, delta, disabled, sizeClass) {
  return h("button", {
    type: "button",
    className: "tap" + (sizeClass ? " " + sizeClass : ""),
    "data-action": action,
    "data-index": String(index),
    "data-delta": String(delta),
    "aria-label": label,
    disabled: disabled
  }, delta > 0 ? "+" : "\u2212");
}

function holeCell(hole, index) {
  var number = index + 1;
  var selected = index === activeHoleIndex;
  var scoreText = hole.strokes > 0 ? String(hole.strokes) : "\u2013";
  var label = hole.strokes > 0
    ? "Hole " + number + ", " + hole.strokes + " strokes, par " + hole.par
    : "Hole " + number + ", no score yet, par " + hole.par;
  return h("button", {
    type: "button",
    className: "hole-cell",
    "data-action": "select-hole",
    "data-index": String(index),
    "aria-current": selected ? "true" : false,
    "aria-label": selected ? label + ". Selected." : label
  },
    h("span", { className: "cell-num" }, String(number)),
    h("span", { className: "cell-strokes" }, scoreText),
    h("span", { className: "cell-par" }, "par " + hole.par)
  );
}

function gridFor(round) {
  if (round.holeCount === 18) {
    return h("div", null,
      h("p", { className: "fine grid-hint" }, "Tap a hole to score it. Out is the front nine. In is the back nine."),
      nineRow("Out", round.holes.slice(0, 9), 0),
      nineRow("In", round.holes.slice(9), 9)
    );
  }
  var cells = [];
  var i;
  for (i = 0; i < round.holes.length; i += 1) cells.push(holeCell(round.holes[i], i));
  return h("div", { className: "hole-grid" }, cells);
}

function nineRow(label, holes, offset) {
  var cells = [];
  var strokes = 0;
  var any = false;
  var i;
  for (i = 0; i < holes.length; i += 1) {
    cells.push(holeCell(holes[i], offset + i));
    if (holes[i].strokes > 0) {
      strokes += holes[i].strokes;
      any = true;
    }
  }
  return h("div", { className: "nine" },
    h("div", { className: "nine-label" },
      h("span", null, label),
      h("strong", null, any ? String(strokes) : "\u2013")
    ),
    h("div", { className: "hole-grid" }, cells)
  );
}

function renderCard(round) {
  var summary = summarize(round);
  var hole = round.holes[activeHoleIndex];
  var holeNumber = activeHoleIndex + 1;
  var tone = toneClass(summary.diff, summary.played);
  var vsText;
  var kind;
  if (summary.played === 0) {
    vsText = "No score yet";
    kind = "Have a good walk out.";
  } else if (summary.played === round.holeCount) {
    vsText = vsParPhrase(summary.diff);
    kind = kindLine(summary.diff);
  } else {
    vsText = vsParPhrase(summary.diff) + " across " + plural(summary.played, "hole");
    kind = kindLine(summary.diff);
  }

  return h("section", { "aria-labelledby": "card-heading" },
    h("h2", { id: "card-heading", className: "visually-hidden" }, "Scorecard"),
    h("div", { className: "summary-grid" },
      h("div", null,
        h("div", { className: "identity" },
          h("label", { className: "grow" },
            h("span", { className: "label" }, "Course"),
            h("input", {
              id: "course-input",
              className: "course-input",
              type: "text",
              maxlength: String(MAX_COURSE),
              autocapitalize: "words",
              spellcheck: "false",
              value: round.course
            })
          ),
          h("label", null,
            h("span", { className: "label" }, "Date"),
            h("input", {
              id: "date-input",
              className: "date-input",
              type: "date",
              value: round.date
            })
          )
        ),
        h("p", { className: "meta" }, round.holeCount + " holes \u00b7 course par " + summary.coursePar),
        h("div", { className: "running-wrap" },
          h("div", { className: "running" },
            h("p", { className: "running-score" },
              h("span", { id: "running-score" }, summary.played ? String(summary.strokes) : "\u2013"),
              h("span", { className: "unit" }, "strokes")
            ),
            h("div", { className: "running-copy" },
              h("p", { id: "vs-par", className: "vs " + tone }, vsText),
              h("p", { id: "lost-total", className: "lost" }, plural(summary.penalties, "lost ball")),
              h("p", { id: "kind-line", className: "kind " + tone }, kind)
            )
          ),
          h("p", { id: "autosave-note", className: "autosave" }, storageOk ? "Saved on this phone" : "Not saved in this browser")
        )
      ),
      h("div", { className: "win-block" },
        h("label", { htmlFor: "win-input", className: "label" }, "Win of the day"),
        h("textarea", {
          id: "win-input",
          className: "win-input",
          maxlength: String(MAX_WIN),
          rows: "2",
          placeholder: "A drive you flushed, a putt that dropped, a brave club choice\u2026",
          value: round.win
        }),
      )
    ),
    gridFor(round),
    h("section", { className: "editor", "aria-labelledby": "hole-heading" },
      h("div", { className: "editor-head" },
        h("h3", { id: "hole-heading" }, "Hole " + holeNumber),
        h("div", { className: "par-adjust" },
          stepButton("Lower par on hole " + holeNumber, "par", activeHoleIndex, -1, hole.par <= MIN_PAR, "tap-sm"),
          h("span", { className: "par-value" }, "Par " + hole.par),
          stepButton("Raise par on hole " + holeNumber, "par", activeHoleIndex, 1, hole.par >= MAX_PAR, "tap-sm")
        )
      ),
      h("div", { className: "editor-controls" },
        h("div", { className: "stepper", role: "group", "aria-label": "Strokes on hole " + holeNumber },
          h("p", { className: "label" }, "Strokes"),
          h("div", { className: "stepper-row" },
            stepButton("Remove one stroke on hole " + holeNumber, "stroke", activeHoleIndex, -1, hole.strokes <= 0, "tap-lg"),
            h("span", { className: "count", id: "stroke-count" }, hole.strokes > 0 ? String(hole.strokes) : "\u2013"),
            stepButton("Add one stroke on hole " + holeNumber, "stroke", activeHoleIndex, 1, hole.strokes >= MAX_STROKES, "tap-lg")
          )
        ),
        h("div", { className: "stepper", role: "group", "aria-label": "Lost balls or penalties on hole " + holeNumber },
          h("p", { className: "label" }, "Lost balls / penalties"),
          h("div", { className: "stepper-row" },
            stepButton("Remove a lost ball or penalty on hole " + holeNumber, "penalty", activeHoleIndex, -1, hole.penalties <= 0, ""),
            h("span", { className: "count", id: "penalty-count" }, String(hole.penalties)),
            stepButton("Add a lost ball or penalty on hole " + holeNumber, "penalty", activeHoleIndex, 1, hole.penalties >= MAX_PENALTIES, "")
          ),
          h("p", { className: "fine" }, "A side note. Not added to the stroke total.")
        ),
        h("div", { className: "hole-nav" },
          h("button", {
            type: "button",
            className: "btn",
            "data-action": "prev-hole",
            disabled: activeHoleIndex === 0
          }, "Previous"),
          h("button", {
            type: "button",
            className: "btn btn-primary",
            "data-action": "next-hole",
            disabled: activeHoleIndex >= round.holes.length - 1
          }, "Next hole")
        )
      )
    ),
    h("div", { className: "card-footer" },
      h("button", { type: "button", className: "btn", "data-action": "new-round" }, "New round"),
      h("p", { className: "fine" }, "Every tap is stored on this phone. Find the round again under History.")
    )
  );
}

// ----- History ------------------------------------------------------

function bestCard(kicker, round, mode) {
  var summary;
  var title = "\u2013";
  var detail = "";
  var cheer = "";
  if (!round) {
    if (mode === "best9") {
      detail = "Finish all 9 holes";
      cheer = "Your best score will be kept here.";
    } else if (mode === "best18") {
      detail = "Finish all 18 holes";
      cheer = "A full round, whenever you're ready.";
    } else {
      detail = "Finish a round";
      cheer = "The fewest lost balls will show up here.";
    }
  } else {
    summary = summarize(round);
    detail = round.course;
    if (mode === "fewest") {
      title = summary.penalties === 0 ? "None" : String(summary.penalties);
      cheer = summary.penalties === 0
        ? "No lost balls. A clean round."
        : "A mark to beat, for fun.";
    } else {
      title = String(summary.strokes);
      detail = round.course + " \u00b7 " + vsParPhrase(summary.diff);
      cheer = "Best at this length.";
    }
  }
  return h("article", { className: "best" },
    h("h3", null, kicker),
    h("p", { className: "best-num" }, title),
    h("p", null, detail),
    h("p", { className: "fine" }, cheer)
  );
}

function stampsFor(round, bests) {
  var stamps = [];
  if (bests.best9 && bests.best9.id === round.id) stamps.push("Best 9");
  if (bests.best18 && bests.best18.id === round.id) stamps.push("Best 18");
  if (bests.fewestLost && bests.fewestLost.id === round.id) stamps.push("Fewest balls");
  return stamps;
}

function roundCard(round, bests) {
  var summary = summarize(round);
  var complete = isComplete(round);
  var stamps = stampsFor(round, bests);
  var stampNodes = [];
  var i;
  var scoreLine;
  var extra = null;
  var win = round.win.trim();
  for (i = 0; i < stamps.length; i += 1) {
    stampNodes.push(h("span", { className: "stamp" }, stamps[i]));
  }
  if (summary.played === 0) {
    scoreLine = h("p", { className: "round-line" }, "Not started yet");
    extra = h("p", { className: "fine" }, "Scores will appear here as you play.");
  } else if (!complete) {
    scoreLine = h("p", { className: "round-score" },
      h("span", null, String(summary.strokes)),
      h("span", { className: "unit" }, "strokes")
    );
    extra = h("p", { className: "round-line" },
      summary.played + " of " + round.holeCount + " holes scored \u00b7 " + plural(summary.penalties, "lost ball")
    );
  } else {
    scoreLine = h("p", { className: "round-score" },
      h("span", null, String(summary.strokes)),
      h("span", { className: "unit" }, "strokes")
    );
    extra = h("p", { className: "round-line" },
      vsParPhrase(summary.diff) + " \u00b7 " + plural(summary.penalties, "lost ball") + " \u00b7 " + round.holeCount + " holes"
    );
  }
  return h("li", { "data-round-id": round.id },
    h("div", { className: "round-top" },
      h("div", null,
        h("h3", { className: "round-title" }, round.course),
        h("p", { className: "fine" }, formatDate(round.date) + " \u00b7 " + round.holeCount + " holes"
          + (round.id === book.activeId ? " \u00b7 open now" : ""))
      ),
      stampNodes.length ? h("div", { className: "stamps" }, stampNodes) : null
    ),
    scoreLine,
    extra,
    win
      ? h("blockquote", { className: "win-quote" }, win)
      : h("p", { className: "fine" }, "Win of the day still blank."),
    !complete && summary.played > 0
      ? h("p", { className: "fine" }, "Finish every hole and this round can count as a personal best.")
      : null,
    h("div", { className: "row-actions" },
      h("button", {
        type: "button",
        className: "btn btn-primary",
        "data-action": "open-round",
        "data-id": round.id
      }, "Open card"),
      h("button", {
        type: "button",
        className: "btn btn-danger",
        "data-action": "delete-round",
        "data-id": round.id,
        "aria-label": "Delete the round at " + round.course
      }, "Delete")
    )
  );
}

function renderHistory() {
  var bests = personalBests(book.rounds);
  var ordered = historyOrder(book.rounds, book.activeId);
  var items = [];
  var i;
  for (i = 0; i < ordered.length; i += 1) items.push(roundCard(ordered[i], bests));
  return h("section", { "aria-labelledby": "history-heading" },
    h("div", { className: "history-head" },
      h("div", null,
        h("h2", { id: "history-heading" }, "History"),
        h("p", { className: "lead" }, "Past cards stay in this browser.")
      ),
      h("button", { type: "button", className: "btn", "data-action": "new-round" }, "New round")
    ),
    h("section", { "aria-labelledby": "bests-heading" },
      h("h3", { id: "bests-heading", className: "label" }, "Personal bests"),
      h("p", { className: "fine" }, "Finished rounds only. A ribbon board, not a grade."),
      h("div", { className: "bests" },
        bestCard("Best 9", bests.best9, "best9"),
        bestCard("Best 18", bests.best18, "best18"),
        bestCard("Fewest balls", bests.fewestLost, "fewest")
      )
    ),
    items.length
      ? h("ul", { className: "ledger", id: "history-list" }, items)
      : h("div", { className: "empty-card" },
        h("p", { className: "empty-mark" }, "No rounds yet"),
        h("p", null, "When you start a round, it will be listed here like a card kept at the clubhouse.")
      ),
    h("div", { className: "backup" },
      h("p", { className: "label" }, "Backup"),
      h("div", { className: "backup-actions" },
        h("button", { type: "button", className: "btn", "data-action": "export" }, "Export backup"),
        h("button", { type: "button", className: "btn", "data-action": "import" }, "Import backup")
      ),
      h("input", {
        id: "import-file",
        className: "file-input",
        type: "file",
        accept: "application/json,.json",
        "aria-hidden": "true",
        tabindex: "-1"
      }),
      h("p", { className: "fine" }, "Export downloads a text file of your rounds. Import reads that file back. Handy when you switch browsers, because this list lives in one browser only.")
    )
  );
}

// ----- Drawing the current view -------------------------------------

function updateNav() {
  var score = document.getElementById("nav-score");
  var history = document.getElementById("nav-history");
  var onHistory = view === "history";
  if (!score || !history) return;
  if (onHistory) {
    history.setAttribute("aria-current", "page");
    score.removeAttribute("aria-current");
  } else {
    score.setAttribute("aria-current", "page");
    history.removeAttribute("aria-current");
  }
}

function captureFocus() {
  var active = document.activeElement;
  if (!active || !active.closest || !active.dataset) return null;
  if (!active.closest("#view")) return null;
  if (!active.dataset.action) return null;
  return {
    action: active.dataset.action,
    index: active.dataset.index || "",
    id: active.dataset.id || ""
  };
}

function restoreFocus(saved) {
  var buttons = document.querySelectorAll("#view [data-action]");
  var i;
  for (i = 0; i < buttons.length; i += 1) {
    var button = buttons[i];
    if (button.dataset.action !== saved.action) continue;
    if (saved.index && button.dataset.index !== saved.index) continue;
    if (saved.id && button.dataset.id !== saved.id) continue;
    button.focus({ preventScroll: true });
    return;
  }
}

function render(options) {
  var viewRoot;
  var round;
  var focusRestore;
  if (rendering) return;
  rendering = true;
  focusRestore = captureFocus();
  try {
    viewRoot = document.getElementById("view");
    round = activeRound();
    if (view === "card" && !round) view = "setup";
    if (view === "card") {
      if (activeHoleIndex > round.holes.length - 1) activeHoleIndex = 0;
      viewRoot.replaceChildren(renderCard(round));
      document.title = round.course + " \u00b7 Fairway Ledger";
    } else if (view === "history") {
      viewRoot.replaceChildren(renderHistory());
      document.title = "History \u00b7 Fairway Ledger";
    } else {
      view = "setup";
      viewRoot.replaceChildren(renderSetup());
      document.title = "Fairway Ledger \u2014 a kind golf scorecard";
    }
    updateNav();
    if (options && options.focusView) {
      viewRoot.tabIndex = -1;
      viewRoot.focus({ preventScroll: true });
    } else if (focusRestore) {
      restoreFocus(focusRestore);
    }
  } finally {
    rendering = false;
  }
}

// ----- Changing a hole ----------------------------------------------

function changeHole(index, field, delta, min, max) {
  var round = activeRound();
  var hole;
  var next;
  if (!round || !round.holes[index]) return;
  hole = round.holes[index];
  next = clamp(hole[field] + delta, min, max);
  if (next === hole[field]) return;
  hole[field] = next;
  activeHoleIndex = index;
  commit(round);
  render();
}

function moveHole(delta) {
  var round = activeRound();
  if (!round) return;
  activeHoleIndex = clamp(activeHoleIndex + delta, 0, round.holes.length - 1);
  render();
}

// ----- Clicks, typing, and the setup form ---------------------------
// One listener on #view handles the whole card. We redraw the inside
// often; the listener stays put because #view itself is not replaced.
// `closest` walks up from whatever was tapped (often the + glyph) to
// the button that owns the action.

function onViewClick(event) {
  var button = event.target.closest ? event.target.closest("[data-action]") : null;
  var action;
  var index;
  var delta;
  var round;
  if (!button) return;
  action = button.dataset.action;
  index = Number(button.dataset.index);
  delta = Number(button.dataset.delta);
  if (action === "select-hole") {
    round = activeRound();
    if (!round) return;
    activeHoleIndex = clamp(index, 0, round.holes.length - 1);
    render();
  } else if (action === "stroke") {
    changeHole(index, "strokes", delta, 0, MAX_STROKES);
  } else if (action === "penalty") {
    changeHole(index, "penalties", delta, 0, MAX_PENALTIES);
  } else if (action === "par") {
    changeHole(index, "par", delta, MIN_PAR, MAX_PAR);
  } else if (action === "prev-hole") {
    moveHole(-1);
  } else if (action === "next-hole") {
    moveHole(1);
  } else if (action === "new-round") {
    view = "setup";
    render({ focusView: true });
  } else if (action === "back-to-card") {
    if (!activeRound()) return;
    view = "card";
    render({ focusView: true });
  } else if (action === "open-round") {
    openRound(button.dataset.id);
  } else if (action === "delete-round") {
    confirmDelete(button.dataset.id);
  } else if (action === "export") {
    exportBackup();
  } else if (action === "import") {
    var input = document.getElementById("import-file");
    if (input) input.click();
  }
}

function onViewInput(event) {
  var round = activeRound();
  var target = event.target;
  if (!round || !target) return;
  if (target.id === "win-input") {
    round.win = String(target.value).slice(0, MAX_WIN);
    commit(round);
  } else if (target.id === "course-input") {
    var raw = String(target.value).slice(0, MAX_COURSE);
    if (raw.trim()) {
      round.course = raw;
      commit(round);
      document.title = raw.trim() + " \u00b7 Fairway Ledger";
    }
  } else if (target.name === "course" && setupState.error) {
    setupState.error = "";
    var alert = document.getElementById("form-error");
    if (alert) alert.remove();
  }
}

function onViewFocusOut(event) {
  var round = activeRound();
  var target = event.target;
  if (!round || !target || target.id !== "course-input") return;
  var trimmed = String(target.value).replace(/\s+/g, " ").trim();
  if (!trimmed) {
    target.value = round.course;
    setStatus("Kept the previous course name.");
    return;
  }
  round.course = trimmed.slice(0, MAX_COURSE);
  target.value = round.course;
  commit(round);
}

function onViewChange(event) {
  var target = event.target;
  var round;
  if (!target) return;
  if (target.id === "import-file") {
    var file = target.files && target.files[0];
    target.value = "";
    if (file) readBackup(file);
    return;
  }
  if (target.name === "holeCount") {
    rememberSetupForm();
    if (!setupState.customPars) fillParsWithDefault();
    render();
    return;
  }
  if (target.name === "defaultPar") {
    rememberSetupForm();
    if (!setupState.customPars) {
      fillParsWithDefault();
      render();
    }
    return;
  }
  if (target.id === "date-input") {
    round = activeRound();
    if (!round) return;
    round.date = cleanDate(target.value);
    target.value = round.date;
    commit(round);
  }
}

function onViewSubmit(event) {
  if (!event.target || event.target.id !== "setup-form") return;
  event.preventDefault();
  rememberSetupForm();
  if (!setupState.course.trim()) {
    setupState.error = 'Add a course name. "Practice green" is a fine name.';
    render();
    var field = document.querySelector('#setup-form [name="course"]');
    if (field) field.focus();
    return;
  }
  startRoundFromSetup();
}

function openRound(id) {
  var round = findRoundIn(book.rounds, id);
  if (!round) return;
  book.activeId = round.id;
  activeHoleIndex = firstUnplayed(round);
  view = "card";
  storageOk = persistBook();
  render({ focusView: true });
}

function confirmDelete(id) {
  var round = findRoundIn(book.rounds, id);
  if (!round) return;
  // askChoice resolves later, when a dialog button is pressed.
  askChoice({
    title: "Remove this round?",
    message: round.course + " on " + formatDate(round.date) + " will be removed from this phone only. A backup file you already downloaded is not changed.",
    choices: [
      { id: "cancel", label: "Keep it", primary: true },
      { id: "confirm", label: "Delete round", danger: true }
    ]
  }).then(function (choice) {
    var kept = [];
    var i;
    if (choice !== "confirm") return;
    for (i = 0; i < book.rounds.length; i += 1) {
      if (book.rounds[i].id !== round.id) kept.push(book.rounds[i]);
    }
    book.rounds = kept;
    if (book.activeId === round.id) book.activeId = null;
    storageOk = persistBook();
    setStatus("Removed " + round.course + ". Your other rounds are still here.");
    if (view === "card") view = "history";
    render();
  });
}

// ----- Dialog -------------------------------------------------------

function askChoice(options) {
  return new Promise(function (resolve) {
    var root = document.getElementById("dialog-root");
    var buttons = [];
    var i;
    var panel;
    var cancelButton;
    if (dialogResolver) dialogResolver("cancel");
    dialogResolver = resolve;
    for (i = 0; i < options.choices.length; i += 1) {
      var choice = options.choices[i];
      var className = "btn";
      if (choice.primary) className += " btn-primary";
      if (choice.danger) className += " btn-danger";
      buttons.push(h("button", {
        type: "button",
        className: className,
        "data-choice": choice.id
      }, choice.label));
    }
    panel = h("div", {
      className: "dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "dialog-title"
    },
      h("h2", { id: "dialog-title" }, options.title),
      h("p", { id: "dialog-message" }, options.message),
      h("div", { className: "dialog-actions" }, buttons)
    );
    root.replaceChildren(panel);
    root.hidden = false;
    document.body.classList.add("dialog-open");
    cancelButton = panel.querySelector('[data-choice="cancel"]') || panel.querySelector("button");
    // Focus the safe choice first, so Enter doesn't delete by surprise.
    if (cancelButton) cancelButton.focus();
  });
}

function settleDialog(result) {
  var resolve = dialogResolver;
  var root = document.getElementById("dialog-root");
  dialogResolver = null;
  if (root) {
    root.hidden = true;
    root.replaceChildren();
  }
  document.body.classList.remove("dialog-open");
  if (resolve) resolve(result);
}

function trapDialogFocus(event) {
  var dialog = document.querySelector(".dialog");
  var buttons;
  var first;
  var last;
  if (!dialog) return;
  buttons = dialog.querySelectorAll("button");
  if (!buttons.length) return;
  first = buttons[0];
  last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function onKeydown(event) {
  var dialogRoot = document.getElementById("dialog-root");
  var tag;
  var round;
  if (dialogRoot && !dialogRoot.hidden) {
    if (event.key === "Escape") {
      event.preventDefault();
      settleDialog("cancel");
    } else if (event.key === "Tab") {
      trapDialogFocus(event);
    }
    return;
  }
  if (view !== "card") return;
  tag = event.target && event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  round = activeRound();
  if (!round) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveHole(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveHole(-1);
  } else if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    changeHole(activeHoleIndex, "strokes", 1, 0, MAX_STROKES);
  } else if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    changeHole(activeHoleIndex, "strokes", -1, 0, MAX_STROKES);
  }
}

// ----- Export and import --------------------------------------------

function exportBackup() {
  var payload;
  var blob;
  var url;
  var link;
  if (!book.rounds.length) {
    setStatus("There's nothing to export yet. Play a round first.");
    return;
  }
  payload = {
    app: "fairway-ledger",
    version: 1,
    exportedAt: new Date().toISOString(),
    rounds: book.rounds
  };
  // Pretty-printed so a person can open the file and actually read it.
  blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  url = URL.createObjectURL(blob);
  link = document.createElement("a");
  link.href = url;
  link.download = "fairway-ledger-" + todayISO() + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Downloaded " + plural(book.rounds.length, "round") + ".");
}

function roundsFromBackup(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.rounds)) return data.rounds;
  return null;
}

function mergeRounds(list) {
  var counts = { added: 0, updated: 0, skipped: 0, rejected: 0 };
  var i;
  for (i = 0; i < list.length; i += 1) {
    var round = normalizeRound(list[i]);
    var index = -1;
    var j;
    if (!round) {
      counts.rejected += 1;
      continue;
    }
    for (j = 0; j < book.rounds.length; j += 1) {
      if (book.rounds[j].id === round.id) {
        index = j;
        break;
      }
    }
    if (index === -1) {
      book.rounds.push(round);
      counts.added += 1;
    } else if ((round.savedAt || "") > (book.rounds[index].savedAt || "")) {
      book.rounds[index] = round;
      counts.updated += 1;
    } else {
      counts.skipped += 1;
    }
  }
  return counts;
}

function importMessage(counts) {
  var parts = [];
  if (!counts.added && !counts.updated && !counts.skipped && !counts.rejected) {
    return "That file had no rounds.";
  }
  if (!counts.added && !counts.updated && counts.rejected && !counts.skipped) {
    return "Couldn't read that file as a scorecard backup.";
  }
  if (counts.added) parts.push("added " + counts.added);
  if (counts.updated) parts.push("updated " + counts.updated);
  if (counts.skipped) parts.push("left " + counts.skipped + " as they were");
  if (counts.rejected) parts.push("couldn't read " + counts.rejected);
  return "Backup read: " + parts.join(", ") + ".";
}

function readBackup(file) {
  var reader;
  if (file.size > 2000000) {
    setStatus("That file is too big to be a scorecard backup.");
    return;
  }
  reader = new FileReader();
  reader.onload = function () {
    var data;
    var list;
    var counts;
    try {
      data = JSON.parse(String(reader.result));
    } catch (error) {
      setStatus("That file isn't a Fairway Ledger backup.");
      return;
    }
    list = roundsFromBackup(data);
    if (!list) {
      setStatus("That file isn't a Fairway Ledger backup.");
      return;
    }
    if (list.length > MAX_IMPORT) {
      setStatus("That file has too many rounds to be a scorecard backup.");
      return;
    }
    counts = mergeRounds(list);
    storageOk = persistBook();
    setStatus(importMessage(counts));
    view = "history";
    render();
  };
  reader.onerror = function () {
    setStatus("Couldn't read that file.");
  };
  reader.readAsText(file);
}

// ----- Startup ------------------------------------------------------

function init() {
  var viewRoot = document.getElementById("view");
  var dialogRoot = document.getElementById("dialog-root");
  book = loadBook();
  if (activeRound()) {
    activeHoleIndex = firstUnplayed(activeRound());
    view = "card";
  } else {
    book.activeId = null;
    view = "setup";
  }
  document.getElementById("nav-score").addEventListener("click", function () {
    view = activeRound() ? "card" : "setup";
    render({ focusView: true });
  });
  document.getElementById("nav-history").addEventListener("click", function () {
    view = "history";
    setStatus("");
    render({ focusView: true });
  });
  viewRoot.addEventListener("click", onViewClick);
  viewRoot.addEventListener("input", onViewInput);
  viewRoot.addEventListener("change", onViewChange);
  viewRoot.addEventListener("submit", onViewSubmit);
  viewRoot.addEventListener("focusout", onViewFocusOut);
  dialogRoot.addEventListener("click", function (event) {
    var button = event.target.closest ? event.target.closest("[data-choice]") : null;
    if (button) {
      settleDialog(button.dataset.choice);
      return;
    }
    if (event.target === dialogRoot) settleDialog("cancel");
  });
  document.addEventListener("keydown", onKeydown);
  render();
}

if (typeof document !== "undefined") {
  init();
}
