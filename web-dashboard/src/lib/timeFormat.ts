export const formatTimeForDatabase = (time12h: string): string => {
  if (!time12h || !time12h.includes(' ')) return time12h;
  const [time, modifier] = time12h.split(' ');
  const [hoursStr, minutesStr] = time.split(':');
  let hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
};

export const formatTimeForDisplay = (time24h: string): string => {
  if (!time24h) return '';
  // Handle cases where seconds might be present (HH:MM:SS)
  const [hStr, mStr] = time24h.split(':');
  let h = parseInt(hStr);
  const m = parseInt(mStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
};

export const convert24to12 = formatTimeForDisplay;

export const parseAmPmParts = (timeStr: string) => {
    if (!timeStr) return { h: 12, m: 0, ampm: 'AM' as const };
    if (!timeStr.includes(' ')) {
        const [h, m] = timeStr.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return { h: h12, m, ampm: ampm as 'AM' | 'PM' };
    }
    const [time, modifier] = timeStr.split(' ');
    const [hStr, mStr] = time.split(':');
    return { h: parseInt(hStr), m: parseInt(mStr), ampm: modifier as 'AM' | 'PM' };
};
