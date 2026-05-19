"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            // Default OFF — components that genuinely need polling
            // (InboxBadge, RepliesBadge, StatusBoard) set their own interval
            // explicitly. The previous 30s global default was a latent footgun:
            // any new useQuery added without an override silently polled
            // every 30s, each call going through requireRole → DB.
            refetchInterval: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
