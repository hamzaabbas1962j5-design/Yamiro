// ========================================================================
// features.tsx — Presentation Layer
// Hooks · UI Components · Screens
// No direct storage/notification calls — all through ServiceContainer.
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
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  ScrollView,
  Switch,
  StatusBar,
  ActivityIndicator,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
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
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';

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
  Mutable,
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
  validateAlarms,
  validateHistoryEntries,
} from './core';

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  THEME                                                               ║
// ╚═══════════════════════════════════════════════════════════════════════╝

export interface Theme {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceLight: string;
  readonly glassBg: string;
  readonly glassBorder: string;
  readonly primary: string;
  readonly primaryDim: string;
  readonly accent: string;
  readonly danger: string;
  readonly success: string;
  readonly warning: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  spacing(factor: number): number;
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
  spacing: (f: number): number => f * 8,
};

export const ThemeContext = createContext<Theme>(DarkTheme);
export const useTheme = (): Theme => useContext(ThemeContext);

// ── Typography ───────────────────────────────────────────────────────────

const FONT = Platform.OS === 'ios' ? 'System' : 'Roboto';
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const typo = {
  h1: { fontFamily: FONT, fontSize: 32, fontWeight: '700' as const },
  h2: { fontFamily: FONT, fontSize: 24, fontWeight: '700' as const },
  h3: { fontFamily: FONT, fontSize: 18, fontWeight: '600' as const },
  body: { fontFamily: FONT, fontSize: 15, fontWeight: '400' as const },
  caption: { fontFamily: FONT, fontSize: 12, fontWeight: '400' as const },
  mono: { fontFamily: MONO, fontSize: 48, fontWeight: '300' as const },
};

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  HOOKS                                                               ║
// ╚═══════════════════════════════════════════════════════════════════════╝

// ── useAlarms ────────────────────────────────────────────────────────────

type AlarmsAction =
  | { type: 'SET'; alarms: Alarm[] }
  | { type: 'ADD'; alarm: Alarm }
  | { type: 'UPDATE'; alarm: Alarm }
  | { type: 'REMOVE'; id: string };

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
    default:
      return state;
  }
};

export const useAlarms = () => {
  const [alarms, dispatch] = useReducer(alarmsReducer, []);
  const [loading, setLoading] = useState(true);
  const container = useMemo(() => ServiceContainer.instance, []);
  const alarmsRef = useRef<Alarm[]>([]);
  const initialLoadDone = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync for use in stable callbacks
  alarmsRef.current = alarms;

  // Load on mount with validation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!container.ready) return;
        const raw = await container.storage.load<unknown>(STORAGE_KEYS.ALARMS);
        const validated = validateAlarms(raw ?? []);
        if (!cancelled) {
          dispatch({ type: 'SET', alarms: validated });
          initialLoadDone.current = true;
        }
      } catch (err) {
        console.error('[useAlarms] load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [container]);

  // Persist whenever alarms change after initial load (debounced)
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      container.storage.save(STORAGE_KEYS.ALARMS, alarms).catch(err =>
        console.error('[useAlarms] persist failed', err)
      );
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [alarms, container]);

  const addAlarm = useCallback(async (alarm: Alarm) => {
    try {
      if (!container.ready) return;
      const scheduled = await container.scheduler.scheduleAlarm(alarm);
      dispatch({ type: 'ADD', alarm: scheduled });
    } catch (err) {
      console.error('[useAlarms] addAlarm failed', err);
    }
  }, [container]);

  const updateAlarm = useCallback(async (alarm: Alarm) => {
    try {
      if (!container.ready) return;
      const scheduled = alarm.enabled
        ? await container.scheduler.scheduleAlarm(alarm)
        : await container.scheduler.cancelAlarm(alarm);
      dispatch({ type: 'UPDATE', alarm: scheduled });
    } catch (err) {
      console.error('[useAlarms] updateAlarm failed', err);
    }
  }, [container]);

  const removeAlarm = useCallback(async (id: string) => {
    try {
      if (!container.ready) return;
      const alarm = alarmsRef.current.find(a => a.id === id);
      if (alarm) await container.scheduler.cancelAlarm(alarm);
      dispatch({ type: 'REMOVE', id });
    } catch (err) {
      console.error('[useAlarms] removeAlarm failed', err);
    }
  }, [container]);

  const toggleAlarm = useCallback(async (id: string) => {
    try {
      if (!container.ready) return;
      const alarm = alarmsRef.current.find(a => a.id === id);
      if (!alarm) return;
      const toggled: Alarm = { ...alarm, enabled: !alarm.enabled, updatedAt: Date.now() };
      const scheduled = toggled.enabled
        ? await container.scheduler.scheduleAlarm(toggled)
        : await container.scheduler.cancelAlarm(toggled);
      dispatch({ type: 'UPDATE', alarm: scheduled });
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Device may not support haptics
      }
    } catch (err) {
      console.error('[useAlarms] toggleAlarm failed', err);
    }
  }, [container]);

  const snoozeAlarm = useCallback(async (id: string) => {
    try {
      if (!container.ready) return;
      const alarm = alarmsRef.current.find(a => a.id === id);
      if (!alarm) return;
      const snoozed = await container.scheduler.snoozeAlarm(alarm);
      dispatch({ type: 'UPDATE', alarm: snoozed });
    } catch (err) {
      console.error('[useAlarms] snoozeAlarm failed', err);
    }
  }, [container]);

  return { alarms, loading, addAlarm, updateAlarm, removeAlarm, toggleAlarm, snoozeAlarm };
};

// ── useTimer (drift-corrected) ───────────────────────────────────────────

