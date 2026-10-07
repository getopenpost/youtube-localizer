---
name: YouTube Localizer
description: A compact Studio companion and translation review workspace.
colors:
  primary: '#a44218'
  primary-soft: '#fceee5'
  canvas: '#faf9f6'
  surface: '#ffffff'
  text: '#24221f'
  muted: '#6b655e'
  line: '#ddd7ce'
  success: '#31643e'
  danger: '#a2352b'
  dark-primary: '#f6a071'
  dark-canvas: '#191816'
  dark-surface: '#22211e'
  dark-text: '#f3efe8'
  dark-muted: '#b7afa5'
  dark-line: '#48423b'
typography:
  headline:
    fontFamily: 'Geist, sans-serif'
    fontSize: '28px'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  title:
    fontFamily: 'Geist, sans-serif'
    fontSize: '18px'
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: 'Geist, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Geist, sans-serif'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.55
rounded:
  control: '7px'
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
    padding: '8px 13px'
    height: '38px'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    padding: '8px 13px'
---

# Design system

## Overview

A compact editing utility beside Studio, with a wider review workspace in a full extension tab. OpenPost's warm neutral colours and burnt-orange accent carry the family connection. The interface follows the operating system's light or dark preference.

Rows expose video state. Source text and editable translations stay close enough to compare. Thumbnail steps appear only when thumbnails are selected. The primary action names the next operation and remains available below the review cards.

## Colors

The accent marks actions and current workflow steps. Neutral surfaces and thin separators group work. Green marks preserved, approved and verified states. Red marks errors or unresolved evidence. Placeholder text uses the normal foreground when its darker background would reduce contrast.

Dark mode preserves the same reading order and control hierarchy. Its accent uses dark text on filled buttons.

## Typography

Geist is bundled locally. Body copy uses the body token; forms and help text use smaller labels. Main full-page headings use 32–34px on wider screens and 28px on narrow screens. Counts use tabular numerals. Translated text uses automatic direction.

## Layout

The side panel has 20px horizontal padding. Full pages cap at 1120px with 32px gutters; Settings caps at 840px. Review has a 240–320px source column and a flexible target column. Below 600px it stacks the source and targets and uses 20px gutters. Below 350px the side panel trims header and row spacing.

## Elevation & Depth

There are no shadows. Surface tones and thin borders separate comparisons and forms. Video rows use separators rather than individual cards.

## Shapes

Controls use the control radius. Review panels use the panel radius. Small thumbnails use tighter corners. Avoid nested review containers.

## Components

Buttons have a visible focus outline, a 38px minimum height, and explicit disabled states. Secondary buttons use a neutral fill and thin border. Keyboard focus uses a 2px accent outline with a 3px offset.

Native inputs have persistent labels. Approval uses React's optimistic state while the command persists, then reconciles with stored state. Unsaved wording prevents approval. File buttons retain visible keyboard focus. Reduced-motion settings are respected; progress updates do not animate layout.

Status labels distinguish discovery, missing components, generation, approval, application and verification. An unreadable target never looks empty. The About area contains privacy information and an OpenPost CTA.

## Do's and Don'ts

- Use component-level approval and explicit error recovery.
- Keep source content visible during review.
- Keep OpenPost promotion in About and onboarding.
- Show provider costs and uncertain outcomes before a new request.
- Do not treat imported history as Studio authority.
- Do not imply translated packaging includes translated audio.
