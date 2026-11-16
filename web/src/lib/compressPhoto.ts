import { JPEG_QUALITY, MAX_LONG_EDGE, dataUrlBytes, scaleToLongEdge } from "./postListing.ts";

export type CompressedPhoto = {
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  originalBytes: number;
  bytes: number;
};

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the photo"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} isn't an image this browser can open`));
    };
    img.src = url;
  });
}

/**
 * TM09-98 AC2: downscale a picked photo so its long edge is at most 1600px,
 * then re-encode it as JPEG before it is uploaded. Phone photos are often
 * 4000px and several MB; this keeps uploads well under MAX_PHOTO_BYTES.
 *
 * Drawing through a canvas also drops EXIF data (including GPS location),
 * which is a privacy win for hosts posting photos of their home.
 */
export async function compressPhoto(file: File, maxEdge = MAX_LONG_EDGE): Promise<CompressedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image`);

  const img = await loadImage(file);
  const target = scaleToLongEdge(img.naturalWidth, img.naturalHeight, maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't resize photos");
  // JPEG has no alpha: paint white first so transparent PNGs don't turn black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.drawImage(img, 0, 0, target.width, target.height);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not compress the photo"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
  const dataUrl = await readAsDataUrl(blob);

  return {
    dataUrl,
    width: target.width,
    height: target.height,
    originalWidth: img.naturalWidth,
    originalHeight: img.naturalHeight,
    originalBytes: file.size,
    bytes: dataUrlBytes(dataUrl),
  };
}
