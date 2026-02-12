// Unified time format utility for consistent time handling across the app

export const TimeFormat = {
  to12Hour: (time24: string): string => {
    if (!time24) return '';
    if (time24.toLowerCase().includes('m')) return time24;
    
    const parts = time24.split(':');
    const hStr = parts[0];
    const mStr = parts[1];
    const sStr = parts[2];
    
    let h = parseInt(hStr);
    const m = parseInt(mStr);
    const s = sStr ? parseInt(sStr) : 0;
    
    if (isNaN(h) || isNaN(m)) return '';

    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    
    // Always include seconds to ensure consistency
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm}`;
  },

  to24Hour: (time12: string): string => {
    if (!time12 || !time12.includes(' ')) return time12;
    const [time, modifier] = time12.split(' ');
    const parts = time.split(':');
    let [hours, minutes, seconds] = parts.map(Number);
    
    if (isNaN(seconds)) seconds = 0;
    
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  },

  isValidFormat: (time: string): boolean => {
    const time12Pattern = /^(1[0-2]|0?[1-9]):[0-5][0-9](:[0-5][0-9])? (AM|PM)$/i;
    const time24Pattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    return time12Pattern.test(time) || time24Pattern.test(time);
  },

  parseToDate: (timeStr: string): Date => {
    const d = new Date();
    if (!timeStr) return d;
    
    try {
      // Handle 12-hour format (H:MM AM/PM or H:MM:SS AM/PM)
      if (timeStr.includes(' ')) {
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes, seconds] = time.split(':').map(Number);
        
        if (isNaN(seconds)) seconds = 0;

        if (modifier.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
        
        d.setHours(hours);
        d.setMinutes(minutes || 0);
        d.setSeconds(seconds || 0);
        d.setMilliseconds(0);
        return d;
      }
      
      // Handle 24-hour format
      const [h, m, s] = timeStr.split(':').map(Number);
      if (!isNaN(h)) {
        d.setHours(h);
        d.setMinutes(m || 0);
        d.setSeconds(s || 0);
        d.setMilliseconds(0);
        return d;
      }
    } catch (e) {
      console.error("Error parsing date:", e);
    }
    
    return d;
  },

  formatFromDate: (date: Date): string => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${ampm}`;
  }
};

export default TimeFormat;
