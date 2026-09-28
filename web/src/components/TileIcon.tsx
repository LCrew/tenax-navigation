import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import type { Icon } from '../../../shared/schema';

export function TileIcon({ icon, size = 36 }: { icon: Icon; size?: number }) {
  if (icon.type === 'upload') {
    return <img src={icon.value} alt="" width={size} height={size} style={{ objectFit: 'contain' }} />;
  }
  return <DynamicIcon name={icon.value as IconName} size={size} strokeWidth={1.75} fallback={() => <span style={{ width: size, height: size }} />} />;
}
