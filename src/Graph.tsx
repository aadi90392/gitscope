import { useEffect, useRef } from "react";
import { select, linkVertical } from "d3";
import { layout } from "./algorithms";
import type { Snapshot } from "./types";
const colors = ["#b5f477", "#b69bff", "#70c6ff", "#ffb580", "#fb92bc"];
export default function Graph({
  snapshot,
  selected,
  onSelect,
  query,
}: {
  snapshot: Snapshot;
  selected: string;
  onSelect: (oid: string) => void;
  query: string;
}) {
  const nodes = layout(snapshot.commits),
    svg = useRef<SVGSVGElement>(null);
  const width = Math.max(
    100,
    (Math.max(0, ...nodes.map((n) => n.lane)) + 1) * 28 + 28,
  );
  useEffect(() => {
    const root = select(svg.current);
    root.selectAll("*").remove();
    const map = new Map(nodes.map((n) => [n.oid, n]));
    const line = linkVertical<any, any>()
      .x((d) => d.x)
      .y((d) => d.y);
    nodes.forEach((n) =>
      n.parents.forEach((p) => {
        const parent = map.get(p);
        if (!parent) return;
        root
          .append("path")
          .attr(
            "d",
            line({
              source: { x: 24 + n.lane * 28, y: n.index * 62 + 31 },
              target: { x: 24 + parent.lane * 28, y: parent.index * 62 + 31 },
            }),
          )
          .attr("fill", "none")
          .attr("stroke", colors[n.lane % 5])
          .attr("stroke-width", 2)
          .attr("opacity", 0.6);
      }),
    );
    nodes.forEach((n) => {
      root
        .append("circle")
        .attr("cx", 24 + n.lane * 28)
        .attr("cy", n.index * 62 + 31)
        .attr("r", n.oid === selected ? 7 : 5)
        .attr("fill", n.oid === selected ? colors[n.lane % 5] : "#13171e")
        .attr("stroke", colors[n.lane % 5])
        .attr("stroke-width", 2.5);
    });
  }, [snapshot, selected]);
  return (
    <div className="graph-table">
      <div className="graph-col" style={{ width, minWidth: width }}>
        <svg
          ref={svg}
          width={width}
          height={nodes.length * 62}
          aria-label="Commit ancestry graph"
          role="img"
        />
      </div>
      <div className="commit-rows">
        {nodes.map((n) => (
          <button
            className={"commit-row " + (selected === n.oid ? "selected" : "")}
            style={{
              opacity:
                query &&
                !`${n.message} ${n.oid} ${n.author}`
                  .toLowerCase()
                  .includes(query.toLowerCase())
                  ? 0.25
                  : 1,
            }}
            key={n.oid}
            onClick={() => onSelect(n.oid)}
          >
            <span className="commit-summary">
              <b>{n.message}</b>
              <span className="ref-list">
                {snapshot.branches
                  .filter((b) => b.oid === n.oid)
                  .map((b) => (
                    <em
                      className={
                        b.name === snapshot.branch ? "ref current" : "ref"
                      }
                      key={b.name}
                    >
                      {b.name}
                    </em>
                  ))}
                {snapshot.tags
                  .filter((t) => t.oid === n.oid)
                  .map((t) => (
                    <em className="ref tag" key={t.name}>
                      {t.name}
                    </em>
                  ))}
                {snapshot.head === n.oid && (
                  <em className="head-label">HEAD</em>
                )}
              </span>
            </span>
            <span className="commit-author">{n.author}</span>
            <code>{n.oid.slice(0, 7)}</code>
          </button>
        ))}
      </div>
    </div>
  );
}
