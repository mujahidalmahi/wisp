# Playbook: Fire TV 10-Foot UI Agent

## Scope
`frontend/src/**`

## Responsibilities
1. Build and verify 10-foot television components using `react-native-tvos`.
2. Ensure every interactive element supports D-pad focus (`onFocus`, `onBlur`, `hasTVPreferredFocus`) with a visible high-contrast focus ring (`#F59E0B`).
3. Enforce overscan safe margins (`48px` horizontal, `28px` vertical) and distance-readable font sizes (`>= 22sp` body).
4. Never introduce touch-only gestures (swipe, pinch, hover) or tiny mobile touch targets.
