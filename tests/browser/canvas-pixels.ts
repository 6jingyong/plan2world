import type { Locator } from '@playwright/test';

interface CanvasPixels {
  canvas: HTMLCanvasElement;
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function captureCanvas(canvas: Locator) {
  // Preserve the canvas and its ancestor compositing layers while excluding
  // overlays. Restore the style before inspectCanvas checks the live DOM.
  await canvas.evaluate(node => node.setAttribute('data-test-canvas-capture', ''));
  try {
    return await canvas.screenshot({ style: '*:not([data-test-canvas-capture]):not(:has([data-test-canvas-capture])) { visibility: hidden !important; }' });
  } finally {
    await canvas.evaluate(node => node.removeAttribute('data-test-canvas-capture'));
  }
}

/** Read the presented image without requiring a preserved WebGL drawing buffer. */
export async function inspectCanvas<T>(canvas: Locator, inspect: (pixels: CanvasPixels) => T): Promise<T> {
  const png = await captureCanvas(canvas);
  const pixels = await canvas.evaluateHandle(async (node: HTMLCanvasElement, encoded: string) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
    const probe = document.createElement('canvas'); probe.width = image.width; probe.height = image.height;
    const context = probe.getContext('2d')!; context.drawImage(image, 0, 0); image.close();
    const { data, width, height } = context.getImageData(0, 0, probe.width, probe.height);
    return { canvas: node, data, width, height };
  }, png.toString('base64'));
  try { return await pixels.evaluate(inspect); }
  finally { await pixels.dispose(); }
}
