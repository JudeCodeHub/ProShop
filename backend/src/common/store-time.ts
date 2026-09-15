export const STORE_TIME_ZONE = 'Asia/Colombo';

const isoDateInStore = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const todayInStore = (now = new Date()) => isoDateInStore.format(now);
