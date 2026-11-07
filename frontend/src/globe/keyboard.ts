/** Keyboard control of the focused globe: arrow keys rotate, + and − zoom. */

import type { GlobeApp } from "./globe";

const ROTATE_STEP = 15;
const ZOOM_IN = 0.8;
const ZOOM_OUT = 1.25;

export function attachKeyboard(target: HTMLElement, app: GlobeApp): void {
  target.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowLeft":
        app.rotateBy(-ROTATE_STEP, 0);
        break;
      case "ArrowRight":
        app.rotateBy(ROTATE_STEP, 0);
        break;
      case "ArrowUp":
        app.rotateBy(0, ROTATE_STEP);
        break;
      case "ArrowDown":
        app.rotateBy(0, -ROTATE_STEP);
        break;
      case "+":
      case "=":
        app.zoomBy(ZOOM_IN);
        break;
      case "-":
      case "_":
        app.zoomBy(ZOOM_OUT);
        break;
      default:
        return;
    }
    event.preventDefault();
  });
}
