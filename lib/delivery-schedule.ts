const TIME_ZONE = 'Asia/Kolkata';

export const DELIVERY_WINDOWS = [
  { id: 'morning-0600', startMinutes: 6 * 60, endMinutes: 8 * 60 },
  { id: 'morning-0800', startMinutes: 8 * 60, endMinutes: 10 * 60 },
  { id: 'morning-1000', startMinutes: 10 * 60, endMinutes: 12 * 60 },
  { id: 'evening-1800', startMinutes: 18 * 60, endMinutes: 20 * 60 },
  { id: 'evening-2000', startMinutes: 20 * 60, endMinutes: 22 * 60 },
] as const;

const DELIVERY_SCHEDULE: readonly (readonly (typeof DELIVERY_WINDOWS)[number][])[] = [
  [DELIVERY_WINDOWS[3], DELIVERY_WINDOWS[4]],
  [DELIVERY_WINDOWS[0], DELIVERY_WINDOWS[1], DELIVERY_WINDOWS[2]],
];

export type DeliverySlot = {
  value: string;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  endMinutes: number;
};

function dateKeyInIndia(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateKeyOffset(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function dateLabel(dateKey: string, today: string, tomorrow: string) {
  if (dateKey === today) return 'Today';
  if (dateKey === tomorrow) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function timeLabel(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const date = new Date(Date.UTC(2020, 0, 1, hour, minute));
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function getAvailableDeliverySlots(now = new Date()): DeliverySlot[] {
  const today = dateKeyInIndia(now);
  const tomorrow = dateKeyOffset(today, 1);
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const [hours, minutes] = localTime.split(':').map(Number);
  const currentMinutes = hours * 60 + minutes;

  return DELIVERY_SCHEDULE.flatMap((windows, dayOffset) => {
    const dateKey = dateKeyOffset(today, dayOffset);
    return windows
      .filter((window) => dayOffset > 0 || window.startMinutes > currentMinutes)
      .map((window) => ({
        value: `${dateKey}|${window.id}`,
        dateKey,
        dateLabel: dateLabel(dateKey, today, tomorrow),
        timeLabel: `${timeLabel(window.startMinutes)} – ${timeLabel(window.endMinutes)}`,
        endMinutes: window.endMinutes,
      }));
  });
}

export function isValidDeliverySlot(value: string, now = new Date()) {
  return getAvailableDeliverySlots(now).some((slot) => slot.value === value);
}

export function formatDeliverySlot(value: string | null, now = new Date()) {
  if (!value) return '';
  const selected = getAvailableDeliverySlots(now).find((slot) => slot.value === value);
  if (selected) return `${selected.dateLabel}, ${selected.timeLabel}`;

  const match = /^(\d{4}-\d{2}-\d{2})\|([a-z]+)-(\d{4})$/.exec(value);
  if (!match) return value;
  const [, dateKey, period, startTime] = match;
  const window = DELIVERY_WINDOWS.find((entry) =>
    entry.id === `${period}-${startTime}`
  );
  if (!window) return value;
  const today = dateKeyInIndia(now);
  const tomorrow = dateKeyOffset(today, 1);
  return `${dateLabel(dateKey, today, tomorrow)}, ${timeLabel(window.startMinutes)} – ${timeLabel(window.endMinutes)}`;
}
