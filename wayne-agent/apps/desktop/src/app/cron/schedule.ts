import type { CronJob } from '@/hermes'
import type { Translations } from '@/i18n'
import { asText } from '@/lib/text'

export const DEFAULT_DELIVER = 'local'

export const DELIVERY_VALUES: readonly string[] = ['local', 'telegram', 'discord', 'slack', 'email']

export interface ScheduleOption {
  expr?: string
  value: string
}

export const SCHEDULE_OPTIONS: ReadonlyArray<ScheduleOption> = [
  { expr: '0 9 * * *', value: 'daily' },
  { expr: '0 9 * * 1-5', value: 'weekdays' },
  { expr: '0 9 * * 1', value: 'weekly' },
  { expr: '0 9 1 * *', value: 'monthly' },
  { expr: '0 * * * *', value: 'hourly' },
  { expr: '*/15 * * * *', value: 'every-15-minutes' },
  { value: 'custom' }
]

/** Quick-add presets for the Cursor-like Scheduled submenu. */
export const SCHEDULED_TRIGGER_PRESETS: ReadonlyArray<{ expr: string; value: string }> = [
  { expr: '0 * * * *', value: 'hourly' },
  { expr: '0 9 * * *', value: 'daily' },
  { expr: '0 9 * * 1', value: 'weekly' }
]

export function jobName(job: CronJob): string {
  return asText(job.name).trim()
}

export function jobPrompt(job: CronJob): string {
  return asText(job.prompt)
}

export function jobDeliver(job: CronJob): string {
  return asText(job.deliver) || DEFAULT_DELIVER
}

export function jobModel(job: CronJob): string {
  return asText(job.model).trim()
}

export function jobWorkdir(job: CronJob): string {
  return asText(job.workdir).trim()
}

export function jobSkills(job: CronJob): string[] {
  const rows = job.skills

  if (Array.isArray(rows)) {
    return rows.map(name => asText(name).trim()).filter(Boolean)
  }

  const legacy = asText(job.skill).trim()

  return legacy ? [legacy] : []
}

export function jobEnabledToolsets(job: CronJob): string[] {
  const rows = job.enabled_toolsets

  if (!Array.isArray(rows)) {
    return []
  }

  return rows.map(name => asText(name).trim()).filter(Boolean)
}

export function jobScheduleDisplay(job: CronJob): string {
  return asText(job.schedule_display) || asText(job.schedule?.display) || asText(job.schedule?.expr) || '—'
}

export function jobScheduleExpr(job: CronJob): string {
  const expr = asText(job.schedule?.expr).trim()

  if (expr) {
    return expr
  }

  const display = asText(job.schedule_display).trim()

  return cronParts(display) ? display : ''
}

export function looksLikeCronExpr(value: string): boolean {
  return cronParts(value) !== null
}

export function cronParts(expr: string): null | string[] {
  const parts = expr.trim().replace(/\s+/g, ' ').split(' ')

  return parts.length === 5 ? parts : null
}

function dayName(value: string, c: Translations['cron']): string {
  return c.days[value] ?? c.dayFallback(value)
}

function formatCronTime(minute: string, hour: string): string {
  const numericHour = Number(hour)
  const numericMinute = Number(minute)

  if (!Number.isInteger(numericHour) || !Number.isInteger(numericMinute)) {
    return `${hour}:${minute}`
  }

  return new Date(2000, 0, 1, numericHour, numericMinute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function isIntegerToken(value: string): boolean {
  return /^\d+$/.test(value)
}

export function scheduleOptionForExpr(expr: string): ScheduleOption {
  const normalized = expr.trim().replace(/\s+/g, ' ')
  const exactMatch = SCHEDULE_OPTIONS.find(option => option.expr === normalized)

  if (exactMatch) {
    return exactMatch
  }

  const parts = cronParts(normalized)

  if (!parts) {
    return SCHEDULE_OPTIONS[SCHEDULE_OPTIONS.length - 1]
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && isIntegerToken(minute) && isIntegerToken(hour)) {
    return SCHEDULE_OPTIONS.find(option => option.value === 'daily') ?? SCHEDULE_OPTIONS[0]
  }

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5' && isIntegerToken(minute) && isIntegerToken(hour)) {
    return SCHEDULE_OPTIONS.find(option => option.value === 'weekdays') ?? SCHEDULE_OPTIONS[0]
  }

  if (
    dayOfMonth === '*' &&
    month === '*' &&
    isIntegerToken(dayOfWeek) &&
    isIntegerToken(minute) &&
    isIntegerToken(hour)
  ) {
    return SCHEDULE_OPTIONS.find(option => option.value === 'weekly') ?? SCHEDULE_OPTIONS[0]
  }

  if (
    month === '*' &&
    dayOfWeek === '*' &&
    isIntegerToken(dayOfMonth) &&
    isIntegerToken(minute) &&
    isIntegerToken(hour)
  ) {
    return SCHEDULE_OPTIONS.find(option => option.value === 'monthly') ?? SCHEDULE_OPTIONS[0]
  }

  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && isIntegerToken(minute)) {
    return SCHEDULE_OPTIONS.find(option => option.value === 'hourly') ?? SCHEDULE_OPTIONS[0]
  }

  if (normalized === '*/15 * * * *') {
    return SCHEDULE_OPTIONS.find(option => option.value === 'every-15-minutes') ?? SCHEDULE_OPTIONS[0]
  }

  return SCHEDULE_OPTIONS[SCHEDULE_OPTIONS.length - 1]
}

