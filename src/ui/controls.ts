import type { ParamDef } from "../filters/types";
import type { StackItem } from "../engine/pipeline";
import { store } from "../state/store";
import { getMask, loadMaskFile } from "../io/maskStore";

// Builds one control row from a declarative ParamDef. This is why adding a filter needs
// zero UI code: the control type is read straight off the param definition.
export function buildControl(item: StackItem, def: ParamDef): HTMLElement {
  const row = el("label", "ctl");
  const name = el("span", "ctl-label");
  name.textContent = def.label;
  row.appendChild(name);

  const current = item.params[def.key];

  if (def.type === "range") {
    const input = document.createElement("input");
    input.type = "range";
    const min = def.min ?? 0;
    const max = def.max ?? 1;
    input.min = String(min);
    input.max = String(max);
    input.step = String(def.step ?? 0.01);
    input.value = String(current);
    const val = el("span", "ctl-val");
    val.textContent = fmt(current as number);
    input.addEventListener("input", () => {
      val.textContent = fmt(parseFloat(input.value));
      store.setParam(item.uid, def.key, parseFloat(input.value));
    });

    if (def.ticks?.length) {
      // wrap slider + anchored ticks (e.g. 80 / 120 cols); ticks are click-to-snap.
      const wrap = el("div", "ctl-slider");
      wrap.appendChild(input);
      const ticks = el("div", "ctl-ticks");
      for (const t of def.ticks) {
        const pct = ((t - min) / (max - min)) * 100;
        const tick = el("button", "ctl-tick");
        tick.style.left = `${pct}%`;
        tick.textContent = String(t);
        tick.title = `Snap to ${t}`;
        tick.addEventListener("click", () => {
          input.value = String(t);
          val.textContent = fmt(t);
          store.setParam(item.uid, def.key, t);
        });
        ticks.appendChild(tick);
      }
      wrap.appendChild(ticks);
      row.appendChild(wrap);
    } else {
      row.appendChild(input);
    }
    row.appendChild(val);
  } else if (def.type === "toggle") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = current as boolean;
    input.addEventListener("change", () => store.setParam(item.uid, def.key, input.checked));
    row.classList.add("ctl-toggle");
    row.appendChild(input);
  } else if (def.type === "select") {
    const sel = document.createElement("select");
    for (const opt of def.options ?? []) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (opt === current) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => store.setParam(item.uid, def.key, sel.value));
    row.appendChild(sel);
  } else if (def.type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = String(current);
    input.spellcheck = false;
    input.addEventListener("input", () => store.setParam(item.uid, def.key, input.value));
    row.classList.add("ctl-text");
    row.appendChild(input);
  } else if (def.type === "mask") {
    row.classList.add("ctl-text");
    const wrap = el("div", "mask-ctl");
    const loaded = getMask(current as string);
    const name = el("span", "mask-name");
    name.textContent = loaded ? loaded.name : "built-in Bayer";
    const load = document.createElement("button");
    load.className = "btn mini";
    load.textContent = "LOAD";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.style.display = "none";
    load.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (f) store.setParam(item.uid, def.key, await loadMaskFile(f));
    });
    wrap.append(name, load, file);
    row.appendChild(wrap);
  }
  return row;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function el(tag: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
