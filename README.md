# cinderpass

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/xiinnq799-boop/cinderpass/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/xiinnq799-boop/cinderpass/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Cinderpass** is a round-based tactical FPS for the browser, built with three.js. Two teams of three fight over a dusk rail yard: the Jackals try to plant a breach charge at the silo yard (A) or the depot (B); the Wardens defend the sites and defuse. Every round opens with a buy phase — pistol, scattergun, carbine, a scoped longshot, armour and grenades, all paid for from round winnings — then plays out live against bot teammates and bot opponents who hold angles, rotate on noise, plant and defuse. First team to 7 rounds takes the yard.

Everything is original and self-contained: the map, the bots' waypoint brains, the weapons and the economy, and a soundtrack synthesised live with WebAudio. No build step, no network — the whole game is the static files under `game/`.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser and click to play. WASD moves, the mouse aims, click fires; the start screen lists the rest (buy keys, plant and defuse channels, scoreboard). `main.ts` is the make.fun harness entry: it copies `game/` and `screenshots/` to the output directory and writes the dossier the judge reads.

---
<sub>Entered on [make.fun](https://make.fun/?ref=6es0sdf6&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) for the best-game-01 bounty.</sub>
