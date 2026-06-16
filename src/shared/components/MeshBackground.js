"use client";

export default function MeshBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 pointer-events-none animate-mesh"
      aria-hidden="true"
      style={{
        background: `
          radial-gradient(ellipse at var(--mesh-x1) var(--mesh-y1), var(--mesh-1) 0%, transparent 50%),
          radial-gradient(ellipse at var(--mesh-x2) var(--mesh-y2), var(--mesh-2) 0%, transparent 50%),
          radial-gradient(ellipse at var(--mesh-x3) var(--mesh-y3), var(--mesh-3) 0%, transparent 50%),
          radial-gradient(ellipse at var(--mesh-x4) var(--mesh-y4), var(--mesh-4) 0%, transparent 50%),
          var(--color-bg)
        `,
        willChange: '--mesh-x1, --mesh-y1, --mesh-x2, --mesh-y2',
      }}
    />
  );
}
