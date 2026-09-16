"use strict";

const SIZE = 10;
const FLEET = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 }
];
const LETTERS = "ABCDEFGHIJ";

const el = {
  status: document.getElementById("status"),
  setup: document.getElementById("setup"),
  shipList: document.getElementById("ship-list"),
  rotate: document.getElementById("rotate-btn"),
  randomize: document.getElementById("randomize-btn"),
  clear: document.getElementById("clear-btn"),
  start: document.getElementById("start-btn"),
  playerBoard: document.getElementById("player-board"),
  enemyBoard: document.getElementById("enemy-board"),
  playerFleet: document.getElementById("player-fleet"),
  enemyFleet: document.getElementById("enemy-fleet"),
  log: document.getElementById("log"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText: document.getElementById("overlay-text"),
  again: document.getElementById("again-btn")
};

let state;

function idx(r, c) { return r * SIZE + c; }
function rowOf(i) { return Math.floor(i / SIZE); }
function colOf(i) { return i % SIZE; }
function label(i) { return LETTERS[rowOf(i)] + (colOf(i) + 1); }

function newSide() {
  return {
    ships: FLEET.map(s => ({ name: s.name, size: s.size, cells: [], hits: 0, sunk: false })),
    occupancy: new Array(SIZE * SIZE).fill(-1),
    shots: new Array(SIZE * SIZE).fill(null) // null | "miss" | "hit"
  };
}

function shipCells(start, size, horizontal) {
  const r = rowOf(start);
  const c = colOf(start);
  if (horizontal ? c + size > SIZE : r + size > SIZE) return null;
  const cells = [];
  for (let k = 0; k < size; k++) {
    cells.push(horizontal ? idx(r, c + k) : idx(r + k, c));
  }
  return cells;
}

function canPlace(side, start, size, horizontal) {
  const cells = shipCells(start, size, horizontal);
  if (!cells) return null;
  if (cells.some(i => side.occupancy[i] !== -1)) return null;
  return cells;
}

function placeShip(side, shipIndex, cells) {
  const ship = side.ships[shipIndex];
  ship.cells = cells;
  cells.forEach(i => { side.occupancy[i] = shipIndex; });
}

function unplaceShip(side, shipIndex) {
  const ship = side.ships[shipIndex];
  ship.cells.forEach(i => { side.occupancy[i] = -1; });
  ship.cells = [];
}

function randomizeSide(side) {
  side.occupancy.fill(-1);
  side.ships.forEach(s => { s.cells = []; });
  side.ships.forEach((ship, shipIndex) => {
    for (;;) {
      const horizontal = Math.random() < 0.5;
      const start = Math.floor(Math.random() * SIZE * SIZE);
      const cells = canPlace(side, start, ship.size, horizontal);
      if (cells) { placeShip(side, shipIndex, cells); break; }
    }
  });
}

// --- shot resolution -------------------------------------------------------

function fire(side, i) {
  if (side.shots[i] !== null) return { repeat: true };
  const shipIndex = side.occupancy[i];
  if (shipIndex === -1) {
    side.shots[i] = "miss";
    return { hit: false };
  }
  side.shots[i] = "hit";
  const ship = side.ships[shipIndex];
  ship.hits++;
  if (ship.hits === ship.size) ship.sunk = true;
  return { hit: true, ship, sunk: ship.sunk };
}

function allSunk(side) { return side.ships.every(s => s.sunk); }

// --- AI --------------------------------------------------------------------

function newAI() {
  return { queue: [], hits: [] };
}

function neighbors(i) {
  const r = rowOf(i);
  const c = colOf(i);
  const out = [];
  if (r > 0) out.push(idx(r - 1, c));
  if (r < SIZE - 1) out.push(idx(r + 1, c));
  if (c > 0) out.push(idx(r, c - 1));
  if (c < SIZE - 1) out.push(idx(r, c + 1));
  return out;
}

function aiChooseTarget(side, ai) {
  // Target mode: follow up on unresolved hits.
  while (ai.queue.length) {
    const i = ai.queue.shift();
    if (side.shots[i] === null) return i;
  }
  // Hunt mode: parity search, since the smallest ship is 2 cells long.
  const untouched = [];
  const parity = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (side.shots[i] !== null) continue;
    untouched.push(i);
    if ((rowOf(i) + colOf(i)) % 2 === 0) parity.push(i);
  }
  const pool = parity.length ? parity : untouched;
  return pool[Math.floor(Math.random() * pool.length)];
}

