/**
 * Reading a repository's real history, straight from GitHub.
 *
 * Public repos need no token, which is the point: the extension talks to the
 * canonical source with nothing of ours in between. Unauthenticated callers get
 * 60 requests an hour, so every response's rate-limit headers are kept and shown
 * rather than failing mysteriously later.
 */
const GitHub = (() => {
  const API = "https://api.github.com";

  let remaining = null;

  async function get(path, params = {}) {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url, { headers: { accept: "application/vnd.github+json" } });
    remaining = res.headers.get("x-ratelimit-remaining");

    if (res.status === 403 && remaining === "0") {
      const at = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      throw new Error("GitHub rate limit reached — resets " + new Date(at).toLocaleTimeString());
    }
    if (res.status === 404) throw new Error("no such repository (or it is private)");
    if (!res.ok) throw new Error("GitHub said " + res.status);

    return res.json();
  }

  /** "owner/name" → the pieces, tolerating a pasted URL */
  function parse(input) {
    const cleaned = input.trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/+$/, "");
    const [owner, name] = cleaned.split("/");
    if (!owner || !name) throw new Error('expected "owner/repository"');
    return { owner, name };
  }

  /**
   * Every branch, and the commits reachable from each. One request per branch,
   * which is fine for the repos a person actually works on.
   */
  async function history(input, perBranch = 60) {
    const { owner, name } = parse(input);
    const base = `/repos/${owner}/${name}`;

    const repo = await get(base);
    const branches = await get(base + "/branches", { per_page: 100 });

    const commits = new Map();      // sha → commit, deduped across branches
    const tips = [];

    for (const branch of branches) {
      const list = await get(base + "/commits", { sha: branch.name, per_page: perBranch });
      tips.push({ name: branch.name, sha: branch.commit.sha });

      for (const c of list) {
        if (commits.has(c.sha)) continue;
        commits.set(c.sha, {
          sha: c.sha,
          parents: c.parents.map(p => p.sha),
          message: c.commit.message,
          author: c.commit.author?.name ?? "unknown",
          login: c.author?.login ?? null,
          date: c.commit.author?.date ?? null,
        });
      }
    }

    return {
      repo: { full: repo.full_name, default: repo.default_branch, description: repo.description },
      branches: tips,
      commits: [...commits.values()],
      remaining,
    };
  }

  return { history, parse, get remaining() { return remaining; } };
})();
