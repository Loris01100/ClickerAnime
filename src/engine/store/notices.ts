import { createSignal } from "solid-js";

/** How long one HUD notice stays up, and how many can stack before the oldest is dropped. */
const NOTICE_MS = 4_000;
const MAX_NOTICES = 4;

/** One "you just gained something" event, popped up by the HUD and pruned by the main tick. */
export interface Notice {
  id: number;
  kind: "item" | "recruit" | "arc" | "unlock";
  text: string;
  count: number;
  expiresAt: number;
}

/**
 * The transient feed of "you just gained something" events — the HUD pops them up (see
 * `ui/Notices.tsx`) because a drop, a recruit or a cleared arc otherwise happen in complete silence.
 *
 * Pruned by the main tick rather than by a timer per notice, so no stray timeout outlives the
 * store: `prune(nowMs)` is what the tick calls, and it rebuilds the list only when something has
 * actually expired, so an idle tick stays a no-op.
 *
 * The one slice with no dependencies at all, not even the clock: every caller already knows what
 * time it is when it announces something.
 */
export function createNoticeQueue() {
  const [notices, setNotices] = createSignal<Notice[]>([]);
  let noticeId = 0;

  function pushNotice(kind: Notice["kind"], text: string) {
    setNotices((list) => {
      const expiresAt = Date.now() + NOTICE_MS;
      const duplicate = list.find((notice) => notice.kind === kind && notice.text === text);
      if (duplicate) {
        return list.map((notice) =>
          notice.id === duplicate.id ? { ...notice, count: notice.count + 1, expiresAt } : notice
        );
      }
      return [...list, { id: noticeId++, kind, text, count: 1, expiresAt }].slice(-MAX_NOTICES);
    });
  }

  return {
    notices,
    pushNotice,
    /** Presentation unlocks share the same bounded, dismissible HUD queue as gameplay events. */
    announceUnlock: (text: string) => pushNotice("unlock", text),
    dismissNotice: (id: number) => setNotices((list) => list.filter((n) => n.id !== id)),
    /** Called once a tick. Only rebuilds the list when something actually expired. */
    prune(nowMs: number) {
      if (notices().some((n) => n.expiresAt <= nowMs)) {
        setNotices((list) => list.filter((n) => n.expiresAt > nowMs));
      }
    },
    /** Shifts every deadline by the length of a pause, so a pause costs a notice no time. */
    shiftBy(offsetMs: number) {
      setNotices((list) => list.map((n) => ({ ...n, expiresAt: n.expiresAt + offsetMs })));
    },
  };
}
