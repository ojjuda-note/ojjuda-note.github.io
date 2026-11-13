const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// An intentionally conservative editorial review aid. The small lexicon below
// catches specified Korean paraphrases; it is not a semantic model or a proof
// that every unflagged sentence has a different meaning. Nothing is rewritten.
const vocabulary = [
  [/문자\s*메시지|메시지|문자/gu, '연락'],
  [/연락(?:할|하는|을\s*보낼)?\s*(?:횟수|빈도|간격|주기)/gu, '연락주기'],
  [/연락(?:할|하는|을\s*보낼)?\s*(?:시간|시각)/gu, '연락시간'],
  [/(?:쓴\s*돈|소비|지출)(?:의)?\s*(?:내역|목록|기록)/gu, '지출내역'],
  [/정기\s*(?:비용|지출)|고정\s*지출/gu, '고정비'],
  [/수시\s*(?:비용|지출)|변동\s*지출/gu, '변동비'],
  [/약속(?:한)?\s*(?:시간|시각)/gu, '약속시간'],
  [/약속(?:한)?\s*(?:금액|돈)/gu, '약속금액'],
  [/맡은\s*(?:몫|담당)|담당\s*(?:몫|역할)/gu, '담당역할'],
  [/마감\s*기한|제출\s*기한|끝낼\s*날짜/gu, '마감일'],
  [/돈을\s*쓰는\s*한도|지출\s*한도|쓸\s*돈의\s*한도/gu, '지출한도'],
  [/실제로\s*들은\s*말|직접\s*들은\s*말/gu, '들은말'],
  [/다시\s*확인/gu, '재확인'],
  [/적어\s*두|써\s*두|적어\s*놓/gu, '기록하'],
  [/메모/gu, '기록'],
  [/점검|살펴보|살펴\s*보/gu, '확인'],
  [/견주|대조/gu, '비교'],
  [/구별|분리/gu, '구분'],
  [/한\s*번/gu, '한번'],
  [/\s+/gu, ' ']
];

const objectRules = [
  ['연락주기', /연락주기/gu], ['연락시간', /연락시간/gu],
  ['지출내역', /지출내역/gu], ['지출한도', /지출한도/gu],
  ['약속시간', /약속시간/gu], ['약속금액', /약속금액/gu],
  ['담당역할', /담당역할/gu], ['마감일', /마감일/gu],
  ['계약조건', /계약\s*조건|계약서\s*내용/gu],
  ['생활약속', /생활\s*약속/gu],
  ['고정비', /고정비/gu], ['변동비', /변동비/gu],
  ['들은말', /들은말/gu], ['오답', /오답|틀린\s*문제/gu],
  ['연락', /연락|답장/gu], ['예산', /예산/gu],
  ['지출', /지출|쓴\s*돈|소비/gu], ['수입', /수입|들어오는\s*돈/gu],
  ['일정', /일정|날짜|시간표/gu], ['시간', /시간|시각/gu],
  ['금액', /금액|비용|가격/gu], ['역할', /역할|담당|업무\s*몫/gu],
  ['조건', /조건/gu], ['기준', /기준/gu], ['약속', /약속/gu],
  ['감정', /감정|마음|기분/gu], ['생활', /생활|일상/gu],
  ['자료', /자료|파일|문서/gu], ['과제', /과제|숙제/gu],
  ['목표', /목표/gu], ['계획', /계획/gu], ['도움', /도움|지원/gu],
  ['휴식', /휴식|쉴\s*시간/gu], ['질문', /질문|물음/gu],
  ['답변', /답변|대답/gu], ['관계', /관계/gu], ['물건', /물건/gu]
];

