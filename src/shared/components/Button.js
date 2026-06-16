"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  primary: "bg-gradient-to-b from-primary to-primary-hover text-white shadow-[0_0_15px_var(--glow-primary)] hover:shadow-[0_0_25px_var(--glow-primary)] hover:-translate-y-0.5",
  secondary: "glass text-text-main hover:glow-md hover:border-[var(--glass-border-hover)]",
  outline: "glass text-text-main hover:glow-sm hover:border-[var(--glass-border-hover)]",
  ghost: "text-text-muted hover:bg-white/10 dark:hover:bg-white/5 hover:text-text-main",
  danger: "bg-red-500 text-white hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]",
};

const sizes = {
  sm: "h-7 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-lg",
  lg: "h-11 px-6 text-sm rounded-lg",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  ...props
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 cursor-pointer",
        "active:scale-[0.98] focus:shadow-[0_0_0_3px_var(--glow-primary)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span className="material-symbols-outlined text-[18px]">{iconRight}</span>
      )}
    </button>
  );
}

