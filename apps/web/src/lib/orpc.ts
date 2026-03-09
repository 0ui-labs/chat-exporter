import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { rpc } from "./rpc";

export const orpc = createTanstackQueryUtils(rpc);
