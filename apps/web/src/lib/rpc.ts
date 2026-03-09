import type { contract } from "@chat-exporter/shared";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

const link = new RPCLink({
  url: "/rpc",
});

export const rpc: ContractRouterClient<typeof contract> =
  createORPCClient(link);
