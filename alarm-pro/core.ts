// ========================================================================
// core.ts — Domain · Infrastructure · Engine · System
// Clean Architecture: Domain → Infrastructure boundary. No UI concerns.
// ========================================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { AudioPlayer, AudioModule } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  DOMAIN LAYER — Enums, Models, Factories, Pure Logic                ║
// ╚═══════════════════════════════════════════════════════════════════════╝

// ── Enums ────────────────────────────────────────────────────────────────

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

// ── Immutable Domain Models ──────────────────────────────────────────────

export interface AlarmTime {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

export interface Alarm {
  readonly id: string;
  readonly label: string;
  readonly time: AlarmTime;
  readonly enabled: boolean;
  readonly repeatMode: RepeatMode;
  readonly customDays: readonly number[];
  readonly periodicIntervalDays: number;
  readonly snoozeEnabled: boolean;
  readonly snoozeDurationMinutes: number;
  readonly maxSnoozeCount: number;
  readonly currentSnoozeCount: number;
  readonly gradualVolume: boolean;
  readonly vibrationEnabled: boolean;
  readonly vibrationPattern: readonly number[];
  readonly dismissChallenge: DismissChallenge;
  readonly soundName: string;
  readonly volume: number;
  readonly notificationIds: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly sortOrder: number;
}

export interface AlarmHistoryEntry {
  readonly id: string;
  readonly alarmId: string;
  readonly alarmLabel: string;
  readonly scheduledTime: number;
  readonly actualTime: number;
  readonly status: AlarmHistoryStatus;
  readonly snoozeCount: number;
}

export interface TimerState {
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
  readonly isRunning: boolean;
  readonly isPaused: boolean;
}

export interface PomodoroConfig {
  readonly workMinutes: number;
  readonly shortBreakMinutes: number;
  readonly longBreakMinutes: number;
  readonly sessionsBeforeLongBreak: number;
}

export interface PomodoroState {
  readonly phase: PomodoroPhase;
  readonly remainingSeconds: number;
  readonly isRunning: boolean;
  readonly currentSession: number;
  readonly totalSessionsCompleted: number;
  readonly totalWorkMinutes: number;
  readonly config: PomodoroConfig;
}

// ── Utility Type ─────────────────────────────────────────────────────────

export type Mutable<T> = { -readonly [K in keyof T]: T[K] extends ReadonlyArray<infer U> ? U[] : T[K] };

// ── ID Generation ────────────────────────────────────────────────────────

let _idCounter = 0;
export const generateId = (): string =>
  `${Date.now()}_${(++_idCounter).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ── Factory Functions ────────────────────────────────────────────────────

export const createDefaultAlarm = (overrides?: Partial<Mutable<Alarm>>): Alarm => ({
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

// ── Pure Utility Functions ───────────────────────────────────────────────

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const formatSeconds = (totalSeconds: number): string => {
  if (!Number.isFinite(totalSeconds)) return '00:00';
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const formatAlarmTime = (time: AlarmTime): string => {
  const period = time.hour >= 12 ? 'PM' : 'AM';
  const h = time.hour % 12 || 12;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${h}:${pad(time.minute)}:${pad(time.second)} ${period}`;
};

export const getRepeatLabel = (alarm: Alarm): string => {
  switch (alarm.repeatMode) {
    case RepeatMode.Once:
      return 'Once';
    case RepeatMode.Daily:
      return 'Every day';
    case RepeatMode.Weekdays:
      return 'Weekdays';
    case RepeatMode.Weekend:
      return 'Weekends';
    case RepeatMode.Custom:
      return alarm.customDays.length > 0
        ? alarm.customDays.map(d => DAY_NAMES_SHORT[d]).join(', ')
        : 'None';
    case RepeatMode.Periodic:
      return `Every ${alarm.periodicIntervalDays} day(s)`;
    default:
      return '';
  }
};

