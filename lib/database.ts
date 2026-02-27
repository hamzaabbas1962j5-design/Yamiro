import * as SQLite from 'expo-sqlite';
import { SQLiteProvider } from 'expo-sqlite';

const DB_NAME = 'yamiro.db';

export async function initDB(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS manga_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      chapterNumber INTEGER NOT NULL,
      pagesCount INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      thumbnailPath TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_type_updated ON manga_items(type, updatedAt);
  `);
}

// في app/_layout.tsx الجذر:
<SQLiteProvider databaseName={DB_NAME} onInit={initDB}>
  {/* App */}
</SQLiteProvider>