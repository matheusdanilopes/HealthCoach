// Opening animation shown when the app is launched. It is plain server-rendered
// markup animated by CSS only, so it paints together with the first HTML byte —
// it never waits for JavaScript and never blocks taps (pointer-events: none).
// The boot script in the root layout hides it after the first launch of a
// session and for users who prefer reduced motion.
export default function SplashScreen() {
  return (
    <div id="hc-splash" aria-hidden="true">
      <div className="hc-splash-glow" />
      <div className="hc-splash-mark">
        <span className="hc-splash-ring" />
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <rect className="hc-splash-pillar" x="4.9" y="5.8" width="3.4" height="12.4" rx="1.7" fill="white" fillOpacity="0.95" />
          <rect className="hc-splash-pillar" x="15.7" y="5.8" width="3.4" height="12.4" rx="1.7" fill="white" fillOpacity="0.95" />
          <path
            className="hc-splash-ecg"
            pathLength={1}
            d="M8.3,12 L10,12 L10.8,9.4 L12,14.8 L13,10.5 L14,12 L15.7,12"
            stroke="white"
            strokeOpacity="0.95"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="hc-splash-name">HealthCoach</span>
    </div>
  );
}