export const calculateNextTrigger = (alarm: Alarm, from: Date = new Date()): Date | null => {
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
      return isValidFutureDate(target, from) ? target : null;
    }
    case RepeatMode.Weekdays:
      return findNextDayInSet(target, from, [1, 2, 3, 4, 5]);
    case RepeatMode.Weekend:
      return findNextDayInSet(target, from, [0, 6]);
    case RepeatMode.Custom:
      return alarm.customDays.length > 0
        ? findNextDayInSet(target, from, [...alarm.customDays])
        : null;
    case RepeatMode.Periodic: {
      if (target <= from) {
        target.setDate(target.getDate() + Math.max(1, alarm.periodicIntervalDays));
      }
      return isValidFutureDate(target, from) ? target : null;
    }
    default:
      return null;
  }
};

const findNextDayInSet = (target: Date, now: Date, validDays: number[]): Date | null => {
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(target);
    candidate.setDate(target.getDate() + offset);
    if (validDays.includes(candidate.getDay()) && candidate > now) {
      return candidate;
    }
  }
  return null;
};

const nextOccurrenceOfDay = (dayOfWeek: number, time: AlarmTime): Date | null => {
  const now = new Date();
  const target = new Date(now);
  target.setHours(time.hour, time.minute, time.second, 0);

  let daysUntil = dayOfWeek - now.getDay();
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && target <= now) daysUntil = 7;

  target.setDate(target.getDate() + daysUntil);
  return isValidFutureDate(target, now) ? target : null;
};

const isValidFutureDate = (date: Date, now: Date): boolean =>
  Number.isFinite(date.getTime()) && date.getTime() > now.getTime();

