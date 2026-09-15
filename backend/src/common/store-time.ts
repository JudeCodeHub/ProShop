export const STORE_TIME_ZONE = 'Asia/Colombo';

const isoDateInStore = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const todayInStore = (now = new Date()) => isoDateInStore.format(now);

const offsetInStore = new Intl.DateTimeFormat('en-US', {
  timeZone: STORE_TIME_ZONE,
  timeZoneName: 'longOffset',
});

export function storeDayStartUtc(isoDate: string): Date {
  const noon = new Date(`${isoDate}T12:00:00Z`);
  const label = offsetInStore.formatToParts(noon).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(label);
  const offsetMinutes = match
    ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0))
    : 0;
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - offsetMinutes * 60_000);
}
