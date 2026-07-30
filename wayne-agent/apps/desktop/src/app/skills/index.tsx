import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import type * as React from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ArchiveSkillConfirmDialog } from '@/app/learning/archive-skill-confirm-dialog'
import { CodeEditor } from '@/components/chat/code-editor'
import { PageLoader } from '@/components/page-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { editLearningNode, getLearningNode, getSkills, type HermesGateway } from '@/hermes'
import { useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { compactNumber } from '@/lib/format'
import { queryClient, writeCache } from '@/lib/query-client'
import { normalize } from '@/lib/text'
import { notify, notifyError } from '@/store/notifications'
import { $activeProfile } from '@/store/profile'
import type { SkillInfo } from '@/types/hermes'
import { cn } from '@/lib/utils'

import { useOnProfileSwitch } from '../hooks/use-on-profile-switch'
import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import {
  CapRow,
  DetailColumn,
  DetailPane,
  ListColumn,
  ListStrip,
  ListStripButton,
  MasterDetail
} from '../master-detail'
import { PanelPill } from '../overlays/panel'
import { PageSearchShell } from '../page-search-shell'
import { asText, includesQuery, prettyName } from '../settings/helpers'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

import { ConnectorsTab } from './connectors-tab'
import { CustomizeEmpty, CustomizeEmptyAction } from './customize-empty'
import { McpTab } from './mcp-tab'
import { $skillsSortDesc } from './store'

const SKILLS_DOCS_URL = 'https://hermes-agent.nousresearch.com/docs/user-guide/features/skills'

// Personalizar (Cursor Customize): Skills · Conectores · MCPs + Browse Marketplace.
// Browse Hub stays off the product face (PRODUTO.md).
const SKILLS_MODES = ['skills', 'connectors', 'mcp'] as const

const SKILLS_QUERY_KEY = ['skills-list'] as const

const setSkills = writeCache<SkillInfo[]>(SKILLS_QUERY_KEY)

const usageOf = (skill: SkillInfo): number => (typeof skill.usage === 'number' ? skill.usage : 0)

const categoryFor = (skill: SkillInfo): string => asText(skill.category) || 'general'

/** Product-facing skills: learned, project files, legacy hub installs. Kit = formula. */
export function isProductSkill(skill: SkillInfo): boolean {
  return skill.provenance === 'agent' || skill.provenance === 'hub' || skill.provenance === 'project'
}

// Row subtitle: category + provenance — no summary / Edit / Archive in the list.
function skillSubtitle(skill: SkillInfo): React.ReactNode {
  const category = prettyName(categoryFor(skill))
  const provenance = skill.provenance

  return (
    <>
      <span className="truncate">{category}</span>
      {provenance === 'agent' && (
        <Badge className="shrink-0 normal-case" variant="default">
          learned
        </Badge>
      )}
      {provenance === 'project' && (
        <Badge className="shrink-0 normal-case" variant="muted">
          project
        </Badge>
      )}
      {provenance === 'hub' && (
        <Badge className="shrink-0 normal-case" variant="muted">
          hub
        </Badge>
      )}
    </>
  )
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
        // Marketplace is connectors catalog — keep tab coherent for deep-links.
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

  // Detail only after an explicit click — no auto-select of the first row.
  const activeSkill = useMemo(
    () => visibleSkills.find(s => s.name === selectedSkill) ?? null,
    [selectedSkill, visibleSkills]
  )

  const [skillEditor, setSkillEditor] = useState<null | { content: string; name: string }>(null)
  const [skillDraft, setSkillDraft] = useState('')
  const [skillSaving, setSkillSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<null | string>(null)
  const skillEditorEpoch = useRef(0)

  useOnProfileSwitch(() => {
    skillEditorEpoch.current += 1
    setSkillEditor(null)
    setSkillDraft('')
    setArchiveTarget(null)
    setSelectedSkill(null)
  })

  const openSkillEditor = async (name: string) => {
    const epoch = skillEditorEpoch.current

    try {
      const node = await getLearningNode(name)

      if (skillEditorEpoch.current !== epoch) {
        return
      }

      setSkillEditor({ content: node.content, name })
      setSkillDraft(node.content)
    } catch (err) {
      notifyError(err, name)
    }
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
          <CustomizeEmptyAction onClick={() => openExternalLink(SKILLS_DOCS_URL)}>
            {t.skills.documentation}
          </CustomizeEmptyAction>
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
        <MasterDetail pane={skillEditorPane} split="wide">
          <ListColumn
            header={
              <ListStrip
                left={
                  <ListStripButton onClick={() => $skillsSortDesc.set(!$skillsSortDesc.get())}>
                    {skillsSortDesc ? t.skills.sortMostUsedDesc : t.skills.sortLeastUsedAsc}
                  </ListStripButton>
                }
              />
            }
          >
            {visibleSkills.map(skill => (
              <CapRow
                active={activeSkill?.name === skill.name}
                key={skill.name}
                meta={usageOf(skill) > 0 ? `×${compactNumber(usageOf(skill))}` : undefined}
                onSelect={() => setSelectedSkill(skill.name)}
                subtitle={skillSubtitle(skill)}
                title={skill.name}
              />
            ))}
          </ListColumn>
          <DetailColumn footer={t.skills.changesApplyNewSessions}>
            {activeSkill ? (
              <SkillDetail
                onArchive={() => setArchiveTarget(activeSkill.name)}
                onEdit={() => void openSkillEditor(activeSkill.name)}
                skill={activeSkill}
              />
            ) : (
              <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                {t.skills.noDescription}
              </p>
            )}
          </DetailColumn>
        </MasterDetail>
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
    </PageSearchShell>
  )
}

function DetailHeader({
  description,
  pills,
  title
}: {
  description: React.ReactNode
  pills?: React.ReactNode
  title: string
}) {
  return (
    <header>
      <div className="flex min-h-6 flex-wrap items-center gap-2">
        <h3 className="min-w-0 truncate text-[0.9375rem] font-semibold tracking-tight">{title}</h3>
        {pills}
      </div>
      <p className="mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
        {description}
      </p>
    </header>
  )
}

function SkillDetail({ onArchive, onEdit, skill }: { onArchive: () => void; onEdit: () => void; skill: SkillInfo }) {
  const { t } = useI18n()
  const editable = skill.provenance === 'agent'
  const provenanceLabel =
    skill.provenance && skill.provenance in t.skills.provenance
      ? t.skills.provenance[skill.provenance as keyof typeof t.skills.provenance]
      : skill.provenance

  return (
    <>
      <DetailHeader
        description={asText(skill.description) || t.skills.noDescription}
        pills={
          <>
            <PanelPill>{prettyName(categoryFor(skill))}</PanelPill>
            {skill.provenance && skill.provenance !== 'bundled' && (
              <PanelPill tone={skill.provenance === 'agent' ? 'good' : 'muted'}>{provenanceLabel}</PanelPill>
            )}
          </>
        }
        title={skill.name}
      />
      {editable && (
        <div className="flex items-center gap-2">
          <Button onClick={onEdit} size="xs" variant="text">
            {t.skills.edit}
          </Button>
          <Button className="text-destructive hover:text-destructive" onClick={onArchive} size="xs" variant="text">
            {t.skills.archive}
          </Button>
        </div>
      )}
      {skill.provenance === 'project' && (
        <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
          {t.skills.projectSkillHint}
        </p>
      )}
      {skill.provenance === 'hub' && (
        <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
          {t.skills.hubSkillManageHint}
        </p>
      )}
    </>
  )
}
