# Wisp Frontend (React Native for Amazon Fire TV)

This workspace contains the 10-foot **React Native + TypeScript** client built on `react-native-tvos` for **Amazon Fire OS** (with clean portability to **Vega OS**).

## 10-Foot UX Principles

1. **Zero-Typing First**: Pressing the **Menu** or **Select** button on the Fire TV remote opens the Wisp drawer in `<100ms` with pre-computed scene context and 3–4 D-pad focusable Quick Action Chips.
2. **Overscan & Distance Readability**: All UI overlays respect a 5% TV overscan safe margin (`48px` horizontal, `27px` vertical on 1080p) and use `>= 22sp` body typography with high-contrast amber/cyan focus rings.
3. **Minimal Playback Disruption**: The video continues playing (or dims subtly) in the background while the translucent side overlay presents grounded, spoiler-safe answers.
