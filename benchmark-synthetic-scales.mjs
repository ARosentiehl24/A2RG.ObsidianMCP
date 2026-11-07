import { gzipSync } from "node:zlib";
import { TextSearchIndex } from "./dist/npm/search-index.js";

const scale = Number(process.argv[2] ?? 1000);
if (![1000, 10000, 100000].includes(scale)) {
  throw new Error(`Unsupported scale: ${scale}`);
}

const queries = [
  "orion",
  "atlas",
  "ember",
  "quantum",
  "network",
  "security",
  "health",
  "finance",
  "cloud",
  "memory",
];

const relevantSets = new Map(
  queries.map((query) => [query, new Set()]),
);
const index = new TextSearchIndex();
const indexStart = performance.now();

for (let number = 0; number < scale; number += 1) {
  const topicIndex = number % queries.length;
  const topic = queries[topicIndex];
  const relevant = number < 100 && number % 10 === topicIndex;
  const path = `notes/${topic}/${topic}-${String(number).padStart(6, "0")}.md`;
  const name = `${topic}-${String(number).padStart(6, "0")}.md`;
  const content = relevant
    ? `# ${topic}\n\nThis document contains ${topic} and is marked relevant for benchmark ${topic}.\n`
    : `# ${topic} distractor\n\nThis document contains ${topic} context and benchmark distractor text.\n`;

  index.setDocument(path, name, content, number + 1, content.length);
  if (relevant) {
    relevantSets.get(topic)?.add(path);
  }
}

const indexMs = performance.now() - indexStart;
const coldQuerySamples = [];

for (const query of queries) {
  const start = performance.now();
  const candidates = index.findCandidates(query, 100);
  coldQuerySamples.push(performance.now() - start);
  if (candidates.length === 0) {
    throw new Error(`No candidates for ${query}`);
  }
}

const warmQuerySamples = [];
for (let repetition = 0; repetition < 20; repetition += 1) {
  for (const query of queries) {
    const start = performance.now();
    index.findCandidates(query, 100);
    warmQuerySamples.push(performance.now() - start);
  }
}

let reciprocalRank = 0;
let recallAt10 = 0;
let recallAt100 = 0;

for (const query of queries) {
  const candidates = index.findCandidates(query, 100);
  const relevant = relevantSets.get(query) ?? new Set();
  const foundRanks = candidates
    .map((path, rank) => relevant.has(path) ? rank + 1 : null)
    .filter((rank) => rank !== null);
  const firstRelevantRank = foundRanks[0];
  reciprocalRank += firstRelevantRank ? 1 / firstRelevantRank : 0;

  const foundAt10 = candidates.slice(0, 10)
    .filter((path) => relevant.has(path)).length;
  const foundAt100 = candidates.slice(0, 100)
    .filter((path) => relevant.has(path)).length;

  recallAt10 += relevant.size > 0 ? foundAt10 / relevant.size : 0;
  recallAt100 += relevant.size > 0 ? foundAt100 / relevant.size : 0;
}

const incrementalStart = performance.now();
for (let number = 0; number < 1000; number += 1) {
  const topicIndex = number % queries.length;
  const topic = queries[topicIndex];
  const path = `notes/incremental/${topic}-${String(number).padStart(6, "0")}.md`;
  const name = `${topic}-${String(number).padStart(6, "0")}.md`;
  const content = `# incremental ${topic}\n\nIncremental benchmark document ${number} for ${topic}.`;
  index.setDocument(path, name, content, scale + number + 1, content.length);
}
const incremental1000Ms = performance.now() - incrementalStart;

const snapshotStart = performance.now();
const snapshot = JSON.stringify(index.toSnapshot());
const snapshotJsonBytes = Buffer.byteLength(snapshot);
const snapshotGzipBytes = gzipSync(snapshot, { level: 6 }).length;
const snapshotMs = performance.now() - snapshotStart;

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};
const memory = process.memoryUsage();

console.log(JSON.stringify({
  scale,
  indexMs: Number(indexMs.toFixed(1)),
  coldQueryMedianMs: Number(median(coldQuerySamples).toFixed(3)),
  warmQueryMedianMs: Number(median(warmQuerySamples).toFixed(3)),
  incremental1000Ms: Number(incremental1000Ms.toFixed(1)),
  mrrAt10: Number((reciprocalRank / queries.length).toFixed(4)),
  recallAt10: Number((recallAt10 / queries.length).toFixed(4)),
  recallAt100: Number((recallAt100 / queries.length).toFixed(4)),
  snapshotJsonBytes,
  snapshotGzipBytes,
  snapshotMs: Number(snapshotMs.toFixed(1)),
  heapUsedMB: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
  rssMB: Number((memory.rss / 1024 / 1024).toFixed(1)),
}, null, 2));