const actionRules = [
  ['기록', /기록|적(?:어|고|지|는|을)|써(?:\s*두|서|봐)|쓰(?:고|는|지)/gu],
  ['확인', /확인|살피|살펴|검토/gu], ['비교', /비교/gu],
  ['구분', /구분|나누|나눠/gu], ['증가', /늘리|늘려|높이|높여/gu],
  ['감소', /줄이|줄여|낮추|낮춰|덜어/gu],
  ['중단', /중단|멈추|멈춰|그만두|그만둬/gu],
  ['전달', /보내|전달|(?<![가-힣])전하|(?<![가-힣])전해/gu], ['질의', /물어|물으|요청|질문하|질문해/gu],
  ['정함', /(?<![가-힣])정하|(?<![가-힣])정해|합의|약속하|약속해/gu],
  ['수용', /인정|받아들이|받아들여/gu],
  ['기다림', /기다리|기다려/gu], ['경청', /들어\s*보|듣(?:고|는|지)/gu],
  ['유지', /유지|남겨|지켜|보존/gu], ['변경', /바꾸|바꿔|수정|변경/gu],
  ['정리', /정리/gu]
];

const opposites = new Set(['감소:증가', '유지:중단', '기다림:전달']);
const normalizeGuidance = value => vocabulary.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value).normalize('NFC').toLowerCase()).trim();

function matchesOf(text, rules) {
  const found = [];
  for (const [key, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) found.push({ key, start: match.index, end: match.index + match[0].length });
  }
  // Keep a compound object such as 약속시간, instead of also treating it as
  // generic 약속/시간 and falsely merging it with 약속금액.
  return found.filter((item, index) => !found.some((other, otherIndex) => otherIndex !== index
    && other.start <= item.start && other.end >= item.end
    && (other.end - other.start > item.end - item.start || otherIndex < index)))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function polarityAt(text, action) {
  const before = text.slice(Math.max(0, action.start - 5), action.start);
  const after = text.slice(action.end, action.end + 12);
  return /(?:^|\s)(?:안|못)\s*$/u.test(before)
    || /^(?:하|해|하지|지|지는|하진|지는\s*)?\s*(?:말|않|못)/u.test(after)
    || /^(?:하)?지\s*(?:는\s*)?(?:말|않|못)/u.test(after) ? 'negative' : 'positive';
}

function gramsOf(text) {
  const compact = text.replace(/[^\p{L}\p{N}]/gu, '');
  const grams = new Set();
  for (let i = 0; i < compact.length - 2; i++) grams.add(compact.slice(i, i + 3));
  return grams;
}

function semanticSignature(value) {
  const normalized = normalizeGuidance(value), objects = matchesOf(normalized, objectRules);
  const verbs = matchesOf(normalized, actionRules);
  const actions = verbs.map(verb => {
    // The closest preceding object is the conservative default. A sentence
    // containing several objects is not treated as every possible pairing.
    const preceding = objects.filter(object => object.end <= verb.start && verb.start - object.end <= 46);
    const following = objects.find(object => object.start >= verb.end && object.start - verb.end <= 10);
    const modifiesFollowing = /^(?:고\s*싶은|어야\s*할|야\s*할|려는)/u.test(normalized.slice(verb.end));
    const object = modifiesFollowing && following ? following : preceding.at(-1) || following;
    return object ? { action: verb.key, object: object.key, polarity: polarityAt(normalized, verb), start: verb.start, end: verb.end } : null;
  }).filter(Boolean);
  const replacements = [...objects.map(object => ({ ...object, token: object.key })),
    ...verbs.map(verb => ({ ...verb, token: `행동${verb.key}` }))].sort((a, b) => b.start - a.start);
  let canonical = normalized;
  for (const replacement of replacements) canonical = canonical.slice(0, replacement.start) + replacement.token + canonical.slice(replacement.end);
  canonical = canonical.replace(/(?:해\s*보렴|해\s*봐|해봐|하렴|보렴|해요|하세요|보세요|해\s*보자)/gu, '');
  return {
    normalized, canonical,
    objects: [...new Set(objects.map(object => object.key))].sort(),
    actions: actions.map(({ start, end, ...action }) => action),
    keys: [...new Set(actions.map(action => `${action.action}:${action.object}:${action.polarity}`))].sort()
  };
}

function dice(left, right) {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const item of left) if (right.has(item)) common++;
  return 2 * common / (left.size + right.size);
}

