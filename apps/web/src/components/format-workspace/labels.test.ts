// @vitest-environment node
import {
  adjustmentLabels,
  formatMarkdownLinesLabel,
  formatMessageBlockLabel,
  getBlockTypeLabel,
  getImportStageDescription,
  getImportStageEntry,
  getImportStageLabel,
  getJobStatusLabel,
  getRoleLabel,
  getRuleKindLabel,
  getRuleLabel,
  getViewLabel,
  miscLabels,
  rulesLabels,
} from "./labels";

// ---------------------------------------------------------------------------
// V-S4: Status & Stages
// ---------------------------------------------------------------------------

describe("getJobStatusLabel", () => {
  test("gibt korrekte Labels für alle Status-Werte", () => {
    expect(getJobStatusLabel("completed")).toBe("Bereit");
    expect(getJobStatusLabel("failed")).toBe("Fehlgeschlagen");
    expect(getJobStatusLabel("queued")).toBe("Warteschlange");
    expect(getJobStatusLabel("processing")).toBe("Import läuft");
  });

  test("gibt Fallback für unbekannten Status", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test edge case with invalid input
    const label = getJobStatusLabel("unknown" as any);
    expect(label).toBeDefined();
    expect(label).toBe("Import läuft");
  });
});

describe("getImportStageLabel", () => {
  const stages = [
    "queued",
    "validate",
    "fetch",
    "extract",
    "normalize",
    "structure",
    "render",
    "done",
  ] as const;

  test("gibt ein nicht-leeres Label für alle Stages", () => {
    for (const stage of stages) {
      const label = getImportStageLabel(stage);
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
    }
  });

  test("gibt spezifische Labels korrekt zurück", () => {
    expect(getImportStageLabel("queued")).toBe("Wartet auf Start");
    expect(getImportStageLabel("validate")).toBe("Link wird geprüft");
    expect(getImportStageLabel("done")).toBe("Bereit");
  });
});

describe("getImportStageDescription", () => {
  const stages = [
    "queued",
    "validate",
    "fetch",
    "extract",
    "normalize",
    "structure",
    "render",
    "done",
  ] as const;

  test("gibt eine nicht-leere Beschreibung für alle Stages", () => {
    for (const stage of stages) {
      const desc = getImportStageDescription(stage);
      expect(desc).toBeTruthy();
      expect(typeof desc).toBe("string");
    }
  });

  test("Label und Description sind verschiedene Strings", () => {
    for (const stage of stages) {
      const label = getImportStageLabel(stage);
      const desc = getImportStageDescription(stage);
      expect(label).not.toBe(desc);
    }
  });
});

describe("getImportStageEntry", () => {
  test("gibt ein Objekt mit label und detail zurück", () => {
    const entry = getImportStageEntry("validate");
    expect(entry).toHaveProperty("label");
    expect(entry).toHaveProperty("detail");
    expect(entry.label).toBe("Link wird geprüft");
  });

  test("gibt Fallback für unbekannte Stage", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test edge case with invalid input
    const entry = getImportStageEntry("nonexistent" as any);
    expect(entry.label).toBe("nonexistent");
    expect(entry.detail).toBe("");
  });
});

// ---------------------------------------------------------------------------
// S7: Simplified adjustment labels (adjustLabel / adjustDoneLabel)
// ---------------------------------------------------------------------------

