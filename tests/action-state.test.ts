import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseAction } from "@/lib/action-state";

const schema = z.object({
  email: z.string().trim().min(1, "E-Mail ist erforderlich."),
  age: z.coerce.number().min(18, "Muss volljährig sein."),
});

describe("parseAction", () => {
  it("liefert die geparsten Daten bei gültiger Eingabe", () => {
    const result = parseAction(schema, { email: "a@b.de", age: "20" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ email: "a@b.de", age: 20 });
    }
  });

  it("liefert Feldfehler statt zu werfen bei ungültiger Eingabe", () => {
    const result = parseAction(schema, { email: "", age: "16" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state.fieldErrors?.email).toContain("E-Mail ist erforderlich.");
      expect(result.state.fieldErrors?.age).toContain("Muss volljährig sein.");
    }
  });
});
