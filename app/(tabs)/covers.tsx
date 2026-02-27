import { FlatList, Dimensions } from 'react-native';
import Masonry from 'react-native-masonry-gallery'; // أو custom Flexbox grid[web:15]

export default function Covers() {
  const { covers } = useMangaStore();
  const { width } = Dimensions.get('window');
  // ...

  return (
    <FlatList
      data={covers}
      numColumns={2}
      columnWrapperStyle={{ justifyContent: 'space-between' }}
      renderItem={({ item }) => (
        <View style={{ width: (width - 48)/2, margin: 4 }}>
          <Card thumbnail={item.thumbnailPath} chapter={item.chapterNumber} dimensions="W: 200x H: 300" />
        </View>
      )}
    />
  );
}