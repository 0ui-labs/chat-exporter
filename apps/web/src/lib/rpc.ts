import type { contract } from "@chat-exporter/shared";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

const link = new RPCLink({
  url: () => `${window.location.origin}/rpc`,
});

export const rpc: ContractRouterClient<typeof contract> =
  createORPCClient(link);

export function promoteFormatRule(ruleId: string) {
  return rpc.rules.promote({ id: ruleId });
}

export function demoteFormatRule(ruleId: string, importId: string) {
  return rpc.rules.demote({ id: ruleId, importId });
}
