const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatDateTime = (value) => dateTimeFormat.format(new Date(value));
