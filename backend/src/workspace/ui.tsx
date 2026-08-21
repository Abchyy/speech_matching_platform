"use client";

import type { ReactNode } from "react";

type Tone = "seal" | "moss" | "amber" | "neutral";

const badgeTones: Record<Tone, string> = {
  seal: "bg-seal/10 text-seal ring-seal/25",
  moss: "bg-moss/10 text-moss ring-moss/25",
  amber: "bg-amber-500/15 text-amber-800 ring-amber-600/30",
  neutral: "bg-ink/5 text-ink-soft ring-ink/15",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ring-1 ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-seal px-6 py-3 text-sm font-medium text-paper-3 shadow-[0_10px_30px_-12px_rgba(156,43,26,0.55)] transition-all duration-300 hover:bg-seal-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-paper-3/70 disabled:shadow-none"
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-paper-3/60 px-5 py-2.5 text-sm text-ink-soft transition-colors duration-300 hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line/70 bg-paper-3/80 shadow-[0_18px_50px_-30px_rgba(29,26,21,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Banner({
  tone,
  title,
  children,
  onClose,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  onClose?: () => void;
}) {
  const tones: Record<Tone, string> = {
    seal: "border-seal/30 bg-seal/5 text-seal",
    moss: "border-moss/30 bg-moss/5 text-moss",
    amber: "border-amber-600/30 bg-amber-500/10 text-amber-900",
    neutral: "border-line bg-paper-2/60 text-ink-soft",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{title}</p>
          {children ? <div className="mt-1 leading-relaxed">{children}</div> : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭提示"
            className="shrink-0 rounded-full px-2 text-current opacity-60 transition-opacity hover:opacity-100"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function StageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-ink-soft">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-ink md:text-3xl">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{description}</p>
    </div>
  );
}
