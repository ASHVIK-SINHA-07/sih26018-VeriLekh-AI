"use client";

import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/**
 * Documents processed per day — docs/04_Frontend_Spec.md screen 4.
 * Navy bars on the light surface; counts are whole numbers only.
 */
export function TrendChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  const shaped = data.map((point) => ({
    ...point,
    label: new Date(point.date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),
  }));

  const busiest = Math.max(1, ...shaped.map((point) => point.count));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={shaped} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6e4de" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#5b6472" }}
            tickLine={false}
            axisLine={{ stroke: "#e6e4de" }}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            domain={[0, busiest]}
            tick={{ fontSize: 11, fill: "#5b6472" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "#1f386410" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e6e4de",
              fontSize: 12,
            }}
            formatter={(value) => [`${Number(value ?? 0)}`, "Documents"]}
          />
          <Bar dataKey="count" fill="#1f3864" radius={[3, 3, 0, 0]} maxBarSize={38} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
