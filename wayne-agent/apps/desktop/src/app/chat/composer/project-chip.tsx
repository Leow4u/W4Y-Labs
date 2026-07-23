import { useStore } from '@nanostores/react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n'
import { Check, ChevronDown, FolderOpen, iconSize, Plus } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  $projectScope,
  $projectTree,
  $projects,
  ALL_PROJECTS,
  enterProject,
  exitProjectScope,
  openProjectCreate
} from '@/store/projects'

const CHIP =
  'flex h-7 max-w-[14rem] items-center gap-1 rounded-lg px-2 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

export function ProjectChip() {
  const { t } = useI18n()
  const scope = useStore($projectScope)
  const projects = useStore($projects)
  const tree = useStore($projectTree)

  const activeLabel = (() => {
    if (scope === ALL_PROJECTS) return t.composer.projectNone
    const fromList = projects.find(p => p.id === scope)
    if (fromList?.name) return fromList.name
    const fromTree = tree.find(node => node.id === scope)
    if (!fromTree) return t.composer.projectNone
    return fromTree.label || fromTree.path?.split(/[/\\]/).pop() || t.composer.projectNone
  })()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t.composer.projectChipAria}
        className={CHIP}
        title={t.composer.projectChipAria}
        type="button"
      >
        <FolderOpen className={iconSize.sm} />
        <span className="truncate">{activeLabel}</span>
        <ChevronDown className={cn(iconSize.sm, 'opacity-60')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" side="top" sideOffset={8}>
        <DropdownMenuItem
          onSelect={() => {
            exitProjectScope()
          }}
        >
          <span className="min-w-0 flex-1 truncate">{t.composer.projectNone}</span>
          {scope === ALL_PROJECTS && <Check className={cn(iconSize.sm, 'shrink-0')} />}
        </DropdownMenuItem>
        {projects.map(project => (
          <DropdownMenuItem
            key={project.id}
            onSelect={() => {
              enterProject(project.id)
            }}
          >
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {scope === project.id && <Check className={cn(iconSize.sm, 'shrink-0')} />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            openProjectCreate()
          }}
        >
          <Plus className={iconSize.sm} />
          <span>{t.composer.projectNew}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
