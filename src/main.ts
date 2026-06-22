import "./style.css";
import { mountApp } from "./ui/app";
import { store } from "./state/store";

const root = document.getElementById("app")!;
mountApp(root);

// Seed a sane default stack so the workbench shows something the moment an image loads.
store.addFilter("tone");
store.addFilter("error-diffusion");
