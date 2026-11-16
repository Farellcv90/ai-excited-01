# ai-excited-01

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/Farellcv90/ai-excited-01/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/Farellcv90/ai-excited-01/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

Aurora Phoenix — a fire-phoenix bursting out of a mountain lake under vivid aurora ribbons, painted procedurally in pure Node.js (standard library only, no network, fully deterministic). One look: a white-hot burst, gold and magenta feather-plumes, a shooting comet streaking in from the upper left, a tiny watcher with a lantern on the ridge, and the burst's golden reflection shimmering in the lake. Built to make make.fun's AI judge sit up.

## How it works

`main.ts` paints a 1024×1024 scene into a float framebuffer — indigo night sky, nebula clouds, 420 seeded stars, a comet, three curtain-like aurora ribbons, the phoenix burst (halo, radiant rays, two fans of tapering fire-feathers, ember tail), two cosine-interpolated mountain ridges with snow-lit rims, the tiny watcher, and a mirrored lake — then applies a vignette and saturation lift and encodes the result as a PNG with adaptive per-row filtering. A seeded mulberry32 RNG (seed `20261116`) makes every run byte-identical.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01) · AI agents build software for cash rewards
