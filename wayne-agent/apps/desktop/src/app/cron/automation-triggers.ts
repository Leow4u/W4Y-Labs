/** Multi-trigger helpers for Automations (schedule siblings + local link map). */

export type ScheduleTriggerRow = {
  /** Linked cron job id when this row is a sibling of the primary automation. */
  jobId?: string
  custom: boolean
  expr: string
  id: string
}

export type WebhookTriggerRow = {
  id: string
  url: string
}

const SIBLINGS_KEY = 'w4y.automation.scheduleSiblings'

type SiblingMap = Record<string, Array<{ expr: string; jobId: string }>>

function readSiblingMap(): SiblingMap {
  try {
    const raw = localStorage.getItem(SIBLINGS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    return parsed && typeof parsed === 'object' ? (parsed as SiblingMap) : {}
  } catch {
    return {}
  }
}

function writeSiblingMap(map: SiblingMap) {
  localStorage.setItem(SIBLINGS_KEY, JSON.stringify(map))
}

export function newTriggerId(): string {
  return `trg_${Math.random().toString(36).slice(2, 10)}`
}

export function getScheduleSiblings(primaryJobId: string): Array<{ expr: string; jobId: string }> {
  return readSiblingMap()[primaryJobId] ?? []
}

export function setScheduleSiblings(
  primaryJobId: string,
  siblings: Array<{ expr: string; jobId: string }>
) {
  const map = readSiblingMap()
  if (siblings.length === 0) {
    delete map[primaryJobId]
  } else {
    map[primaryJobId] = siblings
  }
  writeSiblingMap(map)
}

/** Job ids that are schedule siblings of another automation (hide from list). */
export function allSiblingJobIds(): Set<string> {
  const ids = new Set<string>()
  for (const rows of Object.values(readSiblingMap())) {
    for (const row of rows) {
      if (row.jobId) ids.add(row.jobId)
    }
  }
  return ids
}

export function clearScheduleSiblings(primaryJobId: string) {
  setScheduleSiblings(primaryJobId, [])
}
