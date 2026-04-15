import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Mail, Check } from 'lucide-react-native';
import { router } from 'expo-router';
import { COLORS, RADIUS, SPACING, SHADOWS } from '@/constants/colors';
import { useTheme } from '@/hooks/theme-context';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { colors } = useTheme();

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Erro', 'Por favor, insira o seu email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Erro', 'Por favor, insira um email válido');
      return;
    }

    setIsLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log('Enviando email de recuperação para:', email);
      setEmailSent(true);
      
      Alert.alert(
        'Email Enviado',
        'Enviámos um link de recuperação para o seu email. Por favor, verifique a sua caixa de entrada.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch {
      Alert.alert('Erro', 'Ocorreu um erro ao enviar o email. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.gradient, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <View style={[styles.iconContainer, { borderColor: colors.primary }]}>
                <Mail size={40} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Recuperar Palavra-passe</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Insira o seu email e enviaremos um link para redefinir a sua palavra-passe
              </Text>
            </View>

            <View style={styles.form}>
              <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Mail size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Email"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!emailSent}
                />
                {emailSent && (
                  <Check size={20} color={COLORS.success} style={styles.checkIcon} />
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: colors.primary },
                  (isLoading || emailSent) && styles.buttonDisabled,
                ]}
                onPress={handleResetPassword}
                disabled={isLoading || emailSent}
              >
                <Text style={[styles.buttonText, { color: colors.white }]}>
                  {isLoading ? 'Enviando...' : emailSent ? 'Email Enviado' : 'Enviar Link'}
                </Text>
              </TouchableOpacity>

              {emailSent && (
                <View style={styles.successBox}>
                  <Check size={20} color={COLORS.success} />
                  <Text style={styles.successText}>
                    Email enviado com sucesso! Verifique a sua caixa de entrada.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.backToLoginButton}
                onPress={() => router.back()}
              >
                <Text style={[styles.backToLoginText, { color: colors.primary }]}>Voltar ao login</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    marginBottom: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    ...SHADOWS.sm,
  },
  inputIcon: {
    marginRight: SPACING.md,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as const } : {}),
  } as any,
  checkIcon: {
    marginLeft: 8,
  },
  button: {
    borderRadius: RADIUS.full,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  successText: {
    flex: 1,
    color: '#2E7D32',
    fontSize: 14,
    lineHeight: 20,
  },
  backToLoginButton: {
    marginTop: SPACING.xxxl,
    alignItems: 'center',
  },
  backToLoginText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
});
