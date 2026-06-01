import { User, ShiftPattern, Requirement, PairRestriction, Schedule, Submission } from '../types';

// Simple Local Storage Database to replace Firestore for this demo
const DB_PREFIX = 'shiftflow_db_';

class LocalDB {
  private get<T>(collection: string): T[] {
    const data = localStorage.getItem(DB_PREFIX + collection);
    return data ? JSON.parse(data) : [];
  }

  private set<T>(collection: string, data: T[]): void {
    localStorage.setItem(DB_PREFIX + collection, JSON.stringify(data));
    // Trigger a custom event for "live" updates similar to onSnapshot
    window.dispatchEvent(new CustomEvent('db-update', { detail: { collection } }));
  }

  async list<T>(collection: string, hotelId: string): Promise<T[]> {
    const all = this.get<T>(collection);
    return all.filter((item: any) => item.hotelId === hotelId);
  }

  async add<T>(collection: string, data: Omit<T, 'id'>): Promise<string> {
    const all = this.get<any>(collection);
    const id = Math.random().toString(36).substring(2, 11);
    const newItem = { ...data, id };
    all.push(newItem);
    this.set(collection, all);
    return id;
  }

  async update<T>(collection: string, id: string, data: Partial<T>): Promise<void> {
    const all = this.get<any>(collection);
    const index = all.findIndex((item: any) => item.id === id);
    if (index !== -1) {
      all[index] = { ...all[index], ...data };
      this.set(collection, all);
    }
  }

  async delete(collection: string, id: string): Promise<void> {
    const all = this.get<any>(collection);
    const filtered = all.filter((item: any) => item.id !== id);
    this.set(collection, filtered);
  }

  async batchSet(collection: string, items: any[]): Promise<void> {
    const all = this.get<any>(collection);
    const itemsWithIds = items.map(item => ({
      ...item,
      id: item.id || Math.random().toString(36).substring(2, 11)
    }));
    this.set(collection, [...all, ...itemsWithIds]);
  }

  // Subscribe to updates (simplistic version of onSnapshot)
  subscribe(collection: string, callback: () => void) {
    const handler = (event: any) => {
      if (event.detail.collection === collection) {
        callback();
      }
    };
    window.addEventListener('db-update', handler);
    return () => window.removeEventListener('db-update', handler);
  }
}

export const localDb = new LocalDB();
