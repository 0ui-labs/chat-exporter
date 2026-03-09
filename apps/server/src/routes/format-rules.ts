import { formatRuleSchema } from "@chat-exporter/shared";
import { Hono } from "hono";

import { disableFormatRule } from "../lib/adjustment-repository.js";

export const formatRulesRoute = new Hono().post("/:id/disable", (c) => {
  const ruleId = c.req.param("id");

  try {
    const rule = disableFormatRule(ruleId);
    return c.json(formatRuleSchema.parse(rule));
  } catch (error) {
    return c.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Formatregel konnte nicht deaktiviert werden.",
      },
      400,
    );
  }
});
