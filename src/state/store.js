import { getFilter } from "../filters/registry";
import { defaultParams } from "../filters/types";
let uidCounter = 1;
class Store {
    constructor() {
        Object.defineProperty(this, "source", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "stack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "listeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
    }
    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    emit() {
        for (const l of this.listeners)
            l();
    }
    setSource(img) {
        this.source = img;
        this.emit();
    }
    addFilter(filterId) {
        const f = getFilter(filterId);
        if (!f)
            return;
        this.stack.push({ uid: uidCounter++, filterId, params: defaultParams(f), enabled: true });
        this.emit();
    }
    removeFilter(uid) {
        this.stack = this.stack.filter((s) => s.uid !== uid);
        this.emit();
    }
    toggleFilter(uid) {
        const it = this.stack.find((s) => s.uid === uid);
        if (it)
            it.enabled = !it.enabled;
        this.emit();
    }
    move(uid, dir) {
        const i = this.stack.findIndex((s) => s.uid === uid);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= this.stack.length)
            return;
        [this.stack[i], this.stack[j]] = [this.stack[j], this.stack[i]];
        this.emit();
    }
    setParam(uid, key, value) {
        const it = this.stack.find((s) => s.uid === uid);
        if (it)
            it.params[key] = value;
        this.emit();
    }
    clear() {
        this.stack = [];
        this.emit();
    }
}
export const store = new Store();
