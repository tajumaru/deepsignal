import { MutationCache, QueryClient } from "@tanstack/react-query";

let mutationErrorHandler: ((error: unknown, variables: unknown) => void) | null = null;

export function setQueryClientMutationErrorHandler(handler: ((error: unknown, variables: unknown) => void) | null) {
  mutationErrorHandler = handler;
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError(error, variables) {
      mutationErrorHandler?.(error, variables);
    },
  }),
});
