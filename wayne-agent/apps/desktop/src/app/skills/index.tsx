/**
 * Personalizar → Skills: Cursor-style list + bottom DetailPane editor.
 * Click / ⋯ Open = same path as the old Edit button (getLearningNode + CodeEditor).
 */
import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import type * as React from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ArchiveSkillConfirmDialog } from '@/app/learning/archive-skill-confirm-dialog'
import { CodeEditor } from '@/components/chat/code-editor'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { createSkill, editLearningNode, getLearningNode, getSkills, type HermesGateway } from '@/hermes'
import { useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { compactNumber } from '@/lib/format'
import { queryClient, writeCache } from '@/lib/query-client'
import { normalize } from '@/lib/text'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { $activeProfile } from '@/store/profile'
import type { SkillInfo } from '@/types/hermes'

import { useOnProfileSwitch } from '../hooks/use-on-profile-switch'
import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { DetailPane, ICON_BUTTON, ListStrip, ListStripButton } from '../master-detail'
import { PageSearchShell } from '../page-search-shell'
import { asText, includesQuery } from '../settings/helpers'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

import { ConnectorsTab } from './connectors-tab'
import { CustomizeEmpty, CustomizeEmptyAction } from './customize-empty'
import { McpTab } from './mcp-tab'
import { $skillsSortDesc } from './store'

const SKILLS_DOCS_URL = 'https://hermes-agent.nousresearch.com/docs/user-guide/features/skills'

const SKILLS_MODES = ['skills', 'connectors', 'mcp'] as const

const SKILLS_QUERY_KEY = ['skills-list'] as const

const setSkills = writeCache<SkillInfo[]>(SKILLS_QUERY_KEY)

const usageOf = (skill: SkillInfo): number => (typeof skill.usage === 'number' ? skill.usage : 0)

/** Product-facing skills: learned, project files, legacy hub installs. Kit = formula. */
export function isProductSkill(skill: SkillInfo): boolean {
  return skill.provenance === 'agent' || skill.provenance === 'hub' || skill.provenance === 'project'
}

const isEditableSkill = (skill: SkillInfo): boolean => skill.provenance === 'agent'

function skillCreateTemplate(name: string): string {
  return `---
name: ${name}
description: Describe when Agent should use this skill.
---

# ${name}

Numbered steps, exact commands, and pitfalls go here.
`
}

function slugSkillName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function filteredSkills(skills: SkillInfo[], query: string, desc: boolean): SkillInfo[] {
  const q = normalize(query)
  const sign = desc ? 1 : -1

  return skills
    .filter(isProductSkill)
    .filter(
      skill =>
        !q || includesQuery(skill.name, q) || includesQuery(skill.description, q) || includesQuery(skill.category, q)
    )
    .sort((a, b) => sign * (usageOf(b) - usageOf(a)) || asText(a.name).localeCompare(asText(b.name)))
}

interface SkillsViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
  gateway?: HermesGateway | null
}

