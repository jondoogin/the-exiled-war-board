// Pure, dependency-free scoring. Imported by the Node server AND by the browser
// (served at /scoring.mjs) so the weight sliders recompute without a round trip.

export const DEFAULT_CONFIG = {
  decksPerWar: 16,          // 4 battle days x 4 decks
  famePerDeckTarget: 180,   // fame a solid deck is expected to bank
  weights: {
    participation: 0.55,    // did they use their decks at all
    efficiency: 0.30,       // fame per deck actually used
    contribution: 0.15      // share of the clan's output that war
  },
  halfLifeWars: 4,          // recency decay: a war 4 back counts half
  windowWars: 10,           // how far back the rolling score looks
  minWarsForAction: 3,      // never recommend on thinner evidence than this
  thresholds: {
    promote: 82,
    hold: 65,
    warn: 50                // below warn = demotion territory
  },
  missStreakForAction: 2,   // consecutive un-excused zero-deck wars
  includeIncomplete: false  // an in-progress week drags everyone; opt in to it
};

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Score one member's showing in one war, 0-100. */
export function scoreWarEntry(entry, warStats, config = DEFAULT_CONFIG) {
  const { decksPerWar, famePerDeckTarget, weights } = config;
  const decksUsed = entry?.decksUsed ?? 0;
  const fame = entry?.fame ?? 0;
  const repair = entry?.repairPoints ?? 0;

  const participation = clamp01(decksUsed / decksPerWar);
  const efficiency = decksUsed
    ? clamp01(fame / (decksUsed * famePerDeckTarget))
    : 0;
  // Output relative to a typical clanmate that week. Repair points count, but
  // at a discount: they help the clan, they are not war wins.
  const output = fame + repair * 0.5;
  const benchmark = warStats?.medianOutput || 1;
  const contribution = clamp01(output / (benchmark * 1.25));

  // Normalized by the weight sum, so the score stays on a 0-100 scale no
  // matter where the dashboard's weight sliders are dragged.
  const wsum = weights.participation + weights.efficiency + weights.contribution || 1;
  const score =
    (100 *
      (weights.participation * participation +
        weights.efficiency * efficiency +
        weights.contribution * contribution)) /
    wsum;

  return {
    score: round(score),
    participation: round(participation * 100),
    efficiency: round(efficiency * 100),
    contribution: round(contribution * 100),
    decksUsed,
    decksMissed: Math.max(0, decksPerWar - decksUsed),
    fame,
    repairPoints: repair
  };
}

/** Per-war clan benchmarks, computed once and reused for every member. */
export function warStatsFor(war) {
  const rows = Object.values(war.participants || {});
  const outputs = rows.map((p) => (p.fame ?? 0) + (p.repairPoints ?? 0) * 0.5);
  return {
    medianOutput: median(outputs),
    medianDecks: median(rows.map((p) => p.decksUsed ?? 0)),
    roster: rows.length
  };
}

function exemptionKey(tag, warId) {
  return `${tag}::${warId}`;
}

/**
 * Roll every war up into one member record.
 * wars: newest-last array of { id, createdDate, participants: {tag: entry} }
 */
