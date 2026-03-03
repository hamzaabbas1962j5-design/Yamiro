 // ========================================================================
// features.ts — Presentation Layer
// Custom Hooks · UI Components · Screens
// Separated from domain via hook boundaries; no direct storage/notification calls.
// ========================================================================

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  memo,
  createContext,
  useContext,
  useReducer,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  ScrollView,
  Switch,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  ListRenderItemInfo,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import {
  GestureHandlerRootView,
  Swipeable,
  RectButton,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import {
  Alarm,
  AlarmTime,
  AlarmHistoryEntry,
  AlarmHistoryStatus,
  TimerState,
  PomodoroState,
  PomodoroPhase,
  RepeatMode,
  DismissChallenge,
  ServiceContainer,
  STORAGE_KEYS,
  createDefaultAlarm,
  createDefaultTimer,
  createDefaultPomodoro,
  formatAlarmTime,
  formatSeconds,
  getTimeUntilAlarm,
  getRepeatLabel,
  generateMathChallenge,
  generateMemoryPattern,
  computeComplianceRate,
  generateId,
} from './core';

// ────────────────────────────────────────────
// THEME SYSTEM
// ────────────────────────────────────────────

export interface Theme {
  bg: string;
  surface: string;
  surfaceLight: string;
  glassBg: string;
  glassBorder: string;
  primary: string;
  primaryDim: string;
  accent: string;
  danger: string;
  success: string;
  warning: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  spacing: (factor: number) => number;
}

export const DarkTheme: Theme = {
  bg: '#0A0E1A',
  surface: '#121828',
  surfaceLight: '#1A2236',
  glassBg: 'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
  primary: '#6C63FF',
  primaryDim: 'rgba(108,99,255,0.15)',
  accent: '#00D4AA',
  danger: '#FF4757',
  success: '#2ED573',
  warning: '#FFA502',
  textPrimary: '#EAEAFF',
  textSecondary: '#8B8DA3',
  textMuted: '#4A4D65',
  spacing: (f: number) => f * 8, // 8pt grid
};

export const ThemeContext = createContext<Theme>(DarkTheme);
export const useTheme = (): Theme => useContext(ThemeContext);

// ────────────────────────────────────────────
// TYPOGRAPHY HELPERS
// ────────────────────────────────────────────

const FONT = Platform.OS === 'ios' ? 'System' : 'Roboto';

const typo = {
  h1: { fontFamily: FONT, fontSize: 32, fontWeight: '700' as const },
  h2: { fontFamily: FONT, fontSize: 24, fontWeight: '700' as const },
  h3: { fontFamily: FONT, fontSize: 18, fontWeight: '600' as const },
  body: { fontFamily: FONT, fontSize: 15, fontWeight: '400' as const },
  caption: { fontFamily: FONT, fontSize: 12, fontWeight: '400' as const },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 48, fontWeight: '300' as const },
};

// ────────────────────────────────────────────
// PRESENTATION HOOKS — useAlarms
// ────────────────────────────────────────────

type AlarmsAction =
  | { type: 'SET'; alarms: Alarm[] }
  | { type: 'ADD'; alarm: Alarm }
  | { type: 'UPDATE'; alarm: Alarm }
  | { type: 'REMOVE'; id: string }
  | { type: 'TOGGLE'; id: string };

const alarmsReducer = (state: Alarm[], action: AlarmsAction): Alarm[] => {
  switch (action.type) {
    case 'SET':
      return action.alarms;
    case 'ADD':
      return [...state, action.alarm];
    case 'UPDATE':
      return state.map(a => (a.id === action.alarm.id ? action.alarm : a));
    case 'REMOVE':
      return state.filter(a => a.id !== action.id);
    case 'TOGGLE':
      return state.map(a =>
        a.id === action.id ? { ...a, enabled: !a.enabled, updatedAt: Date.now() } : a
      );
    default:
      return state;
  }
};

export const useAlarms = () => {
  const [alarms, dispatch] = useReducer(alarmsReducer, []);
  const [loading, setLoading] = useState(true);
  const container = useMemo(() => ServiceContainer.instance, []);

  // Load on mount
  useEffect(() => {
    (async () => {
      const stored = await container.storage.load<Alarm[]>(STORAGE_KEYS.ALARMS);
      if (stored) dispatch({ type: 'SET', alarms: stored });
      setLoading(false);
    })();
  }, [container]);

  // Persist on change
  const persist = useCallback(
    async (updated: Alarm[]) => {
      await container.storage.save(STORAGE_KEYS.ALARMS, updated);
    },
    [container]
  );

  const addAlarm = useCallback(
    async (alarm: Alarm) => {
      const scheduled = await container.scheduler.scheduleAlarm(alarm);
      dispatch({ type: 'ADD', alarm: scheduled });
      // Need to persist after dispatch, compute next state
      const next = [...alarms, scheduled];
      await persist(next);
    },
    [container, alarms, persist]
  );

  const updateAlarm = useCallback(
    async (alarm: Alarm) => {
      const scheduled = alarm.enabled
        ? await container.scheduler.scheduleAlarm(alarm)
        : await container.scheduler.cancelAlarm(alarm);
      dispatch({ type: 'UPDATE', alarm: scheduled });
      const next = alarms.map(a => (a.id === scheduled.id ? scheduled : a));
      await persist(next);
    },
    [container, alarms, persist]
  );

  const removeAlarm = useCallback(
    async (id: string) => {
      const alarm = alarms.find(a => a.id === id);
      if (alarm) await container.scheduler.cancelAlarm(alarm);
      dispatch({ type: 'REMOVE', id });
      await persist(alarms.filter(a => a.id !== id));
    },
    [container, alarms, persist]
  );

  const toggleAlarm = useCallback(
    async (id: string) => {
      const alarm = alarms.find(a => a.id === id);
      if (!alarm) return;
      const toggled = { ...alarm, enabled: !alarm.enabled, updatedAt: Date.now() };
      const scheduled = toggled.enabled
        ? await container.scheduler.scheduleAlarm(toggled)
        : await container.scheduler.cancelAlarm(toggled);
      dispatch({ type: 'UPDATE', alarm: scheduled });
      const next = alarms.map(a => (a.id === scheduled.id ? scheduled : a));
      await persist(next);
    },
    [container, alarms, persist]
  );

  const snoozeAlarm = useCallback(
    async (id: string) => {
      const alarm = alarms.find(a => a.id === id);
      if (!alarm) return;
      const snoozed = await container.scheduler.snoozeAlarm(alarm);
      dispatch({ type: 'UPDATE', alarm: snoozed });
      const next = alarms.map(a => (a.id === snoozed.id ? snoozed : a));
      await persist(next);
    },
    [container, alarms, persist]
  );

  return { alarms, loading, addAlarm, updateAlarm, removeAlarm, toggleAlarm, snoozeAlarm };
};