function aiRegisterResult(ai, i, result) {
  if (!result.hit) return;
  if (result.sunk) {
    const sunkCells = new Set(result.ship.cells);
    ai.hits = ai.hits.filter(h => !sunkCells.has(h));
    ai.queue = ai.queue.filter(q => !sunkCells.has(q));
    if (!ai.hits.length) ai.queue = [];
    return;
  }
  ai.hits.push(i);
  const aligned = ai.hits.filter(h => rowOf(h) === rowOf(i) || colOf(h) === colOf(i));
  if (aligned.length > 1) {
    // Two or more hits on a line: extend along that axis first.
    const sameRow = aligned.filter(h => rowOf(h) === rowOf(i));
    const sameCol = aligned.filter(h => colOf(h) === colOf(i));
    const line = sameRow.length > 1 ? sameRow : sameCol;
    if (line.length > 1) {
      const horizontal = line === sameRow;
      const coords = line.map(h => (horizontal ? colOf(h) : rowOf(h))).sort((a, b) => a - b);
      const fixed = horizontal ? rowOf(i) : colOf(i);
      const ends = [coords[0] - 1, coords[coords.length - 1] + 1];
      const next = ends
        .filter(v => v >= 0 && v < SIZE)
        .map(v => (horizontal ? idx(fixed, v) : idx(v, fixed)));
      ai.queue = next.concat(ai.queue);
      return;
    }
  }
  ai.queue = neighbors(i).concat(ai.queue);
}

// --- rendering -------------------------------------------------------------

function buildBoard(container, onClick, onHover, onLeave) {
  container.innerHTML = "";
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = String(i);
    cell.setAttribute("aria-label", label(i));
    if (onClick) cell.addEventListener("click", () => onClick(i));
    if (onHover) cell.addEventListener("mouseenter", () => onHover(i));
    if (onLeave) cell.addEventListener("mouseleave", () => onLeave(i));
    container.appendChild(cell);
  }
}

function renderSide(container, side, revealShips, lastShot) {
  const cells = container.children;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const shipIndex = side.occupancy[i];
    const ship = shipIndex === -1 ? null : side.ships[shipIndex];
    const shot = side.shots[i];
    let cls = "cell";
    if (shot === "hit") cls += ship && ship.sunk ? " sunk" : " hit";
    else if (shot === "miss") cls += " miss";
    else if (revealShips && ship) cls += " ship";
    if (lastShot === i) cls += " last-shot";
    cells[i].className = cls;
  }
}

function renderFleetStatus(listEl, side) {
  listEl.innerHTML = "";
  side.ships.forEach(ship => {
    const li = document.createElement("li");
    li.className = ship.sunk ? "sunk" : "";
    const name = document.createElement("span");
    name.textContent = `${ship.name} (${ship.size})`;
    const status = document.createElement("span");
    status.textContent = ship.sunk ? "SUNK" : `${ship.hits}/${ship.size}`;
    li.append(name, status);
    listEl.appendChild(li);
  });
}

function renderShipList() {
  el.shipList.innerHTML = "";
  state.player.ships.forEach((ship, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${ship.name} (${ship.size})`;
    const placed = ship.cells.length > 0;
    btn.className = (placed ? "placed" : "") + (state.selectedShip === i ? " selected" : "");
    btn.addEventListener("click", () => {
      state.selectedShip = i;
      setStatus(placed ? `Click a cell to reposition the ${ship.name}.` : `Place the ${ship.name}.`);
      render();
    });
    li.appendChild(btn);
    el.shipList.appendChild(li);
  });
}

function setStatus(text) { el.status.textContent = text; }

function log(text) {
  const li = document.createElement("li");
  li.textContent = text;
  el.log.prepend(li);
}

function render() {
  renderSide(el.playerBoard, state.player, true, state.lastAiShot);
  renderSide(el.enemyBoard, state.enemy, false, state.lastPlayerShot);
  renderFleetStatus(el.playerFleet, state.player);
  renderFleetStatus(el.enemyFleet, state.enemy);
  if (state.phase === "setup") {
    renderShipList();
    el.setup.classList.remove("hidden");
    el.start.disabled = !state.player.ships.every(s => s.cells.length > 0);
    el.rotate.textContent = `Rotate: ${state.horizontal ? "Horizontal" : "Vertical"}`;
  } else {
    el.setup.classList.add("hidden");
  }
}

function previewPlacement(i) {
  if (state.phase !== "setup" || state.selectedShip === null) return;
  const ship = state.player.ships[state.selectedShip];
  const own = new Set(ship.cells);
  const cells = shipCells(i, ship.size, state.horizontal);
  const ok = cells && cells.every(c => state.player.occupancy[c] === -1 || own.has(c));
  const target = cells || [i];
  target.forEach(c => {
    el.playerBoard.children[c].classList.add(ok ? "preview" : "preview-bad");
  });
}

function clearPreview() {
  Array.from(el.playerBoard.children).forEach(c => {
    c.classList.remove("preview", "preview-bad");
  });
}

// --- game flow -------------------------------------------------------------

function onPlayerBoardClick(i) {
  if (state.phase !== "setup" || state.selectedShip === null) return;
  const shipIndex = state.selectedShip;
  const ship = state.player.ships[shipIndex];
  const previousCells = ship.cells;
  if (previousCells.length) unplaceShip(state.player, shipIndex);
  const cells = canPlace(state.player, i, ship.size, state.horizontal);
  if (!cells) {
    if (previousCells.length) {
      placeShip(state.player, shipIndex, previousCells);
      setStatus(`That placement doesn't fit. The ${ship.name} stays where it was.`);
    } else {
      setStatus("That placement doesn't fit. Try another cell.");
    }
    clearPreview();
    render();
    return;
  }
  placeShip(state.player, shipIndex, cells);
  const next = state.player.ships.findIndex(s => s.cells.length === 0);
  state.selectedShip = next === -1 ? null : next;
  setStatus(next === -1 ? "Fleet ready — press Start Game." : "Place your next ship.");
  clearPreview();
  render();
}

