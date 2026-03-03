// ========================================================================
// core.ts — Domain Models · Service Interfaces · Implementations · DI · Engine
// Clean Architecture: Domain → Data boundary. No UI concerns.
// ========================================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as Haptics from 'expo-haptics';

// ────────────────────────────────────────────
// DOMAIN — Enums
// ────────────────────────────────────────────

export enum RepeatMode {
  Once = 'once',
  Daily = 'daily',
  Weekdays = 'weekdays',
  Weekend = 'weekend',
  Custom = 'custom',
  Periodic = 'periodic',
}

export enum DismissChallenge {
  None = 'none',
  Math = 'math',
  Shake = 'shake',
  TypePhrase = 'type_phrase',
  MemoryPattern = 'memory_pattern',
}

export enum AlarmHistoryStatus {
  OnTime = 'on_time',
  Snoozed = 'snoozed',
  Dismissed = 'dismissed',
  Missed = 'missed',
}

export enum PomodoroPhase {
  Work = 'work',
  ShortBreak = 'short_break',
  LongBreak = 'long_break',
  Idle = 'idle',
}

// ────────────────────────────────────────────
// DOMAIN — Models
// ────────────────────────────────────────────

export interface AlarmTime {
  hour: number;
  minute: number;
  second: number;
}

export interface Alarm {
  readonly id: string;
  label: string;
  time: AlarmTime;
  enabled: boolean;
  repeatMode: RepeatMode;
  customDays: number[];
  periodicIntervalDays: number;
  snoozeEnabled: boolean;
  snoozeDurationMinutes: number;
  maxSnoozeCount: number;
  currentSnoozeCount: number;
  gradualVolume: boolean;
  vibrationEnabled: boolean;
  vibrationPattern: number[];
  dismissChallenge: DismissChallenge;
  soundName: string;
  volume: number;
  notificationIds: string[];
  createdAt: number;
  updatedAt: number;
  sortOrder: number;
}

export interface AlarmHistoryEntry {
  readonly id: string;
  alarmId: string;
  alarmLabel: string;
  scheduledTime: number;
  actualTime: number;
  status: AlarmHistoryStatus;
  snoozeCount: number;
}

export interface TimerState {
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
}

export interface PomodoroConfig {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
}

export interface PomodoroState {
  phase: PomodoroPhase;
  remainingSeconds: number;
  isRunning: boolean;
  currentSession: number;
  totalSessionsCompleted: number;
  totalWorkMinutes: number;
  config: PomodoroConfig;
}

// ────────────────────────────────────────────
// DOMAIN — Factory Functions
// ────────────────────────────────────────────

export const generateId = (): string =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const createDefaultAlarm = (overrides?: Partial<Alarm>): Alarm => ({
  id: generateId(),
  label: 'Alarm',
  time: { hour: 7, minute: 0, second: 0 },
  enabled: true,
  repeatMode: RepeatMode.Once,
  customDays: [],
  periodicIntervalDays: 1,
  snoozeEnabled: true,
  snoozeDurationMinutes: 5,
  maxSnoozeCount: 3,
  currentSnoozeCount: 0,
  gradualVolume: false,
  vibrationEnabled: true,
  vibrationPattern: [0, 400, 200, 400],
  dismissChallenge: DismissChallenge.None,
  soundName: 'default',
  volume: 0.8,
  notificationIds: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sortOrder: 0,
  ...overrides,
});

export const createDefaultTimer = (): TimerState => ({
  durationSeconds: 300,
  remainingSeconds: 300,
  isRunning: false,
  isPaused: false,
});

export const createDefaultPomodoro = (): PomodoroState => ({
  phase: PomodoroPhase.Idle,
  remainingSeconds: 25 * 60,
  isRunning: false,
  currentSession: 1,
  totalSessionsCompleted: 0,
  totalWorkMinutes: 0,
  config: {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
  },
});

// ────────────────────────────────────────────
// DOMAIN — Pure Utility Functions
// ────────────────────────────────────────────

