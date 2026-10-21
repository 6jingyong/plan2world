import { chromium } from '@playwright/test';

/** Local decoder only. Never opens the app, network or a model provider. */
export async function readSourceRaster(bytes) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const mime = bytes[0] === 0xff ? 'image/jpeg' : bytes[0] === 0x89 ? 'image/png' : 'image/webp';
    const decoded = await page.evaluate(async url => {
      const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error('Source raster exceeds pixel budget.');
      const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight), context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data, chunks = [];
      for (let i = 0; i < pixels.length; i += 8192) chunks.push(String.fromCharCode(...pixels.subarray(i, i + 8192)));
      return { width: canvas.width, height: canvas.height, rgba: btoa(chunks.join('')) };
    }, `data:${mime};base64,${bytes.toString('base64')}`);
    return { width: decoded.width, height: decoded.height, data: Buffer.from(decoded.rgba, 'base64') };
  } finally { await browser.close(); }
}
