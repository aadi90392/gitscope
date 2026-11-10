import "./polyfills";
import FS from "@isomorphic-git/lightning-fs";
import { Engine } from "./engine";
const engine = new Engine(new FS("gitscope-v1"));
let chain = Promise.resolve();
self.onmessage = ({
  data,
}: {
  data: { id: number; method: string; args: any[] };
}) => {
  chain = chain.then(async () => {
    try {
      const result = await navigator.locks.request(
        "gitscope-repository-write",
        async () => {
          try {
            return await engine.run(data.method, data.args);
          } finally {
            await engine.p.flush();
          }
        },
      );
      self.postMessage({ id: data.id, result });
    } catch (e: any) {
      self.postMessage({ id: data.id, error: e.message || String(e) });
    }
  });
};
