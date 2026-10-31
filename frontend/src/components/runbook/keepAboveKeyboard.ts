/**
 * Keep a focused text box above a phone's on-screen keyboard (Plan 128).
 *
 * Lena preps on the bus: when she taps a read-aloud box the keyboard covers the
 * bottom half of the screen. Call this from the field's onFocus. It watches the
 * visual viewport (which shrinks when the keyboard opens) and scrolls the field
 * back into the part of the screen that is still visible, until the field loses
 * focus. Desktop browsers have no keyboard to dodge; it does nothing there
 * unless the field is actually off screen.
 */
export function keepAboveKeyboard(el: HTMLElement): void {
  const vv = window.visualViewport;
  let timer: number | undefined;

  const check = () => {
    if (document.activeElement !== el) {
      stop();
      return;
    }
    const top = vv ? vv.offsetTop : 0;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const r = el.getBoundingClientRect();
    // The caret sits near the field's top on focus; keep that end on screen.
    const caretLine = Math.min(r.bottom, r.top + 72);
    if (r.top < top + 8 || caretLine > bottom - 12) {
      const tall = r.height > (bottom - top) * 0.6;
      el.scrollIntoView({ block: tall ? "start" : "center", behavior: "smooth" });
    }
  };
  const onResize = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, 60);
  };
  function stop() {
    vv?.removeEventListener("resize", onResize);
    window.clearTimeout(timer);
    el.removeEventListener("blur", stop);
  }

  vv?.addEventListener("resize", onResize);
  el.addEventListener("blur", stop);
  // The keyboard animates in over ~250 ms; look again once it has settled.
  timer = window.setTimeout(check, 320);
}
