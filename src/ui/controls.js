import { store } from "../state/store";
// Builds one control row from a declarative ParamDef. This is why adding a filter needs
// zero UI code: the control type is read straight off the param definition.
export function buildControl(item, def) {
    const row = el("label", "ctl");
    const name = el("span", "ctl-label");
    name.textContent = def.label;
    row.appendChild(name);
    const current = item.params[def.key];
    if (def.type === "range") {
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(def.min ?? 0);
        input.max = String(def.max ?? 1);
        input.step = String(def.step ?? 0.01);
        input.value = String(current);
        const val = el("span", "ctl-val");
        val.textContent = fmt(current);
        input.addEventListener("input", () => {
            val.textContent = fmt(parseFloat(input.value));
            store.setParam(item.uid, def.key, parseFloat(input.value));
        });
        row.appendChild(input);
        row.appendChild(val);
    }
    else if (def.type === "toggle") {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = current;
        input.addEventListener("change", () => store.setParam(item.uid, def.key, input.checked));
        row.classList.add("ctl-toggle");
        row.appendChild(input);
    }
    else if (def.type === "select") {
        const sel = document.createElement("select");
        for (const opt of def.options ?? []) {
            const o = document.createElement("option");
            o.value = opt;
            o.textContent = opt;
            if (opt === current)
                o.selected = true;
            sel.appendChild(o);
        }
        sel.addEventListener("change", () => store.setParam(item.uid, def.key, sel.value));
        row.appendChild(sel);
    }
    else if (def.type === "text") {
        const input = document.createElement("input");
        input.type = "text";
        input.value = String(current);
        input.spellcheck = false;
        input.addEventListener("input", () => store.setParam(item.uid, def.key, input.value));
        row.classList.add("ctl-text");
        row.appendChild(input);
    }
    return row;
}
function fmt(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
export function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls)
        e.className = cls;
    return e;
}
