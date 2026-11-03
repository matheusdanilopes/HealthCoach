import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import SplashScreen from '@/components/layout/SplashScreen';

// Self-hosted and preloaded by Next.js: no render-blocking request to
// Google Fonts and no layout shift when the font swaps in.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

// Runs before first paint (inline, so no extra request): applies the saved
// theme, decides whether the opening animation plays (once per app session)
// and captures the PWA install prompt.
const BOOT_SCRIPT = `(function(){var d=document.documentElement;
try{var t=localStorage.getItem('theme');var p=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if((t||p)==='dark')d.classList.add('dark');}catch(e){}
try{if(sessionStorage.getItem('hc-splash')||matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('no-splash');}else{sessionStorage.setItem('hc-splash','1');d.classList.add('splash');setTimeout(function(){d.classList.remove('splash');},1000);}}catch(e){d.classList.add('no-splash');}
try{window.__pwaInstallEvent=null;addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__pwaInstallEvent=e;dispatchEvent(new Event('pwa-install-ready'));});}catch(e){}
})();`;

export const metadata: Metadata = {
  title: 'HealthCoach AI',
  description: 'Seu coach de saúde com inteligência artificial',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HealthCoach AI',
    startupImage: [
      { url: '/splash/splash-iphone-se.png',         media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/splash/splash-iphone-8plus.png',      media: '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/splash-iphone-x.png',          media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/splash-iphone-xr.png',         media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/splash/splash-iphone-xsmax.png',      media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/splash-iphone-12.png',         media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/splash-iphone-12max.png',      media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/splash-iphone-14pro.png',      media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/splash-iphone-14promax.png',   media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/splash-iphone-16pro.png',      media: '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/splash-iphone-16promax.png',   media: '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)' },
    ],
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/icons/icon-192x192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#09090b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script toggles classes on <html> before hydration.
    <html lang="pt-BR" className={`h-full ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="min-h-full antialiased">
        <SplashScreen />
        {/* Service worker registration doesn't affect the first screen — defer it. */}
        <Script src="/sw-register.js" strategy="lazyOnload" />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
