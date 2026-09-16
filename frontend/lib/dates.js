export const STORE_TIME_ZONE = "Asia/Colombo";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: STORE_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

const isoDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
});

export const formatDateTime = (value) => dateTimeFormat.format(new Date(value));

export const todayInStore = (now = new Date()) => isoDateFormat.format(now);

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const formatDay = (isoDate) => dayFormat.format(new Date(`${isoDate}T00:00:00Z`));
