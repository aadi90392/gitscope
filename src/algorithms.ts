import { merge } from "node-diff3";
import type { Commit } from "./types";
export function safePath(path: string) {
  if (
    !path ||
    path.length > 240 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    path.includes("\0") ||
    path.split("/").some((p) => p.toLowerCase() === ".git")
  )
    throw Error(
      "Use a relative file path outside .git, without .. or empty segments.",
    );
  return path;
}
export function mergeText(
  base: string | null,
  ours: string | null,
  theirs: string | null,
) {
  if (ours === theirs) return { clean: true, result: ours };
  if (ours === base) return { clean: true, result: theirs };
  if (theirs === base) return { clean: true, result: ours };
  if (ours === null || theirs === null)
    return { clean: false, result: ours ?? theirs };
  const r = merge(
    ours.split("\n"),
    (base ?? "").split("\n"),
    theirs.split("\n"),
  );
  return { clean: !r.conflict, result: r.result.join("\n") };
}
export function topo(commits: Commit[]) {
  const map = new Map(commits.map((c) => [c.oid, c]));
  const children = new Map<string, number>();
  commits.forEach((c) =>
    c.parents.forEach((p) => children.set(p, (children.get(p) || 0) + 1)),
  );
  const queue = commits.filter((c) => !children.get(c.oid));
  const result: Commit[] = [];
  while (queue.length) {
    queue.sort((a, b) => b.time - a.time || a.oid.localeCompare(b.oid));
    const c = queue.shift()!;
    result.push(c);
    for (const p of c.parents) {
      children.set(p, (children.get(p) || 0) - 1);
      if (!children.get(p) && map.has(p)) queue.push(map.get(p)!);
    }
  }
  return result;
}
export function layout(commits: Commit[]) {
  const lanes: string[] = [];
  const nodes = commits.map((c, index) => {
    let lane = lanes.indexOf(c.oid);
    if (lane < 0) {
      lane = lanes.indexOf("");
      if (lane < 0) lane = lanes.length;
      lanes[lane] = c.oid;
    }
    lanes[lane] = "";
    c.parents.forEach((p, i) => {
      if (!lanes.includes(p)) {
        let target = i === 0 ? lane : lanes.indexOf("");
        if (target < 0) target = lanes.length;
        lanes[target] = p;
      }
    });
    return { ...c, lane, index };
  });
  return nodes;
}
export function tokenize(input: string) {
  const parts = input.match(/"[^"\n]*"|'[^'\n]*'|[^\s]+/g) || [];
  if (parts.join("").split('"').length % 2 === 0) throw Error("Unclosed quote");
  return parts.map((p) => p.replace(/^["']|["']$/g, ""));
}
