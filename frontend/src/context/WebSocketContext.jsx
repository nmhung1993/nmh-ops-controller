import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext({
  status: 'disconnected', // 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  hosts: [],
  selectedHostId: null,
  setSelectedHostId: () => {},
  selectedHost: null,
  telemetryMap: {},
  processesMap: {},
  watchdogAckMap: {},
  lastEvent: null,
  refreshHosts: async () => {},
  subscribeToHost: () => {},
  sendCommand: async () => {}
});

export function WebSocketProvider({ children }) {
  const { token, user } = useAuth();
  const [status, setStatus] = useState('disconnected');
  const [hosts, setHosts] = useState([]);
  const [selectedHostId, setSelectedHostIdState] = useState(() => {
    return new URLSearchParams(window.location.search).get('host') || null;
  });
  const [telemetryMap, setTelemetryMap] = useState({});
  const [processesMap, setProcessesMap] = useState({});
  const [watchdogAckMap, setWatchdogAckMap] = useState({});
  const [lastEvent, setLastEvent] = useState(null);

  const socketRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  const setSelectedHostId = useCallback((id) => {
    setSelectedHostIdState(id);
    const url = new URL(window.location);
    if (id) {
      url.searchParams.set('host', id);
    } else {
      url.searchParams.delete('host');
    }
    window.history.replaceState({}, '', url);

    // Send subscribe to WebSocket
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'ui.subscribe',
          payload: { agentId: id }
        })
      );
    }
  }, []);

  const refreshHosts = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/v1/hosts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHosts(data);

        // Update telemetryMap with existing telemetry from hosts
        setTelemetryMap((prev) => {
          const updated = { ...prev };
          data.forEach((h) => {
            if (h.telemetry) {
              updated[h.id] = h.telemetry;
            }
          });
          return updated;
        });

        // Set default selected host if none or current invalid
        setSelectedHostIdState((current) => {
          if (data.length === 0) return null;
          if (!current || !data.some((h) => h.id === current)) {
            return data[0].id;
          }
          return current;
        });
      }
    } catch (err) {
      console.error('Failed to fetch hosts:', err);
    }
  }, [token]);

  const connectWebSocket = useCallback(() => {
    if (!token) {
      setStatus('disconnected');
      return;
    }

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {}
      socketRef.current = null;
    }

    setStatus((prev) => (prev === 'connected' ? 'reconnecting' : 'connecting'));

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/ui?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      setStatus('connected');

      // Heartbeat ping
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);

      // Subscribe to selected host if any
      if (selectedHostId) {
        ws.send(
          JSON.stringify({
            type: 'ui.subscribe',
            payload: { agentId: selectedHostId }
          })
        );
      }
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const message = JSON.parse(event.data);
        const agentId = message.agentId;
        const payload = message.payload || {};

        switch (message.type) {
          case 'ui.telemetry':
            if (agentId) {
              setTelemetryMap((prev) => ({
                ...prev,
                [agentId]: payload
              }));
              // Also update host in list
              setHosts((prev) =>
                prev.map((h) =>
                  h.id === agentId
                    ? {
                        ...h,
                        online: true,
                        lastSeen: new Date().toISOString(),
                        telemetry: payload,
                        telemetryAt: new Date().toISOString()
                      }
                    : h
                )
              );
            }
            break;

          case 'ui.processes':
            if (agentId) {
              setProcessesMap((prev) => ({
                ...prev,
                [agentId]: payload.processes || []
              }));
            }
            break;

          case 'ui.host.status':
            if (payload.id) {
              setHosts((prev) => {
                const exists = prev.some((h) => h.id === payload.id);
                if (exists) {
                  return prev.map((h) => (h.id === payload.id ? { ...h, ...payload } : h));
                }
                return payload.status === 'approved' ? [...prev, payload] : prev;
              });
            }
            break;

          case 'ui.event':
            setLastEvent({ agentId, ...payload });
            break;

          case 'ui.config.ack':
            if (agentId) {
              setWatchdogAckMap((prev) => ({
                ...prev,
                [agentId]: { version: payload.version, at: new Date().toISOString() }
              }));
            }
            break;

          case 'ui.access.changed':
            refreshHosts();
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Error handling WS message:', err);
      }
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      clearInterval(pingIntervalRef.current);
      setStatus('reconnecting');
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  }, [token, selectedHostId, refreshHosts]);

  useEffect(() => {
    isMountedRef.current = true;
    refreshHosts();
    connectWebSocket();

    return () => {
      isMountedRef.current = false;
      clearInterval(pingIntervalRef.current);
      clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [token, connectWebSocket, refreshHosts]);

  const selectedHost = hosts.find((h) => h.id === selectedHostId) || null;

  return (
    <WebSocketContext.Provider
      value={{
        status,
        hosts,
        selectedHostId,
        setSelectedHostId,
        selectedHost,
        telemetryMap,
        processesMap,
        watchdogAckMap,
        lastEvent,
        refreshHosts
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
