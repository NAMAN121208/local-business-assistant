// src/lib/booking/index.ts
import { db } from '../db';
import { Booking, BookingRules } from '../db/types';
import { demoClinicKBContent, DEMO_CLINIC_ID } from '../kb/demo-clinic';

export interface SlotOption {
  time: string; // "10:00 AM"
  startTimeIso: string;
  endTimeIso: string;
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
  date: string; // YYYY-MM-DD
  slots: SlotOption[];
}

/**
 * Returns current date/time components in clinic's timezone (Asia/Kolkata)
 */
export function getClinicNow(timezone: string = 'Asia/Kolkata'): {
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  dayOfWeek: number; // 0-6
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10);
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  // Day of week in timezone
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = d.getUTCDay();

  return { dateStr, timeStr, dayOfWeek, year, month, day, hour, minute };
}

/**
 * Normalises human relative date strings (e.g. "today", "tomorrow", "this friday", "2026-10-28")
 * into YYYY-MM-DD based on the clinic's timezone.
 */
export function parseRelativeDate(text: string, timezone: string = 'Asia/Kolkata'): string | null {
  const lower = text.toLowerCase();
  const now = getClinicNow(timezone);

  // Exact YYYY-MM-DD match
  const isoMatch = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  // DD/MM or DD-MM format
  const dmMatch = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/);
  if (dmMatch) {
    const day = parseInt(dmMatch[1], 10);
    const month = parseInt(dmMatch[2], 10);
    const year = dmMatch[3] ? parseInt(dmMatch[3], 10) : now.year;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const baseDate = new Date(Date.UTC(now.year, now.month - 1, now.day));

  if (lower.includes('day after tomorrow')) {
    baseDate.setUTCDate(baseDate.getUTCDate() + 2);
    return baseDate.toISOString().split('T')[0];
  }

  if (lower.includes('tomorrow') || lower.includes('kal')) {
    baseDate.setUTCDate(baseDate.getUTCDate() + 1);
    return baseDate.toISOString().split('T')[0];
  }

  if (lower.includes('today') || lower.includes('aaj')) {
    return now.dateStr;
  }

  // Weekdays: monday, tuesday, wednesday, etc.
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      let diff = i - now.dayOfWeek;
      if (diff <= 0) diff += 7; // next upcoming day
      baseDate.setUTCDate(baseDate.getUTCDate() + diff);
      return baseDate.toISOString().split('T')[0];
    }
  }

  return null;
}

/**
 * Checks available 30-min booking slots deterministically in code
 */
