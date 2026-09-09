/**
 * Where the map is kept.
 *
 * Inside the extension that means chrome.storage.local; opened as a plain page for
 * testing it falls back to localStorage. Same three calls either way, so nothing
 * above here has to care which it is.
 *
 * This is deliberately local for now. The map belongs in the repo eventually —
 * that needs write credentials we do not have yet.
 */
const Store = (() => {
  const hasChrome = typeof chrome !== "undefined" && chrome.storage?.local;

  async function get(key, fallback = null) {
    if (hasChrome) {
      const bag = await chrome.storage.local.get(key);
      return bag[key] ?? fallback;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }

  async function set(key, value) {
    if (hasChrome) return chrome.storage.local.set({ [key]: value });
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function remove(key) {
    if (hasChrome) return chrome.storage.local.remove(key);
    localStorage.removeItem(key);
  }

  return { get, set, remove, get local() { return !hasChrome; } };
})();
