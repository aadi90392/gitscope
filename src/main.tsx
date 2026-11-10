import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Clock,
  Search,
  TerminalSquare,
  FlaskConical,
  RotateCcw,
  FolderGit2,
  ChevronDown,
  Plus,
  ArrowRight,
  ArrowUpRight,
  Download,
  Upload,
  ShieldCheck,
  HardDrive,
  Check,
  X,
  FileCode2,
  Command,
  PanelLeftClose,
  BookOpen,
  ExternalLink,
  Tag,
  ChevronRight,
  LoaderCircle,
  WifiOff,
} from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import { rpc, useStore } from "./store";
import type { Snapshot, Detail } from "./types";
import Graph from "./Graph";
import { Diff } from "./Editor";
import {
  Changes,
  MergeLab,
  TimeMachine,
  Detective,
  Simulator,
  Challenges,
  Terminal,
} from "./Panels";
import "./style.css";
const navigation = [
  ["History", GitBranch],
  ["Working files", FileCode2],
  ["Time machine", Clock],
  ["Merge lab", GitMerge],
  ["Detective", Search],
  ["Rewrite simulator", RotateCcw],
  ["Challenges", FlaskConical],
  ["Terminal", TerminalSquare],
] as const;
function App() {
  const {
    snapshot: s,
    selected,
    view,
    setSnapshot,
    select,
    setView,
  } = useStore();
  const [workspaces, setWorkspaces] = useState<any[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [diffPath, setDiffPath] = useState(""),
    [compare, setCompare] = useState(""),
    [modal, setModal] = useState(""),
    [name, setName] = useState(""),
    [mobile, setMobile] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine);
  const upload = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const selectedCommit = s?.commits.find((c) => c.oid === selected);
  const changed =
    detail?.changed.find((f) => f.path === diffPath) || detail?.changed[0];
  async function refresh() {
    const snap = await rpc<Snapshot>("snapshot");
    setSnapshot(snap);
    return snap;
  }
  async function run(method: string, ...args: any[]) {
    setBusy(true);
    setError("");
    try {
      const result = await rpc(method, ...args);
      const snap = result?.commits ? result : await refresh();
      if (result?.commits) setSnapshot(result);
      if (["open", "create", "demo", "import"].includes(method)) {
        localStorage.setItem("gitscope-active", snap.id);
        select(snap.head);
        setCompare("");
        setView("History");
        setWorkspaces(await rpc("list"));
      } else if (
        ["commit", "finish", "merge", "terminal", "checkout"].includes(method)
      )
        select(snap.head);
      if (snap.pending && ["merge", "terminal"].includes(method))
        setView("Merge lab");
      return result;
    } catch (e: any) {
      setError(e.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    (async () => {
      try {
        const all = await rpc<any[]>("list");
        setWorkspaces(all);
        const remembered = localStorage.getItem("gitscope-active");
        if (all.length)
          await run(
            "open",
            all.find((w) => w.id === remembered)?.id || all[0].id,
          );
        else await run("demo");
      } catch (e: any) {
        setError(e.message);
        setBusy(false);
      }
    })();
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!selected || !s) return;
    let valid = true;
    setDetail(null);
    rpc<Detail>("detail", selected, compare || undefined)
      .then((d) => {
        if (valid) {
          setDetail(d);
          setDiffPath(d.changed[0]?.path || "");
        }
      })
      .catch((e) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [selected, s?.id, compare, s?.head]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  async function backup() {
    setBusy(true);
    try {
      const bytes = await rpc<Uint8Array>("export");
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = (s?.name || "workspace") + ".gitscope.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast("Backup exported with Git history and working files.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function importZip(file: File) {
    const result = await run(
      "import",
      new Uint8Array(await file.arrayBuffer()),
      file.name.replace(/\.(gitscope\.)?zip$/i, ""),
    );
    if (result) setToast("Imported into a new local workspace.");
  }
  function go(v: string) {
    setView(v);
    setMobile(false);
  }
  const changes =
    s?.status.filter((x) => x.head !== x.work || x.work !== x.stage).length ||
    0;
  return (
    <div className="app">
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("History");
          }}
        >
          <span className="brand-mark">
            <GitBranch size={24} />
          </span>
          git<span>scope</span>
          <em>LOCAL</em>
        </a>
        <div className="workspace-picker">
          <span className="workspace-avatar">
            <FolderGit2 size={22} />
          </span>
          <div>
            <small>WORKSPACE</small>
            <select
              aria-label="Workspace"
              value={s?.id || ""}
              disabled={busy}
              onChange={(e) => run("open", e.target.value)}
            >
              {workspaces.map((w) => (
                <option value={w.id} key={w.id}>
                  {w.name}
                  {w.lab ? " · lab" : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            aria-label="New workspace"
            onClick={() => {
              setName("");
              setModal("workspace");
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <span className="nav-label">REPOSITORY</span>
        <nav>
          {navigation.map(([label, Icon]) => (
            <button
              key={label}
              className={view === label ? "active" : ""}
              onClick={() => go(label)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {label === "Working files" && !!changes && <em>{changes}</em>}
              {label === "Merge lab" && s?.pending && (
                <em className="warning-count">!</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-refs">
          <div className="nav-label">
            LOCAL BRANCHES{" "}
            <button
              aria-label="Create branch"
              disabled={busy || !s?.head}
              onClick={() => {
                setName("");
                setModal("branch");
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          {s?.branches.map((b) => (
            <button
              key={b.name}
              onClick={() => {
                select(b.oid);
                go("History");
              }}
            >
              <GitBranch size={13} />
              <span>{b.name}</span>
              {b.name === s.branch && <span className="dot green" />}
            </button>
          ))}
        </div>
        <div className="local-card">
          <ShieldCheck size={19} />
          <b>Your code stays yours.</b>
          <p>
            Git runs in your browser.
            <br />
            No server. No uploads.
          </p>
          <button onClick={() => setModal("guide")}>
            How local storage works <ArrowUpRight size={13} />
          </button>
        </div>
        <button className="sidebar-help" onClick={() => setModal("guide")}>
          <BookOpen size={16} />
          Quick guide <span>↗</span>
        </button>
        <div className="author">
          <span>AU</span>
          <div>
            Built by Aditya<small>Open-source developer tool</small>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <PanelLeftClose size={19} />
            </button>
            <FolderGit2 size={16} />
            <span>Workspaces</span>
            <ChevronRight size={13} />
            <b>{s?.name || "Opening workspace"}</b>
            <span className={"mode-badge " + (s?.lab ? "lab" : "")}>
              {s?.lab ? "EXPERIMENT LAB" : "LOCAL REPOSITORY"}
            </span>
          </div>
          <div className="top-actions">
            <span className="connection">
              <span className="dot green" />
              {offline ? "Offline workspace" : "Local-first"}
            </span>
            <a
              href="https://github.com/aadi90392/gitscope"
              target="_blank"
              rel="noreferrer"
              className="source-link"
            >
              Source <ArrowUpRight size={13} />
            </a>
            <button
              className="icon-button"
              aria-label="Open quick guide"
              onClick={() => setModal("guide")}
            >
              <BookOpen size={17} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-title">
            <div>
              <span className="eyebrow">
                SEE THE HISTORY. UNDERSTAND THE CHANGE.
              </span>
              <h1>
                {view === "History" ? "Your repository, in perspective." : view}
              </h1>
              <p>
                {view === "History"
                  ? "Explore the connections behind your code. Every branch, every decision, every commit."
                  : "Real Git objects. A safer space to explore what happens next."}
              </p>
            </div>
            <div className="toolbar">
              <input
                ref={upload}
                hidden
                type="file"
                accept=".zip"
                onChange={(e) => {
                  if (e.target.files?.[0]) importZip(e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <button
                className="secondary"
                disabled={busy}
                onClick={() => upload.current?.click()}
              >
                <Upload size={15} />
                Import ZIP
              </button>
              <button
                className="primary"
                disabled={busy || !s}
                onClick={backup}
              >
                <Download size={15} />
                Export backup
              </button>
            </div>
          </div>
          {s?.lab && view === "History" && (
            <div className="lab-banner">
              <span className="lab-icon">
                <FlaskConical size={20} />
              </span>
              <div>
                <b>A real repository. A safe place to experiment.</b>
                <p>
                  This Atlas sample lives only in your browser. Try a merge,
                  trace a change, or take on a challenge.
                </p>
              </div>
              <button onClick={() => go("Challenges")}>
                Explore challenges <ArrowRight size={16} />
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="alert">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {busy && !s ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Building your local workspace…
            </div>
          ) : (
            s && (
              <>
                {view === "History" && (
                  <>
                    <div className="metrics">
                      <div>
                        <span className="metric-icon">
                          <GitCommitHorizontal />
                        </span>
                        <div>
                          <small>REACHABLE COMMITS</small>
                          <strong>
                            {s.commits.length}
                            <span>Actual Git objects</span>
                          </strong>
                        </div>
                      </div>
                      <div>
                        <span className="metric-icon purple">
                          <GitBranch />
                        </span>
                        <div>
                          <small>LOCAL BRANCHES</small>
                          <strong>
                            {s.branches.length}
                            <span>{s.branch} checked out</span>
                          </strong>
                        </div>
                      </div>
                      <div>
                        <span className="metric-icon blue">
                          <FileCode2 />
                        </span>
                        <div>
                          <small>WORKING CHANGES</small>
                          <strong>
                            {changes.toString().padStart(2, "0")}
                            <span>
                              {changes
                                ? "Ready to inspect"
                                : "Working tree clean"}
                            </span>
                          </strong>
                        </div>
                      </div>
                      <div>
                        <span className="metric-icon orange">
                          <Tag />
                        </span>
                        <div>
                          <small>RELEASE TAGS</small>
                          <strong>
                            {s.tags.length}
                            <span>Milestones in your history</span>
                          </strong>
                        </div>
                      </div>
                    </div>
                    <div className="history-workspace">
                      <section className="history-panel">
                        <div className="panel-heading">
                          <h2>
                            <GitBranch size={17} />
                            Commit graph
                          </h2>
                          <div className="toolbar">
                            <label className="search-box">
                              <Search size={15} />
                              <input
                                aria-label="Search commits"
                                placeholder="Find a commit…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                              />
                            </label>
                            <button
                              className="secondary small"
                              disabled={busy}
                              onClick={() => {
                                setName("");
                                setModal("branch");
                              }}
                            >
                              <Plus size={14} />
                              Branch
                            </button>
                          </div>
                        </div>
                        <div className="graph-legend">
                          <span>
                            <i className="dot green" />
                            Ancestry
                          </span>
                          <span>
                            <i className="dot violet" />
                            Parallel history
                          </span>
                          <span className="muted">
                            Select a commit to inspect →
                          </span>
                        </div>
                        <div className="table-header">
                          <span>GRAPH / COMMIT MESSAGE</span>
                          <span>AUTHOR</span>
                          <span>SHA</span>
                        </div>
                        <div className="graph-scroll">
                          {s.commits.length ? (
                            <Graph
                              snapshot={s}
                              selected={selected}
                              onSelect={select}
                              query={query}
                            />
                          ) : (
                            <div className="empty">
                              <GitCommitHorizontal />
                              <h3>Your first commit starts here.</h3>
                              <p>
                                Add a file, stage it and commit from Working
                                files.
                              </p>
                              <button
                                className="primary"
                                onClick={() => go("Working files")}
                              >
                                Open working files
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="graph-bottom">
                          <span>
                            <Check size={13} /> {s.commits.length} commits •
                            topological order
                          </span>
                          <button onClick={() => go("Time machine")}>
                            <Clock size={13} />
                            Replay history
                          </button>
                        </div>
                      </section>
                      <aside className="inspector">
                        <div className="panel-heading">
                          <h2>Commit inspector</h2>
                          <GitCommitHorizontal size={18} />
                        </div>
                        {selectedCommit ? (
                          <>
                            <div className="inspector-body">
                              <span className="pill hash">
                                {selected.slice(0, 7)}
                              </span>
                              {selected === s.head && (
                                <span className="pill">HEAD</span>
                              )}
                              <h3>{selectedCommit.message}</h3>
                              <div className="author-line">
                                <span className="avatar">
                                  {selectedCommit.author
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                                <div>
                                  {selectedCommit.author}
                                  <small>
                                    {new Date(
                                      selectedCommit.time * 1000,
                                    ).toLocaleString()}
                                  </small>
                                </div>
                              </div>
                              <dl>
                                <dt>Parents</dt>
                                <dd>
                                  {selectedCommit.parents.length
                                    ? selectedCommit.parents.map((p) => (
                                        <button
                                          key={p}
                                          onClick={() => select(p)}
                                        >
                                          <code>{p.slice(0, 7)}</code>
                                        </button>
                                      ))
                                    : "Root commit"}
                                </dd>
                                <dt>Current refs</dt>
                                <dd>
                                  {detail?.refs.join(", ") ||
                                    "No branch / tag tip"}
                                </dd>
                              </dl>
                              <button
                                className="secondary full"
                                onClick={() => {
                                  navigator.clipboard
                                    .writeText(selected)
                                    .then(() =>
                                      setToast("Full commit hash copied."),
                                    )
                                    .catch(() =>
                                      setError("Clipboard access unavailable."),
                                    );
                                }}
                              >
                                Copy full commit hash
                              </button>
                            </div>
                            <div className="inspector-files">
                              <h4>
                                CHANGED FILES{" "}
                                <span>{detail?.changed.length ?? "…"}</span>
                              </h4>
                              {detail?.changed.map((f) => (
                                <button
                                  className={
                                    changed?.path === f.path ? "active" : ""
                                  }
                                  onClick={() => setDiffPath(f.path)}
                                  key={f.path}
                                >
                                  <FileCode2 size={13} />
                                  {f.path}
                                  <span>
                                    {!f.before ? "A" : !f.after ? "D" : "M"}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="muted pad">
                            Select a commit in the graph.
                          </p>
                        )}
                      </aside>
                    </div>
                    {selectedCommit && (
                      <section className="diff-panel">
                        <div className="panel-heading">
                          <h2>
                            <FileCode2 size={16} />
                            {changed?.path || "Commit diff"}
                          </h2>
                          <label className="compare-label">
                            Compare against
                            <select
                              aria-label="Compare commit against"
                              value={compare}
                              onChange={(e) => setCompare(e.target.value)}
                            >
                              <option value="">First parent</option>
                              {s.commits
                                .filter((c) => c.oid !== selected)
                                .map((c) => (
                                  <option value={c.oid} key={c.oid}>
                                    {c.oid.slice(0, 7)} · {c.message}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                        {changed ? (
                          <Diff
                            before={changed.before}
                            after={changed.after}
                            path={changed.path}
                          />
                        ) : (
                          <p className="muted pad">
                            No changed files in this comparison.
                          </p>
                        )}
                      </section>
                    )}
                    <div className="discover-grid">
                      {[
                        [
                          GitMerge,
                          "Resolve the hard parts",
                          "Three-way merge conflict resolution",
                          "Merge lab",
                        ],
                        [
                          Clock,
                          "Go back without going backwards",
                          "Read-only snapshots of any commit",
                          "Time machine",
                        ],
                        [
                          Search,
                          "Follow the trail",
                          "File history and regression detective",
                          "Detective",
                        ],
                      ].map(([Icon, title, desc, target]: any) => (
                        <button key={target} onClick={() => go(target)}>
                          <Icon size={21} />
                          <div>
                            <b>{title}</b>
                            <p>{desc}</p>
                          </div>
                          <ArrowUpRight size={17} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {view === "Working files" && (
                  <Changes key={s.id} snapshot={s} run={run} busy={busy} />
                )}
                {view === "Merge lab" && (
                  <MergeLab snapshot={s} run={run} busy={busy} />
                )}
                {view === "Time machine" && (
                  <TimeMachine key={s.id} snapshot={s} />
                )}
                {view === "Detective" && <Detective key={s.id} snapshot={s} />}
                {view === "Rewrite simulator" && (
                  <Simulator key={s.id + s.head} snapshot={s} />
                )}
                {view === "Challenges" && (
                  <Challenges snapshot={s} run={run} setView={go} busy={busy} />
                )}
                {view === "Terminal" && (
                  <Terminal key={s.id} run={run} busy={busy} />
                )}
              </>
            )
          )}
          <footer>
            <span>
              <HardDrive size={13} />
              Stored on this device · Export backups to keep your work
            </span>
            <span>
              GitScope <span className="version">v1.0</span> · Made for curious
              developers
            </span>
          </footer>
        </main>
        <div className="statusbar">
          <span>
            <GitBranch size={12} />
            {s?.branch || "—"}
          </span>
          <span>
            {busy ? (
              <>
                <LoaderCircle size={12} className="spin" />
                Running Git operation…
              </>
            ) : (
              <>
                <Check size={12} />
                Worker ready
              </>
            )}
          </span>
          <span className="status-right">
            {s?.pending ? "Merge resolution pending" : "IndexedDB persistence"}{" "}
            <span className="dot green" />
          </span>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2Fallback />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "guide"
                ? "GitScope quick guide"
                : modal === "workspace"
                  ? "New workspace"
                  : "New branch"
            }
          >
            <button
              className="close"
              aria-label="Close dialog"
              onClick={() => setModal("")}
            >
              <X size={20} />
            </button>
            {modal === "guide" ? (
              <>
                <span className="eyebrow">
                  A SMALL GUIDE TO YOUR NEW TOOLBOX
                </span>
                <h2>Git, with a little more perspective.</h2>
                <div className="guide-list">
                  <p>
                    <b>Start safely.</b> The Atlas lab is a real Git repository
                    made for practice. Create your own empty workspace with the
                    + beside the workspace selector.
                  </p>
                  <p>
                    <b>Bring your history.</b> Import a ZIP containing your
                    repository and its .git folder, or a GitScope backup. GitHub
                    “Download ZIP” does not include history. Your original disk
                    folder is never modified.
                  </p>
                  <p>
                    <b>Make a change.</b> Open Working files, edit and save a
                    file, stage the change, then commit. Use branch checkout
                    below to change branches.
                  </p>
                  <p>
                    <b>Merge with confidence.</b> Commit working changes first.
                    Merge lab compares branches; resolve every conflicting file,
                    then complete the merge.
                  </p>
                  <p>
                    <b>Keep a backup.</b> Browser storage can be cleared or
                    evicted. Export regularly. Offline use is available after
                    the app and editors have loaded and the service worker has
                    cached them.
                  </p>
                  <p>
                    <b>Know the boundaries.</b> Text-focused local repositories,
                    up to 500 reachable commits and 25 MiB import/export. No
                    remote clone/push, system shell or native rebase. Rewrite
                    simulator is conceptual. Time machine cannot reconstruct
                    past branch pointers without reflogs.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setModal("");
                    go("Challenges");
                  }}
                >
                  Try a challenge <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const result = await run(
                    modal === "workspace" ? "create" : "branch",
                    name,
                  );
                  if (result) {
                    setModal("");
                    setName("");
                  }
                }}
              >
                <span className="eyebrow">
                  {modal === "workspace" ? "A FRESH START" : "A NEW DIRECTION"}
                </span>
                <h2>
                  {modal === "workspace"
                    ? "Create a local workspace"
                    : "Create a branch"}
                </h2>
                <p>
                  {modal === "workspace"
                    ? "Your repository lives in this browser. No account or server required."
                    : "Creates a branch at HEAD. Your current branch stays checked out."}
                </p>
                <label>
                  Name
                  <input
                    autoFocus
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      modal === "workspace" ? "my-project" : "feature/new-idea"
                    }
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Create {modal === "workspace" ? "workspace" : "branch"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
      {s && (
        <div className="checkout-dock">
          <GitBranch size={14} />
          <select
            aria-label="Check out branch"
            value={s.branch}
            disabled={busy || !!s.pending}
            onChange={(e) => run("checkout", e.target.value)}
          >
            {s.branch === "detached" && <option>detached</option>}
            {s.branches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
function CheckCircle2Fallback() {
  return <Check size={18} />;
}
registerSW({
  onOfflineReady() {
    console.info("GitScope is ready offline.");
  },
});
createRoot(document.getElementById("root")!).render(<App />);
