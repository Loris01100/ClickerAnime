import { createEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js";

/** Whether the player asked the OS for less motion. Read per change, so toggling it applies live. */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * A number that rolls towards its source instead of jumping (`design.md` §4). Presentation only:
 * the store's value is untouched, this is just what the counter shows while it catches up. Each
 * change restarts the roll from the value currently on screen, so a stream of kills reads as one
 * continuous climb rather than a stutter. Under `prefers-reduced-motion` it simply follows.
 */
export function createAnimatedNumber(source: Accessor<number>, durationMs = 450): Accessor<number> {
  const [shown, setShown] = createSignal(source());
  let frame: number | undefined;
  const stop = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  onCleanup(stop);

  createEffect(() => {
    const target = source();
    stop();
    const from = untrack(shown);
    if (from === target || prefersReducedMotion() || typeof requestAnimationFrame === "undefined") {
      setShown(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setShown(t >= 1 ? target : from + (target - from) * eased);
      frame = t >= 1 ? undefined : requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  });

  return shown;
}
