export type SiteAction = 'nginx-test' | 'nginx-reload' | 'php-reload'

export const SITE_ACTIONS: SiteAction[] = ['nginx-test', 'nginx-reload', 'php-reload']
export const SITES_ENABLED = '/etc/nginx/sites-enabled'
export const SITES_AVAILABLE = '/etc/nginx/sites-available'

export function parseSiteAction(raw: unknown): SiteAction {
  if (typeof raw === 'string' && SITE_ACTIONS.includes(raw as SiteAction)) return raw as SiteAction
  throw new Error('Unknown site action.')
}

export function buildSiteCommand(action: SiteAction): string {
  switch (parseSiteAction(action)) {
    case 'nginx-test':
      return 'nginx -t'
    case 'nginx-reload':
      return 'systemctl reload nginx'
    case 'php-reload':
      return [
        "unit=$(systemctl list-units --type=service --no-legend --plain 'php*-fpm.service' 2>/dev/null | awk '{print $1}' | head -n 1)",
        'if [ -z "$unit" ]; then echo "No php-fpm service found."; exit 1; fi',
        'systemctl reload "$unit"',
        'echo "Reloaded $unit"',
      ].join('; ')
  }
}

export function siteActionLabel(action: SiteAction): string {
  if (action === 'nginx-test') return 'Test nginx config'
  if (action === 'nginx-reload') return 'Reload nginx'
  return 'Reload PHP-FPM'
}
