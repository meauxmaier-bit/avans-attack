# Avans Attack – Hogeschoollaan Breda

Een 2D top-down pixel-art shooter die zich afspeelt in het Avans-gebouw aan de Hogeschoollaan in Breda.

## Spelen
Open `index.html` in een browser (Chrome, Edge of Firefox). Er is geen installatie of server nodig.

| Toets | Actie |
|---|---|
| Pijltjes / WASD | Lopen |
| Muis | Richten |
| Klik (ingedrukt houden) | Schieten |
| P / Esc | Pauze |
| M | Geluid aan/uit |

## Levels
1. **Het Atrium**: zombie-studenten (tutorial)
2. **De Gangen**: lokalen HA201–HA206, nu ook bugs
3. **De Kantine**: deadline-monsters die terugschieten
4. **Het Trappenhuis**: vijanden komen van alle trappen
5. **De Examenzaal**: eindbaas *De Tentamencommissie*

Pickups: koffie (+25 HP) en energydrink (6 sec sneller schieten).

## Code
| Bestand | Inhoud |
|---|---|
| `js/main.js` | Gameloop, states, golven en levels |
| `js/levels.js` | Kaarten en golfdata (makkelijk aan te passen) |
| `js/world.js` | Tegels tekenen, botsingen, pathfinding |
| `js/player.js` / `js/enemies.js` | Speler en vijanden |
| `js/bullets.js` | Kogels, pickups en effecten |
| `js/sprites.js` | Alle pixel-art (in code getekend) |
| `js/ui.js` | Menu, HUD en eindschermen |
| `js/audio.js` | Chiptune-geluid via de Web Audio API |
| `js/font.js` | Pixel-font |
