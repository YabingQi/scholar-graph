import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import Cytoscape from "cytoscape";

const STYLE = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-size": 11,
      "text-valign": "bottom",
      "text-margin-y": 5,
      "background-color": "#4f8ef7",
      width: "mapData(paperCount, 0, 300, 20, 60)",
      height: "mapData(paperCount, 0, 300, 20, 60)",
      color: "#e0e0e0",
      "text-wrap": "wrap",
      "text-max-width": 120,
    },
  },
  {
    selector: "node[?center]",
    style: {
      "background-color": "#f7914f",
      "font-weight": "bold",
      "font-size": 13,
    },
  },
  {
    selector: "node.highlighted",
    style: { "background-color": "#f7e24f" },
  },
  {
    selector: "node.focused",
    style: {
      "background-color": "#a0f74f",
      "border-width": 3,
      "border-color": "#fff",
    },
  },
  {
    selector: "edge",
    style: {
      width: "mapData(weight, 1, 20, 1, 5)",
      "line-color": "#3a5a8a",
      "curve-style": "bezier",
      opacity: 0.5,
    },
  },
  {
    selector: "edge.path-edge",
    style: { "line-color": "#f7914f", opacity: 1, width: 3 },
  },
];

const LAYOUT = {
  name: "cose",
  animate: true,
  animationDuration: 500,
  nodeOverlap: 20,
  padding: 40,
  randomize: false,
  componentSpacing: 60,
  nodeRepulsion: 400000,
  idealEdgeLength: 100,
  edgeElasticity: 100,
  fit: false,
};

const Graph = forwardRef(function Graph({ nodes, edges, pathNodeIds, onNodeClick }, ref) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const layoutRef = useRef(null);
  const firstLayout = useRef(true);

  useImperativeHandle(ref, () => ({
    focusNode(nodeId) {
      const cy = cyRef.current;
      if (!cy) return;
      cy.nodes().removeClass("focused");
      const target = cy.getElementById(nodeId);
      if (!target.length) return;
      target.addClass("focused");
      cy.animate({ fit: { eles: target, padding: 140 }, duration: 500 });
    },
  }));

  // Initialise Cytoscape once
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = Cytoscape({
      container: containerRef.current,
      style: STYLE,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    // Tooltip
    const tooltip = document.createElement("div");
    tooltip.className = "cy-tooltip";
    tooltip.style.display = "none";
    containerRef.current.appendChild(tooltip);

    cy.on("mouseover", "node", (evt) => {
      const d = evt.target.data();
      // Expanded nodes: show total papers. Coauthor-only nodes: show shared papers with context.
      let paperLine;
      if (d.expanded) {
        paperLine = `📄 ${d.paperCount ?? "?"} papers total`;
      } else if (d.sharedPapers != null) {
        const connectedCenters = evt.target.connectedEdges()
          .connectedNodes()
          .filter((n) => n.data("center") || n.data("expanded"))
          .map((n) => n.data("label"));
        const centerName = connectedCenters.length === 1 ? connectedCenters[0] : (d.expandedFrom || null);
        paperLine = centerName
          ? `📄 ${d.sharedPapers} shared papers<br>↳ with ${centerName}`
          : `📄 ${d.sharedPapers} shared papers`;
      } else {
        paperLine = `📄 ${d.paperCount ?? "?"} papers`;
      }
      const lines = [
        `<strong>${d.label}</strong>`,
        d.affiliation ? `🏛 ${d.affiliation}` : null,
        paperLine,
      ].filter(Boolean);
      tooltip.innerHTML = lines.join("<br>");
      tooltip.style.display = "block";
    });
    cy.on("mousemove", "node", (evt) => {
      const { x, y } = evt.originalEvent;
      const rect = containerRef.current.getBoundingClientRect();
      tooltip.style.left = `${x - rect.left + 12}px`;
      tooltip.style.top  = `${y - rect.top  + 12}px`;
    });
    cy.on("mouseout", "node", () => { tooltip.style.display = "none"; });

    cy.on("tap", "node", (evt) => onNodeClick(evt.target.data()));
    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Incrementally add nodes then edges; re-run layout only when new elements arrive
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const existingNodeIds = new Set(cy.nodes().map((n) => n.id()));
    const existingEdgeIds = new Set(cy.edges().map((e) => e.id()));

    // Update existing node data (e.g. center flag)
    for (const n of nodes) {
      if (existingNodeIds.has(n.id)) cy.getElementById(n.id).data(n);
    }

    // Add new nodes first
    const newNodes = nodes
      .filter((n) => !existingNodeIds.has(n.id))
      .map((n) => ({ group: "nodes", data: { ...n } }));
    if (newNodes.length) cy.add(newNodes);

    // Add new edges (endpoints now guaranteed to exist)
    const newEdges = edges
      .filter((e) => {
        if (existingEdgeIds.has(e.id)) return false;
        if (existingEdgeIds.has(`${e.target}-${e.source}`)) return false;
        return cy.getElementById(e.source).length && cy.getElementById(e.target).length;
      })
      .map((e) => ({ group: "edges", data: { ...e } }));
    if (newEdges.length) cy.add(newEdges);

    if (!newNodes.length && !newEdges.length) return;

    if (layoutRef.current) layoutRef.current.stop();
    const isFirst = firstLayout.current;
    firstLayout.current = false;
    const opts = isFirst ? { ...LAYOUT, randomize: true } : LAYOUT;

    requestAnimationFrame(() => {
      cy.resize();
      layoutRef.current = cy.layout(opts);
      if (isFirst) {
        // Wait for animation to finish, then center
        setTimeout(() => cy.fit(undefined, 50), LAYOUT.animationDuration + 100);
      }
      layoutRef.current.run();
    });
  }, [nodes, edges]);

  // Highlight path
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("highlighted");
    cy.edges().removeClass("path-edge");
    if (!pathNodeIds?.length) return;
    const idSet = new Set(pathNodeIds);
    cy.nodes().forEach((n) => { if (idSet.has(n.id())) n.addClass("highlighted"); });
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const a = pathNodeIds[i], b = pathNodeIds[i + 1];
      cy.edges(`[source="${a}"][target="${b}"]`).addClass("path-edge");
      cy.edges(`[source="${b}"][target="${a}"]`).addClass("path-edge");
    }
  }, [pathNodeIds]);

  return <div ref={containerRef} className="graph-container" />;
});

export default Graph;
