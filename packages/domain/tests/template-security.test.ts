import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  compileTemplate,
  parseTemplate,
  renderTemplate,
  sanitizeTemplateMarkup,
  validateAndScopeTemplateCss,
} from "../src/index";
import { rich } from "./content-fixtures";

function assertNoExecutableMarkup(html: string): void {
  const container = document.createElement("div");
  container.innerHTML = html;
  expect(
    container.querySelector("script,iframe,object,embed,svg,math,img,style,link,meta"),
  ).toBeNull();
  for (const element of container.querySelectorAll("*")) {
    for (const attribute of element.getAttributeNames()) {
      expect(attribute.toLowerCase().startsWith("on")).toBe(false);
      expect(element.getAttribute(attribute)?.toLowerCase()).not.toContain("javascript:");
    }
  }
}

describe("safe template parser and renderer", () => {
  it("parses interpolation, helpers, conditionals, bounded lists, and front inclusion", () => {
    const frontProgram = parseTemplate(
      '<section class="card">{{#if Term}}{{Term}}{{/if}}{{#each Items}}<span>{{item}}</span>{{/each}}{{type:Answer}}</section>',
    );
    const front = renderTemplate(frontProgram, {
      fields: {
        Term: rich("Osmosis"),
        Items: ["one", "two"],
        Answer: "movement of water",
      },
    });
    const back = renderTemplate(parseTemplate("{{front}}<p>{{hint:Hint}}</p>"), {
      fields: { Hint: "Across a membrane" },
      front,
    });

    expect(front.html).toContain("Osmosis");
    expect(front.html.match(/<span>/gu)).toHaveLength(2);
    expect(front.html).toContain("data-lumen-type-answer");
    expect(back.html).toContain(front.html);
    expect(back.html).toContain("<details");
    expect(front.referencedFields).toEqual(["Answer", "Items", "Term"]);
  });

  it("encodes attacker markup in template literals and interpolated field values", () => {
    const corpus = [
      "<script>alert(1)</script>{{Field}}",
      '<img src=x onerror="alert(1)">{{Field}}',
      '<svg><a xlink:href="javascript:alert(1)">x</a></svg>{{Field}}',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>{{Field}}',
      '<div style="background:url(javascript:alert(1))" onclick="alert(1)">{{Field}}</div>',
      '<object data="data:text/html,<script>alert(1)</script>"></object>{{Field}}',
    ];

    for (const source of corpus) {
      const rendered = renderTemplate(parseTemplate(source), {
        fields: { Field: '<img src=x onerror="alert(2)"><script>alert(3)</script>' },
      });
      assertNoExecutableMarkup(rendered.html);
    }
  });

  it("rejects raw interpolation, prototype traversal, unknown helpers, and unbalanced blocks", () => {
    expect(() => parseTemplate("{{{Field}}}")).toThrow(/Raw/u);
    expect(() => parseTemplate("{{constructor}}")).toThrow(/Invalid template field/u);
    expect(() => parseTemplate("{{#each Items}}{{unknown Item}}{{/each}}")).toThrow(/Unknown/u);
    expect(() => parseTemplate("{{#if Front}}missing close")).toThrow(/unclosed/u);
    expect(() => parseTemplate("{{item}}")).toThrow(/only inside/u);
  });

  it("caps list iteration even when a caller asks for a larger bound", () => {
    const values = Array.from({ length: 1_000 }, (_, index) => String(index));
    const rendered = renderTemplate(parseTemplate("{{#each Values}}<i>{{item}}</i>{{/each}}"), {
      fields: { Values: values },
      maxLoopItems: 10_000,
    });
    const container = document.createElement("div");
    container.innerHTML = rendered.html;
    expect(container.querySelectorAll("i")).toHaveLength(100);
  });

  it("escapes arbitrary interpolated strings as a property", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_000 }), (value) => {
        const rendered = renderTemplate(parseTemplate("<p>{{Value}}</p>"), {
          fields: { Value: value },
        });
        const container = document.createElement("div");
        container.innerHTML = rendered.html;
        expect(container.querySelector("p")?.textContent).toBe(value);
        assertNoExecutableMarkup(rendered.html);
      }),
      { numRuns: 100 },
    );
  });
});

describe("strictly scoped template CSS", () => {
  it("prefixes every selector and keeps a small safe property vocabulary", () => {
    const style = validateAndScopeTemplateCss(
      ".prompt, p strong { color: var(--lumen-text); font-weight: 700; margin-top: 1rem; }",
      "biology-card",
    );
    expect(style.css).toBe(
      '[data-lumen-card-scope="biology-card"] .prompt,[data-lumen-card-scope="biology-card"] p strong{color:var(--lumen-text);font-weight:700;margin-top:1rem}',
    );
    expect(
      compileTemplate("{{Front}}", { css: ".x { color: red; }", scope: "safe" }).style,
    ).toMatchObject({ scope: "safe" });
  });

  it.each([
    '@import url("https://evil.example/x.css");',
    "body { color: red; }",
    ":root { color: red; }",
    "* { color: red; }",
    ".x { background: url(https://evil.example/x); }",
    ".x { behavior: url(evil.htc); }",
    ".x { position: fixed; }",
    ".x { --escape: red; }",
    ".x { color: expression(alert(1)); }",
    ".x { color: var(--attacker-color); }",
    "@media screen { .x { color: red; } }",
  ])("rejects global escape or active CSS: %s", (css) => {
    expect(() => validateAndScopeTemplateCss(css, "safe-card")).toThrow();
  });

  it("sanitizes standalone static markup through the same audited boundary", () => {
    const safe = sanitizeTemplateMarkup(
      '<p class="ok" onclick="evil()">Hello</p><script>alert(1)</script>',
    );
    assertNoExecutableMarkup(safe);
    expect(safe).toContain('<p class="ok">Hello</p>');
  });
});