export const getTimeUntilAlarm = (alarm: Alarm): string | null => {
  const next = calculateNextTrigger(alarm);
  if (!next) return null;
  const diffMs = next.getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Now';
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const generateMathChallenge = (): { question: string; answer: number } => {
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

export const generateMemoryPattern = (len = 4): number[] => {
  const pattern: number[] = [];
  while (pattern.length < len) {
    const n = Math.floor(Math.random() * 9);
    if (!pattern.includes(n)) pattern.push(n);
  }
  return pattern;
};

export const computeComplianceRate = (entries: readonly AlarmHistoryEntry[]): number => {
  if (entries.length === 0) return 100;
  const onTime = entries.filter(e => e.status === AlarmHistoryStatus.OnTime).length;
  return Math.round((onTime / entries.length) * 100);
};

// ── Validation & Repair ──────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isAlarmTime = (v: unknown): v is AlarmTime =>
  isRecord(v) &&
  typeof v.hour === 'number' && v.hour >= 0 && v.hour <= 23 &&
  typeof v.minute === 'number' && v.minute >= 0 && v.minute <= 59 &&
  typeof v.second === 'number' && v.second >= 0 && v.second <= 59;

const enumValues = <T extends Record<string, string>>(e: T): string[] => Object.values(e);

export const repairAlarm = (raw: unknown): Alarm | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null;

  const d = createDefaultAlarm();
  return {
    id: raw.id as string,
    label: typeof raw.label === 'string' ? raw.label : d.label,
    time: isAlarmTime(raw.time) ? raw.time : d.time,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    repeatMode: enumValues(RepeatMode).includes(raw.repeatMode as string)
      ? (raw.repeatMode as RepeatMode)
      : d.repeatMode,
    customDays: Array.isArray(raw.customDays)
      ? (raw.customDays as unknown[]).filter(
          (x): x is number => typeof x === 'number' && x >= 0 && x <= 6
        )
      : [...d.customDays],
    periodicIntervalDays:
      typeof raw.periodicIntervalDays === 'number' && raw.periodicIntervalDays >= 1
        ? raw.periodicIntervalDays
        : d.periodicIntervalDays,
    snoozeEnabled: typeof raw.snoozeEnabled === 'boolean' ? raw.snoozeEnabled : d.snoozeEnabled,
    snoozeDurationMinutes:
      typeof raw.snoozeDurationMinutes === 'number' && raw.snoozeDurationMinutes >= 1
        ? raw.snoozeDurationMinutes
        : d.snoozeDurationMinutes,
    maxSnoozeCount:
      typeof raw.maxSnoozeCount === 'number' && raw.maxSnoozeCount >= 0
        ? raw.maxSnoozeCount
        : d.maxSnoozeCount,
    currentSnoozeCount:
      typeof raw.currentSnoozeCount === 'number' ? raw.currentSnoozeCount : 0,
    gradualVolume: typeof raw.gradualVolume === 'boolean' ? raw.gradualVolume : d.gradualVolume,
    vibrationEnabled:
      typeof raw.vibrationEnabled === 'boolean' ? raw.vibrationEnabled : d.vibrationEnabled,
    vibrationPattern: Array.isArray(raw.vibrationPattern)
      ? (raw.vibrationPattern as unknown[]).filter((x): x is number => typeof x === 'number')
      : [...d.vibrationPattern],
    dismissChallenge: enumValues(DismissChallenge).includes(raw.dismissChallenge as string)
      ? (raw.dismissChallenge as DismissChallenge)
      : d.dismissChallenge,
    soundName: typeof raw.soundName === 'string' ? raw.soundName : d.soundName,
    volume:
      typeof raw.volume === 'number' ? clamp(raw.volume, 0, 1) : d.volume,
    notificationIds: Array.isArray(raw.notificationIds)
      ? (raw.notificationIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [],
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : 0,
  };
};

export const validateAlarms = (raw: unknown): Alarm[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map(item => repairAlarm(item))
    .filter((a): a is Alarm => {
      if (!a || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
};

export const validateHistoryEntries = (raw: unknown): AlarmHistoryEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is AlarmHistoryEntry =>
      isRecord(entry) &&
      typeof (entry as Record<string, unknown>).id === 'string' &&
      typeof (entry as Record<string, unknown>).alarmId === 'string' &&
      typeof (entry as Record<string, unknown>).scheduledTime === 'number' &&
      typeof (entry as Record<string, unknown>).actualTime === 'number' &&
      enumValues(AlarmHistoryStatus).includes(
        (entry as Record<string, unknown>).status as string
      )
  );
};

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  INFRASTRUCTURE LAYER — Service Interfaces & Implementations        ║
// ╚═══════════════════════════════════════════════════════════════════════╝

// ── Service Interfaces (Ports) ───────────────────────────────────────────

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

// ── Storage Keys ─────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  ALARMS: '@alarmPro/v2/alarms',
  HISTORY: '@alarmPro/v2/history',
  POMODORO_STATS: '@alarmPro/v2/pomodoroStats',
  SCHEMA_VERSION: '@alarmPro/schemaVersion',
} as const;

const CURRENT_SCHEMA_VERSION = 2;
const LEGACY_KEYS = {
  ALARMS: '@alarmPro/alarms',
  HISTORY: '@alarmPro/history',
} as const;

// ── Storage Implementation ───────────────────────────────────────────────

export class StorageServiceImpl implements IStorageService {
  private migrated = false;

  async save<T>(key: string, data: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error(`[Storage] save(${key}) failed`, err);
    }
  }

  async load<T>(key: string): Promise<T | null> {
    try {
      await this.migrateIfNeeded();
      const raw = await AsyncStorage.getItem(key);
      if (raw === null) return null;
      return this.safeParse<T>(raw);
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

  private safeParse<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      console.warn('[Storage] JSON parse failed, discarding corrupted data');
      return null;
    }
  }

  private async migrateIfNeeded(): Promise<void> {
    if (this.migrated) return;
    this.migrated = true;

    try {
      const versionRaw = await AsyncStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
      const version = versionRaw ? parseInt(versionRaw, 10) : 0;

      if (version < CURRENT_SCHEMA_VERSION) {
        for (const [logicalKey, legacyKey] of Object.entries(LEGACY_KEYS)) {
          const newKey = (STORAGE_KEYS as Record<string, string>)[logicalKey];
          if (!newKey) continue;

          const existingNew = await AsyncStorage.getItem(newKey);
          if (existingNew !== null) continue;

          const oldData = await AsyncStorage.getItem(legacyKey);
          if (oldData !== null) {
            await AsyncStorage.setItem(newKey, oldData);
          }
        }

        await AsyncStorage.setItem(
          STORAGE_KEYS.SCHEMA_VERSION,
          CURRENT_SCHEMA_VERSION.toString()
        );
      }
    } catch (err) {
      console.warn('[Storage] migration check failed', err);
    }
  }
}

// ── Notification Implementation ──────────────────────────────────────────

export class NotificationServiceImpl implements INotificationService {
  private channelConfigured = false;

  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') return true;
      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: true },
        android: { allowAlert: true },
      });
      return status === 'granted';
    } catch (err) {
      console.error('[Notifications] requestPermissions failed', err);
      return false;
    }
  }

  private async ensureChannel(): Promise<void> {
    if (this.channelConfigured || Platform.OS !== 'android') return;
    try {
      await Notifications.setNotificationChannelAsync('alarms', {
        name: 'Alarms',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      this.channelConfigured = true;
    } catch (err) {
      console.error('[Notifications] ensureChannel failed', err);
    }
  }

  async schedule(alarm: Alarm, triggerDate: Date): Promise<string> {
    try {
      await this.ensureChannel();

      // Validate triggerDate is a proper Date instance
      if (!(triggerDate instanceof Date) || isNaN(triggerDate.getTime())) {
        console.warn(`[Notifications] Invalid trigger date for alarm ${alarm.id}`);
        return '';
      }

      // Ensure trigger is in the future with at least 3s buffer
      if (triggerDate.getTime() <= Date.now() + 3000) {
        console.warn(`[Notifications] Trigger date is in the past for alarm ${alarm.id}`);
        return '';
      }

      // Guard: Android has a limit of ~64 pending notifications
      if (Platform.OS === 'android') {
        try {
          const pending = await Notifications.getAllScheduledNotificationsAsync();
          if (pending.length >= 60) {
            console.warn('[Notifications] Approaching Android notification limit, skipping');
            return '';
          }
        } catch {
          // Non-critical: continue scheduling
        }
      }

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: alarm.label || 'Alarm',
          body: `${formatAlarmTime(alarm.time)} — Time to wake up!`,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { alarmId: alarm.id, type: 'alarm' },
          ...(Platform.OS === 'android' ? { channelId: 'alarms' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });

      return id;
    } catch (err) {
      console.error(`[Notifications] schedule failed for alarm ${alarm.id}`, err);
      return '';
    }
  }

  async cancel(notificationId: string): Promise<void> {
    if (!notificationId) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      // Already fired or cancelled
    }
  }

  async cancelAll(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (err) {
      console.error('[Notifications] cancelAll failed', err);
    }
  }
}

