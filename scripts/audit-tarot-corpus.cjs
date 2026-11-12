const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../games/moonlit-tarot/fortune-corpus');
const files = { overall: ['overall.js'], love: ['love.js'], money: ['money.js'], work: ['work-a.js', 'work-b.js', 'work-c1.js', 'work-c2.js'] };
const normalize = value => value.normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '');
const sentences = value => value.split(/(?<=[.!?。])\s+/u).map(text => text.trim()).filter(Boolean);

function readLiteralRows(file) {
  // Reject computed/generated module contents. Authored records must be
  // inspectable literal rows; this cannot prove literary originality by itself.
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const expression = source.replace(/^\s*\/\/.*$/gm, '').trim().match(/^export const [A-Z_][A-Z_0-9]* = (\[[\s\S]*\]);?$/);
  if (!expression) throw Error(`not a literal corpus module: ${file}`);
  const rows = JSON.parse(expression[1].replace(/,\s*]/g, ']'));
  return { source, rows };
}

function auditCorpus({ partial = false } = {}) {
  const records = [], fileStats = [], issues = [], topicCounts = {};
  for (const [topic, names] of Object.entries(files)) {
    const keys = new Set();
    for (const file of names) {
      if (partial && !fs.existsSync(path.join(root, file))) continue;
      const { source, rows } = readLiteralRows(file);
      fileStats.push({ file, records: rows.length, bytes: Buffer.byteLength(source), sha256: crypto.createHash('sha256').update(source).digest('hex') });
      for (const row of rows) {
        if (!Array.isArray(row) || row.length !== 4 || row.some(value => typeof value !== 'string')) { issues.push(`${file}: invalid row`); continue; }
        const [key, oneLine, body, action] = row, id = `${topic}:${key}`;
        if (!/^[0-9][0-7][0-7]$/.test(key)) issues.push(`${id}: invalid key`);
        if (keys.has(key)) issues.push(`${id}: duplicate key`);
        keys.add(key);
        for (const [field, value, min, max] of [['oneLine', oneLine, 24, 65], ['body', body, 110, 190], ['action', action, 35, 80]]) {
          if (value.length < min || value.length > max) issues.push(`${id}: ${field} length ${value.length}`);
        }
        if (sentences(body).length < 3) issues.push(`${id}: fewer than 3 sentences`);
        records.push({ id, topic, key, oneLine, body, action });
      }
    }
    topicCounts[topic] = keys.size;
    if (!partial && keys.size !== 640) issues.push(`${topic}: ${keys.size}/640 keys`);
  }

  const duplicateFields = { oneLine: [], body: [], action: [] }, sentenceIndex = new Map();
  for (const field of Object.keys(duplicateFields)) {
    const seen = new Map();
    for (const record of records) {
      const text = normalize(record[field]);
      if (seen.has(text)) duplicateFields[field].push([seen.get(text), record.id]);
      else seen.set(text, record.id);
    }
  }
  for (const record of records) {
    for (const sentence of sentences(record.body)) {
      const text = normalize(sentence);
      if (text.length < 18) continue;
      if (!sentenceIndex.has(text)) sentenceIndex.set(text, { sentence, ids: [] });
      sentenceIndex.get(text).ids.push(record.id);
    }
  }
  const repeatedSentences = [...sentenceIndex.values()].filter(value => new Set(value.ids).size > 1);

  // Character trigrams catch near-copying even when spacing or endings differ.
  // Dice similarity is only a review signal, not a claim of semantic uniqueness.
  const gramIndex = new Map(), sizes = [], n = records.length;
  for (let i = 0; i < n; i++) {
    const text = normalize(records[i].body), grams = new Set();
    for (let j = 0; j < text.length - 2; j++) grams.add(text.slice(j, j + 3));
    sizes.push(grams.size);
    for (const gram of grams) {
      if (!gramIndex.has(gram)) gramIndex.set(gram, []);
      gramIndex.get(gram).push(i);
    }
  }
  const overlaps = new Uint16Array(n * n);
  for (const ids of gramIndex.values()) for (let a = 0; a < ids.length - 1; a++) {
    const offset = ids[a] * n;
    for (let b = a + 1; b < ids.length; b++) overlaps[offset + ids[b]]++;
  }
  const nearDuplicates = [], closestPairs = [];
  for (let a = 0; a < n - 1; a++) for (let b = a + 1; b < n; b++) {
    const score = 2 * overlaps[a * n + b] / (sizes[a] + sizes[b]);
    if (score >= 0.68) nearDuplicates.push({ a: records[a].id, b: records[b].id, similarity: Number(score.toFixed(4)) });
    if (closestPairs.length < 12 || score > closestPairs.at(-1).similarity) {
      closestPairs.push({ a: records[a].id, b: records[b].id, similarity: score });
      closestPairs.sort((x, y) => y.similarity - x.similarity);
      if (closestPairs.length > 12) closestPairs.pop();
    }
  }
  const ranges = Object.fromEntries(['oneLine', 'body', 'action'].map(field => [field, { min: Math.min(...records.map(row => row[field].length)), max: Math.max(...records.map(row => row[field].length)) }]));
  return {
    partial, actualRecords: records.length, topicCounts,
    independentlyStoredBodies: new Set(records.map(row => normalize(row.body))).size,
    fileStats, ranges, issues, duplicateFields, repeatedSentences,
    similarityMethod: 'NFC letters/numbers, character trigrams, Sørensen–Dice; review threshold 0.68',
    nearDuplicates, closestPairs: closestPairs.map(pair => ({ ...pair, similarity: Number(pair.similarity.toFixed(4)) })),
    limitation: 'Literal rows, text duplication and length checks do not prove semantic originality or predictive validity.'
  };
}

if (require.main === module) {
  const report = auditCorpus({ partial: process.argv.includes('--partial') });
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) fs.writeFileSync(process.argv[outputIndex + 1], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ actualRecords: report.actualRecords, topicCounts: report.topicCounts, uniqueBodies: report.independentlyStoredBodies, issues: report.issues, duplicateFields: report.duplicateFields, repeatedSentences: report.repeatedSentences.length, nearDuplicates: report.nearDuplicates, closestPairs: report.closestPairs.slice(0, 4) }, null, 2));
  if (report.issues.length || Object.values(report.duplicateFields).some(rows => rows.length) || report.repeatedSentences.length || report.nearDuplicates.length) process.exitCode = 1;
}

module.exports = { auditCorpus, readLiteralRows };
