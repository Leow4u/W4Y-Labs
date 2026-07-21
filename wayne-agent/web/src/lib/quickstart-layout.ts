/**
 * Layout rules for the Agents "Quickstart" page that are easy to get wrong
 * again (AgentQuickstartPage.tsx).
 */

/**
 * Extra classes for the ready-made-templates panel, given whether the user
 * left it expanded.
 *
 * Collapsing is a DESKTOP-ONLY state. Both affordances that toggle the panel
 * are edge handles rendered `hidden lg:flex` — below `lg` there is no control
 * at all. So a collapsed panel must NOT be removed below `lg`: it would strand
 * the templates with no way to bring them back. It only disappears from `lg`
 * up, where the expand handle exists.
 *
 * Hence `lg:hidden` and never a bare `hidden`.
 */
export function templatesPanelVisibilityClass(open: boolean): string {
  return open ? "" : "lg:hidden";
}

/**
 * Is the templates panel reachable at a given viewport class?
 *
 * The panel is reachable when it is on screen, or when a handle that brings it
 * back is. This mirrors the rule above and is what the class strings must
 * satisfy at every combination.
 */
export function templatesPanelReachable(open: boolean, wide: boolean): boolean {
  const panelShown = open || !wide; // `lg:hidden` hides it only from `lg` up
  const handleShown = wide; // handles are `hidden lg:flex`
  return panelShown || handleShown;
}
