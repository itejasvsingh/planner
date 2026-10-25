import { Redirect } from 'expo-router';

/** The slides now live in /welcome. */
export default function OnboardingScreen() {
  return <Redirect href={'/welcome' as any} />;
}
