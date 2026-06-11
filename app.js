(function () {
  const payload = window.SECOND_BRAIN_PORTFOLIO_DATA;
  const publicIndex = payload?.publicIndex || { items: [], stats: {} };
  const graphData = payload?.graphData || { nodes: [], edges: [], stats: {} };
  const items = publicIndex.items || [];
  const graphNodes = graphData.nodes || [];
  const graphEdges = graphData.edges || [];
  const itemById = new Map(items.map((item) => [item.id, item]));

  const svg = document.getElementById("graph-svg");
  const viewport = document.getElementById("graph-viewport");
  const edgeLayer = document.getElementById("edge-layer");
  const nodeLayer = document.getElementById("node-layer");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  const featureButtons = document.querySelectorAll("[data-feature-node]");
  const aiAnswerButton = document.getElementById("ai-answer-button");
  const typeFilters = document.getElementById("type-filters");
  const edgeFilters = document.getElementById("edge-filters");
  const layoutModeLabel = document.getElementById("layout-mode-label");
  const layoutControls = document.getElementById("layout-controls");
  const spacingControls = document.getElementById("spacing-controls");
  const periodPanel = document.querySelector(".period-panel");
  const periodStart = document.getElementById("period-start");
  const periodEnd = document.getElementById("period-end");
  const periodLabel = document.getElementById("period-label");
  const periodResetButton = document.getElementById("period-reset-button");
  const reflowButton = document.getElementById("reflow-button");
  const labelsButton = document.getElementById("labels-button");
  const resetButton = document.getElementById("reset-button");
  const detailDrawer = document.getElementById("detail-drawer");
  const detailClose = document.getElementById("detail-close");
  const detailView = document.getElementById("detail-view");
  const visibleNodeCount = document.getElementById("visible-node-count");
  const visibleEdgeCount = document.getElementById("visible-edge-count");

  const typeLabels = {
    case: "프로젝트",
    prompt: "AI 업무 설계",
    scenario: "도메인 적용",
    domain: "도메인 경험",
    skill: "역량 증거",
    insight: "문제 해결 방식",
    tool: "구현 도구",
    workflow: "업무 자동화"
  };

  const edgeLabels = {
    supports: "역량 근거",
    extends: "확장",
    "related-to": "관련",
    instantiates: "구현 사례",
    requires: "필요 조건",
    improves: "개선",
    "derived-from": "작업 이력 기반",
    "applies-to": "적용 분야"
  };

  const layoutLabels = {
    free: "자유",
    type: "유형별",
    hierarchy: "계층",
    timeline: "시간순"
  };

  const markerColors = {
    case: "#d71935",
    prompt: "#38bdf8",
    scenario: "#a78bfa",
    domain: "#8b9299",
    skill: "#e5e7eb",
    insight: "#f5b84b",
    tool: "#38bdf8",
    workflow: "#78dc77"
  };

  const periodBounds = getPeriodBounds();

  const state = {
    layout: "free",
    spacing: 1,
    labelsVisible: true,
    query: "",
    periodStart: periodBounds.min,
    periodEnd: periodBounds.max,
    selectedId: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    activeTypes: new Set(graphNodes.map((node) => node.type)),
    activeEdges: new Set(graphEdges.map((edge) => edge.type)),
    fixedNodes: new Set(),
    nodePositions: new Map(),
    introMotionActive: false,
    introMotionStartedAt: 0,
    introMotionFrame: null
  };

  const aiState = {
    status: "idle",
    answer: "",
    error: "",
    sources: [],
    remaining: null
  };

  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }

  function getSvgSize() {
    const rect = svg.getBoundingClientRect();
    return {
      width: Math.max(480, rect.width),
      height: Math.max(520, rect.height)
    };
  }

  function setViewportTransform() {
    viewport.setAttribute("transform", `translate(${state.offsetX} ${state.offsetY}) scale(${state.scale})`);
  }

  function nodeSeed(id) {
    let hash = 0;
    for (let index = 0; index < id.length; index += 1) {
      hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
    return hash || 1;
  }

  function introMotionOffset(id) {
    if (!state.introMotionActive) return { x: 0, y: 0 };
    const elapsed = performance.now() - state.introMotionStartedAt;
    const duration = 2300;
    const progress = Math.min(1, elapsed / duration);
    const fade = Math.pow(1 - progress, 2);
    const seed = nodeSeed(id);
    const phase = seed * 0.017 + elapsed * 0.006;
    const amplitude = 8.5 * fade;
    return {
      x: Math.cos(phase) * amplitude * (0.75 + (seed % 5) * 0.08),
      y: Math.sin(phase * 1.18) * amplitude * (0.65 + (seed % 7) * 0.06)
    };
  }

  function displayPosition(id, position) {
    const offset = introMotionOffset(id);
    return {
      x: position.x + offset.x,
      y: position.y + offset.y
    };
  }

  function stopIntroMotion(options = {}) {
    if (state.introMotionFrame) {
      cancelAnimationFrame(state.introMotionFrame);
      state.introMotionFrame = null;
    }
    if (!state.introMotionActive) return;
    state.introMotionActive = false;
    svg.classList.remove("is-intro-motion");
    if (options.render !== false) render();
  }

  function startIntroMotion() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    state.introMotionActive = true;
    state.introMotionStartedAt = performance.now();
    svg.classList.add("is-intro-motion");

    function tick() {
      const elapsed = performance.now() - state.introMotionStartedAt;
      if (elapsed >= 2300) {
        state.introMotionFrame = null;
        stopIntroMotion();
        return;
      }
      render();
      state.introMotionFrame = requestAnimationFrame(tick);
    }

    state.introMotionFrame = requestAnimationFrame(tick);
  }

  function resetCamera() {
    const size = getSvgSize();
    state.scale = Math.max(0.72, Math.min(1.05, size.width / 1200));
    state.offsetX = 0;
    state.offsetY = 0;
    setViewportTransform();
  }

  function worldFromScreen(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.offsetX) / state.scale,
      y: (clientY - rect.top - state.offsetY) / state.scale
    };
  }

  function seedPosition(index) {
    const size = getSvgSize();
    const angle = (index / Math.max(1, graphNodes.length)) * Math.PI * 2 - Math.PI / 2;
    const radiusX = size.width * 0.28 * state.spacing;
    const radiusY = size.height * 0.23 * state.spacing;
    return {
      x: size.width * 0.52 + Math.cos(angle) * radiusX,
      y: size.height * 0.56 + Math.sin(angle) * radiusY
    };
  }

  function arrangeFree() {
    graphNodes.forEach((node, index) => {
      if (!state.fixedNodes.has(node.id)) {
        state.nodePositions.set(node.id, seedPosition(index));
      }
    });
    relaxGraph(180);
  }

  function arrangeByType() {
    const size = getSvgSize();
    const types = uniqueSorted(graphNodes.map((node) => node.type));
    const columns = 3;
    types.forEach((type, typeIndex) => {
      const nodes = graphNodes.filter((node) => node.type === type);
      const col = typeIndex % columns;
      const row = Math.floor(typeIndex / columns);
      nodes.forEach((node, nodeIndex) => {
        state.nodePositions.set(node.id, {
          x: size.width * (0.23 + col * 0.27) + nodeIndex * 42,
          y: size.height * 0.34 + row * 130 * state.spacing
        });
      });
    });
  }

  function arrangeHierarchy() {
    const size = getSvgSize();
    const layers = [
      ["tool", "skill"],
      ["workflow", "scenario"],
      ["prompt", "case"],
      ["insight", "domain"]
    ];
    layers.forEach((types, layerIndex) => {
      const nodes = graphNodes.filter((node) => types.includes(node.type));
      const step = size.width / Math.max(2, nodes.length + 1);
      nodes.forEach((node, nodeIndex) => {
        state.nodePositions.set(node.id, {
          x: step * (nodeIndex + 1),
          y: size.height * 0.26 + layerIndex * 120 * state.spacing
        });
      });
    });
  }

  function arrangeTimeline() {
    const size = getSvgSize();
    const sorted = [...graphNodes].sort((a, b) => String(a.lastUpdated).localeCompare(String(b.lastUpdated)) || a.title.localeCompare(b.title));
    const step = size.width / Math.max(2, sorted.length + 1);
    sorted.forEach((node, index) => {
      state.nodePositions.set(node.id, {
        x: step * (index + 1),
        y: size.height * 0.56 + Math.sin(index * 0.95) * 96 * state.spacing
      });
    });
  }

  function relaxGraph(iterations) {
    const activeEdges = graphEdges.filter((edge) => state.activeEdges.has(edge.type));
    for (let i = 0; i < iterations; i += 1) {
      const moves = new Map(graphNodes.map((node) => [node.id, { x: 0, y: 0 }]));

      for (let a = 0; a < graphNodes.length; a += 1) {
        for (let b = a + 1; b < graphNodes.length; b += 1) {
          const nodeA = graphNodes[a];
          const nodeB = graphNodes[b];
          const posA = state.nodePositions.get(nodeA.id);
          const posB = state.nodePositions.get(nodeB.id);
          const dx = posB.x - posA.x || 1;
          const dy = posB.y - posA.y || 1;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = 52 * state.spacing;
          if (distance < minDistance) {
            const force = (minDistance - distance) * 0.018;
            const mx = (dx / distance) * force;
            const my = (dy / distance) * force;
            moves.get(nodeA.id).x -= mx;
            moves.get(nodeA.id).y -= my;
            moves.get(nodeB.id).x += mx;
            moves.get(nodeB.id).y += my;
          }
        }
      }

      for (const edge of activeEdges) {
        const source = state.nodePositions.get(edge.source);
        const target = state.nodePositions.get(edge.target);
        if (!source || !target) continue;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDistance = 150 * state.spacing;
        const force = (distance - targetDistance) * 0.004;
        const mx = (dx / distance) * force;
        const my = (dy / distance) * force;
        moves.get(edge.source).x += mx;
        moves.get(edge.source).y += my;
        moves.get(edge.target).x -= mx;
        moves.get(edge.target).y -= my;
      }

      for (const node of graphNodes) {
        if (state.fixedNodes.has(node.id)) continue;
        const position = state.nodePositions.get(node.id);
        const move = moves.get(node.id);
        position.x += move.x;
        position.y += move.y;
      }
    }
  }

  function arrangeLayout() {
    state.fixedNodes.clear();
    if (state.layout === "type") arrangeByType();
    else if (state.layout === "hierarchy") arrangeHierarchy();
    else if (state.layout === "timeline") arrangeTimeline();
    else arrangeFree();
    resetCamera();
    render();
  }

  function searchTerms() {
    return state.query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
  }

  function monthIndex(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 12 + Number(match[2]) - 1;
  }

  function monthLabel(index) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    return `${year}.${String(month).padStart(2, "0")}`;
  }

  function nodePeriod(nodeOrItem) {
    const period = nodeOrItem.period || {};
    const start = monthIndex(period.start) ?? monthIndex(nodeOrItem.lastUpdated) ?? periodBounds.min;
    const end = monthIndex(period.end) ?? monthIndex(nodeOrItem.lastUpdated) ?? start;
    return {
      start: Math.min(start, end),
      end: Math.max(start, end)
    };
  }

  function getPeriodBounds() {
    const months = graphNodes.flatMap((node) => {
      const period = node.period || {};
      return [monthIndex(period.start), monthIndex(period.end), monthIndex(node.lastUpdated)].filter((value) => value !== null);
    });
    const fallback = monthIndex("2026-06");
    return {
      min: Math.min(...months, fallback),
      max: Math.max(...months, fallback)
    };
  }

  function isInSelectedPeriod(nodeOrItem) {
    if (state.layout !== "timeline") return true;
    const period = nodePeriod(nodeOrItem);
    return period.end >= state.periodStart && period.start <= state.periodEnd;
  }

  function matchesSearch(item) {
    const terms = searchTerms();
    if (terms.length === 0) return true;
    return terms.every((term) => item.searchText.includes(term));
  }

  function getRelatedIds(id) {
    const related = new Set();
    if (!id) return related;
    for (const edge of graphEdges) {
      if (edge.source === id) related.add(edge.target);
      if (edge.target === id) related.add(edge.source);
    }
    return related;
  }

  function getVisibleData() {
    const matchedIds = new Set(items.filter(matchesSearch).map((item) => item.id));
    const queryActive = searchTerms().length > 0;
    const queryNeighborIds = new Set();

    if (queryActive) {
      for (const edge of graphEdges) {
        if (matchedIds.has(edge.source)) queryNeighborIds.add(edge.target);
        if (matchedIds.has(edge.target)) queryNeighborIds.add(edge.source);
      }
    }

    const visibleNodes = graphNodes.filter((node) => {
      const typeAllowed = state.activeTypes.has(node.type);
      const periodAllowed = isInSelectedPeriod(node);
      const queryAllowed = !queryActive || matchedIds.has(node.id) || queryNeighborIds.has(node.id);
      return typeAllowed && periodAllowed && queryAllowed;
    });
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges = graphEdges.filter((edge) => state.activeEdges.has(edge.type) && visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
    return { visibleNodes, visibleEdges, visibleNodeIds, matchedIds };
  }

  function edgePath(source, target) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = 8;
    const sx = source.x + (dx / distance) * offset;
    const sy = source.y + (dy / distance) * offset;
    const tx = target.x - (dx / distance) * offset;
    const ty = target.y - (dy / distance) * offset;
    const curve = Math.min(36, distance * 0.08);
    const cx = (sx + tx) / 2 - (dy / distance) * curve;
    const cy = (sy + ty) / 2 + (dx / distance) * curve;
    return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
  }

  function clearElement(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function renderEdges(visibleEdges, relatedIds) {
    clearElement(edgeLayer);
    for (const edge of visibleEdges) {
      const sourcePosition = state.nodePositions.get(edge.source);
      const targetPosition = state.nodePositions.get(edge.target);
      if (!sourcePosition || !targetPosition) continue;
      const source = displayPosition(edge.source, sourcePosition);
      const target = displayPosition(edge.target, targetPosition);
      const active = edge.source === state.selectedId || edge.target === state.selectedId;
      const muted = state.selectedId && !active && !relatedIds.has(edge.source) && !relatedIds.has(edge.target);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", edgePath(source, target));
      path.setAttribute("class", ["edge", active ? "is-active" : "", muted ? "is-muted" : ""].filter(Boolean).join(" "));
      edgeLayer.appendChild(path);
    }
  }

  function labelOffset(node) {
    const important = isImportant(node);
    return {
      x: important ? 12 : 7,
      y: important ? 3 : 2
    };
  }

  function isImportant(node) {
    return ["case", "skill"].includes(node.type);
  }

  function renderNodes(visibleNodes, matchedIds, relatedIds) {
    clearElement(nodeLayer);
    nodeLayer.classList.toggle("node-labels-hidden", !state.labelsVisible);

    for (const node of visibleNodes) {
      const item = itemById.get(node.id);
      const position = state.nodePositions.get(node.id);
      if (!item || !position) continue;
      const display = displayPosition(node.id, position);
      const selected = node.id === state.selectedId;
      const related = relatedIds.has(node.id);
      const matched = state.query.trim() && matchedIds.has(node.id);
      const muted = state.selectedId && !selected && !related;
      const important = isImportant(node);

      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", ["node", important ? "is-important" : "", selected ? "is-selected" : "", related ? "is-related" : "", matched ? "is-match" : "", muted ? "is-muted" : ""].filter(Boolean).join(" "));
      group.setAttribute("transform", `translate(${display.x} ${display.y})`);
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", node.title);
      group.dataset.nodeId = node.id;

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("class", "node-dot");
      circle.setAttribute("r", selected ? 7 : important ? 6 : 4);
      circle.setAttribute("fill", markerColors[node.type] || "#9ca3af");
      group.appendChild(circle);

      const offset = labelOffset(node);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "node-label");
      label.setAttribute("x", offset.x);
      label.setAttribute("y", offset.y);
      label.textContent = node.title;
      group.appendChild(label);

      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectNode(node.id);
        }
      });
      circle.addEventListener("pointerdown", startNodeDrag);
      nodeLayer.appendChild(group);
    }
  }

  function splitParagraphs(text) {
    return text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  }

  function trimUrl(url) {
    return url.replace(/[.,;:!?]+$/g, "");
  }

  function normalizeUrl(url) {
    return trimUrl(url).replace(/\/+$/g, "").toLowerCase();
  }

  function hostLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toUpperCase();
    } catch {
      return "LINK";
    }
  }

  function sourceByUrl(sources) {
    const map = new Map();
    (sources || []).forEach((source) => {
      if (!source || !source.url) return;
      map.set(normalizeUrl(source.url), source);
    });
    return map;
  }

  function extractLinks(text, sources = []) {
    const links = [];
    const seen = new Set();
    const sourceMap = sourceByUrl(sources);
    const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    const bareUrlPattern = /https?:\/\/[^\s`<>)]+/g;

    let match;
    while ((match = markdownLinkPattern.exec(text))) {
      const url = trimUrl(match[2]);
      const key = normalizeUrl(url);
      if (seen.has(key)) continue;
      seen.add(key);
      const source = sourceMap.get(key) || {};
      links.push({ label: source.label || match[1], platform: source.platform, date: source.date, url });
    }

    while ((match = bareUrlPattern.exec(text))) {
      const url = trimUrl(match[0]);
      const key = normalizeUrl(url);
      if (seen.has(key)) continue;
      seen.add(key);
      const source = sourceMap.get(key) || {};
      links.push({ label: source.label || hostLabel(url), platform: source.platform, date: source.date, url });
    }

    (sources || []).forEach((source) => {
      if (!source || !source.url) return;
      const url = trimUrl(source.url);
      const key = normalizeUrl(url);
      if (seen.has(key)) return;
      seen.add(key);
      links.push({
        label: source.label || hostLabel(url),
        platform: source.platform || source.type,
        date: source.date,
        url
      });
    });

    return links;
  }

  function appendInlineMarkdown(container, text) {
    const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https?:\/\/[^\s`<>)]+)/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(text))) {
      if (match.index > cursor) {
        container.append(document.createTextNode(text.slice(cursor, match.index)));
      }

      if (match[1] && match[2]) {
        const link = document.createElement("a");
        link.href = trimUrl(match[2]);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = match[1];
        container.appendChild(link);
      } else if (match[3]) {
        const strong = document.createElement("strong");
        strong.textContent = match[3];
        container.appendChild(strong);
      } else if (match[4]) {
        const codeText = match[4];
        if (/^https?:\/\//.test(codeText)) {
          const link = document.createElement("a");
          link.href = trimUrl(codeText);
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          const code = document.createElement("code");
          code.textContent = codeText;
          link.appendChild(code);
          container.appendChild(link);
        } else {
          const code = document.createElement("code");
          code.textContent = codeText;
          container.appendChild(code);
        }
      } else if (match[5]) {
        const url = trimUrl(match[5]);
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = url;
        container.appendChild(link);
      }

      cursor = pattern.lastIndex;
    }

    if (cursor < text.length) {
      container.append(document.createTextNode(text.slice(cursor)));
    }
  }

  function renderMarkdownBlocks(text) {
    const wrapper = document.createElement("div");
    wrapper.className = "detail-body";

    splitParagraphs(text).forEach((paragraphText) => {
      const lines = paragraphText.split(/\n/).map((line) => line.trim()).filter(Boolean);
      const isList = lines.length > 0 && lines.every((line) => line.startsWith("- "));

      if (isList) {
        const list = document.createElement("ul");
        lines.forEach((line) => {
          const item = document.createElement("li");
          appendInlineMarkdown(item, line.slice(2).trim());
          list.appendChild(item);
        });
        wrapper.appendChild(list);
        return;
      }

      const paragraph = document.createElement("p");
      lines.forEach((line, index) => {
        if (index > 0) paragraph.appendChild(document.createElement("br"));
        appendInlineMarkdown(paragraph, line);
      });
      wrapper.appendChild(paragraph);
    });

    return wrapper;
  }

  function makeSection(label, className) {
    const section = document.createElement("section");
    section.className = ["detail-section", className || ""].filter(Boolean).join(" ");
    const kicker = document.createElement("p");
    kicker.className = "detail-kicker";
    kicker.textContent = label;
    section.appendChild(kicker);
    return section;
  }

  function makePill(text, className) {
    const span = document.createElement("span");
    span.className = className || "meta-pill";
    span.textContent = text;
    return span;
  }

  function connectedRelationsFor(id) {
    const seen = new Set();
    const relations = [];
    graphEdges.forEach((edge) => {
      const isOutgoing = edge.source === id;
      const isIncoming = edge.target === id;
      if (!isOutgoing && !isIncoming) return;

      const targetId = isOutgoing ? edge.target : edge.source;
      const key = `${targetId}:${edge.type}:${isOutgoing ? "out" : "in"}`;
      if (seen.has(key)) return;
      const target = itemById.get(targetId);
      if (!target) return;

      seen.add(key);
      relations.push({
        id: targetId,
        title: target.title,
        type: edge.type,
        direction: isOutgoing ? "out" : "in"
      });
    });
    return relations.sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
  }

  function groupRelations(relations) {
    const groups = new Map();
    relations.forEach((relation) => {
      if (!groups.has(relation.type)) groups.set(relation.type, []);
      groups.get(relation.type).push(relation);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderDetail() {
    clearElement(detailView);
    if (!state.selectedId) {
      detailDrawer.classList.add("is-empty");
      return;
    }
    const item = itemById.get(state.selectedId);
    if (!item) {
      detailDrawer.classList.add("is-empty");
      return;
    }

    detailDrawer.classList.remove("is-empty");
    const hero = makeSection("의미", "detail-hero");
    const meta = document.createElement("div");
    meta.className = "detail-meta";
    meta.append(makePill(typeLabels[item.type] || item.type, "meta-pill type"));
    item.domains.forEach((domain) => meta.append(makePill(domain)));

    const title = document.createElement("h2");
    title.textContent = item.title;
    const summary = document.createElement("p");
    summary.className = "detail-summary";
    summary.textContent = item.summary;
    hero.append(meta, title, summary);

    const bodySection = makeSection("본문");
    bodySection.appendChild(renderMarkdownBlocks(item.body));

    const links = extractLinks(item.body, item.sources);
    const sourceSection = makeSection("출처 / 링크");
    links.forEach((link) => {
      const card = document.createElement("a");
      card.className = "source-card";
      card.href = link.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      const platform = document.createElement("span");
      platform.className = "source-platform";
      platform.textContent = link.platform || hostLabel(link.url);
      const date = document.createElement("span");
      date.className = "source-date";
      date.textContent = link.date || "";
      const url = document.createElement("span");
      url.className = "source-url";
      url.textContent = link.url;
      const label = document.createElement("span");
      label.className = "source-label";
      label.textContent = link.label;
      card.append(platform, date, url, label);
      sourceSection.appendChild(card);
    });

    const topicSection = makeSection("주제");
    const tags = document.createElement("div");
    tags.className = "detail-tags";
    item.tags.forEach((tag) => tags.append(makePill(`#${tag}`)));
    topicSection.appendChild(tags);

    const relatedSection = makeSection("연결된 노드");
    const related = document.createElement("div");
    related.className = "related-groups";
    groupRelations(connectedRelationsFor(item.id)).forEach(([type, relations]) => {
      const group = document.createElement("div");
      group.className = "related-group";
      const heading = document.createElement("div");
      heading.className = "related-heading";
      heading.textContent = `— ${edgeLabels[type] || type} ${relations.length}`;
      group.appendChild(heading);

      relations.forEach((relation) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "related-button";
        button.addEventListener("click", () => selectNode(relation.id, { center: true, force: true }));
        const marker = document.createElement("span");
        marker.className = "related-marker";
        const targetTitle = document.createElement("span");
        targetTitle.className = "related-title";
        targetTitle.textContent = relation.title;
        const direction = document.createElement("span");
        direction.className = "related-direction";
        direction.textContent = relation.direction === "out" ? "→" : "←";
        button.append(marker, targetTitle, direction);
        group.appendChild(button);
      });
      related.appendChild(group);
    });
    relatedSection.appendChild(related);

    const sections = [hero, bodySection];
    if (links.length > 0) sections.push(sourceSection);
    sections.push(topicSection, relatedSection);
    detailView.append(...sections);
  }

  function getSearchMatches() {
    const terms = searchTerms();
    if (terms.length === 0) return [];
    return items
      .filter((item) => matchesSearch(item))
      .filter((item) => {
        const node = graphNodes.find((graphNode) => graphNode.id === item.id);
        return node && state.activeTypes.has(node.type) && isInSelectedPeriod(node);
      })
      .sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const query = state.query.toLowerCase().trim();
        const aStarts = aTitle.startsWith(query) ? 0 : 1;
        const bStarts = bTitle.startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.title.localeCompare(b.title);
      });
  }

  function renderSearchResults() {
    clearElement(searchResults);
    const matches = getSearchMatches();
    const queryActive = searchTerms().length > 0;

    searchResults.classList.toggle("is-empty", !queryActive);
    if (!queryActive) return;

    const header = document.createElement("div");
    header.className = "search-results-header";
    const label = document.createElement("span");
    label.textContent = `${matches.length}개 결과`;
    const hint = document.createElement("span");
    hint.textContent = aiState.remaining === null ? "공개 노드" : `AI 잔여 ${aiState.remaining}회`;
    header.append(label, hint);
    searchResults.appendChild(header);

    if (aiState.status !== "idle") {
      const answer = document.createElement("div");
      answer.className = ["ai-answer", `is-${aiState.status}`].join(" ");
      if (aiState.status === "loading") {
        answer.textContent = "AI 답변을 생성하는 중입니다.";
      } else if (aiState.status === "error") {
        answer.textContent = aiState.error || "AI 답변 생성에 실패했습니다.";
      } else {
        const body = document.createElement("p");
        body.textContent = aiState.answer;
        answer.appendChild(body);

        if (aiState.sources.length > 0) {
          const sources = document.createElement("div");
          sources.className = "ai-answer-sources";
          aiState.sources.forEach((source) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = source.title;
            button.addEventListener("click", () => selectNode(source.id));
            sources.appendChild(button);
          });
          answer.appendChild(sources);
        }
      }
      searchResults.appendChild(answer);
    }

    if (matches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "search-results-empty";
      empty.textContent = "일치하는 공개 노드가 없습니다.";
      searchResults.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "search-results-list";
    matches.slice(0, 8).forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.addEventListener("click", () => selectNode(item.id));

      const title = document.createElement("span");
      title.className = "search-result-title";
      title.textContent = item.title;
      const summary = document.createElement("span");
      summary.className = "search-result-summary";
      summary.textContent = item.summary;
      const meta = document.createElement("span");
      meta.className = "search-result-meta";
      meta.textContent = [typeLabels[item.type] || item.type, ...item.domains.slice(0, 2)].join(" · ");

      button.append(title, summary, meta);
      list.appendChild(button);
    });

    searchResults.appendChild(list);
  }

  function render() {
    const { visibleNodes, visibleEdges, matchedIds } = getVisibleData();
    const relatedIds = getRelatedIds(state.selectedId);
    visibleNodeCount.textContent = `${visibleNodes.length} 노드`;
    visibleEdgeCount.textContent = `${visibleEdges.length} 엣지`;
    renderEdges(visibleEdges, relatedIds);
    renderNodes(visibleNodes, matchedIds, relatedIds);
    renderDetail();
    renderSearchResults();
  }

  function renderPeriodControls() {
    const active = state.layout === "timeline";
    periodPanel.classList.toggle("is-visible", active);
    periodStart.min = String(periodBounds.min);
    periodStart.max = String(periodBounds.max);
    periodEnd.min = String(periodBounds.min);
    periodEnd.max = String(periodBounds.max);
    periodStart.value = String(state.periodStart);
    periodEnd.value = String(state.periodEnd);
    periodLabel.textContent = `${monthLabel(state.periodStart)} - ${monthLabel(state.periodEnd)}`;
  }

  function renderLayoutModeLabel() {
    layoutModeLabel.textContent = layoutLabels[state.layout] || "자유";
  }

  function centerOnNode(id) {
    const position = state.nodePositions.get(id);
    if (!position) return;
    const size = getSvgSize();
    state.offsetX = size.width / 2 - position.x * state.scale;
    state.offsetY = size.height / 2 - position.y * state.scale;
    setViewportTransform();
  }

  function selectNode(id, options = {}) {
    state.selectedId = state.selectedId === id && !options.force ? null : id;
    if (options.center) {
      centerOnNode(id);
    }
    render();
  }

  function countBy(values) {
    const counts = new Map();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return counts;
  }

  function makeLegendRow({ markerClass, color, ko, en, count, active, onClick }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "legend-row";
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", onClick);

    const marker = document.createElement("span");
    marker.className = markerClass || "legend-marker";
    marker.style.background = color;
    const label = document.createElement("span");
    label.className = "legend-label";
    const koText = document.createElement("span");
    koText.className = "legend-ko";
    koText.textContent = ko;
    const enText = document.createElement("span");
    enText.className = "legend-en";
    enText.textContent = en;
    label.append(koText, enText);
    const countText = document.createElement("span");
    countText.className = "legend-count";
    countText.textContent = String(count);
    button.append(marker, label, countText);
    return button;
  }

  function renderFilterControls() {
    clearElement(typeFilters);
    const typeCounts = countBy(graphNodes.map((node) => node.type));
    for (const type of uniqueSorted(graphNodes.map((node) => node.type))) {
      typeFilters.appendChild(
        makeLegendRow({
          color: markerColors[type] || "#9ca3af",
          ko: typeLabels[type] || type,
          en: type,
          count: typeCounts.get(type),
          active: state.activeTypes.has(type),
          onClick: () => {
            if (state.activeTypes.has(type)) state.activeTypes.delete(type);
            else state.activeTypes.add(type);
            renderFilterControls();
            render();
          }
        })
      );
    }

    clearElement(edgeFilters);
    const edgeCounts = countBy(graphEdges.map((edge) => edge.type));
    for (const type of uniqueSorted(graphEdges.map((edge) => edge.type))) {
      edgeFilters.appendChild(
        makeLegendRow({
          color: "#51565d",
          ko: edgeLabels[type] || type,
          en: type,
          count: edgeCounts.get(type),
          active: state.activeEdges.has(type),
          onClick: () => {
            if (state.activeEdges.has(type)) state.activeEdges.delete(type);
            else state.activeEdges.add(type);
            renderFilterControls();
            render();
          }
        })
      );
    }
  }

  function updatePressed(container, dataKey, value) {
    container.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset[dataKey] === value));
    });
  }

  function startNodeDrag(event) {
    stopIntroMotion({ render: false });
    event.preventDefault();
    event.stopPropagation();
    const group = event.currentTarget.closest(".node");
    if (!group) return;
    const nodeId = group.dataset.nodeId;
    const startClient = {
      x: event.clientX,
      y: event.clientY
    };
    let dragged = false;
    const start = worldFromScreen(event.clientX, event.clientY);
    const position = state.nodePositions.get(nodeId);
    const offset = {
      x: start.x - position.x,
      y: start.y - position.y
    };
    state.fixedNodes.add(nodeId);
    group.classList.add("is-dragging");
    group.setPointerCapture(event.pointerId);

    function move(moveEvent) {
      const screenDx = moveEvent.clientX - startClient.x;
      const screenDy = moveEvent.clientY - startClient.y;
      if (Math.sqrt(screenDx * screenDx + screenDy * screenDy) > 4) {
        dragged = true;
      }
      const point = worldFromScreen(moveEvent.clientX, moveEvent.clientY);
      state.nodePositions.set(nodeId, {
        x: point.x - offset.x,
        y: point.y - offset.y
      });
      render();
    }

    function stop(stopEvent) {
      group.classList.remove("is-dragging");
      if (group.hasPointerCapture(stopEvent.pointerId)) {
        group.releasePointerCapture(stopEvent.pointerId);
      }
      group.removeEventListener("pointermove", move);
      group.removeEventListener("pointerup", stop);
      group.removeEventListener("pointercancel", stop);
      if (stopEvent.type === "pointerup" && !dragged) {
        selectNode(nodeId);
      }
    }

    group.addEventListener("pointermove", move);
    group.addEventListener("pointerup", stop);
    group.addEventListener("pointercancel", stop);
  }

  function initPanAndZoom() {
    let pan = null;
    svg.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".node")) return;
      stopIntroMotion();
      pan = {
        x: event.clientX,
        y: event.clientY,
        offsetX: state.offsetX,
        offsetY: state.offsetY
      };
      svg.classList.add("is-panning");
      svg.setPointerCapture(event.pointerId);
    });

    svg.addEventListener("pointermove", (event) => {
      if (!pan) return;
      state.offsetX = pan.offsetX + event.clientX - pan.x;
      state.offsetY = pan.offsetY + event.clientY - pan.y;
      setViewportTransform();
    });

    function stopPan(event) {
      if (!pan) return;
      pan = null;
      svg.classList.remove("is-panning");
      svg.releasePointerCapture(event.pointerId);
    }

    svg.addEventListener("pointerup", stopPan);
    svg.addEventListener("pointercancel", stopPan);
    svg.addEventListener("click", (event) => {
      if (event.target === svg) {
        state.selectedId = null;
        render();
      }
    });
    svg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        const before = worldFromScreen(event.clientX, event.clientY);
        const delta = event.deltaY > 0 ? 0.9 : 1.1;
        state.scale = Math.max(0.42, Math.min(2.6, state.scale * delta));
        state.offsetX = event.clientX - rect.left - before.x * state.scale;
        state.offsetY = event.clientY - rect.top - before.y * state.scale;
        setViewportTransform();
      },
      { passive: false }
    );
  }

  function initControls() {
    searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      aiState.status = "idle";
      aiState.answer = "";
      aiState.error = "";
      aiState.sources = [];
      render();
    });

    aiAnswerButton.addEventListener("click", async () => {
      const question = state.query.trim();
      if (question.length < 2) {
        aiState.status = "error";
        aiState.error = "질문을 2글자 이상 입력하세요.";
        render();
        return;
      }

      if (window.PORTFOLIO_AI_ENABLED === false) {
        aiState.status = "error";
        aiState.error =
          window.PORTFOLIO_AI_DISABLED_MESSAGE ||
          "Agent Daon은 배포 2단계에서 연결할 예정입니다.";
        aiState.answer = "";
        aiState.sources = [];
        render();
        return;
      }

      aiState.status = "loading";
      aiState.answer = "";
      aiState.error = "";
      aiState.sources = [];
      render();

      try {
        const response = await fetch(window.PORTFOLIO_AI_ENDPOINT || "/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "AI 답변 생성에 실패했습니다.");
        }
        aiState.status = "success";
        aiState.answer = payload.answer || "";
        aiState.sources = payload.sources || [];
        aiState.remaining = payload.rateLimit?.remaining ?? null;
      } catch (error) {
        aiState.status = "error";
        aiState.error = error.message.includes("Failed to fetch")
          ? "AI 답변은 서버 실행 후 사용할 수 있습니다."
          : error.message;
      }
      render();
    });

    featureButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nodeId = button.dataset.featureNode;
        if (!nodeId || !itemById.has(nodeId)) return;
        state.query = "";
        searchInput.value = "";
        aiState.status = "idle";
        aiState.answer = "";
        aiState.error = "";
        aiState.sources = [];
        selectNode(nodeId, { center: true, force: true });
      });
    });

    layoutControls.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-layout]");
      if (!button) return;
      state.layout = button.dataset.layout;
      updatePressed(layoutControls, "layout", state.layout);
      renderLayoutModeLabel();
      renderPeriodControls();
      arrangeLayout();
    });

    spacingControls.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-spacing]");
      if (!button) return;
      state.spacing = Number(button.dataset.spacing);
      updatePressed(spacingControls, "spacing", button.dataset.spacing);
      arrangeLayout();
    });

    reflowButton.addEventListener("click", arrangeLayout);
    detailClose.addEventListener("click", () => {
      state.selectedId = null;
      render();
    });
    labelsButton.addEventListener("click", () => {
      state.labelsVisible = !state.labelsVisible;
      labelsButton.setAttribute("aria-pressed", String(state.labelsVisible));
      labelsButton.textContent = state.labelsVisible ? "◌ 라벨 숨기기" : "● 라벨 보이기";
      render();
    });
    resetButton.addEventListener("click", () => {
      state.query = "";
      searchInput.value = "";
      state.selectedId = null;
      state.periodStart = periodBounds.min;
      state.periodEnd = periodBounds.max;
      state.activeTypes = new Set(graphNodes.map((node) => node.type));
      state.activeEdges = new Set(graphEdges.map((edge) => edge.type));
      renderFilterControls();
      renderPeriodControls();
      arrangeLayout();
    });
    function updatePeriodFromInput() {
      const start = Number(periodStart.value);
      const end = Number(periodEnd.value);
      state.periodStart = Math.min(start, end);
      state.periodEnd = Math.max(start, end);
      state.selectedId = null;
      renderPeriodControls();
      render();
    }
    periodStart.addEventListener("input", updatePeriodFromInput);
    periodEnd.addEventListener("input", updatePeriodFromInput);
    periodResetButton.addEventListener("click", () => {
      state.periodStart = periodBounds.min;
      state.periodEnd = periodBounds.max;
      renderPeriodControls();
      render();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.selectedId) {
        state.selectedId = null;
        render();
      }
    });
    window.addEventListener("resize", arrangeLayout);
  }

  function init() {
    graphNodes.forEach((node, index) => state.nodePositions.set(node.id, seedPosition(index)));
    renderFilterControls();
    renderLayoutModeLabel();
    renderPeriodControls();
    initPanAndZoom();
    initControls();
    arrangeLayout();
    startIntroMotion();
  }

  init();
})();
