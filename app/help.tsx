// app/help.tsx
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const HelpScreen: React.FC = () => {
  const router = useRouter();

  const helpSections = [
    {
      title: 'المسودات 📝',
      description: 'احفظ أعمالك غير المكتملة مع تتبع التقدم والتعديلات. انقلها للمكتملة بضغطة واحدة.',
    },
    {
      title: 'المكتملة ✅',
      description: 'رتب أعمالك المنتهية بترقيم تلقائي وسحب وإفلات. عرض احترافي مع صور مصغرة.',
    },
    {
      title: 'الأغلفة 🖼️',
      description: 'شبكة أغلفة متجاوبة مع ربط بالفصول وبيانات وصفية كاملة.',
    },
    {
      title: 'النسخ الاحتياطي 💾',
      description: 'تصدير واستيراد البيانات كـ JSON للنسخ الاحتياطي أو النقل بين الأجهزة.',
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>دليل المستخدم</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {helpSections.map((section, index) => (
          <View key={index} style={styles.helpCard}>
            <View style={styles.iconContainer}>
              <Ionicons name="help-circle-outline" size={32} color="#ffd700" />
            </View>
            <View style={styles.helpTextContainer}>
              <Text style={styles.helpTitle}>{section.title}</Text>
              <Text style={styles.helpDescription}>{section.description}</Text>
            </View>
          </View>
        ))}

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>💡 نصيحة</Text>
          <Text style={styles.tipText}>
            استخدم زر العائم (+) لإضافة عناصر جديدة بسرعة. الصفحة الرئيسية تعرض نظرة عامة سريعة.
          </Text>
        </View>

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>🎨 التصميم</Text>
          <Text style={styles.tipText}>
            التبديل بين العرض الشبكي والقائمي متاح في الصفحة الرئيسية. جميع العناصر مدعومة بالـ Dark Mode تلقائياً.
          </Text>
        </View>
      </View>
    </ScrollView>
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
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    padding: 20,
  },
  helpCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#fff5e6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  helpTextContainer: {
    flex: 1,
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  helpDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  tipCard: {
    backgroundColor: '#e3f2fd',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  tipTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 16,
    color: '#1565c0',
    lineHeight: 22,
  },
});

export default HelpScreen;