// ── Sound Implementation (expo-audio AudioPlayer API) ────────────────────

export class SoundServiceImpl implements ISoundService {
  private player: AudioPlayer | null = null;
  private _playing = false;
  private _locked = false;
  private volumeTimer: ReturnType<typeof setInterval> | null = null;

  get playing(): boolean {
    return this._playing;
  }

  async play(volume: number, gradual: boolean): Promise<void> {
    // Prevent concurrent play() calls from racing
    if (this._locked) return;
    this._locked = true;

    try {
      // Tear down any previous playback before starting a new one
      await this.stop();

      // Guard: ensure volume is a sane finite number
      if (!volume || volume <= 0 || !Number.isFinite(volume)) {
        volume = 0.5;
      }
      volume = clamp(volume, 0, 1);

      // Configure audio session for alarm-style playback
      try {
        await AudioModule.setAudioModeAsync({
  playsInSilentModeIOS: true,
  staysActiveInBackground: true,
  shouldDuckAndroid: false,
  interruptionModeAndroid: 'doNotMix',
});
      } catch {
        // Non-critical: continue even if audio mode configuration fails
      }

      const initialVolume = gradual ? Math.max(0.1, volume * 0.2) : volume;

      // Load the bundled alarm asset
      let source: number;
      try {
        source = require('./assets/alarm.wav');
      } catch {
        console.warn('[Sound] Alarm sound asset missing, falling back to vibration');
        await this.vibrate();
        return;
      }

    // Create a new AudioPlayer instance with the alarm source
const player = AudioModule.createAudioPlayer(source);

player.loop = true;
player.volume = initialVolume;

this.player = player;
this._playing = true;

player.play();

      // Gradually ramp volume from initialVolume → targetVolume over ~30 s
      if (gradual) {
        const targetVolume = volume;
        let current = initialVolume;
        const step = (targetVolume - initialVolume) / 30;

        this.volumeTimer = setInterval(() => {
          current = Math.min(current + step, targetVolume);
          try {
            if (this.player) {
              this.player.volume = current;
            }
          } catch {
            this.clearVolumeTimer();
          }
          if (current >= targetVolume) this.clearVolumeTimer();
        }, 1000);
      }
    } catch (err) {
      console.error('[Sound] play failed', err);
      this._playing = false;
      // Fallback: vibrate so the alarm is not completely silent
      try {
        await this.vibrate();
      } catch {
        // Last-resort: swallow to avoid crash
      }
    } finally {
      this._locked = false;
    }
  }

