import { MutationCache, QueryClient } from "@tanstack/react-query";

let mutationErrorHandler: ((error: unknown, variables: unknown) => void) | null = null;
let mutationLifecycleHandler:
  | ((event: {
      data?: unknown;
      error?: unknown;
      mutationKey: readonly unknown[];
      stage: "mutate" | "success" | "error";
      variables: unknown;
    }) => void)
  | null = null;

export function setQueryClientMutationErrorHandler(handler: ((error: unknown, variables: unknown) => void) | null) {
  mutationErrorHandler = handler;
}

export function setQueryClientMutationLifecycleHandler(
  handler:
    | ((event: {
        data?: unknown;
        error?: unknown;
        mutationKey: readonly unknown[];
        stage: "mutate" | "success" | "error";
        variables: unknown;
      }) => void)
    | null,
) {
  mutationLifecycleHandler = handler;
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onMutate(variables, mutation) {
      mutationLifecycleHandler?.({
        mutationKey: mutation.options.mutationKey ?? [],
        stage: "mutate",
        variables,
      });
    },
    onSuccess(data, variables, _context, mutation) {
      mutationLifecycleHandler?.({
        data,
        mutationKey: mutation.options.mutationKey ?? [],
        stage: "success",
        variables,
      });
    },
    onError(error, variables, _context, mutation) {
      mutationErrorHandler?.(error, variables);
      mutationLifecycleHandler?.({
        error,
        mutationKey: mutation.options.mutationKey ?? [],
        stage: "error",
        variables,
      });
    },
  }),
});
