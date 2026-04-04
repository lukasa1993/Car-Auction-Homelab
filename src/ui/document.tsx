import * as React from "react";

export function AppDocument({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Instrument+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased">
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div
            className="pointer-events-auto hidden items-center gap-3 rounded-full border border-border/80 bg-card/95 px-4 py-3 text-sm text-card-foreground shadow-[0_18px_60px_-28px_rgba(18,18,18,0.42)] backdrop-blur-xl"
            id="live-update-banner"
          >
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live update</p>
              <p className="font-medium" id="live-update-banner-text">New collector sync available.</p>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
              id="live-update-refresh"
              type="button"
            >
              Refresh
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              id="live-update-dismiss"
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
        <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-full max-w-sm flex-col gap-3 px-4 sm:px-0" id="live-toast-host" />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(() => {
  const toastHost = document.getElementById('live-toast-host');
  const banner = document.getElementById('live-update-banner');
  const bannerText = document.getElementById('live-update-banner-text');
  const refreshButton = document.getElementById('live-update-refresh');
  const dismissButton = document.getElementById('live-update-dismiss');
  let refreshArmed = false;

  const showBanner = (message) => {
    if (!banner || !bannerText) return;
    bannerText.textContent = message;
    banner.style.display = 'inline-flex';
    refreshArmed = true;
  };

  const hideBanner = () => {
    if (!banner) return;
    banner.style.display = 'none';
    refreshArmed = false;
  };

  const showToast = (payload) => {
    if (!toastHost) return;
    const toast = document.createElement('div');
    toast.style.cssText = [
      'pointer-events:auto',
      'border:1px solid var(--border)',
      'background:color-mix(in oklab, var(--card) 96%, transparent)',
      'color:var(--card-foreground)',
      'border-radius:1.5rem',
      'padding:14px 16px',
      'box-shadow:0 20px 60px -32px rgba(18,18,18,0.42)',
      'backdrop-filter:blur(16px)',
      'transform:translateY(-8px)',
      'opacity:0',
      'transition:transform 180ms ease, opacity 180ms ease'
    ].join(';');
    const title = document.createElement('div');
    title.textContent = payload.title || 'Live update';
    title.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--muted-foreground);margin-bottom:6px';
    const body = document.createElement('div');
    body.textContent = payload.message || 'Collector activity detected.';
    body.style.cssText = 'font-size:14px;line-height:1.45;font-weight:500';
    toast.appendChild(title);
    toast.appendChild(body);
    toastHost.prepend(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    const remove = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => toast.remove(), 180);
    };
    setTimeout(remove, 5200);
  };

  const tick = () => {
    document.querySelectorAll('[data-auction-date]').forEach((node) => {
      const value = node.getAttribute('data-auction-date');
      if (!value || value === 'future') return;
      if (!value.includes('T')) return;
      const target = new Date(value);
      if (Number.isNaN(target.getTime())) return;
      const diff = target.getTime() - Date.now();
      const out = diff <= 0 ? 'Live now' : (() => {
        const s = Math.floor(diff / 1000);
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
        if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
        return m + 'm ' + sec + 's';
      })();
      node.textContent = out;
    });
    document.querySelectorAll('[data-generated-at]').forEach((node) => {
      const value = node.getAttribute('data-generated-at');
      if (!value) return;
      const generated = new Date(value);
      if (Number.isNaN(generated.getTime())) return;
      const minutes = Math.floor((Date.now() - generated.getTime()) / 60000);
      node.textContent = minutes < 1 ? 'just now' : minutes < 60 ? minutes + 'm ago' : minutes < 1440 ? Math.floor(minutes / 60) + 'h ago' : Math.floor(minutes / 1440) + 'd ago';
    });
  };
  tick();
  setInterval(tick, 1000);
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      window.location.reload();
    });
  }
  if (dismissButton) {
    dismissButton.addEventListener('click', hideBanner);
  }
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy-lot]');
    if (!button) return;
    const value = button.getAttribute('data-copy-lot');
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      const previous = button.textContent;
      button.textContent = 'Copied';
      clearTimeout(button.__timer);
      button.__timer = setTimeout(() => {
        button.textContent = previous;
      }, 1200);
    } catch {}
  });
  if ('EventSource' in window) {
    const source = new EventSource('/events');
    source.addEventListener('collector_sync', (event) => {
      try {
        const payload = JSON.parse(event.data);
        showToast(payload);
        showBanner(payload.message || 'New collector sync available. Refresh to load it.');
      } catch {}
    });
  }
})();`,
          }}
        />
      </body>
    </html>
  );
}
