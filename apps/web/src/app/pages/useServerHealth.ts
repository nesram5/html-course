import { API_PATHS, HealthResponseSchema } from '@plaza/shared';
import { useQuery } from '@tanstack/react-query';

import { http } from '@/shared/api';

export function useServerHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => http(API_PATHS.health, HealthResponseSchema, { signal }),
    retry: false,
  });
}