export function scheduleSummary(option: ScheduleOption, expr: string, c: Translations['cron']): string {
  const parts = cronParts(expr)

  if (!parts) {
    return c.scheduleHints[option.value] ?? ''
  }

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts

  if (option.value === 'daily') {
    return c.everyDayAt(formatCronTime(minute, hour))
  }

  if (option.value === 'weekdays') {
    return c.weekdaysAt(formatCronTime(minute, hour))
  }

  if (option.value === 'weekly') {
    return c.everyDayOfWeekAt(dayName(dayOfWeek, c), formatCronTime(minute, hour))
  }

  if (option.value === 'monthly') {
    return c.monthlyOnDayAt(dayOfMonth, formatCronTime(minute, hour))
  }

  if (option.value === 'hourly') {
    return minute === '0' ? c.topOfHour : c.everyHourAt(minute.padStart(2, '0'))
  }

  return c.scheduleHints[option.value] ?? ''
}

/** Human-readable schedule for list rows — never raw cron. Empty when unknown. */
export function prettyJobSchedule(job: CronJob, c: Translations['cron']): string {
  const expr = jobScheduleExpr(job)

  if (expr) {
    const option = scheduleOptionForExpr(expr)

    if (option.value !== 'custom') {
      const summary = scheduleSummary(option, expr, c)

      if (summary) {
        return summary
      }
    }
  }

  const display = (asText(job.schedule_display) || asText(job.schedule?.display)).trim()

  if (display && !looksLikeCronExpr(display)) {
    return display
  }

  return ''
}

export function jobScheduleDetail(job: CronJob, c: Translations['cron']): string {
  return prettyJobSchedule(job, c) || jobScheduleDisplay(job)
}

export function formatTime(iso?: null | string): string {
  if (!iso) {
    return '—'
  }

  const date = new Date(iso)

  if (Number.isNaN(date.valueOf())) {
    return iso
  }

  return date.toLocaleString()
}

/** Schedules with a fixed wall-clock time that can be edited via HH:MM. */
export function scheduleSupportsTimeSelect(expr: string): boolean {
  const option = scheduleOptionForExpr(expr)
  return (
    option.value === 'daily' ||
    option.value === 'weekdays' ||
    option.value === 'weekly' ||
    option.value === 'monthly'
  )
}

export function cronClockParts(expr: string): null | { hour: number; minute: number } {
  const parts = cronParts(expr)

  if (!parts) {
    return null
  }

  const [minute, hour] = parts

  if (!isIntegerToken(minute) || !isIntegerToken(hour)) {
    return null
  }

  const h = Number(hour)
  const m = Number(minute)

  if (h < 0 || h > 23 || m < 0 || m > 59) {
    return null
  }

  return { hour: h, minute: m }
}

export function rewriteCronClock(expr: string, hour: number, minute: number): string {
  const parts = cronParts(expr)

  if (!parts) {
    return expr
  }

  const [, , dayOfMonth, month, dayOfWeek] = parts
  return `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`
}

