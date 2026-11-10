import { create } from "zustand";
import type { Snapshot } from "./types";
const worker = new Worker(new URL("./git.worker.ts", import.meta.url), {
  type: "module",
});
let seq = 0;
const requests = new Map<
  number,
  { resolve: (x: any) => void; reject: (e: Error) => void }
>();
worker.onmessage = ({ data }) => {
  const r = requests.get(data.id);
  if (!r) return;
  requests.delete(data.id);
  data.error ? r.reject(Error(data.error)) : r.resolve(data.result);
};
worker.onerror = (event) => {
  requests.forEach((r) =>
    r.reject(Error("Git worker stopped: " + event.message)),
  );
  requests.clear();
};
export function rpc<T = any>(method: string, ...args: any[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    requests.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}
export const useStore = create<{
  snapshot: Snapshot | null;
  selected: string;
  view: string;
  setSnapshot: (s: Snapshot) => void;
  select: (s: string) => void;
  setView: (s: string) => void;
}>((set) => ({
  snapshot: null,
  selected: "",
  view: "History",
  setSnapshot: (s) => set({ snapshot: s }),
  select: (selected) => set({ selected }),
  setView: (view) => set({ view }),
}));
