import { createContext, useContext } from 'react'

import type { TurnLayoutMode } from '@/components/assistant-ui/thread/turn-contract'

export const TurnLayoutContext = createContext<TurnLayoutMode>('agent')

export function useTurnLayoutMode(): TurnLayoutMode {
  return useContext(TurnLayoutContext)
}
