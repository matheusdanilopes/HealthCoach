import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { inferGoal } from '@/lib/coach-data';
import {
  getActivePlan,
  getExerciseHistory,
  getRecentSessions,
  getTrainingProfile,
  listPlans,
} from '@/lib/training-data';
import TreinosClient from './TreinosClient';

export default async function TreinosPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  // The AI is only called when the user asks for a new plan.
  const [profile, plan, plans, sessions, history, [user]] = await Promise.all([
    getTrainingProfile(userId),
    getActivePlan(userId),
    listPlans(userId),
    getRecentSessions(userId),
    getExerciseHistory(userId),
    sql`SELECT tdee, target_calories FROM users WHERE id = ${userId}`,
  ]);

  const suggestedGoal = plan?.goal ?? inferGoal(
    user?.tdee != null ? Number(user.tdee) : null,
    user?.target_calories != null ? Number(user.target_calories) : null
  );

  return (
    <TreinosClient
      userId={userId}
      initialProfile={profile}
      initialPlan={plan}
      initialPlans={plans}
      initialSessions={sessions}
      initialHistory={history}
      suggestedGoal={suggestedGoal}
    />
  );
}
