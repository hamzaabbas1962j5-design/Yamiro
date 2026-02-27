import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Storage } from 'expo-sqlite/kv-store'; // KV-store
import { MangaRepository } from '../lib/repository';
import { MangaItem } from '../types/models';

interface State {
  drafts: MangaItem[];
  finished: MangaItem[];
  covers: MangaItem[];
  repo: MangaRepository;
  load: () => Promise<void>;
  add: (item: Omit<MangaItem, 'id'>) => Promise<void>;
  moveDraftToFinished: (id: string, newChapter?: number) => Promise<void>;
  reorderFinished: (from: number, to: number) => Promise<void>;
  exportData: () => Promise<string>;
  importData: (json: string) => Promise<void>;
}

export const useMangaStore = create<State>()(
  persist(
    (set, get) => ({
      drafts: [], finished: [], covers: [],
      repo: new MangaRepository(),
      async load() {
        const [drafts, finished, covers] = await Promise.all([
          get().repo.getByType('draft'),
          get().repo.getByType('finished'),
          get().repo.getByType('cover')
        ]);
        set({ drafts, finished, covers });
      },
      async add(item) {
        const newItem = await get().repo.save(item);
        set((state) => ({
          [item.type + 's']: [newItem, ...state[item.type + 's' as keyof State] as MangaItem[]]
        }));
      },
      async moveDraftToFinished(id, newChapter) {
        const draft = get().drafts.find(d => d.id === id);
        if (!draft) return;
        const updated = await get().repo.save({ ...draft, type: 'finished' as const, chapterNumber: newChapter ?? draft.chapterNumber });
        set((state) => ({
          drafts: state.drafts.filter(d => d.id !== id),
          finished: [updated, ...state.finished.filter(f => f.id !== id)]
        }));
      },
      async reorderFinished(from, to) {
        const finished = [...get().finished];
        const [moved] = finished.splice(from, 1);
        finished.splice(to, 0, moved);
        // Update chapters sequentially
        for (let i = 0; i < finished.length; i++) {
          await get().repo.save({ ...finished[i], chapterNumber: i + 1 });
        }
        set({ finished });
      },
      async exportData() { return await get().repo.exportJSON(); },
      async importData(json) { await get().repo.importJSON(json); await get().load(); }
    }),
    {
      name: 'manga-storage',
      storage: createJSONStorage(() => Storage), // Persist مع SQLite KV[web:7]
      partialize: (state) => ({ drafts: state.drafts, finished: state.finished, covers: state.covers })
    }
  )
);