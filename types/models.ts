export interface MangaItem {
  id: string;
  type: 'draft' | 'finished' | 'cover';
  title: string;
  chapterNumber: number;
  pagesCount: number;
  createdAt: string;
  updatedAt: string;
  thumbnailPath?: string;
}