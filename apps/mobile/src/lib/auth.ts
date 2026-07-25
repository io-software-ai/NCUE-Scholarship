import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export async function signInWithGoogle() {
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();

    //相容最新版 GoogleSignin 回傳結構
    const idToken = response.data?.idToken;

    if (!idToken) throw new Error('Google Sign-In failed: No ID Token');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
}
