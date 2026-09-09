/**
 * The map, drawn.
 *
 * One kind of bubble, nested. A bubble is a single row when it is closed — name on
 * the left, controls on the right — and opens to show whatever is inside it. The
 * children of a bubble look exactly like it, because they are the same thing.
 *
 * Everything happens in place: ＋ makes a child and puts the cursor in its name,
 * ✎ turns the name into a field. Nothing interrupts with a dialog.
 */
const MapView = (() => {
  const COL_MIN = 300;      // a top-level column needs at least this much room
  const COL_GAP = 26;
  const PAD = 16;
  const LANES = 5;          // how many hues before they repeat

  let host = null;
  let observer = null;
  let editing = null;       // id of the bubble whose name is being typed

  const columnsFor = width => Math.max(1, Math.floor((width - PAD * 2 + COL_GAP) / (COL_MIN + COL_GAP)));

  /* -------------------------------- render ------------------------------- */

  function render() {
    host = host ?? document.getElementById("mapStage");
    const map = ProjectMap.get();

    host.replaceChildren();
    const empty = map.nodes.length === 0;
    host.classList.toggle("empty", empty);

    if (empty) {
      host.append(emptyState());
      return count();
    }

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.style.gridTemplateColumns = `repeat(${columnsFor(host.clientWidth || 380)}, minmax(0, 1fr))`;

    map.nodes.forEach((n, i) => grid.append(bubble(n, 0, i)));
    grid.append(addBox(null, "＋ Area"));

    host.append(grid);
    count();
    requestAnimationFrame(drawWires);
    focusEditor();
  }

  /**
   * @param depth how deep we are, for sizing
   * @param seed  which hue this branch took, inherited by everything under it
   */
  function bubble(n, depth, seed) {
    const wrap = document.createElement("div");
    wrap.className = "branch";
    wrap.dataset.lane = seed % LANES;

    const box = document.createElement("div");
    box.className = "bubble" + (depth === 0 ? " top" : "");
    box.dataset.depth = Math.min(depth, 3);
    box.dataset.id = n.id;

    const row = document.createElement("div");
    row.className = "row";
    row.append(name(n), controls(n));
    box.append(row);

    if (n.children.length && !n.open) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = n.children.length + " inside";
      row.insertBefore(hint, row.lastChild);
    }

    // the whole bubble is the target, apart from the controls themselves
    box.onclick = e => {
      if (e.target.closest("button, input")) return;
      if (!n.children.length) return;
      ProjectMap.toggle(n.id).then(render);
    };

    wrap.append(box);

    if (n.open && n.children.length) {
      const kids = document.createElement("div");
      kids.className = "kids";
      n.children.forEach((c, i) => kids.append(bubble(c, depth + 1, depth === 0 ? seed : seed + i + 1)));
      wrap.append(kids);
    }
    return wrap;
  }

  /* ------------------------------- pieces -------------------------------- */

  function name(n) {
    const el = document.createElement("div");
    el.className = "bubbleName";

    if (editing === n.id) {
      el.append(field(n.name, next => {
        editing = null;
        if (next.trim()) ProjectMap.rename(n.id, next.trim()).then(render);
        else if (!n.name) ProjectMap.remove(n.id).then(render);   // abandoned before naming
        else render();
      }));
      return el;
    }

    el.textContent = n.name || "Untitled";
    return el;
  }

  function field(value, done) {
    const input = document.createElement("input");
    input.className = "nameField";
    input.value = value ?? "";
    input.placeholder = "Name it";
    input.onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      if (e.key === "Escape") { input.dataset.cancel = "1"; input.blur(); }
      e.stopPropagation();
    };
    input.onclick = e => e.stopPropagation();
    input.onblur = () => done(input.dataset.cancel ? value : input.value);
    return input;
  }

  /** ＋ ✎ ✕, on the same row as the name. */
  function controls(n) {
    const row = document.createElement("div");
    row.className = "bubbleTools";
    row.append(
      icon("＋", "Add something inside", () => {
        const child = ProjectMap.add(n.id, "");
        if (child) { editing = child.id; render(); }
      }),
      icon("✎", "Rename", () => { editing = n.id; render(); }),
      icon("✕", "Remove", () => ProjectMap.remove(n.id).then(render), "danger"),
    );
    return row;
  }

  function icon(glyph, label, onClick, extra = "") {
    const b = document.createElement("button");
    b.className = "icon " + extra;
    b.textContent = glyph;
    b.title = label;
    b.onclick = e => { e.stopPropagation(); onClick(); };
    return b;
  }

  function addBox(parentId, label) {
    const b = document.createElement("button");
    b.className = "bubble add";
    b.textContent = label;
    b.onclick = () => {
      const fresh = ProjectMap.add(parentId, "");
      if (fresh) { editing = fresh.id; render(); }
    };
    return b;
  }

  function emptyState() {
    const wrap = document.createElement("div");
    wrap.className = "blank";
    const words = document.createElement("p");
    words.textContent = "Nothing mapped yet. Add the parts this project is made of — rooms, panels, sections — and put whatever belongs to them inside.";
    wrap.append(addBox(null, "＋ Add the first area"), words);
    return wrap;
  }

  function focusEditor() {
    const input = host.querySelector(".nameField");
    if (!input) return;
    input.focus();
    input.select();
  }

  /* -------------------------------- wires -------------------------------- */

  /** A line from each bubble down to the children it holds. */
  function drawWires() {
    host.querySelectorAll("svg.wires").forEach(s => s.remove());

    for (const branch of host.querySelectorAll(".branch")) {
      const box = branch.querySelector(":scope > .bubble");
      const kids = [...branch.querySelectorAll(":scope > .kids > .branch > .bubble")];
      if (!box || kids.length === 0) continue;

      const frame = branch.getBoundingClientRect();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "wires");
      svg.setAttribute("width", frame.width);
      svg.setAttribute("height", frame.height);

      const from = box.getBoundingClientRect();
      const x1 = from.left - frame.left + 18;
      const y1 = from.bottom - frame.top;

      for (const kid of kids) {
        const to = kid.getBoundingClientRect();
        const x2 = to.left - frame.left;
        const y2 = to.top - frame.top + 16;
        const mid = y1 + (y2 - y1) * 0.55;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${mid}, ${x1} ${y2}, ${x2} ${y2}`);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("opacity", ".45");
        svg.append(path);
      }
      branch.prepend(svg);
    }
  }

  /* ------------------------------- plumbing ------------------------------ */

  function count() {
    const c = ProjectMap.counts();
    document.getElementById("mapCount").textContent = c.nodes === 0
      ? "nothing mapped yet"
      : `${c.nodes} bubble${c.nodes === 1 ? "" : "s"} · ${c.depth} level${c.depth === 1 ? "" : "s"} deep`;
  }

  function watch() {
    host = host ?? document.getElementById("mapStage");
    if (observer || !window.ResizeObserver) return;
    let last = 0;
    observer = new ResizeObserver(() => {
      const cols = columnsFor(host.clientWidth);
      if (cols === last) return drawWires();
      last = cols;
      render();
    });
    observer.observe(host);
  }

  return { render, watch, columnsFor };
})();
