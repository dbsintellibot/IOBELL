import { TimeFormat } from './timeFormat';

describe('TimeFormat Utility', () => {
  describe('to12Hour', () => {
    it('converts 00:00 to 12:00:00 AM', () => {
      expect(TimeFormat.to12Hour('00:00')).toBe('12:00:00 AM');
    });

    it('converts 12:00 to 12:00:00 PM', () => {
      expect(TimeFormat.to12Hour('12:00')).toBe('12:00:00 PM');
    });

    it('converts 13:30 to 1:30:00 PM', () => {
      expect(TimeFormat.to12Hour('13:30')).toBe('1:30:00 PM');
    });

    it('converts 09:05 to 9:05:00 AM', () => {
      expect(TimeFormat.to12Hour('09:05')).toBe('9:05:00 AM');
    });

    it('converts 13:30:45 to 1:30:45 PM', () => {
      expect(TimeFormat.to12Hour('13:30:45')).toBe('1:30:45 PM');
    });

    it('returns original string if already 12 hour format', () => {
      expect(TimeFormat.to12Hour('1:30 PM')).toBe('1:30 PM');
    });

    it('handles empty input', () => {
      expect(TimeFormat.to12Hour('')).toBe('');
    });
  });

  describe('to24Hour', () => {
    it('converts 12:00 AM to 00:00:00', () => {
      expect(TimeFormat.to24Hour('12:00 AM')).toBe('00:00:00');
    });

    it('converts 12:00:00 AM to 00:00:00', () => {
      expect(TimeFormat.to24Hour('12:00:00 AM')).toBe('00:00:00');
    });

    it('converts 12:00 PM to 12:00:00', () => {
      expect(TimeFormat.to24Hour('12:00 PM')).toBe('12:00:00');
    });

    it('converts 1:30 PM to 13:30:00', () => {
      expect(TimeFormat.to24Hour('1:30 PM')).toBe('13:30:00');
    });
    
    it('converts 1:30:45 PM to 13:30:45', () => {
      expect(TimeFormat.to24Hour('1:30:45 PM')).toBe('13:30:45');
    });

    it('converts 9:05 AM to 09:05:00', () => {
      expect(TimeFormat.to24Hour('09:05 AM')).toBe('09:05:00');
    });

    it('returns original string if not in expected format', () => {
      expect(TimeFormat.to24Hour('13:30')).toBe('13:30');
    });

    it('handles single digit hour', () => {
      expect(TimeFormat.to24Hour('9:05 AM')).toBe('09:05:00');
    });
  });

  describe('isValidFormat', () => {
    it('validates correct 12 hour format', () => {
      expect(TimeFormat.isValidFormat('1:30 PM')).toBe(true);
      expect(TimeFormat.isValidFormat('12:00 AM')).toBe(true);
      expect(TimeFormat.isValidFormat('09:05 AM')).toBe(true);
      expect(TimeFormat.isValidFormat('1:30:45 PM')).toBe(true);
    });

    it('validates correct 24 hour format', () => {
      expect(TimeFormat.isValidFormat('13:30:00')).toBe(true);
      expect(TimeFormat.isValidFormat('00:00:00')).toBe(true);
    });

    it('invalidates incorrect formats', () => {
      expect(TimeFormat.isValidFormat('25:00:00')).toBe(false);
      expect(TimeFormat.isValidFormat('13:60:00')).toBe(false);
      expect(TimeFormat.isValidFormat('invalid')).toBe(false);
    });
  });

  describe('parseToDate', () => {
    it('parses 12 hour format correctly', () => {
      const date = TimeFormat.parseToDate('1:30 PM');
      expect(date.getHours()).toBe(13);
      expect(date.getMinutes()).toBe(30);
      expect(date.getSeconds()).toBe(0);
    });

    it('parses 12 hour format with seconds correctly', () => {
      const date = TimeFormat.parseToDate('1:30:45 PM');
      expect(date.getHours()).toBe(13);
      expect(date.getMinutes()).toBe(30);
      expect(date.getSeconds()).toBe(45);
    });

    it('parses 24 hour format correctly', () => {
      const date = TimeFormat.parseToDate('14:45:00');
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(45);
      expect(date.getSeconds()).toBe(0);
    });
    
    it('parses 24 hour format without seconds correctly', () => {
       const date = TimeFormat.parseToDate('14:45');
       expect(date.getHours()).toBe(14);
       expect(date.getMinutes()).toBe(45);
       expect(date.getSeconds()).toBe(0);
    });
  });

  describe('formatFromDate', () => {
    it('formats date to 12 hour string with seconds', () => {
      const date = new Date();
      date.setHours(13);
      date.setMinutes(30);
      date.setSeconds(0);
      expect(TimeFormat.formatFromDate(date)).toBe('1:30:00 PM');
    });

    it('formats date to 12 hour string with seconds', () => {
      const date = new Date();
      date.setHours(13);
      date.setMinutes(30);
      date.setSeconds(45);
      expect(TimeFormat.formatFromDate(date)).toBe('1:30:45 PM');
    });

    it('formats midnight correctly', () => {
      const date = new Date();
      date.setHours(0);
      date.setMinutes(0);
      date.setSeconds(0);
      expect(TimeFormat.formatFromDate(date)).toBe('12:00:00 AM');
    });
  });
});
