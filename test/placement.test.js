// Headless tests for setup-phase placement. Run with: node test/placement.test.js
// Requires jsdom: npm install jsdom

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), { runScripts: "outside-only" });
dom.window.eval(
  fs.readFileSync(path.join(root, "game.js"), "utf8") +
  "\n;globalThis.__api = { state: () => state, onPlayerBoardClick, newGame, placeShip, canPlace };"
);
const api = dom.window.__api;
const idx = (r, c) => r * 10 + c;
// game.js runs inside the jsdom realm, so its arrays have a different Array
// prototype; copy them before comparing.
const cellsOf = ship => Array.from(ship.cells);

function freshSetup() {
  api.newGame();
  const st = api.state();
  st.horizontal = true;
  // Carrier(5) A1-A5, Battleship(4) C1-C4, rest out of the way.
  const layout = [idx(0, 0), idx(2, 0), idx(4, 0), idx(6, 0), idx(8, 0)];
  st.player.ships.forEach((ship, i) => {
    api.placeShip(st.player, i, api.canPlace(st.player, layout[i], ship.size, true));
  });
  return st;
}

function test(name, fn) {
  fn();
  console.log("ok -", name);
}

test("valid reposition moves the ship", () => {
  const st = freshSetup();
  const before = cellsOf(st.player.ships[4]); // Destroyer at I1-I2
  st.selectedShip = 4;
  api.onPlayerBoardClick(idx(9, 5)); // J6-J7, empty water
  const after = cellsOf(st.player.ships[4]);
  assert.deepStrictEqual(after, [idx(9, 5), idx(9, 6)]);
  assert.notDeepStrictEqual(after, before);
  before.forEach(c => assert.strictEqual(st.player.occupancy[c], -1, "old cells freed"));
  after.forEach(c => assert.strictEqual(st.player.occupancy[c], 4, "new cells occupied"));
});

test("overlapping reposition leaves the ship where it was", () => {
  const st = freshSetup();
  const before = cellsOf(st.player.ships[4]);
  st.selectedShip = 4;
  api.onPlayerBoardClick(idx(0, 1)); // would overlap the Carrier on row A
  assert.deepStrictEqual(cellsOf(st.player.ships[4]), before);
  before.forEach(c => assert.strictEqual(st.player.occupancy[c], 4));
  assert.ok(st.player.ships.every(s => s.cells.length === s.size), "fleet still complete");
});

test("off-board reposition leaves the ship where it was", () => {
  const st = freshSetup();
  const before = cellsOf(st.player.ships[0]); // Carrier, size 5
  st.selectedShip = 0;
  api.onPlayerBoardClick(idx(5, 7)); // needs columns 8-12
  assert.deepStrictEqual(cellsOf(st.player.ships[0]), before);
  before.forEach(c => assert.strictEqual(st.player.occupancy[c], 0));
});

test("failed reposition keeps Start Game enabled", () => {
  const st = freshSetup();
  st.selectedShip = 4;
  api.onPlayerBoardClick(idx(0, 1));
  assert.strictEqual(dom.window.document.getElementById("start-btn").disabled, false);
});

test("selecting a placed ship does not unplace it", () => {
  const st = freshSetup();
  const before = cellsOf(st.player.ships[2]);
  dom.window.document.querySelectorAll("#ship-list button")[2].click();
  assert.deepStrictEqual(cellsOf(st.player.ships[2]), before);
  assert.strictEqual(st.selectedShip, 2);
});

test("occupancy never leaks after repeated failed repositions", () => {
  const st = freshSetup();
  st.selectedShip = 3;
  for (let k = 0; k < 20; k++) api.onPlayerBoardClick(idx(0, 1));
  assert.strictEqual(st.player.occupancy.filter(x => x !== -1).length, 17);
});

console.log("all placement tests passed");
