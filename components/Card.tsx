// components/Card.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FastImage from 'react-native-fast-image'; // أضفها إذا أمكن، أو استخدم Image عادي
import { MangaItem } from '../types/models';

interface CardProps {
  title: string;
  thumbnail?: string;
  pages?: number;
  chapter?: number;
  updated?: string;
  type?: MangaItem['type'];
  onPress?: () => void;
  onComplete?: () => void;
  style?: object;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const Card: React.FC<CardProps> = React.memo(({
  title,
  thumbnail,
  pages,
  chapter,
  updated,
  type = 'draft',
  onPress,
  onComplete,
  style,
}) => {
  const getTypeColor = () => {
    switch (type) {
      case 'draft': return '#FF9800';
      case 'finished': return '#4CAF50';
      case 'cover': return '#2196F3';
      default: return '#666';
    }
  };

  return (
    <TouchableOpacity style={[styles.card, style]} onPress={onPress} activeOpacity={0.9}>
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {thumbnail ? (
          <FastImage
            source={{ uri: thumbnail }}
            style={styles.thumbnail}
            resizeMode={FastImage.resizeMode.cover}
          />
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: '#f0f0f0' }]}>
            <Ionicons name="image-outline" size={32} color="#ccc" />
          </View>
        )}
        {onComplete && (
          <TouchableOpacity style={styles.completeButton} onPress={onComplete}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={[styles.typeBadge, { backgroundColor: getTypeColor() + '20' }]}>
          <Text style={[styles.typeText, { color: getTypeColor() }]}>{type}</Text>
        </View>
        
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        
        {chapter !== undefined && (
          <View style={styles.chapterContainer}>
            <Ionicons name="book-outline" size={16} color="#666" />
            <Text style={styles.chapterText}>فصل {chapter}</Text>
          </View>
        )}
        
        {pages !== undefined && (
          <View style={styles.pagesContainer}>
            <Ionicons name="layers-outline" size={16} color="#666" />
            <Text style={styles.pagesText}>{pages} صفحة</Text>
          </View>
        )}
        
        {updated && (
          <Text style={styles.updatedText}>
            آخر تعديل: {new Date(updated).toLocaleDateString('ar-SA', { 
              month: 'short', day: 'numeric' 
            })}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
    marginBottom: 12,
  },
  thumbnailContainer: {
    position: 'relative',
    height: 160,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    borderRadius: 20,
    padding: 4,
  },
  content: {
    padding: 16,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    lineHeight: 22,
    marginBottom: 8,
  },
  chapterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  chapterText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  pagesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pagesText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#666',
  },
  updatedText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
});

Card.displayName = 'Card';

export default Card;