import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Engine } from "../src/engine";
import { mergeText, topo, layout, safePath } from "../src/algorithms";
import { zipSync, strToU8 } from "fflate";
let root: string, e: Engine;
beforeEach(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gitscope-test-"));
  const p: any = {};
  for (const m of [
    "readFile",
    "writeFile",
    "unlink",
    "readdir",
    "mkdir",
    "rmdir",
    "stat",
    "lstat",
    "readlink",
    "chmod",
    "symlink",
  ])
    p[m] = async (...args: any[]) => {
      args[0] = path.join(root, args[0]);
      return (fs.promises as any)[m](...args);
    };
  e = new Engine({ promises: p });
});
afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true });
});
describe("real Git repository operations", () => {
  it("builds divergent demo history with actual objects and safe merges", async () => {
    const s = await e.demo();
    expect(s.commits).toHaveLength(8);
    expect(s.branches).toHaveLength(4);
    expect(s.tags[0].name).toBe("v1.0.0");
    const head = s.head;
    const merged = await e.merge("feature/dark-mode");
    expect(merged.pending?.conflicts).toHaveLength(1);
    expect(merged.head).toBe(head);
    expect(await e.file("src/config.ts")).toContain('"light"');
    await expect(e.finish()).rejects.toThrow("Resolve every");
    const conflict = merged.pending!.conflicts[0];
    await expect(e.resolve(conflict.path, "<<<<<<< current")).rejects.toThrow(
      "markers",
    );
    await e.resolve(conflict.path, conflict.theirs);
    const done = await e.finish();
    expect(done.pending).toBeNull();
    expect(done.commits.find((c) => c.oid === done.head)?.parents).toHaveLength(
      2,
    );
    expect(await e.file("src/config.ts")).toContain('"dark"');
    expect(await e.file("src/theme.css")).toContain("color-scheme");
  });
  it("rejects branch checkout with uncommitted files", async () => {
    await e.create("real");
    await e.branch("other");
    await e.save("new.txt", "content");
    await expect(e.checkout("other")).rejects.toThrow(
      "Commit your working changes",
    );
    await expect(e.commit("empty")).rejects.toThrow("Stage changes");
    await e.stage(".");
    const committed = await e.commit("add file");
    expect(
      committed.status.every((s) => s.head === s.stage && s.stage === s.work),
    ).toBe(true);
  });
  it("cherry-picks a single-parent change as a new commit", async () => {
    const s = await e.demo();
    const fix = s.branches.find((b) => b.name === "fix/search")!;
    await e.save("extra.txt", "independent change");
    await e.stage(".");
    const current = await e.commit("Independent work");
    const result = await e.merge(fix.oid, "cherry-pick");
    expect(result.head).not.toBe(fix.oid);
    expect(result.commits.find((c) => c.oid === result.head)?.parents).toEqual([
      current.head,
    ]);
    expect(await e.file("src/search.ts")).toContain("toLowerCase");
  });
  it("supports local fast-forward and clean divergent merge", async () => {
    await e.demo();
    const result = await e.merge("docs/getting-started");
    expect(result.head).toBe(
      result.branches.find((b) => b.name === "docs/getting-started")?.oid,
    );
    await e.merge("fix/search");
    expect(await e.file("docs/guide.md")).toContain("Getting started");
    expect(await e.file("src/search.ts")).toContain("toLowerCase");
  });
  it("aborts without modifying worktree or head", async () => {
    const s = await e.demo();
    await e.merge("feature/dark-mode");
    const result = await e.abort();
    expect(result.head).toBe(s.head);
    expect(result.pending).toBeNull();
    expect(await e.file("src/config.ts")).toContain("light");
  });
  it("exports and imports complete Git history into isolated workspace", async () => {
    const s = await e.demo();
    const bytes = await e.export();
    const restored = await e.import(bytes, "restored");
    expect(restored.id).not.toBe(s.id);
    expect(restored.head).toBe(s.head);
    expect(restored.commits).toEqual(s.commits);
    expect(restored.lab).toBe(false);
    await e.save("README.md", "changed");
    await e.open(s.id);
    expect(await e.file("README.md")).toContain("Atlas");
  });
  it("rejects traversal archives and source ZIP without history", async () => {
    await e.create("original");
    await expect(
      e.import(zipSync({ "README.md": strToU8("hi") }), "bad"),
    ).rejects.toThrow(".git");
    await expect(
      e.import(
        zipSync({
          ".git/HEAD": strToU8("ref: refs/heads/main"),
          "../escape": strToU8("x"),
        }),
        "bad",
      ),
    ).rejects.toThrow("Unsafe");
  });
  it("retains staged deletions and line attribution", async () => {
    await e.create("repo");
    await e.save("a.txt", "one\ntwo\n");
    await e.stage(".");
    const first = await e.commit("first");
    await e.save("a.txt", "one\nchanged\n");
    await e.stage(".");
    const second = await e.commit("second");
    const blame = await e.blame("a.txt");
    expect(blame.map((l) => l.oid)).toEqual([first.head, second.head]);
    await e.remove("a.txt");
    await e.stage(".");
    await e.commit("delete");
    expect((await e.snapshot()).files).not.toContain("a.txt");
  });
  it("controlled terminal never executes shell commands", async () => {
    await e.create("repo");
    await expect(e.terminal("rm -rf /")).rejects.toThrow("Only supported");
    await expect(e.terminal("git push")).rejects.toThrow("Unsupported");
    await e.terminal("git branch feature/test");
    expect(await e.terminal("git branch")).toContain("feature/test");
  });
});
describe("merge and graph algorithms", () => {
  it("merges non-overlapping edits and flags same-line/deletion conflicts", () => {
    expect(mergeText("a\nb\nc", "A\nb\nc", "a\nb\nC")).toEqual({
      clean: true,
      result: "A\nb\nC",
    });
    expect(mergeText("a", "b", "c").clean).toBe(false);
    expect(mergeText("a", null, "b").clean).toBe(false);
  });
  it("orders graph topologically even with skewed commit timestamps", () => {
    const commits = [
      { oid: "a", parents: [], time: 100, message: "a", author: "u" },
      { oid: "b", parents: ["a"], time: 1, message: "b", author: "u" },
    ];
    expect(topo(commits).map((c) => c.oid)).toEqual(["b", "a"]);
    expect(layout(topo(commits)).map((n) => n.index)).toEqual([0, 1]);
  });
  it("rejects unsafe working paths", () => {
    for (const p of ["../x", "/a", ".git/config", "src/../x", "src\\a"])
      expect(() => safePath(p)).toThrow();
    expect(safePath("src/a.ts")).toBe("src/a.ts");
  });
});
