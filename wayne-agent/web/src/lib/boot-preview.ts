/**
 * True while this page is the desktop shell's opening frame.
 *
 * The shell serves a copy of this very bundle the instant the window opens, so
 * the first thing the user sees is the product itself instead of a screen about
 * our machinery. In that moment there is deliberately no engine behind the page
 * — so a "could not connect" banner would be reporting a failure that is not
 * one. The flag is stamped by apps/desktop-shell/boot-preview.cjs and stops
 * existing the moment the window reloads from the real engine.
 */
export function isBootPreview(): boolean {
  if (typeof window === "undefined") return false;
  return (window as unknown as { __W4Y_BOOT_PREVIEW__?: unknown }).__W4Y_BOOT_PREVIEW__ === 1;
}
