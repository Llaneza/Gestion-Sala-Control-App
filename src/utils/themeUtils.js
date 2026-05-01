export function getThemeBySchedule() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 19 ? "light" : "dark";
}