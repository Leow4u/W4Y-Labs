/**
 * I2 — move an active conversation between local and cloud brains without losing thread.
 * Creates a fresh session on the target brain with a handoff summary (cache-safe: no mid-session mutation).
 */
import { getSessionMessages } from '@/hermes'
import { getCloudSessionMessages, isCloudBrainSession, type SessionBrain } from '@/lib/cloud-sessions'
import type { RunTarget } from '@/lib/w4y-cloud-projects'
import type { SessionInfo, SessionMessage } from '@/types/hermes'

const MAX_HANDOFF_CHARS = 12_000

function messageText(msg: SessionMessage): string {
  const content = msg.content
  if (typeof content === 'string') {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part === 'object' && part && 'text' in part ? String(part.text ?? '') : ''))
      .join('\n')
      .trim()
  }
  return ''
}

function formatTranscript(messages: SessionMessage[]): string {
  const lines: string[] = []
  for (const msg of messages) {
    const text = messageText(msg)
    if (!text) {
      continue
    }
    const role = msg.role === 'assistant' ? 'Assistant' : msg.role === 'user' ? 'You' : msg.role
    lines.push(`${role}: ${text}`)
  }
  return lines.join('\n\n')
}

export function buildBrainHandoffPrompt(
  messages: SessionMessage[],
  opts: { title?: string | null; from: RunTarget; to: RunTarget } = { from: 'local', to: 'cloud' }
): string {
  const transcript = formatTranscript(messages)
  const clipped =
    transcript.length > MAX_HANDOFF_CHARS
      ? `${transcript.slice(0, MAX_HANDOFF_CHARS)}\n\n[… transcript truncated for handoff …]`
      : transcript

  const titleLine = opts.title?.trim() ? `Session: ${opts.title.trim()}\n` : ''
  const fromLabel = opts.from === 'cloud' ? 'cloud (24/7)' : 'this machine'
  const toLabel = opts.to === 'cloud' ? 'cloud (24/7)' : 'this machine'

  return (
    `[Brain handoff — continue on ${toLabel}]\n` +
    `${titleLine}` +
    `This conversation was moved from ${fromLabel}. Pick up where we left off; do not restart from scratch.\n\n` +
    `--- Transcript ---\n${clipped || '(no prior messages)'}\n--- End transcript ---`
  )
}

export async function fetchSessionMessagesForBrain(
  storedSessionId: string,
  session: Pick<SessionInfo, '_w4y_brain' | 'profile'>
): Promise<SessionMessage[]> {
  if (isCloudBrainSession(session)) {
    const res = await getCloudSessionMessages(storedSessionId)
    return res?.messages ?? []
  }

  const res = await getSessionMessages(storedSessionId, session.profile)
  return res.messages ?? []
}

export function sourceBrainForSession(session: Pick<SessionInfo, '_w4y_brain'> | null | undefined): SessionBrain {
  return isCloudBrainSession(session) ? 'cloud' : 'local'
}

export function oppositeBrain(brain: SessionBrain): RunTarget {
  return brain === 'cloud' ? 'local' : 'cloud'
}
