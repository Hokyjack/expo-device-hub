import { MoreVertical } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconButton } from "./icon-button";

const PANEL =
  "gap-1 p-1 bg-panel-bg border border-white/8 rounded-[10px] backdrop-blur-[12px] [-webkit-backdrop-filter:blur(12px)]";

// @ref LLP 0000#mobile-serve-sim-layout — the mobile menu overlays the device; typing keeps a keyboard toggle visible.
export function PreviewToolbar({
  mobile,
  keyboard,
  keyboardRaised,
  viewportHeight,
  children,
}: {
  mobile: boolean;
  keyboard?: ReactNode;
  keyboardRaised: boolean;
  viewportHeight: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>("[aria-controls]")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(() => setOpen(false), [mobile]);

  if (!mobile)
    return (
      <div className={`flex flex-col ${PANEL}`}>
        {keyboard}
        {children}
      </div>
    );

  return (
    <div
      ref={ref}
      className="relative flex flex-col items-end"
      onMouseDownCapture={(event) => {
        // Keep the capture input focused when touch controls are used while typing.
        // Cancel mouse focus, rather than pointer events, so menu touch scrolling still works.
        if (keyboardRaised) event.preventDefault();
      }}
    >
      <div className={`flex ${PANEL}`}>
        {keyboardRaised && keyboard}
        <IconButton
          aria-label="Toggle preview controls"
          aria-expanded={open}
          aria-controls={menuId}
          title="Preview controls"
          onClick={() => setOpen((value) => !value)}
        >
          <MoreVertical size={18} strokeWidth={1.75} />
        </IconButton>
      </div>
      <div
        ref={actionsRef}
        id={menuId}
        data-panel="preview-controls"
        role="group"
        aria-label="Preview controls"
        className={`absolute top-full right-0 mt-2 flex flex-col overflow-y-auto ${PANEL}`}
        style={{
          display: open ? undefined : "none",
          maxHeight: `max(0px, calc(${viewportHeight}px - env(safe-area-inset-top, 0px) - 80px))`,
        }}
        onClick={() => {
          setOpen(false);
          // Keyboard toggling deliberately focuses the capture input outside this menu.
          if (actionsRef.current?.contains(document.activeElement)) {
            ref.current?.querySelector<HTMLButtonElement>("[aria-controls]")?.focus();
          }
        }}
      >
        {!keyboardRaised && keyboard}
        {children}
      </div>
    </div>
  );
}
