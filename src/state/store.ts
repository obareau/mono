import type { StackItem } from "../engine/pipeline";
import type { SourceImage } from "../io/loadImage";
import { getFilter } from "../filters/registry";
import { defaultParams } from "../filters/types";

// Minimal observable store. UI subscribes; any mutation re-runs the pipeline + render.
type Listener = () => void;

let uidCounter = 1;

class Store {
  source: SourceImage | null = null;
  stack: StackItem[] = [];
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
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
    this.emit();
  }

  clear() {
    this.stack = [];
    this.emit();
  }
}

export const store = new Store();
