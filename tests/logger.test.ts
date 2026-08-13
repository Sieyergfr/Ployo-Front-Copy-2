import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger, runWithRequestId } from "@/lib/logger";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("gibt in Produktion eine gültige JSON-Zeile mit den erwarteten Feldern aus", () => {
    logger.info("Testnachricht", { foo: "bar" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);

    expect(parsed).toMatchObject({
      level: "info",
      message: "Testnachricht",
      foo: "bar",
    });
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("hängt die Request-ID aus runWithRequestId an alle Logs im Callback", () => {
    runWithRequestId(() => {
      logger.info("Innerhalb des Requests");
    }, "fixed-request-id");

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.requestId).toBe("fixed-request-id");
  });

  it("loggt außerhalb von runWithRequestId ohne requestId-Feld", () => {
    logger.info("Ohne Kontext");

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.requestId).toBeUndefined();
  });
});
