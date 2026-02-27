// app/(tabs)/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  Modal,
  TextInput,
  Switch,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useMangaStore } from '../../../store/useMangaStore';
import { MangaItem } from '../../../types/models';
import Card from '../../../components/Card';
import FloatingButton from '../../../components/FloatingButton';
import SectionHeader from '../../../components/SectionHeader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 16;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 3) / 2;

const IndexScreen: React.FC = () => {
  const router = useRouter();
  const {
    drafts,
    finished,
    covers,
    load,
    add,
    exportData,
    importData,
  } = useMangaStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isGridView, setIsGridView] = useState(true);
  const [newItem, setNewItem] = useState({
    type: 'draft' as MangaItem['type'],
    title: '',
    chapterNumber: 1,
    pagesCount: 0,
    thumbnailPath: '',
  });
  const [exportJson, setExportJson] = useState('');

  useEffect(() => {
    load();
  }, []);

  const handleImagePick = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setNewItem(prev => ({ ...prev, thumbnailPath: result.assets[0].uri }));
    }
  }, []);

  const handleAddItem = useCallback(async () => {
    if (!newItem.title.trim() || newItem.pagesCount === 0) {
      Alert.alert('خطأ', 'يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      await add({
        ...newItem,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setNewItem({ type: 'draft', title: '', chapterNumber: 1, pagesCount: 0, thumbnailPath: '' });
      setShowAddModal(false);
      Alert.alert('نجح', 'تم إضافة العنصر بنجاح');
    } catch (error) {
      Alert.alert('خطأ', 'حدث خطأ أثناء الحفظ');
    }
  }, [newItem, add]);

  const handleExport = useCallback(async () => {
    try {
      const json = await exportData();
      setExportJson(json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(new Blob([json]).uri);
      }
    } catch (error) {
      Alert.alert('خطأ', 'فشل في التصدير');
    }
  }, [exportData]);

  const handleImport = useCallback(() => {
    Alert.alert(
      'استيراد بيانات',
      'سيتم استبدال جميع البيانات الحالية. هل أنت متأكد؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'استيراد',
          onPress: async () => {
            // هنا يمكن إضافة file picker للـ JSON
            Alert.alert('قريباً', 'ميزة الاستيراد من ملف قريباً');
          },
        },
      ]
    );
  }, [importData]);

  const renderSection = useCallback((section: { title: string; data: MangaItem[]; type: MangaItem['type'] }) => (
    <View style={styles.section}>
      <SectionHeader title={section.title} count={section.data.length} />
      <FlatList
        data={section.data.slice(0, 6)} // عرض 6 أولى فقط
        numColumns={isGridView ? 2 : 1}
        keyExtractor={(item) => item.id}
        key={isGridView ? 'grid' : 'list'}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[
              styles.cardContainer,
              isGridView && { width: CARD_WIDTH, marginBottom: 12 }
            ]}
            onPress={() => router.push(`/item/${item.id}`)}
          >
            <Card
              title={item.title}
              thumbnail={item.thumbnailPath}
              pages={item.pagesCount}
              chapter={item.chapterNumber}
              updated={item.updatedAt}
              type={item.type}
              style={isGridView ? styles.gridCard : styles.listCard}
            />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>لا توجد {section.title.toLowerCase()}</Text>
          </View>
        }
        columnWrapperStyle={isGridView ? styles.gridRow : undefined}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      {section.data.length > 6 && (
        <TouchableOpacity style={styles.viewAllButton}>
          <Text style={styles.viewAllText}>عرض الكل ({section.data.length})</Text>
          <Ionicons name="chevron-forward" size={20} color="#ffd700" />
        </TouchableOpacity>
      )}
    </View>
  ), [isGridView, router]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Yamiro</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setShowSettingsModal(true)}>
            <Ionicons name="settings-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* View Toggle */}
      <View style={styles.toggleContainer}>
        <Text style={styles.toggleLabel}>عرض شبكي</Text>
        <Switch value={isGridView} onValueChange={setIsGridView} trackColor={{ true: '#ffd700' }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {renderSection({
          title: 'المسودات',
          data: drafts,
          type: 'draft'
        })}
        {renderSection({
          title: 'المكتملة',
          data: finished,
          type: 'finished'
        })}
        {renderSection({
          title: 'الأغلفة',
          data: covers,
          type: 'cover'
        })}
      </ScrollView>

      {/* Floating Action Button */}
      <FloatingButton
        icon="add"
        onPress={() => setShowAddModal(true)}
        style={styles.fab}
      />

      {/* Add Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>إضافة جديد</Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={28} color="#666" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>النوع</Text>
              <View style={styles.typeSelector}>
                {(['draft', 'finished', 'cover'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      newItem.type === type && styles.typeButtonActive
                    ]}
                    onPress={() => setNewItem(prev => ({ ...prev, type }))}
                  >
                    <Text style={[
                      styles.typeButtonText,
                      newItem.type === type && styles.typeButtonTextActive
                    ]}>
                      {type === 'draft' ? 'مسودة' : type === 'finished' ? 'مكتمل' : 'غلاف'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>العنوان</Text>
              <TextInput
                style={styles.input}
                value={newItem.title}
                onChangeText={text => setNewItem(prev => ({ ...prev, title: text }))}
                placeholder="اسم الفصل أو المشروع"
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>رقم الفصل</Text>
                <TextInput
                  style={styles.input}
                  value={newItem.chapterNumber.toString()}
                  onChangeText={text => setNewItem(prev => ({ ...prev, chapterNumber: parseInt(text) || 1 }))}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>عدد الصفحات</Text>
                <TextInput
                  style={styles.input}
                  value={newItem.pagesCount.toString()}
                  onChangeText={text => setNewItem(prev => ({ ...prev, pagesCount: parseInt(text) || 0 }))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <TouchableOpacity style={styles.imageButton} onPress={handleImagePick}>
              <Ionicons name={newItem.thumbnailPath ? 'image-checkmark' : 'image-outline'} size={24} color="#ffd700" />
              <Text style={styles.imageButtonText}>
                {newItem.thumbnailPath ? 'صورة مختارة' : 'اختيار صورة مصغرة'}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddModal(false)}>
              <Text style={styles.cancelButtonText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleAddItem}>
              <Text style={styles.saveButtonText}>حفظ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettingsModal} animationType="fade" transparent>
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>الإعدادات</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Ionicons name="close" size={28} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.settingsContent}>
              <TouchableOpacity style={styles.settingsButton} onPress={handleExport}>
                <Ionicons name="download-outline" size={24} color="#ffd700" />
                <Text style={styles.settingsButtonText}>تصدير البيانات</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.settingsButton} onPress={handleImport}>
                <Ionicons name="upload-outline" size={24} color="#ffd700" />
                <Text style={styles.settingsButtonText}>استيراد بيانات</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.settingsButton}>
                <Ionicons name="trash-outline" size={24} color="#ff4444" />
                <Text style={[styles.settingsButtonText, { color: '#ff4444' }]}>حذف جميع البيانات</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#1a1a1a',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffd700',
  },
  headerActions: {
    flexDirection: 'row',
  },
  iconButton: {
    padding: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  cardContainer: {
    marginBottom: 12,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  gridCard: {
    height: 200,
  },
  listCard: {
    marginHorizontal: 4,
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  viewAllButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    marginTop: 8,
  },
  viewAllText: {
    fontSize: 16,
    color: '#666',
    marginRight: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 4,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeButtonActive: {
    backgroundColor: '#ffd700',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#1a1a1a',
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 2,
    borderColor: '#ffd700',
    borderRadius: 12,
    borderStyle: 'dashed',
    backgroundColor: '#fff8e1',
  },
  imageButtonText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#ffd700',
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: '#ffd700',
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsModal: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 20,
    maxHeight: '80%',
    maxWidth: '90%',
  },
  settingsContent: {
    paddingBottom: 20,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginHorizontal: 20,
    marginVertical: 4,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  settingsButtonText: {
    marginLeft: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});

export default React.memo(IndexScreen);