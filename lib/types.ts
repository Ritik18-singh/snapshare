export type EventMeta = {
  id: string;
  name: string;
  description?: string;
  date?: string;
  createdAt: string;
};

export type Photo = {
  id: string;
  /** Original file name as uploaded (sanitised). */
  filename: string;
  mime: string;
  ext: string;
  size: number;
  width?: number;
  height?: number;
  uploadedAt: string;
  /** True when a thumbnail + web-sized preview were generated. */
  hasThumb: boolean;
};

export type PhotoVariant = "thumb" | "view" | "original";
