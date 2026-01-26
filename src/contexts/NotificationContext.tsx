"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

// Notification types
export type NotificationType =
  | "trade_filled"      // 订单成交
  | "market_resolved"   // 市场结算
  | "p2p_order"         // P2P订单状态变更
  | "p2p_dispute"       // P2P纠纷
  | "referral_earning"  // 返佣收益
  | "system"            // 系统通知
  | "price_alert";      // 价格提醒

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  data?: Record<string, unknown>;
  link?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const STORAGE_KEY = "9v_notifications";
const MAX_NOTIFICATIONS = 100;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Load notifications from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setNotifications(parsed);
        } catch (e) {
          console.error("Failed to parse notifications:", e);
        }
      }
    }
  }, []);

  // Save notifications to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && notifications.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    }
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = useCallback(
    (notification: Omit<Notification, "id" | "timestamp" | "read">) => {
      const newNotification: Notification = {
        ...notification,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        read: false,
      };

      setNotifications((prev) => {
        const updated = [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS);
        return updated;
      });

      // Show browser notification if permitted
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(notification.title, {
            body: notification.message,
            icon: "/logo.png",
          });
        }
      }
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        clearAllNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}

// Helper to get notification icon based on type
export function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case "trade_filled":
      return "📊";
    case "market_resolved":
      return "🏁";
    case "p2p_order":
      return "💰";
    case "p2p_dispute":
      return "⚠️";
    case "referral_earning":
      return "🎁";
    case "price_alert":
      return "📈";
    case "system":
    default:
      return "🔔";
  }
}

// Helper to get notification color based on type
export function getNotificationColor(type: NotificationType): string {
  switch (type) {
    case "trade_filled":
      return "text-green-500";
    case "market_resolved":
      return "text-blue-500";
    case "p2p_order":
      return "text-purple-500";
    case "p2p_dispute":
      return "text-red-500";
    case "referral_earning":
      return "text-yellow-500";
    case "price_alert":
      return "text-orange-500";
    case "system":
    default:
      return "text-gray-500";
  }
}
