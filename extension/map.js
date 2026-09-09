/**
 * The project map: what the thing is made of, and what is still undecided.
 *
 *   project → areas → parts → variants
 *
 * A part with a chosen variant is a decision. A part with variants and no choice
 * is an open question — which is the whole point of looking at a project this way.
 * Later each open question becomes a branch, and choosing one becomes a merge.
 */
const ProjectMap = (() => {
  const KEY = "projbench.map";

  const uid = prefix => prefix + Math.random().toString(36).slice(2, 8);

  /** A project starts empty. Having commits says nothing about having areas. */
  const blank = () => ({ name: "projbench", areas: [] });

  let map = blank();

  const load = async () => { map = await Store.get(KEY, blank()); return map; };
  const save = () => Store.set(KEY, map);
  const get = () => map;

  const area = id => map.areas.find(a => a.id === id);
  const part = id => {
    for (const a of map.areas) {
      const p = a.parts.find(p => p.id === id);
      if (p) return { area: a, part: p };
    }
    return null;
  };

  /* ------------------------------- editing ------------------------------ */

  const addArea = name => {
    map.areas.push({ id: uid("a"), name: name || "New area", open: true, parts: [] });
    return save();
  };

  const addPart = (areaId, name) => {
    area(areaId)?.parts.push({ id: uid("p"), name: name || "New part", pick: null, vars: [] });
    return save();
  };

  const addVariant = (partId, name) => {
    part(partId)?.part.vars.push({ n: name || "Option" });
    return save();
  };

  /** Choosing the one already chosen un-chooses it — a decision can be reopened. */
  const choose = (partId, index) => {
    const found = part(partId);
    if (!found) return save();
    found.part.pick = found.part.pick === index ? null : index;
    return save();
  };

  const rename = (id, name) => {
    if (!name) return save();
    const a = area(id);
    if (a) { a.name = name; return save(); }
    const p = part(id);
    if (p) p.part.name = name;
    return save();
  };

  const remove = id => {
    const before = map.areas.length;
    map.areas = map.areas.filter(a => a.id !== id);
    if (map.areas.length !== before) return save();
    for (const a of map.areas) a.parts = a.parts.filter(p => p.id !== id);
    return save();
  };

  const toggle = id => {
    const a = area(id);
    if (a) a.open = !a.open;
    return save();
  };

  /* ------------------------------- reading ------------------------------ */

  /** How much of this project is still undecided. */
  const openQuestions = () =>
    map.areas.flatMap(a => a.parts.filter(p => p.vars.length > 1 && p.pick === null)
      .map(p => ({ area: a.name, part: p.name })));

  const counts = () => ({
    areas: map.areas.length,
    parts: map.areas.reduce((n, a) => n + a.parts.length, 0),
    open: openQuestions().length,
  });

  return { load, save, get, addArea, addPart, addVariant, choose, rename, remove, toggle, openQuestions, counts, KEY };
})();
