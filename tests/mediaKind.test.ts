import { describe, expect, it } from "vitest";
import {
  getPreviewMediaKind,
  looksLikeGifUrl,
  looksLikeVideoUrl
} from "../extractor/src/shared/mediaKind";

describe("mediaKind", () => {
  it("detects video urls by extension", () => {
    expect(looksLikeVideoUrl("https://cdn.example.com/a/b/c.mp4")).toBe(true);
    expect(looksLikeVideoUrl("https://cdn.example.com/v.webm?x=1")).toBe(true);
    expect(looksLikeVideoUrl("https://cdn.example.com/v.m3u8")).toBe(true);
  });

  it("detects gif urls", () => {
    expect(looksLikeGifUrl("https://example.com/x.gif")).toBe(true);
    expect(looksLikeGifUrl("https://example.com/x.gif?token=1")).toBe(true);
    expect(looksLikeGifUrl("data:image/gif;base64,AAAA")).toBe(true);
  });

  it("prefers video over gif over image", () => {
    expect(getPreviewMediaKind("https://example.com/v.mp4")).toBe("video");
    expect(getPreviewMediaKind("https://example.com/a.gif")).toBe("gif");
    expect(getPreviewMediaKind("https://example.com/a.png")).toBe("image");
  });
});

