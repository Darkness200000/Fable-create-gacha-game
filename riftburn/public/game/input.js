/**
 * Input: keyboard + mouse, gamepad and touch, folded into one command object
 * for the simulation. Keys are bound by PHYSICAL code (KeyW, not "w"), so the
 * layout works on AZERTY/Dvorak; every verb exists on every device.
 */

const DEAD = 0.24;

export function createInput(canvas, settings, hooks) {
  const keys = new Set();
  const I = {
    device: matchMedia("(pointer: coarse)").matches ? "touch" : "kbm",
    mouse: { x: innerWidth / 2, y: innerHeight / 2, down: false, seen: false },
    left: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
    right: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
    edges: { dash: false, od: false, pause: false },
    pad: { prev: [], nav: 0 },
    lastAim: null,
  };

  const BIND = {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    dash: ["Space", "ShiftLeft", "ShiftRight"],
    od: ["KeyQ", "KeyE"],
    pause: ["Escape", "KeyP"],
  };
  const held = (name) => BIND[name].some((c) => keys.has(c));

  addEventListener("keydown", (ev) => {
    if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) return;
    if (ev.repeat) {
      if (ev.code === "Space" || ev.code.startsWith("Arrow")) ev.preventDefault();
      return;
    }
    keys.add(ev.code);
    I.device = "kbm";
    if (BIND.dash.includes(ev.code)) I.edges.dash = true;
    if (BIND.od.includes(ev.code)) I.edges.od = true;
    if (BIND.pause.includes(ev.code)) I.edges.pause = true;
    if (ev.code === "Space" || ev.code.startsWith("Arrow")) ev.preventDefault();
    hooks.gesture();
  });
  addEventListener("keyup", (ev) => keys.delete(ev.code));
  addEventListener("blur", () => {
    keys.clear();
    I.mouse.down = false;
    I.left.id = I.right.id = null;
    hooks.blur();
  });

  // mouse
  canvas.addEventListener("mousemove", (ev) => {
    I.mouse.x = ev.clientX;
    I.mouse.y = ev.clientY;
    I.mouse.seen = true;
    I.device = "kbm";
  });
  canvas.addEventListener("mousedown", (ev) => {
    I.mouse.x = ev.clientX;
    I.mouse.y = ev.clientY;
    I.mouse.seen = true;
    I.device = "kbm";
    if (ev.button === 0) I.mouse.down = true;
    if (ev.button === 2) I.edges.od = true;
    hooks.gesture();
  });
  addEventListener("mouseup", (ev) => {
    if (ev.button === 0) I.mouse.down = false;
  });
  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

  // touch: left half of the screen moves, right half aims. Sticks float — they
  // appear wherever the thumb lands.
  const R = 58;
  function stickFor(x) {
    return x < innerWidth / 2 ? I.left : I.right;
  }
  canvas.addEventListener(
    "touchstart",
    (ev) => {
      ev.preventDefault();
      I.device = "touch";
      hooks.gesture();
      for (const t of ev.changedTouches) {
        const s = stickFor(t.clientX);
        if (s.id !== null) continue;
        s.id = t.identifier;
        s.ox = t.clientX;
        s.oy = t.clientY;
        s.x = s.y = 0;
      }
      hooks.sticks(I);
    },
    { passive: false },
  );
  canvas.addEventListener(
    "touchmove",
    (ev) => {
      ev.preventDefault();
      for (const t of ev.changedTouches) {
        const s = I.left.id === t.identifier ? I.left : I.right.id === t.identifier ? I.right : null;
        if (!s) continue;
        let dx = t.clientX - s.ox;
        let dy = t.clientY - s.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          // drag the origin along so the thumb never runs out of travel
          s.ox += (dx / d) * (d - R);
          s.oy += (dy / d) * (d - R);
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        s.x = dx / R;
        s.y = dy / R;
      }
      hooks.sticks(I);
    },
    { passive: false },
  );
  const end = (ev) => {
    for (const t of ev.changedTouches) {
      if (I.left.id === t.identifier) {
        I.left.id = null;
        I.left.x = I.left.y = 0;
      }
      if (I.right.id === t.identifier) {
        I.right.id = null;
        I.right.x = I.right.y = 0;
      }
    }
    hooks.sticks(I);
  };
  canvas.addEventListener("touchend", end);
  canvas.addEventListener("touchcancel", end);

  /** Read the first connected pad; fills edges and returns its sticks. */
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) {
      if (p && p.connected) {
        gp = p;
        break;
      }
    }
    if (!gp) return null;
    const b = (i) => Boolean(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
    const prev = I.pad.prev;
    const edge = (i) => b(i) && !prev[i];
    const out = {
      lx: gp.axes[0] || 0,
      ly: gp.axes[1] || 0,
      rx: gp.axes[2] || 0,
      ry: gp.axes[3] || 0,
      fire: b(7),
      confirm: edge(0),
      back: edge(1),
      navX: 0,
      navY: 0,
    };
    if (edge(0) || edge(4) || edge(6)) I.edges.dash = true;
    if (edge(3) || edge(5)) I.edges.od = true;
    if (edge(9)) I.edges.pause = true;
    // d-pad / stick flicks for menus
    const nx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0) || (Math.abs(out.lx) > 0.6 ? Math.sign(out.lx) : 0);
    const ny = (b(13) ? 1 : 0) - (b(12) ? 1 : 0) || (Math.abs(out.ly) > 0.6 ? Math.sign(out.ly) : 0);
    const sig = nx * 3 + ny;
    if (sig !== I.pad.nav) {
      I.pad.nav = sig;
      out.navX = nx;
      out.navY = ny;
    }
    for (let i = 0; i < gp.buttons.length; i++) prev[i] = b(i);
    if (Math.hypot(out.lx, out.ly) > 0.5 || Math.hypot(out.rx, out.ry) > 0.5 || gp.buttons.some((x) => x.pressed)) {
      I.device = "pad";
      hooks.gesture();
    }
    return out;
  }

  /**
   * One frame of intent. `aimFrom(mouseX, mouseY)` converts the mouse position
   * to an angle from the player (the renderer knows the camera; input doesn't).
   */
  I.frame = function frame(aimFrom) {
    const pad = pollPad();
    let mx = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
    let my = (held("down") ? 1 : 0) - (held("up") ? 1 : 0);
    let aim = null;
    let fire = false;

    if (I.left.id !== null) {
      mx += I.left.x;
      my += I.left.y;
    }
    if (pad && Math.hypot(pad.lx, pad.ly) > DEAD) {
      mx += pad.lx;
      my += pad.ly;
    }

    if (I.right.id !== null && Math.hypot(I.right.x, I.right.y) > 0.22) {
      aim = Math.atan2(I.right.y, I.right.x);
      fire = true;
    } else if (pad && Math.hypot(pad.rx, pad.ry) > DEAD + 0.1) {
      aim = Math.atan2(pad.ry, pad.rx);
      fire = true;
    } else if (pad && pad.fire && I.device === "pad") {
      aim = I.lastAim;
      fire = true;
    } else if (I.device === "kbm" && I.mouse.seen && !(settings.autoAim && !I.mouse.down)) {
      aim = aimFrom(I.mouse.x, I.mouse.y);
      fire = I.mouse.down || settings.autoFire;
    }
    if (aim !== null) I.lastAim = aim;

    const e = I.edges;
    const out = {
      mx,
      my,
      aim,
      fire,
      autoAim: aim === null && settings.autoAim,
      dash: e.dash,
      od: e.od,
      pause: e.pause,
      pad,
    };
    e.dash = e.od = e.pause = false;
    return out;
  };

  I.press = function press(name) {
    I.edges[name] = true;
  };

  return I;
}
