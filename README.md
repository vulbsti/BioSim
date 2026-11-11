# BioSim

A rough, moving picture of what is happening inside a body: blood, oxygen, food and a few hormones flowing between organs, and the organs responding. The 3D body is the whole screen; you try something (a meal, a glass of water, exercise) and watch it travel.

The goal is to start the body from what a person can measure about themselves (blood tests, a glucose sensor, a fitness band, later EEG and gut microbiome reports), so they can see and understand what is probably happening inside them. It is an illustration, not a diagnosis.

Read [the vision, plan and verification gates](docs/VISION.md) before adding anything. Every change must pass both gates there: it visibly works as intended, and it serves the goal with nothing extra.

## What is on screen

- **The body.** BodyParts3D adult anatomy, with heart chambers and valves driven by a four-chamber solver, breathing, gut motion, bladder filling, and blood beads that follow simulated organ flows.
- **Colour by.** Tint blood and organs by blood flow, sugar, oxygen, carbon dioxide, protein, fat, one meal, or hormones, each compared with rest.
- **Vital signs** across the top: heart, breathing, blood oxygen, blood sugar, digestion. Click one to watch that system.
- **Try something:** at rest, after a meal, exercise and recovery, a big glass of water, or your own meal and exercise level.
- **Organ card:** what the selected organ does in plain words, what it is doing now, what it gets and sends.
- **Over time:** a chart, and look back to any earlier moment of the run.
- **Look inside the blood:** double-click a vessel to see cells and molecules at their true sizes.

The engine is a lumped, mass-conserving model: blood and tissue compartments for each organ, five transported substances, digestion, breathing, circulation, kidneys and a set of hormones. It runs in a Web Worker at one-second steps. See [the model notes](docs/PHYSIOLOGY_MODEL.md) and [anatomy and animation notes](docs/PHYSICAL_ANATOMY.md).

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:3016.

## Check

```sh
npm run check
npm run test:physiology
npm run test:anatomy
npm run test:browser
```

The browser suite renders the full-window 3D body. Under software rendering it is slow; run it on a machine with a GPU.

## Anatomy data

BodyParts3D 4.0 with 34 additive 4.3 thyroid, parathyroid and cranial venous meshes, plus five 3.0 lung lobe reference surfaces. The 4.0 archive is CC BY 4.0; the additional packages carry CC BY-SA 2.1 Japan terms. Full credits are in [ATTRIBUTION.md](public/ATTRIBUTION.md). Geometry rebuild scripts are in `scripts/` (`convert-anatomy.py`, `optimize-anatomy.mjs`, `compress-models.mjs`).

## License

Application code is MIT. Anatomy data keeps its CC BY 4.0 and CC BY-SA 2.1 Japan terms.
