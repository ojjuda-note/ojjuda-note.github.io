(() => {
  'use strict';
  window.OjjudaSaetbyeolGrowth = {
    create(upgrades, branchCount) {
      const rounds = 3;
      const tiers = [...new Set(upgrades.map(upgrade => upgrade.r))].sort((a, b) => a - b).map(stage => {
        const items = upgrades.filter(upgrade => upgrade.r === stage);
        const caps = Array(branchCount).fill(0);
        for (const upgrade of items) caps[upgrade.b] += upgrade.mx;
        return {stage, items, caps};
      });
      return {
        state(levels) {
          let progress;
          for (const tier of tiers) {
            const counts = Array(branchCount).fill(0);
            for (const upgrade of tier.items) {
              counts[upgrade.b] += Math.max(0, Math.min(upgrade.mx, Math.floor(Number(levels[upgrade.id]) || 0)));
            }
            // Branches have different capacities, so checkpoints use thirds of
            // each branch's capacity instead of an equal number of purchases.
            for (let round = 1; round <= rounds; round++) {
              const targets = tier.caps.map(cap => Math.ceil(cap * round / rounds));
              const remaining = targets.map((target, branch) => Math.max(0, target - counts[branch]));
              progress = {stage:tier.stage, round, rounds, counts, targets, remaining, complete:false};
              if (remaining.some(count => count > 0)) return progress;
            }
          }
          return {...progress, complete:true};
        },
        blocks(upgrade, progress) {
          return !progress.complete && (upgrade.r > progress.stage ||
            (upgrade.r === progress.stage && progress.counts[upgrade.b] >= progress.targets[upgrade.b]));
        }
      };
    }
  };
})();
