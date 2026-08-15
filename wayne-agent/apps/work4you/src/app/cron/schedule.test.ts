import { describe, expect, it } from 'vitest'

import type { Translations } from '@/i18n'

import { isJobActive } from './run-stats'
import {
  cronClockParts,
  estimateNextRunAt,
  prettyJobSchedule,
  rewriteCronClock,
  scheduleOptionForExpr,
  scheduleSummary,
  scheduleSupportsTimeSelect
} from './schedule'
import type { CronJob } from '@/types/hermes'

const cronCopy = {
  days: {
    '0': 'Sunday',
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday',
    '7': 'Sunday'
  },
  dayFallback: (value: string) => `day ${value}`,
  everyDayAt: (time: string) => `Every day at ${time}`,
  weekdaysAt: (time: string) => `Weekdays at ${time}`,
  everyDayOfWeekAt: (day: string, time: string) => `Every ${day} at ${time}`,
  monthlyOnDayAt: (dayOfMonth: string, time: string) => `Monthly on day ${dayOfMonth} at ${time}`,
  topOfHour: 'At the top of every hour',
  everyHourAt: (minute: string) => `Every hour at :${minute}`,
  scheduleHints: {
    daily: 'Every day at 9:00 AM',
    weekdays: 'Monday through Friday at 9:00 AM',
    weekly: 'Every Monday at 9:00 AM',
    monthly: 'The first day of each month at 9:00 AM',
    hourly: 'At the top of every hour',
    'every-15-minutes': 'Every 15 minutes',
    custom: 'Cron syntax or natural language'
  }
} as unknown as Translations['cron']

describe('schedule helpers', () => {
  it('maps known cron expressions to presets', () => {
    expect(scheduleOptionForExpr('0 * * * *').value).toBe('hourly')
    expect(scheduleOptionForExpr('0 9 * * *').value).toBe('daily')
    expect(scheduleOptionForExpr('0 9 * * 1').value).toBe('weekly')
    expect(scheduleOptionForExpr('15 10 * * 3').value).toBe('weekly')
    expect(scheduleOptionForExpr('*/7 * * * *').value).toBe('custom')
  })

  it('humanizes daily / hourly schedules', () => {
    const daily = scheduleOptionForExpr('0 9 * * *')
    expect(scheduleSummary(daily, '0 9 * * *', cronCopy)).toMatch(/Every day at/)

    const hourly = scheduleOptionForExpr('0 * * * *')
    expect(scheduleSummary(hourly, '0 * * * *', cronCopy)).toBe(cronCopy.topOfHour)
  })

  it('prettyJobSchedule prefers human text over raw cron', () => {
    const job = {
      enabled: true,
      id: 'j1',
      schedule: { expr: '0 9 * * *', kind: 'cron' }
    } as CronJob

    const label = prettyJobSchedule(job, cronCopy)
    expect(label).toMatch(/Every day at/)
    expect(label).not.toContain('0 9 * * *')
  })
})

describe('cron clock helpers', () => {
  it('supports time select for daily-like schedules', () => {
    expect(scheduleSupportsTimeSelect('0 9 * * *')).toBe(true)
    expect(scheduleSupportsTimeSelect('30 14 * * 1-5')).toBe(true)
    expect(scheduleSupportsTimeSelect('0 * * * *')).toBe(false)
  })

  it('rewrites hour and minute on a daily cron', () => {
    expect(cronClockParts('0 9 * * *')).toEqual({ hour: 9, minute: 0 })
    expect(rewriteCronClock('0 9 * * *', 15, 30)).toBe('30 15 * * *')
    expect(rewriteCronClock('15 10 * * 1-5', 8, 0)).toBe('0 8 * * 1-5')
  })

  it('estimates the next daily run after the given time', () => {
    const from = new Date(2026, 6, 27, 10, 0, 0) // Jul 27 2026 10:00
    const next = estimateNextRunAt('0 9 * * *', from)
    expect(next).not.toBeNull()
    expect(next!.getHours()).toBe(9)
    expect(next!.getMinutes()).toBe(0)
    expect(next!.getDate()).toBe(28)
  })
})

describe('isJobActive', () => {
  it('treats paused / disabled as inactive', () => {
    expect(isJobActive({ enabled: true, id: 'a', state: 'paused' } as CronJob)).toBe(false)
    expect(isJobActive({ enabled: false, id: 'b' } as CronJob)).toBe(false)
    expect(isJobActive({ enabled: true, id: 'c', state: 'scheduled' } as CronJob)).toBe(true)
  })
})
