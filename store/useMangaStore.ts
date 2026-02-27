// store/useMangaStore.ts
import { create } from 'zustand';
import { MangaItem, MangaType } from '../types/models';
import { MangaRepository } from '../lib/repository';

const repo = new MangaRepository();

type TypeKey = 'drafts' | 'finished' | 'covers';

interface MangaStore {
  drafts: MangaItem[];
  finished: MangaItem[];
  covers: MangaItem[];

  load: () => Promise<void>;
  add: (item: MangaItem) => Promise<void>;
  remove: (id: string) => Promise<void>;
  moveDraftToFinished: (id: string) => Promise<void>;

  getItemById: (id: string) => MangaItem | undefined;

  exportData: () => Promise<string>;
  importData: (json: string) => Promise<void>;
}

function getTypeKey(type: MangaType): TypeKey {
  if (type === 'draft') return 'drafts';
  if (type === 'finished') return 'finished';
  return 'covers';
}

export const useMangaStore = create<MangaStore>((set, get) => ({

  drafts: [],
  finished: [],
  covers: [],

  // تحميل من SQLite
  load: async () => {
    const items = await repo.getAll();

    set({
      drafts: items.filter(i => i.type === 'draft'),
      finished: items
        .filter(i => i.type === 'finished')
        .sort((a, b) => a.chapterNumber - b.chapterNumber),
      covers: items.filter(i => i.type === 'cover'),
    });
  },

  // إضافة عنصر
  add: async (item) => {
    await repo.save(item);

    const key = getTypeKey(item.type);

    set((state) => ({
      [key]: [...state[key], item],
    }));
  },

  // حذف عنصر
  remove: async (id) => {
    const { drafts, finished, covers } = get();
    const all = [...drafts, ...finished, ...covers];
    const item = all.find(i => i.id === id);
    if (!item) return;

    await repo.delete(id);

    const key = getTypeKey(item.type);

    set((state) => ({
      [key]: state[key].filter(i => i.id !== id),
    }));
  },

  // نقل مسودة إلى مكتمل
  moveDraftToFinished: async (id) => {
    const { drafts, finished } = get();
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;

    const nextChapter =
      finished.length > 0
        ? Math.max(...finished.map(f => f.chapterNumber)) + 1
        : 1;

    const updated: MangaItem = {
      ...draft,
      type: 'finished',
      chapterNumber: nextChapter,
      updatedAt: Date.now(),
    };

    await repo.save(updated);

    set((state) => ({
      drafts: state.drafts.filter(d => d.id !== id),
      finished: [...state.finished, updated].sort(
        (a, b) => a.chapterNumber - b.chapterNumber
      ),
    }));
  },

  // البحث عن عنصر
  getItemById: (id) => {
    const { drafts, finished, covers } = get();
    return [...drafts, ...finished, ...covers].find(i => i.id === id);
  },

  // تصدير
  exportData: async () => {
    const items = await repo.getAll();
    return JSON.stringify(items);
  },

  // استيراد
  importData: async (json) => {
    const items: MangaItem[] = JSON.parse(json);

    for (const item of items) {
      await repo.save(item);
    }

    await get().load();
  },

}));