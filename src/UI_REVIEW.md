# UI Review Report: LUM (Local Universal Machine)

This report summarizes the UI/UX architecture and current state of the LUM project as of May 2, 2026.

## 1. Core Architecture & Tech Stack
- **Framework**: React 19 with TypeScript.
- **Styling**: Tailwind CSS v4 (using modern tokens over magic-pixel values).
- **Component Library**: shadcn/ui (Radix UI primitives) customized for a dark "terminal" palette (`#0d1117`).
- **Layout Management**: `react-resizable-panels` for flexible terminal/panel splits; `framer-motion` for smooth transitions.
- **State Management**: Heavily driven by custom hooks (`useTabManager`, `useAutoHealing`, `usePrivacyLedger`, etc.) to separate logic from components.

## 2. Key UI/UX Innovations
- **Warp-style Input Bar (`WarpInputBar.tsx`)**:
  - Implements a transparent input with a syntax-highlighted overlay.
  - **Smart Routing**: Uses prefixes for intent detection:
    - `!` : Force Shell
    - `@` : Force AI
    - `#` : AI Command Suggestion
    - `?` : Explanation
    - `>>`: AI Agent (ReAct loop)
    - Default: `inputRouter.ts` automatically detects if a command is "coding intent" or "shell intent".
- **Privacy Ledger (`PrivacyLedgerBadge.tsx`)**:
  - A dedicated UI element in the header that tracks and visualizes the percentage of on-device vs. cloud AI usage, reinforcing the project's "Privacy First" moat.
- **Dynamic AI Streams (`AIBlockStream.tsx`)**:
  - Not just a chat; it renders `EditBlockCard` (SEARCH/REPLACE diffs) and `ToolCallCard` (MCP tool executions) inline, allowing for an interactive "thought process" visualization.
- **Self-Healing Workflow**:
  - Terminal errors are detected by `useAutoHealing`, triggering an amber-toned `HealingPanel` that offers one-click AI fixes.

## 3. Design System & Accessibility
- **Typography**: Uses Tailwind standard tokens (`text-xs`, `text-sm`) instead of fixed pixels for better scalability.
- **Interactivity**: All interactive elements follow the `focus-visible:ring-1` pattern.
- **Modals**: Centralized via shadcn `Dialog`, ensuring consistent backdrops and focus trapping.
- **Iconography**: Uses `lucide-react`, grouped logically in the header using `ToolbarIconButton` and `ToolbarSeparator`.

## 4. Observations & Suggested Improvements
- **`App.tsx` Complexity**: The main `App.tsx` is ~1150 lines and manages nearly all global overlays. 
  - *Recommendation*: Decompose `App.tsx` into sub-components like `AppHeader`, `AppTabBar`, and `OverlayManager`.
- **Configuration Consistency**: Some UI preferences (e.g., `aiChatFontSize`, `fileExplorer` visibility) use `localStorage`, while others (e.g., `showReasoning`) use the Rust-backed `load_app_config`.
  - *Recommendation*: Consolidate all user preferences into the centralized `.lum_config.json` via the Rust backend for better portability and sync.
- **Advanced Features Discoverability**: The "Advanced" popover in the toolbar is a great way to reduce clutter, but users might miss new features.
  - *Recommendation*: Consider a "What's New" badge or a more prominent "Discover" mode for first-time users or after updates.

## 5. Summary
LUM's UI is a high-fidelity, performance-oriented interface that successfully bridges the gap between a traditional terminal and a modern AI-agent workspace. The integration of hardware specs and privacy metrics directly into the header makes it feel like a "pro" tool for AI power users.
