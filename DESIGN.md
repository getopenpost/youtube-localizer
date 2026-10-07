---
name: YouTube Localizer
description: A compact Studio companion and translation review workspace.
colors:
  primary: 'oklch(0.4 0.13 45)'
  primary-soft: 'oklch(0.92 0.035 45)'
  canvas: 'oklch(0.985 0.008 50)'
  surface: 'oklch(0.998 0.002 50)'
  text: 'oklch(0.2 0.015 50)'
  muted: 'oklch(0.44 0.02 50)'
  line: 'oklch(0.78 0.018 50)'
  success: 'oklch(0.35 0.1 155)'
  danger: 'oklch(0.53 0.19 25)'
  dark-primary: 'oklch(0.76 0.14 45)'
  dark-canvas: 'oklch(0.15 0.012 50)'
  dark-surface: 'oklch(0.19 0.013 50)'
  dark-text: 'oklch(0.96 0.008 95)'
  dark-muted: 'oklch(0.74 0.018 50)'
  dark-line: 'oklch(0.36 0.016 50)'
typography:
  headline:
    fontFamily: 'Geist Variable, Geist, sans-serif'
    fontSize: '28px'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  title:
    fontFamily: 'Geist Variable, Geist, sans-serif'
    fontSize: '18px'
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: 'Geist Variable, Geist, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Geist Variable, Geist, sans-serif'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.55
rounded:
  control: '6px'
  panel: '12px'
spacing:
  small: '8px'
  group: '16px'
  section: '24px'
  column: '32px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '6px 12px'
    height: 'var(--theme-control-height)'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    padding: '6px 12px'
---

# Design system

## Overview

OpenPost’s shared Dither UI, as a compact editing utility beside Studio, with a wider review workspace in a full extension tab. OpenPost's warm neutral colours and burnt-orange accent carry the family connection. The interface follows the operating system's light or dark preference.

Rows expose video state. Source text and editable translations stay close enough to compare. Thumbnail steps appear only when thumbnails are selected. The primary action names the next operation and remains available below the review cards. Settings hides advanced controls. Review uses flat sections and spacing, with explanations only for actionable failures.

## Colors

The accent marks actions and current workflow steps. Neutral surfaces and thin separators group work. Green marks preserved, approved and verified states. Red marks errors or unresolved evidence. Placeholder text uses the normal foreground when its darker background would reduce contrast.

Dark mode preserves the same reading order and control hierarchy. Its accent uses dark text on filled buttons.

## Typography

Geist is bundled locally. Body copy uses the body token; forms and help text use smaller labels. Settings and Review headings use 24px. The thumbnail composer uses 28px. Counts use tabular numerals. Translated text uses automatic direction.

## Layout

The side panel has 20px horizontal padding. Full pages cap at 1120px with 32px gutters; Settings caps at 720px. The thumbnail composer stacks below 700px. Review has a 240–320px source column and a flexible target column. Below 600px it stacks the source and targets and uses 20px gutters. Below 350px the side panel trims header and row spacing.

## Elevation & Depth

There are no shadows. Surface tones and thin borders separate comparisons and forms. Video rows use separators rather than individual cards.

## Shapes

Controls use the control radius. Review sections are flat, without an enclosing border or radius. Small thumbnails use tighter corners. Avoid nested review containers.

## Components

Shared buttons use 36px height at desktop sizes and 44px below the md breakpoint or with coarse pointers. Supporting buttons use a neutral fill and thin border. Keyboard focus uses the package’s 2px ring. Disabled controls use the shared disabled tokens.

Native inputs have persistent labels. Approval uses Svelte state while the command persists, then reconciles with stored state. Unsaved wording prevents approval. File buttons retain visible keyboard focus. Reduced-motion settings are respected; progress updates do not animate layout.

Status labels distinguish discovery, missing components, generation, approval, application and verification. An unreadable target never looks empty. The About area contains privacy information and an OpenPost CTA.

## Do's and Don'ts

- Use component-level approval and explicit error recovery.
- Keep source content visible during review.
- Keep OpenPost promotion in About and onboarding.
- Require explicit acknowledgment only when a previous paid request has an uncertain outcome.
- Do not treat imported history as Studio authority.
- Do not imply translated packaging includes translated audio.

Editable text uses the source preview as its canvas. Text fields stay visible; box geometry and typography sit under Adjust layout. Dragging is optional, numeric controls provide keyboard access. Invalid or overflowing text prevents layout approval.

## Shared system

`@openpost/ui` owns controls, icons, theme manifests and CSS recipes. The fixed Dither family follows system light/dark appearance. Tokens above describe its default palette; the runtime package remains authoritative. Bundle Geist Variable, Geist Mono Variable and Manrope Variable for theme resolution. Keep authored image fonts separate from UI fonts so changing interface typography cannot alter thumbnail composition.

Extension CSS owns composition, with namespaced aliases for theme colors. Native select and checkbox controls use package primitives. Keep one next action and remove generic explanatory copy. Video context remains generation data, without a disclosure or channel subtitle in the thumbnail form. Preview mode has no banner.

Shared focal controls use `actionFocalInk`, 36px desktop height and 44px below md or with coarse pointers, with the package’s 2px focus ring. Settings and Review headings are 24px. Review sections have no enclosing border or radius. The thumbnail composer stacks at 700px. Source tokens: `packages/ui/src/lib/themes/builtins/dither.ts`, `components/button/button.svelte` and `style.css` in OpenPost.
