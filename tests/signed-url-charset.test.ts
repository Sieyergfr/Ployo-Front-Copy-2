import { describe, expect, it } from "vitest";
import { withCharsetIfText } from "@/lib/storage/signed-url";

/**
 * Unit-Test für QA-Bug BUG-023: eine UTF-8-Textdatei wurde ohne `charset` in
 * `response-content-type` ausgeliefert — der Browser interpretierte die
 * Vorschau dadurch nach Latin-1 ("lÃ¶schen" statt "löschen").
 */
describe("withCharsetIfText", () => {
  it("ergänzt charset=utf-8 für text/plain", () => {
    expect(withCharsetIfText("text/plain")).toBe("text/plain; charset=utf-8");
  });

  it("ergänzt charset=utf-8 für weitere textbasierte Typen", () => {
    expect(withCharsetIfText("text/csv")).toBe("text/csv; charset=utf-8");
    expect(withCharsetIfText("application/json")).toBe("application/json; charset=utf-8");
    expect(withCharsetIfText("application/xml")).toBe("application/xml; charset=utf-8");
    expect(withCharsetIfText("image/svg+xml")).toBe("image/svg+xml; charset=utf-8");
  });

  it("lässt bereits gesetzten charset unangetastet", () => {
    expect(withCharsetIfText("text/plain; charset=iso-8859-1")).toBe(
      "text/plain; charset=iso-8859-1",
    );
  });

  it("lässt nicht-textbasierte Typen unangetastet", () => {
    expect(withCharsetIfText("application/pdf")).toBe("application/pdf");
    expect(withCharsetIfText("image/png")).toBe("image/png");
    expect(withCharsetIfText("application/zip")).toBe("application/zip");
  });

  it("gibt undefined für undefined zurück", () => {
    expect(withCharsetIfText(undefined)).toBeUndefined();
  });
});