function onEnemyBoardClick(i) {
  if (state.phase !== "player") return;
  if (state.enemy.shots[i] !== null) {
    setStatus("You already fired at " + label(i) + ". Pick another cell.");
    return;
  }
  const result = fire(state.enemy, i);
  state.lastPlayerShot = i;
  if (result.sunk) log(`You sank the enemy ${result.ship.name}!`);
  else log(`You fired at ${label(i)} — ${result.hit ? "hit" : "miss"}.`);
  render();

  if (allSunk(state.enemy)) { endGame(true); return; }

  state.phase = "ai";
  setStatus("Enemy is taking aim…");
  setTimeout(aiTurn, 650);
}

function aiTurn() {
  if (state.phase !== "ai") return;
  const i = aiChooseTarget(state.player, state.ai);
  const result = fire(state.player, i);
  state.lastAiShot = i;
  aiRegisterResult(state.ai, i, result);
  if (result.sunk) log(`Enemy sank your ${result.ship.name}!`);
  else log(`Enemy fired at ${label(i)} — ${result.hit ? "hit" : "miss"}.`);
  render();

  if (allSunk(state.player)) { endGame(false); return; }

  state.phase = "player";
  setStatus("Your turn — fire at Enemy Waters.");
}

function endGame(playerWon) {
  state.phase = "over";
  setStatus(playerWon ? "Victory! Enemy fleet destroyed." : "Defeat. Your fleet is gone.");
  render();
  el.overlayTitle.textContent = playerWon ? "Victory!" : "Defeat";
  el.overlayText.textContent = playerWon
    ? "You sank the entire enemy fleet."
    : "The enemy sank your entire fleet.";
  el.overlay.classList.remove("hidden");
}

function newGame() {
  state = {
    phase: "setup",
    player: newSide(),
    enemy: newSide(),
    ai: newAI(),
    horizontal: true,
    selectedShip: 0,
    lastPlayerShot: null,
    lastAiShot: null
  };
  randomizeSide(state.enemy);
  el.overlay.classList.add("hidden");
  el.log.innerHTML = "";
  setStatus("Place your fleet to begin.");
  render();
}

function startGame() {
  if (!state.player.ships.every(s => s.cells.length > 0)) return;
  state.phase = "player";
  state.selectedShip = null;
  setStatus("Your turn — fire at Enemy Waters.");
  log("Battle started. You fire first.");
  render();
}

// --- wiring ----------------------------------------------------------------

buildBoard(el.playerBoard, onPlayerBoardClick, i => { clearPreview(); previewPlacement(i); }, clearPreview);
buildBoard(el.enemyBoard, onEnemyBoardClick);

el.rotate.addEventListener("click", () => {
  state.horizontal = !state.horizontal;
  render();
});
el.randomize.addEventListener("click", () => {
  randomizeSide(state.player);
  state.selectedShip = null;
  setStatus("Fleet randomized — press Start Game.");
  render();
});
el.clear.addEventListener("click", () => {
  state.player = newSide();
  state.selectedShip = 0;
  setStatus("Board cleared. Place your fleet.");
  render();
});
el.start.addEventListener("click", startGame);
el.again.addEventListener("click", newGame);

document.addEventListener("keydown", e => {
  if (e.key === "r" || e.key === "R") {
    if (state.phase === "setup") {
      state.horizontal = !state.horizontal;
      render();
    }
  }
});

newGame();
