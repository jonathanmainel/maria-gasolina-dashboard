// No transforms: inspect the downloaded container and its encoded dimensions.
// Unsupported/ambiguous files are rejected rather than guessed or upscaled.
export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
export type Dimensions = { width: number; height: number };
export class PreviewError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function trustedMediaUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PreviewError("preview_url_untrusted");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(
      url.hostname.endsWith(".fbcdn.net") ||
      url.hostname.endsWith(".fbsbx.com") ||
      url.hostname.endsWith(".cdninstagram.com")
    )
  )
    throw new PreviewError("preview_url_untrusted");
  return url;
}

export async function readLimitedBody(
  response: Response,
): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get("content-length")) > MAX_PREVIEW_BYTES)
    throw new PreviewError("preview_too_large");
  const reader = response.body?.getReader();
  if (!reader) throw new PreviewError("preview_invalid_image");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > MAX_PREVIEW_BYTES)
        throw new PreviewError("preview_too_large");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function fetchMedia(
  raw: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  let url = trustedMediaUrl(raw);
  for (let hop = 0; hop <= 3; hop++) {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new PreviewError("preview_redirect");
      url = trustedMediaUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new PreviewError(`preview_http_${response.status}`);
    }
    return response;
  }
  throw new PreviewError("preview_redirect");
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectImage(bytes: Uint8Array, mime: string): Dimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  const invalid = (): never => {
    throw new PreviewError("preview_invalid_image");
  };
  let dimensions: Dimensions | undefined;
  if (
    mime === "image/png" &&
    bytes.length >= 45 &&
    ascii(0, 8) === "\x89PNG\r\n\x1a\n"
  ) {
    let offset = 8,
      hasData = false,
      end = false;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset),
        kind = ascii(offset + 4, 4);
      if (size > bytes.length - offset - 12) invalid();
      if (
        crc32(bytes.subarray(offset + 4, offset + 8 + size)) !==
        view.getUint32(offset + 8 + size)
      )
        invalid();
      if (offset === 8) {
        if (kind !== "IHDR" || size !== 13) invalid();
        dimensions = { width: view.getUint32(16), height: view.getUint32(20) };
      }
      if (kind === "IDAT" && size > 0) hasData = true;
      offset += size + 12;
      if (kind === "IEND") {
        end = size === 0 && offset === bytes.length;
        break;
      }
    }
    if (!hasData || !end) invalid();
  } else if (
    mime === "image/jpeg" &&
    bytes.length > 20 &&
    bytes[0] === 255 &&
    bytes[1] === 216
  ) {
    let offset = 2,
      scan = false,
      ended = false;
    const frames = new Set([
      192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
    ]);
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) {
        if (!scan) invalid();
        continue;
      }
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if ((marker === 0 && scan) || (marker >= 208 && marker <= 215)) continue;
      if (marker === 217) {
        ended = offset === bytes.length;
        break;
      }
      if (offset + 2 > bytes.length) invalid();
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) invalid();
      if (frames.has(marker)) {
        if (size < 8) invalid();
        dimensions = {
          height: view.getUint16(offset + 3),
          width: view.getUint16(offset + 5),
        };
      }
      if (marker === 218) scan = true;
      offset += size;
    }
    if (!scan || !ended) invalid();
  } else if (
    mime === "image/webp" &&
    bytes.length >= 30 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 4) === "WEBP"
  ) {
    if (view.getUint32(4, true) + 8 !== bytes.length) invalid();
    let offset = 12,
      hasImage = false;
    while (offset + 8 <= bytes.length) {
      const kind = ascii(offset, 4),
        size = view.getUint32(offset + 4, true),
        data = offset + 8;
      if (size > bytes.length - data) invalid();
      if (kind === "VP8 " && size >= 10) {
        if (ascii(data + 3, 3) !== "\x9d\x01\x2a") invalid();
        dimensions = {
          width: view.getUint16(data + 6, true) & 0x3fff,
          height: view.getUint16(data + 8, true) & 0x3fff,
        };
        hasImage = true;
      } else if (kind === "VP8L" && size >= 5 && bytes[data] === 47) {
        const bits = view.getUint32(data + 1, true);
        dimensions = {
          width: (bits & 0x3fff) + 1,
          height: ((bits >>> 14) & 0x3fff) + 1,
        };
        hasImage = true;
      }
      offset = data + size + (size % 2);
    }
    if (!hasImage || offset !== bytes.length) invalid(); // Animated/unsupported WebP remains untouched.
  } else if (
    mime === "image/gif" &&
    bytes.length > 13 &&
    ["GIF87a", "GIF89a"].includes(ascii(0, 6))
  ) {
    dimensions = {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
    let offset = 13 + (bytes[10] & 128 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0),
      frames = 0,
      end = false;
    const blocks = () => {
      while (offset < bytes.length) {
        const size = bytes[offset++];
        if (!size) return;
        offset += size;
        if (offset > bytes.length) invalid();
      }
      invalid();
    };
    while (offset < bytes.length) {
      const marker = bytes[offset++];
      if (marker === 59) {
        end = offset === bytes.length;
        break;
      }
      if (marker === 33) {
        offset++;
        blocks();
      } else if (marker === 44 && offset + 9 <= bytes.length) {
        const packed = bytes[offset + 8];
        offset += 9;
        if (packed & 128) offset += 3 * (1 << ((packed & 7) + 1));
        offset++;
        blocks();
        frames++;
      } else invalid();
    }
    if (!end || !frames) invalid();
  } else throw new PreviewError("preview_format_unsupported");
  if (
    !dimensions ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width * dimensions.height > 40_000_000
  )
    invalid();
  return dimensions!;
}

// A larger area alone can conceal a worse short edge or a different crop.
// A square fallback can become an uncropped rectangle only if BOTH edges improve.
export function improves(candidate: Dimensions, previous: Dimensions): boolean {
  const c = [candidate.width, candidate.height].sort((a, b) => a - b);
  const p = [previous.width, previous.height].sort((a, b) => a - b);
  const sameOrientation =
    Math.sign(candidate.width - candidate.height) ===
    Math.sign(previous.width - previous.height);
  const closeRatio =
    Math.abs(
      candidate.width / candidate.height / (previous.width / previous.height) -
        1,
    ) <= 0.035;
  const squareFallback =
    previous.width === previous.height && c[0] > p[0] && c[1] > p[1];
  return (
    ((sameOrientation && closeRatio) || squareFallback) &&
    c[0] >= p[0] &&
    c[1] >= p[1] &&
    c[0] * c[1] > p[0] * p[1]
  );
}
