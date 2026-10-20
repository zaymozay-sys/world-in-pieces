// Анонимная воронка новичка (1.9.7): только счётчики «сколько устройств дошло до шага» по дням. Имён, ключей и адресов
// не сохраняем; один клиент шлёт каждое событие один раз (см. js/funnel.js), адрес нужен только для ограничения частоты.
const EVENTS = ['first_open', 'tut_half', 'tut_done', 'win1', 'win3', 'win10', 'lesson1', 'lessons_all'];
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const DAYS = 30;
module.exports = { EVENTS, dayOf, DAYS };
