import * as Lucide from 'lucide-react';
import type { LucideProps } from 'lucide-react';

// Render a lucide icon by string name. Falls back to Sparkles if unknown.
export function Icon({ name, ...rest }: { name?: string | null } & LucideProps) {
  const key = (name && (Lucide as any)[name] ? name : 'Sparkles') as keyof typeof Lucide;
  const Cmp = Lucide[key] as React.ComponentType<LucideProps>;
  return <Cmp {...rest} />;
}

// Curated list shown in admin pickers.
export const ICON_CHOICES = [
  'Heart',
  'Rocket',
  'LayoutGrid',
  'Code2',
  'ShieldCheck',
  'Globe',
  'Users',
  'Sparkles',
  'Trophy',
  'Star',
  'Briefcase',
  'BookOpen',
  'Compass',
  'Target',
  'Zap',
  'Flag',
  'Coffee',
  'Building2',
  'Cpu',
  'GraduationCap',
] as const;