  async stop(): Promise<void> {
    // Always clear the volume ramp timer first
    this.clearVolumeTimer();

    // Capture and null-out the reference atomically so concurrent
    // stop() calls don't double-dispose the same player
    const ref = this.player;

if (!ref) {
  this._playing = false;
  return;
}

// Cut the reference immediately to prevent any simultaneous use
this.player = null;
this._playing = false;

try {
  if (!ref.paused) {
    ref.pause();
  }
} catch {}

// Releasing resources from memory
try {
  ref.remove();
} catch {}

async vibrate(): Promise<void> {
  try {
    if (this.vibrationTimer) return;

    this.vibrationTimer = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }, 1200);
  } catch {
    // Device may not support haptics
  }
}

  dispose(): void {
    this.stop().catch(() => {});
  }

  private clearVolumeTimer(): void {
    if (this.volumeTimer !== null) {
      clearInterval(this.volumeTimer);
      this.volumeTimer = null;
    }
  }
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  APPLICATION LAYER — Scheduler Engine                                ║
// ╚═══════════════════════════════════════════════════════════════════════╝

export class SchedulerEngineImpl implements ISchedulerEngine {
  constructor(
    private readonly notifications: INotificationService,
    private readonly storage: IStorageService,
    private readonly sound: ISoundService
  ) {}

  async scheduleAlarm(alarm: Alarm): Promise<Alarm> {
    // Validate alarm id
    if (typeof alarm.id !== 'string' || alarm.id.length === 0) {
      console.warn('[Scheduler] Invalid alarm id, skipping');
      return alarm;
    }

    // Always cancel existing notifications first to prevent duplication
    const cleared = await this.cancelAlarm(alarm);
    if (!cleared.enabled) return cleared;

    const ids: string[] = [];
    const now = new Date();

    if (cleared.repeatMode === RepeatMode.Custom && cleared.customDays.length > 0) {
      // Schedule one notification per custom day
      for (const day of cleared.customDays) {
        const d = nextOccurrenceOfDay(day, cleared.time);
        if (d && d.getTime() > Date.now() + 3000) {
          const id = await this.notifications.schedule(cleared, d);
          if (id) ids.push(id);
        }
      }
    } else {
      const trigger = calculateNextTrigger(cleared);
      if (trigger && trigger.getTime() > Date.now() + 3000) {
        const id = await this.notifications.schedule(cleared, trigger);
        if (id) ids.push(id);
      }
    }

    return { ...cleared, notificationIds: ids, updatedAt: Date.now() };
  }

