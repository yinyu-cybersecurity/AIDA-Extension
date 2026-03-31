import { useState, useMemo } from 'react';
import { Terminal, Check, X, Clock, ChevronDown, ChevronRight, Copy, Search } from '../icons';
import { useTheme } from '../../contexts/ThemeContext';

const CommandHistory = ({ commands }) => {
  const { isOperator } = useTheme();
  const [expandedCommands, setExpandedCommands] = useState(new Set());
  const [filter, setFilter] = useState('all'); // all, success, failed
  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  const toggleCommand = (id) => {
    const newSet = new Set(expandedCommands);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedCommands(newSet);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const filteredCommands = useMemo(() => {
    let filtered = commands.filter(cmd => {
      if (filter === 'success') return cmd.success;
      if (filter === 'failed') return !cmd.success;
      return true;
    });

    if (searchTerm) {
      filtered = filtered.filter(cmd =>
        cmd.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cmd.phase?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }, [commands, filter, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredCommands.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCommands = filteredCommands.slice(startIndex, startIndex + itemsPerPage);

  const stats = {
    total: commands.length,
    success: commands.filter(c => c.success).length,
    failed: commands.filter(c => !c.success).length,
    avgTime: commands.reduce((acc, c) => acc + (c.execution_time || 0), 0) / commands.length || 0
  };

  const borderClass = isOperator ? 'border-cyan-500/20' : 'border-neutral-200 dark:border-neutral-700';
  const rowBg = isOperator ? 'bg-slate-950/40' : 'bg-white dark:bg-neutral-900';
  const rowHover = isOperator ? 'hover:bg-cyan-500/5' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800';
  const rowBorder = isOperator ? 'border-cyan-500/15' : 'border-neutral-200 dark:border-neutral-700';
  const rowBorderHover = isOperator ? 'hover:border-cyan-400/30' : 'hover:border-neutral-300 dark:hover:border-neutral-600';
  const mutedText = isOperator ? 'text-slate-400' : 'text-neutral-500 dark:text-neutral-400';
  const normalText = isOperator ? 'text-slate-100' : 'text-neutral-900 dark:text-neutral-100';
  const expandedBg = isOperator ? 'bg-slate-950/60 border-cyan-500/10' : 'bg-neutral-50/30 dark:bg-neutral-900/30 border-neutral-100 dark:border-neutral-800';
  const codeBg = isOperator ? 'bg-[#020617] text-slate-200' : 'bg-neutral-900 dark:bg-black text-neutral-200';
  const btnHover = isOperator ? 'hover:bg-cyan-500/10 hover:text-cyan-100 text-slate-400' : 'text-neutral-400 dark:text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-600 dark:hover:text-neutral-300';
  const inputClass = isOperator
    ? 'border-cyan-500/20 bg-slate-950/60 text-slate-100 placeholder-slate-500 focus:border-cyan-400/40'
    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:border-neutral-300 dark:focus:border-neutral-600';
  const filterActive = isOperator ? 'bg-cyan-500 text-slate-950 border-cyan-500' : 'bg-blue-500 text-white border-blue-500';
  const filterInactive = isOperator
    ? 'bg-slate-950/60 text-slate-300 border-cyan-500/20 hover:border-cyan-400/30'
    : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600';
  const paginationBtn = isOperator
    ? 'border-cyan-500/20 bg-slate-950/60 text-slate-100'
    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100';
  const selectClass = isOperator
    ? 'border-cyan-500/20 bg-slate-950/60 text-slate-100'
    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100';
  const phaseBadge = isOperator ? 'bg-slate-800 text-slate-300' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300';

  if (commands.length === 0) {
    return (
      <div className="py-8 text-center">
        <Terminal className={`w-8 h-8 mx-auto mb-3 ${isOperator ? 'text-slate-600' : 'text-neutral-300 dark:text-neutral-600'}`} />
        <h3 className={`text-sm font-medium mb-1 ${normalText}`}>No Commands Yet</h3>
        <p className={`text-xs ${mutedText}`}>
          Commands will appear here once you start executing them via Claude
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header compact avec contrôles */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            {stats.total} total • {stats.success} success • {stats.failed} failed
          </span>
        </div>

        {/* Contrôles compacts */}
        <div className="flex items-center gap-2">
          {/* Recherche */}
          <div className="relative">
            <Search className={`w-3 h-3 absolute left-2 top-1/2 transform -translate-y-1/2 ${mutedText}`} />
            <input
              type="text"
              placeholder="Search commands..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-7 pr-3 py-1 text-xs border rounded w-32 focus:outline-none ${inputClass}`}
            />
          </div>

          {/* Filtres compacts */}
          <div className="flex gap-1">
            {[
              { key: 'all', label: 'All', count: stats.total },
              { key: 'success', label: '✓', count: stats.success },
              { key: 'failed', label: '✗', count: stats.failed },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-2 py-1 text-xs rounded border transition-colors ${filter === key ? filterActive : filterInactive}`}
                title={`${label} (${count})`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Commands List Compact */}
      <div className="space-y-1">
        {paginatedCommands.map((cmd) => {
          const isExpanded = expandedCommands.has(cmd.id);

          return (
            <div key={cmd.id} id={`command-${cmd.id}`} className={`border ${rowBorder} ${rowBorderHover} rounded ${rowBg} transition-colors`}>
              {/* Command Header Compact */}
              <div
                onClick={() => toggleCommand(cmd.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCommand(cmd.id); }}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left ${rowHover} transition-colors cursor-pointer`}
              >
                {/* Status Indicator */}
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cmd.success ? 'bg-green-500' : 'bg-red-500'
                  }`} />

                {/* Command */}
                <div className="flex-1 min-w-0">
                  {cmd.command_type === 'python' ? (
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded font-mono">python</span>
                      <code className="text-xs font-mono text-gray-500 dark:text-neutral-400 truncate">
                        {(cmd.source_code?.split('\n').find(l => l.trim()) || 'python script').slice(0, 60)}
                      </code>
                    </span>
                  ) : cmd.command_type === 'http' ? (
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded font-mono">http</span>
                      <code className="text-xs font-mono text-gray-500 dark:text-neutral-400 truncate">
                        {cmd.command?.length > 60 ? cmd.command.substring(0, 60) + '...' : cmd.command}
                      </code>
                    </span>
                  ) : (
                    <code className="text-xs font-mono text-gray-900 dark:text-neutral-100 break-all">
                      {cmd.command}
                    </code>
                  )}
                </div>

                {/* Metadata Compact */}
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400 flex-shrink-0">
                  {cmd.execution_time && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {cmd.execution_time.toFixed(1)}s
                    </span>
                  )}
                  {cmd.phase && (
                    <span className={`px-1.5 py-0.5 ${phaseBadge} rounded text-xs`}>
                      {cmd.phase.replace('Phase ', 'P')}
                    </span>
                  )}
                  <span>{new Date(cmd.created_at).toLocaleTimeString()}</span>
                </div>

                {/* Status, Copy & Expand */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Copy Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent expanding when copying
                      copyToClipboard(cmd.command);
                    }}
                    className={`p-1 rounded transition-colors ${btnHover}`}
                    title="Copy command"
                  >
                    <Copy className="w-3 h-3" />
                  </button>

                  {/* Status */}
                  {cmd.success ? (
                    <Check className="w-3 h-3 text-green-600" />
                  ) : (
                    <X className="w-3 h-3 text-red-600" />
                  )}

                  {/* Expand */}
                  {isExpanded ? (
                    <ChevronDown className={`w-3 h-3 ${mutedText}`} />
                  ) : (
                    <ChevronRight className={`w-3 h-3 ${mutedText}`} />
                  )}
                </div>
              </div>

              {/* Expanded Content Compact */}
              {isExpanded && (
                <div className={`px-3 pb-3 border-t ${expandedBg}`}>
                  <div className="pt-2 space-y-2">
                    {/* Python source code block */}
                    {cmd.command_type === 'python' && cmd.source_code && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            Python Code
                          </h4>
                          <button
                            onClick={() => copyToClipboard(cmd.source_code)}
                            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors ${btnHover}`}
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                        <pre className={`${codeBg} text-emerald-300 p-2 rounded font-mono text-xs max-h-48 overflow-auto whitespace-pre-wrap`}>
                          {cmd.source_code}
                        </pre>
                      </div>
                    )}

                    {/* HTTP generated script block */}
                    {cmd.command_type === 'http' && cmd.source_code && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1">
                            HTTP Script
                          </h4>
                          <button
                            onClick={() => copyToClipboard(cmd.source_code)}
                            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors ${btnHover}`}
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                        <pre className={`${codeBg} text-blue-300 p-2 rounded font-mono text-xs max-h-48 overflow-auto whitespace-pre-wrap`}>
                          {cmd.source_code}
                        </pre>
                      </div>
                    )}

                    {/* Output Compact */}
                    {cmd.stdout && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={`text-xs font-semibold ${isOperator ? 'text-slate-300' : 'text-neutral-700 dark:text-neutral-300'}`}>Output</h4>
                          <button
                            onClick={() => copyToClipboard(cmd.stdout)}
                            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors ${btnHover}`}
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                        <pre className={`${codeBg} p-2 rounded font-mono text-xs max-h-32 overflow-auto whitespace-pre-wrap`}>
                          {cmd.stdout}
                        </pre>
                      </div>
                    )}

                    {/* Error Output Compact */}
                    {cmd.stderr && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-xs font-semibold text-red-700 dark:text-red-400">Error</h4>
                          <button
                            onClick={() => copyToClipboard(cmd.stderr)}
                            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors ${btnHover}`}
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                        <pre className="bg-red-900 dark:bg-red-950 text-red-100 dark:text-red-200 p-2 rounded font-mono text-xs max-h-32 overflow-auto whitespace-pre-wrap">
                          {cmd.stderr}
                        </pre>
                      </div>
                    )}

                    {/* Command Details Compact */}
                    <div className={`flex items-center gap-4 text-xs ${mutedText} pt-1 border-t ${borderClass}`}>
                      <span>Code: {cmd.returncode}</span>
                      {cmd.container_name && <span>Container: {cmd.container_name}</span>}
                      <span>{new Date(cmd.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination et contrôles */}
      {filteredCommands.length > 0 && (
        <div className={`flex items-center justify-between pt-2 border-t ${borderClass}`}>
          <div className={`flex items-center gap-2 text-xs ${mutedText}`}>
            <span>Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredCommands.length)} of {filteredCommands.length}</span>
            {stats.avgTime > 0 && (
              <span>• Avg time: {stats.avgTime.toFixed(1)}s</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Items per page */}
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className={`text-xs border rounded px-2 py-1 ${selectClass}`}
            >
              <option value={10}>10/page</option>
              <option value={20}>20/page</option>
              <option value={50}>50/page</option>
              <option value={100}>100/page</option>
            </select>

            {/* Pagination */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className={`px-2 py-1 text-xs border rounded disabled:opacity-50 disabled:cursor-not-allowed ${paginationBtn} ${rowHover}`}
              >
                ←
              </button>

              <span className={`px-2 py-1 text-xs ${mutedText}`}>
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className={`px-2 py-1 text-xs border rounded disabled:opacity-50 disabled:cursor-not-allowed ${paginationBtn} ${rowHover}`}
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommandHistory;
