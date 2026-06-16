# Glassmorphism Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the entire 9Router dashboard UI to Glassmorphism Design with animated mesh gradient, glass effects, glow borders, and rich motion.

**Architecture:** Pure CSS approach using Tailwind v4 utilities, CSS custom properties for design tokens, CSS `@property` for mesh gradient animation, and two custom React hooks (`useIntersectionObserver`, `useTilt`) for JS-driven interactions.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, CSS @property, Intersection Observer API

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/app/globals.css` | Design tokens, glass utilities, @property, @keyframes, reduced motion |
| `src/shared/components/MeshBackground.js` | New — animated mesh gradient, fixed background |
| `src/shared/hooks/useIntersectionObserver.js` | New — entrance animation trigger |
| `src/shared/hooks/useTilt.js` | New — mouse-driven tilt/parallax |
| `src/shared/hooks/index.js` | Export new hooks |
| `src/app/layout.js` | Add MeshBackground to root layout |
| `src/shared/components/Card.js` | Apply glass styles |
| `src/shared/components/Sidebar.js` | Apply glass-strong styles |
| `src/shared/components/Modal.js` | Glass overlay + body, entrance animation |
| `src/shared/components/Button.js` | Glow shadows, glass for secondary/ghost |
| `src/shared/components/Input.js` | Glass background, focus glow |
| `src/shared/components/Select.js` | Glass background, focus glow |
| `src/shared/components/Tooltip.js` | Glass + entrance animation |

---

## Task 1: Design Tokens & Utility Classes in globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add CSS custom properties for glass tokens**

Add after the existing `.dark { ... }` block (after line ~89 in globals.css), before `@theme inline`:

```css
/* Glassmorphism Design Tokens */
:root {
  --glass-blur: 18px;
  --glass-bg: rgba(255, 255, 255, 0.65);
  --glass-bg-strong: rgba(255, 255, 255, 0.75);
  --glass-border: rgba(0, 0, 0, 0.06);
  --glass-border-hover: rgba(0, 0, 0, 0.12);
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  --glass-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
  --glow-primary: rgba(217, 119, 87, 0.3);
  --glow-purple: rgba(139, 92, 246, 0.25);
  --glow-blue: rgba(59, 130, 246, 0.25);
  --glow-amber: rgba(245, 158, 11, 0.25);
  --glow-green: rgba(16, 185, 129, 0.25);
  --mesh-1: rgba(217, 119, 87, 0.15);
  --mesh-2: rgba(139, 92, 246, 0.12);
  --mesh-3: rgba(59, 130, 246, 0.10);
  --mesh-4: rgba(245, 158, 11, 0.10);
  --transition-glass: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --mesh-duration: 20s;
  --entrance-duration: 0.5s;
  --entrance-easing: cubic-bezier(0.4, 0, 0.2, 1);
}
```

Update existing `.dark` block to ADD these glass tokens (append inside):

```css
.dark {
  /* ...existing dark tokens stay... */
  --glass-bg: rgba(255, 255, 255, 0.07);
  --glass-bg-strong: rgba(255, 255, 255, 0.10);
  --glass-border: rgba(255, 255, 255, 0.10);
  --glass-border-hover: rgba(255, 255, 255, 0.20);
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  --glass-shadow: 0 0 20px rgba(0, 0, 0, 0.2);
  --glow-primary: rgba(217, 119, 87, 0.35);
  --glow-purple: rgba(139, 92, 246, 0.30);
  --glow-blue: rgba(59, 130, 246, 0.30);
  --glow-amber: rgba(245, 158, 11, 0.30);
  --glow-green: rgba(16, 185, 129, 0.30);
  --mesh-1: rgba(217, 119, 87, 0.35);
  --mesh-2: rgba(139, 92, 246, 0.30);
  --mesh-3: rgba(59, 130, 246, 0.25);
  --mesh-4: rgba(245, 158, 11, 0.20);
}
```

Also update existing `:root` to change:
- `--color-bg: #FBF9F6` → `--color-bg: #F8F6F2`

And in `.dark`:
- `--color-bg: #191918` → `--color-bg: #0a0a1a`

- [ ] **Step 2: Add @property registrations for mesh animation**

Add at top of file (after imports, before `:root`):