// ────────────────────────────────────────────
// PRESENTATION HOOKS — useTimer
// ────────────────────────────────────────────

export const useTimer = () => {
  const [timer, setTimer] = useState<TimerState>(createDefaultTimer);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Prevent memory leak
  useEffect(() => () => clearTick(), [clearTick]);

  const start = useCallback(() => {
    clearTick();
    setTimer(prev => ({ ...prev, isRunning: true, isPaused: false }));
    intervalRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev.remainingSeconds <= 1) {
          clearTick();
          // Timer complete
          ServiceContainer.instance.sound.vibrate();
          return { ...prev, remainingSeconds: 0, isRunning: false };
        }
        return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
      });
    }, 1000);
  }, [clearTick]);

  const pause = useCallback(() => {
    clearTick();
    setTimer(prev => ({ ...prev, isRunning: false, isPaused: true }));
  }, [clearTick]);

  const reset = useCallback(() => {
    clearTick();
    setTimer(prev => ({
      ...prev,
      remainingSeconds: prev.durationSeconds,
      isRunning: false,
      isPaused: false,
    }));
  }, [clearTick]);

  const setDuration = useCallback(
    (seconds: number) => {
      clearTick();
      setTimer({
        durationSeconds: seconds,
        remainingSeconds: seconds,
        isRunning: false,
        isPaused: false,
      });
    },
    [clearTick]
  );

  return { timer, start, pause, reset, setDuration };
};

// ────────────────────────────────────────────
// PRESENTATION HOOKS — usePomodoro
// ────────────────────────────────────────────

export const usePomodoro = () => {
  const [state, setState] = useState<PomodoroState>(createDefaultPomodoro);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTick(), [clearTick]);

  const advancePhase = useCallback((current: PomodoroState): PomodoroState => {
    const cfg = current.config;
    if (current.phase === PomodoroPhase.Work) {
      const completed = current.totalSessionsCompleted + 1;
      const isLongBreak = completed % cfg.sessionsBeforeLongBreak === 0;
      const nextPhase = isLongBreak
        ? PomodoroPhase.LongBreak
        : PomodoroPhase.ShortBreak;
      const dur = isLongBreak ? cfg.longBreakMinutes : cfg.shortBreakMinutes;
      return {
        ...current,
        phase: nextPhase,
        remainingSeconds: dur * 60,
        isRunning: false,
        totalSessionsCompleted: completed,
        totalWorkMinutes: current.totalWorkMinutes + cfg.workMinutes,
      };
    }
    // After any break → next work session
    return {
      ...current,
      phase: PomodoroPhase.Work,
      remainingSeconds: cfg.workMinutes * 60,
      isRunning: false,
      currentSession: current.currentSession + 1,
    };
  }, []);

  const start = useCallback(() => {
    clearTick();
    setState(prev => {
      const phase = prev.phase === PomodoroPhase.Idle ? PomodoroPhase.Work : prev.phase;
      const remaining =
        prev.phase === PomodoroPhase.Idle
          ? prev.config.workMinutes * 60
          : prev.remainingSeconds;
      return { ...prev, phase, remainingSeconds: remaining, isRunning: true };
    });
    intervalRef.current = setInterval(() => {
      setState(prev => {
        if (prev.remainingSeconds <= 1) {
          clearTick();
          ServiceContainer.instance.sound.vibrate();
          return advancePhase(prev);
        }
        return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
      });
    }, 1000);
  }, [clearTick, advancePhase]);

  const pause = useCallback(() => {
    clearTick();
    setState(prev => ({ ...prev, isRunning: false }));
  }, [clearTick]);

  const reset = useCallback(() => {
    clearTick();
    setState(createDefaultPomodoro());
  }, [clearTick]);

  const skip = useCallback(() => {
    clearTick();
    setState(prev => advancePhase(prev));
  }, [clearTick, advancePhase]);

  return { state, start, pause, reset, skip };
};

// ────────────────────────────────────────────
// PRESENTATION HOOKS — useHistory
// ────────────────────────────────────────────

export const useHistory = () => {
  const [entries, setEntries] = useState<AlarmHistoryEntry[]>([]);
  const container = useMemo(() => ServiceContainer.instance, []);

  useEffect(() => {
    (async () => {
      const stored = await container.storage.load<AlarmHistoryEntry[]>(
        STORAGE_KEYS.HISTORY
      );
      if (stored) setEntries(stored);
    })();
  }, [container]);

  const addEntry = useCallback(
    async (entry: Omit<AlarmHistoryEntry, 'id'>) => {
      const full: AlarmHistoryEntry = { ...entry, id: generateId() };
      const updated = [full, ...entries].slice(0, 500); // cap at 500
      setEntries(updated);
      await container.storage.save(STORAGE_KEYS.HISTORY, updated);
    },
    [container, entries]
  );

  const compliance = useMemo(
    () => computeComplianceRate(entries),
    [entries]
  );

  const clearHistory = useCallback(async () => {
    setEntries([]);
    await container.storage.remove(STORAGE_KEYS.HISTORY);
  }, [container]);

  return { entries, addEntry, compliance, clearHistory };
};

// ────────────────────────────────────────────
// UI PRIMITIVES
// ────────────────────────────────────────────

/** Glass-morphism card */
type GlassCardProps = {
  children: React.ReactNode;
  style?: object;
};

