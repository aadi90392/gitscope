export type Commit = {
  oid: string;
  message: string;
  parents: string[];
  author: string;
  time: number;
};
export type Entry = { path: string; head: number; work: number; stage: number };
export type Conflict = {
  path: string;
  base: string | null;
  ours: string | null;
  theirs: string | null;
  result: string | null;
  resolved: boolean;
};
export type Pending = {
  kind: "merge" | "cherry-pick";
  ours: string;
  theirs: string;
  branch: string;
  target: string;
  message: string;
  changes: Record<string, string | null>;
  conflicts: Conflict[];
};
export type Snapshot = {
  id: string;
  name: string;
  lab: boolean;
  head: string;
  branch: string;
  branches: { name: string; oid: string }[];
  tags: { name: string; oid: string }[];
  commits: Commit[];
  status: Entry[];
  files: string[];
  pending: Pending | null;
};
export type Detail = {
  files: string[];
  changed: { path: string; before: string; after: string }[];
  refs: string[];
};
