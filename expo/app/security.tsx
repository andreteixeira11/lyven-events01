import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { ArrowLeft, Lock, Eye, EyeOff, Shield, Smartphone } from 'lucide-react-native';
import BackButton from '@/components/BackButton';
import { COLORS } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import * as LocalAuthentication from 'expo-local-authentication';
import QRCode from '@/components/QRCode';

export default function Security() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [twoFactorModalVisible, setTwoFactorModalVisible] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const loadSecuritySettings = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user.user_metadata?.biometric_enabled) {
        setBiometricEnabled(true);
      }
      const { data: factors, error } = await supabase.auth.mfa.listFactors();
      if (!error && factors?.all.some((f) => f.status === 'verified')) {
        setTwoFactorEnabled(true);
      }
    } catch (err) {
      console.error('[security] load settings:', err);
    }
  }, []);

  useEffect(() => {
    void loadSecuritySettings();
  }, [loadSecuritySettings]);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Erro', 'Por favor preencha todos os campos');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Erro', 'A nova palavra-passe deve ter pelo menos 8 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Erro', 'As palavras-passe não coincidem');
      return;
    }

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user.email) {
        Alert.alert('Sessão Necessária', 'Inicia sessão para alterares a tua palavra-passe.');
        return;
      }

      // Confirma a palavra-passe atual antes de permitir a alteração
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });
      if (verifyError) {
        Alert.alert('Erro', 'A palavra-passe atual está incorreta.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      Alert.alert('Sucesso', 'Palavra-passe alterada com sucesso!', [
        {
          text: 'OK',
          onPress: () => {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
          },
        },
      ]);
    } catch (err) {
      console.error('[security] change password:', err);
      Alert.alert('Erro', 'Não foi possível alterar a palavra-passe');
    } finally {
      setIsLoading(false);
    }
  };

  const startTwoFactorEnrollment = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Lyven',
      });
      if (error) throw error;
      if (!data.totp) throw new Error('Resposta inesperada do servidor.');
      setPendingFactorId(data.id);
      setTotpSecret(data.totp.secret);
      setTotpUri(data.totp.uri);
      setVerificationCode('');
      setTwoFactorModalVisible(true);
    } catch (err: any) {
      console.error('[security] 2FA enroll:', err);
      Alert.alert('Erro', err?.message || 'Não foi possível iniciar a configuração da autenticação de dois fatores.');
    } finally {
      setIsLoading(false);
    }
  };

  const disableTwoFactor = async () => {
    setIsLoading(true);
    try {
      const { data: factors, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      for (const factor of factors?.all ?? []) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (unenrollError) throw unenrollError;
      }
      setTwoFactorEnabled(false);
      Alert.alert('Sucesso', 'Autenticação de dois fatores desativada.');
    } catch (err: any) {
      console.error('[security] 2FA disable:', err);
      Alert.alert('Erro', err?.message || 'Não foi possível desativar a autenticação de dois fatores.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTwoFactor = (value: boolean) => {
    if (value) {
      void startTwoFactorEnrollment();
    } else {
      Alert.alert(
        'Desativar Autenticação de Dois Fatores',
        'Tem certeza que deseja desativar esta funcionalidade de segurança?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Desativar', style: 'destructive', onPress: () => void disableTwoFactor() },
        ]
      );
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!pendingFactorId) return;
    const code = verificationCode.replace(/\D/g, '');
    if (code.length !== 6) {
      Alert.alert('Erro', 'Introduz o código de 6 dígitos da aplicação autenticadora.');
      return;
    }
    setIsLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: pendingFactorId,
      });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) throw verifyError;
      setTwoFactorEnabled(true);
      setTwoFactorModalVisible(false);
      setPendingFactorId(null);
      Alert.alert('Sucesso', 'Autenticação de dois fatores ativada!');
    } catch (err: any) {
      console.error('[security] 2FA verify:', err);
      Alert.alert('Erro', err?.message || 'Código inválido. Tenta novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelTwoFactorModal = async () => {
    setTwoFactorModalVisible(false);
    if (pendingFactorId) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
      } catch (err) {
        console.error('[security] 2FA cancel unenroll:', err);
      }
      setPendingFactorId(null);
    }
  };

  const handleToggleBiometric = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert('Indisponível', 'Este dispositivo não tem biometria configurada (Face ID ou impressão digital).');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirma para ativar a autenticação biométrica',
      });
      if (!result.success) return;
    }
    setBiometricEnabled(value);
    try {
      const { error } = await supabase.auth.updateUser({ data: { biometric_enabled: value } });
      if (error) throw error;
      if (value) {
        Alert.alert('Sucesso', 'Autenticação biométrica ativada.');
      }
    } catch (err) {
      console.error('[security] biometric toggle:', err);
      setBiometricEnabled(!value);
      Alert.alert('Erro', 'Não foi possível guardar a definição. Tenta novamente.');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Segurança',
          headerStyle: { backgroundColor: COLORS.header },
          headerTintColor: COLORS.headerText,
          headerTitleStyle: { fontWeight: 'bold' as const },
          headerLeft: () => (
            <BackButton onPress={() => router.back()} color={COLORS.headerText} backgroundColor="{rgba(0,0,0,0.2)}" />
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Alterar Palavra-passe</Text>
        <View style={styles.section}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Palavra-passe Atual</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Palavra-passe atual"
                placeholderTextColor={COLORS.black}
                secureTextEntry={!showCurrentPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? (
                  <EyeOff size={20} color={COLORS.black} />
                ) : (
                  <Eye size={20} color={COLORS.black} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Nova Palavra-passe</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Nova palavra-passe (mín. 8 caracteres)"
                placeholderTextColor={COLORS.black}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? (
                  <EyeOff size={20} color={COLORS.black} />
                ) : (
                  <Eye size={20} color={COLORS.black} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirmar Nova Palavra-passe</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirmar nova palavra-passe"
                placeholderTextColor={COLORS.black}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff size={20} color={COLORS.black} />
                ) : (
                  <Eye size={20} color={COLORS.black} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={() => void handleChangePassword()}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Lock size={20} color={COLORS.white} />
                <Text style={styles.buttonText}>Alterar Palavra-passe</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Autenticação Adicional</Text>
        <View style={styles.section}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={styles.settingIcon}>
                <Shield size={20} color={COLORS.primary} />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Autenticação de Dois Fatores</Text>
                <Text style={styles.settingSubtitle}>
                  Adicionar camada extra de segurança
                </Text>
              </View>
            </View>
            <Switch
              value={twoFactorEnabled}
              onValueChange={handleToggleTwoFactor}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.white}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={styles.settingIcon}>
                <Smartphone size={20} color={COLORS.primary} />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Autenticação Biométrica</Text>
                <Text style={styles.settingSubtitle}>
                  Use impressão digital ou Face ID
                </Text>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={(value) => void handleToggleBiometric(value)}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.white}
            />
          </View>
        </View>

        <View style={styles.infoBox}>
          <Shield size={16} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Use uma palavra-passe forte com letras, números e símbolos. Ative a
            autenticação de dois fatores para maior segurança.
          </Text>
        </View>

        <View style={styles.spacer} />
      </ScrollView>

      </KeyboardAvoidingView>

      <Modal
        visible={twoFactorModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => void handleCancelTwoFactorModal()}
      >
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Autenticação de Dois Fatores</Text>
          <Text style={styles.modalSubtitle}>
            1. Abre a tua aplicação autenticadora (Google Authenticator, Authy, etc.){'\n'}
            2. Lê o código QR ou introduz a chave manualmente{'\n'}
            3. Introduz o código de 6 dígitos gerado
          </Text>
          {totpUri ? (
            <View style={styles.qrWrap}>
              <QRCode value={totpUri} size={200} />
            </View>
          ) : null}
          <View style={styles.secretBox}>
            <Text style={styles.secretLabel}>Chave manual</Text>
            <Text style={styles.secretValue}>{totpSecret}</Text>
          </View>
          <TextInput
            style={styles.codeInput}
            value={verificationCode}
            onChangeText={(text) => setVerificationCode(text.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={COLORS.border}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={() => void handleVerifyTwoFactor()}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Shield size={20} color={COLORS.white} />
                <Text style={styles.buttonText}>Verificar e Ativar</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modalCancelButton}
            onPress={() => void handleCancelTwoFactorModal()}
          >
            <Text style={styles.modalCancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: COLORS.headerText,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.header,
    marginTop: 8,
  },
  section: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 8,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: COLORS.black,
    marginBottom: 8,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: COLORS.black,
  },
  eyeButton: {
    padding: 16,
  },
  button: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${COLORS.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: COLORS.black,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 12,
    color: COLORS.black,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  infoBox: {
    backgroundColor: `${COLORS.primary}15`,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: 'row',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.primary,
    lineHeight: 20,
  },
  spacer: {
    height: 40,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: COLORS.black,
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.black,
    lineHeight: 20,
    marginBottom: 20,
  },
  qrWrap: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 16,
  },
  secretBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  secretLabel: {
    fontSize: 12,
    color: COLORS.black,
    marginBottom: 4,
  },
  secretValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: COLORS.black,
  },
  codeInput: {
    backgroundColor: COLORS.background,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    fontSize: 20,
    letterSpacing: 8,
    textAlign: 'center',
    color: COLORS.black,
    marginBottom: 16,
  },
  modalCancelButton: {
    padding: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: COLORS.primary,
  },
});