const GlassCard = memo(
  (props: GlassCardProps) => {
    const { children, style } = props;
    const t = useTheme();

    return (
      <View
        style={[
          {
            backgroundColor: t.glassBg,
            borderWidth: 1,
            borderColor: t.glassBorder,
            borderRadius: 20,
            padding: t.spacing(2),
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
);


/** Icon button with optional badge */
type IconBtnProps = {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  onPress: () => void;
};

const IconBtn = memo(
  (props: IconBtnProps) => {
    const { name, size = 24, color, onPress } = props;
    const t = useTheme();

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: t.glassBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={name} size={size} color={color || t.textPrimary} />
      </TouchableOpacity>
    );
  }
);


/** Floating action button */
type FABProps = {
  onPress: () => void;
};

const FAB = memo(
  (props: FABProps) => {
    const { onPress } = props;
    const t = useTheme();
    const scale = useSharedValue(1);

    const animStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 24,
            right: 24,
            width: 60,
            height: 60,
            borderRadius: 30,
            zIndex: 100,
          },
          animStyle,
        ]}
      >
        <TouchableOpacity
          onPress={onPress}
          onPressIn={() => {
            scale.value = withSpring(0.9);
          }}
          onPressOut={() => {
            scale.value = withSpring(1);
          }}
          activeOpacity={0.85}
          style={{
            flex: 1,
            borderRadius: 30,
            backgroundColor: t.primary,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: t.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    );
  }
);

/** Pill-shaped chip */
type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

const Chip = memo(
  (props: ChipProps) => {
    const { label, active = false, onPress } = props;
    const t = useTheme();

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{
          paddingHorizontal: t.spacing(1.5),
          paddingVertical: t.spacing(0.75),
          borderRadius: 16,
          backgroundColor: active ? t.primaryDim : t.glassBg,
          borderWidth: 1,
          borderColor: active ? t.primary : t.glassBorder,
          marginRight: t.spacing(1),
          marginBottom: t.spacing(1),
        }}
      >
        <Text
          style={[
            typo.caption,
            { color: active ? t.primary : t.textSecondary },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  }
);

// ────────────────────────────────────────────
// ALARM CARD — with swipe-to-delete
// ────────────────────────────────────────────

type AlarmCardProps = {
  alarm: Alarm;
  onToggle: () => void;
  onPress: () => void;
  onDelete: () => void;
};

const AlarmCard = memo(
  (props: AlarmCardProps) => {
    const { alarm, onToggle, onPress, onDelete } = props;
    const t = useTheme();
    const swipeRef = useRef<Swipeable>(null);

    const renderRight = useCallback(
      () => (
        <RectButton
          style={{
            backgroundColor: t.danger,
            justifyContent: 'center',
            alignItems: 'center',
            width: 80,
            borderTopRightRadius: 20,
            borderBottomRightRadius: 20,
          }}
          onPress={() => {
            swipeRef.current?.close();
            onDelete();
          }}
        >
          <Ionicons name="trash-outline" size={24} color="#fff" />
        </RectButton>
      ),
      [t, onDelete]
    );

    const timeUntil = useMemo(() => getTimeUntilAlarm(alarm), [alarm]);
    const repeatLabel = useMemo(() => getRepeatLabel(alarm), [alarm]);

    return (
      <Animated.View
        entering={SlideInRight.duration(300)}
        exiting={SlideOutLeft.duration(200)}
        layout={Layout.springify()}
      >
        <Swipeable
          ref={swipeRef}
          renderRightActions={renderRight}
          overshootRight={false}
          friction={2}
        >
          <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <GlassCard
              style={{
                marginHorizontal: DarkTheme.spacing(2),
                marginBottom: DarkTheme.spacing(1.5),
                opacity: alarm.enabled ? 1 : 0.5,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      typo.h2,
                      {
                        color: alarm.enabled ? t.textPrimary : t.textMuted,
                        letterSpacing: 1,
                      },
                    ]}
                  >
                    {formatAlarmTime(alarm.time)}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginTop: 4,
                    }}
                  >
                    <Text style={[typo.caption, { color: t.textSecondary }]}>
                      {alarm.label}
                    </Text>
                    <Text
                      style={[
                        typo.caption,
                        { color: t.textMuted, marginLeft: 8 },
                      ]}
                    >
                      {repeatLabel}
                    </Text>
                  </View>
                  {alarm.enabled && timeUntil && (
                    <Text
                      style={[
                        typo.caption,
                        { color: t.accent, marginTop: 2 },
                      ]}
                    >
                      in {timeUntil}
                    </Text>
                  )}
                </View>
                <Switch
                  value={alarm.enabled}
                  onValueChange={onToggle}
                  trackColor={{ false: t.textMuted, true: t.primaryDim }}
                  thumbColor={alarm.enabled ? t.primary : t.textSecondary}
                />
              </View>
              {/* Indicator icons */}
              <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                {alarm.snoozeEnabled && (
                  <Ionicons
                    name="alarm-outline"
                    size={14}
                    color={t.textMuted}
                  />
                )}
                {alarm.vibrationEnabled && (
                  <Ionicons
                    name="phone-portrait-outline"
                    size={14}
                    color={t.textMuted}
                  />
                )}
                {alarm.gradualVolume && (
                  <Ionicons
                    name="volume-low-outline"
                    size={14}
                    color={t.textMuted}
                  />
                )}
                {alarm.dismissChallenge !== DismissChallenge.None && (
                  <Ionicons
                    name="game-controller-outline"
                    size={14}
                    color={t.textMuted}
                  />
                )}
              </View>
            </GlassCard>
          </TouchableOpacity>
        </Swipeable>
      </Animated.View>
    );
  }
);


// ────────────────────────────────────────────
// NUMBER SCROLLER — used in time picker
// ────────────────────────────────────────────

const ITEM_HEIGHT = 48;

type NumberScrollerProps = {
  range: number;
  value: number;
  onChange: (v: number) => void;
  padZero?: boolean;
};

const NumberScroller = memo(
  (props: NumberScrollerProps) => {
    const { range, value, onChange, padZero = true } = props;
    const t = useTheme();

    const data = useMemo(
      () => Array.from({ length: range }, (_, i) => i),
      [range]
    );
    const flatRef = useRef<FlatList<number>>(null);
    const mounted = useRef(false);

    useEffect(() => {
      if (mounted.current) return;
      mounted.current = true;
      setTimeout(() => {
        flatRef.current?.scrollToOffset({
          offset: value * ITEM_HEIGHT,
          animated: false,
        });
      }, 100);
    }, [value]);

    const keyExtractor = useCallback(
      (item: number) => item.toString(),
      []
    );

    const renderItem = useCallback(
      ({ item }: ListRenderItemInfo<number>) => {
        const isActive = item === value;
        return (
          <TouchableOpacity
            onPress={() => {
              onChange(item);
              flatRef.current?.scrollToOffset({
                offset: item * ITEM_HEIGHT,
                animated: true,
              });
            }}
            style={{
              height: ITEM_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={[
                typo.h2,
                {
                  color: isActive ? t.primary : t.textMuted,
                  fontSize: isActive ? 28 : 20,
                },
              ]}
            >
              {padZero ? item.toString().padStart(2, '0') : item}
            </Text>
          </TouchableOpacity>
        );
      },
      [value, t, onChange, padZero]
    );

    const getItemLayout = useCallback(
      (_: unknown, index: number) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      }),
      []
    );

    const onMomentumEnd = useCallback(
      (e: { nativeEvent: { contentOffset: { y: number } } }) => {
        const idx = Math.round(
          e.nativeEvent.contentOffset.y / ITEM_HEIGHT
        );
        const clamped = Math.max(0, Math.min(range - 1, idx));
        onChange(clamped);
      },
      [range, onChange]
    );

    return (
      <View style={{ height: ITEM_HEIGHT * 3, overflow: 'hidden' }}>
        <FlatList
          ref={flatRef}
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
        />
        {/* Highlight bar */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: ITEM_HEIGHT,
            left: 0,
            right: 0,
            height: ITEM_HEIGHT,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: t.primary + '33',
          }}
        />
      </View>
    );
  }
);


