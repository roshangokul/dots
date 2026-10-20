# dots

A small physics playground. Pick a color, then click or tap to drop a circle. Circles bounce; matching colors merge and preserve their combined area.

## Play locally

Open `dist/index.html` directly in a browser. No installation, API keys, or build step needed.

Or serve the files:

```sh
cd dist
python3 -m http.server 8000
```

Open http://localhost:8000.

## Controls

- Click or tap the playground to drop a dot.
- Pick colors from the palette or use keys 1–8.
- Space drops a dot at the pointer (or the center).
- R / Start fresh resets the playground.
- Toggle sound with the music button.
- Slow motion and drop guide options are in the sidebar on larger screens.

## Files

- `dist/index.html`: interface and styling
- `dist/game.js`: canvas rendering, physics, collisions, sound, and input

Built with plain HTML, CSS, and JavaScript. Physics uses a fixed timestep with collision impulses and area-conserving merges.
