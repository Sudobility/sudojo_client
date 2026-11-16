/**
 * Hook for Sudojo health check endpoint
 */

import { useCallback, useMemo } from "react";
import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import type {
  BaseResponse,
  HealthCheckData,
  NetworkClient,
} from "@sudobility/types";
import { queryKeys } from "./query-keys";
import { STALE_TIMES } from "./query-config";
import { SudojoClient } from "../network/sudojo-client";

/**
 * Hook to check the Sudojo API server health status.
 *
 * Returns server name, version, and status. Useful for displaying connection
 * indicators or diagnosing connectivity issues. This is a public endpoint
 * that does not require authentication.
 *
 * Stale time: {@link STALE_TIMES.HEALTH_STATUS} (1 minute).
 *
 * @param networkClient - Network client for making HTTP requests
 * @param baseUrl - Base URL of the Sudojo API (e.g., "https://api.sudojo.com")
 * @param options - Additional TanStack Query options (excluding queryKey and queryFn)
 * @returns A UseQueryResult containing the health check data with loading/error states
 *
 * @example
 * ```tsx
 * const { data, isLoading, isError } = useSudojoHealth(networkClient, baseUrl);
 * if (isError) return <Text>Server unreachable</Text>;
 * if (data?.data?.status === "ok") return <Text>Connected</Text>;
 * ```
 */
export const useSudojoHealth = (
  networkClient: NetworkClient,
  baseUrl: string,
  options?: Omit<
    UseQueryOptions<BaseResponse<HealthCheckData>>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<BaseResponse<HealthCheckData>> => {
  const client = useMemo(
    () => new SudojoClient(networkClient, baseUrl),
    [networkClient, baseUrl],
  );

  const queryFn = useCallback(async (): Promise<
    BaseResponse<HealthCheckData>
  > => {
    return client.getHealth();
  }, [client]);

  return useQuery({
    queryKey: queryKeys.sudojo.health(),
    queryFn,
    staleTime: STALE_TIMES.HEALTH_STATUS,
    ...options,
  });
};