```css
@property --mesh-x1 { syntax: '<percentage>'; inherits: false; initial-value: 20%; }
@property --mesh-y1 { syntax: '<percentage>'; inherits: false; initial-value: 30%; }
@property --mesh-x2 { syntax: '<percentage>'; inherits: false; initial-value: 70%; }
@property --mesh-y2 { syntax: '<percentage>'; inherits: false; initial-value: 60%; }
@property --mesh-x3 { syntax: '<percentage>'; inherits: false; initial-value: 40%; }
@property --mesh-y3 { syntax: '<percentage>'; inherits: false; initial-value: 80%; }
@property --mesh-x4 { syntax: '<percentage>'; inherits: false; initial-value: 80%; }
@property --mesh-y4 { syntax: '<percentage>'; inherits: false; initial-value: 20%; }
```

- [ ] **Step 3: Add glass utility classes**

Add after existing styles, before changelog styles:

```css
/* Glassmorphism Utilities */
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-highlight), var(--glass-shadow);
}

.glass-strong {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-highlight), var(--glass-shadow);
}

.glow-sm { box-shadow: var(--glass-highlight), 0 0 10px var(--glow-color, var(--glow-primary)); }
.glow-md { box-shadow: var(--glass-highlight), 0 0 20px var(--glow-color, var(--glow-primary)); }
.glow-lg { box-shadow: var(--glass-highlight), 0 0 30px var(--glow-color, var(--glow-primary)); }

.glow-primary { --glow-color: var(--glow-primary); }
.glow-purple { --glow-color: var(--glow-purple); }
.glow-blue { --glow-color: var(--glow-blue); }
.glow-amber { --glow-color: var(--glow-amber); }
```

- [ ] **Step 4: Add @keyframes and animation classes**

```css
/* Mesh gradient animation */
@keyframes mesh-move {
  0% {
    --mesh-x1: 20%; --mesh-y1: 30%;
    --mesh-x2: 70%; --mesh-y2: 60%;
    --mesh-x3: 40%; --mesh-y3: 80%;
    --mesh-x4: 80%; --mesh-y4: 20%;
  }
  100% {
    --mesh-x1: 40%; --mesh-y1: 60%;
    --mesh-x2: 30%; --mesh-y2: 30%;
    --mesh-x3: 70%; --mesh-y3: 40%;
    --mesh-x4: 50%; --mesh-y4: 70%;
  }
}

.animate-mesh {
  animation: mesh-move var(--mesh-duration) ease-in-out infinite alternate;
}

/* Glow pulse */
@keyframes glow-pulse {
  0%, 100% { box-shadow: var(--glass-highlight), 0 0 15px var(--glow-color, var(--glow-primary)); }
  50% { box-shadow: var(--glass-highlight), 0 0 25px var(--glow-color, var(--glow-primary)); }
}

.animate-glow-pulse {
  animation: glow-pulse 3s ease-in-out infinite;
}
.animate-glow-pulse:hover {
  animation: none;
  box-shadow: var(--glass-highlight), 0 0 30px var(--glow-color, var(--glow-primary));
}

/* Entrance animation */
[data-animate] {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity var(--entrance-duration) var(--entrance-easing),
              transform var(--entrance-duration) var(--entrance-easing);
}
[data-animate].animate-visible {
  opacity: 1;
  transform: translateY(0);
}

/* Modal entrance */
@keyframes modal-enter {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.animate-modal-enter {
  animation: modal-enter 0.25s ease-out forwards;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  .animate-mesh { animation: none; }
  [data-animate] { opacity: 1; transform: none; }
}
```

- [ ] **Step 5: Verify build compiles**

Run: `npm run build` (or `bun run build`)
Expected: No CSS errors

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(glass): add glassmorphism design tokens, utilities, and animations"
```

---

## Task 2: MeshBackground Component

**Files:**
- Create: `src/shared/components/MeshBackground.js`

- [ ] **Step 1: Create MeshBackground component**

```jsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/components/MeshBackground.js
git commit -m "feat(glass): add MeshBackground component"
```

---

## Task 3: Custom Hooks (useIntersectionObserver, useTilt)

**Files:**
- Create: `src/shared/hooks/useIntersectionObserver.js`
- Create: `src/shared/hooks/useTilt.js`
- Modify: `src/shared/hooks/index.js`

- [ ] **Step 1: Create useIntersectionObserver hook**

```js
"use client";

import { useEffect, useRef } from "react";

