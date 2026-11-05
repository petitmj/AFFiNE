const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join(
    ''
  );

/** SHA-256 of a string, hex. Used for ledger content hashes. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

/**
 * Blob id of some bytes: the base64url SHA-256 without padding, which is how
 * the server names the files it mirrors, so equal files share one blob.
 * (AFFiNE's own `sha()` keeps the `=` padding; the two never meet, because a
 * doc refers to a blob by the id it was written with.)
 */
export async function blobIdOf(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy));
  let bin = '';
  for (const b of digest) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
