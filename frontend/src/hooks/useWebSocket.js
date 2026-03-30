/**
 * WebSocket Hook for Real-Time Updates
 * Provides WebSocket connection and event subscription
 */
import { useEffect, useRef, useCallback, useState, useMemo } from 'react';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const RECONNECT_DELAY = 3000;
const WS_URL = (() => {
  if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
    return API_BASE_URL.replace(/^http/, 'ws');
  }

  if (typeof window === 'undefined') {
    return `ws://localhost:8181${API_BASE_URL.startsWith('/') ? API_BASE_URL : `/${API_BASE_URL}`}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = API_BASE_URL.startsWith('/') ? API_BASE_URL : `/${API_BASE_URL}`;
  return `${protocol}//${window.location.host}${path}`;
})();
const connectionPool = new Map();

function notifyStateListeners(connection) {
  connection.stateListeners.forEach((listener) => {
    try {
      listener(connection);
    } catch (error) {
      console.error('[WebSocket] State listener error:', error);
    }
  });
}

function getOrCreateConnection(url) {
  if (!connectionPool.has(url)) {
    connectionPool.set(url, {
      url,
      socket: null,
      reconnectAttempts: 0,
      reconnectTimeout: null,
      refCount: 0,
      isConnected: false,
      lastError: null,
      lastMessage: null,
      eventHandlers: new Map(),
      stateListeners: new Set(),
    });
  }

  return connectionPool.get(url);
}

function scheduleReconnect(connection) {
  if (
    connection.refCount === 0 ||
    connection.reconnectTimeout
  ) {
    return;
  }

  connection.reconnectAttempts += 1;
  connection.reconnectTimeout = setTimeout(() => {
    connection.reconnectTimeout = null;
    ensureConnectionOpen(connection);
  }, RECONNECT_DELAY);
}

function ensureConnectionOpen(connection) {
  if (
    connection.socket?.readyState === WebSocket.OPEN ||
    connection.socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  try {
    const socket = new WebSocket(connection.url);
    connection.socket = socket;

    socket.onopen = () => {
      if (connection.socket !== socket) return;

      connection.isConnected = true;
      connection.lastError = null;
      connection.reconnectAttempts = 0;
      notifyStateListeners(connection);
      console.log('[WebSocket] Connected to', connection.url);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        connection.lastMessage = message;
        notifyStateListeners(connection);

        const handlers = connection.eventHandlers.get(message.type) || [];
        handlers.forEach((handler) => {
          try {
            handler(message.data, message);
          } catch (error) {
            console.error('[WebSocket] Handler error:', error);
          }
        });
      } catch (error) {
        console.error('[WebSocket] Message parse error:', error);
      }
    };

    socket.onclose = (event) => {
      if (connection.socket === socket) {
        connection.socket = null;
        connection.isConnected = false;
        notifyStateListeners(connection);
      }

      if (connection.refCount > 0 && event.code !== 1000) {
        scheduleReconnect(connection);
      }
    };

    socket.onerror = (error) => {
      connection.lastError = error;
      notifyStateListeners(connection);
      console.error('[WebSocket] Connection error:', error);
    };
  } catch (error) {
    connection.lastError = error;
    notifyStateListeners(connection);
    console.error('[WebSocket] Connection failed:', error);
    scheduleReconnect(connection);
  }
}

function releaseConnection(connection) {
  connection.refCount = Math.max(0, connection.refCount - 1);

  if (connection.refCount > 0) {
    return;
  }

  if (connection.reconnectTimeout) {
    clearTimeout(connection.reconnectTimeout);
    connection.reconnectTimeout = null;
  }

  if (
    connection.socket &&
    connection.socket.readyState !== WebSocket.CLOSING &&
    connection.socket.readyState !== WebSocket.CLOSED
  ) {
    connection.socket.close(1000, 'User disconnect');
  }

  connection.socket = null;
  connection.isConnected = false;
  connectionPool.delete(connection.url);
}

export function useWebSocket(assessmentId = null) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);
  const connectionRef = useRef(null);
  const isAttachedRef = useRef(false);

  const assessmentIdStr = assessmentId ? String(assessmentId) : null;

  const socketUrl = useMemo(() => {
    const baseUrl = WS_URL.endsWith('/') ? WS_URL.slice(0, -1) : WS_URL;
    if (assessmentIdStr) {
      return `${baseUrl}/ws/assessment/${assessmentIdStr}`;
    }
    return `${baseUrl}/ws`;
  }, [assessmentIdStr]);

  const syncState = useCallback((connection) => {
    setIsConnected(connection.isConnected);
    setLastError(connection.lastError);
    setLastMessage(connection.lastMessage);
  }, []);

  const connect = useCallback(() => {
    if (isAttachedRef.current) {
      const existingConnection = connectionRef.current;
      if (existingConnection) {
        ensureConnectionOpen(existingConnection);
      }
      return;
    }

    const connection = getOrCreateConnection(socketUrl);
    connection.refCount += 1;
    connection.stateListeners.add(syncState);
    connectionRef.current = connection;
    isAttachedRef.current = true;

    syncState(connection);
    ensureConnectionOpen(connection);
  }, [socketUrl, syncState]);

  const disconnect = useCallback(() => {
    if (!isAttachedRef.current || !connectionRef.current) {
      return;
    }

    const connection = connectionRef.current;
    connection.stateListeners.delete(syncState);
    connectionRef.current = null;
    isAttachedRef.current = false;
    releaseConnection(connection);

    setIsConnected(false);
  }, [syncState]);

  const send = useCallback((type, data) => {
    const connection = connectionRef.current;

    if (connection?.socket?.readyState === WebSocket.OPEN) {
      const payload = type === 'agent_input' ? { type, ...data } : { type, data };
      connection.socket.send(JSON.stringify(payload));
      return true;
    }

    console.warn('[WebSocket] Cannot send message: Not connected');
    return false;
  }, []);

  const subscribe = useCallback((type, handler) => {
    const connection = connectionRef.current || getOrCreateConnection(socketUrl);

    if (!connection.eventHandlers.has(type)) {
      connection.eventHandlers.set(type, new Set());
    }

    connection.eventHandlers.get(type).add(handler);

    return () => {
      const handlers = connection.eventHandlers.get(type);
      if (!handlers) return;

      handlers.delete(handler);
      if (handlers.size === 0) {
        connection.eventHandlers.delete(type);
      }
    };
  }, [socketUrl]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastError,
    lastMessage,
    connect,
    disconnect,
    send,
    subscribe,
  };
}
