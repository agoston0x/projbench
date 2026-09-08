/**
 * Commits into a drawable tree.
 *
 * Git's history is a graph, but people read it as lines: a trunk going down, and
 * side lines for work that happened in parallel. So we walk first parents from
 * each branch tip to claim a lane, oldest branch first, and every commit keeps
 * the first lane that claims it.
 */
const Tree = (() => {
  const ROW = 96;      // vertical distance between versions
  const LANE = 34;     // horizontal distance between parallel directions
  const PAD = 22;

  /**
   * @param {{sha:string, parents:string[], date:string}[]} commits
   * @param {{name:string, sha:string}[]} branches
   * @param {string} head  the default branch name, which owns lane 0
   */
  function build(commits, branches, head) {
    const bySha = new Map(commits.map(c => [c.sha, c]));

    // newest first — that is the order they will be drawn in
    const ordered = [...commits].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const row = new Map(ordered.map((c, i) => [c.sha, i]));

    // the default branch first, so the trunk is lane 0
    const tips = [...branches].sort((a, b) =>
      (a.name === head ? -1 : 0) - (b.name === head ? -1 : 0) || a.name.localeCompare(b.name));

    const lane = new Map();
    const labels = new Map();     // sha → branch names that point at it

    tips.forEach((tip, i) => {
      labels.set(tip.sha, [...(labels.get(tip.sha) ?? []), tip.name]);

      // walk first parents; stop where another branch already claimed the line
      let sha = tip.sha;
      while (sha && bySha.has(sha)) {
        if (lane.has(sha)) break;
        lane.set(sha, i);
        sha = bySha.get(sha).parents[0];
      }
    });

    const nodes = ordered.map(c => ({
      ...c,
      lane: lane.get(c.sha) ?? 0,
      row: row.get(c.sha),
      x: PAD + (lane.get(c.sha) ?? 0) * LANE,
      y: PAD + row.get(c.sha) * ROW,
      branches: labels.get(c.sha) ?? [],
    }));

    const at = new Map(nodes.map(n => [n.sha, n]));

    // one edge per parent link we can actually see
    const edges = [];
    for (const n of nodes) {
      for (const p of n.parents) {
        const parent = at.get(p);
        if (parent) edges.push({ from: n, to: parent, merge: n.parents.length > 1 });
      }
    }

    const width = PAD * 2 + (tips.length - 1) * LANE + 250;
    const height = PAD * 2 + nodes.length * ROW;

    return { nodes, edges, width, height, laneCount: tips.length };
  }

  /** Elbow from child down to parent: straight in a lane, curved across lanes. */
  function path(edge) {
    const x1 = edge.from.x, y1 = edge.from.y;
    const x2 = edge.to.x, y2 = edge.to.y;
    if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const mid = y1 + (y2 - y1) * 0.5;
    return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
  }

  return { build, path, ROW, LANE, PAD };
})();
