(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OjjudaCouponBatch = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const list = value => Array.isArray(value) ? value : [];
  const assigned = value => value !== null && value !== undefined && value !== '';
  const locked = new Set(['sending', 'sent', 'uncertain']);
  const fileTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const unavailable = {
    queued: '이미지 인식을 기다리고 있어요.',
    reading: '이미지를 읽고 있어요. 완료된 뒤 확인해 주세요.',
    sending: '이미 발송 중이에요.',
    uncertain: '이전 발송 결과를 먼저 확인해 주세요.'
  };

  function normalizeCode(value) {
    return String(value ?? '').replace(/[\s-]+/g, '').toUpperCase();
  }

  function assignAwards(items, pending) {
    const copies = list(items).map(item => ({...item}));
    const reserved = new Set(copies.filter(item => assigned(item.awardId)).map(item => item.awardId));
    const available = list(pending).filter(award => award && typeof award.id === 'string' && award.id && !award.blocked_reason);
    let next = 0;
    for (const item of copies) {
      // A refreshed list must never move an existing or possibly sent coupon
      // to another winner, even when that winner is no longer pending.
      if (assigned(item.awardId) || locked.has(item.status)) continue;
      while (next < available.length && reserved.has(available[next].id)) next++;
      item.awardId = next < available.length ? available[next++].id : null;
      if (assigned(item.awardId)) reserved.add(item.awardId);
    }
    return copies;
  }

  function calendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  }

  function validateBatch(items, pending, {today} = {}) {
    const entries = list(items), awards = list(pending), errors = [], invalid = new Set();
    const fail = (index, message) => {
      invalid.add(index);
      errors.push({id: entries[index]?.id ?? '', message});
    };
    const duplicates = (getKey, message) => {
      const grouped = new Map();
      entries.forEach((item, index) => {
        const key = getKey(item);
        if (!assigned(key)) return;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(index);
      });
      for (const indexes of grouped.values()) if (indexes.length > 1) {
        for (const index of indexes) fail(index, message);
      }
    };
    // Sent items need no further field validation, but their award and coupon
    // number stay reserved so a remaining item cannot send either twice.
    duplicates(item => item?.awardId, '같은 당첨 건이 두 번 배정됐어요.');
    duplicates(item => normalizeCode(item?.code), '동일한 쿠폰번호가 있어요. 다른 쿠폰을 확인해 주세요.');
    const active = [];
    entries.forEach((item, index) => {
      if (item?.status === 'sent') return;
      active.push(index);
      if (!item || !['ready', 'failed'].includes(item.status)) {
        fail(index, unavailable[item?.status] || '발송 준비 상태를 확인해 주세요.');
      }
      const matches = awards.filter(award => award && award.id === item?.awardId);
      if (!assigned(item?.awardId)) fail(index, '배정할 당첨자가 없어요.');
      else if (!matches.length) fail(index, '지급 대기 중인 당첨자가 아니에요. 새로 확인해 주세요.');
      else if (matches.some(award => award.blocked_reason)) fail(index, '지급 제외 대상에게는 보낼 수 없어요.');
      if (!/^[A-Z0-9]{6,80}$/.test(normalizeCode(item?.code))) {
        fail(index, '쿠폰번호를 영문·숫자 6~80자로 확인해 주세요.');
      }
      if (!calendarDate(today)) fail(index, '오늘 날짜를 확인하지 못했어요. 다시 확인해 주세요.');
      else if (!calendarDate(item?.expires)) fail(index, '사용기한을 올바른 날짜로 입력해 주세요.');
      else if (item.expires < today) fail(index, '사용기한이 지난 쿠폰은 보낼 수 없어요.');
      const title = typeof item?.title === 'string' ? item.title.trim() : '';
      if (!title || Array.from(title).length > 120) fail(index, '상품명을 1~120자로 입력해 주세요.');
      if (!item?.file || !fileTypes.has(item.file.type) || !Number.isInteger(item.file.size) || item.file.size < 1 || item.file.size > 5242880) {
        fail(index, '5MB 이하의 PNG·JPG·WEBP 이미지를 선택해 주세요.');
      }
    });
    const readyCount = active.filter(index => !invalid.has(index)).length;
    return {valid: active.length > 0 && errors.length === 0 && readyCount === active.length, errors, readyCount};
  }

  return Object.freeze({assignAwards, normalizeCode, validateBatch});
});
