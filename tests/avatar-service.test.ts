import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { compressAvatarImage } from "@/lib/avatar-service";

describe("compressAvatarImage", () => {
  it("wandelt ein großes PNG in ein 256x256-WebP um", async () => {
    const png = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const result = await compressAvatarImage(png);
    const meta = await sharp(result).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(result.byteLength).toBeLessThan(png.byteLength);
  });

  it("lehnt Daten ab, die kein Bild sind", async () => {
    await expect(compressAvatarImage(Buffer.from("kein bild"))).rejects.toThrow(
      "kein gültiges Bild",
    );
  });
});
