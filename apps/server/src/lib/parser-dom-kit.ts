/**
 * Browser-injectable script that defines shared DOM parsing helpers on globalThis.__domKit.
 *
 * Usage in parser files:
 *   await page.addInitScript({ content: DOM_KIT_SCRIPT });
 *   const result = await page.evaluate(() => {
 *     const { normalizeWhitespace, elementToBlocks } = globalThis.__domKit;
 *     // ... use helpers ...
 *   });
 */
export const DOM_KIT_SCRIPT: string = `(function() {
  var wrapperTags = new Set(["ARTICLE", "SECTION", "DIV", "SPAN", "FIGURE", "MAIN"]);
  var blockTags = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "PRE", "BLOCKQUOTE", "TABLE", "HR"]);
  var codeLanguageLabels = new Set(["plain text", "text", "json", "javascript", "typescript", "ts", "js", "python", "bash", "shell", "sql", "html", "css", "markdown", "md", "yaml", "yml"]);

  function normalizeWhitespace(value) {
    return (value != null ? value : "")
      .replace(/\\u00a0/g, " ")
      .replace(/\\r/g, "")
      .replace(/[ \\t\\f\\v]+/g, " ")
      .replace(/ *\\n */g, "\\n")
      .replace(/\\n{3,}/g, "\\n\\n")
      .trim();
  }

  function inlineText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent != null ? node.textContent : "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    var element = node;
    var tagName = element.tagName.toUpperCase();

    if (
      tagName === "BUTTON" ||
      tagName === "SVG" ||
      tagName === "PATH" ||
      tagName === "USE" ||
      tagName === "IMG" ||
      tagName === "NOSCRIPT"
    ) {
      return "";
    }

    if (tagName === "BR") {
      return "\\n";
    }

    var childText = Array.from(element.childNodes)
      .map(inlineText)
      .join("");

    switch (tagName) {
      case "A": {
        var text = normalizeWhitespace(childText);
        var href = element.getAttribute("href");
        return href && text ? "[" + text + "](" + href + ")" : text;
      }
      case "STRONG":
      case "B": {
        var text = normalizeWhitespace(childText);
        return text ? "**" + text + "**" : "";
      }
      case "EM":
      case "I": {
        var text = normalizeWhitespace(childText);
        return text ? "*" + text + "*" : "";
      }
      case "CODE": {
        if (element.closest("pre")) {
          return "";
        }
        var text = normalizeWhitespace(childText);
        return text ? "\`" + text + "\`" : "";
      }
      case "DEL":
      case "S": {
        var text = normalizeWhitespace(childText);
        return text ? "~~" + text + "~~" : "";
      }
      default:
        return childText;
    }
  }

  function inlineFromElement(element) {
    return normalizeWhitespace(
      Array.from(element.childNodes).map(inlineText).join("")
    );
  }

  function extractListItems(listElement, depth) {
    if (depth === undefined) depth = 0;
    var items = [];
    var listItems = Array.from(listElement.children).filter(
      function(child) { return child.tagName === "LI"; }
    );

    for (var i = 0; i < listItems.length; i++) {
      var listItem = listItems[i];
      var ownText = "";

      var childNodes = Array.from(listItem.childNodes);
      for (var j = 0; j < childNodes.length; j++) {
        var childNode = childNodes[j];
        if (
          childNode.nodeType === Node.ELEMENT_NODE &&
          (childNode.tagName === "UL" || childNode.tagName === "OL")
        ) {
          continue;
        }
        ownText += inlineText(childNode);
      }

      var normalized = normalizeWhitespace(ownText);
      if (normalized) {
        var indent = "";
        for (var d = 0; d < depth; d++) indent += "  ";
        items.push(indent + normalized);
      }

      var nestedLists = Array.from(listItem.children).filter(function(child) {
        return child.tagName === "UL" || child.tagName === "OL";
      });

      for (var k = 0; k < nestedLists.length; k++) {
        var nested = extractListItems(nestedLists[k], depth + 1);
        for (var m = 0; m < nested.length; m++) {
          items.push(nested[m]);
        }
      }
    }

    return items;
  }

  function detectCodeLanguage(preElement) {
    var firstLine = (preElement.innerText.split("\\n")[0] || "").trim().toLowerCase();

    if (codeLanguageLabels.has(firstLine)) {
      return firstLine === "plain text" ? "text" : firstLine;
    }

    var classHint = Array.from(preElement.querySelectorAll("[class]"))
      .map(function(el) { return el.className; })
      .join(" ");
    var languageMatch = classHint.match(/language-([a-z0-9#+-]+)/i);
    return languageMatch && languageMatch[1] ? languageMatch[1].toLowerCase() : "text";
  }

  function extractCodeText(preElement) {
    var lines = preElement.innerText.replace(/\\r/g, "").split("\\n");

    while (lines.length > 1) {
      var firstLine = (lines[0] || "").trim().toLowerCase();
      if (
        !codeLanguageLabels.has(firstLine) &&
        firstLine !== "kopieren" &&
        firstLine !== "copy"
      ) {
        break;
      }
      lines.shift();
    }

    return lines.join("\\n").trim();
  }

  function extractTable(tableElement) {
    var headerRows = Array.from(tableElement.querySelectorAll("thead tr"));
    var bodyRows = Array.from(tableElement.querySelectorAll("tbody tr"));
    var fallbackRows = Array.from(tableElement.querySelectorAll("tr"));
    var firstHeaderRow = headerRows[0];

    var headers = firstHeaderRow
      ? Array.from(firstHeaderRow.querySelectorAll("th,td")).map(function(cell) {
          return inlineFromElement(cell);
        })
      : [];

    var rowSource =
      bodyRows.length > 0
        ? bodyRows
        : fallbackRows.slice(headers.length > 0 ? 1 : 0);
    var rows = rowSource
      .map(function(row) {
        return Array.from(row.querySelectorAll("th,td")).map(function(cell) {
          return inlineFromElement(cell);
        });
      })
      .filter(function(row) { return row.some(Boolean); });

    if (headers.length === 0 && rows.length === 0) {
      return null;
    }

    return {
      type: "table",
      headers: headers,
      rows: rows
    };
  }

  function elementToBlocks(element) {
    var tagName = element.tagName.toUpperCase();

    if (tagName === "P") {
      var text = inlineFromElement(element);
      return text ? [{ type: "paragraph", text: text }] : [];
    }

    if (/^H[1-6]$/.test(tagName)) {
      var text = inlineFromElement(element);
      var level = Number(tagName.slice(1));
      return text ? [{ type: "heading", level: level, text: text }] : [];
    }

    if (tagName === "UL" || tagName === "OL") {
      var items = extractListItems(element);
      return items.length > 0
        ? [{ type: "list", ordered: tagName === "OL", items: items }]
        : [];
    }

    if (tagName === "PRE") {
      var text = extractCodeText(element);
      return text
        ? [{ type: "code", language: detectCodeLanguage(element), text: text }]
        : [];
    }

    if (tagName === "BLOCKQUOTE") {
      var text = inlineFromElement(element);
      return text ? [{ type: "quote", text: text }] : [];
    }

    if (tagName === "TABLE") {
      var table = extractTable(element);
      return table ? [table] : [];
    }

    if (tagName === "HR") {
      return [];
    }

    if (wrapperTags.has(tagName)) {
      var childBlocks = Array.from(element.childNodes).reduce(function(acc, childNode) {
        if (childNode.nodeType === Node.TEXT_NODE) {
          var text = normalizeWhitespace(childNode.textContent != null ? childNode.textContent : "");
          if (text) acc.push({ type: "paragraph", text: text });
          return acc;
        }

        if (childNode.nodeType !== Node.ELEMENT_NODE) {
          return acc;
        }

        var blocks = elementToBlocks(childNode);
        for (var b = 0; b < blocks.length; b++) acc.push(blocks[b]);
        return acc;
      }, []);

      if (childBlocks.length > 0) {
        return childBlocks;
      }
    }

    var hasBlockChildren = Array.from(element.children).some(function(child) {
      return blockTags.has(child.tagName);
    });

    if (hasBlockChildren) {
      return Array.from(element.children).reduce(function(acc, child) {
        var blocks = elementToBlocks(child);
        for (var b = 0; b < blocks.length; b++) acc.push(blocks[b]);
        return acc;
      }, []);
    }

    var text = inlineFromElement(element);
    return text ? [{ type: "paragraph", text: text }] : [];
  }

  globalThis.__domKit = {
    wrapperTags: wrapperTags,
    blockTags: blockTags,
    codeLanguageLabels: codeLanguageLabels,
    normalizeWhitespace: normalizeWhitespace,
    inlineText: inlineText,
    inlineFromElement: inlineFromElement,
    extractListItems: extractListItems,
    detectCodeLanguage: detectCodeLanguage,
    extractCodeText: extractCodeText,
    extractTable: extractTable,
    elementToBlocks: elementToBlocks
  };
})();`;

/** TypeScript interface describing what __domKit provides in browser context. */
export interface DomKit {
  wrapperTags: Set<string>;
  blockTags: Set<string>;
  codeLanguageLabels: Set<string>;
  normalizeWhitespace: (value: string | null | undefined) => string;
  inlineText: (node: Node) => string;
  inlineFromElement: (element: Element) => string;
  extractListItems: (listElement: Element, depth?: number) => string[];
  detectCodeLanguage: (preElement: HTMLElement) => string;
  extractCodeText: (preElement: HTMLElement) => string;
  extractTable: (
    tableElement: HTMLTableElement,
  ) => { type: "table"; headers: string[]; rows: string[][] } | null;
  elementToBlocks: (element: Element) => Array<Record<string, unknown>>;
}

// Augment globalThis for browser context
declare global {
  var __domKit: DomKit;
}
