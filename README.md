# Mentat

A mental arithmetic speed drill that runs in the browser. You get two minutes to solve as many problems as you can. The next problem appears the moment your answer is right, so there is no Enter key and no skipping. A wrong answer just stays in the box until you fix it.

Play it at **https://prathammukewar.github.io/mentat/**

## What it does

- **Classic mode** uses the classic Zetamac settings: addition with both numbers from 2 to 100, multiplication from 2 to 12 times 2 to 100, and subtraction and division as those problems in reverse, so answers are always positive whole numbers.
- **Custom games** let you pick the operations, the number ranges, and a length of 30, 60, 120 or 300 seconds.
- **Results** show your score, problems per minute, average time for each operation, your five slowest problems and your personal best.
- **History** keeps every run in your browser and graphs your scores over time. Nothing is sent anywhere.
- **On a phone** you get a large keypad that reacts on touch-down and never opens the system keyboard. On a computer the answer box is focused for you and the number pad works.
- **Over or under** is a second mode. You see a hard problem (4-digit plus or minus 4-digit, 4-digit times or divided by a 2-digit number, or the square root of a 4-digit number) and a whole number within 4 of the answer, never equal to it. You have 5 seconds to say whether that number is over or under the true answer. A run is 20 problems, a timeout counts as wrong, and the results list every miss with the exact answer. Use the arrow keys or the two buttons.
- Reload during a game to start a fresh one, press Enter on the results screen to play again, and press Esc to quit.

Head-to-head play on a shared problem stream is next.

## Same seed, same problems

Problems come from a seeded generator (xoshiro128**, seeded through splitmix32), never from `Math.random`. Each problem is computed from the seed and its position in the game, so a seed always produces the same problems in every browser. The results screen shows the seed, and "Same problems" replays it.

The tests pin this down with golden sequences that are checked in Node and in Chromium, Firefox, WebKit, and phone emulation.

## Running it locally

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (generator, ratings, run format, stats)
npx playwright install
npm run test:e2e     # browser tests, including a keystroke latency check
npm run build        # static site in dist/
```

The code is split into `core/` (generator, scoring, Glicko-2 ratings, the compact run format) and `web/` (the site, plain TypeScript with no framework).

## License

MIT
