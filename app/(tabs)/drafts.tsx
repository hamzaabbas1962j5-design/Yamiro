import { FlatList, View, Switch, Text } from 'react-native';
import { Card } from '../components/Card';
import { useMangaStore } from '../store/useMangaStore';
import { useState, useEffect } from 'react';

export default function Drafts() {
  const { drafts, load, moveDraftToFinished } = useMangaStore();
  const [gridView, setGridView] = useState(true);
  useEffect(() => { load(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#f0e68c', padding: 16 }}> {/* كهرماني خافت */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold' }}>المسودات</Text>
        <Switch value={gridView} onValueChange={setGridView} />
      </View>
      <FlatList
        data={drafts}
        numColumns={gridView ? 2 : 1}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card
            title={item.title}
            thumbnail={item.thumbnailPath}
            pages={item.pagesCount}
            updated={item.updatedAt}
            onComplete={() => moveDraftToFinished(item.id)}
            style={{ borderColor: '#ddd', shadowColor: '#aaa' }}
          />
        )}
      />
    </View>
  );
}