export function useIntersectionObserver(options = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("animate-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, ...options }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
```

- [ ] **Step 2: Create useTilt hook**

```js
"use client";

import { useEffect, useRef, useCallback } from "react";

export function useTilt({ max = 3.5, speed = 100, perspective = 1000 } = {}) {
  const ref = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    const rotateX = (-mouseY / (rect.height / 2)) * max;
    const rotateY = (mouseX / (rect.width / 2)) * max;

    el.style.transform = `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }, [max, perspective]);

  const handleMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg)`;
  }, [perspective]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.transition = `transform ${speed}ms ease-out`;
    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave, speed]);

  return ref;
}
```

- [ ] **Step 3: Update hooks index**

Replace `src/shared/hooks/index.js`:

```js
// Shared Hooks - Export all
export { useTheme } from "./useTheme";
export { useIntersectionObserver } from "./useIntersectionObserver";
export { useTilt } from "./useTilt";
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/hooks/
git commit -m "feat(glass): add useIntersectionObserver and useTilt hooks"
```

---

## Task 4: Integrate MeshBackground into Layout

**Files:**
- Modify: `src/app/layout.js`

- [ ] **Step 1: Add MeshBackground import and render**

Add import at top:
```js
import MeshBackground from "@/shared/components/MeshBackground";
```

Add `<MeshBackground />` as first child inside `<body>`:
```jsx
<body className={`${inter.variable} font-sans antialiased`}>
  <MeshBackground />
  <ThemeProvider>
    <RuntimeI18nProvider>
      {children}
    </RuntimeI18nProvider>
  </ThemeProvider>
</body>
```

- [ ] **Step 2: Verify app renders**

Run: `npm run dev` — open http://localhost:3000, verify mesh gradient is visible behind content.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.js
git commit -m "feat(glass): integrate MeshBackground into root layout"
```

---

## Task 5: Card Component Glass Upgrade

**Files:**
- Modify: `src/shared/components/Card.js`

- [ ] **Step 1: Update Card base classes**

Replace the className in the main `<div>`:

From:
```js
"bg-surface",
"border border-black/5 dark:border-white/5",
"rounded-lg shadow-sm",
hover && "hover:shadow-md hover:border-primary/30 transition-all cursor-pointer",
```

To:
```js
"glass rounded-2xl",
"transition-all duration-300",
hover && "hover:glow-md hover:border-[var(--glass-border-hover)] hover:-translate-y-0.5 cursor-pointer",
```

- [ ] **Step 2: Update Card.Section sub-component**

Replace classes from:
```js
"p-4 rounded-lg",
"bg-black/[0.02] dark:bg-white/[0.02]",
"border border-black/5 dark:border-white/5",
```

To:
```js
"p-4 rounded-xl",
"bg-white/5 dark:bg-white/[0.03]",
"border border-[var(--glass-border)]",
```

- [ ] **Step 3: Verify Card renders correctly**

Open dashboard in browser, check cards have glass effect with blur visible.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/Card.js
git commit -m "feat(glass): upgrade Card component to glassmorphism"
```

---

## Task 6: Sidebar Glass Upgrade

**Files:**
- Modify: `src/shared/components/Sidebar.js`

- [ ] **Step 1: Update aside element classes**

Replace:
```js
"flex w-72 flex-col border-r border-black/5 dark:border-white/5 bg-vibrancy backdrop-blur-xl transition-colors duration-300 min-h-full"
```

With:
```js
"flex w-72 flex-col glass-strong rounded-none sm:rounded-r-2xl transition-all duration-300 min-h-full glow-sm animate-glow-pulse"
```

- [ ] **Step 2: Update active nav item styling**

Replace active state class:
```js
"bg-primary/10 text-primary"
```

With:
```js
"bg-primary/15 dark:bg-primary/20 text-primary border border-primary/25 shadow-[0_0_8px_var(--glow-primary)]"
```

- [ ] **Step 3: Verify sidebar renders**

Check sidebar has glass effect, glow, and active item has glow border.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/Sidebar.js
git commit -m "feat(glass): upgrade Sidebar to glassmorphism"
```

---

## Task 7: Modal Glass Upgrade

**Files:**
- Modify: `src/shared/components/Modal.js`

- [ ] **Step 1: Update overlay classes**

Replace:
```js
"absolute inset-0 bg-black/30 backdrop-blur-sm"
```

With:
```js
"absolute inset-0 bg-black/30 backdrop-blur-[8px]"
```

- [ ] **Step 2: Update modal content classes**

