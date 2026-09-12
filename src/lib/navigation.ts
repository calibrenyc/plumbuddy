export function openBrowserUrl(url: string) {
  sessionStorage.setItem('plumbuddy.browser.pendingUrl', url);
  window.dispatchEvent(new CustomEvent('plumbuddy:browser-url', { detail: url }));
  window.dispatchEvent(new CustomEvent('plumbuddy:navigate', { detail: 'browser' }));
}
