/**
 * Client half of PhotoData.CompressPhoto() from the class diagram.
 *
 * Downscales to a long edge of MAX_EDGE and re-encodes as JPEG before upload,
 * so a 12 MP phone photo goes over the wire at a few hundred KB instead of
 * several megabytes. The server still enforces the hard byte limit.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file isn't an image");
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process that image");

  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  return canvas.toDataURL("image/jpeg", QUALITY);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari can reject some HEIC-ish files here; fall through to <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read that image"));
      img.src = url;
    });
  } finally {
    // Revoking after decode is safe; the bitmap is already in memory.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