export function SkillsView({
  setStatusbarItemGroup: _setStatusbarItemGroup,
  gateway = null,
  ...props
}: SkillsViewProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { hash, pathname, search } = useLocation()
  const [mode, setMode] = useRouteEnumParam('tab', SKILLS_MODES, 'skills')
  const activeProfile = useStore($activeProfile)

  const marketplace = useMemo(() => new URLSearchParams(search).get('view') === 'marketplace', [search])

  const setMarketplace = useCallback(
    (open: boolean) => {
      const params = new URLSearchParams(search)
      if (open) {
        params.set('view', 'marketplace')
        if (params.get('tab') !== 'connectors' && params.get('tab') !== 'mcp' && params.get('tab') !== 'skills') {
          params.delete('tab')
        }
      } else {
        params.delete('view')
        params.delete('catalog')
      }
      const qs = params.toString()
      navigate({ hash, pathname, search: qs ? `?${qs}` : '' }, { replace: true })
    },
    [hash, navigate, pathname, search]
  )

  const [query, setQuery] = useState('')

  const {
    data: skills,
    isError: skillsFailed,
    error: skillsError
  } = useQuery({
    queryKey: SKILLS_QUERY_KEY,
    queryFn: getSkills,
    staleTime: 0
  })

  const skillsSortDesc = useStore($skillsSortDesc)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)

  const refreshCapabilities = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SKILLS_QUERY_KEY })
  }, [])

  useRefreshHotkey(refreshCapabilities)

  const visibleSkills = useMemo(
    () => (skills ? filteredSkills(skills, query, skillsSortDesc) : []),
    [query, skills, skillsSortDesc]
  )

  const [skillEditor, setSkillEditor] = useState<null | { content: string; name: string }>(null)
  const [skillDraft, setSkillDraft] = useState('')
  const [skillSaving, setSkillSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<null | string>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const skillEditorEpoch = useRef(0)

  useOnProfileSwitch(() => {
    skillEditorEpoch.current += 1
    setSkillEditor(null)
    setSkillDraft('')
    setArchiveTarget(null)
    setSelectedSkill(null)
    setCreateOpen(false)
  })

  const openSkillEditor = async (name: string) => {
    const epoch = skillEditorEpoch.current

    try {
      const node = await getLearningNode(name)

      if (skillEditorEpoch.current !== epoch) {
        return
      }

      setSelectedSkill(name)
      setSkillEditor({ content: node.content, name })
      setSkillDraft(node.content)
    } catch (err) {
      notifyError(err, name)
    }
  }

  const openSkill = (skill: SkillInfo) => {
    if (!isEditableSkill(skill)) {
      notify({
        kind: 'info',
        title: t.skills.editLearnedOnlyTitle,
        message: t.skills.editLearnedOnlyDesc
      })
      return
    }
    void openSkillEditor(skill.name)
  }

  const saveSkillEdit = async () => {
    if (!skillEditor) {
      return
    }

    setSkillSaving(true)

    try {
      await editLearningNode(skillEditor.name, skillDraft)
      notify({ kind: 'success', title: t.skills.skillUpdated, message: t.skills.appliesToNewSessions(skillEditor.name) })
      setSkillEditor(null)
      void refreshCapabilities()
    } catch (err) {
      notifyError(err, skillEditor.name)
    } finally {
      setSkillSaving(false)
    }
  }

  const skillEditorPane = skillEditor && (
    <DetailPane
      actions={
        <Button disabled={skillSaving} onClick={() => void saveSkillEdit()} size="xs">
          {skillSaving ? t.common.saving : t.common.save}
        </Button>
      }
      id="skill-editor"
      onClose={() => setSkillEditor(null)}
      title={<span className="text-[0.68rem] font-normal text-muted-foreground/60">{skillEditor.name}/SKILL.md</span>}
    >
      <CodeEditor
        filePath="SKILL.md"
        initialValue={skillEditor.content}
        key={skillEditor.name}
        onCancel={() => setSkillEditor(null)}
        onChange={setSkillDraft}
        onSave={() => void saveSkillEdit()}
      />
    </DetailPane>
  )

  const skillsEmpty = () => {
    const q = query.trim()

    if (q) {
      return (
        <CustomizeEmpty
          description={t.skills.emptyNothingMatches(q)}
          title={t.skills.emptyNoneFound(t.skills.tabSkills.toLowerCase())}
        />
      )
    }

    return (
      <CustomizeEmpty
        actions={
          <>
            <CustomizeEmptyAction onClick={() => setCreateOpen(true)} variant="muted">
              {t.skills.addSkill}
            </CustomizeEmptyAction>
            <CustomizeEmptyAction onClick={() => openExternalLink(SKILLS_DOCS_URL)}>
              {t.skills.documentation}
            </CustomizeEmptyAction>
          </>
        }
        description={t.skills.emptyProductSkillsDesc}
        title={t.skills.emptyProductSkillsTitle}
      />
    )
  }

  const searchPlaceholder = marketplace
    ? t.skills.searchFor(t.skills.tabConnectors, activeProfile)
    : mode === 'connectors'
      ? t.skills.searchFor(t.skills.tabConnectors, activeProfile)
      : mode === 'mcp'
        ? t.skills.searchFor(t.skills.tabMcp, activeProfile)
        : t.skills.searchFor(t.skills.tabSkills, activeProfile)

  const onTabChange = (id: string) => {
    if (marketplace) setMarketplace(false)
    setMode(id as (typeof SKILLS_MODES)[number])
    setQuery('')
    setSelectedSkill(null)
  }

  return (
    <PageSearchShell
      {...props}
      activeTab={marketplace ? undefined : mode}
      onSearchChange={setQuery}
      onTabChange={onTabChange}
      searchPlaceholder={searchPlaceholder}
      searchTrailingAction={
        <button
          className={cn(
            'inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[0.8125rem] font-medium transition-opacity',
            marketplace
              ? 'border border-border bg-transparent text-foreground hover:bg-muted/60'
              : 'bg-foreground text-background hover:opacity-90'
          )}
          onClick={() => setMarketplace(!marketplace)}
          type="button"
        >
          {marketplace ? t.skills.manageConnected : t.skills.browseMarketplace}
        </button>
      }
      searchValue={query}
      tabLeading={
        marketplace ? undefined : (
          <span className="inline-flex h-8 max-w-[14rem] items-center gap-1.5 rounded-full bg-muted px-3 text-[0.8125rem] font-medium text-foreground">
            <Codicon className="shrink-0 text-muted-foreground" name="account" size="0.875rem" />
            <span className="truncate">{activeProfile}</span>
          </span>
        )
      }
      tabs={
        marketplace
          ? undefined
          : [
              { id: 'skills', label: t.skills.tabSkills },
              { id: 'connectors', label: t.skills.tabConnectors },
              { id: 'mcp', label: t.skills.tabMcp }
            ]
      }
      variant="customize"
    >
      {marketplace ? (
        <ConnectorsTab onOpenMarketplace={() => setMarketplace(true)} search={query} variant="marketplace" />
      ) : mode === 'connectors' ? (
        <ConnectorsTab onOpenMarketplace={() => setMarketplace(true)} search={query} variant="manage" />
      ) : mode === 'mcp' ? (
        <McpTab gateway={gateway} />
      ) : skillsFailed && !skills ? (
        <CustomizeEmpty
          actions={
            <CustomizeEmptyAction onClick={() => void refreshCapabilities()} variant="muted">
              {t.skills.refresh}
            </CustomizeEmptyAction>
          }
          description={skillsError instanceof Error ? skillsError.message : t.skills.skillsLoadFailed}
          title={t.skills.skillsLoadFailed}
        />
      ) : !skills ? (
        <PageLoader label={t.skills.loading} />
      ) : visibleSkills.length === 0 ? (
        skillsEmpty()
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            <ListStrip
              left={
                <>
                  <span className="text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    {t.skills.userSection(visibleSkills.length)}
                  </span>
                  <ListStripButton onClick={() => $skillsSortDesc.set(!$skillsSortDesc.get())}>
                    {skillsSortDesc ? t.skills.sortMostUsedDesc : t.skills.sortLeastUsedAsc}
                  </ListStripButton>
                </>
              }
              right={
                <Button onClick={() => setCreateOpen(true)} size="xs" variant="ghost">
                  {t.skills.addSkill}
                </Button>
              }
            />
            <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
              {visibleSkills.map(skill => (
                <SkillListRow
                  active={selectedSkill === skill.name || skillEditor?.name === skill.name}
                  key={skill.name}
                  meta={usageOf(skill) > 0 ? `×${compactNumber(usageOf(skill))}` : undefined}
                  onArchive={isEditableSkill(skill) ? () => setArchiveTarget(skill.name) : undefined}
                  onOpen={() => openSkill(skill)}
                  skill={skill}
                />
              ))}
            </div>
            <p className="shrink-0 pt-2 text-right text-[0.65rem] text-muted-foreground/50">
              {t.skills.changesApplyNewSessions}
            </p>
          </div>
          {skillEditorPane}
        </div>
      )}
      {archiveTarget && (
        <ArchiveSkillConfirmDialog
          onApply={() => {
            const name = archiveTarget
            const snapshot = skills

            setSkills(current => current?.filter(skill => skill.name !== name) ?? current)

            if (skillEditor?.name === name) {
              setSkillEditor(null)
            }

            if (selectedSkill === name) {
              setSelectedSkill(null)
            }

            return () => setSkills(snapshot)
          }}
          onClose={() => setArchiveTarget(null)}
          onFailure={(err, name) => notifyError(err, name)}
          open
          skillId={archiveTarget}
          skillName={archiveTarget}
        />
      )}
      <NewSkillDialog
        onClose={() => setCreateOpen(false)}
        onCreated={name => {
          setCreateOpen(false)
          void refreshCapabilities().then(() => void openSkillEditor(name))
        }}
        open={createOpen}
      />
    </PageSearchShell>
  )
}

