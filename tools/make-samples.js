#!/usr/bin/env node
// Rebuild samples/index.json from the track JSON files in samples/.
// The track files themselves are never modified. This keeps a large sample
// library (for example the classic-pool export) easy to extend: drop a new
// track JSON into samples/ and run `node tools/make-samples.js`.
'use strict';

const fs = require('fs');
const path = require('path');
const Track = require('../js/track.js');

const ROOT = path.join(__dirname, '..');
const SAMPLE_DIR = path.join(ROOT, 'samples');
const INDEX_FILE = path.join(SAMPLE_DIR, 'index.json');
// The app opens this sample on a first visit, so keep it first in the menu.
const FIRST_SAMPLE = 'Dirt.json';

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nodes.json'), 'utf8'));
const graph = Track.buildGraph(data);

function readPreviousIndex() {
  try {
    const list = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    if (!Array.isArray(list)) return new Map();
    return new Map(list.filter((entry) => entry && entry.file).map((entry) => [entry.file, entry]));
  } catch {
    return new Map();
  }
}

function straightLength(track) {
  let length = 0;
  for (let i = 1; i < track.checkpoints.length; i++) {
    const a = track.checkpoints[i - 1];
    const b = track.checkpoints[i];
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

function buildEntry(file, previous) {
  const track = Track.parseTrack(fs.readFileSync(path.join(SAMPLE_DIR, file), 'utf8'), file);
  let length = 0;
  let mode = 'straight';
  let warnings = 0;
  try {
    const route = Track.computeRoute(track, graph, {
      mode: 'auto', snapRadius: 80, smooth: 45, closed: !!track.closed,
    });
    length = route.length;
    mode = route.modeUsed;
    warnings = route.warnings.length;
  } catch (err) {
    console.warn(`  ! ${file}: routing failed (${err.message}); using straight-line length`);
    length = straightLength(track);
  }

  const entry = {
    file,
    name: (previous && previous.name) || track.name || path.basename(file, '.json'),
    cps: track.checkpoints.length,
    length: Track.formatDistance(length),
  };
  if (track.author) entry.author = track.author;
  for (const key of ['nameEn', 'note', 'noteEn']) {
    if (previous && previous[key]) entry[key] = previous[key];
  }
  return { entry, mode, warnings };
}

function main() {
  const previous = readPreviousIndex();
  const files = fs.readdirSync(SAMPLE_DIR)
    .filter((file) => /\.json$/i.test(file) && file.toLowerCase() !== 'index.json');

  const records = [];
  for (const file of files) {
    try {
      records.push({ file, ...buildEntry(file, previous.get(file)) });
    } catch (err) {
      console.warn(`  ! ${file}: skipped (${err.message})`);
    }
  }

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  records.sort((a, b) => collator.compare(a.entry.name, b.entry.name) || collator.compare(a.file, b.file));
  const first = records.findIndex((record) => record.file === FIRST_SAMPLE);
  if (first > 0) records.unshift(records.splice(first, 1)[0]);

  const index = records.map((record) => record.entry);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n', 'utf8');

  const routed = records.filter((record) => record.mode === 'road').length;
  const warned = records.filter((record) => record.warnings).length;
  for (const record of records) {
    console.log(`${record.file}: ${record.entry.cps} CP, ${record.entry.length}, ${record.mode}${record.warnings ? `, ${record.warnings} warnings` : ''}`);
  }
  console.log(`samples/index.json written: ${index.length} samples (${routed} fully road-routed, ${warned} with route warnings).`);
}

main();
