/**
 * PendingCommandModal - Modal for validating pending commands
 */
import { useState } from 'react';
import { approvePendingCommand, rejectPendingCommand } from '../../services/pendingCommandService';
import { useTheme } from '../../contexts/ThemeContext';

const PendingCommandModal = ({ pendingCommand, onClose, onApprove, onReject }) => {
  const { isOperator } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [error, setError] = useState(null);

  if (!pendingCommand) return null;

  const handleApprove = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      await approvePendingCommand(pendingCommand.id, 'admin');

      if (onApprove) {
        onApprove(pendingCommand);
      }

      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to approve command');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      await rejectPendingCommand(pendingCommand.id, 'admin', rejectionReason);

      if (onReject) {
        onReject(pendingCommand);
      }

      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reject command');
    } finally {
      setIsProcessing(false);
    }
  };

  const getSeverityColor = (reason) => {
    if (reason?.includes('(high)')) return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
    if (reason?.includes('(medium)')) return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20';
    if (reason?.includes('(low)')) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
    return 'text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800';
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm ${isOperator ? 'bg-slate-950/72' : 'bg-black/50'}`}>
      <div className={`rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto ${isOperator
        ? 'border border-cyan-500/20 bg-[linear-gradient(180deg,rgba(8,15,36,0.96),rgba(2,6,23,0.92))] shadow-[0_28px_80px_rgba(2,6,23,0.7),0_0_0_1px_rgba(34,211,238,0.08)]'
        : 'bg-white dark:bg-neutral-800'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${isOperator ? 'border-cyan-500/20' : 'border-neutral-200 dark:border-neutral-700'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className={`text-xl font-semibold ${isOperator ? 'text-slate-50' : 'text-neutral-900 dark:text-neutral-100'}`}>Command Requires Validation</h2>
              <p className={`text-sm ${isOperator ? 'text-slate-400' : 'text-neutral-500 dark:text-neutral-400'}`}>A potentially dangerous command needs your approval</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`transition-colors ${isOperator ? 'text-slate-500 hover:text-slate-200' : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'}`}
            disabled={isProcessing}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Command Details */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1 flex items-center gap-2">
                {pendingCommand.command_type === 'python' ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded font-mono">python</span>
                    <span className="text-gray-500 dark:text-neutral-400 font-normal text-xs">code to execute</span>
                  </span>
                ) : pendingCommand.command_type === 'http' ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded font-mono">http</span>
                    <span className="text-gray-500 dark:text-neutral-400 font-normal text-xs">request to send</span>
                  </span>
                ) : (
                  'Command'
                )}
              </label>
              {pendingCommand.command_type === 'python' ? (
                <pre className={`${isOperator ? 'bg-[#020617] text-emerald-300' : 'bg-neutral-900 dark:bg-black text-emerald-300'} p-4 rounded-lg font-mono text-sm overflow-auto max-h-64 whitespace-pre-wrap`}>
                  {pendingCommand.command}
                </pre>
              ) : pendingCommand.command_type === 'http' ? (
                (() => {
                  try {
                    const req = JSON.parse(pendingCommand.command);
                    return (
                      <div className={`${isOperator ? 'bg-[#020617]' : 'bg-neutral-900 dark:bg-black'} rounded-lg overflow-hidden`}>
                        <div className="px-4 py-2 border-b border-neutral-700 font-mono text-sm">
                          <span className="text-blue-400 font-semibold">{req.method || 'GET'}</span>
                          {' '}
                          <span className="text-neutral-200 break-all">{req.url}</span>
                        </div>
                        {req.headers && Object.keys(req.headers).length > 0 && (
                          <div className="px-4 py-2 border-b border-neutral-700">
                            <div className="text-xs text-neutral-500 mb-1 uppercase">Headers</div>
                            <pre className="text-neutral-300 text-xs font-mono whitespace-pre-wrap">{JSON.stringify(req.headers, null, 2)}</pre>
                          </div>
                        )}
                        {req.json_body && (
                          <div className="px-4 py-2 border-b border-neutral-700">
                            <div className="text-xs text-neutral-500 mb-1 uppercase">JSON Body</div>
                            <pre className="text-emerald-300 text-xs font-mono whitespace-pre-wrap">{JSON.stringify(req.json_body, null, 2)}</pre>
                          </div>
                        )}
                        {req.data && (
                          <div className="px-4 py-2 border-b border-neutral-700">
                            <div className="text-xs text-neutral-500 mb-1 uppercase">Data</div>
                            <pre className="text-neutral-300 text-xs font-mono whitespace-pre-wrap">{typeof req.data === 'string' ? req.data : JSON.stringify(req.data, null, 2)}</pre>
                          </div>
                        )}
                        {req.cookies && Object.keys(req.cookies).length > 0 && (
                          <div className="px-4 py-2">
                            <div className="text-xs text-neutral-500 mb-1 uppercase">Cookies</div>
                            <pre className="text-neutral-300 text-xs font-mono whitespace-pre-wrap">{JSON.stringify(req.cookies, null, 2)}</pre>
                          </div>
                        )}
                        {req.proxy && (
                          <div className="px-4 py-2">
                            <div className="text-xs text-neutral-500 mb-1 uppercase">Proxy</div>
                            <code className="text-yellow-300 text-xs font-mono">{req.proxy}</code>
                          </div>
                        )}
                      </div>
                    );
                  } catch {
                    return (
                      <div className={`${isOperator ? 'bg-[#020617] text-blue-300' : 'bg-neutral-900 dark:bg-black text-blue-300'} p-4 rounded-lg font-mono text-sm overflow-x-auto`}>
                        {pendingCommand.command}
                      </div>
                    );
                  }
                })()
              ) : (
                <div className={`${isOperator ? 'bg-[#020617] text-slate-200' : 'bg-neutral-900 dark:bg-black text-neutral-100 dark:text-neutral-200'} p-4 rounded-lg font-mono text-sm overflow-x-auto`}>
                  {pendingCommand.command}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isOperator ? 'text-slate-300' : 'text-neutral-700 dark:text-neutral-300'}`}>Assessment ID</label>
                <p className={`text-sm ${isOperator ? 'text-slate-100' : 'text-neutral-900 dark:text-neutral-100'}`}>#{pendingCommand.assessment_id}</p>
              </div>

              {pendingCommand.phase && (
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isOperator ? 'text-slate-300' : 'text-neutral-700 dark:text-neutral-300'}`}>Phase</label>
                  <p className={`text-sm ${isOperator ? 'text-slate-100' : 'text-neutral-900 dark:text-neutral-100'}`}>{pendingCommand.phase.replace('phase_', 'Phase ')}</p>
                </div>
              )}
            </div>

            {/* Triggered Keywords */}
            {pendingCommand.reason && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${isOperator ? 'text-slate-300' : 'text-neutral-700 dark:text-neutral-300'}`}>Triggered Keywords</label>
                <div className={`p-3 rounded-lg ${getSeverityColor(pendingCommand.reason)}`}>
                  <p className="text-sm font-medium">{pendingCommand.reason}</p>
                </div>
              </div>
            )}

            {/* Timestamp */}
            <div>
              <label className={`block text-sm font-medium mb-1 ${isOperator ? 'text-slate-300' : 'text-neutral-700 dark:text-neutral-300'}`}>Requested At</label>
              <p className={`text-sm ${isOperator ? 'text-slate-400' : 'text-neutral-600 dark:text-neutral-400'}`}>
                {new Date(pendingCommand.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Rejection Input */}
          {showRejectInput && (
            <div className="mt-4">
              <label className={`block text-sm font-medium mb-2 ${isOperator ? 'text-slate-300' : 'text-neutral-700 dark:text-neutral-300'}`}>
                Rejection Reason
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Please provide a reason for rejecting this command..."
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${isOperator
                  ? 'border-cyan-500/20 bg-slate-950/60 text-slate-100 placeholder-slate-500'
                  : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500'
                }`}
                rows={3}
                disabled={isProcessing}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={`flex items-center justify-end gap-3 p-6 border-t ${isOperator
          ? 'border-cyan-500/20 bg-slate-950/50'
          : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900'
        }`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isOperator
              ? 'border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-cyan-500/20 hover:bg-slate-800 hover:text-slate-100'
              : 'text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-700'
            }`}
            disabled={isProcessing}
          >
            Cancel
          </button>

          {!showRejectInput ? (
            <>
              <button
                onClick={() => setShowRejectInput(true)}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                disabled={isProcessing}
              >
                Reject
              </button>

              <button
                onClick={handleApprove}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                disabled={isProcessing}
              >
                {isProcessing ? 'Approving...' : 'Approve & Execute'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setShowRejectInput(false);
                  setRejectionReason('');
                  setError(null);
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isOperator
                  ? 'border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-cyan-500/20 hover:bg-slate-800 hover:text-slate-100'
                  : 'text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                }`}
                disabled={isProcessing}
              >
                Back
              </button>

              <button
                onClick={handleReject}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={isProcessing}
              >
                {isProcessing ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PendingCommandModal;
