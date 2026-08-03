import {
  SiApple,
  SiBilibili,
  SiDiscord,
  SiGmail,
  SiHomeassistant,
  SiMatrix,
  SiMattermost,
  SiQq,
  SiSignal,
  SiTelegram,
  SiWechat,
  SiWhatsapp
} from '@icons-pack/react-simple-icons'
import type { ComponentType, SVGProps } from 'react'
import { useState } from 'react'

import { Globe, Link as LinkIcon, MessageSquareText } from '@/lib/icons'
import { cn } from '@/lib/utils'

// Brand glyphs from simpleicons.org when available. Slack / Teams / Google Chat
// were removed from (or never in) Simple Icons for brand reasons — those use
// the same Composio logo CDN as the web Channels page.
type IconKind = 'brand' | 'generic'

interface PlatformIconSpec {
  Icon?: ComponentType<SVGProps<SVGSVGElement>>
  /** Remote brand mark (Composio CDN). Preferred over Icon/monogram when set. */
  logoUrl?: string
  color: string
  kind: IconKind
  monogram?: string
}

/** Slugs that resolve on https://logos.composio.dev/api/<slug> */
const COMPOSIO_LOGO: Record<string, string> = {
  slack: 'slack',
  whatsapp_cloud: 'whatsapp',
  google_chat: 'google_chat',
  teams: 'microsoft_teams'
}

const PLATFORM_ICONS: Record<string, PlatformIconSpec> = {
  telegram: { Icon: SiTelegram, color: '#26A5E4', kind: 'brand' },
  discord: { Icon: SiDiscord, color: '#5865F2', kind: 'brand' },
  slack: {
    logoUrl: `https://logos.composio.dev/api/${COMPOSIO_LOGO.slack}`,
    color: '#4A154B',
    kind: 'brand',
    monogram: 'S'
  },
  mattermost: { Icon: SiMattermost, color: '#0058CC', kind: 'brand' },
  matrix: { Icon: SiMatrix, color: '#000000', kind: 'brand' },
  signal: { Icon: SiSignal, color: '#3A76F0', kind: 'brand' },
  whatsapp: { Icon: SiWhatsapp, color: '#25D366', kind: 'brand' },
  whatsapp_cloud: {
    logoUrl: `https://logos.composio.dev/api/${COMPOSIO_LOGO.whatsapp_cloud}`,
    Icon: SiWhatsapp,
    color: '#25D366',
    kind: 'brand'
  },
  bluebubbles: { Icon: SiApple, color: '#0BD318', kind: 'brand' },
  homeassistant: { Icon: SiHomeassistant, color: '#18BCF2', kind: 'brand' },
  email: { Icon: SiGmail, color: '#EA4335', kind: 'brand' },
  sms: { Icon: MessageSquareText, color: '#F43F5E', kind: 'generic' },
  webhook: { Icon: LinkIcon, color: '#71717A', kind: 'generic' },
  api_server: { Icon: Globe, color: '#64748B', kind: 'generic' },
  weixin: { Icon: SiWechat, color: '#07C160', kind: 'brand' },
  qqbot: { Icon: SiQq, color: '#EB1923', kind: 'brand' },
  yuanbao: { Icon: SiBilibili, color: '#FB7299', kind: 'brand' },
  google_chat: {
    logoUrl: `https://logos.composio.dev/api/${COMPOSIO_LOGO.google_chat}`,
    color: '#34A853',
    kind: 'brand',
    monogram: 'G'
  },
  teams: {
    logoUrl: `https://logos.composio.dev/api/${COMPOSIO_LOGO.teams}`,
    color: '#6264A7',
    kind: 'brand',
    monogram: 'T'
  }
}

interface PlatformAvatarProps {
  platformId: string
  platformName: string
  className?: string
}

export function PlatformAvatar({ className, platformId, platformName }: PlatformAvatarProps) {
  const spec = PLATFORM_ICONS[platformId]
  const [logoFailed, setLogoFailed] = useState(false)

  const baseClass = cn(
    'inline-grid size-6 shrink-0 place-items-center rounded-md text-[length:var(--conversation-caption-font-size)] font-medium',
    className
  )

  if (!spec) {
    return (
      <span aria-hidden="true" className={cn(baseClass, 'bg-(--ui-bg-tertiary) text-(--ui-text-tertiary)')}>
        {platformName.charAt(0).toUpperCase()}
      </span>
    )
  }

  const { Icon, color, logoUrl } = spec

  if (logoUrl && !logoFailed) {
    return (
      <span aria-hidden="true" className={cn(baseClass, 'overflow-hidden bg-white')}>
        <img
          alt=""
          className="size-3.5 object-contain"
          loading="lazy"
          onError={() => setLogoFailed(true)}
          src={logoUrl}
        />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={baseClass}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        color
      }}
    >
      {Icon ? <Icon className="size-3.5" /> : spec.monogram || platformName.charAt(0).toUpperCase()}
    </span>
  )
}