Replace:
```js
"relative w-full bg-surface",
"border border-black/10 dark:border-white/10",
"rounded-xl shadow-2xl",
"animate-in fade-in zoom-in-95 duration-200",
```

With:
```js
"relative w-full glass-strong",
"rounded-2xl",
"shadow-[0_0_40px_var(--glow-purple)]",
"animate-modal-enter",
```

- [ ] **Step 3: Update header border**

Replace:
```js
"flex items-center justify-between p-2 border-b border-black/5 dark:border-white/5"
```

With:
```js
"flex items-center justify-between p-2 border-b border-[var(--glass-border)]"
```

- [ ] **Step 4: Update footer border**

Replace:
```js
"flex items-center justify-end gap-3 p-6 border-t border-black/5 dark:border-white/5"
```

With:
```js
"flex items-center justify-end gap-3 p-6 border-t border-[var(--glass-border)]"
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/Modal.js
git commit -m "feat(glass): upgrade Modal to glassmorphism with glow"
```

---

## Task 8: Button Glass Upgrade

**Files:**
- Modify: `src/shared/components/Button.js`

- [ ] **Step 1: Update button variants**

Replace the `variants` object:

```js
const variants = {
  primary: "bg-gradient-to-b from-primary to-primary-hover text-white shadow-[0_0_15px_var(--glow-primary)] hover:shadow-[0_0_25px_var(--glow-primary)] hover:-translate-y-0.5",
  secondary: "glass text-text-main hover:glow-md hover:border-[var(--glass-border-hover)]",
  outline: "glass text-text-main hover:glow-sm hover:border-[var(--glass-border-hover)]",
  ghost: "text-text-muted hover:bg-white/10 dark:hover:bg-white/5 hover:text-text-main",
  danger: "bg-red-500 text-white hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]",
};
```

- [ ] **Step 2: Update active/focus styles in base classes**

Replace:
```js
"active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
```

With:
```js
"active:scale-[0.98] focus:shadow-[0_0_0_3px_var(--glow-primary)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/Button.js
git commit -m "feat(glass): upgrade Button with glow shadows"
```

---

## Task 9: Input & Select Glass Upgrade

**Files:**
- Modify: `src/shared/components/Input.js`
- Modify: `src/shared/components/Select.js`

- [ ] **Step 1: Update Input classes**

Replace input element classes:

From:
```js
"bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-md",
"placeholder-text-muted/60",
"focus:ring-1 focus:ring-primary/30 focus:border-primary/50 focus:outline-none",
"transition-all shadow-inner disabled:opacity-50 disabled:cursor-not-allowed",
```

To:
```js
"bg-white/50 dark:bg-white/[0.04] backdrop-blur-[12px] border border-[var(--glass-border)] rounded-[10px]",
"placeholder-text-muted/60",
"focus:border-primary/50 focus:shadow-[0_0_12px_var(--glow-primary)] focus:outline-none",
"transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
```

- [ ] **Step 2: Update Select classes**

Replace select element classes:

From:
```js
"bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-md appearance-none",
"focus:ring-1 focus:ring-primary/30 focus:border-primary/50 focus:outline-none",
"transition-all disabled:opacity-50 disabled:cursor-not-allowed",
```

To:
```js
"bg-white/50 dark:bg-white/[0.04] backdrop-blur-[12px] border border-[var(--glass-border)] rounded-[10px] appearance-none",
"focus:border-primary/50 focus:shadow-[0_0_12px_var(--glow-primary)] focus:outline-none",
"transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/Input.js src/shared/components/Select.js
git commit -m "feat(glass): upgrade Input and Select with glass background and focus glow"
```

---

## Task 10: Tooltip Glass Upgrade

**Files:**
- Modify: `src/shared/components/Tooltip.js`

- [ ] **Step 1: Update Tooltip component**

Replace entire component:

```jsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/components/Tooltip.js
git commit -m "feat(glass): upgrade Tooltip with glass and glow"
```

---

## Task 11: Final Verification & Cleanup

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Visual verification**

Open http://localhost:3000/dashboard in browser:
- Verify mesh gradient animates in background
- Verify cards have glass effect (blur visible behind)
- Verify sidebar has glass-strong with glow
- Verify buttons have glow on hover
- Verify inputs have focus glow
- Verify modal has glass + purple glow
- Toggle dark/light mode — both should look correct
- Check `prefers-reduced-motion` — animations should stop

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(glass): glassmorphism design system complete"
```
