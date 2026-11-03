// Opening animation. It picks up exactly where the native PWA launch image
// (public/splash/*) leaves off — same green gradient and centered logo — and
// immediately zooms "through" the logo to reveal the app. There is no hold
// time: it starts on first paint, is pure CSS (no JS wait) and never blocks
// taps. The boot script in the root layout skips it after the first launch of
// a session and for users who prefer reduced motion.
export default function SplashScreen() {
  return (
    <div id="hc-splash" aria-hidden="true">
      <div className="hc-splash-mark">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none">
          <rect x="4.9" y="5.8" width="3.4" height="12.4" rx="1.7" fill="white" />
          <rect x="15.7" y="5.8" width="3.4" height="12.4" rx="1.7" fill="white" />
          <path
            d="M8.3,12 L10,12 L10.8,9.4 L12,14.8 L13,10.5 L14,12 L15.7,12"
            stroke="white"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
