import { useQuery } from '@tanstack/react-query';

import { fetchDecorCatalog, worldKeys } from '../api/space-api';

/** Desk decoration catalog (E9-S3): it only changes with a deploy. */
export function useDecorCatalog() {
  return useQuery({
    queryKey: worldKeys.decor,
    queryFn: ({ signal }) => fetchDecorCatalog({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
