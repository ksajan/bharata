import React, { Suspense } from 'react'

/** The guide is a large static document — keep it out of the initial bundle. */
const LazyGuide = React.lazy(() => import('./RulesGuide').then((m) => ({ default: m.RulesGuide })))

export function RulesGuide(props: { onClose?: () => void }) {
  return (
    <Suspense fallback={null}>
      <LazyGuide onClose={props.onClose} />
    </Suspense>
  )
}