  async cancelAlarm(alarm: Alarm): Promise<Alarm> {
    const notifIds = Array.isArray(alarm.notificationIds) ? alarm.notificationIds : [];
    const validIds = notifIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    );
    await Promise.allSettled(validIds.map(id => this.notifications.cancel(id)));
    return { ...alarm, notificationIds: [], updatedAt: Date.now() };
  }

  async rescheduleAll(alarms: Alarm[]): Promise<Alarm[]> {
    // Android allows max ~64 pending notifications; leave room
    const MAX_NOTIFICATIONS = Platform.OS === 'android' ? 60 : 500;
    let totalScheduled = 0;
    const results: Alarm[] = [];

    for (const alarm of alarms) {
      // Skip invalid entries
      if (typeof alarm.id !== 'string' || alarm.id.length === 0) {
        continue;
      }

      if (!alarm.enabled || totalScheduled >= MAX_NOTIFICATIONS) {
        results.push(alarm);
        continue;
      }

      try {
        const updated = await this.scheduleAlarm(alarm);
        totalScheduled += updated.notificationIds.length;
        results.push(updated);
      } catch (err) {
        console.error(`[Scheduler] reschedule failed for alarm ${alarm.id}`, err);
        results.push(alarm);
      }
    }
    return results;
  }

  async snoozeAlarm(alarm: Alarm): Promise<Alarm> {
    if (!alarm.snoozeEnabled || alarm.currentSnoozeCount >= alarm.maxSnoozeCount) {
      return alarm;
    }

    await this.sound.stop();

    const snoozeMs = Math.max(1, alarm.snoozeDurationMinutes) * 60_000;
    const snoozeAt = new Date(Date.now() + snoozeMs);

    if (snoozeAt.getTime() <= Date.now() + 3000) return alarm;

    const snoozedLabel = `${alarm.label} (Snooze ${alarm.currentSnoozeCount + 1})`;
    const id = await this.notifications.schedule(
      { ...alarm, label: snoozedLabel },
      snoozeAt
    );

    return {
      ...alarm,
      currentSnoozeCount: alarm.currentSnoozeCount + 1,
      notificationIds: id ? [id] : [],
      updatedAt: Date.now(),
    };
  }
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  SERVICE CONTAINER — Dependency Injection                            ║
// ╚═══════════════════════════════════════════════════════════════════════╝

export class ServiceContainer {
  private static _instance: ServiceContainer | null = null;
  private _storage: IStorageService | null = null;
  private _notifications: INotificationService | null = null;
  private _sound: ISoundService | null = null;
  private _scheduler: ISchedulerEngine | null = null;
  private _ready = false;
  private _initPromise: Promise<void> | null = null;

  private constructor() {}

  static get instance(): ServiceContainer {
    if (!this._instance) this._instance = new ServiceContainer();
    return this._instance;
  }

  // Allow injection for testing
  static createWithServices(
    storage: IStorageService,
    notifications: INotificationService,
    sound: ISoundService
  ): ServiceContainer {
    const c = new ServiceContainer();
    c._storage = storage;
    c._notifications = notifications;
    c._sound = sound;
    c._scheduler = new SchedulerEngineImpl(notifications, storage, sound);
    c._ready = true;
    return c;
  }

  get ready(): boolean {
    return this._ready;
  }

