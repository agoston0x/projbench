/**
 * The panel: load a repository, draw its history, let people move around it.
 *
 * Everything on screen is a real commit from GitHub. The vocabulary is not git's,
 * though — versions and directions — because the person reading this may never
 * have used git. The hash is there, but only inside an opened card.
 */
const stage = document.getElementById("stage");
const canvas = document.getElementById("canvas");
const svg = document.getElementById("lines");
const nodeLayer = document.getElementById("nodes");
const status = document.getElementById("status");
const zoomLabel = document.getElementById("zoomLevel");

const LANE_COLOURS = ["--lane-0", "--lane-1", "--lane-2", "--lane-3", "--lane-4"];

let view = { zoom: 1, x: 0, y: 0 };
let open = new Set();          // shas of expanded cards
let current = null;            // last built tree

/* ------------------------------- loading ------------------------------- */

async function load() {
  const input = document.getElementById("repo").value;
  say("reading " + input + "…");
  try {
    const data = await GitHub.history(input);
    current = Tree.build(data.commits, data.branches, data.repo.default);
    open = new Set();
    draw();
    fit();
    say(`${data.commits.length} versions · ${data.branches.length} direction${data.branches.length === 1 ? "" : "s"}`
      + (data.remaining ? ` · ${data.remaining} requests left this hour` : ""));
  } catch (e) {
    say(e.message);
  }
}

const say = text => { status.textContent = text; };

/* ------------------------------- drawing ------------------------------- */

function draw() {
  if (!current) return;
  const { nodes, edges, width, height } = current;

  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.replaceChildren();

  for (const e of edges) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", Tree.path(e));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", colour(e.to.lane));
    line.setAttribute("stroke-width", e.merge ? 1.5 : 2);
    if (e.merge) line.setAttribute("stroke-dasharray", "4 3");
    line.setAttribute("opacity", ".75");
    svg.append(line);
  }

  nodeLayer.replaceChildren();
  for (const n of nodes) nodeLayer.append(card(n));

  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  place();
}

/** A version. Closed it is one line; open it shows everything we know. */
function card(n) {
  const wrap = document.createElement("div");

  const dot = document.createElement("div");
  dot.className = "dot";
  dot.style.setProperty("--lane", colour(n.lane));
  dot.style.left = n.x - 5.5 + "px";
  dot.style.top = n.y - 5.5 + "px";

  const el = document.createElement("div");
  el.className = "node" + (open.has(n.sha) ? " open" : "");
  el.style.setProperty("--lane", colour(n.lane));
  el.style.left = n.x + 22 + "px";
  el.style.top = n.y - 20 + "px";

  const [title, ...rest] = n.message.split("\n");
  const body = rest.join("\n").trim();

  const t = document.createElement("div");
  t.className = "title";
  t.textContent = title;
  el.append(t);

  const meta = document.createElement("div");
  meta.className = "meta";
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = n.login ?? n.author;
  const when = document.createElement("span");
  when.textContent = n.date ? new Date(n.date).toLocaleDateString() : "";
  meta.append(who, when);
  for (const b of n.branches) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = b;
    meta.append(tag);
  }
  el.append(meta);

  if (open.has(n.sha)) {
    if (body) {
      const b = document.createElement("div");
      b.className = "body";
      b.textContent = body;
      el.append(b);
    }
    const h = document.createElement("div");
    h.className = "hash";
    h.textContent = n.sha.slice(0, 7) + (n.parents.length > 1 ? " · merge" : "");
    el.append(h);
  }

  el.onclick = event => {
    event.stopPropagation();
    open.has(n.sha) ? open.delete(n.sha) : open.add(n.sha);
    draw();
  };

  wrap.append(dot, el);
  return wrap;
}

const colour = lane =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(LANE_COLOURS[lane % LANE_COLOURS.length]).trim();

/* -------------------------- panning and zooming ------------------------ */

function place() {
  canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  zoomLabel.textContent = Math.round(view.zoom * 100) + "%";
}

function zoomBy(factor, cx, cy) {
  const next = Math.min(2.5, Math.max(0.25, view.zoom * factor));
  const rect = stage.getBoundingClientRect();
  const px = (cx ?? rect.width / 2) - view.x;
  const py = (cy ?? rect.height / 2) - view.y;
  view.x -= px * (next / view.zoom - 1);
  view.y -= py * (next / view.zoom - 1);
  view.zoom = next;
  place();
}

/** Show the whole tree, or as much of it as fits. */
function fit() {
  if (!current) return;
  const rect = stage.getBoundingClientRect();
  const scale = Math.min(1, (rect.width - 20) / current.width, (rect.height - 20) / current.height);
  view = { zoom: Math.max(0.25, scale), x: 10, y: 10 };
  place();
}

/**
 * Panning must not eat clicks on cards. So the pointer is only captured once the
 * hand has actually moved — below that threshold it stays an ordinary click.
 */
let drag = null;
const DRAG_START = 4;

stage.addEventListener("pointerdown", e => {
  drag = { x: e.clientX - view.x, y: e.clientY - view.y, from: [e.clientX, e.clientY], moved: false, id: e.pointerId };
});

stage.addEventListener("pointermove", e => {
  if (!drag) return;
  if (!drag.moved) {
    const far = Math.hypot(e.clientX - drag.from[0], e.clientY - drag.from[1]) > DRAG_START;
    if (!far) return;
    drag.moved = true;
    stage.classList.add("panning");
    stage.setPointerCapture(drag.id);
  }
  view.x = e.clientX - drag.x;
  view.y = e.clientY - drag.y;
  place();
});

const endDrag = () => {
  if (drag?.moved) stage.releasePointerCapture?.(drag.id);
  drag = null;
  stage.classList.remove("panning");
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

stage.addEventListener("wheel", e => {
  e.preventDefault();
  const rect = stage.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) {
    zoomBy(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - rect.left, e.clientY - rect.top);
  } else {
    view.x -= e.deltaX;
    view.y -= e.deltaY;
    place();
  }
}, { passive: false });

/* ------------------------------- controls ------------------------------ */

/* --------------------------------- tabs -------------------------------- */

let loadedHistory = false;

function showTab(which) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === which));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v.dataset.view === which));
  if (which === "history") {
    if (!loadedHistory) { loadedHistory = true; load(); }
    else if (current) fit();
  } else {
    MapView.render();
    MapView.watch();
    say(Store.local ? "map kept in this browser" : "map kept in the extension");
  }
}

document.querySelectorAll(".tab").forEach(t => { t.onclick = () => showTab(t.dataset.tab); });

document.getElementById("load").onclick = load;
document.getElementById("repo").addEventListener("keydown", e => { if (e.key === "Enter") load(); });

document.querySelectorAll("[data-zoom]").forEach(b => {
  b.onclick = () => {
    if (b.dataset.zoom === "in") zoomBy(1.2);
    else if (b.dataset.zoom === "out") zoomBy(1 / 1.2);
    else fit();
  };
});

document.getElementById("expandAll").onclick = () => {
  if (!current) return;
  open = new Set(current.nodes.map(n => n.sha));
  draw();
};
document.getElementById("collapseAll").onclick = () => { open = new Set(); draw(); };

ProjectMap.load().then(() => showTab("history"));
