import { useQuery } from "@tanstack/react-query";

import { playApi, type PlayLink } from "../api/play";

/**
 * usePlayIdentity — what a player link's key resolves to (SEC-002).
 *
 * The URL holds the link secret (`play_token`), which opens the sheet but is
 * not the character's id. Pages that compare against ids in payloads (my
 * token on the table, my seat in a duel, "everyone but me" in the party) use
 * `pc_id` from here; requests keep using the key.
 */
export function usePlayIdentity(key: string | undefined | null): PlayLink | undefined {
  const { data } = useQuery({
    queryKey: ["play-link", key],
    queryFn: () => playApi.link(key as string),
    enabled: !!key,
    staleTime: Infinity,
    retry: false,
  });
  return data;
}
