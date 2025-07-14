import type { Alarm, AnalysisData } from '../types';

const DB_NAME = 'ZenithSleepDB';
const DB_VERSION = 1;
const ALARMS_STORE_NAME = 'alarms';
const HISTORY_STORE_NAME = 'sleepHistory';

let db: IDBDatabase;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Database error:", request.error);
      reject('Error opening database');
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const tempDb = (event.target as IDBOpenDBRequest).result;
      if (!tempDb.objectStoreNames.contains(ALARMS_STORE_NAME)) {
        tempDb.createObjectStore(ALARMS_STORE_NAME, { keyPath: 'id' });
      }
      if (!tempDb.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        tempDb.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'date' });
      }
    };
  });
}

// --- Alarms ---

export async function getAllAlarms(): Promise<Alarm[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ALARMS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(ALARMS_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result.sort((a: Alarm, b: Alarm) => a.time.localeCompare(b.time)));
        };
        request.onerror = () => {
            console.error('Error fetching alarms:', request.error);
            reject('Error fetching alarms');
        };
    });
}

export async function saveAlarm(alarm: Alarm): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ALARMS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(ALARMS_STORE_NAME);
        const request = store.put(alarm); // put will add or update

        request.onsuccess = () => {
            resolve();
        };
        request.onerror = () => {
            console.error('Error saving alarm:', request.error);
            reject('Error saving alarm');
        };
    });
}

export async function deleteAlarmDB(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ALARMS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(ALARMS_STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
            resolve();
        };
        request.onerror = () => {
            console.error('Error deleting alarm:', request.error);
            reject('Error deleting alarm');
        };
    });
}

// --- Sleep History ---

export async function getSleepHistory(): Promise<AnalysisData[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(HISTORY_STORE_NAME, 'readonly');
        const store = transaction.objectStore(HISTORY_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by date descending to show the most recent first
            const sortedHistory = request.result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            resolve(sortedHistory);
        };
        request.onerror = () => {
            console.error('Error fetching sleep history:', request.error);
            reject('Error fetching sleep history');
        };
    });
}

export async function addSleepSession(sessionData: AnalysisData): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(HISTORY_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(HISTORY_STORE_NAME);
        const request = store.add(sessionData);

        request.onsuccess = () => {
            resolve();
        };
        request.onerror = () => {
            console.error('Error adding sleep session:', request.error);
            reject('Error adding sleep session');
        };
    });
}
