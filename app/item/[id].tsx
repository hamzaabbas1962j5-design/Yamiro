// app/item/[id].tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMangaStore } from '../../../store/useMangaStore';
import { MangaItem } from '../../../types/models';
import Card from '../../../components/Card';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ItemDetail: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { drafts, finished, covers, moveDraftToFinished, delete: removeItem } = useMangaStore();
  const [item, setItem] = useState<MangaItem | null>(null);

  useEffect(() => {
    const foundItem = [...drafts, ...finished, ...covers].find(item => item.id === id);
    setItem(foundItem || null);
  }, [id, drafts, finished, covers]);

  const handleMoveToFinished = useCallback(() => {
    if (!item || item.type !== 'draft') return;
    Alert.alert(
      'نقل إلى المكتملة',
      `هل تريد نقل "${item.title}" إلى قسم المكتملة؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'نقل', onPress: () => {
          moveDraftToFinished(item.id);
          router.back();
        }}
      ]
    );
  }, [item, moveDraftToFinished]);

  const handleDelete = useCallback(() => {
    if (!item) return;
    Alert.alert(
      'حذف العنصر',
      `هل أنت متأكد من حذف "${item.title}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            // تنفيذ الحذف عبر store
            router.back();
          }
        }
      ]
    );
  }, [item]);

  if (!item) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="document-outline" size={80} color="#ccc" />
        <Text style={styles.notFoundText}>العنصر غير موجود</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerRight}>
            {item.type === 'draft' && (
              <TouchableOpacity style={styles.actionButton} onPress={handleMoveToFinished}>
                <Ionicons name="checkmark-circle-outline" size={28} color="#4CAF50" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={28} color="#f44336" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Thumbnail */}
        {item.thumbnailPath ? (
          <Image source={{ uri: item.thumbnailPath }} style={styles.thumbnail} />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons name="image-outline" size={80} color="#ccc" />
            <Text style={styles.placeholderText}>لا توجد صورة مصغرة</Text>
          </View>
        )}

        {/* Content */}
        <View style={styles.contentCard}>
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, { backgroundColor: item.type === 'draft' ? '#FF9800' : item.type === 'finished' ? '#4CAF50' : '#2196F3' }]}>
              <Text style={styles.badgeText}>{item.type === 'draft' ? 'مسودة' : item.type === 'finished' ? 'مكتمل' : 'غلاف'}</Text>
            </View>
          </View>

          <Text style={styles.title}>{item.title}</Text>
          
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="book-outline" size={20} color="#666" />
              <Text style={styles.infoLabel}>رقم الفصل</Text>
              <Text style={styles.infoValue}>{item.chapterNumber}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="layers-outline" size={20} color="#666" />
              <Text style={styles.infoLabel}>عدد الصفحات</Text>
              <Text style={styles.infoValue}>{item.pagesCount}</Text>
            </View>
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateItem}>
              <Ionicons name="time-outline" size={16} color="#666" />
              <Text style={styles.dateLabel}>إنشاء</Text>
              <Text style={styles.dateValue}>{new Date(item.createdAt).toLocaleDateString('ar-SA')}</Text>
            </View>
            <View style={styles.dateItem}>
              <Ionicons name="refresh-outline" size={16} color="#666" />
              <Text style={styles.dateLabel}>آخر تعديل</Text>
              <Text style={styles.dateValue}>{new Date(item.updatedAt).toLocaleDateString('ar-SA')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  notFoundText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  backButton: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a1a',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  thumbnail: {
    width: SCREEN_WIDTH,
    height: 250,
    resizeMode: 'cover',
  },
  thumbnailPlaceholder: {
    width: SCREEN_WIDTH,
    height: 250,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 16,
    color: '#999',
  },
  contentCard: {
    margin: 20,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  badgeContainer: {
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 20,
    lineHeight: 32,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  infoItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dateLabel: {
    fontSize: 14,
    color: '#999',
    marginRight: 8,
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
});

export default React.memo(ItemDetail);