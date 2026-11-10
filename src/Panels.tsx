import { useState, useEffect } from "react";
import {
  GitMerge,
  Check,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Search,
  FlaskConical,
  CheckCircle2,
  TerminalSquare,
  Play,
  Pause,
  Clock,
  FileCode2,
  Plus,
} from "lucide-react";
import { rpc } from "./store";
import { Code, Diff } from "./Editor";
import type { Snapshot, Detail } from "./types";
type Run = (method: string, ...args: any[]) => Promise<any>;
export function Changes({
  snapshot,
  run,
  busy,
}: {
  snapshot: Snapshot;
  run: Run;
  busy: boolean;
}) {
  const [path, setPath] = useState(snapshot.files[0] || "README.md"),
    [text, setText] = useState(""),
    [original, setOriginal] = useState(""),
    [message, setMessage] = useState(""),
    [newPath, setNewPath] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    rpc<string>("file", path)
      .then((t) => {
        if (active) {
          setText(t);
          setOriginal(t);
          setError("");
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [path, snapshot.id]);
  const dirty = text !== original;
  const choose = (p: string) => {
    if (dirty && !confirm("Discard unsaved editor changes?")) return;
    setPath(p);
  };
  return (
    <div className="changes-grid">
      <aside className="file-sidebar">
        <h3>
          Working files <span>{snapshot.files.length}</span>
        </h3>
        {snapshot.files.map((p) => (
          <button
            key={p}
            className={p === path ? "active" : ""}
            onClick={() => choose(p)}
          >
            <FileCode2 size={14} />
            {p}
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newPath) return;
            if (snapshot.files.includes(newPath)) {
              choose(newPath);
              return;
            }
            run("save", newPath, "").then((s) => {
              if (s) {
                setPath(newPath);
                setNewPath("");
              }
            });
          }}
        >
          <input
            aria-label="New file path"
            placeholder="src/new-file.ts"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
          />
          <button disabled={busy} className="secondary">
            <Plus size={14} />
            New file
          </button>
        </form>
        <div className="note">
          Files stay in this browser. Export a ZIP backup before clearing site
          data.
        </div>
      </aside>
      <section className="working-editor">
        <div className="panel-heading">
          <span>
            <FileCode2 size={15} />
            {path}
            {dirty && " • unsaved"}
          </span>
          <div>
            <button
              disabled={busy || !path || !!error}
              onClick={async () => {
                if (await run("save", path, text)) setOriginal(text);
              }}
              className="primary"
            >
              Save file
            </button>
            <button
              className="secondary"
              disabled={busy || !snapshot.files.includes(path)}
              onClick={() =>
                confirm("Delete " + path + " from the working tree?") &&
                run("remove", path)
              }
            >
              Delete
            </button>
          </div>
        </div>
        {error ? (
          <p className="error-inline">{error}</p>
        ) : (
          <Code value={text} onChange={setText} path={path} height="350px" />
        )}
        <div className="staging">
          <div className="panel-heading">
            <h3>Changes to commit</h3>
            <button
              className="secondary"
              disabled={busy || !!snapshot.pending}
              onClick={() => run("stage", ".")}
            >
              Stage all
            </button>
          </div>
          {snapshot.status
            .filter((s) => s.head !== s.work || s.work !== s.stage)
            .map((s) => (
              <div className="stage-row" key={s.path}>
                <code>{s.path}</code>
                <span className="pill">
                  {s.head !== s.stage ? "Staged" : "Unstaged"}
                  {s.work !== s.stage && s.head !== s.stage
                    ? " + new edits"
                    : ""}
                </span>
                <button disabled={busy} onClick={() => run("stage", s.path)}>
                  Stage
                </button>
              </div>
            ))}
          {!snapshot.status.some(
            (s) => s.head !== s.work || s.work !== s.stage,
          ) && (
            <p className="muted">
              Your working tree is clean. Save a file edit to begin.
            </p>
          )}
          <form
            className="commit-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run("commit", message)) setMessage("");
            }}
          >
            <input
              aria-label="Commit message"
              placeholder="Describe what changed…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
            <button className="primary" disabled={busy || !!snapshot.pending}>
              Commit staged
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
export function MergeLab({
  snapshot,
  run,
  busy,
}: {
  snapshot: Snapshot;
  run: Run;
  busy: boolean;
}) {
  const [target, setTarget] = useState(""),
    [path, setPath] = useState(""),
    [text, setText] = useState("");
  const pending = snapshot.pending;
  const conflict =
    pending?.conflicts.find((c) => c.path === path) || pending?.conflicts[0];
  useEffect(() => {
    setText(conflict?.result ?? "");
  }, [conflict?.path, snapshot.id, pending?.theirs]);
  return (
    <div className="merge-view">
      <div className="feature-intro">
        <div className="intro-icon violet">
          <GitMerge />
        </div>
        <div>
          <span className="eyebrow">THREE VERSIONS. ONE CLEAR RESOLUTION.</span>
          <h2>Bring your branches together.</h2>
          <p>
            Compare the common base, current branch and incoming changes.
            Nothing is written until you complete the merge.
          </p>
        </div>
      </div>
      {!pending ? (
        <div className="merge-start">
          <label>
            Current branch
            <input value={snapshot.branch} readOnly />
          </label>
          <ArrowRight />
          <label>
            Incoming branch
            <select
              aria-label="Incoming branch"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose a branch</option>
              {snapshot.branches
                .filter((b) => b.name !== snapshot.branch)
                .map((b) => (
                  <option key={b.name}>{b.name}</option>
                ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={!target || busy}
            onClick={() => run("merge", target)}
          >
            Compare & merge
          </button>
          <p className="muted">
            Clean changes merge immediately. Conflicts open the three-way
            resolver below. Commit working changes first.
          </p>
        </div>
      ) : (
        <>
          <div className="merge-status">
            <span className="pill violet">{pending.kind}</span>
            <b>
              {pending.branch} ← {pending.target.slice(0, 28)}
            </b>
            <span>
              {pending.conflicts.filter((c) => c.resolved).length}/
              {pending.conflicts.length} resolved
            </span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => run("abort")}
            >
              Abort
            </button>
            <button
              className="primary"
              disabled={busy || pending.conflicts.some((c) => !c.resolved)}
              onClick={() => run("finish")}
            >
              Complete {pending.kind}
            </button>
          </div>
          <div className="conflict-tabs">
            {pending.conflicts.map((c) => (
              <button
                className={conflict?.path === c.path ? "active" : ""}
                key={c.path}
                onClick={() => setPath(c.path)}
              >
                {c.resolved ? (
                  <Check size={14} />
                ) : (
                  <span className="dot amber" />
                )}
                {c.path}
              </button>
            ))}
          </div>
          {conflict && (
            <>
              <div className="three-way">
                {[
                  ["BASE", conflict.base],
                  ["CURRENT · " + pending.branch, conflict.ours],
                  ["INCOMING · " + pending.target, conflict.theirs],
                ].map(([label, value]) => (
                  <section key={label}>
                    <div className="code-label">
                      {label}
                      <span>{value === null ? "deleted / absent" : ""}</span>
                    </div>
                    <Code
                      value={value ?? ""}
                      path={conflict.path}
                      readOnly
                      height="230px"
                    />
                  </section>
                ))}
              </div>
              <div className="resolution">
                <div className="panel-heading">
                  <h3>
                    Resolved result <code>{conflict.path}</code>
                  </h3>
                  <div>
                    <button
                      className="secondary"
                      onClick={() => setText(conflict.ours ?? "")}
                    >
                      Use current
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setText(conflict.theirs ?? "")}
                    >
                      Use incoming
                    </button>
                    <button
                      disabled={busy}
                      className="primary"
                      onClick={() => run("resolve", conflict.path, text)}
                    >
                      Mark resolved
                    </button>
                    {(conflict.ours === null || conflict.theirs === null) && (
                      <button
                        disabled={busy}
                        onClick={() => run("resolve", conflict.path, null)}
                      >
                        Resolve as deletion
                      </button>
                    )}
                  </div>
                </div>
                <Code
                  value={text}
                  onChange={setText}
                  path={conflict.path}
                  height="230px"
                />
                <p className="note">
                  You can edit the result manually. Conflict markers must be
                  removed; syntax correctness is yours to verify.
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
export function TimeMachine({ snapshot }: { snapshot: Snapshot }) {
  const commits = [...snapshot.commits].reverse();
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [detail, setDetail] = useState<Detail | null>(null),
    [path, setPath] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState("");
  const commit = commits[Math.min(index, commits.length - 1)];
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () =>
        setIndex((i) => {
          if (i >= commits.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      1800,
    );
    return () => clearInterval(id);
  }, [playing, commits.length]);
  useEffect(() => {
    let valid = true;
    if (commit)
      rpc<Detail>("detail", commit.oid)
        .then((d) => {
          if (valid) {
            setDetail(d);
            setPath((p) => (d.files.includes(p) ? p : d.files[0] || ""));
          }
        })
        .catch((e) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [commit?.oid]);
  useEffect(() => {
    let valid = true;
    if (path && commit)
      rpc<string>("file", path, commit.oid)
        .then((t) => valid && setText(t))
        .catch((e) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [path, commit?.oid]);
  return (
    <div className="time-view">
      <div className="feature-intro">
        <div className="intro-icon">
          <Clock />
        </div>
        <div>
          <span className="eyebrow">READ-ONLY REPOSITORY EXPLORER</span>
          <h2>Every version, one timeline.</h2>
          <p>
            Replay repository snapshots without moving HEAD. Branch badges
            reflect current pointers, not historical branch positions.
          </p>
        </div>
      </div>
      {!commit ? (
        <p>No commits yet.</p>
      ) : (
        <>
          <div className="timeline">
            <button
              className="primary"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause replay" : "Play replay"}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <input
              aria-label="History timeline"
              type="range"
              min={0}
              max={commits.length - 1}
              value={index}
              onChange={(e) => {
                setPlaying(false);
                setIndex(+e.target.value);
              }}
            />
            <code>
              {index + 1} / {commits.length}
            </code>
          </div>
          <div className="snapshot-title">
            <span className="pill">{commit.oid.slice(0, 7)}</span>
            <h3>{commit.message}</h3>
            <span>{detail?.files.length || 0} files</span>
          </div>
          {error && <p className="error-inline">{error}</p>}
          <div className="changes-grid">
            <aside className="file-sidebar">
              {detail?.files.map((p) => (
                <button
                  key={p}
                  className={p === path ? "active" : ""}
                  onClick={() => setPath(p)}
                >
                  <FileCode2 size={14} />
                  {p}
                </button>
              ))}
            </aside>
            <div>
              <div className="code-label">
                {path} <span>Historical snapshot · read only</span>
              </div>
              <Code value={text} path={path} readOnly height="430px" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export function Detective({ snapshot }: { snapshot: Snapshot }) {
  const [path, setPath] = useState(snapshot.files[0] || ""),
    [history, setHistory] = useState<any[]>([]),
    [blame, setBlame] = useState<any[]>([]),
    [selected, setSelected] = useState(0),
    [error, setError] = useState(""),
    [good, setGood] = useState(0),
    [bad, setBad] = useState(0),
    [bounds, setBounds] = useState<[number, number] | null>(null);
  useEffect(() => {
    let valid = true;
    if (!path) return;
    Promise.all([rpc<any[]>("history", path), rpc<any[]>("blame", path)])
      .then(([h, b]) => {
        if (valid) {
          setHistory(h);
          setBlame(b);
          setSelected(0);
          setGood(0);
          setBad(Math.max(h.length - 1, 0));
          setBounds(null);
          setError("");
        }
      })
      .catch((e) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [path, snapshot.head]);
  const chronological = [...history].reverse();
  const mid = bounds ? Math.floor((bounds[0] + bounds[1]) / 2) : 0;
  const result = bounds && bounds[1] - bounds[0] === 1;
  const h = history[selected];
  return (
    <div className="detective">
      <div className="feature-intro">
        <div className="intro-icon blue">
          <Search />
        </div>
        <div>
          <span className="eyebrow">FOLLOW THE EVIDENCE</span>
          <h2>Find the change behind the bug.</h2>
          <p>
            Inspect file history, first-parent line attribution and guided
            regression search. No application code is executed.
          </p>
        </div>
      </div>
      <label className="inline-label">
        Investigate file
        <select value={path} onChange={(e) => setPath(e.target.value)}>
          {snapshot.files.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {error && <p className="error-inline">{error}</p>}
      <div className="detective-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>File history</h3>
            <span>{history.length} changes</span>
          </div>
          {history.map((r, i) => (
            <button
              key={r.oid}
              className={"history-item " + (i === selected ? "active" : "")}
              onClick={() => setSelected(i)}
            >
              <code>{r.oid.slice(0, 7)}</code>
              <span>{r.message}</span>
            </button>
          ))}
          {!history.length && (
            <p className="muted pad">No committed changes for this file.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>{h?.message || "Select a change"}</h3>
          </div>
          {h && <Diff before={h.before} after={h.after} path={path} />}
        </section>
      </div>
      <section className="panel blame-panel">
        <div className="panel-heading">
          <h3>Line attribution</h3>
          <span>
            First-parent history • merge resolution attributed to merge commit
          </span>
        </div>
        {blame.map((line, i) => (
          <div className="blame-row" key={i}>
            <code title={line.message}>{line.oid.slice(0, 7)}</code>
            <span>{i + 1}</span>
            <pre>{line.text}</pre>
          </div>
        ))}
      </section>
      <section className="panel bisect">
        <div className="panel-heading">
          <h3>Regression detective</h3>
          <span>
            Guided binary search · file-changing commits on first-parent history
          </span>
        </div>
        <p>
          Choose a known good version and a later bad version. Inspect each
          candidate, then mark its behavior yourself. Assumes a single
          good-to-bad transition.
        </p>
        <div className="toolbar">
          <label>
            Known good
            <select value={good} onChange={(e) => setGood(+e.target.value)}>
              {chronological.map((h, i) => (
                <option key={h.oid} value={i}>
                  {h.oid.slice(0, 7)} · {h.message}
                </option>
              ))}
            </select>
          </label>
          <label>
            Known bad
            <select value={bad} onChange={(e) => setBad(+e.target.value)}>
              {chronological.map((h, i) => (
                <option key={h.oid} value={i}>
                  {h.oid.slice(0, 7)} · {h.message}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={good >= bad}
            onClick={() => {
              setBounds([good, bad]);
              setSelected(history.length - 1 - Math.floor((good + bad) / 2));
            }}
          >
            Start search
          </button>
        </div>
        {bounds && (
          <div className="bisect-result">
            <b>
              {result
                ? "First bad file-changing commit:"
                : "Inspect candidate:"}{" "}
              {chronological[result ? bounds[1] : mid]?.oid.slice(0, 7)}
            </b>
            <span>{chronological[result ? bounds[1] : mid]?.message}</span>
            {!result && (
              <>
                <button
                  className="secondary"
                  onClick={() => {
                    const b: [number, number] = [mid, bounds[1]];
                    setBounds(b);
                    setSelected(
                      history.length - 1 - Math.floor((b[0] + b[1]) / 2),
                    );
                  }}
                >
                  Mark good
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    const b: [number, number] = [bounds[0], mid];
                    setBounds(b);
                    setSelected(
                      history.length - 1 - Math.floor((b[0] + b[1]) / 2),
                    );
                  }}
                >
                  Mark bad
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
export function Simulator({ snapshot }: { snapshot: Snapshot }) {
  const originals = snapshot.commits
    .filter((c) => c.parents.length === 1)
    .slice(0, 8)
    .reverse();
  const [plan, setPlan] = useState(() =>
    originals.map((c) => ({ ...c, action: "pick" })),
  );
  const move = (i: number, d: number) => {
    setPlan((p) => {
      const next = [...p];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  };
  const output = plan.reduce<{ label: string; source: string[] }[]>(
    (out, c) => {
      if (c.action === "drop") return out;
      if (c.action === "squash" && out.length) {
        out[out.length - 1].label += " + " + c.message;
        out[out.length - 1].source.push(c.oid);
      } else out.push({ label: c.message, source: [c.oid] });
      return out;
    },
    [],
  );
  return (
    <div>
      <div className="feature-intro">
        <div className="intro-icon violet">
          <RotateCcw />
        </div>
        <div>
          <span className="eyebrow">SAFE HISTORY REWRITE SIMULATOR</span>
          <h2>Plan the history you want to tell.</h2>
          <p>
            A conceptual plan using up to eight single-parent commits from this
            graph. Does not replay patches, detect reorder conflicts or modify
            Git objects.
          </p>
        </div>
      </div>
      <div className="simulation-label">
        <FlaskConical size={18} />
        SIMULATION ONLY — these are virtual nodes, not new commit hashes.
      </div>
      <div className="simulation-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Rebase plan</h3>
            <button
              onClick={() =>
                setPlan(originals.map((c) => ({ ...c, action: "pick" })))
              }
            >
              Reset plan
            </button>
          </div>
          {plan.map((c, i) => (
            <div className="plan-row" key={c.oid}>
              <select
                aria-label={"Action for " + c.message}
                value={c.action}
                onChange={(e) =>
                  setPlan((p) =>
                    p.map((v, j) =>
                      j === i ? { ...v, action: e.target.value } : v,
                    ),
                  )
                }
              >
                <option>pick</option>
                <option disabled={i === 0}>squash</option>
                <option>drop</option>
              </select>
              <span>
                <code>{c.oid.slice(0, 7)}</code>
                <b>{c.message}</b>
              </span>
              <button
                aria-label="Move commit up"
                disabled={!i}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                aria-label="Move commit down"
                disabled={i === plan.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={15} />
              </button>
            </div>
          ))}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>Resulting virtual history</h3>
            <span>{output.length} nodes</span>
          </div>
          <div className="virtual-graph">
            {output.map((o, i) => (
              <div key={i}>
                <span className="virtual-dot" />
                <code>V{i + 1}</code>
                <span>
                  <b>{o.label}</b>
                  <small>
                    {o.source.length} source commit
                    {o.source.length > 1 ? "s" : ""}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
export function Challenges({
  snapshot,
  run,
  setView,
  busy,
}: {
  snapshot: Snapshot;
  run: Run;
  setView: (s: string) => void;
  busy: boolean;
}) {
  const [result, setResult] = useState<Record<string, string>>({});
  async function validate(id: string) {
    try {
      const s = await rpc<Snapshot>("snapshot");
      let pass = false;
      if (id === "branch")
        pass = s.branches.some((b) => b.name === "release/v2");
      if (id === "merge")
        pass =
          !s.pending &&
          s.commits.some((c) => c.parents.length === 2) &&
          s.branch === "main" &&
          (await rpc<string>("file", "src/config.ts", "main")).includes(
            '"dark"',
          );
      if (id === "fix") {
        pass = (await rpc<string>("file", "src/search.ts", "main")).includes(
          "toLowerCase()",
        );
      }
      setResult((r) => ({
        ...r,
        [id]: pass
          ? "Validated against Git state. Challenge complete."
          : "Not complete yet. Check the objective and your current repository state.",
      }));
    } catch (e: any) {
      setResult((r) => ({ ...r, [id]: e.message }));
    }
  }
  return (
    <div>
      <div className="feature-intro">
        <div className="intro-icon">
          <FlaskConical />
        </div>
        <div>
          <span className="eyebrow">LEARN BY INVESTIGATING</span>
          <h2>Small scenarios. Real Git underneath.</h2>
          <p>
            Start a fresh Atlas lab for these challenges. Each lab is a separate
            repository; your other workspaces stay untouched.
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={() => run("demo")}>
          New challenge lab
        </button>
      </div>
      {!snapshot.lab && (
        <div className="simulation-label">
          Switch to a lab workspace to validate these scenarios.
        </div>
      )}
      <div className="challenge-grid">
        {[
          {
            id: "branch",
            level: "01 / BRANCHING",
            title: "Prepare a release",
            text: "Create a branch named release/v2 from your current commit without moving HEAD.",
            hint: "Terminal: git branch release/v2",
            view: "Terminal",
          },
          {
            id: "merge",
            level: "02 / CONFLICT RESOLUTION",
            title: "A tale of two themes",
            text: "On main, merge feature/dark-mode. Resolve the theme conflict to dark, preserve the theme stylesheet and complete the merge.",
            hint: "Merge lab → feature/dark-mode → Use incoming → Mark resolved → Complete merge.",
            view: "Merge lab",
          },
          {
            id: "fix",
            level: "03 / COMMIT RECOVERY",
            title: "Bring the fix home",
            text: "The search fix is on fix/search. Apply it to main with a cherry-pick so search becomes case insensitive.",
            hint: "Find the search fix hash in History, then: git cherry-pick <full-hash>.",
            view: "History",
          },
        ].map((c) => (
          <section className="challenge-card" key={c.id}>
            <span className="eyebrow">{c.level}</span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            <details>
              <summary>Need a hint?</summary>
              <p>{c.hint}</p>
            </details>
            <div className="toolbar">
              <button className="secondary" onClick={() => setView(c.view)}>
                Open {c.view}
              </button>
              <button
                className="primary"
                disabled={!snapshot.lab || busy}
                onClick={() => validate(c.id)}
              >
                Validate
              </button>
            </div>
            {result[c.id] && (
              <p className="challenge-result">
                <CheckCircle2 size={16} />
                {result[c.id]}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
export function Terminal({ run, busy }: { run: Run; busy: boolean }) {
  const [input, setInput] = useState(""),
    [lines, setLines] = useState([
      {
        command: "Welcome to the GitScope terminal",
        output:
          "A controlled Git interface, not a system shell. Type help for commands.\nChanges are real and local to the selected workspace.",
      },
    ]);
  return (
    <section className="terminal-view">
      <div className="panel-heading">
        <h2>
          <TerminalSquare />
          Git terminal
        </h2>
        <button onClick={() => setLines([])}>Clear output</button>
      </div>
      <div className="terminal-output" aria-live="polite">
        {lines.map((l, i) => (
          <div key={i}>
            <p>
              <span>❯</span> {l.command}
            </p>
            <pre>{l.output}</pre>
          </div>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const command = input;
          if (!command.trim()) return;
          setInput("");
          const result = await run("terminal", command);
          setLines((l) => [
            ...l,
            {
              command,
              output:
                result === undefined
                  ? "Command failed — see error message."
                  : String(result),
            },
          ]);
        }}
      >
        <span>❯</span>
        <input
          aria-label="Git command"
          autoComplete="off"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="git log"
        />
        <button className="primary" disabled={busy}>
          Run command
        </button>
      </form>
    </section>
  );
}
