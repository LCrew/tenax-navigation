import type { Icon, Warning, WarningLevel } from '../../../shared/schema';

/** Name and default icon of each warning level, lowest first. Colours live in WarningDialog.css (.lvl--*). */
export const LEVELS: Record<WarningLevel, { label: string; icon: string }> = {
  notice: { label: 'Notice', icon: 'info' },
  caution: { label: 'Caution', icon: 'triangle-alert' },
  warning: { label: 'Warning', icon: 'triangle-alert' },
  danger: { label: 'Danger', icon: 'octagon-alert' },
};

/** Icons offered for a warning before the full icon picker. */
export const WARNING_ICONS = [
  'info', 'circle-alert', 'triangle-alert', 'octagon-alert', 'shield-alert', 'siren', 'skull', 'flame',
  'zap', 'biohazard', 'radiation', 'hard-hat', 'construction', 'hand', 'ban', 'lock-keyhole',
  'database-zap', 'server-crash',
];

export const DEFAULT_CONFIRM = 'I have read and understand this warning';

export const warningIcon = (w: Warning): Icon => w.icon ?? { type: 'lucide', value: LEVELS[w.level].icon };
