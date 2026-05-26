import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import SplashScreen from '@/components/SplashScreen';
import InstallPrompt from '@/components/InstallPrompt';

export const metadata: Metadata = {
  title: 'HealthCoach AI',
  description: 'Seu coach de saúde com inteligência artificial',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HealthCoach AI',
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
    <html lang="pt-BR" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full antialiased">
        {/* Injected into server HTML before hydration — prevents dark-mode flash */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        <SplashScreen />
        <ThemeProvider>{children}</ThemeProvider>
        <InstallPrompt />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
