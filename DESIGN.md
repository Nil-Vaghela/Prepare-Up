# Prepare‑Up Design System

This document defines the **visual and interaction standards** for Prepare‑Up.
The goal is consistency, readability, and speed — not experimentation per page.

If something is not defined here, **do not invent a new style**. Extend this file instead.

---

## 1. Design Philosophy

- **Dark-first** interface (black base)
- **Glassmorphism** for structure, not decoration
- **Content > Animation** (animation must never hurt readability)
- **Few colors, many opacities**
- **One system, reused everywhere**

Prepare‑Up should feel:
- Calm
- Premium
- Focused
- Technical, not playful

---

## 2. Color System

### Base Colors
These are the only base colors allowed.

| Token | Value | Usage |
|------|------|------|
| `--pu-bg` | `#07070b` | App background |
| `--pu-text` | `rgba(255,255,255,0.92)` | Primary text |
| `--pu-muted` | `rgba(255,255,255,0.62)` | Secondary text |

### Accent Colors (use sparingly)
Accents are **never backgrounds** — only highlights.

| Token | Value | Usage |
|------|------|------|
| `--pu-accent-1` | `#ee0979` | Active states, emphasis |
| `--pu-accent-2` | `#ff6a00` | Secondary emphasis |

❌ Do NOT add new brand colors without discussion.

---

## 3. Glass System (Core)

Glass is the foundation of the UI. All panels, cards, drawers, and sidebars use it.

### CSS Tokens
Defined in `frontend/app/globals.css`:

```css
--pu-glass: rgba(255, 255, 255, 0.075);
--pu-glass-strong: rgba(255, 255, 255, 0.10);
--pu-glass-soft: rgba(255, 255, 255, 0.055);
--pu-border: rgba(255, 255, 255, 0.14);
--pu-border-soft: rgba(255, 255, 255, 0.10);
--pu-blur: 22px;
--pu-sat: 150%;
```

### Usage Rules

| Class | Purpose |
|------|--------|
| `pu-glass` | Base glass (required) |
| `pu-glass--panel` | Main sections |
| `pu-glass--card` | Smaller grouped items |
| `pu-glass--strong` | When background needs more separation |
| `pu-glass--soft` | When animation should show through |
| `pu-glass--hover` | Clickable elements only |

✅ Correct:
```tsx
<div className="pu-glass pu-glass--panel">...</div>
```

❌ Incorrect:
- Custom `backdrop-filter` per component
- Inline RGBA glass values

---

## 4. Layout Rules

### Scrolling
- **No global page scroll**
- Each column controls its own scroll:
  - Recent chats
  - Chat messages

### Chat Layout
- **User messages:** left
- **AI responses:** right
- Message container scrolls independently

### Drawers
- Right-side drawers **overlay**, never push content
- Always glass
- Close on outside click

---

## 5. Typography

### Font Philosophy
- Neutral
- Highly readable
- System-first (fast, no FOUC)

### Defaults

| Element | Style |
|------|------|
| Body | 14–15px, normal weight |
| Headings | Slightly heavier, no extreme sizes |
| Line height | 1.5–1.6 |

❌ Do not use decorative fonts in the dashboard.

---

## 6. Animation Rules

Animation exists only when it **adds meaning**.

### Allowed
- Background shader (subtle)
- Hover transitions
- Drawer open/close

### Forbidden
- Text distortion
- Moving backgrounds behind long content
- Auto-playing attention grabbers

If animation hurts reading → remove it.

---

## 7. Component Responsibilities

| Component | Responsibility |
|--------|---------------|
| Sidebar | Navigation only |
| Chat | Conversation only |
| Right Drawer | Actions / outputs |
| Shader | Ambient depth only |

No component should do more than one job.

---

## 8. How to Extend the System

When you need a new style:
1. Update `globals.css` tokens
2. Document it here
3. Use everywhere

Never:
- Add inline colors
- Copy glass CSS into components
- Hardcode opacity values

---

## 9. Enforcement

PRs may be rejected if they:
- Introduce new glass styles
- Break layout rules
- Reduce readability

Consistency > creativity.

---

**This file is the source of truth for UI decisions.**
If something feels off, update the system — not the page.
