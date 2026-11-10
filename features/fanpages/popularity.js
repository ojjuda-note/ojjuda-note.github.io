/* K-POPIT BOARD weekly global PWR top 30, limited to registered groups.
   The week covers Monday–Sunday (KST). Solo artists and unlisted groups
   are excluded; registered groups outside the chart follow 가나다순. */
(() => {
  'use strict';
  window.OJJUDA_FAN_POPULARITY = Object.freeze({
    weekStart: '2026-11-02',
    asOf: '2026-11-08',
    source: 'https://k-popit.com/board/rankings/weekly?mode=global',
    rankedIds: Object.freeze([
      'rescene', 'illit', 'treasure', 'ateez', 'a2olite',
      'enhypen', 'bts', 'blackpink', 'ive', 'riize', 'twice',
      'nmixx', 'tws', 'babymonster', 'boynextdoor',
      'nctdream', 'aespa'
    ])
  });
})();
