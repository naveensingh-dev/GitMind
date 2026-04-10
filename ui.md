# GitMind — UI Enhancement Roadmap

> A curated set of UX/UI improvements we can apply to take the interface from "great" to "world-class."

---

## 🟢 Quick Wins (Low effort, High impact)

### 1. Animated Welcome / Onboarding Hero
**Current:** Static rocket emoji + two lines of plain text when no analysis is loaded.  
**Proposed:** Replace with a rich animated hero — a subtle pulsing gradient ring, a typing-cursor animation on the tagline, and a glowing "Enter PR URL" call-to-action that invites interaction.  
**Files:** `app.component.html` (placeholder section), `styles.css`

---

### 2. Tab Badge Counters
**Current:** Security / Performance / Style tabs have no visual indicator of how many issues exist.  
**Proposed:** Show small colored numeric badges (e.g., `🔐 3`) on each tab rail button — red for high severity tabs, yellow for medium — so the user immediately sees where attention is needed without clicking through each tab.  
**Files:** `tabs-bar.component.ts`

---

### 3. Floating Banner Polish
**Current:** The staged-fixes floating banner uses raw inline styles inside the HTML.  
**Proposed:** Extract it into its own `<app-staged-fixes-banner>` component with a proper CSS class, and add a slide-up entry + count-bounce animation so it feels premium when fixes are staged.  
**Files:** `app.component.html`, new `staged-fixes-banner` component

---

### 4. Empty States with Illustrations
**Current:** Empty-state tabs show a single emoji + text.  
**Proposed:** Replace with purpose-built mini SVG illustrations (e.g., a magnifying glass for Diff, a shield for Security) + a subtle pulsing glow effect to feel alive even when empty.  
**Files:** `styles.css`, each tab-panel in `app.component.html`

---

### 5. Review Card Severity Color Strips
**Current:** Severity is shown as a text badge only.  
**Proposed:** Add a 3px colored left-border accent to each review card (red = high, yellow = medium, cyan = low). This makes severity scannable at a glance without reading any text — a pattern used in VS Code's problem panel.  
**Files:** `review-panel.component.html/.css`

---

## 🟡 Medium Effort (Moderate complexity, strong UX improvement)

### 6. Global Search / Command Palette
**Current:** No way to search across findings, files, or history.  
**Proposed:** `Cmd+K` opens a floating search palette that searches across: review findings, file names in diff, and past history records. Results appear in grouped sections with subtle icons. Blur-out background for focus.  
**Files:** New `command-palette` component, keyboard listener in root

---

### 7. Agent Console Progress Steps
**Current:** The activity log is a raw list of text messages.  
**Proposed:** During analysis, display a vertical "pipeline stepper" viz showing each LangGraph node (Fetch → Security Scan → Performance → Critique → Done) with an animated spinner on the active node and green checkmarks on completed ones.  
**Files:** `activity-log.component`, `thinking-logs.component`

---

### 8. Diff Viewer Syntax Highlighting
**Current:** The diff is displayed with basic +/- color coding but no language-aware syntax highlighting.  
**Proposed:** Integrate `highlight.js` (already installed) to tokenize each line of the diff with language-specific colors (e.g., keywords in purple, strings in green) while preserving the +/- addition/deletion backgrounds.  
**Files:** `diff-viewer.component.ts`

---

### 9. Collapsible Review Cards
**Current:** All review cards in Security/Performance/Style tabs are always fully expanded.  
**Proposed:** Cards start collapsed (showing just the issue headline + severity badge). Click to expand the full code block and fix suggestion. Reduces cognitive overload when there are 10+ findings.  
**Files:** `review-panel.component.html`

---

### 10. History Row Hover Preview
**Current:** History rows simply highlight on hover.  
**Proposed:** Show a subtle right-side tooltip/popover on hover that previews: approval status, finding counts (Security: 3, Perf: 1, Style: 7), and the model used — before the user actually clicks the row to load it.  
**Files:** `analysis-history.component.html`, new tooltip CSS

---

### 11. Dark/Light Mode Toggle
**Current:** GitMind is strictly dark-mode only.  
**Proposed:** Add a theme toggle in the header that switches to a sleek light mode — a warm off-white background, dark text, with the same neon green accent colors applied more subtly. CSS custom properties already support this cleanly.  
**Files:** `styles.css` (add `[data-theme=light]` variables), `header.component`

