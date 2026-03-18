// @vitest-environment node

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

/**
 * We test renderTextWithMarkdownStrong indirectly via renderReaderInlineText
 * which is the public consumer. Since both are module-private, we import
 * the full module and test through renderReaderBlock with minimal block data.
 *
 * For focused unit testing of the inline emphasis logic, we re-export
 * the helpers or test via static markup output.
 */

// The functions are not exported, so we test through the exported renderReaderBlock.
// We render a simple paragraph block and check the HTML output.
import { renderReaderBlock } from "./reader-block-render.js";

function renderToHtml(node: React.ReactNode): string {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, node));
}

describe("renderTextWithMarkdownStrong (via renderReaderBlock)", () => {
  const makeBlock = (text: string) => ({
    type: "paragraph" as const,
    text,
    id: "test-block",
  });

  test("renders **bold** as <strong>", () => {
    const result = renderReaderBlock(makeBlock("Hello **world**"), []);
    const html = renderToHtml(result);

    expect(html).toContain("<strong>world</strong>");
    expect(html).not.toContain("**");
  });

  test("renders *italic* as <em>", () => {
    const result = renderReaderBlock(makeBlock("Hello *world*"), []);
    const html = renderToHtml(result);

    expect(html).toContain("<em>world</em>");
    expect(html).not.toContain("*world*");
  });

  test("renders __bold__ as <strong>", () => {
    const result = renderReaderBlock(makeBlock("Hello __world__"), []);
    const html = renderToHtml(result);

    expect(html).toContain("<strong>world</strong>");
    expect(html).not.toContain("__");
  });

  test("renders _italic_ as <em>", () => {
    const result = renderReaderBlock(makeBlock("Hello _world_"), []);
    const html = renderToHtml(result);

    expect(html).toContain("<em>world</em>");
    expect(html).not.toContain("_world_");
  });

  test("renders nested *italic* inside **bold**", () => {
    const result = renderReaderBlock(
      makeBlock("**Eine Anwendung *mit* einer KI bauen**"),
      [],
    );
    const html = renderToHtml(result);

    expect(html).toContain("<strong>");
    expect(html).toContain("<em>mit</em>");
    expect(html).not.toContain("**");
    expect(html).not.toMatch(/(?<!<)\*(?!<)/);
  });

  test("renders multiple bold segments in one line", () => {
    const result = renderReaderBlock(
      makeBlock("**first** normal **second**"),
      [],
    );
    const html = renderToHtml(result);

    expect(html).toContain("<strong>first</strong>");
    expect(html).toContain("<strong>second</strong>");
    expect(html).toContain(" normal ");
  });

  test("renders mixed bold and italic", () => {
    const result = renderReaderBlock(
      makeBlock("**bold** and *italic* text"),
      [],
    );
    const html = renderToHtml(result);

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  test("leaves plain text unchanged", () => {
    const result = renderReaderBlock(makeBlock("no formatting here"), []);
    const html = renderToHtml(result);

    expect(html).toContain("no formatting here");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("<em>");
  });

  test("does not treat single asterisk in math as italic", () => {
    const result = renderReaderBlock(makeBlock("2 * 3 = 6"), []);
    const html = renderToHtml(result);

    // Spaces around * — should not be treated as italic delimiter
    expect(html).toContain("2 * 3 = 6");
  });

  test("handles the exact bug case from the screenshots", () => {
    const lines = [
      "**Eine Anwendung *mit* einer KI bauen** (Der praktischste Weg)",
      "**Ein existierendes KI-Modell *feinabstimmen* (Fine-Tuning)** (Der Experten-Weg)",
      '**Ein Basismodell *von Grund auf neu trainieren*** (Der "Big-Tech"-Weg)',
    ];

    for (const line of lines) {
      const result = renderReaderBlock(makeBlock(line), []);
      const html = renderToHtml(result);

      expect(html).toContain("<strong>");
      expect(html).not.toContain("**");
    }
  });
});
