import { BUILTIN_FORMATS } from "@chat-exporter/shared";
import type { FormatPlugin } from "./format-plugins";
import { clientFormatRegistry, FormatPluginRegistry } from "./format-plugins";

// ---------------------------------------------------------------------------
// FormatPluginRegistry — Unit Tests
// ---------------------------------------------------------------------------

describe("FormatPluginRegistry", () => {
  function createTestPlugin(
    overrides: Partial<FormatPlugin> = {},
  ): FormatPlugin {
    return {
      descriptor: {
        id: "test-format",
        label: "Test",
        adjustable: false,
        supportedRuleKinds: [],
        exportMimeType: "text/plain",
        exportExtension: ".txt",
      },
      ViewComponent: () => null,
      ...overrides,
    };
  }

  describe("register", () => {
    test("stores a plugin and makes it retrievable by id", () => {
      const registry = new FormatPluginRegistry();
      const plugin = createTestPlugin();

      registry.register(plugin);

      expect(registry.get("test-format")).toBe(plugin);
    });

    test("throws when registering a duplicate id", () => {
      const registry = new FormatPluginRegistry();
      registry.register(createTestPlugin());

      expect(() => registry.register(createTestPlugin())).toThrow(
        'Format plugin "test-format" is already registered.',
      );
    });
  });

  describe("get", () => {
    test("returns undefined for unknown id", () => {
      const registry = new FormatPluginRegistry();

      expect(registry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("getAll", () => {
    test("returns all registered plugins", () => {
      const registry = new FormatPluginRegistry();
      const p1 = createTestPlugin({
        descriptor: { ...createTestPlugin().descriptor, id: "a" },
      });
      const p2 = createTestPlugin({
        descriptor: { ...createTestPlugin().descriptor, id: "b" },
      });

      registry.register(p1);
      registry.register(p2);

      expect(registry.getAll()).toEqual([p1, p2]);
    });

    test("returns empty array when no plugins registered", () => {
      const registry = new FormatPluginRegistry();

      expect(registry.getAll()).toEqual([]);
    });

    test("returns a copy — mutations do not affect registry", () => {
      const registry = new FormatPluginRegistry();
      registry.register(createTestPlugin());

      const all = registry.getAll();
      all.pop();

      expect(registry.getAll()).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// clientFormatRegistry — Built-in Plugins
// ---------------------------------------------------------------------------

describe("clientFormatRegistry", () => {
  test("has all 5 built-in formats registered", () => {
    const all = clientFormatRegistry.getAll();

    expect(all).toHaveLength(5);

    const ids = all.map((p) => p.descriptor.id);
    expect(ids).toContain("reader");
    expect(ids).toContain("markdown");
    expect(ids).toContain("handover");
    expect(ids).toContain("json");
    expect(ids).toContain("html-export");
  });

  test("each plugin's descriptor matches the shared BUILTIN_FORMATS", () => {
    for (const builtinDescriptor of BUILTIN_FORMATS) {
      const plugin = clientFormatRegistry.get(builtinDescriptor.id);
      expect(plugin).toBeDefined();
      expect(plugin?.descriptor).toEqual(builtinDescriptor);
    }
  });

  test("markdown plugin has prepareDownload defined", () => {
    const plugin = clientFormatRegistry.get("markdown");

    expect(plugin?.prepareDownload).toBeTypeOf("function");
  });

  test("markdown plugin has prepareCopy defined", () => {
    const plugin = clientFormatRegistry.get("markdown");

    expect(plugin?.prepareCopy).toBeTypeOf("function");
  });

  test("reader plugin has no prepareDownload (complex deps handled elsewhere)", () => {
    const plugin = clientFormatRegistry.get("reader");

    expect(plugin?.prepareDownload).toBeUndefined();
  });

  test("handover, json, and html-export plugins have no prepareDownload or prepareCopy", () => {
    for (const id of ["handover", "json", "html-export"]) {
      const plugin = clientFormatRegistry.get(id);
      expect(plugin?.prepareDownload).toBeUndefined();
      expect(plugin?.prepareCopy).toBeUndefined();
    }
  });

  test("all plugins have a ViewComponent", () => {
    for (const plugin of clientFormatRegistry.getAll()) {
      expect(plugin.ViewComponent).toBeTypeOf("function");
    }
  });
});
