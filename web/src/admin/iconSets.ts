/**
 * Ready-made icon choices for common company tools, shown in the icon picker before anything is searched.
 * Names are lucide-react icon names; the picker skips any that a lucide update removes.
 * `words` lets a search like "money" or "hr" find the whole set.
 */
export const ICON_SETS: { label: string; words: string; icons: string[] }[] = [
  {
    label: 'General',
    words: 'general common home web link start',
    icons: [
      'house', 'globe', 'link', 'external-link', 'bookmark', 'star', 'compass', 'layout-dashboard',
      'layout-grid', 'app-window', 'folder', 'folder-open', 'search', 'info', 'circle-help', 'settings',
    ],
  },
  {
    label: 'Communication',
    words: 'communication mail email chat message phone call meeting teams news',
    icons: [
      'mail', 'inbox', 'send', 'message-circle', 'message-square', 'messages-square', 'phone', 'video',
      'headset', 'megaphone', 'bell', 'at-sign', 'contact', 'newspaper', 'rss', 'calendar-days',
    ],
  },
  {
    label: 'Documents',
    words: 'documents files docs paper sharepoint wiki manual policy contract sign print archive',
    icons: [
      'file', 'file-text', 'files', 'file-spreadsheet', 'file-check', 'file-signature', 'clipboard-list', 'notebook',
      'book-open', 'library', 'archive', 'paperclip', 'printer', 'scan', 'folder-kanban', 'signature',
    ],
  },
  {
    label: 'Data & reports',
    words: 'data reports analytics bi chart statistics dashboard kpi excel table numbers',
    icons: [
      'chart-column', 'chart-line', 'chart-pie', 'chart-bar', 'trending-up', 'gauge', 'activity', 'database',
      'table', 'sheet', 'calculator', 'sigma', 'presentation', 'chart-no-axes-combined', 'funnel', 'target',
    ],
  },
  {
    label: 'Planning & time',
    words: 'planning time calendar schedule tasks project todo hours timesheet deadline',
    icons: [
      'calendar', 'calendar-check', 'clock', 'timer', 'alarm-clock', 'hourglass', 'list-todo', 'list-checks',
      'kanban', 'square-check', 'flag', 'milestone', 'goal', 'gantt-chart', 'workflow', 'repeat',
    ],
  },
  {
    label: 'Business & finance',
    words: 'business finance money sales crm erp accounting invoice purchase customers office company',
    icons: [
      'briefcase', 'building', 'building-2', 'store', 'handshake', 'landmark', 'banknote', 'wallet',
      'credit-card', 'receipt', 'euro', 'piggy-bank', 'coins', 'badge-percent', 'shopping-cart', 'scale',
    ],
  },
  {
    label: 'Production & logistics',
    words: 'production factory manufacturing logistics warehouse delivery shipping transport quality tools panels',
    icons: [
      'factory', 'warehouse', 'truck', 'forklift', 'container', 'boxes', 'package', 'package-check',
      'hammer', 'wrench', 'drill', 'hard-hat', 'ruler', 'construction', 'layers', 'cog',
      'ship', 'map', 'map-pin', 'route', 'fuel', 'zap', 'plug', 'scan-barcode',
    ],
  },
  {
    label: 'IT & security',
    words: 'it computer server network cloud security password admin dev code support helpdesk',
    icons: [
      'server', 'monitor', 'laptop', 'smartphone', 'hard-drive', 'cloud', 'wifi', 'network',
      'router', 'code', 'terminal', 'git-branch', 'bug', 'shield', 'shield-check', 'lock',
      'key-round', 'fingerprint', 'qr-code', 'bot', 'life-buoy', 'ticket', 'cpu', 'printer-check',
    ],
  },
  {
    label: 'People & HR',
    words: 'people hr staff employees team training holiday vacation health safety canteen car',
    icons: [
      'user', 'users', 'user-plus', 'id-card', 'graduation-cap', 'award', 'trophy', 'heart-handshake',
      'heart-pulse', 'stethoscope', 'umbrella', 'plane', 'car', 'coffee', 'utensils', 'smile',
    ],
  },
  {
    label: 'Other',
    words: 'other misc ideas marketing design photo media',
    icons: [
      'lightbulb', 'sparkles', 'rocket', 'leaf', 'recycle', 'sun', 'image', 'camera',
      'palette', 'pen-tool', 'tv', 'gift', 'heart', 'thumbs-up', 'puzzle', 'box',
    ],
  },
];