function comparePrepared(left, right) {
  const sharedObjects = left.signature.objects.filter(object => right.signature.objects.includes(object));
  if (!sharedObjects.length) return { candidate: false, reason: 'different-or-unrecognized-object', similarity: 0, sharedActions: [] };
  for (const a of left.signature.actions) for (const b of right.signature.actions) {
    if (a.object !== b.object) continue;
    if (a.action === b.action && a.polarity !== b.polarity) return { candidate: false, reason: 'different-polarity', similarity: 0, sharedActions: [] };
    if (a.polarity === b.polarity && opposites.has([a.action, b.action].sort().join(':'))) return { candidate: false, reason: 'opposite-actions', similarity: 0, sharedActions: [] };
  }
  const sharedActions = left.signature.keys.filter(key => right.signature.keys.includes(key));
  const similarity = dice(left.grams, right.grams);
  const actionSimilarity = dice(new Set(left.signature.keys), new Set(right.signature.keys));
  const candidate = sharedActions.length > 0 && (
    similarity >= 0.55 && actionSimilarity >= 0.4
    || similarity >= 0.42 && actionSimilarity >= 0.75
    || similarity >= 0.32 && sharedActions.length >= 2 && actionSimilarity >= 0.8
  );
  return { candidate, reason: candidate ? 'same-action-object-with-wording-overlap' : 'insufficient-overlap', similarity: Number(similarity.toFixed(4)), actionSimilarity: Number(actionSimilarity.toFixed(4)), sharedActions };
}

function prepare(text) {
  const signature = semanticSignature(text);
  return { signature, grams: gramsOf(signature.canonical) };
}

function compareGuidance(left, right) {
  return comparePrepared(prepare(left), prepare(right));
}

function findNearGuidance(records, { limit = 40 } = {}) {
  const prepared = records.map(record => ({ ...record, ...prepare(record.text) }));
  const buckets = new Map();
  prepared.forEach((record, index) => {
    for (const key of record.signature.keys) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(index);
    }
  });
  const examined = new Set(), candidates = [];
  for (const indices of buckets.values()) for (let i = 0; i < indices.length; i++) for (let j = i + 1; j < indices.length; j++) {
    const a = indices[i], b = indices[j], pair = `${a}:${b}`;
    if (examined.has(pair)) continue;
    examined.add(pair);
    const comparison = comparePrepared(prepared[a], prepared[b]);
    if (comparison.candidate) candidates.push({
      a: prepared[a].id, b: prepared[b].id, ...comparison,
      textA: prepared[a].text, textB: prepared[b].text
    });
  }
  candidates.sort((a, b) => b.similarity - a.similarity || b.actionSimilarity - a.actionSimilarity || a.a.localeCompare(b.a, 'en') || a.b.localeCompare(b.b, 'en'));
  return {
    records: records.length, recognizedRecords: prepared.filter(record => record.signature.keys.length).length,
    examinedPairs: examined.size, candidateCount: candidates.length,
    candidates: candidates.slice(0, Math.max(0, limit))
  };
}

function readAuthoredModule(file) {
  const source = fs.readFileSync(file, 'utf8');
  if (/^\s*import\s/mu.test(source)) throw Error(`audit expects standalone authored data: ${path.basename(file)}`);
  const names = [...source.matchAll(/^export\s+const\s+(\w+)/gmu)].map(match => match[1]);
  if (names.length !== 1) throw Error(`audit expects one authored object: ${path.basename(file)}`);
  return vm.runInNewContext(`${source.replace(/^export\s+/gmu, '')}\n${names[0]}`, Object.create(null), { filename: file, timeout: 1000 });
}