// ────────────────────────────────────────────
// ALARM EDITOR MODAL
// ────────────────────────────────────────────

type AlarmEditorModalProps = {
  visible: boolean;
  alarm: Alarm | null;
  onSave: (alarm: Alarm) => void;
  onClose: () => void;
};

export const AlarmEditorModal = memo(
  (props: AlarmEditorModalProps) => {
    const { visible, alarm: existingAlarm, onSave, onClose } = props;
    const t = useTheme();
    const [draft, setDraft] = useState<Alarm>(createDefaultAlarm);

    useEffect(() => {
      if (visible) {
        setDraft(existingAlarm ?? createDefaultAlarm());
      }
    }, [visible, existingAlarm]);

    const update = useCallback(
      <K extends keyof Alarm>(key: K, value: Alarm[K]) => {
        setDraft(prev => ({ ...prev, [key]: value, updatedAt: Date.now() }));
      },
      []
    );

    const updateTime = useCallback(
      <K extends keyof AlarmTime>(key: K, value: number) => {
        setDraft(prev => ({
          ...prev,
          time: { ...prev.time, [key]: value },
          updatedAt: Date.now(),
        }));
      },
      []
    );

    const toggleDay = useCallback(
      (day: number) => {
        setDraft(prev => {
          const days = prev.customDays.includes(day)
            ? prev.customDays.filter(d => d !== day)
            : [...prev.customDays, day].sort();
          return { ...prev, customDays: days };
        });
      },
      []
    );

    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const repeatOptions: {
      mode: RepeatMode;
      label: string;
    }[] = [
      { mode: RepeatMode.Once, label: 'Once' },
      { mode: RepeatMode.Daily, label: 'Daily' },
      { mode: RepeatMode.Weekdays, label: 'Weekdays' },
      { mode: RepeatMode.Weekend, label: 'Weekend' },
      { mode: RepeatMode.Custom, label: 'Custom' },
      { mode: RepeatMode.Periodic, label: 'Periodic' },
    ];

    const challengeOptions: {
      ch: DismissChallenge;
      label: string;
      icon: keyof typeof Ionicons.glyphMap;
    }[] = [
      { ch: DismissChallenge.None, label: 'None', icon: 'close-circle-outline' },
      { ch: DismissChallenge.Math, label: 'Math', icon: 'calculator-outline' },
      { ch: DismissChallenge.Shake, label: 'Shake', icon: 'phone-portrait-outline' },
      { ch: DismissChallenge.TypePhrase, label: 'Type', icon: 'text-outline' },
      { ch: DismissChallenge.MemoryPattern, label: 'Memory', icon: 'grid-outline' },
    ];

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: t.spacing(2),
              paddingTop: t.spacing(6),
            }}
          >
            <TouchableOpacity onPress={onClose}>
              <Text style={[typo.body, { color: t.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[typo.h3, { color: t.textPrimary }]}>
              {existingAlarm ? 'Edit Alarm' : 'New Alarm'}
            </Text>
            <TouchableOpacity onPress={() => onSave(draft)}>
              <Text
                style={[typo.body, { color: t.primary, fontWeight: '600' }]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: t.spacing(2),
              paddingBottom: 100,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Time Picker */}
            <GlassCard style={{ marginBottom: t.spacing(2) }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <NumberScroller
                  range={24}
                  value={draft.time.hour}
                  onChange={v => updateTime('hour', v)}
                />
                <Text
                  style={[
                    typo.h1,
                    { color: t.primary, marginHorizontal: 8 },
                  ]}
                >
                  :
                </Text>
                <NumberScroller
                  range={60}
                  value={draft.time.minute}
                  onChange={v => updateTime('minute', v)}
                />
                <Text
                  style={[
                    typo.h1,
                    { color: t.primary, marginHorizontal: 8 },
                  ]}
                >
                  :
                </Text>
                <NumberScroller
                  range={60}
                  value={draft.time.second}
                  onChange={v => updateTime('second', v)}
                />
              </View>
            </GlassCard>

            {/* Label */}
            <GlassCard style={{ marginBottom: t.spacing(2) }}>
              <Text
                style={[
                  typo.caption,
                  { color: t.textSecondary, marginBottom: 4 },
                ]}
              >
                Label
              </Text>
              <TextInput
                value={draft.label}
                onChangeText={txt => update('label', txt)}
                placeholderTextColor={t.textMuted}
                placeholder="Alarm label"
                style={[
                  typo.body,
                  {
                    color: t.textPrimary,
                    backgroundColor: t.surfaceLight,
                    borderRadius: 12,
                    padding: t.spacing(1.5),
                  },
                ]}
              />
            </GlassCard>

            {/* Repeat */}
            <GlassCard style={{ marginBottom: t.spacing(2) }}>
              <Text
                style={[
                  typo.caption,
                  { color: t.textSecondary, marginBottom: 8 },
                ]}
              >
                Repeat
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {repeatOptions.map(opt => (
                  <Chip
                    key={opt.mode}
                    label={opt.label}
                    active={draft.repeatMode === opt.mode}
                    onPress={() => update('repeatMode', opt.mode)}
                  />
                ))}
              </View>
              {draft.repeatMode === RepeatMode.Custom && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                    marginTop: 12,
                  }}
                >
                  {dayLabels.map((label, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => toggleDay(idx)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: draft.customDays.includes(idx)
                          ? t.primary
                          : t.glassBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: draft.customDays.includes(idx)
                          ? t.primary
                          : t.glassBorder,
                      }}
                    >
                      <Text
                        style={[
                          typo.caption,
                          {
                            color: draft.customDays.includes(idx)
                              ? '#fff'
                              : t.textSecondary,
                            fontWeight: '600',
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {draft.repeatMode === RepeatMode.Periodic && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 12,
                  }}
                >
                  <Text style={[typo.body, { color: t.textSecondary }]}>
                    Every{' '}
                  </Text>
                  <TextInput
                    keyboardType="number-pad"
                    value={draft.periodicIntervalDays.toString()}
                    onChangeText={txt => {
                      const n = parseInt(txt, 10);
                      if (!isNaN(n) && n > 0)
                        update('periodicIntervalDays', n);
                    }}
                    style={[
                      typo.body,
                      {
                        color: t.primary,
                        backgroundColor: t.surfaceLight,
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        width: 60,
                        textAlign: 'center',
                      },
                    ]}
                  />
                  <Text style={[typo.body, { color: t.textSecondary }]}>
                    {' '}day(s)
                  </Text>
                </View>
              )}
            </GlassCard>

            {/* Snooze */}
            <GlassCard style={{ marginBottom: t.spacing(2) }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <Ionicons
                    name="alarm-outline"
                    size={18}
                    color={t.textSecondary}
                  />
                  <Text
                    style={[
                      typo.body,
                      { color: t.textPrimary, marginLeft: 8 },
                    ]}
                  >
                    Snooze
                  </Text>
                </View>
                <Switch
                  value={draft.snoozeEnabled}
                  onValueChange={v => update('snoozeEnabled', v)}
                  trackColor={{ false: t.textMuted, true: t.primaryDim }}
                  thumbColor={
                    draft.snoozeEnabled ? t.primary : t.textSecondary
                  }
                />
              </View>
              {draft.snoozeEnabled && (
                <View style={{ marginTop: 12 }}>
                  <Text
                    style={[typo.caption, { color: t.textSecondary }]}
                  >
                    Duration: {draft.snoozeDurationMinutes} min · Max:{' '}
                    {draft.maxSnoozeCount}x
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      marginTop: 8,
                      gap: 8,
                    }}
                  >
                    {[1, 3, 5, 10, 15].map(m => (
                      <Chip
                        key={m}
                        label={`${m}m`}
                        active={draft.snoozeDurationMinutes === m}
                        onPress={() => update('snoozeDurationMinutes', m)}
                      />
                    ))}
                  </View>
                </View>
              )}
            </GlassCard>

            {/* Sound & Vibration */}
            <GlassCard style={{ marginBottom: t.spacing(2) }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <Ionicons
                    name="volume-high-outline"
                    size={18}
                    color={t.textSecondary}
                  />
                  <Text
                    style={[
                      typo.body,
                      { color: t.textPrimary, marginLeft: 8 },
                    ]}
                  >
                    Gradual Volume
                  </Text>
                </View>
                <Switch
                  value={draft.gradualVolume}
                  onValueChange={v => update('gradualVolume', v)}
                  trackColor={{ false: t.textMuted, true: t.primaryDim }}
                  thumbColor={
                    draft.gradualVolume ? t.primary : t.textSecondary
                  }
                />
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <Ionicons
                    name="phone-portrait-outline"
                    size={18}
                    color={t.textSecondary}
                  />
                  <Text
                    style={[
                      typo.body,
                      { color: t.textPrimary, marginLeft: 8 },
                    ]}
                  >
                    Vibration
                  </Text>
                </View>
                <Switch
                  value={draft.vibrationEnabled}
                  onValueChange={v => update('vibrationEnabled', v)}
                  trackColor={{ false: t.textMuted, true: t.primaryDim }}
                  thumbColor={
                    draft.vibrationEnabled ? t.primary : t.textSecondary
                  }
                />
              </View>
            </GlassCard>

            {/* Dismiss Challenge */}
            <GlassCard style={{ marginBottom: t.spacing(2) }}>
              <Text
                style={[
                  typo.caption,
                  { color: t.textSecondary, marginBottom: 8 },
                ]}
              >
                Dismiss Challenge
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {challengeOptions.map(opt => (
                  <TouchableOpacity
                    key={opt.ch}
                    onPress={() => update('dismissChallenge', opt.ch)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor:
                        draft.dismissChallenge === opt.ch
                          ? t.primaryDim
                          : t.glassBg,
                      borderWidth: 1,
                      borderColor:
                        draft.dismissChallenge === opt.ch
                          ? t.primary
                          : t.glassBorder,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      marginRight: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={
                        draft.dismissChallenge === opt.ch
                          ? t.primary
                          : t.textSecondary
                      }
                    />
                    <Text
                      style={[
                        typo.caption,
                        {
                          color:
                            draft.dismissChallenge === opt.ch
                              ? t.primary
                              : t.textSecondary,
                          marginLeft: 4,
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </GlassCard>
          </ScrollView>
        </View>
      </Modal>
    );
  }
);


// ────────────────────────────────────────────
// DISMISS CHALLENGE MODAL
// ────────────────────────────────────────────

type DismissChallengeModalProps = {
  visible: boolean;
  challenge: DismissChallenge;
  onDismiss: () => void;
};

export const DismissChallengeModal = memo(
  (props: DismissChallengeModalProps) => {
    const { visible, challenge, onDismiss } = props;
    const t = useTheme();
    const [mathQ, setMathQ] = useState(generateMathChallenge);
    const [answer, setAnswer] = useState('');
    const [pattern, setPattern] = useState<number[]>([]);
    const [userPattern, setUserPattern] = useState<number[]>([]);
    const [phase, setPhase] = useState<'show' | 'input'>('show');
    const [typeTarget] = useState('WAKE UP NOW');
    const [typeInput, setTypeInput] = useState('');

    useEffect(() => {
      if (visible) {
        setMathQ(generateMathChallenge());
        setAnswer('');
        const p = generateMemoryPattern(4);
        setPattern(p);
        setUserPattern([]);
        setPhase('show');
        setTypeInput('');
        // Show pattern for 3 seconds then switch to input
        if (challenge === DismissChallenge.MemoryPattern) {
          setTimeout(() => setPhase('input'), 3000);
        }
      }
    }, [visible, challenge]);

    const checkMath = useCallback(() => {
      if (parseInt(answer, 10) === mathQ.answer) onDismiss();
    }, [answer, mathQ, onDismiss]);

    const checkType = useCallback(() => {
      if (typeInput.toUpperCase().trim() === typeTarget) onDismiss();
    }, [typeInput, typeTarget, onDismiss]);

    const tapCell = useCallback(
      (idx: number) => {
        const next = [...userPattern, idx];
        setUserPattern(next);
        if (next.length === pattern.length) {
          if (next.every((v, i) => v === pattern[i])) {
            onDismiss();
          } else {
            setUserPattern([]);
            const p = generateMemoryPattern(4);
            setPattern(p);
            setPhase('show');
            setTimeout(() => setPhase('input'), 3000);
          }
        }
      },
      [userPattern, pattern, onDismiss]
    );

    if (challenge === DismissChallenge.None) {
      // Auto-dismiss
      if (visible) onDismiss();
      return null;
    }

    return (
      <Modal visible={visible} animationType="fade" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.85)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: t.spacing(3),
          }}
        >
          <GlassCard
            style={{
              width: '100%',
              maxWidth: 360,
              padding: t.spacing(3),
            }}
          >
            {challenge === DismissChallenge.Math && (
              <>
                <Text
                  style={[
                    typo.h3,
                    {
                      color: t.textPrimary,
                      textAlign: 'center',
                      marginBottom: 16,
                    },
                  ]}
                >
                  Solve to dismiss
                </Text>
                <Text
                  style={[
                    typo.h1,
                    {
                      color: t.primary,
                      textAlign: 'center',
                      marginBottom: 20,
                    },
                  ]}
                >
                  {mathQ.question}
                </Text>
                <TextInput
                  keyboardType="number-pad"
                  value={answer}
                  onChangeText={setAnswer}
                  placeholder="Your answer"
                  placeholderTextColor={t.textMuted}
                  style={[
                    typo.h3,
                    {
                      color: t.textPrimary,
                      backgroundColor: t.surfaceLight,
                      borderRadius: 12,
                      padding: t.spacing(1.5),
                      textAlign: 'center',
                      marginBottom: 16,
                    },
                  ]}
                />
                <TouchableOpacity
                  onPress={checkMath}
                  style={{
                    backgroundColor: t.primary,
                    borderRadius: 16,
                    padding: t.spacing(1.5),
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={[
                      typo.body,
                      { color: '#fff', fontWeight: '600' },
                    ]}
                  >
                    Submit
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {challenge === DismissChallenge.TypePhrase && (
              <>
                <Text
                  style={[
                    typo.h3,
                    {
                      color: t.textPrimary,
                      textAlign: 'center',
                      marginBottom: 16,
                    },
                  ]}
                >
                  Type this phrase
                </Text>
                <Text
                  style={[
                    typo.h2,
                    {
                      color: t.accent,
                      textAlign: 'center',
                      marginBottom: 20,
                      letterSpacing: 2,
                    },
                  ]}
                >
                  {typeTarget}
                </Text>
                <TextInput
                  value={typeInput}
                  onChangeText={setTypeInput}
                  placeholder="Type here..."
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="characters"
                  style={[
                    typo.body,
                    {
                      color: t.textPrimary,
                      backgroundColor: t.surfaceLight,
                      borderRadius: 12,
                      padding: t.spacing(1.5),
                      textAlign: 'center',
                      marginBottom: 16,
                    },
                  ]}
                />
                <TouchableOpacity
                  onPress={checkType}
                  style={{
                    backgroundColor: t.primary,
                    borderRadius: 16,
                    padding: t.spacing(1.5),
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={[
                      typo.body,
                      { color: '#fff', fontWeight: '600' },
                    ]}
                  >
                    Submit
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {challenge === DismissChallenge.MemoryPattern && (
              <>
                <Text
                  style={[
                    typo.h3,
                    {
                      color: t.textPrimary,
                      textAlign: 'center',
                      marginBottom: 16,
                    },
                  ]}
                >
                  {phase === 'show'
                    ? 'Memorize the pattern'
                    : 'Repeat the pattern'}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {Array.from({ length: 9 }, (_, i) => {
                    const isHighlighted =
                      phase === 'show' && pattern.includes(i);
                    const isUserTapped = userPattern.includes(i);
                    return (
                      <TouchableOpacity
                        key={i}
                        disabled={phase === 'show'}
                        onPress={() => tapCell(i)}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 16,
                          backgroundColor: isHighlighted
                            ? t.primary
                            : isUserTapped
                            ? t.accent
                            : t.surfaceLight,
                          borderWidth: 1,
                          borderColor: t.glassBorder,
                        }}
                      />
                    );
                  })}
                </View>
              </>
            )}

            {challenge === DismissChallenge.Shake && (
              <>
                <Ionicons
                  name="phone-portrait-outline"
                  size={64}
                  color={t.primary}
                  style={{ alignSelf: 'center', marginBottom: 16 }}
                />
                <Text
                  style={[
                    typo.h3,
                    {
                      color: t.textPrimary,
                      textAlign: 'center',
                      marginBottom: 16,
                    },
                  ]}
                >
                  Shake your phone!
                </Text>
                <Text
                  style={[
                    typo.caption,
                    {
                      color: t.textSecondary,
                      textAlign: 'center',
                      marginBottom: 20,
                    },
                  ]}
                >
                  Shake vigorously to dismiss the alarm
                </Text>
                {/* In production: use Accelerometer from expo-sensors */}
                <TouchableOpacity
                  onPress={onDismiss}
                  style={{
                    backgroundColor: t.primary,
                    borderRadius: 16,
                    padding: t.spacing(1.5),
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={[
                      typo.body,
                      { color: '#fff', fontWeight: '600' },
                    ]}
                  >
                    Simulate Shake
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </GlassCard>
        </View>
      </Modal>
    );
  }
);


// ────────────────────────────────────────────
// SCREEN — Alarms List
// ────────────────────────────────────────────

export const AlarmsScreen = memo(() => {
  const t = useTheme();
  const { alarms, loading, addAlarm, updateAlarm, removeAlarm, toggleAlarm } =
    useAlarms();
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);

  const openEditor = useCallback((alarm?: Alarm) => {
    setEditingAlarm(alarm ?? null);
    setEditorVisible(true);
  }, []);

  const handleSave = useCallback(
    async (alarm: Alarm) => {
      if (editingAlarm) {
        await updateAlarm(alarm);
      } else {
        await addAlarm(alarm);
      }
      setEditorVisible(false);
    },
    [editingAlarm, updateAlarm, addAlarm]
  );

  const sortedAlarms = useMemo(
    () =>
      [...alarms].sort((a, b) => {
        const aMin = a.time.hour * 3600 + a.time.minute * 60 + a.time.second;
        const bMin = b.time.hour * 3600 + b.time.minute * 60 + b.time.second;
        return aMin - bMin;
      }),
    [alarms]
  );

  const keyExtractor = useCallback((item: Alarm) => item.id, []);

  const renderAlarm = useCallback(
    ({ item }: ListRenderItemInfo<Alarm>) => (
      <AlarmCard
        alarm={item}
        onToggle={() => toggleAlarm(item.id)}
        onPress={() => openEditor(item)}
        onDelete={() => removeAlarm(item.id)}
      />
    ),
    [toggleAlarm, openEditor, removeAlarm]
  );

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: t.bg,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color={t.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: t.spacing(2), paddingTop: t.spacing(6), paddingBottom: t.spacing(2) }}>
        <Text style={[typo.h1, { color: t.textPrimary }]}>Alarms</Text>
        <Text style={[typo.caption, { color: t.textSecondary, marginTop: 4 }]}>
          {alarms.filter(a => a.enabled).length} active
        </Text>
      </View>

      {alarms.length === 0 ? (
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons
            name="alarm-outline"
            size={64}
            color={t.textMuted}
          />
          <Text
            style={[
              typo.body,
              { color: t.textMuted, marginTop: 16 },
            ]}
          >
            No alarms yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedAlarms}
          keyExtractor={keyExtractor}
          renderItem={renderAlarm}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}

      <FAB onPress={() => openEditor()} />

      <AlarmEditorModal
        visible={editorVisible}
        alarm={editingAlarm}
        onSave={handleSave}
        onClose={() => setEditorVisible(false)}
      />
    </View>
  );
});

// ────────────────────────────────────────────
// SCREEN — Countdown Timer
// ────────────────────────────────────────────

export const TimerScreen = memo(() => {
  const t = useTheme();
  const { timer, start, pause, reset, setDuration } = useTimer();

  const progress = useMemo(() => {
    if (timer.durationSeconds === 0) return 0;
    return 1 - timer.remainingSeconds / timer.durationSeconds;
  }, [timer]);

  const presets = [60, 180, 300, 600, 900, 1800];

  // Pulsing ring animation
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (timer.isRunning) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulse.value = withTiming(0, { duration: 300 });
    }
  }, [timer.isRunning, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.4,
    transform: [{ scale: 1 + pulse.value * 0.03 }],
  }));

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg,
        alignItems: 'center',
        paddingTop: t.spacing(6),
      }}
    >
      <Text style={[typo.h1, { color: t.textPrimary, marginBottom: t.spacing(4) }]}>
        Timer
      </Text>

      {/* Timer display */}
      <Animated.View
        style={[
          {
            width: 260,
            height: 260,
            borderRadius: 130,
            borderWidth: 4,
            borderColor: timer.isRunning ? t.primary : t.glassBorder,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.glassBg,
          },
          pulseStyle,
        ]}
      >
        <Text style={[typo.mono, { color: t.textPrimary }]}>
          {formatSeconds(timer.remainingSeconds)}
        </Text>
        {timer.isRunning && (
          <Text style={[typo.caption, { color: t.accent, marginTop: 4 }]}>
            {Math.round(progress * 100)}%
          </Text>
        )}
      </Animated.View>

      {/* Preset buttons */}
      {!timer.isRunning && !timer.isPaused && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: t.spacing(3),
            paddingHorizontal: t.spacing(2),
          }}
        >
          {presets.map(s => (
            <Chip
              key={s}
              label={formatSeconds(s)}
              active={timer.durationSeconds === s}
              onPress={() => setDuration(s)}
            />
          ))}
        </View>
      )}

      {/* Controls */}
      <View
        style={{
          flexDirection: 'row',
          gap: 16,
          marginTop: t.spacing(4),
        }}
      >
        {timer.isRunning ? (
          <TouchableOpacity
            onPress={pause}
            style={{
              backgroundColor: t.warning,
              paddingHorizontal: 32,
              paddingVertical: 14,
              borderRadius: 24,
            }}
          >
            <Text style={[typo.body, { color: '#fff', fontWeight: '600' }]}>
              Pause
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={start}
            style={{
              backgroundColor: t.primary,
              paddingHorizontal: 32,
              paddingVertical: 14,
              borderRadius: 24,
            }}
          >
            <Text style={[typo.body, { color: '#fff', fontWeight: '600' }]}>
              {timer.isPaused ? 'Resume' : 'Start'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={reset}
          style={{
            backgroundColor: t.glassBg,
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: t.glassBorder,
          }}
        >
          <Text style={[typo.body, { color: t.textSecondary }]}>
            Reset
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ────────────────────────────────────────────
// SCREEN — Pomodoro
// ────────────────────────────────────────────

const PHASE_COLORS: Record<PomodoroPhase, string> = {
  [PomodoroPhase.Work]: '#6C63FF',
  [PomodoroPhase.ShortBreak]: '#00D4AA',
  [PomodoroPhase.LongBreak]: '#FFA502',
  [PomodoroPhase.Idle]: '#8B8DA3',
};

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  [PomodoroPhase.Work]: 'Focus',
  [PomodoroPhase.ShortBreak]: 'Short Break',
  [PomodoroPhase.LongBreak]: 'Long Break',
  [PomodoroPhase.Idle]: 'Ready',
};

export const PomodoroScreen = memo(() => {
  const t = useTheme();
  const { state, start, pause, reset, skip } = usePomodoro();
  const phaseColor = PHASE_COLORS[state.phase];

  // Animated ring color
  const ringColor = useSharedValue(0);
  useEffect(() => {
    ringColor.value = withTiming(
      state.phase === PomodoroPhase.Work ? 1 : 0,
      { duration: 500 }
    );
  }, [state.phase, ringColor]);

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      ringColor.value,
      [0, 1],
      [DarkTheme.accent, DarkTheme.primary]
    ),
  }));

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg,
        alignItems: 'center',
        paddingTop: t.spacing(6),
      }}
    >
      <Text style={[typo.h1, { color: t.textPrimary, marginBottom: t.spacing(2) }]}>
        Pomodoro
      </Text>

      {/* Phase indicator */}
      <View
        style={{
          backgroundColor: phaseColor + '20',
          paddingHorizontal: 20,
          paddingVertical: 6,
          borderRadius: 16,
          marginBottom: t.spacing(3),
        }}
      >
        <Text style={[typo.body, { color: phaseColor, fontWeight: '600' }]}>
          {PHASE_LABELS[state.phase]}
        </Text>
      </View>

      {/* Timer ring */}
      <Animated.View
        style={[
          {
            width: 240,
            height: 240,
            borderRadius: 120,
            borderWidth: 5,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.glassBg,
          },
          ringStyle,
        ]}
      >
        <Text style={[typo.mono, { color: t.textPrimary, fontSize: 44 }]}>
          {formatSeconds(state.remainingSeconds)}
        </Text>
        <Text style={[typo.caption, { color: t.textSecondary, marginTop: 4 }]}>
          Session {state.currentSession}
        </Text>
      </Animated.View>

      {/* Controls */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: t.spacing(4) }}>
        {state.isRunning ? (
          <TouchableOpacity
            onPress={pause}
            style={{
              backgroundColor: t.warning,
              paddingHorizontal: 28,
              paddingVertical: 14,
              borderRadius: 24,
            }}
          >
            <Text style={[typo.body, { color: '#fff', fontWeight: '600' }]}>
              Pause
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={start}
            style={{
              backgroundColor: t.primary,
              paddingHorizontal: 28,
              paddingVertical: 14,
              borderRadius: 24,
            }}
          >
            <Text style={[typo.body, { color: '#fff', fontWeight: '600' }]}>
              {state.phase === PomodoroPhase.Idle ? 'Start' : 'Resume'}
            </Text>
          </TouchableOpacity>
        )}

        <IconBtn name="play-skip-forward-outline" onPress={skip} />
        <IconBtn name="refresh-outline" onPress={reset} />
      </View>

      {/* Stats */}
      <View
        style={{
          flexDirection: 'row',
          gap: 16,
          marginTop: t.spacing(4),
          paddingHorizontal: t.spacing(2),
        }}
      >
        <GlassCard
          style={{
            flex: 1,
            alignItems: 'center',
            padding: t.spacing(2),
          }}
        >
          <Ionicons name="checkmark-circle-outline" size={24} color={t.success} />
          <Text style={[typo.h3, { color: t.textPrimary, marginTop: 4 }]}>
            {state.totalSessionsCompleted}
          </Text>
          <Text style={[typo.caption, { color: t.textSecondary }]}>
            Sessions
          </Text>
        </GlassCard>
        <GlassCard
          style={{
            flex: 1,
            alignItems: 'center',
            padding: t.spacing(2),
          }}
        >
          <Ionicons name="time-outline" size={24} color={t.accent} />
          <Text style={[typo.h3, { color: t.textPrimary, marginTop: 4 }]}>
            {state.totalWorkMinutes}
          </Text>
          <Text style={[typo.caption, { color: t.textSecondary }]}>
            Minutes
          </Text>
        </GlassCard>
      </View>
    </View>
  );
});

