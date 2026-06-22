import type { StackItem } from "../engine/pipeline";
import type { SourceImage } from "../io/loadImage";
import { getFilter } from "../filters/registry";
import { defaultParams, type ParamValues } from "../filters/types";

// Minimal observable store. UI subscribes; any mutation re-runs the pipeline + render.
type Listener = () => void;

let uidCounter = 1;

class Store {
  source: SourceImage | null = null;
  stack: StackItem[] = [];
  private listeners = new Set<Listener>(); // structural changes -> rebuild sidebar
  private renderListeners = new Set<Listener>(); // value changes -> redraw only

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
  private emit() {
    for (const l of this.listeners) l();
    for (const l of this.renderListeners) l();
  }
  private emitRender() {
    for (const l of this.renderListeners) l();
  }

  setSource(img: SourceImage) {
    this.source = img;
    this.emit();
  }

  addFilter(filterId: string) {
    const f = getFilter(filterId);
    if (!f) return;
    this.stack.push({ uid: uidCounter++, filterId, params: defaultParams(f), enabled: true });
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
    return this.stack.map((s) => ({ filterId: s.filterId, params: { ...s.params }, enabled: s.enabled }));
  }

  /** Replace the stack from a preset, dropping unknown filters and merging params with defaults. */
  setStack(items: { filterId: string; params: ParamValues; enabled: boolean }[]) {
    this.stack = [];
    for (const it of items) {
      const f = getFilter(it.filterId);
      if (!f) continue;
      const params = defaultParams(f);
      for (const d of f.params) if (it.params[d.key] !== undefined) params[d.key] = it.params[d.key];
      this.stack.push({ uid: uidCounter++, filterId: it.filterId, params, enabled: it.enabled !== false });
    }
    this.emit();
  }
}

export const store = new Store();
