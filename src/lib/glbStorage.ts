"use client";

/**
 * Client-only binary storage for Admin-uploaded GLB files ("3D Map Control").
 * This prototype has no backend/object storage, and a GLB is routinely
 * several MB — far too big for localStorage (the zustand store's persistence
 * layer, ~5-10MB total budget already shared with everything else). IndexedDB
 * has no such practical ceiling and stores Blobs natively, so the binary
 * lives here, keyed by project id, while the small JSON-serializable
 * placement metadata (scale/rotation/altitude/…) lives in the zustand store
 * as `ProjectMapModel` (lib/types.ts) — see store.ts `projectMapModels`.
 *
 * Note: the two are independent persistence layers with no referential
 * integrity between them (acceptable for a frontend-only prototype) — a
 * cleared IndexedDB with surviving store metadata just means "no model
 * loads", same as a broken image URL would.
 */

const DB_NAME = "rozaris-glb-models";
const STORE_NAME = "models";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveModelBlob(projectId: string, file: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(file, projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getModelBlob(projectId: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(projectId);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteModelBlob(projectId: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
