/**
 * The project map: what the thing is made of.
 *
 * One kind of node, nested as deep as the work needs. A vineyard has a plot, the
 * plot has a fence, the fence has a hedge — same shape at every level, so the
 * model never has to guess how many levels a project deserves.
 *
 * Later each node is a folder in the repo, and its children are what is inside.
 */
const ProjectMap = (() => {
  const KEY = "projbench.map";

  const uid = () => "n" + Math.random().toString(36).slice(2, 8);

  /** A project starts empty. Having commits says nothing about having areas. */
  const blank = () => ({ name: "projbench", nodes: [] });

  const node = (name = "") => ({ id: uid(), name, open: true, children: [] });

  let map = blank();

  /**
   * Anything stored in the older areas/parts shape is folded into the new one, so
   * nobody loses what they typed.
   */
  function migrate(stored) {
    if (!stored) return blank();
    if (stored.nodes) return stored;
    if (!stored.areas) return blank();
    return {
      name: stored.name ?? "projbench",
      nodes: stored.areas.map(a => ({
        id: a.id ?? uid(),
        name: a.name ?? "",
        open: a.open ?? true,
        children: (a.parts ?? []).map(p => ({
          id: p.id ?? uid(),
          name: p.name ?? "",
          open: true,
          // an old option list becomes children, and the chosen one is just kept
          children: (p.vars ?? []).map(v => ({ id: uid(), name: v.n ?? "", open: true, children: [] })),
        })),
      })),
    };
  }

  const load = async () => { map = migrate(await Store.get(KEY, null)); return map; };
  const save = () => Store.set(KEY, map);
  const get = () => map;

  /** Depth-first search returning the node and the list it lives in. */
  function find(id, list = map.nodes, parent = null) {
    for (const n of list) {
      if (n.id === id) return { node: n, list, parent };
      const deeper = find(id, n.children, n);
      if (deeper) return deeper;
    }
    return null;
  }

  /* ------------------------------- editing ------------------------------ */

  /** No parent id means top level. Returns the new node so callers can name it. */
  function add(parentId = null, name = "") {
    const fresh = node(name);
    if (!parentId) map.nodes.push(fresh);
    else {
      const found = find(parentId);
      if (!found) return null;
      found.node.children.push(fresh);
      found.node.open = true;
    }
    save();
    return fresh;
  }

  const rename = (id, name) => {
    const found = find(id);
    if (found) found.node.name = name;
    return save();
  };

  const remove = id => {
    const found = find(id);
    if (found) found.list.splice(found.list.indexOf(found.node), 1);
    return save();
  };

  const toggle = id => {
    const found = find(id);
    if (found) found.node.open = !found.node.open;
    return save();
  };

  const setOpen = (id, open) => {
    const found = find(id);
    if (found) found.node.open = open;
    return save();
  };

  /* ------------------------------- reading ------------------------------ */

  function counts(list = map.nodes, depth = 0, acc = { nodes: 0, leaves: 0, depth: 0 }) {
    for (const n of list) {
      acc.nodes += 1;
      acc.depth = Math.max(acc.depth, depth + 1);
      if (n.children.length === 0) acc.leaves += 1;
      counts(n.children, depth + 1, acc);
    }
    return acc;
  }

  return { load, save, get, add, rename, remove, toggle, setOpen, find, counts, KEY };
})();
