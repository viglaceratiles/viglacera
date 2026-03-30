export interface ImageData {
  path: string;
  filename: string;
  directory: string;
  title: string;
  size: number;
  mtime: string;
  sizeTags: string[];
  surfaceTags: string[];
  materialTags: string[];
  otherTags: string[];
  keywords: string[];
  feature?: string;
}
