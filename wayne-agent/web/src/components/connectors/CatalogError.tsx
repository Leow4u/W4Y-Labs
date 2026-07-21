/**
 * The connector catalog failed to load — said out loud, with a way out.
 *
 * Extracted from ConnectorsPage because the Integrations hub needs exactly the
 * same thing and had nothing: it branched on `loading` only, so a failed
 * catalog fell through to the empty-state copy and told the user "no
 * connectors" when the truth was "we could not read the catalog". The toast
 * that carried the real reason was gone in seconds.
 *
 * A failure is not an emptiness. This stays on screen until the retry works.
 */
export function CatalogError({ message, onRetry, retryLabel }: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-border px-4 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/40"
      >
        {retryLabel}
      </button>
    </div>
  );
}
