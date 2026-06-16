"use client";

export default function Tooltip({ text, children, position = "top" }) {
  const posClass = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  }[position];

  return (
    <div className="relative inline-flex group">
      {children}
      <div className={`pointer-events-none absolute ${posClass} z-50 w-max max-w-56 rounded-xl px-2.5 py-1.5 text-[11px] leading-snug text-white opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-normal group-hover:translate-y-0 translate-y-1 bg-white/10 dark:bg-white/10 backdrop-blur-[16px] border border-white/15 shadow-[0_0_10px_var(--glow-purple)]`}>
        {text}
      </div>
    </div>
  );
}