describe("S7 — simplified adjustment labels", () => {
  test("adjustLabel is 'Anpassen' (view-independent)", () => {
    expect(adjustmentLabels.adjustLabel).toBe("Anpassen");
  });

  test("adjustDoneLabel is 'Fertig'", () => {
    expect(adjustmentLabels.adjustDoneLabel).toBe("Fertig");
  });

  test("getAdjustViewLabel and getEndAdjustLabel are removed as exports", async () => {
    // These functions should no longer exist on the module
    // biome-ignore lint/suspicious/noExplicitAny: verifying removed exports
    const labels = (await import("./labels")) as any;
    expect(labels.getAdjustViewLabel).toBeUndefined();
    expect(labels.getEndAdjustLabel).toBeUndefined();
  });

  test("endAdjustMode key no longer exists on adjustmentLabels", () => {
    expect("endAdjustMode" in adjustmentLabels).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S8: Guide text overhaul
// ---------------------------------------------------------------------------

describe("S8 — guide text overhaul", () => {
  test("guideInstruction is the new shorter text", () => {
    expect(adjustmentLabels.guideInstruction).toBe(
      "Klicke auf eine Stelle, beschreibe deine Änderung — sie wird direkt übernommen.",
    );
  });

  test("guideNote is empty string", () => {
    expect(adjustmentLabels.guideNote).toBe("");
  });
});

// ---------------------------------------------------------------------------
// S10: De-jargoned labels
// ---------------------------------------------------------------------------

describe("S10 — de-jargoned labels", () => {
  test("getRuleKindLabel returns user-friendly values", () => {
    expect(getRuleKindLabel("inline_semantics")).toBe("Textformatierung");
    expect(getRuleKindLabel("export_profile")).toBe("Exportformat");
    expect(getRuleKindLabel("render")).toBe("Aussehen");
    expect(getRuleKindLabel("structure")).toBe("Aufbau");
    expect(getRuleKindLabel("clipboard")).toBe("Kopieren");
  });

  test("markdown-lines block type is 'Textzeilen'", () => {
    expect(getBlockTypeLabel("markdown-lines")).toBe("Textzeilen");
  });

  test("rulesLabels scope labels are simplified", () => {
    expect(rulesLabels.allImports).toBe("Überall anwenden");
    expect(rulesLabels.thisImportOnly).toBe("Nur hier");
  });
});

describe("adjustmentLabels", () => {
  test("enthält alle erwarteten Button-Labels", () => {
    expect(adjustmentLabels.send).toBe("Senden");
    expect(adjustmentLabels.sendPending).toBe("Wird gesendet...");
    expect(adjustmentLabels.cancel).toBe("Abbrechen");
    expect(adjustmentLabels.discard).toBe("Verwerfen");
    expect(adjustmentLabels.dismiss).toBe("Verstanden");
    expect(adjustmentLabels.download).toBe("Download");
  });

  test("enthält Placeholder-Texte", () => {
    expect(adjustmentLabels.adjustmentPlaceholder).toBeTruthy();
    expect(adjustmentLabels.followUpPlaceholder).toBeTruthy();
  });

  test("enthält Nachrichten und Hinweise", () => {
    expect(adjustmentLabels.loadingMessage).toBeTruthy();
    expect(adjustmentLabels.appliedHint).toBeTruthy();
    expect(adjustmentLabels.defaultHint).toBeTruthy();
    expect(adjustmentLabels.closeLabel).toBeTruthy();
    expect(adjustmentLabels.inputLabel).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// View / Role / BlockType / RuleKind Labels
// ---------------------------------------------------------------------------

describe("getViewLabel", () => {
  test("gibt korrekte View-Labels zurück", () => {
    expect(getViewLabel("reader")).toBe("HTML");
    expect(getViewLabel("markdown")).toBe("Markdown");
    expect(getViewLabel("handover")).toBe("Übergabe");
    expect(getViewLabel("json")).toBe("JSON");
  });
});

describe("getRoleLabel", () => {
  test("gibt bekannte Rollen-Labels zurück", () => {
    expect(getRoleLabel("assistant")).toBe("Assistent");
    expect(getRoleLabel("user")).toBe("Nutzer");
    expect(getRoleLabel("system")).toBe("System");
    expect(getRoleLabel("tool")).toBe("Werkzeug");
  });

  test("gibt Fallback für unbekannte Rolle", () => {
    expect(getRoleLabel("custom_role")).toBe("custom_role");
  });
});

describe("getBlockTypeLabel", () => {
  test("gibt bekannte BlockType-Labels zurück", () => {
    expect(getBlockTypeLabel("code")).toBe("Codeblock");
    expect(getBlockTypeLabel("paragraph")).toBe("Absatz");
    expect(getBlockTypeLabel("table")).toBe("Tabelle");
  });

  test("gibt Fallback für unbekannten BlockType", () => {
    expect(getBlockTypeLabel("unknown_block")).toBe("unknown_block");
  });
});

describe("getRuleKindLabel", () => {
  test("gibt korrekte RuleKind-Labels zurück (S10 de-jargoned)", () => {
    expect(getRuleKindLabel("clipboard")).toBe("Kopieren");
    expect(getRuleKindLabel("export_profile")).toBe("Exportformat");
    expect(getRuleKindLabel("inline_semantics")).toBe("Textformatierung");
    expect(getRuleKindLabel("render")).toBe("Aussehen");
    expect(getRuleKindLabel("structure")).toBe("Aufbau");
  });
});

// ---------------------------------------------------------------------------
// V-S6: Selection Formatter
// ---------------------------------------------------------------------------

describe("formatMarkdownLinesLabel", () => {
  test("formatiert Zeilen-Range korrekt", () => {
    expect(formatMarkdownLinesLabel(1, 10)).toBe("Textzeilen 1-10");
    expect(formatMarkdownLinesLabel(5, 5)).toBe("Textzeilen 5-5");
    expect(formatMarkdownLinesLabel(100, 200)).toBe("Textzeilen 100-200");
  });
});

describe("formatMessageBlockLabel", () => {
  test("kombiniert Role, Index und BlockType", () => {
    expect(formatMessageBlockLabel("user", 1, "paragraph")).toBe(
      "Nutzer-Nachricht 1 · Absatz",
    );
    expect(formatMessageBlockLabel("assistant", 3, "code")).toBe(
      "Assistent-Nachricht 3 · Codeblock",
    );
  });

  test("verwendet Fallback für unbekannte Role und BlockType", () => {
    expect(formatMessageBlockLabel("custom", 2, "unknown")).toBe(
      "custom-Nachricht 2 · unknown",
    );
  });
});

// ---------------------------------------------------------------------------
// V-S7: Rules Labels
// ---------------------------------------------------------------------------

describe("rulesLabels", () => {
  test("activeRulesCount formatiert korrekt", () => {
    expect(rulesLabels.activeRulesCount(0)).toBe("Regeln");
    expect(rulesLabels.activeRulesCount(3)).toBe("3 Regeln aktiv");
    expect(rulesLabels.activeRulesCount(1)).toBe("1 Regel aktiv");
  });

  test("statische Labels sind nicht-leer", () => {
    expect(rulesLabels.noActiveRules).toBeTruthy();
    expect(rulesLabels.allImports).toBeTruthy();
    expect(rulesLabels.thisImportOnly).toBeTruthy();
    expect(rulesLabels.loading).toBeTruthy();
    expect(rulesLabels.rationale).toBeTruthy();
    expect(rulesLabels.defaultRationale).toBeTruthy();
    expect(rulesLabels.exactScopeNote).toBeTruthy();
    expect(rulesLabels.globalScopeNote).toBeTruthy();
    expect(rulesLabels.undoPending).toBeTruthy();
    expect(rulesLabels.undo).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Misc Labels
// ---------------------------------------------------------------------------

describe("miscLabels", () => {
  test("statische Labels sind nicht-leer", () => {
    expect(miscLabels.transcriptLoading).toBeTruthy();
    expect(miscLabels.importFailed).toBeTruthy();
    expect(miscLabels.viewLoadError).toBeTruthy();
    expect(miscLabels.retryButton).toBeTruthy();
    expect(miscLabels.adjustmentLoadError).toBeTruthy();
  });

  test("errorInPhase formatiert korrekt", () => {
    expect(miscLabels.errorInPhase("fetch")).toBe("Fehler in Phase: fetch");
    expect(miscLabels.errorInPhase("validate")).toBe(
      "Fehler in Phase: validate",
    );
  });
});

// ---------------------------------------------------------------------------
// getRuleLabel
// ---------------------------------------------------------------------------

describe("getRuleLabel", () => {
  test("gibt kurze Instruktionen direkt zurück", () => {
    const rule = {
      instruction: "Kurzer Text",
    } as unknown as import("@chat-exporter/shared").FormatRule;
    expect(getRuleLabel(rule)).toBe("Kurzer Text");
  });

  test("kürzt lange Instruktionen auf 69 Zeichen + Ellipsis", () => {
    const longText = "A".repeat(100);
    const rule = {
      instruction: longText,
    } as unknown as import("@chat-exporter/shared").FormatRule;
    const label = getRuleLabel(rule);
    expect(label).toHaveLength(72);
    expect(label.endsWith("...")).toBe(true);
  });

  test("gibt Instruktionen mit genau 72 Zeichen direkt zurück", () => {
    const text = "B".repeat(72);
    const rule = {
      instruction: text,
    } as unknown as import("@chat-exporter/shared").FormatRule;
    expect(getRuleLabel(rule)).toBe(text);
  });

  test("trimmt Whitespace am Anfang und Ende", () => {
    const rule = {
      instruction: "  Hallo Welt  ",
    } as unknown as import("@chat-exporter/shared").FormatRule;
    expect(getRuleLabel(rule)).toBe("Hallo Welt");
  });
});
