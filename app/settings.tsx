// app/settings.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useMangaStore } from '../store/useMangaStore';

const SettingsScreen: React.FC = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { exportData } = useMangaStore();
  const [gridViewDefault, setGridViewDefault] = useState(true);

  const handleExport = async () => {
    try {
      const json = await exportData();
      if (await Sharing.isAvailableAsync()) {
        Sharing.shareAsync(`data:application/json,${encodeURIComponent(json)}`);
      }
    } catch (error) {
      Alert.alert('خطأ', 'فشل في التصدير');
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'حذف جميع البيانات',
      'هل أنت متأكد؟ سيتم حذف كل المسودات والأعمال والأغلفة نهائياً.',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف الكل', style: 'destructive' }
      ]
    );
  };

  const settings = [
    {
      icon: 'grid-outline',
      title: 'عرض افتراضي شبكي',
      description: 'استخدام عرض شبكي في الصفحة الرئيسية افتراضياً',
      renderRight: () => (
        <Switch value={gridViewDefault} onValueChange={setGridViewDefault} />
      ),
    },
    {
      icon: 'moon-outline',
      title: 'الوضع الداكن',
      description: 'تبديل تلقائي حسب إعدادات النظام',
      renderRight: () => (
        <Switch value={isDark} disabled />
      ),
    },
    {
      icon: 'download-outline',
      title: 'تصدير البيانات',
      description: 'حفظ نسخة احتياطية كـ JSON',
      onPress: handleExport,
    },
    {
      icon: 'upload-outline',
      title: 'استيراد بيانات',
      description: 'استعادة البيانات من ملف JSON',
      onPress: () => Alert.alert('قريباً', 'ميزة الاستيراد قريباً'),
    },
    {
      icon: 'trash-outline',
      title: 'حذف جميع البيانات',
      description: 'إفراغ التطبيق تماماً',
      onPress: handleClearAll,
      danger: true,
    },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: isDark ? '#121212' : '#f8f9fa' }]}>
      <View style={[styles.header, { backgroundColor: isDark ? '#1e1e1e' : '#fff' }]}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#1a1a1a' }]}>الإعدادات</Text>
      </View>

      <View style={styles.content}>
        {settings.map((setting, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.settingItem,
              { 
                backgroundColor: isDark ? '#1e1e1e' : '#fff',
                borderBottomColor: isDark ? '#333' : '#f0f0f0',
                ...(setting.danger && { borderLeftColor: '#f44336', borderLeftWidth: 4 })
              }
            ]}
            onPress={setting.onPress}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, setting.danger && styles.dangerIcon]}>
                <Ionicons name={setting.icon} size={24} color={setting.danger ? '#f44336' : '#ffd700'} />
              </View>
              <View>
                <Text style={[styles.settingTitle, { color: isDark ? '#fff' : '#1a1a1a' }]}>
                  {setting.title}
                </Text>
                <Text style={[styles.settingDescription, { color: isDark ? '#ccc' : '#666' }]}>
                  {setting.description}
                </Text>
              </View>
            </View>
            <View style={styles.settingRight}>
              {setting.renderRight ? setting.renderRight() : (
                <Ionicons name="chevron-forward" size={20} color={isDark ? '#666' : '#999'} />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.footer, { backgroundColor: isDark ? '#0f0f0f' : '#f8f9fa' }]}>
        <Text style={[styles.version, { color: isDark ? '#ccc' : '#999' }]}>
          Yamiro v1.0.0 | © 2026
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderRadius: 16,
    marginHorizontal: 12,
    marginVertical: 4,
  },
  settingLeft: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fff5e6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  dangerIcon: {
    backgroundColor: '#ffebee',
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
  },
  settingRight: {
    paddingLeft: 12,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  version: {
    fontSize: 14,
  },
});

export default SettingsScreen;