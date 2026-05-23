export const APP_LOCALE = "tr-TR";

/** Monday-based Turkish weekday names (Pazartesi … Pazar). */
export function getWeekdayLabels(): string[] {
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day.toLocaleDateString(APP_LOCALE, { weekday: "long" });
  });
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(APP_LOCALE, { month: "long", year: "numeric" });
}

export function formatSelectedDate(date: Date): string {
  return date.toLocaleDateString(APP_LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(APP_LOCALE, { hour: "numeric", minute: "2-digit" });
}

export const ui = {
  connect: "Bağlan",
  disconnect: "Bağlantıyı kes",
  prevMonth: "Önceki ay",
  nextMonth: "Sonraki ay",
  refreshing: "Takvim güncelleniyor…",
  authorizing: "Google oturumu bekleniyor…",
  deleteConfirm: (title: string) => `“${title}” silinsin mi?`,
  add: "+ Ekle",
  noEvents: "Etkinlik yok",
  edit: "Düzenle",
  delete: "Sil",
  moreEvents: (count: number) => `+${count} etkinlik daha`,
  allDay: "Tüm gün",
  allDayRange: (start: string, end: string) => `Tüm gün (${start} – ${end})`,
  untitledEvent: "Başlıksız etkinlik",
  newEvent: "Yeni etkinlik",
  editEvent: "Etkinliği düzenle",
  title: "Başlık",
  titlePlaceholder: "Etkinlik başlığı",
  start: "Başlangıç",
  end: "Bitiş",
  endInclusive: "Bitiş (dahil)",
  cancel: "İptal",
  save: "Kaydet",
  saving: "Kaydediliyor…",
} as const;
