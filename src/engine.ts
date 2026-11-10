import * as git from "isomorphic-git";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { diffLines } from "diff";
import { safePath, mergeText, topo, tokenize } from "./algorithms";
import type { Snapshot, Commit, Pending, Conflict, Detail } from "./types";
const author = { name: "GitScope User", email: "local@gitscope.invalid" };
const decode = (b: Uint8Array) => {
  if (b.includes(0))
    throw Error(
      "Binary files are preserved in backups but cannot be edited or merged in the text tools.",
    );
  return new TextDecoder("utf-8", { fatal: true }).decode(b);
};
export class Engine {
  fs: any;
  id = "";
  dir = "";
  constructor(fs: any) {
    this.fs = fs;
  }
  get p() {
    return this.fs.promises;
  }
  get ctx() {
    return { fs: this.fs, dir: this.dir };
  }
  async exists(p: string) {
    try {
      await this.p.stat(p);
      return true;
    } catch {
      return false;
    }
  }
  async mkdir(p: string) {
    let current = "";
    for (const part of p.split("/").filter(Boolean)) {
      current += "/" + part;
      if (!(await this.exists(current))) await this.p.mkdir(current);
    }
  }
  async write(path: string, text: string | Uint8Array) {
    await this.mkdir(path.slice(0, path.lastIndexOf("/")));
    await this.p.writeFile(path, text);
  }
  async meta() {
    return JSON.parse(
      await this.p.readFile("/meta-" + this.id + ".json", "utf8"),
    );
  }
  async setMeta(meta: any) {
    await this.write("/meta-" + this.id + ".json", JSON.stringify(meta));
  }
  async list() {
    await this.mkdir("/repos");
    const ids = await this.p.readdir("/repos");
    const items = [];
    for (const id of ids) {
      try {
        items.push(
          JSON.parse(await this.p.readFile("/meta-" + id + ".json", "utf8")),
        );
      } catch {}
    }
    return items;
  }
  async open(id: string) {
    if (!/^[a-z0-9-]+$/.test(id)) throw Error("Invalid workspace");
    this.id = id;
    this.dir = "/repos/" + id;
    if (!(await this.exists("/meta-" + id + ".json")))
      throw Error("Workspace not found");
    return this.snapshot();
  }
  async create(name: string, lab = false, seed = true) {
    if (!name.trim()) throw Error("Name is required");
    this.id = crypto.randomUUID();
    this.dir = "/repos/" + this.id;
    await this.mkdir(this.dir);
    await git.init({ ...this.ctx, defaultBranch: "main" });
    await this.setMeta({
      id: this.id,
      name: name.trim().slice(0, 80),
      lab,
      pending: null,
    });
    if (seed) {
      await this.write(
        this.dir + "/README.md",
        "# " + name + "\n\nA local-first Git workspace.\n",
      );
      await git.add({ ...this.ctx, filepath: "README.md" });
      await git.commit({
        ...this.ctx,
        message: "Initialize workspace",
        author,
      });
    }
    return this.snapshot();
  }
  async walk(dir = this.dir, includeGit = false): Promise<string[]> {
    let paths: string[] = [];
    for (const name of await this.p.readdir(dir)) {
      if (!includeGit && name === ".git") continue;
      const path = dir + "/" + name;
      const stat = await this.p.stat(path);
      if (stat.isDirectory())
        paths.push(...(await this.walk(path, includeGit)));
      else paths.push(path.slice(this.dir.length + 1));
      if (paths.length > 5000) throw Error("Workspace limit: 5,000 files");
    }
    return paths;
  }
  async oid(ref = "HEAD") {
    return git.resolveRef({ ...this.ctx, ref });
  }
  async clean() {
    if ((await this.meta()).pending)
      throw Error("Finish or abort the pending operation first.");
    const s = await git.statusMatrix(this.ctx);
    if (s.some(([, h, w, i]) => h !== w || w !== i))
      throw Error("Commit your working changes before switching or merging.");
  }
  async validateTrees(commits: Commit[]) {
    const seen = new Set<string>();
    let entries = 0;
    const visit = async (oid: string) => {
      if (seen.has(oid)) return;
      seen.add(oid);
      const { tree } = await git.readTree({ ...this.ctx, oid });
      for (const entry of tree) {
        if (++entries > 100000)
          throw Error(
            "Repository tree complexity exceeds this edition’s limit.",
          );
        safePath(entry.path);
        if (entry.path.includes("/")) throw Error("Invalid tree entry name.");
        if (entry.mode === "120000" || entry.mode === "160000")
          throw Error(
            "Symbolic links and submodules are not supported in this browser workspace.",
          );
        if (entry.type === "tree") await visit(entry.oid);
      }
    };
    for (const commit of commits) {
      const { commit: c } = await git.readCommit({
        ...this.ctx,
        oid: commit.oid,
      });
      await visit(c.tree);
    }
  }
  async snapshot(): Promise<Snapshot> {
    const meta = await this.meta();
    const branches = [];
    for (const name of await git.listBranches(this.ctx))
      branches.push({ name, oid: await this.oid(name) });
    const tags = [];
    for (const name of await git.listTags(this.ctx)) {
      let oid = await this.oid("refs/tags/" + name);
      try {
        oid = (await git.readTag({ ...this.ctx, oid })).tag.object;
      } catch {}
      tags.push({ name, oid });
    }
    let head = "";
    try {
      head = await this.oid();
    } catch {}
    const map = new Map<string, Commit>();
    const queue = [
      head,
      ...branches.map((b) => b.oid),
      ...tags.map((t) => t.oid),
    ].filter(Boolean);
    while (queue.length) {
      const oid = queue.shift()!;
      if (map.has(oid)) continue;
      if (map.size >= 500)
        throw Error(
          "This edition supports repositories with up to 500 reachable commits.",
        );
      const { commit: c } = await git.readCommit({ ...this.ctx, oid });
      map.set(oid, {
        oid,
        message: c.message.trim(),
        parents: c.parent,
        author: c.author.name,
        time: c.author.timestamp,
      });
      queue.push(...c.parent);
    }
    return {
      ...meta,
      head,
      branch:
        (await git.currentBranch({ ...this.ctx, fullname: false })) ||
        "detached",
      branches,
      tags,
      commits: topo([...map.values()]),
      files: await this.walk(),
      status: (await git.statusMatrix(this.ctx)).map(
        ([path, head, work, stage]) => ({ path, head, work, stage }),
      ),
    };
  }
  async tree(ref: string): Promise<Record<string, Uint8Array>> {
    if (!ref) return {};
    const result: Record<string, Uint8Array> = Object.create(null);
    for (const filepath of await git.listFiles({ ...this.ctx, ref })) {
      const b = await git.readBlob({
        ...this.ctx,
        oid: await this.oid(ref),
        filepath,
      });
      result[filepath] = b.blob;
    }
    return result;
  }
  async file(path: string, ref?: string) {
    safePath(path);
    try {
      return decode(
        ref
          ? (
              await git.readBlob({
                ...this.ctx,
                oid: await this.oid(ref),
                filepath: path,
              })
            ).blob
          : await this.p.readFile(this.dir + "/" + path),
      );
    } catch (e: any) {
      if (e.code === "ENOENT" || e.code === "NotFoundError") return "";
      throw e;
    }
  }
  async save(path: string, text: string) {
    safePath(path);
    if (new TextEncoder().encode(text).length > 1024 * 1024)
      throw Error("Text files are limited to 1 MiB.");
    if ((await this.meta()).pending)
      throw Error("Use the conflict resolver while a merge is pending.");
    await this.write(this.dir + "/" + path, text);
    return this.snapshot();
  }
  async remove(path: string) {
    safePath(path);
    if ((await this.meta()).pending)
      throw Error("Finish the pending merge first.");
    await this.p.unlink(this.dir + "/" + path);
    return this.snapshot();
  }
  async stage(path: string) {
    if ((await this.meta()).pending)
      throw Error("Resolve the pending operation first.");
    const paths =
      path === "."
        ? (await git.statusMatrix(this.ctx)).map((x) => x[0])
        : [safePath(path)];
    for (const filepath of paths) {
      if (await this.exists(this.dir + "/" + filepath))
        await git.add({ ...this.ctx, filepath });
      else await git.remove({ ...this.ctx, filepath });
    }
    return this.snapshot();
  }
  async commit(message: string) {
    if (!message.trim()) throw Error("Commit message is required.");
    if ((await this.meta()).pending)
      throw Error("Complete the conflict resolution first.");
    if (!(await git.statusMatrix(this.ctx)).some(([, h, , s]) => h !== s))
      throw Error("Stage changes before committing.");
    await git.commit({ ...this.ctx, message: message.trim(), author });
    return this.snapshot();
  }
  async branch(name: string) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(name) ||
      name.includes("..") ||
      name.includes("//") ||
      name.endsWith("/") ||
      name.endsWith(".lock")
    )
      throw Error("Use a valid Git branch name.");
    await git.branch({ ...this.ctx, ref: name });
    return this.snapshot();
  }
  async checkout(ref: string) {
    await this.clean();
    await git.checkout({ ...this.ctx, ref });
    return this.snapshot();
  }
  async tag(name: string) {
    await git.tag({ ...this.ctx, ref: name });
    return this.snapshot();
  }
  async detail(ref: string, compare?: string): Promise<Detail> {
    const oid = await this.oid(ref);
    const { commit } = await git.readCommit({ ...this.ctx, oid });
    const current = await this.tree(oid),
      prev = await this.tree(compare || commit.parent[0] || "");
    const changed = [];
    for (const path of new Set([
      ...Object.keys(current),
      ...Object.keys(prev),
    ])) {
      if (String(current[path]) === String(prev[path])) continue;
      let before = "",
        after = "";
      try {
        before = prev[path] ? decode(prev[path]) : "";
        after = current[path] ? decode(current[path]) : "";
      } catch {
        before = "[Binary file]";
        after = "[Binary file changed — export to inspect]";
      }
      changed.push({ path, before, after });
    }
    const snap = await this.snapshot();
    return {
      files: Object.keys(current),
      changed,
      refs: [...snap.branches, ...snap.tags]
        .filter((x) => x.oid === oid)
        .map((x) => x.name),
    };
  }
  async merge(target: string, kind: "merge" | "cherry-pick" = "merge") {
    await this.clean();
    const branch = await git.currentBranch({ ...this.ctx, fullname: false });
    if (!branch) throw Error("Check out a branch first.");
    const ours = await this.oid(),
      theirs = await this.oid(target);
    if (ours === theirs) throw Error("Already at this commit.");
    let base = "";
    if (kind === "merge") {
      const bases = await git.findMergeBase({
        ...this.ctx,
        oids: [ours, theirs],
      });
      if (bases.length !== 1)
        throw Error("Only histories with one common merge base are supported.");
      base = bases[0];
      if (base === theirs) return this.snapshot();
      if (base === ours) {
        await git.writeRef({
          ...this.ctx,
          ref: "refs/heads/" + branch,
          value: theirs,
          force: true,
        });
        await git.checkout({ ...this.ctx, ref: branch, force: true });
        return this.snapshot();
      }
    } else {
      const c = (await git.readCommit({ ...this.ctx, oid: theirs })).commit;
      if (c.parent.length !== 1)
        throw Error("Cherry-pick supports single-parent commits only.");
      base = c.parent[0];
    }
    const [b, o, t] = await Promise.all([
      this.tree(base),
      this.tree(ours),
      this.tree(theirs),
    ]);
    const changes: Record<string, string | null> = Object.create(null),
      conflicts: Conflict[] = [];
    for (const path of new Set([
      ...Object.keys(b),
      ...Object.keys(o),
      ...Object.keys(t),
    ])) {
      if (
        String(o[path]) === String(t[path]) ||
        String(b[path]) === String(t[path])
      )
        continue;
      const base = b[path] ? decode(b[path]) : null,
        our = o[path] ? decode(o[path]) : null,
        their = t[path] ? decode(t[path]) : null;
      const merged = mergeText(base, our, their);
      changes[path] = merged.result;
      if (!merged.clean)
        conflicts.push({
          path,
          base,
          ours: our,
          theirs: their,
          result: merged.result,
          resolved: false,
        });
    }
    const message =
      kind === "merge"
        ? `Merge ${target} into ${branch}`
        : (
            await git.readCommit({ ...this.ctx, oid: theirs })
          ).commit.message.trim();
    const pending: Pending = {
      kind,
      ours,
      theirs,
      branch,
      target,
      message,
      changes,
      conflicts,
    };
    await this.setMeta({ ...(await this.meta()), pending });
    if (!conflicts.length) return this.finish();
    return this.snapshot();
  }
  async resolve(path: string, text: string | null) {
    const meta = await this.meta();
    const pending: Pending = meta.pending;
    if (!pending) throw Error("No pending operation.");
    const c = pending.conflicts.find((c) => c.path === path);
    if (!c) throw Error("Conflict not found.");
    if (text !== null && /^(<<<<<<<|=======|>>>>>>>)/m.test(text))
      throw Error("Remove conflict markers before saving the resolution.");
    c.result = text;
    c.resolved = true;
    pending.changes[path] = text;
    await this.setMeta(meta);
    return this.snapshot();
  }
  async finish() {
    const meta = await this.meta();
    const p: Pending = meta.pending;
    if (!p) throw Error("No pending merge.");
    if (p.conflicts.some((c) => !c.resolved))
      throw Error("Resolve every conflict before completing.");
    if ((await this.oid()) !== p.ours)
      throw Error("HEAD changed. Abort and retry.");
    for (const [path, text] of Object.entries(p.changes)) {
      safePath(path);
      if (text === null) {
        if (await this.exists(this.dir + "/" + path))
          await this.p.unlink(this.dir + "/" + path);
        await git.remove({ ...this.ctx, filepath: path });
      } else {
        await this.write(this.dir + "/" + path, text);
        await git.add({ ...this.ctx, filepath: path });
      }
    }
    await git.commit({
      ...this.ctx,
      message: p.message,
      author,
      parent: p.kind === "merge" ? [p.ours, p.theirs] : [p.ours],
    });
    await this.setMeta({ ...meta, pending: null });
    return this.snapshot();
  }
  async abort() {
    const meta = await this.meta();
    if (!meta.pending) throw Error("No pending merge.");
    await this.setMeta({ ...meta, pending: null });
    return this.snapshot();
  }
  async history(path: string) {
    safePath(path);
    const history = [];
    let oid = await this.oid();
    let count = 0;
    while (oid && count++ < 500) {
      const c = (await git.readCommit({ ...this.ctx, oid })).commit;
      const before = c.parent[0] ? await this.file(path, c.parent[0]) : "",
        after = await this.file(path, oid);
      if (before !== after)
        history.push({ oid, message: c.message.trim(), before, after });
      oid = c.parent[0];
    }
    return history;
  }
  async blame(path: string) {
    const history = (await this.history(path)).reverse();
    let lines: { text: string; oid: string; message: string }[] = [];
    for (const h of history) {
      const next: typeof lines = [];
      let cursor = 0;
      for (const chunk of diffLines(h.before, h.after)) {
        const count = chunk.count || 0;
        if (chunk.removed) {
          cursor += count;
        } else if (chunk.added) {
          chunk.value
            .split(/(?<=\n)/)
            .filter(Boolean)
            .forEach((text) =>
              next.push({ text, oid: h.oid, message: h.message }),
            );
        } else {
          next.push(...lines.slice(cursor, cursor + count));
          cursor += count;
        }
      }
      lines = next;
    }
    return lines;
  }
  async export() {
    if ((await this.meta()).pending)
      throw Error("Complete or abort the pending operation before exporting.");
    const files: Record<string, Uint8Array> = Object.create(null);
    let size = 0;
    for (const path of await this.walk(this.dir, true)) {
      const content = new Uint8Array(
        await this.p.readFile(this.dir + "/" + path),
      );
      size += content.length;
      if (size > 25 * 1024 * 1024)
        throw Error("Backup limit is 25 MiB uncompressed.");
      files["repository/" + path] = content;
    }
    files["gitscope-backup.json"] = strToU8(
      JSON.stringify({ format: "gitscope", version: 1 }),
    );
    return zipSync(files);
  }
  async import(bytes: Uint8Array, name: string) {
    if (bytes.length > 25 * 1024 * 1024) throw Error("ZIP limit is 25 MiB.");
    let size = 0,
      count = 0;
    const files = unzipSync(bytes, {
      filter: (f) => {
        size += f.originalSize;
        if (size > 25 * 1024 * 1024 || ++count > 5000)
          throw Error("Archive exceeds 25 MiB or 5,000 entries.");
        return true;
      },
    });
    const names = Object.keys(files).filter((p) => !p.endsWith("/"));
    const head = names.find((p) => p.endsWith(".git/HEAD"));
    if (!head)
      throw Error(
        "ZIP must contain a .git directory. A GitHub source ZIP has no history.",
      );
    const prefix = head.slice(0, -".git/HEAD".length);
    const prepared = [];
    for (const path of names) {
      if (path === "gitscope-backup.json") continue;
      if (!path.startsWith(prefix))
        throw Error("Archive contains files outside repository root.");
      const rel = path.slice(prefix.length);
      if (
        !rel ||
        rel.startsWith("/") ||
        rel.includes("\\") ||
        rel.includes("\0") ||
        rel.split("/").some((p) => p === ".." || p === "." || !p)
      )
        throw Error("Unsafe archive path.");
      prepared.push([rel, files[path]] as const);
    }
    const previous = this.id;
    await this.create(name, false, false);
    try {
      for (const [path, bytes] of prepared)
        await this.write(this.dir + "/" + path, bytes);
      const snap = await this.snapshot();
      await this.validateTrees(snap.commits);
      return snap;
    } catch (e) {
      await this.p.unlink("/meta-" + this.id + ".json");
      if (previous) await this.open(previous);
      throw e;
    }
  }
  async demo() {
    await this.create("atlas-web", true, false);
    const put = async (path: string, text: string, message: string) => {
      await this.save(path, text);
      await this.stage(".");
      await this.commit(message);
    };
    await put(
      "README.md",
      "# Atlas\n\nA lightweight workspace for curious teams.\n",
      "Initialize Atlas workspace",
    );
    await put(
      "src/config.ts",
      'export const config = {\n  theme: "system",\n  sidebar: true,\n  version: "1.0.0",\n};\n',
      "Add application configuration",
    );
    await put(
      "src/search.ts",
      "export function search(items: string[], query: string) {\n  return items.filter(item => item.includes(query));\n}\n",
      "Implement search utility",
    );
    await this.tag("v1.0.0");
    await this.branch("feature/dark-mode");
    await this.checkout("feature/dark-mode");
    await put(
      "src/config.ts",
      'export const config = {\n  theme: "dark",\n  sidebar: true,\n  version: "1.0.0",\n};\n',
      "Introduce dark mode preference",
    );
    await put(
      "src/theme.css",
      ":root {\n  color-scheme: dark;\n  --canvas: #101319;\n  --accent: #b5f477;\n}\n",
      "Define midnight theme tokens",
    );
    await this.checkout("main");
    await put(
      "src/config.ts",
      'export const config = {\n  theme: "light",\n  sidebar: true,\n  version: "1.0.0",\n};\n',
      "Set light theme as default",
    );
    await this.branch("fix/search");
    await this.checkout("fix/search");
    await put(
      "src/search.ts",
      "export function search(items: string[], query: string) {\n  return items.filter(item => item.toLowerCase().includes(query.toLowerCase()));\n}\n",
      "Make search case insensitive",
    );
    await this.checkout("main");
    await this.branch("docs/getting-started");
    await this.checkout("docs/getting-started");
    await put(
      "docs/guide.md",
      "# Getting started\n\n1. Open your workspace.\n2. Pick a theme.\n3. Find something worth building.\n",
      "Write getting started guide",
    );
    await this.checkout("main");
    return this.snapshot();
  }
  async terminal(input: string) {
    const [cmd, op, ...args] = tokenize(input);
    if (cmd === "help")
      return 'Supported: git status, log, add <path|.>, commit -m "message", branch [name], checkout <branch>, merge <branch>, cherry-pick <oid>, tag <name>. No system shell, network, reset or push.';
    if (cmd !== "git")
      throw Error("Only supported git commands are available. Type help.");
    switch (op) {
      case "status":
        return (
          (await this.snapshot()).status
            .filter((s) => s.head !== s.work || s.work !== s.stage)
            .map(
              (s) => `${s.head !== s.stage ? "staged" : "unstaged"}  ${s.path}`,
            )
            .join("\n") || "Working tree clean"
        );
      case "log":
        return (await this.snapshot()).commits
          .map((c) => c.oid.slice(0, 7) + " " + c.message)
          .join("\n");
      case "branch":
        if (!args[0])
          return (await this.snapshot()).branches.map((b) => b.name).join("\n");
        await this.branch(args[0]);
        break;
      case "checkout":
        await this.checkout(args[0]);
        break;
      case "add":
        await this.stage(args[0]);
        break;
      case "commit":
        if (args[0] !== "-m" || !args[1])
          throw Error('Use git commit -m "message"');
        await this.commit(args.slice(1).join(" "));
        break;
      case "merge":
        await this.merge(args[0]);
        break;
      case "cherry-pick":
        await this.merge(args[0], "cherry-pick");
        break;
      case "tag":
        await this.tag(args[0]);
        break;
      default:
        throw Error(
          "Unsupported command. Type help for the supported commands.",
        );
    }
    return (
      "Done. " +
      ((await this.meta()).pending
        ? "Conflicts need resolution in Merge lab."
        : "Repository updated.")
    );
  }
  async run(method: string, args: any[]) {
    const allowed = [
      "list",
      "open",
      "create",
      "snapshot",
      "file",
      "save",
      "remove",
      "stage",
      "commit",
      "branch",
      "checkout",
      "tag",
      "detail",
      "merge",
      "resolve",
      "finish",
      "abort",
      "history",
      "blame",
      "export",
      "import",
      "demo",
      "terminal",
    ];
    if (!allowed.includes(method)) throw Error("Unknown operation");
    return (this as any)[method](...args);
  }
}
