import { useQuery } from "@tanstack/react-query";

import { campaignsApi } from "../api/campaigns";
import { rulesetOf, type Ruleset } from "../lib/ruleset";
import { useCampaignStore } from "../stores/useCampaignStore";

/**
 * useCampaignRuleset — the rules a DM page's campaign plays by (Plan 131).
 *
 * Reads the campaign itself (`["campaign", id]`, the same cache the Characters page
 * uses): the active campaign in the store is persisted, so it can be stale or older
 * than the `ruleset` field. With no id, it uses the active campaign. While loading,
 * or with no campaign at all, the answer is the store's copy, then 2024.
 *
 * @param campaignId - The page's campaign, when it knows one (a session's, an adventure's).
 */
export function useCampaignRuleset(campaignId?: string | null): Ruleset {
  const active = useCampaignStore((s) => s.activeCampaign);
  const id = campaignId ?? active?.id ?? null;
  const { data } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => campaignsApi.get(id as string),
    enabled: !!id,
    staleTime: 60_000,
  });
  const cached = active && active.id === id ? active.ruleset : undefined;
  return rulesetOf(data?.ruleset ?? cached);
}
