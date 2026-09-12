/**
 * Local persistence: one autosave slot that always holds the current build, and
 * any number of named saves.
 *
 * Every read is defensive. Browser storage can be full, disabled, or hold
 * something written by an older version of the tool, and none of those should
 * cost the user their session.
 */
const AUTOSAVE_KEY = 'wardogs.autosave';
const INDEX_KEY = 'wardogs.saves';
const SAVE_PREFIX = 'wardogs.save.';

export class Storage {
  constructor(store = globalThis.localStorage) {
    this.store = store ?? null;
  }

  get available() {
    return Boolean(this.store);
  }

  #read(key) {
    try {
      const raw = this.store?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  #write(key, value) {
    try {
      this.store?.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      // Quota exceeded, or storage disabled. The build is still in memory and
      // can be exported, so this is reported rather than thrown.
      return false;
    }
  }

  // --- autosave --------------------------------------------------------------

  autosave(doc) {
    return this.#write(AUTOSAVE_KEY, { savedAt: Date.now(), doc });
  }

  restore() {
    return this.#read(AUTOSAVE_KEY)?.doc ?? null;
  }

  clearAutosave() {
    try { this.store?.removeItem(AUTOSAVE_KEY); } catch { /* nothing to do */ }
  }

  // --- named saves -----------------------------------------------------------

  list() {
    const index = this.#read(INDEX_KEY);
    return Array.isArray(index) ? index : [];
  }

  /** Saving under a name that already exists overwrites that slot. */
  save(name, doc) {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const index = this.list();
    const existing = index.find((entry) => entry.name === trimmed);
    const id = existing?.id ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const entry = { id, name: trimmed, savedAt: Date.now(), pieces: doc.pieces?.length ?? 0 };

    if (!this.#write(SAVE_PREFIX + id, doc)) return null;
    const next = [entry, ...index.filter((e) => e.id !== id)];
    if (!this.#write(INDEX_KEY, next)) return null;
    return entry;
  }

  load(id) {
    return this.#read(SAVE_PREFIX + id);
  }

  remove(id) {
    try { this.store?.removeItem(SAVE_PREFIX + id); } catch { /* nothing to do */ }
    this.#write(INDEX_KEY, this.list().filter((entry) => entry.id !== id));
  }
}
