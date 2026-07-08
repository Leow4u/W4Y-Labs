/**
 * NativeChatPage — the chat surface end users see by default. Talks to the
 * SAME gateway protocol the embedded terminal (ChatTerminalPage) does, over
 * its own /api/ws connection (session.create/resume, prompt.submit,
 * approval/clarify/sudo/secret.respond) — no PTY, no /api/pty, no
 * /api/events channel mirror. See hooks/useChatSession.ts for the wire
 * protocol notes. Curadoria do Chat — fatia "núcleo essencial".
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ChatModelBar } from "@/components/ChatModelBar";
import { ChatSessionList } from "@/components/ChatSessionList";
import { Composer } from "@/components/chat/Composer";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { PendingPromptPanel } from "@/components/chat/PendingPromptPanel";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useChatSession } from "@/hooks/useChatSession";
import { useI18n } from "@/i18n";

export default function NativeChatPage({ isActive = true }: { isActive?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeId = searchParams.get("resume");
  const [freshNonce, setFreshNonce] = useState(0);
  const { setTitle } = usePageHeader();
  const { t } = useI18n();

  const {
    messages,
    connectionState,
    busy,
    pendingPrompt,
    title,
    error,
    sendMessage,
    respondApproval,
    respondClarify,
    respondSudo,
    respondSecret,
  } = useChatSession(resumeId, freshNonce);

  useEffect(() => {
    if (!isActive) {
      setTitle(null);
      return;
    }
    setTitle(title);
    return () => setTitle(null);
  }, [isActive, title, setTitle]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const startFreshChat = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("resume");
    setSearchParams(next, { replace: true });
    setFreshNonce((n) => n + 1);
  };

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-current/10 bg-background/40"
        >
          {messages.length === 0 && connectionState !== "open" ? (
            <div className="p-4 text-center text-xs text-text-tertiary">
              {t.chat.connecting}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-current/5">
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} />
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {pendingPrompt && (
          <PendingPromptPanel
            prompt={pendingPrompt}
            onRespondApproval={respondApproval}
            onRespondClarify={respondClarify}
            onRespondSudo={respondSudo}
            onRespondSecret={respondSecret}
          />
        )}

        <Composer disabled={busy || !!pendingPrompt} onSend={sendMessage} />
        <ChatModelBar light />
      </div>

      <div className="hidden min-h-0 w-64 shrink-0 flex-col overflow-hidden lg:flex">
        <ChatSessionList activeSessionId={resumeId} onNewChat={startFreshChat} />
      </div>
    </div>
  );
}
