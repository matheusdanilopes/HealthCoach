import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default async function Home() {
  const jar = await cookies();
  const hasSession =
    jar.has('authjs.session-token') ||
    jar.has('__Secure-authjs.session-token');
  redirect(hasSession ? '/dashboard' : '/login');
}
