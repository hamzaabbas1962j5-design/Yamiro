import { FlatList } from 'react-native';
import Reanimated from 'react-native-reanimated'; // للـ drag
import DraggableFlatList from 'react-native-draggable-flatlist'; // أضف الحزمة إذا لزم
// أو استخدم GestureHandler لـ reorder
import { useMangaStore } from '../store/useMangaStore';

export default function Finished() {
  const { finished, reorderFinished, load } = useMangaStore();
  // ...

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <DraggableFlatList
        data={finished}
        renderItem={({ item, drag }) => (
          <Card
            {...item}
            onLongPress={drag}
            chapter={item.chapterNumber}
            style={{ margin: 8, borderRadius: 16, shadowOpacity: 0.3 }}
          />
        )}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }) => {
          const from = data.previousIndex;
          const to = data.data.length - 1 - data.currentIndex; // حساب
          reorderFinished(from, to);
        }}
      />
    </View>
  );
}