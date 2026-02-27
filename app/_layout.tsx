// app/_layout.tsx
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { initDB } from '../lib/database';
import { useMangaStore } from '../store/useMangaStore';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';

SplashScreen.preventAutoHideAsync();

const DB_NAME = 'yamiro.db';

export default function RootLayout() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const loadData = useMangaStore(state => state.load);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // تهيئة قاعدة البيانات
        const db = await import('expo-sqlite').then(({ default: SQLite }) => 
          SQLite.openDatabaseAsync(DB_NAME)
        );
        await initDB(db);
        setDbInitialized(true);
        
        // تحميل البيانات
        await loadData();
      } catch (error) {
        console.error('خطأ في تهيئة التطبيق:', error);
      } finally {
        await SplashScreen.hideAsync();
      }
    };

    initializeApp();
  }, []);

  if (!dbInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' }}>
        <Text style={{ color: '#ffd700', fontSize: 18, fontWeight: 'bold' }}>Yamiro</Text>
      </View>
    );
  }

  return (
    <SQLiteProvider databaseName={DB_NAME}>
      <StatusBar style="light" backgroundColor="#1a1a1a" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade_from_bottom',
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="item/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="help" options={{ headerShown: true, title: 'المساعدة' }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'الإعدادات' }} />
      </Stack>
    </SQLiteProvider>
  );
}