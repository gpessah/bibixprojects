import type { Branding } from '@prisma/client';

export function brandingToCssVars(b: Branding): string {
  return [
    `--color-bg:${b.bgColor}`,
    `--color-surface:${b.surfaceColor}`,
    `--color-border:${b.borderColor}`,
    `--color-text:${b.textColor}`,
    `--color-muted:${b.mutedColor}`,
    `--color-primary:${b.primaryColor}`,
    `--color-accent:${b.accentColor}`,
    `--font-sans:${b.fontFamily}`,
    `--radius-card:${b.cardRadius}px`,
  ].join(';');
}
