const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "documento";

export const openClientFileUrl = (url?: string | null) => {
  if (!url || typeof window === "undefined") {
    return false;
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return true;
};

export const downloadClientFileUrl = (
  url?: string | null,
  fileName: string = "documento",
) => {
  if (!url || typeof document === "undefined") {
    return false;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFileName(fileName);
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
};

export const fileToDataUrl = async (file: File | Blob | null | undefined) => {
  if (!file || typeof FileReader === "undefined") {
    return "";
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};
