import PageTransition from '@/components/layout/PageTransition';

// A template (unlike a layout) remounts on every navigation, which is what
// lets the enter animation replay each time the user changes screens.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
