export interface ImageData {
    path: string;
    filename: string;
    directory: string;
    title: string;
    size: number;
    mtime: string;
    tags: string[];
    keywords: string[];
    feature?: string;
}
