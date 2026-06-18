import { describe, it, expect } from 'vitest';
import { extractImageUrls, downloadImages } from '../../src/github/images.js';

describe('extractImageUrls', () => {
  it('extracts markdown image URLs', () => {
    const body = 'Here is the bug:\n![screenshot](https://example.com/a.png)\nthanks';
    expect(extractImageUrls(body)).toEqual(['https://example.com/a.png']);
  });

  it('extracts HTML img src', () => {
    expect(extractImageUrls('<img width="200" src="https://example.com/b.jpg" />')).toEqual([
      'https://example.com/b.jpg',
    ]);
  });

  it('extracts bare GitHub attachment URLs', () => {
    const body = 'log: https://user-images.githubusercontent.com/1/abc-def.png and more text';
    expect(extractImageUrls(body)).toEqual([
      'https://user-images.githubusercontent.com/1/abc-def.png',
    ]);
  });

  it('extracts github assets URLs', () => {
    const body = 'see https://github.com/acme/repo/assets/123/xyz.gif here';
    expect(extractImageUrls(body)).toEqual(['https://github.com/acme/repo/assets/123/xyz.gif']);
  });

  it('de-duplicates and handles empty bodies', () => {
    const body = '![x](https://e.com/a.png) ![y](https://e.com/a.png)';
    expect(extractImageUrls(body)).toEqual(['https://e.com/a.png']);
    expect(extractImageUrls('')).toEqual([]);
  });
});

describe('downloadImages', () => {
  const png = new Uint8Array([1, 2, 3]);

  it('returns image parts for valid downloads', async () => {
    const parts = await downloadImages(['https://e.com/a.png'], async () => ({
      contentType: 'image/png',
      bytes: png,
    }));
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: 'image', mime: 'image/png' });
    expect((parts[0] as { dataB64: string }).dataB64).toBe(Buffer.from(png).toString('base64'));
  });

  it('falls back to URL extension when content-type is missing', async () => {
    const parts = await downloadImages(['https://e.com/a.jpg'], async () => ({
      contentType: null,
      bytes: png,
    }));
    expect(parts[0]).toMatchObject({ mime: 'image/jpeg' });
  });

  it('skips disallowed types and failed downloads without throwing', async () => {
    const logs: string[] = [];
    const parts = await downloadImages(
      ['https://e.com/a.svg', 'https://e.com/broken.png'],
      async (url) => {
        if (url.includes('broken')) throw new Error('404');
        return { contentType: 'image/svg+xml', bytes: png };
      },
      (m) => logs.push(m),
    );
    expect(parts).toHaveLength(0);
    expect(logs).toHaveLength(2);
  });

  it('skips images over the size cap', async () => {
    const big = new Uint8Array(9 * 1024 * 1024);
    const parts = await downloadImages(['https://e.com/big.png'], async () => ({
      contentType: 'image/png',
      bytes: big,
    }));
    expect(parts).toHaveLength(0);
  });
});
