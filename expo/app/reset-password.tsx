import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Lock, Eye, EyeOff, Mail, Check } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useTheme } from '@/hooks/theme-context';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token_hash?: string; code?: string }>();
  const { colors } = useTheme();
  const [isVerifying, setIsVerifying] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const verifyRecoveryLink = async () => {
      try {
        if (params.token_hash) {
          const { error } = await supabase.auth.verifyOtp({
            type: 'recovery',
            token_hash: String(params.token_hash),
          });
          if (error) throw error;
          setIsVerified(true);
        } else if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(String(params.code));
          if (error) throw error;
          setIsVerified(true);
        } else {
          throw new Error('Link inválido ou expirado.');
        }
      } catch (err: any) {
        console.error('[reset-password] verify link:', err);
        setErrorMessage(err?.message || 'Link inválido ou expirado. Solicita um novo email de recuperação.');
      } finally {
        setIsVerifying(false);
      }
    };
    void verifyRecoveryLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (password.length < 8) {
      Alert.alert('Erro', 'A palavra-passe deve ter pelo menos 8 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As palavras-passe não coincidem');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert('Sucesso', 'Palavra-passe redefinida com sucesso! Já podes iniciar sessão.', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
    } catch (err: any) {
      console.error('[reset-password] update password:', err);
      Alert.alert('Erro', err?.message || 'Não foi possível redefinir a palavra-passe.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Redefinir Palavra-passe',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      {isVerifying ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centeredText, { color: colors.textSecondary }]}>A validar o link...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.centered}>
          <Mail size={56} color={colors.textSecondary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Link Inválido</Text>
          <Text style={[styles.centeredText, { color: colors.textSecondary }]}>{errorMessage}</Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/forgot-password')}
          >
            <Text style={[styles.buttonText, { color: colors.white }]}>Pedir Novo Link</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={[styles.iconContainer, { borderColor: colors.primary }]}>
              <Check size={40} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Definir Nova Palavra-passe</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Link validado com sucesso. Escolhe uma nova palavra-passe para a tua conta.
            </Text>

            <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Lock size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Nova palavra-passe (mín. 8 caracteres)"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff size={20} color={colors.textSecondary} />
                ) : (
                  <Eye size={20} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Lock size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Confirmar nova palavra-passe"
                placeholderTextColor={colors.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }, isLoading && styles.buttonDisabled]}
              onPress={() => void handleSubmit()}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.white }]}>Guardar Palavra-passe</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  centeredText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold' as const,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
  },
  eyeButton: {
    padding: 8,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
});
