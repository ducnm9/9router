# Glassmorphism Design System — 9Router Dashboard

## Overview

Nâng cấp toàn bộ giao diện 9Router dashboard sang Glassmorphism Design với medium glass effect, mesh gradient background, glow borders, và rich motion animations. Approach: Pure CSS (không thêm dependency).

## Tech Context

- Next.js 16 (App Router), React 19, JavaScript
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- 42 shared components trong `src/shared/components/`
- Zustand theme store (light/dark toggle)
- Existing: macOS-inspired UI, terracotta primary (#D97757), đã có backdrop-blur nhẹ trên sidebar

## Design Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Phạm vi | Toàn bộ giao diện | Cards, Sidebar, Modal, Buttons, Inputs, Navbar — tất cả đều glass |
| Glass intensity | Medium (blur 16-20px, opacity 60-75%) | Cân bằng visual impact và readability |
| Background | Mesh gradient (animated) | Tạo depth cho glass elements show through |
| Color palette | Mix warm + cool | Giữ terracotta accent, mesh dùng cả tím/xanh/amber |
| Border style | Glow + box-shadow | Tăng intensity khi hover/focus, tạo interactive feel |
| Motion | Rich | Animated mesh, glow pulse, tilt/parallax, entrance animations |
| Approach | Pure CSS | Zero thêm dependency, GPU-accelerated, Tailwind v4 native |

## Design Tokens

### CSS Custom Properties

```css
:root {
  /* Glass - Light mode */
  --glass-blur: 18px;
  --glass-bg: rgba(255, 255, 255, 0.65);
  --glass-bg-strong: rgba(255, 255, 255, 0.75);
  --glass-border: rgba(0, 0, 0, 0.06);
  --glass-border-hover: rgba(0, 0, 0, 0.12);
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  --glass-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);

  /* Glow */
  --glow-primary: rgba(217, 119, 87, 0.3);
  --glow-purple: rgba(139, 92, 246, 0.25);
  --glow-blue: rgba(59, 130, 246, 0.25);
  --glow-amber: rgba(245, 158, 11, 0.25);
  --glow-green: rgba(16, 185, 129, 0.25);

  /* Mesh gradient colors */
  --mesh-1: rgba(217, 119, 87, 0.15);
  --mesh-2: rgba(139, 92, 246, 0.12);
  --mesh-3: rgba(59, 130, 246, 0.10);
  --mesh-4: rgba(245, 158, 11, 0.10);

  /* Base background */
  --bg-base: #F8F6F2;

  /* Motion */
  --transition-glass: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --mesh-duration: 20s;
  --entrance-duration: 0.5s;
  --entrance-easing: cubic-bezier(0.4, 0, 0.2, 1);
}

.dark {
  /* Glass - Dark mode */
  --glass-bg: rgba(255, 255, 255, 0.07);
  --glass-bg-strong: rgba(255, 255, 255, 0.10);
  --glass-border: rgba(255, 255, 255, 0.10);
  --glass-border-hover: rgba(255, 255, 255, 0.20);
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  --glass-shadow: 0 0 20px rgba(0, 0, 0, 0.2);

  /* Glow - brighter in dark */
  --glow-primary: rgba(217, 119, 87, 0.35);
  --glow-purple: rgba(139, 92, 246, 0.30);
  --glow-blue: rgba(59, 130, 246, 0.30);
  --glow-amber: rgba(245, 158, 11, 0.30);
  --glow-green: rgba(16, 185, 129, 0.30);

  /* Mesh gradient - stronger in dark */
  --mesh-1: rgba(217, 119, 87, 0.35);
  --mesh-2: rgba(139, 92, 246, 0.30);
  --mesh-3: rgba(59, 130, 246, 0.25);
  --mesh-4: rgba(245, 158, 11, 0.20);

  /* Base background - navy-black */
  --bg-base: #0a0a1a;
}
```

### Tailwind Utility Classes

Defined in `globals.css` via `@layer utilities`:

| Class | Effect |
|-------|--------|
| `.glass` | Base glass: bg + blur + border + highlight + shadow |
| `.glass-strong` | Higher opacity glass (sidebar, modal) |
| `.glow-sm` | `box-shadow: 0 0 10px var(--glow-color, var(--glow-primary))` |
| `.glow-md` | `box-shadow: 0 0 20px var(--glow-color, var(--glow-primary))` |
| `.glow-lg` | `box-shadow: 0 0 30px var(--glow-color, var(--glow-primary))` |
| `.glow-primary` | Sets `--glow-color: var(--glow-primary)` |
| `.glow-purple` | Sets `--glow-color: var(--glow-purple)` |
| `.glow-blue` | Sets `--glow-color: var(--glow-blue)` |
| `.glow-amber` | Sets `--glow-color: var(--glow-amber)` |
| `.animate-mesh` | Mesh gradient position animation |
| `.animate-entrance` | Fade + translateY entrance |
| `.animate-glow-pulse` | Subtle glow oscillation |
| `.animate-tilt` | Enable tilt on mouse (requires JS hook) |

**Glow composition:** Size classes (`.glow-sm/md/lg`) set the shadow spread. Color classes (`.glow-primary/purple/blue/amber`) set `--glow-color`. Combine: `class="glow-md glow-purple"` → 20px purple glow. Default color is primary (terracotta) if no color class specified.

## Mesh Gradient Background

### Implementation

Component `MeshBackground.js` placed in root layout (`src/app/layout.js`):

- Position: `fixed`, `inset-0`, `z-index: -1`, `pointer-events: none`
- 4 radial-gradient layers at different positions
- Animated via CSS `@property` registered custom properties for gradient positions
- Duration: 20s, `ease-in-out`, `infinite alternate`

### CSS @property Registration

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

### Firefox Fallback

Firefox không support `@property`. Fallback: dùng `background-position` animation (ít smooth hơn nhưng functional). Detect bằng JavaScript tại runtime:

```js
// In MeshBackground.js
const supportsAtProperty = CSS.registerProperty !== undefined;
```

Nếu không support: render mesh gradient với `background-position` animation thay vì `@property` interpolation. Gradient vẫn animate nhưng movement sẽ linear thay vì smooth easing trên từng blob.

### Performance

- `will-change: --mesh-x1, --mesh-y1, ...` (hoặc `transform` cho fallback)
- Single composite layer
- No repaint trigger for content above

## Component Specifications

### Card (`src/shared/components/Card.js`)

```
Base state:
  background: var(--glass-bg)
  backdrop-filter: blur(var(--glass-blur))
  border: 1px solid var(--glass-border)
  box-shadow: var(--glass-highlight), var(--glass-shadow)
  border-radius: 16px
  transition: var(--transition-glass)

Hover state:
  border-color: var(--glass-border-hover)
  box-shadow: var(--glass-highlight), 0 0 20px var(--glow-primary)
  transform: translateY(-1px)
```

### Sidebar (`src/shared/components/Sidebar.js`)

```
Base state:
  background: var(--glass-bg-strong)
  backdrop-filter: blur(var(--glass-blur))
  border: 1px solid var(--glass-border)
  box-shadow: var(--glass-highlight), 0 0 15px var(--glow-primary) (subtle, always on)
  border-radius: 16px

Active menu item:
  background: rgba(217, 119, 87, 0.15) (light) / rgba(217, 119, 87, 0.20) (dark)
  border: 1px solid rgba(217, 119, 87, 0.25)
  box-shadow: 0 0 8px var(--glow-primary)
```

### Modal (`src/shared/components/Modal.js`)

```
Overlay:
  background: rgba(0, 0, 0, 0.3)
  backdrop-filter: blur(8px)

Modal body:
  background: var(--glass-bg-strong)
  backdrop-filter: blur(24px)
  border: 1px solid var(--glass-border)
  box-shadow: 0 0 40px var(--glow-purple), var(--glass-highlight)
  border-radius: 20px

Entrance animation:
  from: opacity(0), scale(0.95), translateY(10px)
  to: opacity(1), scale(1), translateY(0)
  duration: 0.25s, ease-out
```

### Button (`src/shared/components/Button.js`)

```
Primary variant:
  background: solid #D97757 (giữ nguyên)
  box-shadow: 0 0 15px var(--glow-primary)
  hover: box-shadow intensity tăng, translateY(-1px)
  active: scale(0.98), glow giảm nhẹ
  focus: 0 0 0 3px var(--glow-primary) (glow ring)

Secondary/Ghost variant:
  background: var(--glass-bg)
  backdrop-filter: blur(var(--glass-blur))
  border: 1px solid var(--glass-border)
  hover: border glow, box-shadow 0 0 15px var(--glow-primary)
  active: scale(0.98)
  focus: glow ring

Transition: var(--transition-glass)
```

### Input / Select

```
Base state:
  background: var(--glass-bg) with lower opacity (50% light, 4% dark)
  backdrop-filter: blur(12px)
  border: 1px solid var(--glass-border)
  border-radius: 10px

Focus state:
  border-color: rgba(217, 119, 87, 0.5)
  box-shadow: 0 0 12px var(--glow-primary)
  transition: border-color 0.3s, box-shadow 0.3s
```

### Tooltip / Dropdown / Popover

```
Base:
  background: var(--glass-bg)
  backdrop-filter: blur(16px)
  border: 1px solid var(--glass-border)
  box-shadow: var(--glass-shadow), 0 0 10px var(--glow-purple)
  border-radius: 12px

Entrance:
  from: opacity(0), translateY(-4px)
  to: opacity(1), translateY(0)
  duration: 0.2s
```

## Animations & Motion

### Entrance Animations

Custom hook: `useIntersectionObserver`

```
Behavior:
  - Observe elements with [data-animate] attribute
  - When in viewport: add .animate-visible class
  - Trigger once only (unobserve after animation)

CSS:
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

Stagger:
  Cards in same row: transition-delay: calc(var(--stagger-index) * 50ms)
  Sidebar items: transition-delay: calc(var(--stagger-index) * 30ms)
```

### Tilt / Parallax

Custom hook: `useTilt`

```
Behavior:
  - Track mouse position relative to element center
  - Calculate rotateX/rotateY (max ±3.5 degrees)
  - Apply: transform: perspective(1000px) rotateX(Xdeg) rotateY(Ydeg)
  - Smooth: transition: transform 0.1s ease-out
  - Reset on mouse leave: rotate(0)

Applied to:
  - Stat cards (large)
  - Chart containers
  NOT applied to: buttons, inputs, small elements
```

### Glow Pulse

```css
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 15px var(--glow-color, var(--glow-primary)); }
  50% { box-shadow: 0 0 25px var(--glow-color, var(--glow-primary)); }
}

.animate-glow-pulse {
  animation: glow-pulse 3s ease-in-out infinite;
}

/* Hover overrides pulse */
.animate-glow-pulse:hover {
  animation: none;
  box-shadow: 0 0 30px var(--glow-color, var(--glow-primary));
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  .animate-mesh { animation: none; }
  [data-animate] { opacity: 1; transform: none; }
}
```

## Light Mode vs Dark Mode

### Light Mode

| Property | Value |
|----------|-------|
| Glass bg | `rgba(255,255,255, 0.60-0.70)` |
| Glass border | `rgba(0,0,0, 0.06-0.10)` |
| Mesh gradient opacity | 0.10-0.20 |
| Glow visibility | Subtle, mostly on hover |
| Inner highlight | Strong (`white/50%`) |
| Base background | `#F8F6F2` |
| Text colors | Existing dark text (unchanged) |
| Glow pulse | Disabled (only hover glow) |

### Dark Mode

| Property | Value |
|----------|-------|
| Glass bg | `rgba(255,255,255, 0.05-0.10)` |
| Glass border | `rgba(255,255,255, 0.10-0.15)` |
| Mesh gradient opacity | 0.25-0.40 |
| Glow visibility | Always visible, stronger on hover |
| Inner highlight | Subtle (`white/6-8%`) |
| Base background | `#0a0a1a` (navy-black) |
| Text colors | `white/90%` headings, `white/60%` secondary |
| Glow pulse | Active on idle elements |

### Theme Transition

- Glass elements: `transition: background 0.5s, border-color 0.3s, box-shadow 0.3s`
- Mesh gradient: crossfade via opacity transition on the MeshBackground component

## Accessibility

- WCAG AA contrast ratio cho text trên glass backgrounds ở cả 2 modes
- `@media (prefers-reduced-motion: reduce)` tắt tất cả animations
- Focus states dùng glow ring (visible, meets focus indicator requirements)
- Glass opacity đủ cao để text luôn readable trên mọi background position

## Browser Support

| Feature | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| `backdrop-filter` | 76+ | 9+ | 103+ | 79+ |
| CSS `@property` | 85+ | 15.4+ | Not supported | 85+ |
| Mesh animation | Full | Full | Fallback (bg-position) | Full |
| `will-change` | All | All | All | All |

Firefox fallback: mesh gradient vẫn hiển thị nhưng animation dùng `background-position` thay vì `@property` interpolation.

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/globals.css` | Design tokens, utility classes, @property, @keyframes |
| `src/app/layout.js` | Add MeshBackground component |
| `src/shared/components/MeshBackground.js` | **New** — animated mesh gradient background |
| `src/shared/components/Card.js` | Apply glass classes |
| `src/shared/components/Sidebar.js` | Apply glass-strong, glow |
| `src/shared/components/Modal.js` | Glass overlay + body, entrance animation |
| `src/shared/components/Button.js` | Glow shadow, glass for secondary/ghost |
| `src/shared/hooks/useIntersectionObserver.js` | **New** — entrance animation observer |
| `src/shared/hooks/useTilt.js` | **New** — mouse-driven tilt effect |
| `src/shared/hooks/index.js` | Export new hooks |
| `src/shared/components/Input.js` | Glass background, focus glow |
| `src/shared/components/Select.js` | Glass background, focus glow |
| `src/shared/components/Tooltip.js` | Glass + entrance animation |
| `src/store/themeStore.js` | No change needed (existing toggle works) |

## Out of Scope

- Không thay đổi layout/routing structure
- Không thay đổi business logic
- Không thêm external dependencies
- Không redesign component API (chỉ style changes)
- Không thay đổi typography system (fonts giữ nguyên)
- Landing page (`src/app/landing/`) — riêng biệt, không trong scope lần này
