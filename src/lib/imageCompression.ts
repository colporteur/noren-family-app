// Client-side image resizing/compression so we don't blow past Edge Function
// payload limits (~6MB) when shipping a base64 image to Claude.
//
// We resize so the largest side is at most 1600px (more than enough for OCR
// on a scoresheet) and re-encode as JPEG at q=0.85. Result is typically
// <500KB even for full-resolution phone photos.

export interface CompressedImage {
  base64: string;        // Pure base64 string (no data: prefix).
  mediaType: string;     // 'image/jpeg'
  byteLength: number;    // Approx size of decoded bytes.
}

const MAX_SIDE = 1600;
const QUALITY = 0.85;

export async function compressImage(file: File): Promise<CompressedImage> {
  // Decode the file via createImageBitmap for fast, accurate decoding.
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  let targetW = width;
  let targetH = height;
  if (Math.max(width, height) > MAX_SIDE) {
    const scale = MAX_SIDE / Math.max(width, height);
    targetW = Math.round(width * scale);
    targetH = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context.');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      QUALITY,
    );
  });

  const buf = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);
  return { base64, mediaType: 'image/jpeg', byteLength: buf.byteLength };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  // Avoid the 'btoa(String.fromCharCode(...bytes))' trick — it OOMs on big
  // images. Process in chunks instead.
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  return btoa(binary);
}
