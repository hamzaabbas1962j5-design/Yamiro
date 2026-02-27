import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' },
        tabBarActiveTintColor: '#ffd700',
        headerShown: false,
      }}>
      <Tabs.Screen name="drafts" options={{
        title: 'المسودات',
        tabBarIcon: ({ color }) => <Ionicons name="create-outline" size={24} color={color} />,
        tabBarStyle: { backgroundColor: '#f5f5f5' } // رمادي خافت للمسودات
      }} />
      <Tabs.Screen name="finished" options={{
        title: 'المكتملة',
        tabBarIcon: ({ color }) => <Ionicons name="checkmark-circle-outline" size={24} color={color} />,
        tabBarStyle: { backgroundColor: '#0f0f0f' } // داكن احترافي
      }} />
      <Tabs.Screen name="covers" options={{
        title: 'الأغلفة',
        tabBarIcon: ({ color }) => <Ionicons name="image-outline" size={24} color={color} />,
      }} />
    </Tabs>
  );
}