function collectGuidanceRecords(root = path.resolve(__dirname, '../games/moonlit-tarot')) {
  const records = [], counts = { casePairs: 0, personalCards: 0, personalComparisonFields: 0, personalFollowUpParagraphs: 0 }, issues = [];
  const cases = path.join(root, 'case-guides');
  for (const file of fs.readdirSync(cases).filter(file => /^case-\d+\.js$/u.test(file)).sort()) {
    const data = readAuthoredModule(path.join(cases, file));
    for (const [cardId, pair] of Object.entries(data.cards || {})) {
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some(text => typeof text !== 'string' || !text.trim())) {
        issues.push(`${file}:${cardId}: invalid insight/action pair`); continue;
      }
      counts.casePairs++;
      records.push({ id: `case:${data.topicId}:${cardId}:action`, text: pair[1], context: data.topicId, cardId, source: `case-guides/${file}` });
    }
  }
  const personal = path.join(root, 'personal-contexts');
  if (fs.existsSync(personal)) for (const file of fs.readdirSync(personal).filter(file => file.endsWith('.js')).sort()) {
    const data = readAuthoredModule(path.join(personal, file));
    for (const [cardId, text] of Object.entries(data.cards || {})) {
      if (typeof text !== 'string' || !text.trim()) { issues.push(`${file}:${cardId}: invalid personal guidance`); continue; }
      counts.personalCards++;
      records.push({ id: `personal:${data.id}:${cardId}`, text, context: data.id, cardId, source: `personal-contexts/${file}` });
    }
    for (const option of ['a', 'b']) for (const field of ['gain', 'burden', 'prepare']) {
      const text = data.comparison?.[option]?.[field];
      if (typeof text !== 'string' || !text.trim()) { issues.push(`${file}: comparison ${option}.${field} missing`); continue; }
      counts.personalComparisonFields++;
      records.push({ id: `personal:${data.id}:comparison:${option}:${field}`, text, context: data.id, source: `personal-contexts/${file}` });
    }
    for (const question of data.followUps || []) for (const [index, text] of (question.paragraphs || []).entries()) {
      if (typeof text !== 'string' || !text.trim()) { issues.push(`${file}: follow-up ${question.id} paragraph ${index} invalid`); continue; }
      counts.personalFollowUpParagraphs++;
      records.push({ id: `personal:${data.id}:follow-up:${question.id}:${index}`, text, context: data.id, source: `personal-contexts/${file}` });
    }
  }
  return { records, counts, issues };
}

function auditGuidance({ root, limit = 40 } = {}) {
  const { records, counts, issues } = collectGuidanceRecords(root);
  return {
    ...counts, issues, ...findNearGuidance(records, { limit }),
    method: 'Korean synonym lexicon; nearest action-object and polarity; canonical character-trigram Dice overlap. Review candidates only.',
    limitation: 'The 3,900 existing card/topic pairs are reviewed through their action sentence. New personal card text, comparison fields and follow-up paragraphs are included when present. Unrecognized objects, distant negation, implied meanings and paraphrases outside the lexicon can be missed. Candidates require editorial reading; neither absence nor count proves semantic uniqueness or predictive validity. No source is changed.'
  };
}

if (require.main === module) {
  const report = auditGuidance({ limit: 40 });
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    if (!process.argv[outputIndex + 1]) throw Error('--output requires a report path');
    fs.writeFileSync(process.argv[outputIndex + 1], JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ ...report, candidates: report.candidates.slice(0, 12) }, null, 2));
  // Similarity candidates are a review queue, not evidence sufficient to reject
  // or silently delete authored text. Only invalid records fail this command.
  if (report.issues.length) process.exitCode = 1;
}

module.exports = { normalizeGuidance, semanticSignature, compareGuidance, findNearGuidance, collectGuidanceRecords, auditGuidance };
