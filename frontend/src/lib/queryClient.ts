import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Keep cached data for 10 min so returning to the app never clears the cache
      // and forces a skeleton/loading state.
      gcTime: 10 * 60 * 1000,
      // Disable React Query's focus-based refetch; we drive visibility ourselves below.
      refetchOnWindowFocus: false,
    },
  },
})

// When the user returns to the tab/app, silently refetch any stale active queries
// without clearing cached data first — so no loading states or skeleton screens appear.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      queryClient.refetchQueries({ type: 'active', stale: true })
    }
  })
}
