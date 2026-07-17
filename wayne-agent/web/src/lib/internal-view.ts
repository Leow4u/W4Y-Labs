// Curadoria's internal escape hatch.
//
// When `?full=1` is in the URL, it reveals the TECHNICAL/ADMIN layer (the same
// gate already used by Config ConfigUser↔ConfigPage and by Skills
// featured↔library). The "split" screens use this to HIDE the plumbing from the
// end user and keep only the product core — without deleting anything: with
// ?full=1 (us/support) everything shows up again.
export function isInternalView(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("full") === "1";
  } catch {
    return false;
  }
}
