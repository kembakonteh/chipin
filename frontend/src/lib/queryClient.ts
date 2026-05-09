import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,   // 5 min — data stays fresh, no background noise
      gcTime: 15 * 60 * 1000,     // 15 min — cache outlives any realistic away-time
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
})
