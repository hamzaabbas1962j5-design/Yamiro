// ========================================================================
// App.tsx — Entry Point
// Theme Provider · Navigation · Boot Recovery · Notification Listeners
// ========================================================================

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

import {
  ServiceContainer,
  configureNotificationHandler,
  registerBackgroundTask,
  performBootRecovery,
  Alarm,
  AlarmHistoryStatus,
  STORAGE_KEYS,
  generateId,
} from './core';

import {
  ThemeContext,
  DarkTheme,
  AlarmsScreen,
  TimerScreen,
  PomodoroScreen,
  HistoryScreen,
  DismissChallengeModal,
  DismissChallenge,
} from './features';

// ─── Configure notification behavior (called once at module level) ───
configureNotificationHandler();

// ─── Navigation ───
const Tab = createBottomTabNavigator();

const NAV_THEME = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: DarkTheme.bg,
    card: DarkTheme.surface,
    text: DarkTheme.textPrimary,
    border: DarkTheme.glassBorder,
    primary: DarkTheme.primary,
  },
};

type TabIconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: TabIconName; inactive: TabIconName }> = {
  Alarms: { active: 'alarm', inactive: 'alarm-outline' },
  Timer: { active: 'timer', inactive: 'timer-outline' },
  Pomodoro: { active: 'cafe', inactive: 'cafe-outline' },
  History: { active: 'analytics', inactive: 'analytics-outline' },
};

// ─── Root App Component ───
export default function App() {
  const [ready, setReady] = useState(false);
  const [challengeVisible, setChallengeVisible] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState(DismissChallenge.None);
  const [triggeredAlarmId, setTriggeredAlarmId] = useState<string | null>(null);

  // Refs for notification subscriptions — cleaned up on unmount
  const receivedSub = useRef<Notifications.Subscription | null>(null);
  const responseSub = useRef<Notifications.Subscription | null>(null);

  // ── Initialization ──
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const container = ServiceContainer.instance;
        await container.initialize();

        // Boot recovery: reschedule all persisted alarms
        await performBootRecovery();

        // Register background task for alarm rescheduling on reboot
        await registerBackgroundTask();
      } catch (err) {
        console.error('[App] Initialization failed:', err);
      } finally {
        if (mounted) setReady(true);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  // ── Notification Listeners ──
  useEffect(() => {
    // When a notification is received while app is in foreground
    receivedSub.current = Notifications.addNotificationReceivedListener(
      async (notification) => {
        const data = notification.request.content.data as {
          alarmId?: string;
          type?: string;
        };

        if (data?.type === 'alarm' && data.alarmId) {
          const container = ServiceContainer.instance;

          // Play sound & vibrate
          await container.sound.play(0.8, false);
          await container.sound.vibrate();

          // Load alarm to check for dismiss challenge
          const alarms = await container.storage.load<Alarm[]>(STORAGE_KEYS.ALARMS);
          const alarm = alarms?.find(a => a.id === data.alarmId);

          if (alarm && alarm.dismissChallenge !== DismissChallenge.None) {
            setTriggeredAlarmId(alarm.id);
            setActiveChallenge(alarm.dismissChallenge);
            setChallengeVisible(true);
          } else {
            // No challenge → auto-stop after brief moment
            setTimeout(() => container.sound.stop(), 30_000);
          }

          // Record history entry
          const entry = {
            id: generateId(),
            alarmId: data.alarmId,
            alarmLabel: alarm?.label || 'Unknown',
            scheduledTime: Date.now(),
            actualTime: Date.now(),
            status: AlarmHistoryStatus.OnTime,
            snoozeCount: 0,
          };
          const history = (await container.storage.load<Array<typeof entry>>(
            STORAGE_KEYS.HISTORY
          )) || [];
          await container.storage.save(STORAGE_KEYS.HISTORY, [
            entry,
            ...history,
          ].slice(0, 500));
        }
      }
    );

    // When user taps on a notification
    responseSub.current =
      Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          const data = response.notification.request.content.data as {
            alarmId?: string;
          };
          if (data?.alarmId) {
            // Could navigate to alarm or show challenge
            console.log('[App] Notification tapped for alarm:', data.alarmId);
          }
        }
      );

    // Cleanup subscriptions to prevent memory leaks
    return () => {
      receivedSub.current?.remove();
      responseSub.current?.remove();
    };
  }, []);

  // ── Challenge Dismiss Handler ──
  const handleChallengeDismiss = useCallback(async () => {
    setChallengeVisible(false);
    setActiveChallenge(DismissChallenge.None);
    setTriggeredAlarmId(null);

    // Stop alarm sound
    const container = ServiceContainer.instance;
    await container.sound.stop();
  }, []);

  // ── Loading Screen ──
  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: DarkTheme.bg,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={DarkTheme.primary} />
        <Text
          style={{
            color: DarkTheme.textSecondary,
            marginTop: 16,
            fontSize: 15,
          }}
        >
          Initializing...
        </Text>
      </View>
    );
  }

  // ── Main App ──
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeContext.Provider value={DarkTheme}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={DarkTheme.bg}
          translucent={false}
        />
        <NavigationContainer theme={NAV_THEME}>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor: DarkTheme.primary,
              tabBarInactiveTintColor: DarkTheme.textMuted,
              tabBarStyle: {
                backgroundColor: DarkTheme.surface,
                borderTopColor: DarkTheme.glassBorder,
                borderTopWidth: 1,
                paddingBottom: Platform.OS === 'ios' ? 24 : 8,
                paddingTop: 8,
                height: Platform.OS === 'ios' ? 88 : 64,
              },
              tabBarLabelStyle: {
                fontSize: 11,
                fontWeight: '500',
              },
              tabBarIcon: ({ focused, color, size }) => {
                const icons = TAB_ICONS[route.name];
                if (!icons) return null;
                return (
                  <Ionicons
                    name={focused ? icons.active : icons.inactive}
                    size={size}
                    color={color}
                  />
                );
              },
            })}
          >
            <Tab.Screen name="Alarms" component={AlarmsScreen} />
            <Tab.Screen name="Timer" component={TimerScreen} />
            <Tab.Screen name="Pomodoro" component={PomodoroScreen} />
            <Tab.Screen name="History" component={HistoryScreen} />
          </Tab.Navigator>
        </NavigationContainer>

        {/* Global dismiss challenge overlay */}
        <DismissChallengeModal
          visible={challengeVisible}
          challenge={activeChallenge}
          onDismiss={handleChallengeDismiss}
        />
      </ThemeContext.Provider>
    </GestureHandlerRootView>
  );
}