export const useTimer = () => {
  const [timer, setTimer] = useState<TimerState>(createDefaultTimer);
  const endTimeRef = useRef(0);
  const remainingRef = useRef(300);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTick(), [clearTick]);

  const tick = useCallback(() => {
    const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
    if (!Number.isFinite(remaining)) return;
    remainingRef.current = remaining;

    if (remaining <= 0) {
      clearTick();
      try {
        ServiceContainer.instance.sound.vibrate();
      } catch {
        // Container might not be ready
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimer(prev => ({ ...prev, remainingSeconds: 0, isRunning: false, isPaused: false }));
    } else {
      setTimer(prev => prev.remainingSeconds !== remaining
        ? { ...prev, remainingSeconds: remaining }
        : prev
      );
    }
  }, [clearTick]);

  const start = useCallback(() => {
    endTimeRef.current = Date.now() + remainingRef.current * 1000;
    clearTick();
    intervalRef.current = setInterval(tick, 1000);
    setTimer(prev => ({ ...prev, isRunning: true, isPaused: false }));
  }, [clearTick, tick]);

  const pause = useCallback(() => {
    clearTick();
    const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
    remainingRef.current = remaining;
    setTimer(prev => ({ ...prev, remainingSeconds: remaining, isRunning: false, isPaused: true }));
  }, [clearTick]);

  const reset = useCallback(() => {
    clearTick();
    setTimer(prev => {
      remainingRef.current = prev.durationSeconds;
      return { ...prev, remainingSeconds: prev.durationSeconds, isRunning: false, isPaused: false };
    });
  }, [clearTick]);

  const setDuration = useCallback((seconds: number) => {
    clearTick();
    remainingRef.current = seconds;
    setTimer({ durationSeconds: seconds, remainingSeconds: seconds, isRunning: false, isPaused: false });
  }, [clearTick]);

  return { timer, start, pause, reset, setDuration };
};

// ── usePomodoro (drift-corrected + haptic feedback) ──────────────────────

