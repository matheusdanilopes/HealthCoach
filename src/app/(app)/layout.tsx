import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/layout/BottomNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, target_calories')
    .eq('id', user.id)
    .single();

  if (!profile?.target_calories) {
    redirect('/register');
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <main className="pb-20 max-w-lg mx-auto px-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