export async function checkAvailability(params: {
  businessId: string;
  service?: string;
  dateStr: string; // YYYY-MM-DD
  timeWindow?: 'morning' | 'evening' | 'any' | string;
}): Promise<AvailabilityResult> {
  const { businessId, dateStr, timeWindow = 'any' } = params;
  const now = getClinicNow('Asia/Kolkata');
  const kb = await db.getLatestKnowledgeBase(businessId);
  const rules: BookingRules = kb?.content.booking_rules || demoClinicKBContent.booking_rules;
  const holidays: string[] = kb?.content.holidays || demoClinicKBContent.holidays;

  // 1. Check past date
  if (dateStr < now.dateStr) {
    return {
      available: false,
      reason: 'The requested date is in the past. Please select today or a future date.',
      date: dateStr,
      slots: [],
    };
  }

  // 2. Check holiday
  if (holidays.includes(dateStr)) {
    return {
      available: false,
      reason: `The clinic is closed on ${dateStr} for an official public holiday.`,
      date: dateStr,
      slots: [],
    };
  }

  // 3. Check working day of week
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetDateObj = new Date(Date.UTC(y, m - 1, d));
  const targetDayOfWeek = targetDateObj.getUTCDay();

  if (!rules.working_days.includes(targetDayOfWeek)) {
    return {
      available: false,
      reason:
        targetDayOfWeek === 0
          ? 'The clinic is closed on Sundays for routine appointments. Emergency on-call: +91 98765 99999.'
          : 'The clinic is closed on this day of the week.',
      date: dateStr,
      slots: [],
    };
  }

  // 4. Generate candidate 30-min slots
  // Working hours: morning 09:00 - 13:00, evening 16:00 - 20:00
  const candidateTimes: Array<{ hour: number; minute: number; window: 'morning' | 'evening' }> = [
    // Morning OPD
    { hour: 9, minute: 0, window: 'morning' },
    { hour: 9, minute: 30, window: 'morning' },
    { hour: 10, minute: 0, window: 'morning' },
    { hour: 10, minute: 30, window: 'morning' },
    { hour: 11, minute: 0, window: 'morning' },
    { hour: 11, minute: 30, window: 'morning' },
    { hour: 12, minute: 0, window: 'morning' },
    { hour: 12, minute: 30, window: 'morning' },
    // Evening OPD
    { hour: 16, minute: 0, window: 'evening' },
    { hour: 16, minute: 30, window: 'evening' },
    { hour: 17, minute: 0, window: 'evening' },
    { hour: 17, minute: 30, window: 'evening' },
    { hour: 18, minute: 0, window: 'evening' },
    { hour: 18, minute: 30, window: 'evening' },
    { hour: 19, minute: 0, window: 'evening' },
    { hour: 19, minute: 30, window: 'evening' },
  ];

  // 5. Query existing confirmed bookings for this date
  const existingBookings = await db.findBookings(businessId, { date: dateStr, status: 'confirmed' });
  const bookedTimes = new Set(
    existingBookings.map((b) => {
      const dt = new Date(b.start_time);
      return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`;
    })
  );

  // 6. Filter candidate slots
  const filteredSlots: SlotOption[] = [];

  for (const slot of candidateTimes) {
    const isToday = dateStr === now.dateStr;
    // Lead time rule: if today, slot must be at least 1 hour in the future
    if (isToday && slot.hour * 60 + slot.minute <= now.hour * 60 + now.minute + 60) {
      continue;
    }

    // Window preference filter
    if (timeWindow === 'morning' && slot.window !== 'morning') continue;
    if (timeWindow === 'evening' && slot.window !== 'evening') continue;

    const timeKey = `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`;
    if (bookedTimes.has(timeKey)) {
      continue; // already occupied
    }

    const h12 = slot.hour > 12 ? slot.hour - 12 : slot.hour === 0 ? 12 : slot.hour;
    const ampm = slot.hour >= 12 ? 'PM' : 'AM';
    const displayTime = `${h12}:${String(slot.minute).padStart(2, '0')} ${ampm}`;

    // ISO strings
    const startIso = `${dateStr}T${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}:00.000Z`;
    const endMinutes = slot.minute + 30;
    const endHour = slot.hour + Math.floor(endMinutes / 60);
    const endMinMod = endMinutes % 60;
    const endIso = `${dateStr}T${String(endHour).padStart(2, '0')}:${String(endMinMod).padStart(2, '0')}:00.000Z`;

    filteredSlots.push({
      time: displayTime,
      startTimeIso: startIso,
      endTimeIso: endIso,
    });
  }

  if (filteredSlots.length === 0) {
    return {
      available: false,
      reason: `No slots available on ${dateStr} for the requested window. Nearest alternatives are available on the next working day.`,
      date: dateStr,
      slots: [],
    };
  }

  // Up to 3 options returned as required by section 7.3
  return {
    available: true,
    date: dateStr,
    slots: filteredSlots.slice(0, 3),
  };
}

/**
 * Creates confirmed booking deterministically
 */
export async function confirmBooking(params: {
  businessId: string;
  customerId: string;
  service: string;
  startTimeIso: string;
  endTimeIso: string;
  notes?: string;
}): Promise<Booking> {
  return await db.createBooking({
    business_id: params.businessId,
    customer_id: params.customerId,
    service: params.service,
    start_time: params.startTimeIso,
    end_time: params.endTimeIso,
    status: 'confirmed',
    notes: params.notes || null,
  });
}
