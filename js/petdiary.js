/* Дневник питомца (1.8.8): короткие смешные записи о том, чем питомец занимался, пока вы были в других делах.
   Чистый модуль, без Profile: tick(diary, petId, name, last, now) возвращает новые записи и время «последней записи»
   (запись — раз в STEP_MS, не больше MAX_NEW за один заход; выбор строки зависит только от времени и вида, не от Math.random). */
const PetDiary = (() => {
  const STEP_MS = 3 * 3600 * 1000, MAX_NEW = 4, KEEP = 40;
  const COMMON = [
    (n) => _t("{0} полдня гонялся за собственной тенью и так и не поймал.", [n]),
    (n) => _t("{0} нашёл блестящий камень, спрятал под подушку и теперь делает вид, что ничего не было.", [n]),
    (n) => _t("{0} сидел у окна и с важным видом охранял деревню от облаков.", [n]),
    (n) => _t("{0} попробовал доспех героя на вкус. Невкусно, но принципиально.", [n]),
    (n) => _t("{0} встретил в деревне гуся. Гусь победил. {0} об этом не говорит.", [n]),
    (n) => _t("{0} устроил в доме тренировку: бой с подушкой, подушка проиграла.", [n]),
    (n) => _t("{0} весь день притворялся спящим, чтобы получить лакомство.", [n]),
    (n) => _t("{0} перебрал свои припасы и пересчитал дважды: всё на месте, но подозрения остались.", [n]),
    (n) => _t("{0} учил старого кота у ворот приёмам. Кот зевнул.", [n]),
    (n) => _t("{0} нашёл яму, залез в неё, вылез чумазым и очень довольным.", [n]),
    (n) => _t("{0} слушал, как Бобёр-хранитель читает бестиарий, и заснул на самой страшной главе.", [n]),
    (n) => _t("{0} подкрался к кузнецу и стащил рукавицу. Рукавицу вернули, гордость осталась.", [n]),
    (n) => _t("{0} гонял чаек на берегу. Чайки выиграли по очкам.", [n]),
    (n) => _t("{0} провёл ночь на посту: ловил светлячков и не поймал ни одного.", [n]),
  ];
  const BY_SPECIES = {
    dog: [(n) => _t("{0} принёс палку размером с бревно и гордо положил у двери.", [n])],
    cat: [(n) => _t("{0} сбросил со стола всё, что можно, и посмотрел вам в глаза.", [n])],
    hamster: [(n) => _t("{0} набил щёки зерном до такого размера, что не пролез в норку.", [n])],
  };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function line(petId, name, slot) {
    const pool = COMMON.concat(BY_SPECIES[petId] || []);
    return pool[hash(String(petId) + ':' + slot) % pool.length](name);
  }
  // diary — массив записей {t, s} (s — готовая строка); last — время, до которого записи уже есть.
  function tick(diary, petId, name, last, now) {
    const list = Array.isArray(diary) ? diary : [];
    if (!petId || !Number.isFinite(now)) return { diary: list, last: last || now, added: 0 };
    if (!Number.isFinite(last) || last <= 0) return { diary: list, last: now, added: 0 };      // первый заход: просто начинаем отсчёт
    const n = Math.max(0, Math.min(MAX_NEW, Math.floor((now - last) / STEP_MS)));
    let at = last;
    for (let i = 0; i < n; i++) { at += STEP_MS; list.push({ t: at, s: line(petId, name, Math.floor(at / STEP_MS)) }); }
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
    return { diary: list, last: n ? now : last, added: n };
  }
  return { STEP_MS, MAX_NEW, KEEP, line, tick };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PetDiary;
