# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Avans Attack": a browser-based 2D top-down pixel-art shooter set in the Avans Hogeschoollaan building in Breda. It uses plain HTML5 Canvas and vanilla JavaScript, with no build step, dependencies, package manager or test framework. All in-game text is Dutch.

## Running

Open `index.html` directly in a browser (it works over `file://`). On Windows, use `Start-Process index.html`.

There is no lint or test tooling. To check changes without a human, run headless Edge/Chrome:
- `--headless=new --allow-file-access-from-files --dump-dom <url>` runs a small harness page. The harness loads the `js/*.js` files in the same order as `index.html`, then drives `Game.start()` / `Game.update(1/60)` in a loop, setting `Input.mouse.x/y/down` to aim at enemies. It writes results and `window.onerror` output into the DOM.
- `--screenshot=<file> --window-size=960,540 --virtual-time-budget=3000 <url>` takes a screenshot for a visual check.
- Keep harness files outside the repo, in a scratch directory.

## Architecture

**No modules: everything is a global.** Each `js/*.js` is a classic `<script>`, so ES modules are deliberately avoided (they fail over `file://`). Files share top-level `const`/`class` names. Two consequences:
- **Load order in `index.html` matters**: font → audio → input → sprites → world → levels → bullets → player → enemies → ui → main.
- **Duplicate top-level names across files throw.** Cross-file references inside functions are resolved at call time. `Game`, `clamp`, `VIEW_W`/`VIEW_H` are defined last in `main.js`, but earlier files use them at runtime.

**Game loop (`main.js`).** The loop uses a fixed 60 Hz timestep (`Game.update(STEP)`, up to 5 steps per frame), then one `Game.render()`. Rendering happens at a 480×270 internal resolution, and CSS scales the canvas up with `image-rendering: pixelated`.
- `Input.endFrame()` (which clears one-shot key presses and clicks) only runs when at least one update step ran. This keeps clicks from being lost on high-refresh-rate frames.
- `Game.state` is one of `menu | playing | paused | gameover | victory`.
- **Menu and overlay buttons are handled during render**, not update: `UI.button()` draws the button and consumes the click.

**Level flow.** `Game.loadLevel(i)` builds a `World` from `LEVELS[i]`. Then:
- Waves start after a delay. `startWave` shuffles a spawn queue from the wave definition; the boss always spawns first.
- A wave ends when its queue is empty and no enemies are alive. After the last wave, `completeLevel()` opens the exit (`X` tiles become walkable for the player), and touching it loads the next level.
- On the final level, beating the boss gives victory instead of opening an exit. Boss death also kills any remaining enemies.
- `levelKills / levelTotal` drives the HUD progress bar. Enemies summoned by the boss (`summoned = true`) don't count toward it.

**Maps (`levels.js` + `world.js`).** Maps are arrays of strings, one character per 16 px tile. The full tile legend is at the top of `world.js`.
- Short rows are padded with `#`. All current maps are exactly 40 wide.
- `p` marks the player start; `D` (doors) and `S` (stairs) tiles are enemy spawn points.
- Tiles are either high (walls, block everything) or low (furniture, `LOW_TILES`, which bullets fly over). `World.solid(tx, ty, mode)` decides passability per mode:
  - `player`: blocked by doors, by low tiles, and by `X` until the exit opens.
  - `walker`: can pass through doors, but not low tiles.
  - `flyer`: can pass through doors and low tiles.
  - `bullet`: stopped by walls and doors only.
- **A spawn door needs a walkable tile next to it**, or enemies get stuck in it.
- The static map is pre-rendered once to an offscreen canvas. Only the exit doors are drawn every frame (`drawDynamic`). `signs` are text plates placed in tile units.

**Entities.** `x`, `y` is the **sprite center**. Wall collision uses a separate foot box: `x ± hw`, from `y + fy0` to `y + fy1`. Hits use a circle of radius `r` around (`x`, `y`).
- `World.move()` resolves movement one axis at a time, so entities slide along walls.
- Depth sorting uses `sortY`. Each actor implements `drawShadow` and `draw`.

**Pathfinding.** `World.updateFlow()` runs a BFS from the player's tile using `walker` passability, and recomputes only when the player changes tile. `flowTarget()` gives each enemy the next tile toward the player. It returns `null` (meaning "move straight at the player") when the enemy is adjacent to the player or on an unreachable tile, such as a flyer over furniture.

**Enemies.** Stats live in `ENEMY_TYPES` in `enemies.js`. Per-level speed and spawn pacing come from `speedMul`, `spawnInterval` and `maxAlive` in each level definition. The boss AI (`bossAI`) has 3 HP-based phases.

**Art and audio are generated in code.** `sprites.js` paints palette-keyed string rows, plus some procedural drawing, into canvases at load time. `audio.js` synthesizes all music and sound effects with Web Audio. It only starts after the first user input (`Sound.init()` is called from the input handlers).

**Text.** `PixelFont` is a custom 3×5 font. It covers only A–Z, 0–9 and a few punctuation marks, and lowercase is converted to uppercase. Avoid accented characters (é, ë), which render as `?`.

## Git workflow

The remote is `origin` → https://github.com/meauxmaier-bit/avans-attack (private), on branch `main`. After every change, make a clean, descriptive commit (one logical change per commit) and `git push`. The user has asked for this standing workflow so every version can be restored.
