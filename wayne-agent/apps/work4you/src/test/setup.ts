// Shared jsdom polyfills for renderer unit tests.
// Hermes UI uses `CSS.escape` (timeline, cron). jsdom does not ship it.

if (typeof CSS === 'undefined') {
  ;(globalThis as { CSS: { escape: (value: string) => string } }).CSS = {
    escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`)
  }
} else if (typeof CSS.escape !== 'function') {
  CSS.escape = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`)
}
