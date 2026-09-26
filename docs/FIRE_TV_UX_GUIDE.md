# Fire TV 10-Foot UX & Remote Navigation Guide

## 1. 10-Foot Viewing Principles
- **Distance Readability:** Viewers sit 6–10 feet from the television. Minimum body text size is `22sp`; card headlines are `26sp+`; hero titles are `34sp+`.
- **5% Overscan Safe Zone:** Keep all interactive cards and badges at least `48px` from left/right edges and `28px` from top/bottom edges.
- **High-Contrast Focus Ring:** Every focusable element (`Pressable`) must render a `2px` high-contrast amber border (`#F59E0B`) and subtle `1.02x` scale transform when focused via D-pad.

## 2. Fire TV Remote Key Mapping
| Remote Button | Key Event (`react-native-tvos`) | Wisp Action |
| :--- | :--- | :--- |
| **Menu** / **Long Select** | `menu` / `longSelect` | Toggle Wisp Contextual Overlay Drawer |
| **D-Pad Up / Down** | Native Spatial Focus | Navigate between Quick Action Chips |
| **D-Pad Left / Right** | Native Spatial Focus | Switch Household Profile Mode (`Quick Glance` / `Deep Lore` / `Family`) |
| **Select (Center)** | `select` | Trigger highlighted Quick Action Chip |
| **Back** | `back` | Dismiss Wisp Drawer and return focus to video playback |
| **Play / Pause** | `playPause` | Pause or resume video playback |
