import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocketContext } from './WebSocketContext';
import pendingCommandService from '../services/pendingCommandService';

const DEFAULT_APPROVAL_TIMEOUT_SECONDS = 30;

const PendingCommandsContext = createContext(null);

export const usePendingCommands = () => {
    const context = useContext(PendingCommandsContext);
    if (!context) {
        throw new Error('usePendingCommands must be used within PendingCommandsProvider');
    }
    return context;
};

export const PendingCommandsProvider = ({ children }) => {
    const [pendingCommands, setPendingCommands] = useState([]);
    const [historyCommands, setHistoryCommands] = useState([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [latestCommand, setLatestCommand] = useState(null);
    const [showBanner, setShowBanner] = useState(false);
    const [approvalTimeoutSeconds, setApprovalTimeoutSeconds] = useState(DEFAULT_APPROVAL_TIMEOUT_SECONDS);
    const { lastMessage } = useWebSocketContext();
    const sweepTimeoutRef = useRef(null);

    const applyPendingState = useCallback((commands = []) => {
        const pending = commands.filter((command) => command.status === 'pending');
        const history = commands.filter((command) => command.status !== 'pending');

        setPendingCommands(pending);
        setHistoryCommands(history);
        setPendingCount(pending.length);

        if (pending.length > 0) {
            setLatestCommand(pending[0]);
            setShowBanner(true);
        } else {
            setShowBanner(false);
            setLatestCommand(null);
        }
    }, []);

    // Load pending commands
    const loadPendingCommands = useCallback(async () => {
        try {
            await pendingCommandService.sweepExpiredCommands();
            const [data, settings] = await Promise.all([
                pendingCommandService.listPendingCommands(),
                pendingCommandService.getCommandSettings(),
            ]);
            applyPendingState(data.commands || []);
            setApprovalTimeoutSeconds(settings?.timeout_seconds || DEFAULT_APPROVAL_TIMEOUT_SECONDS);
        } catch (error) {
            console.error('Failed to load pending commands:', error);
        }
    }, [applyPendingState]);

    // Initial load
    useEffect(() => {
        loadPendingCommands();
    }, [loadPendingCommands]);

    // Handle WebSocket messages
    useEffect(() => {
        if (lastMessage?.type === 'command_pending_approval') {
            const cmd = lastMessage.data;
            if (cmd) {
                setLatestCommand(cmd);
                setShowBanner(true);
            }
            loadPendingCommands();
        } else if (
            lastMessage?.type === 'command_approved' ||
            lastMessage?.type === 'command_rejected' ||
            lastMessage?.type === 'command_timeout'
        ) {
            loadPendingCommands();
        } else if (lastMessage?.type === 'command_settings_updated') {
            loadPendingCommands();
        }
    }, [lastMessage, loadPendingCommands]);

    useEffect(() => {
        if (sweepTimeoutRef.current) {
            clearTimeout(sweepTimeoutRef.current);
            sweepTimeoutRef.current = null;
        }

        if (!latestCommand?.created_at || pendingCount === 0) {
            return undefined;
        }

        const timeoutSeconds = latestCommand.timeout_seconds || approvalTimeoutSeconds || DEFAULT_APPROVAL_TIMEOUT_SECONDS;
        const createdAt = new Date(latestCommand.created_at).getTime();
        const dueInMs = Math.max(0, createdAt + (timeoutSeconds * 1000) - Date.now());

        sweepTimeoutRef.current = setTimeout(() => {
            loadPendingCommands();
        }, dueInMs + 250);

        return () => {
            if (sweepTimeoutRef.current) {
                clearTimeout(sweepTimeoutRef.current);
                sweepTimeoutRef.current = null;
            }
        };
    }, [latestCommand, pendingCount, approvalTimeoutSeconds, loadPendingCommands]);

    // Update tab title with badge
    useEffect(() => {
        const baseTitle = 'AIDA';
        if (pendingCount > 0) {
            document.title = `(${pendingCount}) ${baseTitle}`;
        } else {
            document.title = baseTitle;
        }
    }, [pendingCount]);

    const dismissBanner = useCallback(() => {
        setShowBanner(false);
    }, []);

    const approveCommand = useCallback(async (commandId, approvedBy = 'admin') => {
        const result = await pendingCommandService.approveCommand(commandId, approvedBy);
        await loadPendingCommands();
        return result;
    }, [loadPendingCommands]);

    const rejectCommand = useCallback(async (commandId, rejectedBy = 'admin', reason = '') => {
        const result = await pendingCommandService.rejectCommand(commandId, rejectedBy, reason);
        await loadPendingCommands();
        return result;
    }, [loadPendingCommands]);

    const value = {
        pendingCommands,
        historyCommands,
        pendingCount,
        latestCommand,
        showBanner,
        approvalTimeoutSeconds,
        dismissBanner,
        loadPendingCommands,
        approveCommand,
        rejectCommand
    };

    return (
        <PendingCommandsContext.Provider value={value}>
            {children}
        </PendingCommandsContext.Provider>
    );
};
