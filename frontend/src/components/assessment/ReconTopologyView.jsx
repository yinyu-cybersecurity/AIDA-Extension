import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { X, Edit2, Shield, Activity } from '../icons/index';
import UnifiedModal from '../common/UnifiedModal';
import apiClient from '../../services/api';

const isInternalIP = (ip) => {
  if (!ip) return false;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  const match172 = ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
  if (match172) return true;
  return false;
};

const SEVERITY_COLORS = {
  CRITICAL: '#ff4d6d',
  HIGH: '#ff8c42',
  MEDIUM: '#ffd166',
  LOW: '#4cc9f0',
  INFO: '#94a3b8',
};

const TYPE_COLORS = {
  target: '#67e8f9',
  network: '#22d3ee',
  domain: '#8b5cf6',
  subdomain: '#a855f7',
  hostname: '#60a5fa',
  ip_address: '#22c55e',
  endpoint: '#f43f5e',
  service: '#f59e0b',
  technology: '#eab308',
  finding: '#ff4d6d',
};

const TYPE_RING_RADIUS = {
  domain: 230,
  network: 250,
  subdomain: 360,
  hostname: 400,
  ip_address: 430,
  service: 560,
  endpoint: 640,
  technology: 710,
};

const TYPE_RING_OFFSET = {
  domain: -Math.PI / 2,
  network: -Math.PI / 6,
  subdomain: Math.PI / 4,
  hostname: Math.PI / 1.6,
  ip_address: Math.PI / 1.15,
  service: Math.PI / 9,
  endpoint: Math.PI / 1.9,
  technology: Math.PI / 1.35,
};

const getNodeSize = (type, severity) => {
  if (type === 'target') return 18;
  if (severity === 'CRITICAL') return 14;
  if (severity === 'HIGH') return 12;
  if (type === 'network' || type === 'domain') return 10;
  if (type === 'service') return 9;
  if (type === 'ip_address' || type === 'hostname') return 8;
  return 7;
};

const getNodeColor = (type, name, severity) => {
  if (severity && SEVERITY_COLORS[severity]) {
    return SEVERITY_COLORS[severity];
  }

  if (type === 'ip_address') {
    return isInternalIP(name) ? '#22c55e' : '#f43f5e';
  }

  return TYPE_COLORS[type] || '#94a3b8';
};

const getCollisionRadius = (node) => {
  const base = (node?.val || 6) + 16;

  if (node?.isRoot) return base + 20;
  if (node?.isFindingNode) return base + 18;
  if (node?.highestSeverity === 'CRITICAL') return base + 16;
  if (node?.highestSeverity) return base + 12;
  if (node?.findingCount > 0) return base + 8;

  return base;
};

const normalizeTargetService = (value) => (value || '').trim().toLowerCase();

