import { describe, it, expect } from 'vitest';
import { formatTimeForDatabase, formatTimeForDisplay, parseAmPmParts } from './timeFormat';

describe('Time Format Utils', () => {
  describe('formatTimeForDatabase', () => {
    it('converts 12:00 AM to 00:00:00', () => {
      expect(formatTimeForDatabase('12:00 AM')).toBe('00:00:00');
    });

    it('converts 12:00 PM to 12:00:00', () => {
      expect(formatTimeForDatabase('12:00 PM')).toBe('12:00:00');
    });

    it('converts 1:30 PM to 13:30:00', () => {
      expect(formatTimeForDatabase('1:30 PM')).toBe('13:30:00');
    });

    it('converts 11:59 AM to 11:59:00', () => {
      expect(formatTimeForDatabase('11:59 AM')).toBe('11:59:00');
    });

    it('returns original string if format is invalid', () => {
      expect(formatTimeForDatabase('invalid')).toBe('invalid');
    });
  });

  describe('formatTimeForDisplay', () => {
    it('converts 00:00 to 12:00 AM', () => {
      expect(formatTimeForDisplay('00:00')).toBe('12:00 AM');
    });

    it('converts 12:00 to 12:00 PM', () => {
      expect(formatTimeForDisplay('12:00')).toBe('12:00 PM');
    });

    it('converts 13:30 to 1:30 PM', () => {
      expect(formatTimeForDisplay('13:30')).toBe('1:30 PM');
    });

    it('converts 23:59 to 11:59 PM', () => {
      expect(formatTimeForDisplay('23:59')).toBe('11:59 PM');
    });

    it('handles seconds in input', () => {
      expect(formatTimeForDisplay('13:30:45')).toBe('1:30 PM');
    });
    
    it('returns empty string for null/undefined/empty', () => {
        // @ts-expect-error - testing invalid input
        expect(formatTimeForDisplay(null)).toBe('');
        // @ts-expect-error - testing invalid input
        expect(formatTimeForDisplay(undefined)).toBe('');
        expect(formatTimeForDisplay('')).toBe('');
    });
  });

  describe('parseAmPmParts', () => {
    it('parses 12:00 AM correctly', () => {
      expect(parseAmPmParts('12:00 AM')).toEqual({ h: 12, m: 0, ampm: 'AM' });
    });

    it('parses 1:30 PM correctly', () => {
      expect(parseAmPmParts('1:30 PM')).toEqual({ h: 1, m: 30, ampm: 'PM' });
    });

    it('parses 24h format 13:30 as 1:30 PM', () => {
        expect(parseAmPmParts('13:30')).toEqual({ h: 1, m: 30, ampm: 'PM' });
    });

    it('parses 24h format 00:30 as 12:30 AM', () => {
        expect(parseAmPmParts('00:30')).toEqual({ h: 12, m: 30, ampm: 'AM' });
    });
  });
});
