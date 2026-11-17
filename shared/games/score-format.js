/* Compact point totals for the arcade and its standalone game frames. */
(() => {
  const decimal = new Intl.NumberFormat('en-US', {
    useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 1
  });
  window.OjjudaScoreFormat = value => {
    const number = Number(value);
    if (number < 1000) return String(number);
    // The last half-step rounds to 1.0M instead of 1000.0K.
    if (number < 999950) return decimal.format(number / 1000) + 'K';
    return decimal.format(number / 1000000) + 'M';
  };
})();
