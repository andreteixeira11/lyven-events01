import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ⚠️ IMPORTANTE:
// Criar ficheiro .env com:
//
// EXPO_PUBLIC_SUPABASE_URL=https://fmjgrewkknqvxqwkouqj.supabase.co
// EXPO_PUBLIC_SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

// Nunca lançar erro ao nível do módulo: numa build de produção isso fecha a app
// imediatamente ao arrancar. Usamos o URL público como fallback e registamos o problema.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fmjgrewkknqvxqwkouqj.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'missing-anon-key';

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('[supabase] Variáveis EXPO_PUBLIC_SUPABASE_* em falta nesta build');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
