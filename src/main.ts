import "./style.css";
import { mountApp } from "./ui/app";
import { store } from "./state/store";
import { loadFromHash, loadLocal, saveLocal } from "./io/presets";
import { demoImage, loadDemoImage } from "./io/demo";

const root = document.getElementById("app")!;
mountApp(root);

// Show the bundled MONO° splash on first load; fall back to the procedural scene if it fails.
loadDemoImage()
  .then((img) => store.setSource(img))
  .catch(() => store.setSource(demoImage()));

// Restore the stack: a shared URL (#s=...) wins, then the last session, then a default.
const shared = loadFromHash();
const saved = shared ?? loadLocal();
if (saved && saved.length) {
  store.setStack(saved);
  // once a shared stack is applied, drop the hash so later edits (saved locally) win on reload
  if (shared) history.replaceState(null, "", window.location.pathname + window.location.search);
} else {
  store.addFilter("tone");
  store.addFilter("error-diffusion");
}

// Autosave the working stack (debounced) so it survives reloads.
let saveTimer = 0;
store.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveLocal(store.serialize()), 400);
});
store.subscribeRender(() => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveLocal(store.serialize()), 400);
});
