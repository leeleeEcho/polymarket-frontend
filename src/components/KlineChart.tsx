"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, ColorType, UTCTimestamp } from "lightweight-charts";
import { API_BASE_URL, WS_URL } from "@/lib/wagmi";

interface KlineChartProps {
  marketId: string;
  outcomeId: string;
  shareType: "yes" | "no";
  outcomeName: string;
}

interface Candle {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface TradeEvent {
  id: string;
  market_id: string;
  outcome_id: string;
  share_type: string;
  price: string;
  amount: string;
  side: string;
  timestamp: number;
}

const PERIODS = [
  { label: "1m", value: "1m", seconds: 60 },
  { label: "5m", value: "5m", seconds: 300 },
  { label: "15m", value: "15m", seconds: 900 },
  { label: "1h", value: "1h", seconds: 3600 },
  { label: "4h", value: "4h", seconds: 14400 },
  { label: "1d", value: "1d", seconds: 86400 },
];

export function KlineChart({ marketId, outcomeId, shareType, outcomeName }: KlineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentCandleRef = useRef<Candle | null>(null);

  const [period, setPeriod] = useState("1h");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const getPeriodSeconds = useCallback(() => {
    return PERIODS.find(p => p.value === period)?.seconds || 3600;
  }, [period]);

  // Update chart with new trade data
  const updateChartWithTrade = useCallback((trade: TradeEvent) => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const periodSeconds = getPeriodSeconds();
    const tradeTime = Math.floor(trade.timestamp / 1000); // Convert ms to seconds
    const candleTime = Math.floor(tradeTime / periodSeconds) * periodSeconds;
    const price = parseFloat(trade.price);
    const amount = parseFloat(trade.amount);

    const currentCandle = currentCandleRef.current;

    if (currentCandle && currentCandle.time === candleTime) {
      // Update existing candle
      const newHigh = Math.max(parseFloat(currentCandle.high), price);
      const newLow = Math.min(parseFloat(currentCandle.low), price);
      const newVolume = parseFloat(currentCandle.volume) + amount;

      const updatedCandle: Candle = {
        time: candleTime,
        open: currentCandle.open,
        high: newHigh.toString(),
        low: newLow.toString(),
        close: price.toString(),
        volume: newVolume.toString(),
      };

      currentCandleRef.current = updatedCandle;

      // Update chart
      candleSeriesRef.current.update({
        time: candleTime as UTCTimestamp,
        open: parseFloat(updatedCandle.open),
        high: newHigh,
        low: newLow,
        close: price,
      });

      volumeSeriesRef.current.update({
        time: candleTime as UTCTimestamp,
        value: newVolume,
        color: price >= parseFloat(updatedCandle.open)
          ? "rgba(34, 197, 94, 0.5)"
          : "rgba(239, 68, 68, 0.5)",
      });
    } else {
      // Create new candle
      const newCandle: Candle = {
        time: candleTime,
        open: price.toString(),
        high: price.toString(),
        low: price.toString(),
        close: price.toString(),
        volume: amount.toString(),
      };

      currentCandleRef.current = newCandle;

      // Add new candle to chart
      candleSeriesRef.current.update({
        time: candleTime as UTCTimestamp,
        open: price,
        high: price,
        low: price,
        close: price,
      });

      volumeSeriesRef.current.update({
        time: candleTime as UTCTimestamp,
        value: amount,
        color: "rgba(34, 197, 94, 0.5)",
      });
    }
  }, [getPeriodSeconds]);

  // Connect to WebSocket for real-time updates
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[KlineChart] WebSocket connected");
      setIsLive(true);

      // Subscribe to trades for this market
      ws.send(JSON.stringify({
        type: "subscribe",
        channel: `trades:${marketId}`,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle trade events
        if (data.type === "markettrade" || data.type === "MarketTrade") {
          const trade: TradeEvent = {
            id: data.id,
            market_id: data.market_id,
            outcome_id: data.outcome_id,
            share_type: data.share_type,
            price: data.price,
            amount: data.amount,
            side: data.side,
            timestamp: data.timestamp,
          };

          // Only update if this trade matches our outcome and share type
          if (trade.outcome_id === outcomeId && trade.share_type.toLowerCase() === shareType.toLowerCase()) {
            console.log("[KlineChart] Received matching trade:", trade);
            updateChartWithTrade(trade);
          }
        }
      } catch (err) {
        console.error("[KlineChart] Error parsing WebSocket message:", err);
      }
    };

    ws.onclose = () => {
      console.log("[KlineChart] WebSocket disconnected");
      setIsLive(false);

      // Reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current === ws) {
          connectWebSocket();
        }
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error("[KlineChart] WebSocket error:", err);
    };
  }, [marketId, outcomeId, shareType, updateChartWithTrade]);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const fetchKlines = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/markets/${marketId}/klines?outcome_id=${outcomeId}&share_type=${shareType}&period=${period}&limit=200`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch klines");
      }

      const data = await response.json();
      const candles: Candle[] = data.candles || [];

      if (candleSeriesRef.current && candles.length > 0) {
        const candleData = candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        }));

        candleSeriesRef.current.setData(candleData);

        // Set volume data
        if (volumeSeriesRef.current) {
          const volumeData = candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: parseFloat(c.volume),
            color: parseFloat(c.close) >= parseFloat(c.open)
              ? "rgba(34, 197, 94, 0.5)"
              : "rgba(239, 68, 68, 0.5)",
          }));
          volumeSeriesRef.current.setData(volumeData);
        }

        // Store the last candle for real-time updates
        if (candles.length > 0) {
          currentCandleRef.current = candles[candles.length - 1];
        }

        // Fit content
        chartRef.current?.timeScale().fitContent();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chart data");
    } finally {
      setLoading(false);
    }
  }, [marketId, outcomeId, shareType, period]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#737373",
      },
      grid: {
        vertLines: { color: "#f5f5f5" },
        horzLines: { color: "#f5f5f5" },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: "#e5e5e5",
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: "#e5e5e5",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    // Add candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      priceFormat: {
        type: "price",
        precision: 4,
        minMove: 0.0001,
      },
    });

    // Add volume series
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.85,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Fetch data when period changes
  useEffect(() => {
    fetchKlines();
  }, [fetchKlines]);

  // Connect WebSocket on mount
  useEffect(() => {
    connectWebSocket();
    return () => disconnectWebSocket();
  }, [connectWebSocket, disconnectWebSocket]);

  // Refresh historical data every 60 seconds (as backup)
  useEffect(() => {
    const interval = setInterval(fetchKlines, 60000);
    return () => clearInterval(interval);
  }, [fetchKlines]);

  return (
    <div className="card-9v overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center space-x-2">
          <span className="text-foreground font-medium">{outcomeName}</span>
          <span className="text-muted-foreground text-sm uppercase font-mono">{shareType}</span>
          {/* Live indicator */}
          <span className={`flex items-center text-xs ${isLive ? "text-success" : "text-muted-foreground"}`}>
            <span className={`w-2 h-2 rounded-full mr-1 ${isLive ? "bg-success animate-pulse" : "bg-muted-foreground"}`}></span>
            {isLive ? "LIVE" : "OFFLINE"}
          </span>
        </div>

        {/* Period selector */}
        <div className="flex space-x-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 text-xs rounded transition font-mono ${
                period === p.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div className="relative" style={{ height: "300px" }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent"></div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <div className="text-center">
              <p className="text-destructive text-sm mb-2">{error}</p>
              <button
                onClick={fetchKlines}
                className="text-foreground text-sm hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
