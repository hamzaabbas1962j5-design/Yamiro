// ========================================================================
// App.tsx — Entry Point
// Error Boundary · Theme · Navigation · Boot Recovery · Notification Hub
// ========================================================================

import React, { useEffect, useState, useCallback, useRef, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { View, Text, ActivityIndicator, StatusBar, Platform, TouchableOpacity } from 'react-native';
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
  recordAlarmEvent,
  Alarm,
  AlarmHistoryStatus,
  DismissChallenge,
  STORAGE_KEYS,
  validateAlarms,
} from './core';

import {
  ThemeContext,
  DarkTheme,
  AlarmsScreen,
  TimerScreen,
  PomodoroScreen,
  HistoryScreen,
  DismissChallengeModal,
} from './features';

// ── Configure notification behavior at module level ──
configureNotificationHandler();

// ── Error Boundary ──
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: DarkTheme.bg,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}
        >
          <Ionicons name="warning-outline" size={64} color={DarkTheme.danger} />
          <Text
            style={{
              color: DarkTheme.textPrimary,
              fontSize: 18,
              fontWeight: '600',
              marginTop: 20,
              textAlign: 'center',
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              color: DarkTheme.textSecondary,
              fontSize: 14,
              marginTop: 8,
              textAlign: 'center',
            }}
          >
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 24,
              backgroundColor: DarkTheme.primary,
              paddingHorizontal: 32,
              paddingVertical: 14,
              borderRadius: 24,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Navigation ──
const Tab = createBottomTabNavigator();

const NAV_THEME = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    notification: DarkTheme.primary,
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

// ── Root App ──
export default function App() {
  const [ready, setReady] = useState(false);
  const [challengeVisible, setChallengeVisible] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState(DismissChallenge.None);
  const [triggeredAlarmId, setTriggeredAlarmId] = useState<string | null>(null);

  const receivedSub = useRef<Notifications.Subscription | null>(null);
  const responseSub = useRef<Notifications.Subscription | null>(null);

  // ── Initialization ──
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const container = ServiceContainer.instance;
        await container.initialize();
        await performBootRecovery();
        await registerBackgroundTask();
      } catch (err) {
        console.error('[App] Initialization failed:', err);
      } finally {
        if (mounted) setReady(true);
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

  // ── Notification Listeners ──
  useEffect(() => {
    receivedSub.current = Notifications.addNotificationReceivedListener(async (notification) => {
      try {
        const data = notification.request.content.data as {
          alarmId?: string;
          type?: string;
        };

        if (data?.type !== 'alarm' || !data.alarmId) return;

        const container = ServiceContainer.instance;
        if (!container.ready) return;

        await container.sound.play(0.8, false);
        await container.sound.vibrate();

        const raw = await container.storage.load<unknown>(STORAGE_KEYS.ALARMS);
        const alarms = validateAlarms(raw ?? []);
        const alarm = alarms.find(a => a.id === data.alarmId);

        if (alarm && alarm.dismissChallenge !== DismissChallenge.None) {
          setTriggeredAlarmId(alarm.id);
          setActiveChallenge(alarm.dismissChallenge);
          setChallengeVisible(true);
        } else {
          // Auto-stop sound after 30 seconds if no challenge
          setTimeout(() => {
            try {
              container.sound.stop();
            } catch {
              // Non-critical
            }
          }, 30_000);
        }

        await recordAlarmEvent(
          data.alarmId,
          alarm?.label || 'Unknown',
          AlarmHistoryStatus.OnTime
        );
      } catch (err) {
        console.error('[App] notification handler error:', err);
      }
    });

    responseSub.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
      try {
        const container = ServiceContainer.instance;
        if (!container.ready) return;

        const data = response.notification.request.content.data as { alarmId?: string };
        if (data?.alarmId) {
          console.log('[App] Notification tapped for alarm:', data.alarmId);
        }
      } catch {
        // Non-critical
      }
    });

    return () => {
      receivedSub.current?.remove();
      responseSub.current?.remove();
    };
  }, []);

  // ── Challenge Dismiss ──
  const handleChallengeDismiss = useCallback(async () => {
    setChallengeVisible(false);
    setActiveChallenge(DismissChallenge.None);
    setTriggeredAlarmId(null);

    try {
      const container = ServiceContainer.instance;
      if (container.ready) {
        await container.sound.stop();
      }
    } catch (err) {
      console.error('[App] handleChallengeDismiss error:', err);
    }
  }, []);

  // ── Loading ──
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
        <Text style={{ color: DarkTheme.textSecondary, marginTop: 16, fontSize: 15 }}>
          Initializing...
        </Text>
      </View>
    );
  }

  // ── Main ──
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeContext.Provider value={DarkTheme}>
          <StatusBar barStyle="light-content" backgroundColor={DarkTheme.bg} translucent={false} />
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
                tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
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

          <DismissChallengeModal
            visible={challengeVisible}
            challenge={activeChallenge}
            onDismiss={handleChallengeDismiss}
          />
        </ThemeContext.Provider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}