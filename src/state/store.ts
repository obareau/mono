import type { StackItem } from "../engine/pipeline";
import type { SourceImage } from "../io/loadImage";
import { getFilter } from "../filters/registry";
import { defaultParams, type ParamValues } from "../filters/types";

// Minimal observable store. UI subscribes; any mutation re-runs the pipeline + render.
type Listener = () => void;

// One serialized stack item (no uid) — the unit of history and of presets/share links.
type SerializedItem = { filterId: string; params: ParamValues; enabled: boolean; opacity: number };

let uidCounter = 1;

class Store {
  source: SourceImage | null = null;
  stack: StackItem[] = [];
  private listeners = new Set<Listener>(); // structural changes -> rebuild sidebar
  private renderListeners = new Set<Listener>(); // value changes -> redraw only
  private historyListeners = new Set<Listener>(); // undo/redo availability changed

  // Undo/redo: a ring of serialized stack states. Structural changes snapshot
  // immediately; value (slider) changes snapshot debounced so one drag = one step.
  private history: SerializedItem[][] = [[]];
  private histIndex = 0;
  private applying = false; // suppress snapshotting while we replay a history state
  private valueTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly HISTORY_CAP = 100;

  /** Structural changes (add/remove/reorder/source/playback): rebuild UI + redraw. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** Value changes (param/anim sliders): redraw without rebuilding the sidebar (keeps drags alive). */
  subscribeRender(fn: Listener): () => void {
    this.renderListeners.add(fn);
    return () => this.renderListeners.delete(fn);
  }
  /** Undo/redo availability changed (for toolbar button state). */
  subscribeHistory(fn: Listener): () => void {
    this.historyListeners.add(fn);
    return () => this.historyListeners.delete(fn);
  }
  private emit() {
    this.snapshot();
    for (const l of this.listeners) l();
    for (const l of this.renderListeners) l();
  }
  private emitRender() {
    this.snapshotDebounced();
    for (const l of this.renderListeners) l();
  }
  private emitHistory() {
    for (const l of this.historyListeners) l();
  }

  // ---- history ----

  /** Commit the current stack as a new history entry (no-op if unchanged). */
  private snapshot() {
    if (this.applying) return;
    if (this.valueTimer) { clearTimeout(this.valueTimer); this.valueTimer = null; }
    const state = this.serialize();
    if (JSON.stringify(state) === JSON.stringify(this.history[this.histIndex])) return;
    this.history = this.history.slice(0, this.histIndex + 1); // drop any redo tail
    this.history.push(state);
    if (this.history.length > Store.HISTORY_CAP) this.history.shift();
    this.histIndex = this.history.length - 1;
    this.emitHistory();
  }

  /** Coalesce a burst of value changes (a slider drag) into a single snapshot. */
  private snapshotDebounced() {
    if (this.applying) return;
    if (this.valueTimer) clearTimeout(this.valueTimer);
    this.valueTimer = setTimeout(() => { this.valueTimer = null; this.snapshot(); }, 400);
  }

  /** Make the current stack the history baseline (call after restoring on load). */
  resetHistory() {
    if (this.valueTimer) { clearTimeout(this.valueTimer); this.valueTimer = null; }
    this.history = [this.serialize()];
    this.histIndex = 0;
    this.emitHistory();
  }

  canUndo() { return this.histIndex > 0; }
  canRedo() { return this.histIndex < this.history.length - 1; }

  undo() {
    if (this.valueTimer) { clearTimeout(this.valueTimer); this.valueTimer = null; this.snapshot(); } // flush a pending drag first
    if (!this.canUndo()) return;
    this.histIndex--;
    this.replay();
  }
  redo() {
    if (!this.canRedo()) return;
    this.histIndex++;
    this.replay();
  }
  private replay() {
    this.applying = true;
    this.setStack(this.history[this.histIndex]); // emit() snapshot is suppressed by `applying`
    this.applying = false;
    this.emitHistory();
  }

  setSource(img: SourceImage) {
    this.source = img;
    this.emit();
  }

  addFilter(filterId: string) {
    const f = getFilter(filterId);
    if (!f) return;
    this.stack.push({ uid: uidCounter++, filterId, params: defaultParams(f), enabled: true, opacity: 1 });
    this.emit();
  }

  removeFilter(uid: number) {
    this.stack = this.stack.filter((s) => s.uid !== uid);
    this.emit();
  }

  toggleFilter(uid: number) {
    const it = this.stack.find((s) => s.uid === uid);
    if (it) it.enabled = !it.enabled;
    this.emit();
  }

  move(uid: number, dir: -1 | 1) {
    const i = this.stack.findIndex((s) => s.uid === uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.stack.length) return;
    [this.stack[i], this.stack[j]] = [this.stack[j], this.stack[i]];
    this.emit();
  }

  /** Drag-to-reorder: move `fromUid` to the slot currently held by `toUid`. */
  reorder(fromUid: number, toUid: number) {
    const from = this.stack.findIndex((s) => s.uid === fromUid);
    const to = this.stack.findIndex((s) => s.uid === toUid);
    if (from < 0 || to < 0 || from === to) return;
    const [it] = this.stack.splice(from, 1);
    this.stack.splice(to, 0, it);
    this.emit();
  }

  setOpacity(uid: number, value: number) {
    const it = this.stack.find((s) => s.uid === uid);
    if (it) it.opacity = value;
    this.emitRender();
  }

  setParam(uid: number, key: string, value: number | boolean | string) {
    const it = this.stack.find((s) => s.uid === uid);
    if (it) it.params[key] = value;
    this.emitRender();
  }

  clear() {
    this.stack = [];
    this.emit();
  }

  /** Serialize the stack for presets (no uids). */
  serialize() {
    return this.stack.map((s) => ({ filterId: s.filterId, params: { ...s.params }, enabled: s.enabled, opacity: s.opacity ?? 1 }));
  }

  /** Replace the stack from a preset, dropping unknown filters and merging params with defaults. */
  setStack(items: { filterId: string; params: ParamValues; enabled: boolean; opacity?: number }[]) {
    this.stack = [];
    for (const it of items) {
      const f = getFilter(it.filterId);
      if (!f) continue;
      const params = defaultParams(f);
      for (const d of f.params) if (it.params[d.key] !== undefined) params[d.key] = it.params[d.key];
      this.stack.push({ uid: uidCounter++, filterId: it.filterId, params, enabled: it.enabled !== false, opacity: it.opacity ?? 1 });
    }
    this.emit();
  }
}

export const store = new Store();