/** Calculate the next trigger date from now, handling DST and timezone via native Date */
export const calculateNextTrigger = (
  alarm: Alarm,
  from: Date = new Date()
): Date | null => {
  if (!alarm.enabled) return null;

  const buildTarget = (base: Date): Date => {
    const t = new Date(base);
    t.setHours(alarm.time.hour, alarm.time.minute, alarm.time.second, 0);
    return t;
  };

  const target = buildTarget(from);

  switch (alarm.repeatMode) {
    case RepeatMode.Once:
    case RepeatMode.Daily: {
      if (target <= from) target.setDate(target.getDate() + 1);
      return target;
    }
    case RepeatMode.Weekdays:
      return findNextDayInSet(target, from, [1, 2, 3, 4, 5]);
    case RepeatMode.Weekend:
      return findNextDayInSet(target, from, [0, 6]);
    case RepeatMode.Custom: {
      if (alarm.customDays.length === 0) return null;
      return findNextDayInSet(target, from, alarm.customDays);
    }
    case RepeatMode.Periodic: {
      if (target <= from) {
        target.setDate(target.getDate() + alarm.periodicIntervalDays);
      }
      return target;
    }
  }
};

const findNextDayInSet = (
  target: Date,
  now: Date,
  validDays: number[]
): Date => {
  const result = new Date(target);
  for (let offset = 0; offset < 8; offset++) {
    const candidate = new Date(result);
    candidate.setDate(result.getDate() + offset);
    if (validDays.includes(candidate.getDay()) && candidate > now) {
      return candidate;
    }
  }
  result.setDate(result.getDate() + 7);
  return result;
};

