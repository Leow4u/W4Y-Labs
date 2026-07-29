import { cn } from '@/lib/utils'

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

// Work4You wordmark — used on update / about / install surfaces.
// Size via className (default size-14).
export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('inline-flex size-14 shrink-0 items-center justify-center overflow-hidden', className)}
      {...props}
    >
      <img alt="Work4You" className="size-full object-contain" src={assetPath('work4you-wordmark.png')} />
    </span>
  )
}