export const usePomodoro = () => {
  const [state, setState] = useState<PomodoroState>(createDefaultPomodoro);
  const stateRef = useRef(state);
  const endTimeRef = useRef(0);
  const remainingRef = useRef(25 * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  stateRef.current = state;

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
      const nextPhase = isLongBreak ? PomodoroPhase.LongBreak : PomodoroPhase.ShortBreak;
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
    return {
      ...current,
      phase: PomodoroPhase.Work,
      remainingSeconds: cfg.workMinutes * 60,
      isRunning: false,
      currentSession: current.currentSession + 1,
    };
  }, []);

  const tick = useCallback(() => {
    const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
    if (!Number.isFinite(remaining)) return;
    remainingRef.current = remaining;

    if (remaining <= 0) {
      clearTick();
      try {
        ServiceContainer.instance.sound.vibrate();
      } catch {
        // Container might not be ready
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      setState(prev => {
        const next = advancePhase(prev);
        remainingRef.current = next.remainingSeconds;
        return next;
      });
    } else {
      setState(prev => prev.remainingSeconds !== remaining
        ? { ...prev, remainingSeconds: remaining }
        : prev
      );
    }
  }, [clearTick, advancePhase]);

  const start = useCallback(() => {
    const s = stateRef.current;
    const isIdle = s.phase === PomodoroPhase.Idle;
    const remaining = isIdle ? s.config.workMinutes * 60 : remainingRef.current;

    remainingRef.current = remaining;
    endTimeRef.current = Date.now() + remaining * 1000;

    clearTick();
    intervalRef.current = setInterval(tick, 1000);

    setState(prev => ({
      ...prev,
      phase: isIdle ? PomodoroPhase.Work : prev.phase,
      remainingSeconds: remaining,
      isRunning: true,
    }));

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [clearTick, tick]);

  const pause = useCallback(() => {
    clearTick();
    const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
    remainingRef.current = remaining;
    setState(prev => ({ ...prev, remainingSeconds: remaining, isRunning: false }));
  }, [clearTick]);

  const reset = useCallback(() => {
    clearTick();
    const def = createDefaultPomodoro();
    remainingRef.current = def.remainingSeconds;
    setState(def);
  }, [clearTick]);

  const skip = useCallback(() => {
    clearTick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setState(prev => {
      const next = advancePhase(prev);
      remainingRef.current = next.remainingSeconds;
      return next;
    });
  }, [clearTick, advancePhase]);

  return { state, start, pause, reset, skip };
};

// ── useHistory ───────────────────────────────────────────────────────────

export const useHistory = () => {
  const [entries, setEntries] = useState<AlarmHistoryEntry[]>([]);
  const container = useMemo(() => ServiceContainer.instance, []);
  const initialLoadDone = useRef(false);

  const loadEntries = useCallback(async () => {
    try {
      if (!container.ready) return;
      const raw = await container.storage.load<unknown>(STORAGE_KEYS.HISTORY);
      const validated = validateHistoryEntries(raw);
      setEntries(validated.slice(0, 500));
      initialLoadDone.current = true;
    } catch (err) {
      console.error('[useHistory] load failed', err);
    }
  }, [container]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Persist on change after initial load
  useEffect(() => {
    if (!initialLoadDone.current) return;
    container.storage.save(STORAGE_KEYS.HISTORY, entries).catch(() => {});
  }, [entries, container]);

  const addEntry = useCallback((entry: Omit<AlarmHistoryEntry, 'id'>) => {
    const full: AlarmHistoryEntry = { ...entry, id: generateId() };
    setEntries(prev => [full, ...prev].slice(0, 500));
  }, []);

  const compliance = useMemo(() => computeComplianceRate(entries), [entries]);

  const clearHistory = useCallback(() => { setEntries([]); }, []);

  return { entries, addEntry, compliance, clearHistory, reload: loadEntries };
};

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  UI PRIMITIVES                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════╝

// ── GlassCard ────────────────────────────────────────────────────────────

const GlassCard = memo(({ children, style }: { children: React.ReactNode; style?: object }) => {
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
});

// ── IconBtn ──────────────────────────────────────────────────────────────

const IconBtn = memo(({
  name,
  size = 24,
  color,
  onPress,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  onPress: () => void;
}) => {
  const t = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: t.glassBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={size} color={color || t.textPrimary} />
    </TouchableOpacity>
  );
});

// ── FAB ──────────────────────────────────────────────────────────────────

const FAB = memo(({ onPress }: { onPress: () => void }) => {
  const t = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          bottom: 28,
          right: 24,
          width: 64,
          height: 64,
          borderRadius: 32,
          zIndex: 100,
        },
        animStyle,
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.88); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        activeOpacity={0.85}
        style={{
          flex: 1,
          borderRadius: 32,
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
});

// ── Chip ─────────────────────────────────────────────────────────────────

const Chip = memo(({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) => {
  const t = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      style={{
        paddingHorizontal: t.spacing(2),
        paddingVertical: t.spacing(1),
        borderRadius: 16,
        backgroundColor: active ? t.primaryDim : t.glassBg,
        borderWidth: 1,
        borderColor: active ? t.primary : t.glassBorder,
        marginRight: t.spacing(1),
        marginBottom: t.spacing(1),
        minHeight: 36,
        justifyContent: 'center',
      }}
    >
      <Text style={[typo.caption, { color: active ? t.primary : t.textSecondary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

// ── CircularProgress ─────────────────────────────────────────────────────

const CircularProgress = memo(({
  size,
  strokeWidth,
  progress,
  color,
  trackColor,
  children,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  trackColor?: string;
  children?: React.ReactNode;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <SvgCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor || 'rgba(255,255,255,0.06)'}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <SvgCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation={-90}
          originX={center}
          originY={center}
        />
      </Svg>
      {children}
    </View>
  );
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  WHEEL PICKER                                                        ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const WHEEL_ITEM_H = 56;
const WHEEL_VISIBLE = 5;
const WHEEL_HEIGHT = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_PAD = WHEEL_ITEM_H * Math.floor(WHEEL_VISIBLE / 2);

const WheelItem = memo(({ num, padZero }: { num: number; padZero: boolean }) => (
  <View style={{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontFamily: MONO, fontSize: 22, color: '#EAEAFF' }}>
      {padZero ? num.toString().padStart(2, '0') : num.toString()}
    </Text>
  </View>
));

const wheelKeyExtractor = (item: number) => item.toString();
const wheelGetItemLayout = (_: unknown, index: number) => ({
  length: WHEEL_ITEM_H,
  offset: WHEEL_ITEM_H * index,
  index,
});

const WheelPicker = memo(({
  range,
  value,
  onChange,
  padZero = true,
}: {
  range: number;
  value: number;
  onChange: (v: number) => void;
  padZero?: boolean;
}) => {
  const t = useTheme();
  const data = useMemo(() => Array.from({ length: range }, (_, i) => i), [range]);
  const flatRef = useRef<FlatList<number>>(null);
  const currentValueRef = useRef(value);
  const lastHapticIdx = useRef(value);
  const scrollSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
  return () => {
    if (scrollSettleTimer.current) {
      clearTimeout(scrollSettleTimer.current);
    }
  };
}, []);

  const isMounted = useRef(false);

  // Scroll to initial value on mount
  useEffect(() => {
    if (isMounted.current) return;
    isMounted.current = true;
    requestAnimationFrame(() => {
      flatRef.current?.scrollToOffset({ offset: value * WHEEL_ITEM_H, animated: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll when value changes externally
  useEffect(() => {
    if (currentValueRef.current !== value) {
      currentValueRef.current = value;
      flatRef.current?.scrollToOffset({ offset: value * WHEEL_ITEM_H, animated: true });
    }
  }, [value]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<number>) => <WheelItem num={item} padZero={padZero} />,
    [padZero]
  );

  // Haptic feedback on index change during scroll
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / WHEEL_ITEM_H);
    const clamped = Math.max(0, Math.min(range - 1, idx));
    if (clamped !== lastHapticIdx.current) {
      lastHapticIdx.current = clamped;
      Haptics.selectionAsync().catch(() => {});
    }
  }, [range]);

// Settle value after scroll ends
const settleValue = useCallback((y: number) => {
  const idx = Math.floor((y + WHEEL_ITEM_H / 2) / WHEEL_ITEM_H);
  const clamped = Math.max(0, Math.min(range - 1, idx));

  if (clamped !== currentValueRef.current) {
    currentValueRef.current = clamped;

    try {
      Haptics.selectionAsync();
    } catch {}

    onChange(clamped);
  }
}, [range, onChange]);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    settleValue(e.nativeEvent.contentOffset.y);
  }, [settleValue]);

  const onScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
    const y = e.nativeEvent.contentOffset.y;
    scrollSettleTimer.current = setTimeout(() => settleValue(y), 200);
  }, [settleValue]);

  return (
    <View style={{ height: WHEEL_HEIGHT, width: 80, overflow: 'hidden' }}>
      <FlatList
  ref={flatRef}
  data={data}
  keyExtractor={wheelKeyExtractor}
  renderItem={renderItem}
  getItemLayout={wheelGetItemLayout}

  snapToInterval={WHEEL_ITEM_H}
  snapToAlignment="center"
  decelerationRate="fast"
  disableIntervalMomentum

  showsVerticalScrollIndicator={false}
  scrollEnabled={true}
  bounces={false}

  onScroll={onScroll}
  scrollEventThrottle={16}
  onMomentumScrollEnd={onMomentumEnd}
  onScrollEndDrag={onScrollEndDrag}

  contentContainerStyle={{ paddingVertical: WHEEL_PAD }}

  removeClippedSubviews={true}
initialNumToRender={5}
windowSize={5}
maxToRenderPerBatch={5}
/>
      {/* Top/Bottom dimming masks + center highlight */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <View style={{ height: WHEEL_PAD, backgroundColor: 'rgba(10,14,26,0.75)' }} />
        <View style={{
          height: WHEEL_ITEM_H,
          borderTopWidth: 2,
          borderBottomWidth: 2,
          borderColor: t.primary + '44',
          backgroundColor: 'rgba(108,99,255,0.06)',
        }} />
        <View style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.75)' }} />
      </View>
    </View>
  );
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  ALARM CARD                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const AlarmCard = memo(({
  alarm,
  onToggle,
  onPress,
  onDelete,
}: {
  alarm: Alarm;
  onToggle: (id: string) => void;
  onPress: (alarm: Alarm) => void;
  onDelete: (id: string) => void;
}) => {
  const t = useTheme();
  const swipeRef = useRef<Swipeable>(null);

  const handleToggle = useCallback(() => onToggle(alarm.id), [onToggle, alarm.id]);
  const handlePress = useCallback(() => onPress(alarm), [onPress, alarm]);
  const handleDelete = useCallback(() => {
    swipeRef.current?.close();
    setTimeout(() => onDelete(alarm.id), 150);
  }, [onDelete, alarm.id]);

  const renderRight = useCallback(() => (
    <RectButton
      style={{
        backgroundColor: t.danger,
        justifyContent: 'center',
        alignItems: 'center',
        width: 88,
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
      }}
      onPress={handleDelete}
    >
      <Ionicons name="trash-outline" size={24} color="#fff" />
      <Text style={[typo.caption, { color: '#fff', marginTop: 2 }]}>Delete</Text>
    </RectButton>
  ), [t, handleDelete]);

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
        rightThreshold={40}
      >
        <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
          <GlassCard
            style={{
              marginHorizontal: DarkTheme.spacing(2),
              marginBottom: DarkTheme.spacing(1.5),
              opacity: alarm.enabled ? 1 : 0.5,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    typo.h2,
                    { color: alarm.enabled ? t.textPrimary : t.textMuted, letterSpacing: 1 },
                  ]}
                >
                  {formatAlarmTime(alarm.time)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={[typo.caption, { color: t.textSecondary }]}>{alarm.label}</Text>
                  <Text style={[typo.caption, { color: t.textMuted, marginLeft: 8 }]}>
                    {repeatLabel}
                  </Text>
                </View>
                {alarm.enabled && timeUntil && (
                  <Text style={[typo.caption, { color: t.accent, marginTop: 2 }]}>
                    in {timeUntil}
                  </Text>
                )}
              </View>
              <Switch
                value={alarm.enabled}
                onValueChange={handleToggle}
                trackColor={{ false: t.textMuted, true: t.primaryDim }}
                thumbColor={alarm.enabled ? t.primary : t.textSecondary}
              />
            </View>
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
              {alarm.snoozeEnabled && <Ionicons name="alarm-outline" size={14} color={t.textMuted} />}
              {alarm.vibrationEnabled && <Ionicons name="phone-portrait-outline" size={14} color={t.textMuted} />}
              {alarm.gradualVolume && <Ionicons name="volume-low-outline" size={14} color={t.textMuted} />}
              {alarm.dismissChallenge !== DismissChallenge.None && (
                <Ionicons name="game-controller-outline" size={14} color={t.textMuted} />
              )}
            </View>
          </GlassCard>
        </TouchableOpacity>
      </Swipeable>
    </Animated.View>
  );
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  ALARM EDITOR MODAL                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════╝

export const AlarmEditorModal = memo(({
  visible,
  alarm: existingAlarm,
  onSave,
  onClose,
}: {
  visible: boolean;
  alarm: Alarm | null;
  onSave: (alarm: Alarm) => void;
  onClose: () => void;
}) => {
  const t = useTheme();
  const [draft, setDraft] = useState<Mutable<Alarm>>(() => createDefaultAlarm() as Mutable<Alarm>);

  useEffect(() => {
    if (visible) {
      const base = existingAlarm ?? createDefaultAlarm();
      setDraft({ ...base, customDays: [...base.customDays] } as Mutable<Alarm>);
    }
  }, [visible, existingAlarm]);

  const update = useCallback(<K extends keyof Alarm>(key: K, value: Alarm[K]) => {
    setDraft(prev => ({ ...prev, [key]: value, updatedAt: Date.now() }));
  }, []);

  const updateTime = useCallback(<K extends keyof AlarmTime>(key: K, value: number) => {
    setDraft(prev => ({ ...prev, time: { ...prev.time, [key]: value }, updatedAt: Date.now() }));
  }, []);

  const toggleDay = useCallback((day: number) => {
    setDraft(prev => {
      const days = prev.customDays.includes(day)
        ? prev.customDays.filter(d => d !== day)
        : [...prev.customDays, day].sort();
      return { ...prev, customDays: days };
    });
  }, []);

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const repeatOptions: { mode: RepeatMode; label: string }[] = [
    { mode: RepeatMode.Once, label: 'Once' },
    { mode: RepeatMode.Daily, label: 'Daily' },
    { mode: RepeatMode.Weekdays, label: 'Weekdays' },
    { mode: RepeatMode.Weekend, label: 'Weekend' },
    { mode: RepeatMode.Custom, label: 'Custom' },
    { mode: RepeatMode.Periodic, label: 'Periodic' },
  ];

  const challengeOptions: { ch: DismissChallenge; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { ch: DismissChallenge.None, label: 'None', icon: 'close-circle-outline' },
    { ch: DismissChallenge.Math, label: 'Math', icon: 'calculator-outline' },
    { ch: DismissChallenge.Shake, label: 'Shake', icon: 'phone-portrait-outline' },
    { ch: DismissChallenge.TypePhrase, label: 'Type', icon: 'text-outline' },
    { ch: DismissChallenge.MemoryPattern, label: 'Memory', icon: 'grid-outline' },
  ];

  const handleSave = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSave(draft as Alarm);
  }, [draft, onSave]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[typo.body, { color: t.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[typo.h3, { color: t.textPrimary }]}>
            {existingAlarm ? 'Edit Alarm' : 'New Alarm'}
          </Text>
          <TouchableOpacity onPress={handleSave} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[typo.body, { color: t.primary, fontWeight: '600' }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
  nestedScrollEnabled
  keyboardShouldPersistTaps="handled"
  showsVerticalScrollIndicator={false}
  contentContainerStyle={{ padding: t.spacing(2), paddingBottom: 120 }}
>
          {/* Time Picker */}
          <GlassCard style={{ marginBottom: t.spacing(2) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
              <WheelPicker range={24} value={draft.time.hour} onChange={v => updateTime('hour', v)} />
              <Text style={[typo.h1, { color: t.primary, marginHorizontal: 4 }]}>:</Text>
              <WheelPicker range={60} value={draft.time.minute} onChange={v => updateTime('minute', v)} />
              <Text style={[typo.h1, { color: t.primary, marginHorizontal: 4 }]}>:</Text>
              <WheelPicker range={60} value={draft.time.second} onChange={v => updateTime('second', v)} />
            </View>
          </GlassCard>

          {/* Label */}
          <GlassCard style={{ marginBottom: t.spacing(2) }}>
            <Text style={[typo.caption, { color: t.textSecondary, marginBottom: 4 }]}>Label</Text>
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
                  minHeight: 44,
                },
              ]}
            />
          </GlassCard>

          {/* Repeat */}
          <GlassCard style={{ marginBottom: t.spacing(2) }}>
            <Text style={[typo.caption, { color: t.textSecondary, marginBottom: 8 }]}>Repeat</Text>
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
                {dayLabels.map((label, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => toggleDay(idx)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: draft.customDays.includes(idx) ? t.primary : t.glassBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: draft.customDays.includes(idx) ? t.primary : t.glassBorder,
                    }}
                  >
                    <Text
                      style={[
                        typo.caption,
                        {
                          color: draft.customDays.includes(idx) ? '#fff' : t.textSecondary,
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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <Text style={[typo.body, { color: t.textSecondary }]}>Every </Text>
                <TextInput
                  keyboardType="number-pad"
                  value={draft.periodicIntervalDays.toString()}
                  onChangeText={txt => {
                    const n = parseInt(txt, 10);
                    if (!isNaN(n) && n > 0) update('periodicIntervalDays', n);
                  }}
                  style={[
                    typo.body,
                    {
                      color: t.primary,
                      backgroundColor: t.surfaceLight,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 4,
                      width: 64,
                      textAlign: 'center',
                      minHeight: 40,
                    },
                  ]}
                />
                <Text style={[typo.body, { color: t.textSecondary }]}> day(s)</Text>
              </View>
            )}
          </GlassCard>

          {/* Snooze */}
          <GlassCard style={{ marginBottom: t.spacing(2) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="alarm-outline" size={18} color={t.textSecondary} />
                <Text style={[typo.body, { color: t.textPrimary, marginLeft: 8 }]}>Snooze</Text>
              </View>
              <Switch
                value={draft.snoozeEnabled}
                onValueChange={v => update('snoozeEnabled', v)}
                trackColor={{ false: t.textMuted, true: t.primaryDim }}
                thumbColor={draft.snoozeEnabled ? t.primary : t.textSecondary}
              />
            </View>
            {draft.snoozeEnabled && (
              <View style={{ marginTop: 12 }}>
                <Text style={[typo.caption, { color: t.textSecondary }]}>
                  Duration: {draft.snoozeDurationMinutes} min · Max: {draft.maxSnoozeCount}x
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' }}>
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="volume-high-outline" size={18} color={t.textSecondary} />
                <Text style={[typo.body, { color: t.textPrimary, marginLeft: 8 }]}>Gradual Volume</Text>
              </View>
              <Switch
                value={draft.gradualVolume}
                onValueChange={v => update('gradualVolume', v)}
                trackColor={{ false: t.textMuted, true: t.primaryDim }}
                thumbColor={draft.gradualVolume ? t.primary : t.textSecondary}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="phone-portrait-outline" size={18} color={t.textSecondary} />
                <Text style={[typo.body, { color: t.textPrimary, marginLeft: 8 }]}>Vibration</Text>
              </View>
              <Switch
                value={draft.vibrationEnabled}
                onValueChange={v => update('vibrationEnabled', v)}
                trackColor={{ false: t.textMuted, true: t.primaryDim }}
                thumbColor={draft.vibrationEnabled ? t.primary : t.textSecondary}
              />
            </View>
          </GlassCard>

          {/* Dismiss Challenge */}
          <GlassCard style={{ marginBottom: t.spacing(2) }}>
            <Text style={[typo.caption, { color: t.textSecondary, marginBottom: 8 }]}>
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
                    backgroundColor: draft.dismissChallenge === opt.ch ? t.primaryDim : t.glassBg,
                    borderWidth: 1,
                    borderColor: draft.dismissChallenge === opt.ch ? t.primary : t.glassBorder,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    marginRight: 8,
                    marginBottom: 8,
                    minHeight: 44,
                  }}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={draft.dismissChallenge === opt.ch ? t.primary : t.textSecondary}
                  />
                  <Text
                    style={[
                      typo.caption,
                      {
                        color: draft.dismissChallenge === opt.ch ? t.primary : t.textSecondary,
                        marginLeft: 6,
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
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  DISMISS CHALLENGE MODAL                                             ║
// ╚═══════════════════════════════════════════════════════════════════════╝

export const DismissChallengeModal = memo(({
  visible,
  challenge,
  onDismiss,
}: {
  visible: boolean;
  challenge: DismissChallenge;
  onDismiss: () => void;
}) => {
  const t = useTheme();
  const [mathQ, setMathQ] = useState(() => generateMathChallenge());
  const [answer, setAnswer] = useState('');
  const [pattern, setPattern] = useState<number[]>([]);
  const [userPattern, setUserPattern] = useState<number[]>([]);
  const [phase, setPhase] = useState<'show' | 'input'>('show');
  const [typeTarget] = useState('WAKE UP NOW');
  const [typeInput, setTypeInput] = useState('');

  // Auto-dismiss for "None" challenge
  useEffect(() => {
    if (visible && challenge === DismissChallenge.None) {
      onDismiss();
    }
  }, [visible, challenge, onDismiss]);

  useEffect(() => {
    if (!visible) return;
    setMathQ(generateMathChallenge());
    setAnswer('');
    setTypeInput('');
    setUserPattern([]);
    setPhase('show');

    if (challenge === DismissChallenge.MemoryPattern) {
      const p = generateMemoryPattern(4);
      setPattern(p);
      const timer = setTimeout(() => setPhase('input'), 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, challenge]);

  const checkMath = useCallback(() => {
    if (parseInt(answer, 10) === mathQ.answer) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDismiss();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [answer, mathQ, onDismiss]);

  const checkType = useCallback(() => {
    if (typeInput.toUpperCase().trim() === typeTarget) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDismiss();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [typeInput, typeTarget, onDismiss]);

  const tapCell = useCallback((idx: number) => {
    Haptics.selectionAsync().catch(() => {});
    const next = [...userPattern, idx];
    setUserPattern(next);
    if (next.length === pattern.length) {
      if (next.every((v, i) => v === pattern[i])) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onDismiss();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setUserPattern([]);
        const p = generateMemoryPattern(4);
        setPattern(p);
        setPhase('show');
        setTimeout(() => setPhase('input'), 3000);
      }
    }
  }, [userPattern, pattern, onDismiss]);

  if (challenge === DismissChallenge.None) return null;

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
        <GlassCard style={{ width: '100%', maxWidth: 360, padding: t.spacing(3) }}>
          {challenge === DismissChallenge.Math && (
            <>
              <Text style={[typo.h3, { color: t.textPrimary, textAlign: 'center', marginBottom: 16 }]}>
                Solve to dismiss
              </Text>
              <Text style={[typo.h1, { color: t.primary, textAlign: 'center', marginBottom: 20 }]}>
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
                    minHeight: 52,
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
                  minHeight: 48,
                  justifyContent: 'center',
                }}
              >
                <Text style={[typo.body, { color: '#fff', fontWeight: '600' }]}>Submit</Text>
              </TouchableOpacity>
            </>
          )}

          {challenge === DismissChallenge.TypePhrase && (
            <>
              <Text style={[typo.h3, { color: t.textPrimary, textAlign: 'center', marginBottom: 16 }]}>
                Type this phrase
              </Text>
              <Text
                style={[typo.h2, { color: t.accent, textAlign: 'center', marginBottom: 20, letterSpacing: 2 }]}
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
                    minHeight: 48,
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
                  minHeight: 48,
                  justifyContent: 'center',
                }}
              >
                <Text style={[typo.body, { color: '#fff', fontWeight: '600' }]}>Submit</Text>
              </TouchableOpacity>
            </>
          )}

          {challenge === DismissChallenge.MemoryPattern && (
            <>
              <Text style={[typo.h3, { color: t.textPrimary, textAlign: 'center', marginBottom: 16 }]}>
                {phase === 'show' ? 'Memorize the pattern' : 'Repeat the pattern'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {Array.from({ length: 9 }, (_, i) => {
                  const isHighlighted = phase === 'show' && pattern.includes(i);
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
              <Text style={[typo.h3, { color: t.textPrimary, textAlign: 'center', marginBottom: 16 }]}>
                Shake your phone!
              </Text>
              <Text style={[typo.caption, { color: t.textSecondary, textAlign: 'center', marginBottom: 20 }]}>
                Shake vigorously to dismiss the alarm
              </Text>
              <TouchableOpacity
                onPress={onDismiss}
                style={{
                  backgroundColor: t.primary,
                  borderRadius: 16,
                  padding: t.spacing(1.5),
                  alignItems: 'center',
                  minHeight: 48,
                  justifyContent: 'center',
                }}
              >
                <Text style={[typo.body, { color: '#fff', fontWeight: '600' }]}>Simulate Shake</Text>
              </TouchableOpacity>
            </>
          )}
        </GlassCard>
      </View>
    </Modal>
  );
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  SCREENS                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════╝

// ── Alarms Screen ────────────────────────────────────────────────────────

export const AlarmsScreen = memo(() => {
  const t = useTheme();
  const { alarms, loading, addAlarm, updateAlarm, removeAlarm, toggleAlarm } = useAlarms();
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);

  const openEditor = useCallback((alarm?: Alarm) => {
    setEditingAlarm(alarm ?? null);
    setEditorVisible(true);
  }, []);

  const handleSave = useCallback(async (alarm: Alarm) => {
    if (editingAlarm) {
      await updateAlarm(alarm);
    } else {
      await addAlarm(alarm);
    }
    setEditorVisible(false);
  }, [editingAlarm, updateAlarm, addAlarm]);

  const sortedAlarms = useMemo(
    () =>
      [...alarms].sort((a, b) => {
        const aT = a.time.hour * 3600 + a.time.minute * 60 + a.time.second;
        const bT = b.time.hour * 3600 + b.time.minute * 60 + b.time.second;
        return aT - bT;
      }),
    [alarms]
  );

  const handleToggle = useCallback((id: string) => toggleAlarm(id), [toggleAlarm]);
  const handlePress = useCallback((alarm: Alarm) => openEditor(alarm), [openEditor]);
  const handleDelete = useCallback((id: string) => removeAlarm(id), [removeAlarm]);

  const keyExtractor = useCallback((item: Alarm) => item.id, []);

  const renderAlarm = useCallback(
    ({ item }: ListRenderItemInfo<Alarm>) => (
      <AlarmCard
        alarm={item}
        onToggle={handleToggle}
        onPress={handlePress}
        onDelete={handleDelete}
      />
    ),
    [handleToggle, handlePress, handleDelete]
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={t.primary} size="large" />
      </View>
    );
  }

  const activeCount = alarms.filter(a => a.enabled).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: t.spacing(2), paddingTop: t.spacing(6), paddingBottom: t.spacing(2) }}>
        <Text style={[typo.h1, { color: t.textPrimary }]}>Alarms</Text>
        <Text style={[typo.caption, { color: t.textSecondary, marginTop: 4 }]}>
          {activeCount} active
        </Text>
      </View>

      {alarms.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: t.spacing(4) }}>
          <Ionicons name="alarm-outline" size={72} color={t.textMuted} />
          <Text style={[typo.h3, { color: t.textMuted, marginTop: 20, textAlign: 'center' }]}>
            No alarms yet
          </Text>
          <Text style={[typo.body, { color: t.textMuted, marginTop: 8, textAlign: 'center' }]}>
            Tap + to create your first alarm
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

// ── Timer Screen ─────────────────────────────────────────────────────────

export const TimerScreen = memo(() => {
  const t = useTheme();
  const { timer, start, pause, reset, setDuration } = useTimer();

  const progress = useMemo(() => {
    if (timer.durationSeconds === 0) return 0;
    return 1 - timer.remainingSeconds / timer.durationSeconds;
  }, [timer.remainingSeconds, timer.durationSeconds]);

  const presets = [60, 180, 300, 600, 900, 1800];

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
    opacity: 0.85 + pulse.value * 0.15,
    transform: [{ scale: 1 + pulse.value * 0.015 }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', paddingTop: t.spacing(6) }}>
      <Text style={[typo.h1, { color: t.textPrimary, marginBottom: t.spacing(4) }]}>Timer</Text>

      <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, pulseStyle]}>
        <CircularProgress
          size={270}
          strokeWidth={6}
          progress={progress}
          color={timer.isRunning ? t.primary : t.textMuted}
          trackColor={t.glassBorder}
        >
          <Text style={[typo.mono, { color: t.textPrimary }]}>{formatSeconds(timer.remainingSeconds)}</Text>
          {timer.isRunning && (
            <Text style={[typo.caption, { color: t.accent, marginTop: 4 }]}>
              {Math.round(progress * 100)}%
            </Text>
          )}
        </CircularProgress>
      </Animated.View>

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

      <View style={{ flexDirection: 'row', gap: 16, marginTop: t.spacing(4) }}>
        {timer.isRunning ? (
          <TouchableOpacity
            onPress={pause}
            style={{
              backgroundColor: t.warning,
              paddingHorizontal: 36,
              paddingVertical: 16,
              borderRadius: 28,
              minHeight: 52,
              justifyContent: 'center',
            }}
          >
            <Text style={[typo.body, { color: '#fff', fontWeight: '600' }]}>Pause</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={start}
            style={{
              backgroundColor: t.primary,
              paddingHorizontal: 36,
              paddingVertical: 16,
              borderRadius: 28,
              minHeight: 52,
              justifyContent: 'center',
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
            paddingHorizontal: 36,
            paddingVertical: 16,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: t.glassBorder,
            minHeight: 52,
            justifyContent: 'center',
          }}
        >
          <Text style={[typo.body, { color: t.textSecondary }]}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ── Pomodoro Screen ──────────────────────────────────────────────────────

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

  const phaseTotal = useMemo(() => {
    const cfg = state.config;
    switch (state.phase) {
      case PomodoroPhase.Work:
        return cfg.workMinutes * 60;
      case PomodoroPhase.ShortBreak:
        return cfg.shortBreakMinutes * 60;
      case PomodoroPhase.LongBreak:
        return cfg.longBreakMinutes * 60;
      default:
        return cfg.workMinutes * 60;
    }
  }, [state.phase, state.config]);

  const progress = useMemo(() => {
    if (phaseTotal === 0) return 0;
    return 1 - state.remainingSeconds / phaseTotal;
  }, [state.remainingSeconds, phaseTotal]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', paddingTop: t.spacing(6) }}>
      <Text style={[typo.h1, { color: t.textPrimary, marginBottom: t.spacing(2) }]}>Pomodoro</Text>

      <View
        style={{
          backgroundColor: phaseColor + '20',
          paddingHorizontal: 20,
          paddingVertical: 8,
          borderRadius: 16,
          marginBottom: t.spacing(3),
        }}
      >
        <Text style={[typo.body, { color: phaseColor, fontWeight: '600' }]}>
          {PHASE_LABELS[state.phase]}
        </Text>
      </View>

      <CircularProgress
        size={250}
        strokeWidth={6}
        progress={progress}
        color={phaseColor}
        trackColor={t.glassBorder}
      >
        <Text style={[typo.mono, { color: t.textPrimary, fontSize: 44 }]}>
          {formatSeconds(state.remainingSeconds)}
        </Text>
        <Text style={[typo.caption, { color: t.textSecondary, marginTop: 4 }]}>
          Session {state.currentSession}
        </Text>
      </CircularProgress>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: t.spacing(4) }}>
        {state.isRunning ? (
          <TouchableOpacity
            onPress={pause}
            style={{
              backgroundColor: t.warning,
              paddingHorizontal: 32,
              paddingVertical: 16,
              borderRadius: 28,
              minHeight: 52,
              justifyContent: 'center',
            }}
          >
            <Text style={[typo.body, { color: '#fff', fontWeight: '600' }]}>Pause</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={start}
            style={{
              backgroundColor: t.primary,
              paddingHorizontal: 32,
              paddingVertical: 16,
              borderRadius: 28,
              minHeight: 52,
              justifyContent: 'center',
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

      <View
        style={{
          flexDirection: 'row',
          gap: 16,
          marginTop: t.spacing(4),
          paddingHorizontal: t.spacing(2),
        }}
      >
        <GlassCard style={{ flex: 1, alignItems: 'center', padding: t.spacing(2) }}>
          <Ionicons name="checkmark-circle-outline" size={24} color={t.success} />
          <Text style={[typo.h3, { color: t.textPrimary, marginTop: 4 }]}>
            {state.totalSessionsCompleted}
          </Text>
          <Text style={[typo.caption, { color: t.textSecondary }]}>Sessions</Text>
        </GlassCard>
        <GlassCard style={{ flex: 1, alignItems: 'center', padding: t.spacing(2) }}>
          <Ionicons name="time-outline" size={24} color={t.accent} />
          <Text style={[typo.h3, { color: t.textPrimary, marginTop: 4 }]}>
            {state.totalWorkMinutes}
          </Text>
          <Text style={[typo.caption, { color: t.textSecondary }]}>Minutes</Text>
        </GlassCard>
      </View>
    </View>
  );
});

// ── History Screen ───────────────────────────────────────────────────────

const STATUS_ICONS: Record<
  AlarmHistoryStatus,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  [AlarmHistoryStatus.OnTime]: { icon: 'checkmark-circle', color: DarkTheme.success },
  [AlarmHistoryStatus.Snoozed]: { icon: 'alarm', color: DarkTheme.warning },
  [AlarmHistoryStatus.Dismissed]: { icon: 'close-circle', color: DarkTheme.textSecondary },
  [AlarmHistoryStatus.Missed]: { icon: 'alert-circle', color: DarkTheme.danger },
};

export const HistoryScreen = memo(() => {
  const t = useTheme();
  const { entries, compliance, clearHistory, reload } = useHistory();

  // Refresh when tab gains focus
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const keyExtractor = useCallback((item: AlarmHistoryEntry) => item.id, []);

  const renderEntry = useCallback(
    ({ item }: ListRenderItemInfo<AlarmHistoryEntry>) => {
      const si = STATUS_ICONS[item.status] ?? STATUS_ICONS[AlarmHistoryStatus.Missed];
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
              <Text style={[typo.body, { color: DarkTheme.textPrimary }]}>{item.alarmLabel}</Text>
              <Text style={[typo.caption, { color: DarkTheme.textSecondary }]}>
                {date.toLocaleDateString()} {date.toLocaleTimeString()}
              </Text>
            </View>
            <Text style={[typo.caption, { color: si.color, textTransform: 'capitalize' }]}>
              {item.status.replace('_', ' ')}
            </Text>
          </GlassCard>
        </Animated.View>
      );
    },
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: t.spacing(2), paddingTop: t.spacing(6), paddingBottom: t.spacing(2) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[typo.h1, { color: t.textPrimary }]}>History</Text>
          {entries.length > 0 && (
            <TouchableOpacity onPress={clearHistory} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[typo.caption, { color: t.danger }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
          <Text style={[typo.caption, { color: t.textSecondary }]}>Compliance Rate</Text>
          <Text style={[typo.body, { color: t.textSecondary, marginTop: 2 }]}>
            {entries.length} total entries
          </Text>
        </View>
        <CircularProgress
          size={56}
          strokeWidth={4}
          progress={compliance / 100}
          color={compliance >= 80 ? t.success : compliance >= 50 ? t.warning : t.danger}
        >
          <Text
            style={[
              typo.caption,
              {
                color: compliance >= 80 ? t.success : compliance >= 50 ? t.warning : t.danger,
                fontWeight: '700',
                fontSize: 14,
              },
            ]}
          >
            {compliance}%
          </Text>
        </CircularProgress>
      </GlassCard>

      {entries.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: t.spacing(4) }}>
          <Ionicons name="analytics-outline" size={72} color={t.textMuted} />
          <Text style={[typo.h3, { color: t.textMuted, marginTop: 20, textAlign: 'center' }]}>
            No history yet
          </Text>
          <Text style={[typo.body, { color: t.textMuted, marginTop: 8, textAlign: 'center' }]}>
            Your alarm activity will appear here
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