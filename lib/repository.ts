import { useSQLiteContext } from 'expo-sqlite';
import { MangaItem } from '../types/models';

export class MangaRepository {
  constructor(private db = useSQLiteContext()) {}

  async getByType(type: MangaItem['type']): Promise<MangaItem[]> {
    return this.db.getAllAsync<MangaItem>(`SELECT * FROM manga_items WHERE type = ? ORDER BY updatedAt DESC`, [type]);
  }

  async save(item: Omit<MangaItem, 'id'> & {id?: string}): Promise<MangaItem> {
    const now = new Date().toISOString();
    const id = item.id || Date.now().toString();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO manga_items (id, type, title, chapterNumber, pagesCount, createdAt, updatedAt, thumbnailPath)
       VALUES (?, ?, ?, ?, ?, COALESCE(createdAt, ?), ?, thumbnailPath)`,
      [id, item.type, item.title, item.chapterNumber, item.pagesCount, item.createdAt || now, now, item.thumbnailPath]
    );
    return { ...item, id, updatedAt: now } as MangaItem;
  }

  async delete(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM manga_items WHERE id = ?', [id]);
  }

  // Export/Import JSON
  async exportJSON(): Promise<string> {
    const all = await this.db.getAllAsync<MangaItem>('SELECT * FROM manga_items');
    return JSON.stringify(all, null, 2);
  }

  async importJSON(json: string): Promise<void> {
    const items: MangaItem[] = JSON.parse(json);
    await this.db.withTransactionAsync(async () => {
      for (const item of items) await this.save(item);
    });
  }
}