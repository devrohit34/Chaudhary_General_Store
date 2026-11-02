import { describe, expect, it } from 'vitest';
import {
  formatDeliverySlot,
  getAvailableDeliverySlots,
  isValidDeliverySlot,
} from './delivery-schedule';

describe('standard delivery schedule', () => {
  it('groups the configured windows under India-local dates', () => {
    const now = new Date('2026-11-02T03:00:00.000Z');
    const slots = getAvailableDeliverySlots(now);

    expect(slots[0]).toMatchObject({
      value: '2026-11-02|evening-1800',
      dateLabel: 'Today',
      timeLabel: '6:00 pm – 8:00 pm',
    });
    expect(slots[1]).toMatchObject({
      value: '2026-11-02|evening-2000',
      dateLabel: 'Today',
      timeLabel: '8:00 pm – 10:00 pm',
    });
    expect(slots[2]).toMatchObject({
      value: '2026-11-03|morning-0600',
      dateLabel: 'Tomorrow',
      timeLabel: '6:00 am – 8:00 am',
    });
    expect(slots.at(-1)?.dateLabel).toBe('Tomorrow');
  });

  it('removes delivery windows that have already ended in India time', () => {
    const slots = getAvailableDeliverySlots(new Date('2026-11-02T14:30:00.000Z'));

    expect(slots.filter((slot) => slot.dateKey === '2026-11-02')).toHaveLength(0);
    expect(slots.every((slot) => slot.dateKey !== '2026-11-02')).toBe(true);
  });

  it('does not offer windows that have already started', () => {
    const slots = getAvailableDeliverySlots(new Date('2026-11-02T13:30:00.000Z'));

    expect(slots.filter((slot) => slot.dateKey === '2026-11-02').map((slot) => slot.value)).toEqual([
      '2026-11-02|evening-2000',
    ]);
  });

  it('validates slot tokens and formats persisted slots', () => {
    const now = new Date('2026-11-02T03:00:00.000Z');
    const validSlot = '2026-11-03|morning-0600';

    expect(isValidDeliverySlot(validSlot, now)).toBe(true);
    expect(isValidDeliverySlot('2026-11-02|morning-0600', now)).toBe(false);
    expect(isValidDeliverySlot('2026-11-03|unknown-0600', now)).toBe(false);
    expect(formatDeliverySlot(validSlot, now)).toBe('Tomorrow, 6:00 am – 8:00 am');
    expect(formatDeliverySlot('Tomorrow 6-8 AM', now)).toBe('Tomorrow 6-8 AM');
  });
});