function SkillListRow({
  active,
  meta,
  onArchive,
  onOpen,
  skill
}: {
  active: boolean
  meta?: string
  onArchive?: () => void
  onOpen: () => void
  skill: SkillInfo
}) {
  const { t } = useI18n()
  const description = asText(skill.description) || t.skills.noDescription

  return (
    <div
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors',
        active ? 'border-border/80 bg-muted/60' : 'bg-muted/35 hover:bg-muted/55'
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
        onClick={onOpen}
        type="button"
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-background/80 text-muted-foreground">
          <Codicon name="sparkle" size="0.875rem" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[0.875rem] font-semibold text-foreground">{skill.name}</span>
            {meta ? (
              <span className="shrink-0 text-[0.65rem] tabular-nums text-muted-foreground/70">{meta}</span>
            ) : null}
          </span>
          <span className="mt-0.5 line-clamp-2 text-[0.75rem] leading-snug text-muted-foreground">{description}</span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t.skills.rowMenu}
            className={cn(ICON_BUTTON, 'mt-0.5 shrink-0 opacity-70 group-hover:opacity-100')}
            size="icon"
            variant="ghost"
          >
            <Codicon name="ellipsis" size="0.875rem" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36" sideOffset={6}>
          <DropdownMenuItem onSelect={onOpen}>{t.skills.open}</DropdownMenuItem>
          {onArchive ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onArchive}
            >
              {t.skills.archive}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function NewSkillDialog({
  onClose,
  onCreated,
  open
}: {
  onClose: () => void
  onCreated: (name: string) => void
  open: boolean
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slug = slugSkillName(name)
  const invalid = name.trim().length > 0 && slug.length === 0

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!slug || saving) return

    setSaving(true)
    setError(null)
    try {
      await createSkill({ name: slug, content: skillCreateTemplate(slug) })
      notify({
        kind: 'success',
        title: t.skills.skillCreated,
        message: t.skills.appliesToNewSessions(slug)
      })
      setName('')
      onCreated(slug)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.skills.createFailed
      setError(message)
      notifyError(err, slug)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      onOpenChange={value => {
        if (!value && !saving) {
          setName('')
          setError(null)
          onClose()
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.skills.newSkillTitle}</DialogTitle>
          <DialogDescription>{t.skills.newSkillDesc}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={event => void submit(event)}>
          <div className="grid gap-1.5">
            <Input
              aria-invalid={invalid || Boolean(error)}
              autoFocus
              onChange={event => {
                setName(event.target.value)
                setError(null)
              }}
              placeholder={t.skills.newSkillPlaceholder}
              value={name}
            />
            <p className={cn('text-[0.66rem] leading-4', invalid || error ? 'text-destructive' : 'text-muted-foreground')}>
              {error ?? t.skills.newSkillHint}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button disabled={saving} onClick={onClose} type="button" variant="ghost">
              {t.common.cancel}
            </Button>
            <Button disabled={saving || !slug || invalid} type="submit">
              {saving ? t.common.saving : t.common.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
