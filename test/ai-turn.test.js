// Headless tests for the AI turn delay. Run with: node test/ai-turn.test.js
// Requires jsdom: npm install jsdom

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), { runScripts: "outside-only" });

// Virtual clock: the game schedules the AI turn with setTimeout/setInterval, so
// drive those by hand instead of waiting three real seconds.
let now = 0;
let nextTimerId = 1;
const timers = new Map();
dom.window.setTimeout = (fn, ms) => {
  const id = nextTimerId++;
  timers.set(id, { fn, due: now + (ms || 0), every: null });
  return id;
};
dom.window.setInterval = (fn, ms) => {
  const id = nextTimerId++;
  timers.set(id, { fn, due: now + (ms || 0), every: ms || 1 });
  return id;
};
dom.window.clearTimeout = id => timers.delete(id);
dom.window.clearInterval = id => timers.delete(id);

function advance(ms) {
  const target = now + ms;
  for (;;) {
    let next = null;
    for (const [id, t] of timers) if (t.due <= target && (next === null || t.due < timers.get(next).due)) next = id;
    if (next === null) break;
    const t = timers.get(next);
    now = t.due;
    if (t.every === null) timers.delete(next);
    else t.due = now + t.every;
    t.fn();
  }
  now = target;
}

dom.window.eval(
  fs.readFileSync(path.join(root, "game.js"), "utf8") +
  "\n;globalThis.__api = { state: () => state, onEnemyBoardClick, newGame, startGame, randomizeSide, AI_TURN_DELAY_MS };"
);
const api = dom.window.__api;
const status = () => dom.window.document.getElementById("status").textContent;

function test(name, fn) {
  fn();
  console.log("ok -", name);
}

function battle() {
  api.newGame();
  const st = api.state();
  api.randomizeSide(st.player);
  api.startGame();
  return st;
}

test("AI waits 3 seconds before firing", () => {
  assert.strictEqual(api.AI_TURN_DELAY_MS, 3000);
  const st = battle();
  api.onEnemyBoardClick(0);
  assert.strictEqual(st.phase, "ai");
  advance(2999);
  assert.strictEqual(st.player.shots.filter(s => s !== null).length, 0, "AI fired before the delay elapsed");
  assert.strictEqual(st.phase, "ai");
  advance(1);
  assert.strictEqual(st.player.shots.filter(s => s !== null).length, 1, "AI fires once the delay elapses");
  assert.strictEqual(st.phase, "player");
});

test("status counts the wait down", () => {
  const st = battle();
  api.onEnemyBoardClick(0);
  assert.ok(status().endsWith("3"), status());
  advance(1000);
  assert.ok(status().endsWith("2"), status());
  advance(1000);
  assert.ok(status().endsWith("1"), status());
  advance(1000);
  assert.ok(status().startsWith("Your turn"), status());
  assert.strictEqual(st.phase, "player");
});

test("a pending AI shot is dropped when a new game starts", () => {
  battle();
  api.onEnemyBoardClick(0);
  advance(1500);
  const st = battle();
  advance(5000);
  assert.strictEqual(st.player.shots.filter(s => s !== null).length, 0, "stale AI shot leaked into the new game");
  assert.strictEqual(st.phase, "player");
});

test("one player shot schedules exactly one AI shot", () => {
  const st = battle();
  api.onEnemyBoardClick(0);
  api.onEnemyBoardClick(1); // ignored: not the player's phase
  advance(10000);
  assert.strictEqual(st.player.shots.filter(s => s !== null).length, 1);
  assert.strictEqual(st.enemy.shots.filter(s => s !== null).length, 1);
});

console.log("all AI turn tests passed");
