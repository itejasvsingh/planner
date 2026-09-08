import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, signOut as fbSignOut } from 'firebase/auth';
import { auth } from './firebase';

export const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '817744322906-n09aggnfr6nef792qod0gukh4k2j0put.apps.googleusercontent.com';

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
});

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  // In v16, response is { type: 'success', data: User } or { type: 'cancelled' }
  if ((response as any).type === 'cancelled') {
    return null;
  }

  const idToken = (response as any).data?.idToken ?? (response as any).idToken;
  if (!idToken) {
    throw new Error('Google Sign-In succeeded but no ID token was returned.');
  }

  const credential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
}

export async function signOutGoogle() {
  try {
    await GoogleSignin.signOut();
  } catch (e) {
    console.warn('GoogleSignin.signOut notice:', e);
  }
  try {
    await fbSignOut(auth);
  } catch (e) {
    console.warn('Firebase signOut notice:', e);
  }
}

export { statusCodes };

