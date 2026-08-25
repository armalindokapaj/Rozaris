import { useEffect, type RefObject } from "react";

/**
 * `onOutside` fires on `mousedown`/`touchstart` — i.e. BEFORE the `click`
 * that a toggle button reacts to. So whatever opened the panel must count
 * as "inside" too, or re-clicking it reads as an outside click, closes the
 * panel, and the `click` that follows immediately toggles it back open —
 * a panel that can never be dismissed by the control that opened it.
 *
 * Nearly every call site avoids that by passing a `ref` on a wrapper that
 * contains both the trigger and the panel (`MoreMenu.tsx`'s `rootRef` is
 * the clearest example). `alsoInside` is for the cases that genuinely
 * cannot — a shared popover primitive that renders only the panel and has
 * no wrapper of its own to hang a ref on (`DockPopover.tsx`) — and does
 * the same job by naming the trigger explicitly.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  active = true,
  alsoInside?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!active) return;
    function handler(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (!ref.current || ref.current.contains(target)) return;
      if (alsoInside?.current?.contains(target)) return;
      onOutside();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [ref, onOutside, active, alsoInside]);
}
