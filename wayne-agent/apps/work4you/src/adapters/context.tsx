import { createContext, useContext, type ReactNode } from 'react'

import { getProductRuntime } from './runtime'
import type { ProductRuntime } from './types'

const ProductRuntimeContext = createContext<ProductRuntime | null>(null)

export function ProductRuntimeProvider({
  children,
  runtime = getProductRuntime()
}: {
  children: ReactNode
  runtime?: ProductRuntime
}) {
  return (
    <ProductRuntimeContext.Provider value={runtime}>{children}</ProductRuntimeContext.Provider>
  )
}

export function useProductRuntime(): ProductRuntime {
  const ctx = useContext(ProductRuntimeContext)
  if (!ctx) {
    throw new Error('useProductRuntime must be used within ProductRuntimeProvider')
  }
  return ctx
}