// ────────────────────────────────────────────
// SCREEN — History
// ────────────────────────────────────────────

const STATUS_ICONS: Record<AlarmHistoryStatus, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  [AlarmHistoryStatus.OnTime]: { icon: 'checkmark-circle', color: DarkTheme.success },
  [AlarmHistoryStatus.Snoozed]: { icon: 'alarm', color: DarkTheme.warning },
  [AlarmHistoryStatus.Dismissed]: { icon: 'close-circle', color: DarkTheme.textSecondary },
  [AlarmHistoryStatus.Missed]: { icon: 'alert-circle', color: DarkTheme.danger },
};

export const HistoryScreen = memo(() => {
  const t = useTheme();
  const { entries, compliance, clearHistory } = useHistory();

  const keyExtractor = useCallback(
    (item: AlarmHistoryEntry) => item.id,
    []
  );

  const renderEntry = useCallback(
    ({ item }: ListRenderItemInfo<AlarmHistoryEntry>) => {
      const si = STATUS_ICONS[item.status];
      const date = new Date(item.actualTime);
      return (
        <Animated.View entering={FadeIn.duration(200)}>
          <GlassCard
            style={{
              marginHorizontal: DarkTheme.spacing(2),
              marginBottom: DarkTheme.spacing(1),
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Ionicons name={si.icon} size={24} color={si.color} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={[typo.body, { color: t.textPrimary }]}>
                {item.alarmLabel}
              </Text>
              <Text style={[typo.caption, { color: t.textSecondary }]}>
                {date.toLocaleDateString()} {date.toLocaleTimeString()}
              </Text>
            </View>
            <Text
              style={[
                typo.caption,
                { color: si.color, textTransform: 'capitalize' },
              ]}
            >
              {item.status.replace('_', ' ')}
            </Text>
          </GlassCard>
        </Animated.View>
      );
    },
    [t]
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: t.spacing(2), paddingTop: t.spacing(6), paddingBottom: t.spacing(2) }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={[typo.h1, { color: t.textPrimary }]}>History</Text>
          {entries.length > 0 && (
            <TouchableOpacity onPress={clearHistory}>
              <Text style={[typo.caption, { color: t.danger }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Compliance card */}
      <GlassCard
        style={{
          marginHorizontal: DarkTheme.spacing(2),
          marginBottom: DarkTheme.spacing(2),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View>
          <Text style={[typo.caption, { color: t.textSecondary }]}>
            Compliance Rate
          </Text>
          <Text style={[typo.body, { color: t.textSecondary, marginTop: 2 }]}>
            {entries.length} total entries
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text
            style={[
              typo.h1,
              {
                color:
                  compliance >= 80
                    ? t.success
                    : compliance >= 50
                    ? t.warning
                    : t.danger,
              },
            ]}
          >
            {compliance}%
          </Text>
        </View>
      </GlassCard>

      {entries.length === 0 ? (
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons
            name="analytics-outline"
            size={64}
            color={t.textMuted}
          />
          <Text
            style={[typo.body, { color: t.textMuted, marginTop: 16 }]}
          >
            No history yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={keyExtractor}
          renderItem={renderEntry}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          maxToRenderPerBatch={15}
          windowSize={7}
        />
      )}
    </View>
  );
});
