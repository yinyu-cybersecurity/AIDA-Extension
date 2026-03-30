import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useWebSocket } from "../../hooks/useWebSocket";
import apiClient from "../../services/api";
import { X, Maximize2, Minimize2, Send, Bot, RefreshCw } from "lucide-react";

const TERMINAL_BOUNDS = {
  width: 640,
  height: 460,
  minWidth: 420,
  minHeight: 300,
};

const STATUS_LABELS = {
  idle: "Ready",
  connecting: "Linking",
  thinking: "Thinking",
  executing: "Executing",
  error: "Attention",
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getTranscriptEntryKey = (entry) => {
  if (entry?.id) {
    return `persisted:${entry.id}`;
  }

  if (entry?.sequence_number) {
    return `sequence:${entry.sequence_number}`;
  }

  return `fallback:${entry?.event_type || 'unknown'}:${entry?.tool_name || ''}:${entry?.content || ''}`;
};

const normalizeTranscriptEntry = (entry = {}, fallbackEventType = null) => ({
  id: entry.id ?? null,
  sequence_number: entry.sequence_number ?? null,
  role: entry.role || (fallbackEventType === "agent_input" ? "user" : entry.tool || entry.tool_name ? "tool" : "assistant"),
  event_type: entry.event_type || fallbackEventType || "agent_output",
  content: entry.content ?? entry.input ?? entry.output ?? entry.error ?? entry.command ?? entry.thought ?? entry.message ?? "",
  tool_name: entry.tool_name || entry.tool || null,
  created_at: entry.created_at ?? null,
});

const AITerminal = ({ assessmentId, assessmentName = "Assessment", isOpen = true, onClose }) => {
  const terminalRef = useRef(null);
  const panelRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const dragStateRef = useRef(null);
  const dragFrameRef = useRef(null);
  const pendingPositionRef = useRef(null);
  const hasBootedRef = useRef(false);
  const historyLoadedRef = useRef(false);
  const renderedEntryKeysRef = useRef(new Set());
  const [input, setInput] = useState("");
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [agentState, setAgentState] = useState("connecting");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size] = useState({ width: TERMINAL_BOUNDS.width, height: TERMINAL_BOUNDS.height });
  const [transcriptEntries, setTranscriptEntries] = useState([]);
  const { isConnected, lastError, send, subscribe } = useWebSocket(assessmentId);

  const panelStyle = useMemo(() => {
    if (isMaximized) {
      return {
        top: 16,
        left: 16,
        right: 16,
        bottom: 16,
        width: "auto",
        height: "auto",
      };
    }

    return {
      top: position.y,
      left: position.x,
      width: size.width,
      height: size.height,
    };
  }, [isMaximized, position, size.height, size.width]);

  const writeLine = useCallback((text = "", color = "37") => {
    xtermRef.current?.write(`\r\n\x1b[1;${color}m${text}\x1b[0m\r\n`);
  }, []);

  const fitTerminal = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitAddonRef.current?.fit());
    });
  }, []);

  const renderBanner = useCallback(() => {
    if (!xtermRef.current) return;
    xtermRef.current.writeln("\x1b[1;36mAIDA AI TERMINAL\x1b[0m");
    xtermRef.current.writeln(`\x1b[1;34mContext: ${assessmentName} #${assessmentId}\x1b[0m`);
    xtermRef.current.writeln("\x1b[1;30mPrecision mode enabled: assessment context + payload-path workflow\x1b[0m");
  }, [assessmentId, assessmentName]);

  const renderTranscriptEntry = useCallback((entry) => {
    const text = entry?.content || "";

    switch (entry?.event_type) {
      case "agent_input":
        if (text) {
          xtermRef.current?.write(`\x1b[1;37m${text}\x1b[0m\r\n`);
        }
        break;
      case "agent_thought":
        writeLine(`[thinking] ${text || "Thinking..."}`, "36");
        break;
      case "agent_exec":
        writeLine(`[exec] ${text || `Executing ${entry?.tool_name || "task"}...`}`, "33");
        break;
      case "agent_error":
        writeLine(`[error] ${text || "Unknown error"}`, "31");
        break;
      case "agent_done":
        writeLine(`[done] ${text || "Task completed"}`, "32");
        xtermRef.current?.write("\x1b[1;37m>\x1b[0m ");
        break;
      case "agent_output":
      default:
        if (text) {
          xtermRef.current?.write(`\r\n${text}\r\n`);
        }
        break;
    }
  }, [writeLine]);

  const rebuildTranscript = useCallback((entries = []) => {
    if (!xtermRef.current) return;

    xtermRef.current.reset();
    renderBanner();
    renderedEntryKeysRef.current = new Set();

    entries.forEach((entry) => {
      const normalizedEntry = normalizeTranscriptEntry(entry);
      renderedEntryKeysRef.current.add(getTranscriptEntryKey(normalizedEntry));
      renderTranscriptEntry(normalizedEntry);
    });

    fitTerminal();
  }, [fitTerminal, renderBanner, renderTranscriptEntry]);

  const appendTranscriptEntry = useCallback((entry) => {
    const normalizedEntry = normalizeTranscriptEntry(entry);
    const entryKey = getTranscriptEntryKey(normalizedEntry);

    if (renderedEntryKeysRef.current.has(entryKey)) {
      return;
    }

    renderedEntryKeysRef.current.add(entryKey);
    setTranscriptEntries((current) => [...current, normalizedEntry]);
    renderTranscriptEntry(normalizedEntry);
  }, [renderTranscriptEntry]);

  useEffect(() => {
    historyLoadedRef.current = false;
    renderedEntryKeysRef.current = new Set();
    setTranscriptEntries([]);
  }, [assessmentId]);

  useEffect(() => {
    if (!isOpen) return;

    const nextX = Math.max(window.innerWidth - size.width - 24, 16);
    const nextY = Math.max(window.innerHeight - size.height - 24, 16);
    setPosition({ x: nextX, y: nextY });
  }, [isOpen, size.height, size.width]);

  useEffect(() => {
    if (!isOpen || !hasBootedRef.current) return;
    fitTerminal();
  }, [fitTerminal, isOpen]);

  useEffect(() => {
    if (isOpen) return;

    dragStateRef.current = null;
    pendingPositionRef.current = null;
    setIsDragging(false);
    document.body.style.userSelect = "";

    if (dragFrameRef.current) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !terminalRef.current) return;

    if (!xtermRef.current) {
      xtermRef.current = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        lineHeight: 1.25,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "#050816",
          foreground: "#d7e1ff",
          cursor: "#67e8f9",
          selectionBackground: "#1d4ed8",
          black: "#0f172a",
          blue: "#60a5fa",
          brightBlue: "#93c5fd",
          brightCyan: "#67e8f9",
          brightGreen: "#86efac",
          brightRed: "#fca5a5",
          brightYellow: "#fde68a",
          cyan: "#22d3ee",
          green: "#4ade80",
          red: "#f87171",
          yellow: "#facc15",
        },
        convertEol: true,
        scrollback: 10000,
      });

      fitAddonRef.current = new FitAddon();
      xtermRef.current.loadAddon(fitAddonRef.current);
      xtermRef.current.open(terminalRef.current);
      renderBanner();
      fitTerminal();
      hasBootedRef.current = true;
    }
  }, [fitTerminal, isOpen, renderBanner]);

  useEffect(() => {
    if (!isOpen || !xtermRef.current || historyLoadedRef.current) return;

    let cancelled = false;

    const loadHistory = async () => {
      setIsHistoryLoading(true);
      setAgentState((state) => (state === "error" ? state : "connecting"));

      try {
        const response = await apiClient.get(`/assessments/${assessmentId}/ai-history`);
        if (cancelled) return;

        const historyEntries = (response.data || []).map((entry) => normalizeTranscriptEntry(entry));
        setTranscriptEntries(historyEntries);
        rebuildTranscript(historyEntries);
        historyLoadedRef.current = true;
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to restore AI history:", error);
          rebuildTranscript([]);
          historyLoadedRef.current = true;
        }
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [assessmentId, isOpen, rebuildTranscript]);

  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      if (isMaximized) {
        setPosition({ x: 16, y: 16 });
      } else {
        setPosition((current) => ({
          x: clamp(current.x, 16, Math.max(16, window.innerWidth - size.width - 16)),
          y: clamp(current.y, 16, Math.max(16, window.innerHeight - size.height - 16)),
        }));
      }
      fitTerminal();
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [fitTerminal, isMaximized, isOpen, size.height, size.width]);

  useEffect(() => {
    fitTerminal();
  }, [fitTerminal, isMaximized, panelStyle.height, panelStyle.width, transcriptEntries.length]);

  useEffect(() => {
    if (!isOpen || !subscribe) return;

    const unsubInput = subscribe("agent_input", (data = {}) => {
      appendTranscriptEntry(normalizeTranscriptEntry(data, "agent_input"));
    });

    const unsubThought = subscribe("agent_thought", (data = {}) => {
      setAgentState("thinking");
      appendTranscriptEntry(normalizeTranscriptEntry(data, "agent_thought"));
    });

    const unsubExec = subscribe("agent_exec", (data = {}) => {
      setAgentState("executing");
      appendTranscriptEntry(normalizeTranscriptEntry(data, "agent_exec"));
    });

    const unsubOutput = subscribe("agent_output", (data = {}) => {
      appendTranscriptEntry(normalizeTranscriptEntry(data, "agent_output"));
    });

    const unsubResult = subscribe("agent_done", (data = {}) => {
      setAgentState("idle");
      appendTranscriptEntry(normalizeTranscriptEntry(data, "agent_done"));
    });

    const handleError = (data = {}) => {
      setAgentState("error");
      appendTranscriptEntry(normalizeTranscriptEntry(data, "agent_error"));
    };

    const unsubAgentError = subscribe("agent_error", handleError);
    const unsubError = subscribe("error", handleError);

    return () => {
      unsubInput?.();
      unsubThought?.();
      unsubExec?.();
      unsubOutput?.();
      unsubResult?.();
      unsubAgentError?.();
      unsubError?.();
    };
  }, [appendTranscriptEntry, isOpen, subscribe]);

  useEffect(() => {
    if (!hasBootedRef.current || !xtermRef.current) return;

    if (isConnected) {
      setAgentState((state) => (state === "connecting" ? "idle" : state));
      writeLine("[link] Connected to assessment event stream", "32");
      xtermRef.current.write("\x1b[1;37m>\x1b[0m ");
      return;
    }

    setAgentState("connecting");
  }, [isConnected, writeLine]);

  useEffect(() => {
    if (!lastError) return;
    setAgentState("error");
  }, [lastError]);

  useEffect(() => {
    if (!isOpen || isMaximized) return undefined;

    const flushPendingPosition = () => {
      dragFrameRef.current = null;
      if (!pendingPositionRef.current) return;
      setPosition(pendingPositionRef.current);
      pendingPositionRef.current = null;
    };

    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      pendingPositionRef.current = {
        x: clamp(event.clientX - dragState.offsetX, 16, Math.max(16, window.innerWidth - size.width - 16)),
        y: clamp(event.clientY - dragState.offsetY, 16, Math.max(16, window.innerHeight - size.height - 16)),
      };

      if (!dragFrameRef.current) {
        dragFrameRef.current = requestAnimationFrame(flushPendingPosition);
      }
    };

    const handlePointerUp = () => {
      if (pendingPositionRef.current) {
        setPosition(pendingPositionRef.current);
      }

      dragStateRef.current = null;
      pendingPositionRef.current = null;
      setIsDragging(false);
      document.body.style.userSelect = "";

      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };
  }, [isMaximized, isOpen, size.height, size.width]);

  const startDrag = useCallback((event) => {
    if (isMaximized) return;

    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragStateRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setIsDragging(true);
    document.body.style.userSelect = "none";
  }, [isMaximized]);

  const handleToggleMaximize = useCallback(() => {
    setIsMaximized((current) => !current);
  }, []);

  const handleSend = useCallback((event) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || !isConnected || agentState === "thinking" || agentState === "executing") {
      return;
    }

    send("agent_input", { input: message });
    setInput("");
    setAgentState("thinking");
  }, [agentState, input, isConnected, send]);

  const showLoadingOverlay = isHistoryLoading || (!isConnected && transcriptEntries.length === 0);

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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_38%),linear-gradient(180deg,rgba(37,99,235,0.12),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:22px_22px]" />

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
              <span>AIDA Terminal</span>
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
              onClick={handleToggleMaximize}
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

        <div className="relative flex items-center justify-between border-b border-cyan-400/10 bg-slate-950/50 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" : "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.7)]"}`} />
            <span>{isHistoryLoading ? "Restoring chat history" : isConnected ? "WebSocket online" : "Waiting for backend link"}</span>
          </div>
          <div className="hidden md:flex items-center gap-5">
            <span>single assessment bound</span>
            <span>payload path aware</span>
            <span>{transcriptEntries.length} persisted events</span>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden p-3">
          <div className="h-full rounded-xl border border-slate-800/80 bg-[#020617]/90 p-2 shadow-inner shadow-cyan-500/5">
            <div ref={terminalRef} className="h-full w-full" />
          </div>

          {showLoadingOverlay && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-cyan-400/10 bg-slate-950/90 px-6 py-5 shadow-2xl">
                <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
                <span className="text-sm text-slate-300">{isHistoryLoading ? "Restoring previous AI session…" : "Linking terminal to backend stream…"}</span>
                <span className="text-xs text-slate-500">{window.location.origin.replace(/^http/, "ws")}/api/ws/assessment/{assessmentId}</span>
              </div>
            </div>
          )}
        </div>

        <div className="relative border-t border-cyan-400/10 bg-slate-950/70 p-3">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={!isConnected || agentState === "thinking" || agentState === "executing"}
              placeholder={isConnected ? "Ask AIDA to continue the last operation or start a new one..." : "Connecting..."}
              className="flex-1 rounded-xl border border-cyan-400/10 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isConnected || !input.trim() || agentState === "thinking" || agentState === "executing"}
              className="rounded-xl bg-cyan-500 px-4 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AITerminal;
