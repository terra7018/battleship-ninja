# Battleship Ninja

A browser-based Battleship game: you versus an AI opponent. Pure client-side HTML/CSS/JavaScript — no build step, no backend.

**Play it:** https://terra7018.github.io/battleship-ninja/

## Rules

- Two 10x10 grids: **Your Fleet** (ships visible) and **Enemy Waters** (fog of war — only your hits and misses are revealed).
- Standard fleet per side: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).
- Place your ships manually (select a ship, press `R` or the rotate button to change orientation, click a cell) or hit **Randomize**. The enemy fleet is placed randomly each game.
- You fire first, then the AI, alternating. Firing at a cell you already attacked is rejected and does not use your turn.
- A ship is sunk when all of its segments are hit; sunk ships are highlighted and listed in the fleet status panel.
- The game ends when one side's entire fleet is sunk, and a win/lose screen with **Play Again** appears.

## AI

The AI runs a hunt/target search: it hunts on a checkerboard parity pattern (the smallest ship is 2 cells, so half the cells suffice to find every ship), and on a hit it switches to targeting adjacent cells. Once two hits line up it locks onto that axis and extends from both ends until the ship sinks, then returns to hunting.

## Run locally

Clone and open `index.html` directly in a browser, or serve the folder:

```bash
git clone https://github.com/terra7018/battleship-ninja.git
cd battleship-ninja
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

- `index.html` — markup and layout
- `style.css` — styling, responsive layout (boards stack below 760px)
- `game.js` — board model, placement, shot resolution, AI, rendering
