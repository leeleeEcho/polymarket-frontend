"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import { useNotifications, NotificationType } from "@/contexts/NotificationContext";

interface WebSocketMessage {
  type: "notification" | "ping" | "pong";
  data?: {
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    link?: string;
  };
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws/notifications";
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL = 30000;

export function useNotificationSocket() {
  const { address, isConnected } = useAccount();
  const { addNotification } = useNotifications();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const pingIntervalRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!address || !isConnected) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(`${WS_URL}?address=${address}`);

      ws.onopen = () => {
        console.log("[WS] Connected to notification server");
        reconnectAttemptsRef.current = 0;

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          if (message.type === "notification" && message.data) {
            addNotification({
              type: message.data.type,
              title: message.data.title,
              message: message.data.message,
              data: message.data.data,
              link: message.data.link,
            });
          }
        } catch (error) {
          console.error("[WS] Failed to parse message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("[WS] WebSocket error:", error);
      };

      ws.onclose = (event) => {
        console.log("[WS] Connection closed:", event.code, event.reason);

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }

        // Attempt to reconnect if not a clean close
        if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          console.log(
            `[WS] Reconnecting... attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`
          );
          reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("[WS] Failed to connect:", error);
    }
  }, [address, isConnected, addNotification]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }
  }, []);

  // Connect when wallet is connected
  useEffect(() => {
    if (isConnected && address) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isConnected, address, connect, disconnect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: connect,
    disconnect,
  };
}

// Helper hook to send test notifications (for development)
export function useSendTestNotification() {
  const { addNotification } = useNotifications();

  const sendTestNotification = useCallback(
    (type: NotificationType = "system") => {
      const testNotifications: Record<
        NotificationType,
        { title: string; message: string }
      > = {
        trade_filled: {
          title: "订单成交",
          message: "您的买入订单已成交：100 Yes @ 0.65 USDC",
        },
        market_resolved: {
          title: "市场已结算",
          message: 'BTC价格预测市场已结算，结果为"Yes"',
        },
        p2p_order: {
          title: "P2P订单更新",
          message: "您的P2P买入订单已被接单，请在15分钟内完成付款",
        },
        p2p_dispute: {
          title: "纠纷处理结果",
          message: "您的纠纷申请已处理完成，资金已退还",
        },
        referral_earning: {
          title: "返佣收益到账",
          message: "您收到来自下级用户的交易返佣：+2.50 USDC",
        },
        price_alert: {
          title: "价格提醒",
          message: "BTC价格预测市场Yes价格突破 0.70",
        },
        system: {
          title: "系统通知",
          message: "系统将于今晚22:00进行维护升级",
        },
      };

      const notification = testNotifications[type];
      addNotification({
        type,
        title: notification.title,
        message: notification.message,
      });
    },
    [addNotification]
  );

  return sendTestNotification;
}
