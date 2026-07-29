import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import type * as React from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { ArchiveSkillConfirmDialog } from '@/app/learning/archive-skill-confirm-dialog'
import { CodeEditor } from '@/components/chat/code-editor'
import { PageLoader } from '@/components/page-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { editLearningNode, getLearningNode, getSkills } from '@/hermes'
import { useI18n } from '@/i18n'
import { compactNumber } from '@/lib/format'
import { queryClient, writeCache } from '@/lib/query-client'
import { normalize } from '@/lib/text'
import { notify, notifyError } from '@/store/notifications'
import type { SkillInfo } from '@/types/hermes'

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
import { PanelEmpty, PanelPill } from '../overlays/panel'
import { PageSearchShell } from '../page-search-shell'
import { asText, includesQuery, prettyName } from '../settings/helpers'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

import { ConnectorsTab } from './connectors-tab'
import { SkillsHub } from './hub'
import { $skillsSortDesc } from './store'

// Product face: Skills (learned + Hub) · Conectores · Browse Hub.
// Tools / MCP were Hermes admin surface — removed per PRODUTO.md Fórmula vs Conectores.
const SKILLS_MODES = ['skills', 'connectors', 'hub'] as const

const SKILLS_QUERY_KEY = ['skills-list'] as const

const setSkills = writeCache<SkillInfo[]>(SKILLS_QUERY_KEY)

const usageOf = (skill: SkillInfo): number => (typeof skill.usage === 'number' ? skill.usage : 0)

const categoryFor = (skill: SkillInfo): string => asText(skill.category) || 'general'

/** Product-facing skills: learned (agent) + installed from Hub. Bundled kit = formula. */
export function isProductSkill(skill: SkillInfo): boolean {
  return skill.provenance === 'agent' || skill.provenance === 'hub'
}

// Row subtitle: category, with provenance badged.
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
}

export function SkillsView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: SkillsViewProps) {
  const { t } = useI18n()
  const [mode, setMode] = useRouteEnumParam('tab', SKILLS_MODES, 'skills')

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

  const productSkills = useMemo(() => (skills ? skills.filter(isProductSkill) : []), [skills])

  const visibleSkills = useMemo(
    () => (skills ? filteredSkills(skills, query, skillsSortDesc) : []),
    [query, skills, skillsSortDesc]
  )

  const searchHints = useMemo(() => {
    if (mode !== 'skills' || productSkills.length === 0) {
      return undefined
    }

    const counts = new Map<string, number>()

    for (const skill of productSkills) {
      const key = categoryFor(skill)
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category]) => t.common.tryHint(category.toLowerCase()))
  }, [mode, productSkills, t])

  const activeSkill = useMemo(
    () => visibleSkills.find(s => s.name === selectedSkill) ?? visibleSkills[0] ?? null,
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
        <div className="flex h-full min-h-0 flex-1">
          <PanelEmpty
            description={t.skills.emptyNothingMatches(q)}
            icon="search"
            title={t.skills.emptyNoneFound(t.skills.tabSkills.toLowerCase())}
          />
        </div>
      )
    }

    return (
      <div className="flex h-full min-h-0 flex-1">
        <PanelEmpty
          action={
            <Button onClick={() => setMode('hub')} size="sm">
              {t.skills.tabHub}
            </Button>
          }
          description={t.skills.emptyProductSkillsDesc}
          icon="search"
          title={t.skills.emptyProductSkillsTitle}
        />
      </div>
    )
  }

  return (
    <PageSearchShell
      {...props}
      activeTab={mode}
      onSearchChange={setQuery}
      onTabChange={id => setMode(id as (typeof SKILLS_MODES)[number])}
      searchHidden={mode === 'connectors'}
      searchHints={searchHints}
      searchPlaceholder={mode === 'hub' ? t.skills.hub.searchPlaceholder : t.skills.searchSkills}
      searchValue={query}
      tabs={[
        { id: 'skills', label: t.skills.tabSkills, meta: skills ? productSkills.length : null },
        { id: 'connectors', label: t.skills.tabConnectors },
        { id: 'hub', label: t.skills.tabHub }
      ]}
    >
      {mode === 'hub' ? (
        <SkillsHub query={query} />
      ) : mode === 'connectors' ? (
        <ConnectorsTab />
      ) : skillsFailed && !skills ? (
        <PanelEmpty
          action={
            <Button onClick={() => void refreshCapabilities()} size="sm">
              {t.skills.refresh}
            </Button>
          }
          description={skillsError instanceof Error ? skillsError.message : undefined}
          icon="error"
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
            {activeSkill && (
              <SkillDetail
                onArchive={() => setArchiveTarget(activeSkill.name)}
                onEdit={() => void openSkillEditor(activeSkill.name)}
                skill={activeSkill}
              />
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

  return (
    <>
      <DetailHeader
        description={asText(skill.description) || t.skills.noDescription}
        pills={
          <>
            <PanelPill>{prettyName(categoryFor(skill))}</PanelPill>
            {skill.provenance && skill.provenance !== 'bundled' && (
              <PanelPill tone={skill.provenance === 'agent' ? 'good' : 'muted'}>
                {t.skills.provenance[skill.provenance]}
              </PanelPill>
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
      {skill.provenance === 'hub' && (
        <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
          {t.skills.hubSkillManageHint}
        </p>
      )}
    </>
  )
}
