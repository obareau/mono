import { getFilter } from "../filters/registry";
// Runs the stack top-to-bottom over a copy of the source buffer.
// A terminal filter (ASCII) ends the buffer chain and provides its own renderer.
export function runPipeline(source, w, h, stack) {
    let gray = new Float32Array(source);
    for (const item of stack) {
        if (!item.enabled)
            continue;
        const filter = getFilter(item.filterId);
        if (!filter)
            continue;
        if (filter.terminal && filter.render) {
            return { gray, w, h, terminal: filter.render(gray, w, h, item.params) };
        }
        if (filter.apply) {
            gray = filter.apply(gray, w, h, item.params);
        }
    }
    return { gray, w, h };
}
