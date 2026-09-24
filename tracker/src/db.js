/**
 * IndexedDB без библиотек. Данные живут только на устройстве: четыре
 * хранилища, записи целиком, ключ — id (у meta — key).
 */
const NAME = 'tracker';
const VERSION = 1;
export const STORES = ['spheres', 'tasks', 'goals', 'meta'];

let opening;

export function open() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // новая версия приложения обновляет схему — старая вкладка уступает ей базу
      db.onversionchange = () => {
        db.close();
        opening = undefined;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return opening;
}

/** Транзакция: fn получает хранилища по имени, результат — после commit. */
async function tx(names, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    const out = fn(stores);
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
  });
}

export const getAll = (name) => tx([name], 'readonly', (s) => s[name].getAll());
export const put = (name, value) => tx([name], 'readwrite', (s) => void s[name].put(value));
export const remove = (name, id) => tx([name], 'readwrite', (s) => void s[name].delete(id));

/** Несколько записей в одной транзакции: [{ store, value }] и [{ store, id, remove: true }]. */
export const batch = (ops) =>
  tx([...new Set(ops.map((o) => o.store))], 'readwrite', (s) => {
    for (const o of ops) o.remove ? s[o.store].delete(o.id) : s[o.store].put(o.value);
  });

/** Полная замена данных одной транзакцией: либо вся копия, либо ничего. */
export const replaceAll = (data) =>
  tx(['spheres', 'tasks', 'goals'], 'readwrite', (s) => {
    for (const name of ['spheres', 'tasks', 'goals']) {
      s[name].clear();
      for (const v of data[name]) s[name].put(v);
    }
  });
