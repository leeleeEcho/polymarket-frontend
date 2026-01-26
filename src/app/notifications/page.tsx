"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Filter,
  Settings,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import {
  useNotifications,
  getNotificationIcon,
  getNotificationColor,
  NotificationType,
} from "@/contexts/NotificationContext";

const notificationTypeLabels: Record<NotificationType, string> = {
  trade_filled: "订单成交",
  market_resolved: "市场结算",
  p2p_order: "P2P订单",
  p2p_dispute: "P2P纠纷",
  referral_earning: "返佣收益",
  system: "系统通知",
  price_alert: "价格提醒",
};

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
  } = useNotifications();

  const [filterType, setFilterType] = useState<NotificationType | "all">("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const filteredNotifications = notifications.filter((n) => {
    if (filterType !== "all" && n.type !== filterType) return false;
    if (showUnreadOnly && n.read) return false;
    return true;
  });

  const formatTime = (timestamp: number) => {
    return formatDistanceToNow(new Date(timestamp), {
      addSuffix: true,
      locale: zhCN,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 hover:bg-secondary rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">通知中心</h1>
              <p className="text-muted-foreground text-sm mt-1">
                {unreadCount > 0
                  ? `${unreadCount} 条未读通知`
                  : "没有未读通知"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-lg transition"
              >
                <CheckCheck className="w-4 h-4" />
                全部已读
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAllNotifications}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition"
              >
                <Trash2 className="w-4 h-4" />
                清空
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-secondary/50 rounded-xl">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">筛选:</span>
          </div>

          <select
            value={filterType}
            onChange={(e) =>
              setFilterType(e.target.value as NotificationType | "all")
            }
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">全部类型</option>
            {Object.entries(notificationTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(e) => setShowUnreadOnly(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary"
            />
            <span className="text-sm">仅显示未读</span>
          </label>
        </div>

        {/* Notifications List */}
        <div className="space-y-2">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-16 bg-secondary/30 rounded-xl">
              <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">暂无通知</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`group relative p-4 rounded-xl border transition hover:bg-secondary/50 ${
                  !notification.read
                    ? "bg-primary/5 border-primary/20"
                    : "bg-secondary/30 border-border"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className={`text-2xl p-2 rounded-lg bg-secondary ${getNotificationColor(
                      notification.type
                    )}`}
                  >
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        className={`font-semibold ${
                          !notification.read
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {notification.title}
                      </h3>
                      {!notification.read && (
                        <span className="w-2 h-2 rounded-full bg-primary" />
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {notificationTypeLabels[notification.type]}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{notification.message}</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      {formatTime(notification.timestamp)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    {!notification.read && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="p-2 hover:bg-secondary rounded-lg transition"
                        title="标记已读"
                      >
                        <Check className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                    <button
                      onClick={() => clearNotification(notification.id)}
                      className="p-2 hover:bg-red-400/10 rounded-lg transition"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Link overlay */}
                {notification.link && (
                  <Link
                    href={notification.link}
                    className="absolute inset-0 rounded-xl"
                    onClick={() => markAsRead(notification.id)}
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* Notification Settings Link */}
        <div className="mt-8 pt-8 border-t border-border">
          <Link
            href="/account?tab=settings"
            className="flex items-center gap-3 p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="font-medium">通知设置</p>
              <p className="text-sm text-muted-foreground">
                管理通知偏好和推送设置
              </p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
