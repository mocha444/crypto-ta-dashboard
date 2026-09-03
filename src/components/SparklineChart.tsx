"use client";

import { useEffect, useRef } from "react";

export default function SparklineChart({ prices, height = 60, colorUp = "#34d399", colorDown = "#fb7185" }: {
  prices?: number[];
  height?: number;
  colorUp?: string;
  colorDown?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!prices || prices.length < 2 || !ref.current) return;
    const mount = async () => {
      try {
        const { createChart, LineStyle } = await import("lightweight-charts");
        const chart = (createChart as any)(ref.current!, {
          width: ref.current!.clientWidth,
          height,
          layout: { background: { color: "transparent" }, textColor: "#a1a1aa" },
          grid: { vertLines: { color: "#27272a" }, horzLines: { color: "#27272a" } },
        });
        const line = (chart as any).addLineSeries({
          color: prices[prices.length - 1] >= prices[0] ? colorUp : colorDown,
          lineWidth: 1.5,
        });
        line.setData(prices.map((v, i) => ({ value: v, time: { hour: 9 + Math.floor(i / 4), minute: (i % 4) * 15 } })));
        chart.timeScale().fitContent();
        return () => chart.remove();
      } catch {
        // Fallback: chart library load skipped or unavailable.
      }
    };
    mount();
  }, [prices, height, colorUp, colorDown]);

  return <div ref={ref} className="w-full" />;
}
