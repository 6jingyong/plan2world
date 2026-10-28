/** Only product-owned messages leave the private authoring process.
 * @param {unknown} error @param {string} [key] */
export function safeDesktopError(error, key = '') {
  const message = error instanceof Error ? error.message : '';
  if (key && message.includes(key)) return 'Reconstruction could not finish. Saved observations were retained; no automatic retry was made.';
  return /^(Image preparation |OpenRouter |Account |Enter a valid |Connect OpenRouter |Choose |Unsupported |Original raster |Invalid native |The model |Unresolved |Architecture |Duplicate |Overlapping |Source |Saved task )/.test(message)
    ? message.slice(0, 1000) : 'Reconstruction could not finish. Saved observations were retained; check the model or local files before continuing. No automatic retry was made.';
}
