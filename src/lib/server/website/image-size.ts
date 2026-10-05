/**
 * Le dimensioni di un'immagine lette dall'intestazione del file, senza
 * librerie: PNG, JPEG, GIF e WebP. Servono al renderer per riservare lo
 * spazio dell'immagine (niente salti di impaginazione, CLS) e all'editor per
 * avvisare di un'immagine troppo piccola per una copertina.
 *
 * Restituisce `null` per un formato che non riconosce: non e un errore, e
 * l'immagine si usera senza dimensioni dichiarate.
 */
export const readImageSize = (buffer: Buffer): { width: number; height: number; mimeType: string } | null => {
  if (buffer.length < 24) return null;

  // PNG: firma + IHDR
  if (buffer.readUInt32BE(0) === 0x89504e47 && buffer.toString("ascii", 12, 16) === "IHDR") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), mimeType: "image/png" };
  }

  // GIF
  if (buffer.toString("ascii", 0, 3) === "GIF") {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), mimeType: "image/gif" };
  }

  // WebP (RIFF....WEBP)
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8 " && buffer.length >= 30) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, mimeType: "image/webp" };
    }
    if (chunk === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, mimeType: "image/webp" };
    }
    if (chunk === "VP8X" && buffer.length >= 30) {
      return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1, mimeType: "image/webp" };
    }
    return null;
  }

  // JPEG: si cercano i marcatori SOF
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), mimeType: "image/jpeg" };
      }
      offset += 2 + length;
    }
    return null;
  }

  return null;
};
