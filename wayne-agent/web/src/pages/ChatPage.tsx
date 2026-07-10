/**
 * ChatPage — routes to the native chat (default, what end users see) or the
 * embedded terminal (?full=1, internal/support only). The swap happens HERE
 * rather than at the route-table level (see App.tsx's ConfigRoute for that
 * simpler pattern) because /chat is mounted persistently OUTSIDE <Routes>
 * and hidden via CSS so its WebSocket survives tab switches (App.tsx) —
 * routing the swap here inherits that persistence for free. Toggling
 * ?full=1 mid-conversation unmounts one view and mounts the other (its own
 * WS connection cycles), which is fine: it's a support escape hatch, not
 * something end users trigger, and the conversation itself is persisted
 * server-side (session_key), so nothing is lost — just the live connection
 * reconnects.
 */
import { isInternalView } from "@/lib/internal-view";

import { ChatErrorBoundary } from "@/components/chat/ChatErrorBoundary";
import ChatTerminalPage from "./ChatTerminalPage";
import NativeChatPage from "./NativeChatPage";

export default function ChatPage({ isActive = true }: { isActive?: boolean }) {
  return isInternalView() ? (
    <ChatTerminalPage isActive={isActive} />
  ) : (
    <ChatErrorBoundary>
      <NativeChatPage isActive={isActive} />
    </ChatErrorBoundary>
  );
}
