// Drives scripts/blender/render-diagnostics.py across the four muscle-pilot .blend levels.
//
// Usage:
//   node scripts/blender/render-diagnostics.mjs [--blender PATH] [--out-root DIR]
//       [--size 360] [--samples 12] [--frames 8]
//
// For each level (muscle, fascicle, fiber, sarcomere) it renders the full diagnostic
// suite into <out-root>/<level>/ (default outputs/verification/p2/diagnostics/<level>/,
// which is gitignored), then copies that level's contact-sheet.png and diagnostics.json
// into validation/p2/diagnostics/<level>/ (small, committed evidence).
//
// Exits nonzero if any expected render or receipt file is missing after a run.
import {spawnSync} from 'node:child_process';
import {mkdirSync, copyFileSync, existsSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LEVELS = ['muscle', 'fascicle', 'fiber', 'sarcomere'];

function parseArgs(argv) {
  const opts = {
    blender: `${ROOT}work/tools/blender-4.4.3-linux-x64/blender`,
    outRoot: `${ROOT}outputs/verification/p2/diagnostics`,
    size: 360,
    samples: 12,
    frames: 8,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--blender') opts.blender = argv[++i];
    else if (a === '--out-root') opts.outRoot = argv[++i];
    else if (a === '--size') opts.size = Number(argv[++i]);
    else if (a === '--samples') opts.samples = Number(argv[++i]);
    else if (a === '--frames') opts.frames = Number(argv[++i]);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const script = `${ROOT}scripts/blender/render-diagnostics.py`;
const validationRoot = `${ROOT}validation/p2/diagnostics`;

const expectedFiles = (frames) => [
  ...Array.from({length: frames}, (_, i) => `turntable-${String(i).padStart(2, '0')}.png`),
  'section-cross.png', 'section-longitudinal.png', 'wireframe.png', 'normals.png',
  'contact-sheet.png', 'diagnostics.json',
];

let failures = [];
const timings = {};

for (const level of LEVELS) {
  const blend = `${ROOT}assets/multiscale/muscle-pilot/blender/${level}.blend`;
  const outDir = `${opts.outRoot}/${level}`;
  mkdirSync(outDir, {recursive: true});
  const args = [
    '--background', '--factory-startup', blend,
    '--python', script, '--',
    '--out', outDir,
    '--size', String(opts.size),
    '--samples', String(opts.samples),
    '--frames', String(opts.frames),
  ];
  console.log(`[render-diagnostics] ${level}: ${opts.blender} ${args.join(' ')}`);
  const start = Date.now();
  const result = spawnSync(opts.blender, args, {stdio: 'inherit'});
  const elapsedS = (Date.now() - start) / 1000;
  timings[level] = elapsedS;
  console.log(`[render-diagnostics] ${level}: ${elapsedS.toFixed(1)}s`);
  if (result.status !== 0) {
    failures.push(`${level}: blender exited with status ${result.status}`);
    continue;
  }
  for (const f of expectedFiles(opts.frames)) {
    const p = `${outDir}/${f}`;
    if (!existsSync(p) || statSync(p).size === 0) failures.push(`${level}: missing or empty ${f}`);
  }
  if (failures.some((f) => f.startsWith(`${level}:`))) continue;

  const evidenceDir = `${validationRoot}/${level}`;
  mkdirSync(evidenceDir, {recursive: true});
  for (const f of ['contact-sheet.png', 'diagnostics.json']) {
    copyFileSync(`${outDir}/${f}`, `${evidenceDir}/${f}`);
  }
  console.log(`[render-diagnostics] ${level}: evidence copied to ${evidenceDir}`);
}

console.log('[render-diagnostics] timings (s):', JSON.stringify(timings, null, 2));

if (failures.length) {
  console.error('[render-diagnostics] FAILED:\n' + failures.map((f) => ` - ${f}`).join('\n'));
  process.exit(1);
}
console.log('[render-diagnostics] all levels rendered and verified.');
