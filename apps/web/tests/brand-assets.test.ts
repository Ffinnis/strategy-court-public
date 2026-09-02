import { expect, test } from "bun:test";

const markFile = new URL("../public/brand/strategy-court-mark.svg", import.meta.url);
const faviconFile = new URL("../public/favicon.svg", import.meta.url);
const pathData = (source: string) => [...source.matchAll(/<path\s+d="([^"]+)"/g)].map((match) => match[1]);

test("brand mark is a small standalone vector with no raster or runtime dependencies", async () => {
  const source = await Bun.file(markFile).text();

  expect(source).toContain('viewBox="0 0 48 56"');
  expect(source).toContain("<title>Retrade</title>");
  expect(pathData(source)).toHaveLength(2);
  expect(source).not.toMatch(/<(image|script|foreignObject|text|filter)\b|(?:href|onload)=|data:image/);
  expect(source.length).toBeLessThan(1200);
});

test("favicon uses the same hand-drawn mark on an opaque dark background", async () => {
  const [mark, favicon] = await Promise.all([Bun.file(markFile).text(), Bun.file(faviconFile).text()]);

  expect(pathData(favicon)).toEqual(pathData(mark));
  expect(favicon).toContain('viewBox="0 0 64 64"');
  expect(favicon).toContain('fill="#080808"');
  expect(favicon).toContain('transform="translate(8 4)"');
});
