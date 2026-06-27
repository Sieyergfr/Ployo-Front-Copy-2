import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

type MetricCardProps = {
  label: ReactNode;
  value: ReactNode;
  change?: ReactNode;
  caption?: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
};

export default function MetricCard({
  label,
  value,
  change,
  caption,
  trend,
  className,
}: MetricCardProps) {
  const cardClassName = className ? `metric-card ${className}` : "metric-card";
  const hasChange = change !== undefined && change !== null;
  const hasCaption = caption !== undefined && caption !== null;
  const hasFooter = hasChange || hasCaption;
  const TrendIcon =
    trend === "down" ? ArrowDown : trend === "neutral" ? Minus : trend === "up" ? ArrowUp : null;

  return (
    <div className={cardClassName}>
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value">{value}</div>
      {hasFooter ? (
        <div className="metric-card-footer">
          {hasChange ? (
            <span className="metric-card-change">
              {TrendIcon ? (
                <TrendIcon className="metric-card-change-icon" size={13} strokeWidth={2.5} />
              ) : null}
              {change}
            </span>
          ) : null}
          {hasCaption ? <span className="metric-card-caption">{caption}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
