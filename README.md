# Stick Showdown

A high-noon stickman brawl — a small browser fighting game set on desert
paper: ink fighters, hard noon shadows, one terracotta accent.

Fight waves of bandits, scouts, slingers and brutes, then face a bigger boss
at the end of every level. Land hits to build your score multiplier; getting
hit resets it. Dash through attacks — you are briefly invulnerable, and a
perfectly timed dash empowers your next blow (the *desert counter*).

- **5 levels** with 2–3 waves each and a boss finale
- **5 weapons**, one unlocked per cleared level: Fists → Stick → Machete →
  Spear (pierces) → Sledge (quakes the ground)
- **5 bosses**, each bigger than the last: Cactus Jack, Sidewinder, The
  Vulture, Dust Titan, El Sol — every attack is telegraphed, and each boss
  enrages below half health
- Score, medals (bronze/silver/gold), best runs and unlocks saved locally
- All sound effects are synthesized in the browser (WebAudio, no assets)
- English (default), French and Spanish; touch controls on mobile

## Play

Open `index.html` in any modern browser — it is fully standalone
(everything inlined). Keyboard: **A/D** or arrows to move, **W/Space** to
jump, **J/X** to attack, **K/Shift** to dash, **Esc** to pause.
On touch screens, on-screen buttons appear automatically.

## Repository layout

- `index.html` — the game, built standalone (this is what you play)
- `index.src.html` + `assets/` — readable sources: `config.js` (weapons,
  enemies, levels, bosses, scoring), `engine.js` (physics, combat, AI),
  `render.js` (canvas drawing, stickman poses), `audio.js` (WebAudio
  synthesis), `i18n.js` (EN/FR/ES), `ui.js` (screens, input, loop, saves),
  `style.css`
- `cover.png` — catalogue cover
- `LOB7-GAME.json`, `LOB7-ATTRIBUTION.json` — LOB7 publishing metadata

The build tool (inlines sources into `index.html`) and the test suite live
in the workshop development directory, outside this repository. To rebuild:
concatenate the assets per `index.src.html` order, or simply edit the
sources and re-inline them; `index.html` must stay 100% self-contained.

## Tests

The engine, data balance and localizations are covered by 20 automated
tests (`node --test`), including a full scripted playthrough of level 1
(waves, boss, victory bonuses) and balance thresholds reviewed by
Kimi K3.1 Pro.

## Credits & license

A game by Cédric Bernadac, created with AI agents (ZCode & Kimi K3.1 Pro).
Code under the MIT license — see `LICENSE`.
