import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
} from '@expo-google-fonts/figtree';

/**
 * The app face: Figtree (free, open licence), a friendly geometric sans close to the one Fold uses. React Native picks a
 * font file by family name, so each weight is its own family; `familyFor` turns a style's fontWeight into one.
 */
export const FONT_ASSETS = {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
};

export function familyFor(weight: unknown): keyof typeof FONT_ASSETS {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight);
  if (!(w >= 100)) return 'Figtree_400Regular';
  if (w >= 800) return 'Figtree_800ExtraBold';
  if (w >= 700) return 'Figtree_700Bold';
  if (w >= 600) return 'Figtree_600SemiBold';
  if (w >= 500) return 'Figtree_500Medium';
  return 'Figtree_400Regular';
}
