/**
 * ChatErrorBoundary — if any render of the native chat throws (e.g. a history
 * with an unexpected payload), React would unmount the whole tree and NOTHING
 * would respond to clicks anymore (seen live during curation: "não é possível
 * clicar em Nova tarefa"). This boundary contains the damage: it shows an
 * error card with an action to reload the chat clean.
 */
import { Component, type ReactNode } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

import { useI18n } from "@/i18n";

class Boundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ChatErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <Boundary
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8">
          <TriangleAlert className="h-6 w-6 text-warning" />
          <p className="text-sm text-muted-foreground">{t.status.error}</p>
          <button
            type="button"
            onClick={() => window.location.assign("/chat")}
            className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform hover:scale-105"
          >
            <RotateCw className="h-4 w-4" />
            {t.common.retry}
          </button>
        </div>
      }
    >
      {children}
    </Boundary>
  );
}