/** Human prefix before the time control, e.g. "Every day at". */
export function scheduleAtPrefix(expr: string, c: Translations['cron']): string {
  const option = scheduleOptionForExpr(expr)
  const parts = cronParts(expr)

  if (option.value === 'daily') {
    return c.everyDayAtPrefix
  }

  if (option.value === 'weekdays') {
    return c.weekdaysAtPrefix
  }

  if (option.value === 'weekly' && parts) {
    return c.everyDayOfWeekAtPrefix(dayName(parts[4], c))
  }

  if (option.value === 'monthly' && parts) {
    return c.monthlyOnDayAtPrefix(parts[2])
  }

  return scheduleSummary(option, expr, c) || c.scheduledTrigger
}

export function formatClockLabel(hour: number, minute: number): string {
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function formatClockValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function parseClockValue(value: string): null | { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())

  if (!match) {
    return null
  }

  const hour = Number(match[1])
  const minute = Number(match[2])

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return { hour, minute }
}

/** Build HH:MM options in 15-minute steps (plus the current cron time if off-grid). */
export function clockSelectOptions(current?: null | { hour: number; minute: number }): Array<{
  label: string
  value: string
}> {
  const seen = new Set<string>()
  const out: Array<{ label: string; value: string }> = []

  const push = (hour: number, minute: number) => {
    const value = formatClockValue(hour, minute)

    if (seen.has(value)) {
      return
    }

    seen.add(value)
    out.push({ label: formatClockLabel(hour, minute), value })
  }

  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      push(hour, minute)
    }
  }

  if (current) {
    push(current.hour, current.minute)
    out.sort((a, b) => a.value.localeCompare(b.value))
  }

  return out
}

export function localTimezoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

/** Next fire estimate for common cron shapes when `next_run_at` is unavailable. */
export function estimateNextRunAt(expr: string, from: Date = new Date()): null | Date {
  const parts = cronParts(expr)

  if (!parts) {
    return null
  }

  const [minuteTok, hourTok, dayOfMonth, , dayOfWeek] = parts
  const option = scheduleOptionForExpr(expr)

  if (
    (option.value === 'daily' ||
      option.value === 'weekdays' ||
      option.value === 'weekly' ||
      option.value === 'monthly') &&
    isIntegerToken(minuteTok) &&
    isIntegerToken(hourTok)
  ) {
    const hour = Number(hourTok)
    const minute = Number(minuteTok)
    const candidate = new Date(from)
    candidate.setSeconds(0, 0)
    candidate.setHours(hour, minute, 0, 0)

    const advanceDay = () => {
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(hour, minute, 0, 0)
    }

    for (let i = 0; i < 62; i += 1) {
      if (candidate.getTime() <= from.getTime()) {
        advanceDay()
        continue
      }

      if (option.value === 'weekdays') {
        const dow = candidate.getDay()
        if (dow === 0 || dow === 6) {
          advanceDay()
          continue
        }
      }

      if (option.value === 'weekly' && isIntegerToken(dayOfWeek)) {
        const want = Number(dayOfWeek) % 7
        if (candidate.getDay() !== want) {
          advanceDay()
          continue
        }
      }

      if (option.value === 'monthly' && isIntegerToken(dayOfMonth)) {
        if (candidate.getDate() !== Number(dayOfMonth)) {
          advanceDay()
          continue
        }
      }

      return candidate
    }
  }

  if (option.value === 'hourly' && isIntegerToken(minuteTok)) {
    const minute = Number(minuteTok)
    const candidate = new Date(from)
    candidate.setSeconds(0, 0)
    candidate.setMinutes(minute, 0, 0)

    if (candidate.getTime() <= from.getTime()) {
      candidate.setHours(candidate.getHours() + 1)
    }

    return candidate
  }

  return null
}

export function formatNextRunLabel(
  job: CronJob | null,
  expr: string,
  c: Translations['cron']
): string | undefined {
  if (job?.next_run_at) {
    return c.nextRunAt(formatTime(job.next_run_at))
  }

  const estimated = estimateNextRunAt(expr)

  if (!estimated) {
    return undefined
  }

  return c.nextRunAt(estimated.toLocaleString())
}

export function parseJobTimestamp(value?: null | number | string): null | number {
  if (value == null || value === '') {
    return null
  }

  if (typeof value === 'number') {
    return value > 1e12 ? value : value * 1000
  }

  const ms = Date.parse(value)

  return Number.isNaN(ms) ? null : ms
}
