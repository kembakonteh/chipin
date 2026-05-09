import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if ((error as { response?: { status?: number } })?.response?.status === 401) return false
        return failureCount < 1
      },
      staleTime: 5 * 60 * 1000,   // 5 min — data stays fresh, no background noise
      gcTime: 15 * 60 * 1000,     // 15 min — cache outlives any realistic away-time
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
})
