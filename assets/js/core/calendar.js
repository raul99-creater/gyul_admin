
import { escapeHtml } from './utils.js';

export function renderMonthCalendar(target, events, cursorDate) {
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const startWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const cells = [];
  dayNames.forEach((name) => cells.push(`<div class="day-name">${name}</div>`));
  for (let i = 0; i < startWeekday; i += 1) cells.push('<div class="day-cell"></div>');

  for (let day = 1; day <= totalDays; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = events.filter((event) => {
      const base = event.starts_at || event.startsAt;
      if (!base) return false;
      const date = new Date(base);
      const eventKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return key === eventKey;
    });
    cells.push(`
      <div class="day-cell">
        <div class="day-num">${day}</div>
        ${dayEvents.map((event) => `<span class="event-chip">${escapeHtml(event.title || event.label || '일정')}</span>`).join('')}
      </div>`);
  }
  target.innerHTML = cells.join('');
}