const ReconTopologyView = ({
  data,
  cards = [],
  assessmentName = 'Assessment',
  assessmentId,
  isActive = false,
  onUpdate,
}) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', details: {}, discovered_in_phase: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });
  const fgRef = useRef(null);
  const graphPaneRef = useRef(null);
  const viewportFrameRef = useRef(null);

  const topologyData = useMemo(() => {
    const nodes = [];
    const links = [];
    const nodeIndex = new Map();
    const relatedCardsMap = new Map();

    const attachCard = (nodeId, card) => {
      if (!nodeId) return;
      if (!relatedCardsMap.has(nodeId)) {
        relatedCardsMap.set(nodeId, []);
      }
      relatedCardsMap.get(nodeId).push(card);
    };

    const getHighestSeverity = (relatedCards) => {
      if (!relatedCards?.length) return null;
      const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
      return severityOrder.find((severity) => relatedCards.some((card) => card.severity === severity)) || null;
    };

    const rootId = `assessment-${assessmentId}`;
    const rootNode = {
      id: rootId,
      name: assessmentName || 'Assessment',
      normalizedName: normalizeTargetService(assessmentName),
      data_type: 'target',
      val: 18,
      color: TYPE_COLORS.target,
      details: {
        assessment_id: assessmentId,
        recon_items: data.length,
        findings: cards.filter((card) => card.card_type === 'finding').length,
      },
      originalItem: null,
      relatedCards: cards,
      highestSeverity: getHighestSeverity(cards),
      findingCount: cards.filter((card) => card.card_type === 'finding').length,
      observationCount: cards.filter((card) => card.card_type === 'observation').length,
      infoCount: cards.filter((card) => card.card_type === 'info').length,
      isRoot: true,
      x: 0,
      y: 0,
      fx: 0,
      fy: 0,
    };
    nodes.push(rootNode);
    nodeIndex.set(rootId, rootNode);

    data.forEach((item) => {
      const nodeId = item.id.toString();
      const normalizedName = normalizeTargetService(item.name);
      const matchingCards = cards.filter((card) => {
        const target = normalizeTargetService(card.target_service);
        return target && (
          target === normalizedName ||
          normalizedName.includes(target) ||
          target.includes(normalizedName)
        );
      });
      const highestSeverity = getHighestSeverity(matchingCards);
      const node = {
        id: nodeId,
        name: item.name,
        normalizedName,
        data_type: item.data_type,
        details: item.details || {},
        discovered_in_phase: item.discovered_in_phase,
        originalItem: item,
        relatedCards: matchingCards,
        highestSeverity,
        val: getNodeSize(item.data_type, highestSeverity),
        color: getNodeColor(item.data_type, item.name, highestSeverity),
      };
      nodes.push(node);
      nodeIndex.set(nodeId, node);
    });

    data.forEach((item) => {
      const sourceId = item.id.toString();
      let targetId = rootId;

      if (item.data_type === 'subdomain') {
        const parentDomain = data.find((d) => d.data_type === 'domain' && item.name.endsWith(d.name));
        if (parentDomain) targetId = parentDomain.id.toString();
      } else if (item.data_type === 'ip_address') {
        const parentNetwork = data.find((d) => d.data_type === 'network' && item.name.startsWith(d.name.split('.')[0]));
        if (parentNetwork) targetId = parentNetwork.id.toString();
      } else if (item.data_type === 'service') {
        const parentHost = data.find((d) => (d.data_type === 'ip_address' || d.data_type === 'hostname') &&
          (item.details?.host === d.name || item.name.includes(d.name)));
        if (parentHost) targetId = parentHost.id.toString();
      } else if (item.data_type === 'hostname') {
        if (item.details?.ip) {
          const parentIp = data.find((d) => d.data_type === 'ip_address' && d.name === item.details.ip);
          if (parentIp) targetId = parentIp.id.toString();
        }
      } else if (item.data_type === 'endpoint') {
        const parentService = data.find((d) => d.data_type === 'service' && (item.details?.service === d.name || item.name.includes(d.name)));
        if (parentService) targetId = parentService.id.toString();
      } else if (item.data_type === 'technology') {
        const parentAsset = data.find((d) => ['service', 'hostname', 'endpoint'].includes(d.data_type) &&
          (item.details?.service === d.name || item.details?.host === d.name || item.details?.technology_of === d.name));
        if (parentAsset) targetId = parentAsset.id.toString();
      }

      const isRootLink = targetId === rootId;
      links.push({
        source: targetId,
        target: sourceId,
        isRootLink,
        distance: isRootLink
          ? 260
          : ['subdomain', 'endpoint', 'technology'].includes(item.data_type)
            ? 150
            : 185,
        color: nodeIndex.get(sourceId)?.highestSeverity
          ? `${getNodeColor(item.data_type, item.name, nodeIndex.get(sourceId)?.highestSeverity)}88`
          : '#1e293b',
      });
    });

    cards.forEach((card) => {
      const target = normalizeTargetService(card.target_service);
      let parentId = rootId;

      if (target) {
        const matchingNode = nodes.find((node) => !node.isRoot && node.normalizedName && (
          node.normalizedName === target ||
          node.normalizedName.includes(target) ||
          target.includes(node.normalizedName)
        ));
        if (matchingNode) parentId = matchingNode.id;
      }

      attachCard(parentId, card);

      if (card.card_type === 'finding') {
        const findingNodeId = `finding-${card.id}`;
        const sev = card.severity || 'INFO';
        const findingNode = {
          id: findingNodeId,
          name: card.title,
          data_type: 'finding',
          details: card,
          originalItem: null, // Findings are not editable recon assets
          relatedCards: [],
          highestSeverity: sev,
          val: getNodeSize('finding', sev),
          color: getNodeColor('finding', card.title, sev),
          isFindingNode: true,
          findingCount: 0,
          observationCount: 0,
          infoCount: 0,
        };
        nodes.push(findingNode);
        nodeIndex.set(findingNodeId, findingNode);

        links.push({
          source: parentId,
          target: findingNodeId,
          isRootLink: false,
          isFindingLink: true,
          distance: 120,
          color: getNodeColor('finding', card.title, sev)
        });
      }
    });

    nodes.forEach((node) => {
      if (node.isFindingNode) return;
      
      const relatedCards = relatedCardsMap.get(node.id) || node.relatedCards || [];
      node.relatedCards = relatedCards;
      node.highestSeverity = getHighestSeverity(relatedCards) || node.highestSeverity;
      node.color = getNodeColor(node.data_type, node.name, node.highestSeverity);
      node.val = getNodeSize(node.data_type, node.highestSeverity);
      node.findingCount = relatedCards.filter((card) => card.card_type === 'finding').length;
      node.observationCount = relatedCards.filter((card) => card.card_type === 'observation').length;
      node.infoCount = relatedCards.filter((card) => card.card_type === 'info').length;
    });

    return { nodes, links };
  }, [assessmentId, assessmentName, cards, data]);

  const topologyStats = useMemo(() => {
    const findings = cards.filter((card) => card.card_type === 'finding');
    return {
      nodes: topologyData.nodes.length,
      links: topologyData.links.length,
      findings: findings.length,
      critical: findings.filter((card) => card.severity === 'CRITICAL').length,
      high: findings.filter((card) => card.severity === 'HIGH').length,
    };
  }, [cards, topologyData]);

  useEffect(() => {
    const graphPane = graphPaneRef.current;
    if (!graphPane) return undefined;

    const measure = () => {
      const rect = graphPane.getBoundingClientRect();
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(0, Math.floor(rect.height));
      setGraphSize((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        window.removeEventListener('resize', measure);
      };
    }

    const observer = new ResizeObserver(() => measure());
    observer.observe(graphPane);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (viewportFrameRef.current) {
        cancelAnimationFrame(viewportFrameRef.current);
      }
    };
  }, []);

  const scheduleViewportUpdate = useCallback((callback) => {
    if (viewportFrameRef.current) {
      cancelAnimationFrame(viewportFrameRef.current);
    }

    viewportFrameRef.current = requestAnimationFrame(() => {
      viewportFrameRef.current = requestAnimationFrame(() => {
        viewportFrameRef.current = null;
        callback();
      });
    });
  }, []);

  const fitGraph = useCallback((duration = 700) => {
    const graph = fgRef.current;
    if (!graph || !isActive || graphSize.width === 0 || graphSize.height === 0) return;

    if (topologyData.nodes.length <= 1) {
      graph.centerAt(0, 0, duration);
      graph.zoom(1.5, duration);
      return;
    }

    try {
      const padding = selectedNode ? Math.min(Math.max(graphSize.width * 0.08, 88), 144) : 84;
      graph.zoomToFit(duration, padding);
    } catch (error) {
      // noop
    }
  }, [graphSize.height, graphSize.width, isActive, selectedNode, topologyData.nodes.length]);

  const focusNode = useCallback((node, duration = 700) => {
    const graph = fgRef.current;
    if (!graph || !node || typeof node.x !== 'number' || typeof node.y !== 'number') return;

    const targetZoom = node.isRoot ? 1.55 : ['service', 'endpoint', 'technology'].includes(node.data_type) ? 2.15 : 1.9;
    graph.centerAt(node.x, node.y, duration);
    graph.zoom(targetZoom, duration);
  }, []);

  useEffect(() => {
    const graph = fgRef.current;
    if (!graph || graphSize.width === 0 || graphSize.height === 0) return;

    const chargeForce = graph.d3Force('charge');
    if (chargeForce?.strength) {
      chargeForce.strength((node) => {
        if (node.isRoot) return -2200;
        if (node.isFindingNode) return -450;
        if (node.highestSeverity === 'CRITICAL') return -1100;
        if (node.highestSeverity) return -920;
        if (['service', 'endpoint', 'technology'].includes(node.data_type)) return -760;
        return -560;
      });
      if (chargeForce.distanceMax) {
        chargeForce.distanceMax(1600);
      }
    }

    const linkForce = graph.d3Force('link');
    if (linkForce?.distance) {
      linkForce.distance((link) => link.distance || (link.isRootLink ? 260 : link.isFindingLink ? 110 : 185));
      if (linkForce.strength) {
        linkForce.strength((link) => link.isRootLink ? 0.14 : link.isFindingLink ? 0.6 : 0.42);
      }
      if (linkForce.iterations) {
        linkForce.iterations(2);
      }
    }

    if (typeof graph.d3VelocityDecay === 'function') {
      graph.d3VelocityDecay(0.28);
    }
    if (typeof graph.d3AlphaDecay === 'function') {
      graph.d3AlphaDecay(0.035);
    }
    if (typeof graph.d3ReheatSimulation === 'function') {
      graph.d3ReheatSimulation();
    }
  }, [graphSize.height, graphSize.width, topologyData]);

  useEffect(() => {
    if (!isActive || graphSize.width === 0 || graphSize.height === 0) return;

    const focusedNode = selectedNode
      ? topologyData.nodes.find((node) => node.id === selectedNode.id) || selectedNode
      : null;

    scheduleViewportUpdate(() => {
      if (focusedNode) {
        focusNode(focusedNode, 650);
      } else {
        fitGraph(800);
      }
    });
  }, [fitGraph, focusNode, graphSize.height, graphSize.width, isActive, scheduleViewportUpdate, selectedNode, topologyData]);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
    focusNode(node);
  }, [focusNode]);

  const handleEditClick = () => {
    if (!selectedNode || !selectedNode.originalItem) return;
    setEditFormData({
      name: selectedNode.name,
      details: selectedNode.details || {},
      discovered_in_phase: selectedNode.discovered_in_phase || null,
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async () => {
    if (!editFormData.name.trim()) return alert('Name is required');
    try {
      setIsSubmitting(true);
      await apiClient.patch(`/recon/${selectedNode.id}`, {
        data_type: selectedNode.data_type,
        name: editFormData.name.trim(),
        details: editFormData.details,
        discovered_in_phase: editFormData.discovered_in_phase || null,
      });
      setShowEditModal(false);
      setSelectedNode(null);
      onUpdate();
    } catch (error) {
      console.error('Failed to update:', error);
      alert('Failed to update.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const shouldRenderGraph = graphSize.width > 0 && graphSize.height > 0;
  const totalNodes = topologyData.nodes.length;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[#020617] shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_40px_120px_rgba(2,6,23,0.75)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(248,113,113,0.12),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,1))]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px)] [background-size:26px_26px]" />
      <div className="relative border-b border-cyan-400/10 bg-slate-950/70 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-300/80">Operator View</div>
            <h3 className="mt-2 text-xl font-semibold text-slate-50">{assessmentName} topology console</h3>
            <p className="mt-1 text-sm text-slate-400">Calibrated recon map with responsive viewport fitting and risk-aware graph spacing.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-cyan-400/10 bg-slate-950/70 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Nodes</div>
              <div className="mt-1 text-lg font-semibold text-cyan-200">{topologyStats.nodes}</div>
            </div>
            <div className="rounded-2xl border border-cyan-400/10 bg-slate-950/70 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Links</div>
              <div className="mt-1 text-lg font-semibold text-cyan-200">{topologyStats.links}</div>
            </div>
            <div className="rounded-2xl border border-red-400/10 bg-slate-950/70 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Critical</div>
              <div className="mt-1 text-lg font-semibold text-red-300">{topologyStats.critical}</div>
            </div>
            <div className="rounded-2xl border border-orange-400/10 bg-slate-950/70 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Findings</div>
              <div className="mt-1 text-lg font-semibold text-orange-200">{topologyStats.findings}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex overflow-hidden" style={{ height: 'clamp(36rem, 74vh, 56rem)' }}>
        <div ref={graphPaneRef} className="relative min-w-0 flex-1 overflow-hidden">
          <div className="absolute left-5 top-5 z-10 flex max-w-[240px] flex-col gap-2 rounded-2xl border border-cyan-400/10 bg-slate-950/85 p-4 shadow-2xl backdrop-blur-md">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Legend</div>
            {[
              { label: 'Internal IP', color: '#22c55e' },
              { label: 'External / Endpoint', color: '#f43f5e' },
              { label: 'Domains', color: '#8b5cf6' },
              { label: 'Services', color: '#f59e0b' },
              { label: 'Technology', color: '#eab308' },
              { label: 'Critical Overlay', color: '#ff4d6d' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs text-slate-300">
                <span className="h-3 w-3 rounded-full shadow-[0_0_12px_currentColor]" style={{ backgroundColor: item.color, color: item.color }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          {!shouldRenderGraph && (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Calibrating topology viewport...
            </div>
          )}

          {shouldRenderGraph && (
            <ForceGraph2D
              ref={fgRef}
              width={graphSize.width}
              height={graphSize.height}
              graphData={topologyData}
              backgroundColor="#020617"
              linkColor={(link) => link.color || '#1e293b'}
              linkWidth={(link) => link.isFindingLink ? 3 : (link.color && link.color !== '#1e293b' ? 2.4 : 1.15)}
              linkDirectionalParticles={(link) => link.isFindingLink ? 4 : (link.color && link.color !== '#1e293b' ? 2 : 0)}
              linkDirectionalParticleColor={(link) => link.color || '#22d3ee'}
              linkDirectionalParticleWidth={(link) => link.isFindingLink ? 3 : 2}
              onNodeClick={handleNodeClick}
              cooldownTicks={160}
              warmupTicks={32}
              nodeRelSize={1}
              nodeVal="val"
              enableNodeDrag={true}
              nodeCanvasObjectMode={() => 'after'}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const radius = node.val || 6;
                const glowColor = node.highestSeverity ? getNodeColor(node.data_type, node.name, node.highestSeverity) : node.color;
                const label = node.name;
                const fontSize = Math.max(11 / Math.max(globalScale, 0.65), 3.2);
                const shouldShowLabel =
                  totalNodes <= 18 ||
                  node.isRoot ||
                  node.highestSeverity ||
                  node.findingCount > 0 ||
                  globalScale > 1.35;

                ctx.save();

                if (node.isFindingNode) {
                  ctx.beginPath();
                  ctx.fillStyle = node.color;
                  ctx.shadowColor = glowColor;
                  ctx.shadowBlur = node.highestSeverity === 'CRITICAL' ? 35 : 20;

                  const s = radius * 1.3;
                  ctx.moveTo(node.x, node.y - s);
                  ctx.lineTo(node.x + s, node.y);
                  ctx.lineTo(node.x, node.y + s);
                  ctx.lineTo(node.x - s, node.y);
                  ctx.closePath();
                  ctx.fill();

                  ctx.lineWidth = 1.5;
                  ctx.strokeStyle = '#fff';
                  ctx.stroke();

                  if (shouldShowLabel) {
                    ctx.font = `bold ${fontSize * 1.1}px Sans-Serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#f87171';
                    ctx.shadowBlur = 0;
                    ctx.fillText(label, node.x, node.y + getCollisionRadius(node) * 0.55);
                  }
                  ctx.restore();
                  return;
                }

                ctx.beginPath();
                ctx.fillStyle = node.color;
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = node.highestSeverity ? 30 : 18;
                ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                ctx.fill();

                if (node.highestSeverity) {
                  ctx.beginPath();
                  ctx.lineWidth = 1.7;
                  ctx.strokeStyle = glowColor;
                  ctx.arc(node.x, node.y, radius + 4.5, 0, 2 * Math.PI, false);
                  ctx.stroke();
                }

                if (node.findingCount > 0) {
                  ctx.beginPath();
                  ctx.fillStyle = '#020617';
                  ctx.arc(node.x + radius, node.y - radius, 7.5, 0, 2 * Math.PI, false);
                  ctx.fill();
                  ctx.lineWidth = 1;
                  ctx.strokeStyle = glowColor;
                  ctx.stroke();
                  ctx.fillStyle = '#e2e8f0';
                  ctx.font = `${Math.max(8.5 / Math.max(globalScale, 0.75), 3)}px Sans-Serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(String(node.findingCount), node.x + radius, node.y - radius);
                }

                if (shouldShowLabel) {
                  ctx.font = `${fontSize}px Sans-Serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillStyle = '#dbeafe';
                  ctx.shadowBlur = 0;
                  ctx.fillText(label, node.x, node.y + getCollisionRadius(node) * 0.45);
                }

                ctx.restore();
              }}
            />
          )}
        </div>

        {selectedNode && (
          <div className="flex w-[320px] min-w-[260px] max-w-[40%] shrink-0 flex-col border-l border-cyan-400/10 bg-slate-950/92 backdrop-blur-xl shadow-[0_0_0_1px_rgba(34,211,238,0.06),-20px_0_80px_rgba(2,6,23,0.65)] md:w-[340px] xl:w-[380px]">
            <div className="flex items-center justify-between border-b border-cyan-400/10 px-5 py-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/80">Focused Asset</div>
                <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-100">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedNode.color }} />
                  {selectedNode.name}
                </h3>
              </div>
              <button onClick={() => setSelectedNode(null)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm text-slate-300">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-cyan-400/10 bg-slate-900/70 p-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Type</div>
                  <div className="mt-2 font-medium text-slate-100">{selectedNode.data_type}</div>
                </div>
                <div className="rounded-2xl border border-cyan-400/10 bg-slate-900/70 p-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Highest Risk</div>
                  <div className="mt-2 font-medium" style={{ color: selectedNode.highestSeverity ? SEVERITY_COLORS[selectedNode.highestSeverity] : '#e2e8f0' }}>
                    {selectedNode.highestSeverity || 'None'}
                  </div>
                </div>
              </div>

              {!!selectedNode.discovered_in_phase && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Discovery Phase</div>
                  <div className="mt-2 rounded-2xl border border-cyan-400/10 bg-slate-900/70 px-4 py-3 text-slate-100">{selectedNode.discovered_in_phase}</div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl border border-cyan-400/10 bg-slate-900/70 p-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Findings</div>
                  <div className="mt-2 text-lg font-semibold text-red-300">{selectedNode.findingCount || 0}</div>
                </div>
                <div className="rounded-2xl border border-cyan-400/10 bg-slate-900/70 p-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Observ.</div>
                  <div className="mt-2 text-lg font-semibold text-cyan-200">{selectedNode.observationCount || 0}</div>
                </div>
                <div className="rounded-2xl border border-cyan-400/10 bg-slate-900/70 p-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Info</div>
                  <div className="mt-2 text-lg font-semibold text-slate-200">{selectedNode.infoCount || 0}</div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  <Activity className="h-4 w-4 text-cyan-300" />
                  Asset details
                </div>
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-cyan-400/10 bg-slate-900/80 p-4 text-xs text-slate-200">
                  {JSON.stringify(selectedNode.details || {}, null, 2)}
                </pre>
              </div>

              <div>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  <Shield className="h-4 w-4 text-red-300" />
                  Related findings
                </div>
                <div className="mt-3 space-y-3">
                  {selectedNode.relatedCards?.length ? selectedNode.relatedCards.map((card) => (
                    <div key={card.id} className="rounded-2xl border border-cyan-400/10 bg-slate-900/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-100">{card.title}</div>
                          <div className="mt-1 text-xs text-slate-400">{card.card_type} {card.target_service ? `· ${card.target_service}` : ''}</div>
                        </div>
                        {card.severity && (
                          <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-950" style={{ backgroundColor: SEVERITY_COLORS[card.severity] || '#94a3b8' }}>
                            {card.severity}
                          </span>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-cyan-400/10 bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-500">
                      No related findings mapped to this node yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedNode.originalItem && !selectedNode.isFindingNode && (
              <div className="border-t border-cyan-400/10 px-5 py-4">
                <button onClick={handleEditClick} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
                  <Edit2 className="h-4 w-4" />
                  Edit recon asset
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <UnifiedModal isOpen={showEditModal} onClose={() => !isSubmitting && setShowEditModal(false)} title={`Edit ${selectedNode?.data_type}`} onSubmit={handleEditSubmit} isSubmitting={isSubmitting} size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Name <span className="text-red-500 dark:text-red-400">*</span></label>
            <input type="text" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Details (JSON)</label>
            <textarea value={typeof editFormData.details === 'string' ? editFormData.details : JSON.stringify(editFormData.details, null, 2)} onChange={(e) => { const val = e.target.value; try { setEditFormData({ ...editFormData, details: JSON.parse(val) }); } catch { setEditFormData({ ...editFormData, details: val }); } }} rows={6} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100" />
          </div>
        </div>
      </UnifiedModal>
    </div>
  );
};

export default ReconTopologyView;