export function buildScoreboard(state, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config, weights: { ...DEFAULT_CONFIG.weights, ...(config.weights || {}) } };
  const wars = [...(state.wars || [])]
    .filter((w) => cfg.includeIncomplete || w.complete !== false)
    .sort((a, b) => String(a.createdDate).localeCompare(String(b.createdDate)))
    .slice(-cfg.windowWars);

  const stats = new Map(wars.map((w) => [w.id, warStatsFor(w)]));
  const exempt = new Set(
    (state.exemptions || []).map((e) => exemptionKey(e.tag, e.warId))
  );

  const members = Object.values(state.members || {});
  const rows = members.map((m) => {
    const history = [];
    wars.forEach((war, i) => {
      const entry = war.participants?.[m.tag];
      const present = Boolean(entry) || wasInClanFor(m, war);
      if (!present) {
        history.push({ warId: war.id, createdDate: war.createdDate, status: 'not-in-clan' });
        return;
      }
      const isExempt = exempt.has(exemptionKey(m.tag, war.id));
      const detail = scoreWarEntry(entry || {}, stats.get(war.id), cfg);
      history.push({
        warId: war.id,
        createdDate: war.createdDate,
        status: isExempt ? 'excused' : detail.decksUsed === 0 ? 'missed' : 'played',
        ...detail,
        ageIndex: wars.length - 1 - i
      });
    });

    const counted = history.filter((h) => h.status === 'played' || h.status === 'missed');
    let num = 0;
    let den = 0;
    for (const h of counted) {
      const w = Math.pow(0.5, h.ageIndex / cfg.halfLifeWars);
      num += h.score * w;
      den += w;
    }
    const score = den ? round(num / den) : null;

    const played = counted.filter((h) => h.status === 'played');
    const missedWars = counted.filter((h) => h.status === 'missed');
    const excused = history.filter((h) => h.status === 'excused');

    // consecutive un-excused misses, walking backwards from the latest war
    let missStreak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h.status === 'excused' || h.status === 'not-in-clan') continue;
      if (h.status === 'missed') missStreak++;
      else break;
    }

    const recent = avgScore(counted.slice(-3));
    const prior = avgScore(counted.slice(-6, -3));
    const trend = recent !== null && prior !== null ? round(recent - prior) : null;

    const decksUsed = played.reduce((s, h) => s + h.decksUsed, 0);
    const decksPossible = counted.length * cfg.decksPerWar;

    return {
      tag: m.tag,
      name: m.name,
      role: m.role,
      status: m.status || 'active',
      joinedAt: m.joinedAt,
      lastSeen: m.lastSeen,
      trophies: m.trophies ?? null,
      donations: m.donations ?? null,
      warsTracked: counted.length,
      warsPlayed: played.length,
      warsMissed: missedWars.length,
      warsExcused: excused.length,
      missStreak,
      decksUsed,
      decksPossible,
      deckRate: decksPossible ? round((decksUsed / decksPossible) * 100) : null,
      avgFame: played.length ? Math.round(played.reduce((s, h) => s + h.fame, 0) / played.length) : 0,
      totalFame: counted.reduce((s, h) => s + (h.fame || 0), 0),
      score,
      trend,
      history,
      ...recommend({ score, trend, missStreak, counted: counted.length, role: m.role, status: m.status }, cfg)
    };
  });

  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  rows.forEach((r, i) => (r.rank = i + 1));
  return { rows, wars, config: cfg };
}

function avgScore(list) {
  if (!list.length) return null;
  return list.reduce((s, h) => s + h.score, 0) / list.length;
}

function wasInClanFor(member, war) {
  if (!member.joinedAt) return false;
  return String(member.joinedAt) <= String(war.createdDate);
}

const ROLE_ORDER = ['member', 'elder', 'coLeader', 'leader'];

export function recommend(input, cfg = DEFAULT_CONFIG) {
  const { score, trend, missStreak, counted, role, status } = input;

  if (status === 'departed') {
    return { action: 'departed', reason: 'No longer in the clan.', severity: 0 };
  }
  if (score === null || counted < cfg.minWarsForAction) {
    return {
      action: 'watch',
      reason: `Only ${counted} tracked war${counted === 1 ? '' : 's'} — not enough to judge.`,
      severity: 0
    };
  }
  if (missStreak >= cfg.missStreakForAction) {
    const kick = role === 'member';
    return {
      action: kick ? 'kick' : 'demote',
      reason: `${missStreak} un-excused wars with zero decks used.`,
      severity: 3
    };
  }
  if (score < cfg.thresholds.warn) {
    const kick = role === 'member';
    return {
      action: kick ? 'kick' : 'demote',
      reason: `Rolling score ${score} is below the ${cfg.thresholds.warn} floor.`,
      severity: 3
    };
  }
  if (score < cfg.thresholds.hold) {
    return {
      action: 'warn',
      reason: `Rolling score ${score} is under the ${cfg.thresholds.hold} hold line${trend !== null && trend < 0 ? ` and falling (${trend})` : ''}.`,
      severity: 2
    };
  }
  if (score >= cfg.thresholds.promote && counted >= 4 && ROLE_ORDER.indexOf(role) < ROLE_ORDER.length - 2) {
    return {
      action: 'promote',
      reason: `Rolling score ${score} over ${counted} wars clears the ${cfg.thresholds.promote} promote line.`,
      severity: 1
    };
  }
  return { action: 'hold', reason: `Steady at ${score}.`, severity: 0 };
}

export { round, clamp01 };
