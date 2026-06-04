/**
 * Manualize — IndexedDB Wrapper
 *
 * Stores guides and steps locally with a thin promise-based API.
 *
 * Object stores:
 *   guides  { id, title, createdAt, updatedAt, stepCount }
 *   steps   { id, guideId, order, description, title, caption,
 *             selector, screenshotDataUrl, pageUrl, pageTitle,
 *             elementRect, timestamp }
 */

const _DB_NAME = 'manualize';
const _DB_VERSION = 1;

class ManualizeDB {
  constructor() {
    /** @type {IDBDatabase|null} */
    this._db = null;
  }

  /* ────── connection ────── */

  async open() {
    if (this._db) return this._db;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(_DB_NAME, _DB_VERSION);

      req.onerror = () => reject(req.error);

      req.onsuccess = () => {
        this._db = req.result;
        resolve(this._db);
      };

      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('guides')) {
          const gs = db.createObjectStore('guides', { keyPath: 'id' });
          gs.createIndex('updatedAt', 'updatedAt');
        }

        if (!db.objectStoreNames.contains('steps')) {
          const ss = db.createObjectStore('steps', { keyPath: 'id' });
          ss.createIndex('guideId', 'guideId');
          ss.createIndex('guideId_order', ['guideId', 'order']);
        }
      };
    });
  }

  /* ────── helpers ────── */

  async _getByReq(storeName, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async _getAllByIndex(storeName, indexName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const idx = tx.objectStore(storeName).index(indexName);
      const req = idx.getAll(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* ────── Guides ────── */

  async createGuide(title = 'Untitled Guide') {
    const guide = {
      id: crypto.randomUUID(),
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stepCount: 0,
    };
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('guides', 'readwrite');
      tx.objectStore('guides').add(guide);
      tx.oncomplete = () => resolve(guide);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getGuide(id) {
    return this._getByReq('guides', (s) => s.get(id));
  }

  async updateGuide(guide) {
    guide.updatedAt = Date.now();
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('guides', 'readwrite');
      tx.objectStore('guides').put(guide);
      tx.oncomplete = () => resolve(guide);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteGuide(id) {
    await this._deleteGuideSteps(id);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('guides', 'readwrite');
      tx.objectStore('guides').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async listGuides() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('guides', 'readonly');
      const req = tx.objectStore('guides').getAll();
      req.onsuccess = () => {
        const guides = req.result;
        guides.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(guides);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /* ────── Steps ────── */

  async saveStep(step) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('steps', 'readwrite');
      tx.objectStore('steps').add(step);
      tx.oncomplete = () => resolve(step);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getStep(id) {
    return this._getByReq('steps', (s) => s.get(id));
  }

  async getSteps(guideId) {
    const steps = await this._getAllByIndex('steps', 'guideId', guideId);
    steps.sort((a, b) => a.order - b.order);
    return steps;
  }

  async updateStep(id, changes) {
    const step = await this.getStep(id);
    if (!step) return null;
    Object.assign(step, changes);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('steps', 'readwrite');
      tx.objectStore('steps').put(step);
      tx.oncomplete = () => resolve(step);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteStep(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('steps', 'readwrite');
      tx.objectStore('steps').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async reorderSteps(guideId, orderedIds) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('steps', 'readwrite');
      const store = tx.objectStore('steps');
      orderedIds.forEach((id, index) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const step = getReq.result;
          if (step) {
            step.order = index;
            store.put(step);
          }
        };
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async _deleteGuideSteps(guideId) {
    const steps = await this.getSteps(guideId);
    if (steps.length === 0) return;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('steps', 'readwrite');
      const store = tx.objectStore('steps');
      steps.forEach((s) => store.delete(s.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /* ────── Storage Estimation ────── */

  async estimateGuideSize(guideId) {
    const steps = await this.getSteps(guideId);
    let totalBytes = 0;
    for (const step of steps) {
      // screenshot base64 data is the bulk of storage
      if (step.screenshotDataUrl) {
        totalBytes += step.screenshotDataUrl.length;
      }
      // Add rough estimate for the rest of the metadata (~500 bytes)
      totalBytes += 500;
    }
    return totalBytes;
  }

  async estimateTotalSize() {
    const guides = await this.listGuides();
    let total = 0;
    for (const g of guides) {
      total += await this.estimateGuideSize(g.id);
    }
    return total;
  }
}
