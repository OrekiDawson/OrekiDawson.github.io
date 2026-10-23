import "./core/speed-config.js";
import "../modules/drag-drop-touch.js";
import "./shims.js";
import "./merge-globals.js";
import "./core/oreki-tools.js";
import { browserCheck, init } from "./game.js";
import { DEV } from "./env.js";

if (browserCheck()) init();