// The store keeps everything; the board reads a fraction of it. One mapping,
// used by the static build and by the live server, so the two never drift.

export function compactState(state) {
  return {
    clan: { name: state.clan?.name ?? 'The Exiled', tag: state.clan?.tag ?? '' },
    members: Object.values(state.members || {}).map((m) => [
      m.tag, m.name, m.role, String(m.joinedAt).slice(0, 10), m.status
    ]),
    wars: (state.wars || []).map((w) => ({
      i: w.id,
      d: String(w.createdDate).slice(0, 10),
      r: w.rank ?? null,
      c: w.complete !== false,
      p: Object.fromEntries(
        Object.entries(w.participants || {}).map(([tag, p]) => [tag, [p.decksUsed, p.fame, p.repairPoints]])
      )
    })),
    ex: (state.exemptions || []).map((e) => [e.tag, e.warId, e.note])
  };
}
