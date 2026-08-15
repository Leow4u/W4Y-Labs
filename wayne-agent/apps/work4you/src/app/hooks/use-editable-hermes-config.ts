import { useEffect, useRef, useState } from 'react'

import { saveHermesConfig } from '@/hermes'
import { triggerHaptic } from '@/lib/haptics'
import { notifyError } from '@/store/notifications'
import type { ConfigFieldSchema, HermesConfigRecord } from '@/types/hermes'

import { peekHermesConfig, setHermesConfigCache, useHermesConfigRecord } from './use-config-record'
import { peekHermesConfigSchemaFields, useHermesConfigSchema } from './use-config-schema'
import { useOnProfileSwitch } from './use-on-profile-switch'

interface UseEditableHermesConfigOptions {
  autosaveFailedMessage: string
  onConfigSaved?: () => void
  /** Fired once when the local draft is first available (cache peek or fetch). */
  onSeed?: (config: HermesConfigRecord) => void
  /** Fired after a successful debounced autosave. */
  onAfterSave?: (config: HermesConfigRecord) => void
  /** Default true — selection haptic on each draft update. */
  hapticOnUpdate?: boolean
}

/**
 * Shared draft + debounced autosave for settings pages that edit the Hermes
 * config record. Seeds synchronously from the React Query cache when warm so
 * the first paint skips LoadingState.
 */
export function useEditableHermesConfig({
  autosaveFailedMessage,
  onConfigSaved,
  onSeed,
  onAfterSave,
  hapticOnUpdate = true
}: UseEditableHermesConfigOptions) {
  const { data: loadedConfig, isError: configLoadFailed, refetch: refetchConfig } = useHermesConfigRecord()
  const {
    data: schemaResponse,
    isError: schemaFailed,
    refetch: refetchSchema
  } = useHermesConfigSchema()

  const [config, setConfig] = useState<HermesConfigRecord | null>(() => peekHermesConfig())
  // Schema from the live query, falling back to a warm cache peek so a fresh
  // mount after prefetch never flashes LoadingState for one empty frame.
  const schema: Record<string, ConfigFieldSchema> | null =
    schemaResponse?.fields ?? peekHermesConfigSchemaFields()

  const saveVersionRef = useRef(0)
  const [saveVersion, setSaveVersion] = useState(0)
  // Until the user edits, keep mirroring the shared cache (peek → fetch).
  const dirtyRef = useRef(false)
  const seedNotified = useRef(false)
  const onSeedRef = useRef(onSeed)
  const onAfterSaveRef = useRef(onAfterSave)
  onSeedRef.current = onSeed
  onAfterSaveRef.current = onAfterSave

  useEffect(() => {
    if (!loadedConfig || dirtyRef.current) {
      return
    }
    setConfig(loadedConfig)
  }, [loadedConfig])

  useEffect(() => {
    if (!config || seedNotified.current) {
      return
    }
    seedNotified.current = true
    try {
      onSeedRef.current?.(config)
    } catch {
      // Prefs sync must never blank the settings panel.
    }
  }, [config])

  // A profile switch invalidates (but doesn't clear) the shared config query, so
  // the local draft would otherwise keep profile A's data and autosave it into
  // B. Drop the draft (re-seeds from B's refetch) and zero saveVersion so the
  // pending debounced autosave is cancelled by its effect cleanup.
  useOnProfileSwitch(() => {
    dirtyRef.current = false
    seedNotified.current = false
    setConfig(peekHermesConfig())
    saveVersionRef.current = 0
    setSaveVersion(0)
  })

  useEffect(() => {
    if (!config || saveVersion === 0) {
      return
    }

    const version = saveVersion

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await saveHermesConfig(config)
          setHermesConfigCache(config)
          try {
            onAfterSaveRef.current?.(config)
          } catch {
            // ignore prefs sync failures after save
          }

          if (saveVersionRef.current === version) {
            onConfigSaved?.()
          }
        } catch (error) {
          if (saveVersionRef.current === version) {
            notifyError(error, autosaveFailedMessage)
          }
        }
      })()
    }, 550)

    return () => window.clearTimeout(timer)
  }, [autosaveFailedMessage, config, onConfigSaved, saveVersion])

  const updateConfig = (next: HermesConfigRecord) => {
    dirtyRef.current = true
    saveVersionRef.current += 1
    setConfig(next)
    setSaveVersion(saveVersionRef.current)
    if (hapticOnUpdate) {
      triggerHaptic('selection')
    }
  }

  return {
    config,
    schema,
    updateConfig,
    setConfig,
    configLoadFailed,
    schemaFailed,
    refetchConfig,
    refetchSchema,
    ready: Boolean(config && schema)
  }
}
