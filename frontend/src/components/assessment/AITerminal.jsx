import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import apiClient from "../../services/api";
import { X, Maximize2, Minimize2, Send, Bot, Trash2, StopCircle, ChevronDown, ChevronRight, Terminal, Wrench } from "lucide-react";

const TERMINAL_BOUNDS = { width: 680, height: 520, minWidth: 420, minHeight: 320 };

const STATUS_LABELS = {
  idle: "Ready",
  connecting: "Linking",
  thinking: "Thinking",
  executing: "Executing",
  error: "Attention",
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getEntryKey = (entry) => {
  if (entry?.id) return `id:${entry.id}`;
  if (entry?.sequence_number) return `seq:${entry.sequence_number}`;
  return `fb:${entry?.event_type}:${entry?.tool_name}:${entry?.content}`;
};

const normalizeEntry = (entry = {}, fallbackType = null) => ({
  id: entry.id ?? null,
  sequence_number: entry.sequence_number ?? null,
  role: entry.role || (fallbackType === "agent_input" ? "user" : "assistant"),
  event_type: entry.event_type || fallbackType || "agent_output",
  content: entry.content ?? entry.input ?? entry.output ?? entry.error ?? entry.command ?? entry.thought ?? entry.message ?? "",
  tool_name: entry.tool_name || entry.tool || null,
  arguments: entry.arguments || null,
  created_at: entry.created_at ?? null,
});

// Simple markdown renderer: bold, inline code, code blocks, line breaks
const SimpleMarkdown = ({ children }) => {
  if (!children) return null;
  const lines = children.split("\n");
  const rendered = [];
  let inCode = false;
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (inCode) {
        rendered.push(
          <pre key={i} className="mt-1 overflow-x-auto rounded bg-slate-900/80 p-2 font-mono text-xs text-slate-200">
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    // Inline formatting
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={j} className="rounded bg-slate-700/60 px-1 py-0.5 font-mono text-xs text-cyan-300">{part.slice(1, -1)}</code>;
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      return part;
    });
    rendered.push(<p key={i} className="mb-1 last:mb-0">{parts}</p>);
  }
  return <>{rendered}</>;
};
const ToolBlock = ({ entry }) => {
  const [open, setOpen] = useState(false);
  const isExec = entry.event_type === "agent_exec";
  const isOutput = entry.event_type === "agent_output" && entry.tool_name;
  const isError = entry.event_type === "agent_error" && entry.tool_name;

  const label = isExec
    ? `⚙ ${entry.tool_name}`
    : isOutput
    ? `✓ ${entry.tool_name}`
    : `✗ ${entry.tool_name}`;

  const borderColor = isError
    ? "border-red-500/30"
    : isExec
    ? "border-yellow-500/30"
    : "border-emerald-500/30";

  const labelColor = isError
    ? "text-red-400"
    : isExec
    ? "text-yellow-300"
    : "text-emerald-400";

  return (
    <div className={`my-1 rounded-lg border ${borderColor} bg-slate-900/60 text-xs font-mono`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 ${labelColor} hover:bg-slate-800/40`}
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span>{label}</span>
      </button>
      {open && (
        <div className="border-t border-slate-700/50 px-3 py-2 text-slate-300 whitespace-pre-wrap break-all">
          {entry.arguments && (
            <div className="mb-2 text-slate-400">
              <span className="text-slate-500">args: </span>
              {JSON.stringify(entry.arguments, null, 2)}
            </div>
          )}
          {entry.content && <div>{entry.content}</div>}
        </div>
      )}
    </div>
  );
};

// Collapsible tools panel
const ToolsPanel = ({ tools, loading }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative border-b border-cyan-400/10 bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-slate-400 hover:text-cyan-300 transition-colors"
      >
        <Wrench className="h-3 w-3 shrink-0" />
        <span>Available Tools</span>
        <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
          {loading ? "…" : tools.length}
        </span>
        <span className="ml-auto">{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</span>
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto px-4 pb-3 grid grid-cols-1 gap-1">
          {loading ? (
            <p className="text-xs text-slate-500 py-1">Loading tools…</p>
          ) : tools.map((t) => (
            <div key={t.name} className="rounded-lg border border-slate-700/40 bg-slate-900/60 px-3 py-1.5">
              <span className="font-mono text-xs text-cyan-300">{t.name}</span>
              <p className="mt-0.5 text-[11px] text-slate-400 leading-snug line-clamp-2">{t.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Single chat message bubble
const ChatMessage = ({ entry }) => {
  const isUser = entry.event_type === "agent_input";
  const isThought = entry.event_type === "agent_thought";
  const isDone = entry.event_type === "agent_done";
  const isTool = entry.tool_name && (entry.event_type === "agent_exec" || entry.event_type === "agent_output" || (entry.event_type === "agent_error" && entry.tool_name));

  if (isTool) return <ToolBlock entry={entry} />;

  if (isThought) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-cyan-400/60 italic">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400/50 animate-pulse" />
        {entry.content || "Thinking..."}
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="py-1 text-center text-xs text-slate-500">
        {entry.content?.includes("Cancelled") ? "⊘ Cancelled" : "✓ Done"}
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end mb-2">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-cyan-600/80 px-4 py-2 text-sm text-white shadow">
          {entry.content}
        </div>
      </div>
    );
  }

  // agent_output or agent_error (no tool_name)
  const isError = entry.event_type === "agent_error";
  return (
    <div className="flex justify-start mb-2">
      <div className={`max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-2 text-sm shadow ${isError ? "bg-red-900/40 text-red-300 border border-red-500/20" : "bg-slate-800/80 text-slate-100"}`}>
        <SimpleMarkdown>{entry.content}</SimpleMarkdown>
      </div>
    </div>
  );
};

const AITerminal = ({ assessmentId, assessmentName = "Assessment", isOpen = true, onClose }) => {
  const panelRef = useRef(null);
  const messagesEndRef = useRef(null);
  const dragStateRef = useRef(null);
  const dragFrameRef = useRef(null);
  const pendingPositionRef = useRef(null);
  const historyLoadedRef = useRef(false);
  const seenKeysRef = useRef(new Set());

  const [input, setInput] = useState("");
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [agentState, setAgentState] = useState("connecting");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size] = useState({ width: TERMINAL_BOUNDS.width, height: TERMINAL_BOUNDS.height });
  const [entries, setEntries] = useState([]);
  const [tools, setTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);

  const { isConnected, lastError, send, subscribe } = useWebSocket(assessmentId);

  const panelStyle = useMemo(() => {
    if (isMaximized) return { top: 16, left: 16, right: 16, bottom: 16, width: "auto", height: "auto" };
    return { top: position.y, left: position.x, width: size.width, height: size.height };
  }, [isMaximized, position, size]);

  const appendEntry = useCallback((entry) => {
    const key = getEntryKey(entry);
    if (seenKeysRef.current.has(key)) return;
    seenKeysRef.current.add(key);
    setEntries((prev) => [...prev, entry]);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  // Reset on assessment change
  useEffect(() => {
    historyLoadedRef.current = false;
    seenKeysRef.current = new Set();
    setEntries([]);
  }, [assessmentId]);

  // Initial position
  useEffect(() => {
    if (!isOpen) return;
    const nextX = Math.max(window.innerWidth - size.width - 24, 16);
    const nextY = Math.max(window.innerHeight - size.height - 24, 16);
    setPosition({ x: nextX, y: nextY });
  }, [isOpen, size.height, size.width]);

  // Load history
  useEffect(() => {
    if (!isOpen || historyLoadedRef.current) return;
    let cancelled = false;

    const load = async () => {
      setIsHistoryLoading(true);
      try {
        const res = await apiClient.get(`/assessments/${assessmentId}/ai-history`);
        if (cancelled) return;
        const normalized = (res.data || []).map((e) => normalizeEntry(e));
        seenKeysRef.current = new Set(normalized.map(getEntryKey));
        setEntries(normalized);
        historyLoadedRef.current = true;
      } catch {
        if (!cancelled) historyLoadedRef.current = true;
      } finally {
        if (!cancelled) setIsHistoryLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [assessmentId, isOpen]);

  // Load tool list once on first open
  useEffect(() => {
    if (!isOpen || tools.length > 0) return;
    let cancelled = false;
    setToolsLoading(true);
    apiClient.get("/assessments/ai-tools")
      .then((res) => { if (!cancelled) setTools(res.data || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setToolsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, tools.length]);

  // WebSocket subscriptions
  useEffect(() => {
    if (!isOpen || !subscribe) return;

    const unsubs = [
      subscribe("agent_input", (d = {}) => appendEntry(normalizeEntry(d, "agent_input"))),
      subscribe("agent_thought", (d = {}) => { setAgentState("thinking"); appendEntry(normalizeEntry(d, "agent_thought")); }),
      subscribe("agent_exec", (d = {}) => { setAgentState("executing"); appendEntry(normalizeEntry(d, "agent_exec")); }),
      subscribe("agent_output", (d = {}) => appendEntry(normalizeEntry(d, "agent_output"))),
      subscribe("agent_done", (d = {}) => { setAgentState("idle"); appendEntry(normalizeEntry(d, "agent_done")); }),
      subscribe("agent_error", (d = {}) => { setAgentState("error"); appendEntry(normalizeEntry(d, "agent_error")); }),
      subscribe("error", (d = {}) => { setAgentState("error"); appendEntry(normalizeEntry(d, "agent_error")); }),
    ];

    return () => unsubs.forEach((u) => u?.());
  }, [appendEntry, isOpen, subscribe]);

  // Connection state
  useEffect(() => {
    if (isConnected) setAgentState((s) => s === "connecting" ? "idle" : s);
    else setAgentState("connecting");
  }, [isConnected]);

  useEffect(() => { if (lastError) setAgentState("error"); }, [lastError]);

  // Drag cleanup on close
  useEffect(() => {
    if (isOpen) return;
    dragStateRef.current = null;
    pendingPositionRef.current = null;
    setIsDragging(false);
    document.body.style.userSelect = "";
    if (dragFrameRef.current) { cancelAnimationFrame(dragFrameRef.current); dragFrameRef.current = null; }
  }, [isOpen]);

  // Window resize
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => {
      if (!isMaximized) {
        setPosition((cur) => ({
          x: clamp(cur.x, 16, Math.max(16, window.innerWidth - size.width - 16)),
          y: clamp(cur.y, 16, Math.max(16, window.innerHeight - size.height - 16)),
        }));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMaximized, isOpen, size.height, size.width]);

  // Drag handlers
  useEffect(() => {
    if (!isOpen || isMaximized) return;

    const flush = () => {
      dragFrameRef.current = null;
      if (!pendingPositionRef.current) return;
      setPosition(pendingPositionRef.current);
      pendingPositionRef.current = null;
    };

    const onMove = (e) => {
      if (!dragStateRef.current) return;
      pendingPositionRef.current = {
        x: clamp(e.clientX - dragStateRef.current.offsetX, 16, Math.max(16, window.innerWidth - size.width - 16)),
        y: clamp(e.clientY - dragStateRef.current.offsetY, 16, Math.max(16, window.innerHeight - size.height - 16)),
      };
      if (!dragFrameRef.current) dragFrameRef.current = requestAnimationFrame(flush);
    };

    const onUp = () => {
      if (pendingPositionRef.current) setPosition(pendingPositionRef.current);
      dragStateRef.current = null;
      pendingPositionRef.current = null;
      setIsDragging(false);
      document.body.style.userSelect = "";
      if (dragFrameRef.current) { cancelAnimationFrame(dragFrameRef.current); dragFrameRef.current = null; }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (dragFrameRef.current) { cancelAnimationFrame(dragFrameRef.current); dragFrameRef.current = null; }
    };
  }, [isMaximized, isOpen, size.width, size.height]);

  const startDrag = useCallback((e) => {
    if (isMaximized) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStateRef.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    setIsDragging(true);
    document.body.style.userSelect = "none";
  }, [isMaximized]);

  const handleSend = useCallback((e) => {
    e?.preventDefault();
    const msg = input.trim();
    if (!msg || !isConnected || agentState === "thinking" || agentState === "executing") return;
    send("agent_input", { input: msg });
    setInput("");
    setAgentState("thinking");
  }, [agentState, input, isConnected, send]);

  const handleStop = useCallback(() => {
    send("cancel", {});
  }, [send]);

  const handleClear = useCallback(async () => {
    try {
      await apiClient.delete(`/assessments/${assessmentId}/ai-history`);
      seenKeysRef.current = new Set();
      setEntries([]);
    } catch (err) {
      console.error("Failed to clear AI history:", err);
    }
  }, [assessmentId]);

  const isBusy = agentState === "thinking" || agentState === "executing";
  const showOverlay = isHistoryLoading || (!isConnected && entries.length === 0);

  return (
    <div
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-50 pointer-events-none ${isOpen ? "visible opacity-100" : "invisible opacity-0"}`}
    >
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
      <div
        ref={panelRef}
        style={panelStyle}
        className={`pointer-events-auto absolute flex flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#050816]/95 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_24px_80px_rgba(2,8,23,0.75)] ${isDragging ? "" : "transition-[width,height] duration-300"}`}
      >
        {/* Background decorations */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_38%),linear-gradient(180deg,rgba(37,99,235,0.12),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:22px_22px]" />

        {/* Header */}
        <div
          className="relative flex cursor-move items-center justify-between border-b border-cyan-400/10 bg-slate-950/70 px-4 py-3"
          onPointerDown={startDrag}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <div className="flex items-center gap-2 rounded-full border border-cyan-400/10 bg-cyan-400/5 px-3 py-1 text-xs uppercase tracking-[0.25em] text-cyan-200/90">
              <Bot className="h-3.5 w-3.5" />
              <span>AIDA</span>
            </div>
            <div className="hidden sm:block text-xs text-slate-400">
              {assessmentName} · #{assessmentId}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-cyan-400/10 bg-slate-900/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-100">
              {STATUS_LABELS[agentState] || STATUS_LABELS.idle}
            </div>
            <button
              onClick={handleClear}
              title="Clear chat history"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-300"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsMaximized((v) => !v)}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              type="button"
            >
              {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-300"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Status bar */}
        <div className="relative flex items-center justify-between border-b border-cyan-400/10 bg-slate-950/50 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" : "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.7)]"}`} />
            <span>{isHistoryLoading ? "Restoring chat history" : isConnected ? "WebSocket online" : "Waiting for backend link"}</span>
          </div>
          <div className="hidden md:flex items-center gap-5">
            <span>{entries.length} events</span>
          </div>
        </div>

        {/* Tools panel */}
        <ToolsPanel tools={tools} loading={toolsLoading} />

        {/* Messages area */}
        <div className="relative flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {entries.length === 0 && !showOverlay && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
              <Terminal className="h-8 w-8 opacity-30" />
              <p className="text-sm">Ask AIDA to start an operation...</p>
            </div>
          )}
          {entries.map((entry, i) => (
            <ChatMessage key={getEntryKey(entry) || i} entry={entry} />
          ))}
          <div ref={messagesEndRef} />

          {/* Loading overlay */}
          {showOverlay && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-cyan-400/10 bg-slate-950/90 px-6 py-5 shadow-2xl">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                <span className="text-sm text-slate-300">{isHistoryLoading ? "Restoring previous AI session…" : "Linking to backend stream…"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="relative border-t border-cyan-400/10 bg-slate-950/70 p-3">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!isConnected || isBusy}
              placeholder={isConnected ? "Ask AIDA to continue the last operation or start a new one..." : "Connecting..."}
              className="flex-1 rounded-xl border border-cyan-400/10 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {isBusy ? (
              <button
                type="button"
                onClick={handleStop}
                title="Stop"
                className="rounded-xl bg-red-600 px-4 text-white transition hover:bg-red-500"
              >
                <StopCircle className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!isConnected || !input.trim()}
                className="rounded-xl bg-cyan-500 px-4 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default AITerminal;