export const formatSeconds = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const formatAlarmTime = (time: AlarmTime): string => {
  const period = time.hour >= 12 ? 'PM' : 'AM';
  const h = time.hour % 12 || 12;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${h}:${pad(time.minute)}:${pad(time.second)} ${period}`;
};

export const getTimeUntilAlarm = (alarm: Alarm): string | null => {
  const next = calculateNextTrigger(alarm);
  if (!next) return null;
  const diffMs = next.getTime() - Date.now();
  if (diffMs <= 0) return 'Now';
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
};

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const getRepeatLabel = (alarm: Alarm): string => {
  switch (alarm.repeatMode) {
    case RepeatMode.Once: return 'Once';
    case RepeatMode.Daily: return 'Every day';
    case RepeatMode.Weekdays: return 'Weekdays';
    case RepeatMode.Weekend: return 'Weekends';
    case RepeatMode.Custom:
      return alarm.customDays.map(d => DAY_NAMES_SHORT[d]).join(', ') || 'None';
    case RepeatMode.Periodic:
      return `Every ${alarm.periodicIntervalDays} day(s)`;
  }
};

/** Generate random math challenge */
export const generateMathChallenge = (): {
  question: string;
  answer: number;
} => {
  const a = Math.floor(Math.random() * 40) + 12;
  const b = Math.floor(Math.random() * 30) + 5;
  const operations = [
    { symbol: '+', fn: (x: number, y: number) => x + y },
    { symbol: '−', fn: (x: number, y: number) => x - y },
    { symbol: '×', fn: (x: number, y: number) => x * y },
  ] as const;
  const op = operations[Math.floor(Math.random() * operations.length)];
  return { question: `${a} ${op.symbol} ${b}`, answer: op.fn(a, b) };
};

/** Generate random memory pattern (indices 0–8 for 3×3 grid) */
export const generateMemoryPattern = (len = 4): number[] =>
  Array.from({ length: len }, () => Math.floor(Math.random() * 9));

/** Compute compliance rate from history */
export const computeComplianceRate = (
  entries: AlarmHistoryEntry[]
): number => {
  if (entries.length === 0) return 100;
  const onTime = entries.filter(
    e => e.status === AlarmHistoryStatus.OnTime
  ).length;
  return Math.round((onTime / entries.length) * 100);
};

// ────────────────────────────────────────────
// DATA LAYER — Service Interfaces (Ports)
// ────────────────────────────────────────────

export interface IStorageService {
  save<T>(key: string, data: T): Promise<void>;
  load<T>(key: string): Promise<T | null>;
  remove(key: string): Promise<void>;
}

export interface INotificationService {
  requestPermissions(): Promise<boolean>;
  schedule(alarm: Alarm, triggerDate: Date): Promise<string>;
  cancel(notificationId: string): Promise<void>;
  cancelAll(): Promise<void>;
}

export interface ISoundService {
  play(volume: number, gradual: boolean): Promise<void>;
  stop(): Promise<void>;
  vibrate(): Promise<void>;
  readonly playing: boolean;
  dispose(): void;
}

export interface ISchedulerEngine {
  scheduleAlarm(alarm: Alarm): Promise<Alarm>;
  cancelAlarm(alarm: Alarm): Promise<Alarm>;
  rescheduleAll(alarms: Alarm[]): Promise<Alarm[]>;
  snoozeAlarm(alarm: Alarm): Promise<Alarm>;
}

// ────────────────────────────────────────────
// DATA LAYER — Storage Keys
// ────────────────────────────────────────────

export const STORAGE_KEYS = {
  ALARMS: '@alarmPro/alarms',
  HISTORY: '@alarmPro/history',
  POMODORO_STATS: '@alarmPro/pomodoroStats',
} as const;

// ────────────────────────────────────────────
// DATA LAYER — Service Implementations
// ────────────────────────────────────────────

export class StorageServiceImpl implements IStorageService {
  async save<T>(key: string, data: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error(`[Storage] save(${key}) failed`, err);
    }
  }

  async load<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      console.error(`[Storage] load(${key}) failed`, err);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.error(`[Storage] remove(${key}) failed`, err);
    }
  }
}

export class NotificationServiceImpl implements INotificationService {
  private channelConfigured = false;

  async requestPermissions(): Promise<boolean> {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: true },
    });
    return status === 'granted';
  }

  private async ensureChannel(): Promise<void> {
    if (this.channelConfigured || Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('alarms', {
      name: 'Alarms',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      enableVibrate: true,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    this.channelConfigured = true;
  }

  async schedule(alarm: Alarm, triggerDate: Date): Promise<string> {
    await this.ensureChannel();

    return Notifications.scheduleNotificationAsync({
      content: {
        title: alarm.label || 'Alarm',
        body: `${formatAlarmTime(alarm.time)} — Time!`,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { alarmId: alarm.id, type: 'alarm' },
        ...(Platform.OS === 'android' ? { channelId: 'alarms' } : {}),
      },
      trigger: { date: triggerDate } as unknown as Notifications.NotificationTriggerInput,
    });
  }

  async cancel(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      /* notification may already have fired */
    }
  }

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
}

export class SoundServiceImpl implements ISoundService {
  private sound: Audio.Sound | null = null;
  private _playing = false;
  private volumeInterval: ReturnType<typeof setInterval> | null = null;

  get playing(): boolean {
    return this._playing;
  }

  async play(volume: number, gradual: boolean): Promise<void> {
    await this.stop();

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Use system default alarm sound; in production bundle a custom .wav
      const { sound } = await Audio.Sound.createAsync(
        // Placeholder — replace with: require('./assets/alarm.wav')
        { uri: 'https://cdn.jsdelivr.net/gh/nicholasgasior/ggsern-sounds@master/alarm.mp3' },
        { shouldPlay: true, isLooping: true, volume: gradual ? 0.05 : volume }
      );

      this.sound = sound;
      this._playing = true;

      if (gradual) {
        let cur = 0.05;
        const step = (volume - 0.05) / 30;
        this.volumeInterval = setInterval(async () => {
          cur = Math.min(cur + step, volume);
          await this.sound?.setVolumeAsync(cur).catch(() => {});
          if (cur >= volume) this.clearVolumeTimer();
        }, 1000);
      }
    } catch (err) {
      console.error('[Sound] play failed', err);
      this._playing = false;
    }
  }

  async stop(): Promise<void> {
    this.clearVolumeTimer();
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      } catch { /* already unloaded */ }
      this.sound = null;
    }
    this._playing = false;
  }

  async vibrate(): Promise<void> {
    try {
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Warning
      );
    } catch { /* device may not support haptics */ }
  }

  dispose(): void {
    this.stop();
  }

  private clearVolumeTimer(): void {
    if (this.volumeInterval) {
      clearInterval(this.volumeInterval);
      this.volumeInterval = null;
    }
  }
}

// ────────────────────────────────────────────
// SCHEDULER ENGINE
// ────────────────────────────────────────────

export class SchedulerEngineImpl implements ISchedulerEngine {
  constructor(
    private notifications: INotificationService,
    private storage: IStorageService,
    private sound: ISoundService
  ) {}

  async scheduleAlarm(alarm: Alarm): Promise<Alarm> {
    const cleared = await this.cancelAlarm(alarm);
    if (!cleared.enabled) return cleared;

    const ids: string[] = [];
    const trigger = calculateNextTrigger(cleared);
    if (!trigger) return cleared;

    // For custom-day repeats, schedule one notification per day
    if (
      cleared.repeatMode === RepeatMode.Custom &&
      cleared.customDays.length > 0
    ) {
      for (const day of cleared.customDays) {
        const d = nextOccurrenceOfDay(day, cleared.time);
        if (d) ids.push(await this.notifications.schedule(cleared, d));
      }
    } else {
      ids.push(await this.notifications.schedule(cleared, trigger));
    }

    return { ...cleared, notificationIds: ids, updatedAt: Date.now() };
  }

  async cancelAlarm(alarm: Alarm): Promise<Alarm> {
    await Promise.all(
      alarm.notificationIds.map(id => this.notifications.cancel(id))
    );
    return { ...alarm, notificationIds: [], updatedAt: Date.now() };
  }

  async rescheduleAll(alarms: Alarm[]): Promise<Alarm[]> {
    return Promise.all(
      alarms.map(a => (a.enabled ? this.scheduleAlarm(a) : Promise.resolve(a)))
    );
  }

  async snoozeAlarm(alarm: Alarm): Promise<Alarm> {
    if (
      !alarm.snoozeEnabled ||
      alarm.currentSnoozeCount >= alarm.maxSnoozeCount
    )
      return alarm;

    await this.sound.stop();

    const snoozeAt = new Date(
      Date.now() + alarm.snoozeDurationMinutes * 60_000
    );
    const snoozedLabel = `${alarm.label} (Snooze ${alarm.currentSnoozeCount + 1})`;
    const id = await this.notifications.schedule(
      { ...alarm, label: snoozedLabel },
      snoozeAt
    );

    return {
      ...alarm,
      currentSnoozeCount: alarm.currentSnoozeCount + 1,
      notificationIds: [id],
      updatedAt: Date.now(),
    };
  }
}

const nextOccurrenceOfDay = (
  dayOfWeek: number,
  time: AlarmTime
): Date | null => {
  const now = new Date();
  const target = new Date(now);
  target.setHours(time.hour, time.minute, time.second, 0);

  let daysUntil = dayOfWeek - now.getDay();
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && target <= now) daysUntil = 7;

  target.setDate(target.getDate() + daysUntil);
  return target;
};

// ────────────────────────────────────────────
// SERVICE CONTAINER — Dependency Injection
// ────────────────────────────────────────────

/**
 * Singleton container: lazily initialises and caches every service.
 * Resolves dependencies via typed accessor properties.
 */
export class ServiceContainer {
  private static _instance: ServiceContainer | null = null;
  private registry = new Map<string, unknown>();
  private _ready = false;

  private constructor() {}

  static get instance(): ServiceContainer {
    if (!this._instance) this._instance = new ServiceContainer();
    return this._instance;
  }

  private set<T>(key: string, svc: T): void {
    this.registry.set(key, svc);
  }
  private get<T>(key: string): T {
    const svc = this.registry.get(key);
    if (!svc) throw new Error(`Service "${key}" not registered`);
    return svc as T;
  }

  get ready(): boolean {
    return this._ready;
  }

  async initialize(): Promise<void> {
    if (this._ready) return;

    const storage = new StorageServiceImpl();
    const notifications = new NotificationServiceImpl();
    const sound = new SoundServiceImpl();
    const scheduler = new SchedulerEngineImpl(notifications, storage, sound);

    this.set('storage', storage);
    this.set('notifications', notifications);
    this.set('sound', sound);
    this.set('scheduler', scheduler);

    await notifications.requestPermissions();
    this._ready = true;
  }

  get storage(): IStorageService {
    return this.get('storage');
  }
  get notifications(): INotificationService {
    return this.get('notifications');
  }
  get sound(): ISoundService {
    return this.get('sound');
  }
  get scheduler(): ISchedulerEngine {
    return this.get('scheduler');
  }
}

// ────────────────────────────────────────────
// BACKGROUND TASKS & BOOT RECOVERY
// ────────────────────────────────────────────

const BG_TASK = 'ALARM_RESCHEDULE_TASK';

export const registerBackgroundTask = async (): Promise<void> => {
  try {
    TaskManager.defineTask(BG_TASK, async () => {
      try {
        const container = ServiceContainer.instance;
        if (!container.ready) await container.initialize();
        const alarms = await container.storage.load<Alarm[]>(
          STORAGE_KEYS.ALARMS
        );
        if (alarms?.length) {
          const updated = await container.scheduler.rescheduleAll(alarms);
          await container.storage.save(STORAGE_KEYS.ALARMS, updated);
        }
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    await BackgroundFetch.registerTaskAsync(BG_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (err) {
    console.warn('[BG] Registration failed:', err);
  }
};

export const performBootRecovery = async (): Promise<Alarm[]> => {
  const container = ServiceContainer.instance;
  if (!container.ready) await container.initialize();

  const stored = await container.storage.load<Alarm[]>(STORAGE_KEYS.ALARMS);
  if (!stored?.length) return [];

  const updated = await container.scheduler.rescheduleAll(stored);
  await container.storage.save(STORAGE_KEYS.ALARMS, updated);
  return updated;
};

export const configureNotificationHandler = (): void => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
};
