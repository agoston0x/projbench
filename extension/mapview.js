/**
 * The map, drawn.
 *
 * An area is a bubble; its parts hang beneath it on a line. A part with a chosen
 * option is settled, a part with options and no choice is an open question — that
 * contrast is the whole reason to look at a project this way.
 *
 * The layout is measured, not guessed: narrow panels stack everything in one
 * column, wider ones put areas side by side, and a ResizeObserver re-runs it when
 * the user drags the panel edge.
 */
const MapView = (() => {
  const COL_MIN = 300;      // an area column needs at least this much room
  const COL_GAP = 26;
  const PAD = 16;

  let host = null;          // the scrolling stage
  let observer = null;

  /* -------------------------------- layout ------------------------------- */

  /** How many area columns fit, given the width we actually have. */
  const columnsFor = width => Math.max(1, Math.floor((width - PAD * 2 + COL_GAP) / (COL_MIN + COL_GAP)));

  function render() {
    host = host ?? document.getElementById("mapStage");
    const map = ProjectMap.get();

    host.replaceChildren();
    host.classList.toggle("empty", map.areas.length === 0);

    if (map.areas.length === 0) {
      host.append(emptyState());
      count();
      return;
    }

    const cols = columnsFor(host.clientWidth || 380);
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

    map.areas.forEach((area, i) => grid.append(areaColumn(area, i)));

    const add = document.createElement("button");
    add.className = "bubble add area";
    add.textContent = "＋ Area";
    add.onclick = () => ask("Name of the area").then(n => n && ProjectMap.addArea(n).then(render));
    grid.append(add);

    host.append(grid);
    count();
    requestAnimationFrame(drawConnectors);
  }

  /** One area and everything under it — its own little tree. */
  function areaColumn(area, index) {
    const col = document.createElement("div");
    col.className = "col";
    col.dataset.lane = index % 5;

    const bubble = document.createElement("div");
    bubble.className = "bubble area";

    const title = document.createElement("div");
    title.className = "bubbleName";
    title.textContent = area.name;
    title.title = "Click to rename";
    title.onclick = () => ask("Rename area", area.name).then(n => n && ProjectMap.rename(area.id, n).then(render));

    const sub = document.createElement("div");
    sub.className = "bubbleSub";
    const open = area.parts.filter(p => p.vars.length > 1 && p.pick === null).length;
    sub.textContent = area.parts.length === 0
      ? "empty"
      : `${area.parts.length} part${area.parts.length === 1 ? "" : "s"}` + (open ? ` · ${open} open` : "");

    const tools = document.createElement("div");
    tools.className = "bubbleTools";
    tools.append(
      iconButton("＋", "Add a part", () => ask("Name of the part").then(n => n && ProjectMap.addPart(area.id, n).then(render))),
      iconButton(area.open ? "▾" : "▸", area.open ? "Collapse" : "Expand", () => ProjectMap.toggle(area.id).then(render)),
      iconButton("✕", "Remove this area", () => ProjectMap.remove(area.id).then(render), "danger"),
    );

    bubble.append(title, sub, tools);
    col.append(bubble);

    if (area.open && area.parts.length) {
      const kids = document.createElement("div");
      kids.className = "kids";
      for (const part of area.parts) kids.append(partBubble(part));
      col.append(kids);
    }
    return col;
  }

  function partBubble(part) {
    const decided = part.pick !== null && part.vars[part.pick];
    const question = !decided && part.vars.length > 1;

    const el = document.createElement("div");
    el.className = "bubble part" + (decided ? " decided" : question ? " question" : "");
    el.dataset.part = part.id;

    const head = document.createElement("div");
    head.className = "partTop";

    const name = document.createElement("div");
    name.className = "bubbleName";
    name.textContent = part.name;
    name.title = "Click to rename";
    name.onclick = () => ask("Rename part", part.name).then(n => n && ProjectMap.rename(part.id, n).then(render));

    head.append(name, iconButton("✕", "Remove this part", () => ProjectMap.remove(part.id).then(render), "danger"));
    el.append(head);

    if (decided || question) {
      const state = document.createElement("div");
      state.className = "bubbleSub";
      state.textContent = decided ? part.vars[part.pick].n : "undecided";
      el.append(state);
    }

    const chips = document.createElement("div");
    chips.className = "chips";
    part.vars.forEach((v, i) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (part.pick === i ? " on" : "");
      chip.textContent = v.n;
      chip.title = part.pick === i ? "Chosen — click to reopen the question" : "Choose this one";
      chip.onclick = () => ProjectMap.choose(part.id, i).then(render);
      chips.append(chip);
    });
    const more = document.createElement("button");
    more.className = "chip add";
    more.textContent = "＋";
    more.title = "Add an option";
    more.onclick = () => ask("Name of the option").then(n => n && ProjectMap.addVariant(part.id, n).then(render));
    chips.append(more);

    el.append(chips);
    return el;
  }

  function emptyState() {
    const wrap = document.createElement("div");
    wrap.className = "blank";

    const words = document.createElement("p");
    words.textContent = "Nothing mapped yet. Areas are the parts a project is made of — rooms, panels, sections — and each one holds the decisions still to make.";

    const add = document.createElement("button");
    add.className = "bubble add area";
    add.textContent = "＋ Add the first area";
    add.onclick = () => ask("Name of the area").then(n => n && ProjectMap.addArea(n).then(render));

    wrap.append(add, words);
    return wrap;
  }

  /* ------------------------------ connectors ----------------------------- */

  /** Lines from each area bubble down to its parts, drawn over the laid-out DOM. */
  function drawConnectors() {
    host.querySelectorAll("svg.wires").forEach(s => s.remove());

    for (const col of host.querySelectorAll(".col")) {
      const area = col.querySelector(".bubble.area");
      const kids = [...col.querySelectorAll(".kids > .bubble.part")];
      if (!area || kids.length === 0) continue;

      const box = col.getBoundingClientRect();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "wires");
      svg.setAttribute("width", box.width);
      svg.setAttribute("height", box.height);

      const from = area.getBoundingClientRect();
      const x1 = from.left - box.left + 22;
      const y1 = from.bottom - box.top;

      for (const kid of kids) {
        const to = kid.getBoundingClientRect();
        const x2 = to.left - box.left;
        const y2 = to.top - box.top + 18;
        const mid = y1 + (y2 - y1) * 0.55;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${mid}, ${x1} ${y2}, ${x2} ${y2}`);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("opacity", ".5");
        svg.append(path);
      }
      col.prepend(svg);
    }
  }

  /* -------------------------------- plumbing ----------------------------- */

  function count() {
    const c = ProjectMap.counts();
    document.getElementById("mapCount").textContent = c.areas === 0
      ? "nothing mapped yet"
      : `${c.areas} area${c.areas === 1 ? "" : "s"} · ${c.parts} part${c.parts === 1 ? "" : "s"} · ${c.open} open`;
  }

  function iconButton(glyph, title, onClick, extra = "") {
    const b = document.createElement("button");
    b.className = "icon " + extra;
    b.textContent = glyph;
    b.title = title;
    b.onclick = e => { e.stopPropagation(); onClick(); };
    return b;
  }

  const ask = (label, value = "") => Promise.resolve(window.prompt(label, value));

  /** Re-lay out when the panel is dragged wider or narrower. */
  function watch() {
    host = host ?? document.getElementById("mapStage");
    if (observer || !window.ResizeObserver) return;
    let last = 0;
    observer = new ResizeObserver(() => {
      const cols = columnsFor(host.clientWidth);
      if (cols === last) return drawConnectors();
      last = cols;
      render();
    });
    observer.observe(host);
  }

  return { render, watch, columnsFor };
})();