---

## 🔴 Advanced Features (Higher effort, transformational UX)

### 12. Animated Score Ring on Summary Tab
**Current:** Confidence score is shown as plain text `100%`.  
**Proposed:** Render the confidence score as an animated SVG ring/donut chart that fills on load with a spring-easing animation. Color transitions from red → yellow → green based on score. Adds immediate visual impact to the most important metric.  
**Files:** `summary-tab.component`

---

### 13. Diff Minimap
**Current:** Large diffs require heavy scrolling with no spatial overview.  
**Proposed:** Add a thin scroll-synchronized "minimap" on the right edge of the diff viewer (like VS Code) showing a compressed overview of all changes — where additions are green pixels and deletions are red. Clicking the minimap jumps to that location.  
**Files:** `diff-viewer.component`

---

### 14. Sparkline Trend Charts in Analytics Tab
**Current:** Analytics tab shows aggregate numbers.  
**Proposed:** Add mini sparkline line charts (built with SVG paths, no library needed) showing trend over time for: total issues found, high severity count, and confidence score — using the history data already stored in SQLite.  
**Files:** `analytics.component`, `api.service.ts` (expose trend endpoint)

---

### 15. Keyboard Navigation
**Current:** Entirely mouse-driven.  
**Proposed:** Full keyboard navigation: `←/→` or `[/]` to switch tabs, `J/K` to navigate between review cards (like GitHub), `F` to jump to file tree, `Enter` to expand a card. Accessibility-first and very developer-friendly.  
**Files:** `app.component.ts` (keyboard event listeners), tabs and review components

---

### 16. Issue-to-Diff Line Linking
**Current:** Review findings and the diff viewer are disconnected — you have to manually find where the issue is.  
**Proposed:** Each review card gets a "Jump to line →" button. Clicking it: switches to the Diff tab, scrolls to the exact file + line number, and highlights the specific line with a pulsing yellow glow for 2 seconds.  
**Files:** `review-panel.component`, `diff-viewer.component`, `app.component.ts`

---

### 17. Floating Fix Preview Drawer
**Current:** The "Apply Fix" button applies changes directly without letting you preview.  
**Proposed:** Clicking "Stage Fix" opens a slide-in right drawer showing a split-view before/after comparison (old code → proposed fixed code) with syntax highlighting. User can accept or dismiss before staging.  
**Files:** New `fix-preview-drawer` component, `app.component.html`

---

## 🎨 Visual Polish & Micro-animations

### 18. Smooth Tab Transitions
Add a `translateX` slide or `fadeIn` animation when switching between tabs instead of the instant swap currently. Duration: `180ms ease`.

### 19. Skeleton Loader for History Table
Show an animated shimmer skeleton grid (matching the 6 columns) while history is loading, instead of showing nothing.

### 20. Neon Glow on Active Rail Button
The active tab in the icon rail currently uses a plain colored background. Add a subtle neon glow (`box-shadow: 0 0 12px var(--tab-color)`) animation that pulses gently on the active tab — reinforcing the GitMind cyberpunk aesthetic.

### 21. Hover Ripple on Action Buttons
Add a CSS ripple effect to all primary buttons (Fetch, Analyze, Push to GitHub) triggered on mousedown — similar to Material Design but custom, staying consistent with the dark glassmorphic theme.

---

## Priority Matrix

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| Tab Badge Counters | 🔥 High | ⚡ Low | **P1** |
| Animated Hero | 🔥 High | ⚡ Low | **P1** |
| Collapsible Review Cards | 🔥 High | 🔶 Medium | **P1** |
| Issue-to-Diff Line Linking | 🔥 High | 🔶 Medium | **P1** |
| Animated Score Ring | 🔥 High | 🔶 Medium | **P2** |
| History Row Hover Preview | 🟡 Medium | ⚡ Low | **P2** |
| Syntax Highlighted Diff | 🔥 High | 🔶 Medium | **P2** |
| Dark/Light Mode Toggle | 🟡 Medium | 🔶 Medium | **P2** |
| Command Palette | 🔥 High | 🔴 High | **P3** |
| Diff Minimap | 🟡 Medium | 🔴 High | **P3** |
| Keyboard Navigation | 🟡 Medium | 🔴 High | **P3** |
