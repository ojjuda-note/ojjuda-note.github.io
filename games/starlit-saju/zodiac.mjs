import { calculateSaju } from './engine.mjs?v=20261113-saju-brief1';

// Zodiac labels follow the chart's already-calculated year branch. The civil
// year, Korean lunar year and exact Li Chun year are not interchangeable.
const BASIS = '입춘 기준';

function candidate(branch) {
  if (!branch || !['animal', 'hanja', 'hangul'].every(key => typeof branch[key] === 'string' && branch[key])) return null;
  return { animal: branch.animal, label: `${branch.animal}띠`, hanja: branch.hanja, hangul: branch.hangul };
}

/** Pure display metadata; never guesses an animal for an uncertain year. */
export function zodiacFromChart(chart) {
  const year = Array.isArray(chart?.pillars) ? chart.pillars.find(pillar => pillar?.key === 'year') : null;
  const confirmed = year && year.uncertain !== true ? candidate(year.branch) : null;
  if (confirmed) {
    return {
      status: 'confirmed', label: confirmed.label, animal: confirmed.animal,
      candidates: [confirmed], basis: BASIS, note: '사주 기준 · 입춘',
    };
  }

  const candidates = [];
  for (const alternative of Array.isArray(year?.alternatives) ? year.alternatives : []) {
    const value = candidate(alternative?.branch);
    if (value && !candidates.some(item => item.hanja === value.hanja)) candidates.push(value);
  }
  if (candidates.length) {
    const note = chart.timeKnown === false
      ? '입춘이 바뀌는 날이라 태어난 시간을 알아야 띠를 정할 수 있어요.'
      : chart.timeKnown === true
        ? '입력한 분 안에 입춘이 바뀌어 띠를 하나로 정할 수 없어요.'
        : '입춘이 바뀌는 시각이라 띠를 하나로 정할 수 없어요.';
    return {
      status: 'uncertain', label: candidates.map(item => item.label).join(' / '),
      animal: null, candidates, basis: BASIS, note,
    };
  }

  return {
    status: 'unavailable', label: '띠 확인 필요', animal: null,
    candidates: [], basis: BASIS, note: '출생 정보를 확인해 주세요.',
  };
}

/** Uses the existing local calendar engine; invalid/incomplete input still throws. */
export function zodiacFromBirth(input, options) {
  return zodiacFromChart(calculateSaju(input, options));
}