  async initialize(): Promise<void> {
    if (this._ready) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      const storage = new StorageServiceImpl();
      const notifications = new NotificationServiceImpl();
      const sound = new SoundServiceImpl();
      const scheduler = new SchedulerEngineImpl(notifications, storage, sound);

      this._storage = storage;
      this._notifications = notifications;
      this._sound = sound;
      this._scheduler = scheduler;

      await notifications.requestPermissions();
      this._ready = true;
    })();

    try {
      await this._initPromise;
    } catch (err) {
      this._initPromise = null;
      console.error('[ServiceContainer] initialization failed', err);
      throw err;
    }
  }

  get storage(): IStorageService {
    if (!this._storage) throw new Error('ServiceContainer not initialized: storage');
    return this._storage;
  }

  get notifications(): INotificationService {
    if (!this._notifications) throw new Error('ServiceContainer not initialized: notifications');
    return this._notifications;
  }

  get sound(): ISoundService {
    if (!this._sound) throw new Error('ServiceContainer not initialized: sound');
    return this._sound;
  }

  get scheduler(): ISchedulerEngine {
    if (!this._scheduler) throw new Error('ServiceContainer not initialized: scheduler');
    return this._scheduler;
  }
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  SYSTEM LAYER — Background Tasks, Boot Recovery, Notification Config ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const BG_TASK = 'ALARM_RESCHEDULE_TASK';

export const registerBackgroundTask = async (): Promise<void> => {
  try {
    if (!TaskManager.isTaskDefined(BG_TASK)) {
      TaskManager.defineTask(BG_TASK, async () => {
        try {
          const container = ServiceContainer.instance;
          if (!container.ready) await container.initialize();
          const raw = await container.storage.load<unknown>(STORAGE_KEYS.ALARMS);
          const alarms = validateAlarms(raw ?? []);
          if (alarms.length > 0) {
            const updated = await container.scheduler.rescheduleAll(alarms);
            await container.storage.save(STORAGE_KEYS.ALARMS, updated);
          }
          return BackgroundTask.BackgroundTaskResult.NewData;
        } catch {
          return BackgroundTask.BackgroundTaskResult.Failed;
        }
      });
    }

    const registered = await TaskManager.getRegisteredTasksAsync();
    if (!registered.some(t => t.taskName === BG_TASK)) {
      await BackgroundTask.registerTaskAsync(BG_TASK, {
        minimumInterval: 15 * 60,
      });
    }
  } catch (err) {
    console.warn('[BG] Registration failed:', err);
  }
};

export const performBootRecovery = async (): Promise<Alarm[]> => {
  try {
    const container = ServiceContainer.instance;
    if (!container.ready) await container.initialize();

    const raw = await container.storage.load<unknown>(STORAGE_KEYS.ALARMS);
    const alarms = validateAlarms(raw ?? []);
    if (alarms.length === 0) return [];

    const updated = await container.scheduler.rescheduleAll(alarms);
    await container.storage.save(STORAGE_KEYS.ALARMS, updated);
    return updated;
  } catch (err) {
    console.error('[Boot] performBootRecovery failed', err);
    return [];
  }
};

export const recordAlarmEvent = async (
  alarmId: string,
  alarmLabel: string,
  status: AlarmHistoryStatus,
  snoozeCount: number = 0
): Promise<void> => {
  try {
    const container = ServiceContainer.instance;
    if (!container.ready) return;

    const entry: AlarmHistoryEntry = {
      id: generateId(),
      alarmId,
      alarmLabel,
      scheduledTime: Date.now(),
      actualTime: Date.now(),
      status,
      snoozeCount,
    };
    const raw = await container.storage.load<unknown>(STORAGE_KEYS.HISTORY);
    const history = validateHistoryEntries(raw);
    await container.storage.save(STORAGE_KEYS.HISTORY, [entry, ...history].slice(0, 500));
  } catch (err) {
    console.error('[recordAlarmEvent] failed', err);
  }
};

export const configureNotificationHandler = (): void => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};