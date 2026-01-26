"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { WS_URL } from "@/lib/wagmi";

type MessageHandler = (data: any) => void;

interface WebSocketState {
  isConnected: boolean;
  isAuthenticated: boolean;
  subscriptions: Set<string>;
}

export function useWebSocket() {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isAuthenticated: false,
    subscriptions: new Set(),
  });

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING ||
        isConnectingRef.current) {
      return;
    }

    isConnectingRef.current = true;
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (!isMountedRef.current) {
        ws.close();
        return;
      }
      console.log("WebSocket connected");
      isConnectingRef.current = false;
      setState((prev) => ({ ...prev, isConnected: true }));

      // Resubscribe to previous channels
      state.subscriptions.forEach((channel) => {
        ws.send(JSON.stringify({ type: "subscribe", channel }));
      });
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      isConnectingRef.current = false;

      if (!isMountedRef.current) return;

      setState((prev) => ({ ...prev, isConnected: false, isAuthenticated: false }));

      // Attempt to reconnect after 5 seconds (only if mounted)
      if (isMountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, 5000);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle auth result
        if (data.type === "authresult") {
          setState((prev) => ({ ...prev, isAuthenticated: data.success }));
        }

        // Handle subscription confirmation
        if (data.type === "subscribed") {
          setState((prev) => ({
            ...prev,
            subscriptions: new Set([...prev.subscriptions, data.channel]),
          }));
        }

        // Handle unsubscription
        if (data.type === "unsubscribed") {
          setState((prev) => {
            const newSubs = new Set(prev.subscriptions);
            newSubs.delete(data.channel);
            return { ...prev, subscriptions: newSubs };
          });
        }

        // Dispatch to handlers based on channel/type
        const channel = data.channel || data.type;
        const handlers = handlersRef.current.get(channel);
        if (handlers) {
          handlers.forEach((handler) => handler(data));
        }

        // Also dispatch to wildcard handlers
        const wildcardHandlers = handlersRef.current.get("*");
        if (wildcardHandlers) {
          wildcardHandlers.forEach((handler) => handler(data));
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    wsRef.current = ws;
  }, [state.subscriptions]);

  // Disconnect
  const disconnect = useCallback(() => {
    isMountedRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    isConnectingRef.current = false;
  }, []);

  // Authenticate with signature
  const authenticate = useCallback((address: string, signature: string, timestamp: number) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: "auth",
      address,
      signature,
      timestamp,
    }));
  }, []);

  // Subscribe to a channel
  const subscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      // Queue subscription for when connected
      setState((prev) => ({
        ...prev,
        subscriptions: new Set([...prev.subscriptions, channel]),
      }));
      return;
    }

    wsRef.current.send(JSON.stringify({ type: "subscribe", channel }));
  }, []);

  // Unsubscribe from a channel
  const unsubscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "unsubscribe", channel }));
  }, []);

  // Add message handler
  const addHandler = useCallback((channel: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(channel)) {
      handlersRef.current.set(channel, new Set());
    }
    handlersRef.current.get(channel)!.add(handler);

    // Return cleanup function
    return () => {
      handlersRef.current.get(channel)?.delete(handler);
    };
  }, []);

  // Send ping
  const ping = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "ping" }));
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Ping every 30 seconds to keep connection alive
  useEffect(() => {
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, [ping]);

  return {
    ...state,
    connect,
    disconnect,
    authenticate,
    subscribe,
    unsubscribe,
    addHandler,
    ping,
  };
}
