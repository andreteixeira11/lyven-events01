import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';

import { User, Mail, Eye, EyeOff, Building2, Check, X, ChevronDown } from 'lucide-react-native';
import { useUser } from '@/hooks/user-context';
import { router } from 'expo-router';
import { RADIUS, SHADOWS, SPACING } from '@/constants/colors';
import { useTheme } from '@/hooks/theme-context';
import { api } from '@/lib/api';
import { handleError } from '@/lib/error-handler';
import { LoadingSpinner } from '@/components/LoadingStates';
import { promotersApi } from '@/lib/supabase-api';

interface LoginSheetProps {
  visible: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function LoginSheet({ visible, onClose, initialMode = 'login' }: LoginSheetProps) {
  const [userType, setUserType] = useState<'normal' | 'promoter'>('normal');
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const { updateUser, savePromoterProfile: savePromoterProfileCtx } = useUser();
  const { colors } = useTheme();

  const loginMutation = api.auth.login.useMutation();
  const sendCodeMutation = api.auth.sendVerificationCode.useMutation();

  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasMinLength = password.length >= 8;
  const isPasswordValid = hasUppercase && hasNumber && hasMinLength;
  const showPasswordStrength = !isLogin && password.length > 0;

  const getStrengthLevel = (): { label: string; color: string; width: number } => {
    const checks = [hasMinLength, hasUppercase, hasNumber].filter(Boolean).length;
    if (checks === 3) return { label: 'Forte', color: '#22c55e', width: 100 };
    if (checks === 2) return { label: 'Média', color: '#f59e0b', width: 66 };
    return { label: 'Fraca', color: '#ef4444', width: 33 };
  };

  useEffect(() => {
    if (visible) {
      setIsLogin(initialMode === 'login');
      setErrorMessage('');
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    setErrorMessage('');
    onClose();
  };

  const saveUser = async (userData: any) => {
    await updateUser(userData);
  };

  const handleAuth = async () => {
    setErrorMessage('');

    if (!email.trim()) {
      setErrorMessage('Por favor, insira um email');
      return;
    }

    if (!password.trim()) {
      setErrorMessage('Por favor, insira uma palavra-passe');
      return;
    }

    if (!isLogin && !name.trim()) {
      setErrorMessage('Por favor, insira o seu nome');
      return;
    }

    if (!isLogin && !isPasswordValid) {
      setErrorMessage('A palavra-passe deve ter pelo menos 8 caracteres, uma letra maiúscula e um número.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Por favor, insira um email válido');
      return;
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        const result = await loginMutation.mutateAsync({
          email: email.trim().toLowerCase(),
          password: password,
        });

        if (result.success && result.user) {
          const serverUserType = result.user.userType as string;
          const isAdmin = serverUserType === 'admin' || result.user.email === 'geral@lyven.pt' || result.user.email === 'info@lyven.pt';

          if (!isAdmin) {
            if (userType === 'promoter' && serverUserType !== 'promoter') {
              setErrorMessage('Esta conta não é de promotor. Selecione "Utilizador" para entrar.');
              setIsLoading(false);
              return;
            }
            if (userType === 'normal' && serverUserType === 'promoter') {
              setErrorMessage('Esta conta é de promotor. Selecione "Promotor" para entrar.');
              setIsLoading(false);
              return;
            }
          }

          const userData = {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            userType: result.user.userType as 'normal' | 'promoter' | 'admin',
            isOnboardingComplete: result.user.isOnboardingComplete === 1,
            phone: result.user.phone || undefined,
            interests: result.user.interests ? JSON.parse(result.user.interests) : [],
            location: result.user.locationLatitude && result.user.locationLongitude ? {
              latitude: result.user.locationLatitude,
              longitude: result.user.locationLongitude,
              city: result.user.locationCity || undefined,
              region: result.user.locationRegion || undefined,
            } : undefined,
            preferences: {
              notifications: result.user.preferencesNotifications === 1,
              emailUpdates: true,
              shareData: false,
              language: result.user.preferencesLanguage || 'pt',
              priceRange: {
                min: result.user.preferencesPriceMin || 0,
                max: result.user.preferencesPriceMax || 1000,
              },
              eventTypes: result.user.preferencesEventTypes ? JSON.parse(result.user.preferencesEventTypes) : [],
            },
            favoriteEvents: result.user.favoriteEvents ? JSON.parse(result.user.favoriteEvents) : [],
            eventHistory: result.user.eventHistory ? JSON.parse(result.user.eventHistory) : [],
            following: {
              promoters: [],
              artists: [],
              friends: [],
            },
            createdAt: result.user.createdAt || new Date().toISOString(),
          };

          await saveUser(userData);
          handleClose();

          if (isAdmin) {
            router.replace('/(tabs)');
          } else if (serverUserType === 'promoter') {
            try {
              const promoterProfile = await promotersApi.getByUserId({ userId: result.user.id });
              if (promoterProfile && promoterProfile.isApproved === true) {
                const profileToSave = {
                  id: promoterProfile.id,
                  userId: promoterProfile.userId,
                  companyName: promoterProfile.companyName,
                  description: promoterProfile.description || '',
                  website: promoterProfile.website || '',
                  socialMedia: {
                    instagram: promoterProfile.instagramHandle || '',
                    facebook: promoterProfile.facebookHandle || '',
                    twitter: promoterProfile.twitterHandle || '',
                  },
                  isApproved: true,
                  eventsCreated: [],
                  followers: [],
                  rating: 0,
                  totalEvents: 0,
                };
                await savePromoterProfileCtx(profileToSave);
                router.replace('/(tabs)');
              } else if (!promoterProfile) {
                try {
                  await promotersApi.create({
                    userId: result.user.id,
                    companyName: result.user.name || 'Promotor',
                    description: '',
                  });
                } catch (createErr) {
                  console.warn('[LoginSheet] Could not create promoter profile:', createErr);
                }
                router.replace('/pending-approval');
              } else {
                router.replace('/pending-approval');
              }
            } catch (err) {
              console.error('[LoginSheet] Error checking promoter status:', err);
              router.replace('/pending-approval');
            }
          } else {
            router.replace('/(tabs)');
          }
        } else {
          setErrorMessage('Credenciais inválidas. Verifica o email e palavra-passe.');
        }
      } else {
        if (email.toLowerCase() === 'admin' || email.toLowerCase() === 'geral@lyven.pt' || email.toLowerCase() === 'info@lyven.pt') {
          setErrorMessage('Este email não pode ser usado para registo.');
          setIsLoading(false);
          return;
        }

        const sendResult = await sendCodeMutation.mutateAsync({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          password,
        });

        if (sendResult?.success) {
          handleClose();
          router.push({
            pathname: '/verify-email',
            params: {
              email: email.trim().toLowerCase(),
              name: name.trim(),
              password,
              userType,
            },
          });
        }
      }
    } catch (error) {
      console.error('Erro durante autenticação:', error);
      const errMsg = handleError(error);
      setErrorMessage(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        style={styles.overlay}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                backgroundColor: 'rgba(0,0,0,0.5)',
                opacity: backdropOpacity,
              },
            ]}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {isLogin ? 'Entrar' : 'Criar Conta'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <ChevronDown size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
              <View style={styles.userTypeContainer}>
                <TouchableOpacity
                  style={[
                    styles.userTypeButton,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    userType === 'normal' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    setUserType('normal');
                    setIsLogin(true);
                  }}
                >
                  <User size={18} color={userType === 'normal' ? colors.white : colors.primary} />
                  <Text
                    style={[
                      styles.userTypeText,
                      { color: colors.primary },
                      userType === 'normal' && { color: colors.white },
                    ]}
                  >
                    Utilizador
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.userTypeButton,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    userType === 'promoter' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    setUserType('promoter');
                    setIsLogin(true);
                  }}
                >
                  <Building2 size={18} color={userType === 'promoter' ? colors.white : colors.primary} />
                  <Text
                    style={[
                      styles.userTypeText,
                      { color: colors.primary },
                      userType === 'promoter' && { color: colors.white },
                    ]}
                  >
                    Promotor
                  </Text>
                </TouchableOpacity>
              </View>

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
                />
              </View>

              {!isLogin && (
                <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <User size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={userType === 'promoter' ? 'Nome do promotor / empresa' : 'Nome completo'}
                    placeholderTextColor={colors.textSecondary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              )}

              <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.inputIcon}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={colors.textSecondary} />
                  ) : (
                    <Eye size={20} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Palavra-passe"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>

              {showPasswordStrength && (
                <View style={styles.strengthContainer}>
                  <View style={[styles.strengthBarBg, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.strengthBarFill,
                        {
                          backgroundColor: getStrengthLevel().color,
                          width: `${getStrengthLevel().width}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: getStrengthLevel().color }]}>
                    {getStrengthLevel().label}
                  </Text>
                  <View style={styles.requirementsList}>
                    <View style={styles.requirementRow}>
                      {hasMinLength ? <Check size={12} color="#22c55e" /> : <X size={12} color={colors.textSecondary} />}
                      <Text style={[styles.requirementText, { color: hasMinLength ? '#22c55e' : colors.textSecondary }]}>
                        Mínimo 8 caracteres
                      </Text>
                    </View>
                    <View style={styles.requirementRow}>
                      {hasUppercase ? <Check size={12} color="#22c55e" /> : <X size={12} color={colors.textSecondary} />}
                      <Text style={[styles.requirementText, { color: hasUppercase ? '#22c55e' : colors.textSecondary }]}>
                        Uma letra maiúscula
                      </Text>
                    </View>
                    <View style={styles.requirementRow}>
                      {hasNumber ? <Check size={12} color="#22c55e" /> : <X size={12} color={colors.textSecondary} />}
                      <Text style={[styles.requirementText, { color: hasNumber ? '#22c55e' : colors.textSecondary }]}>
                        Um número
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {isLogin && (
                <TouchableOpacity
                  style={styles.forgotPasswordButton}
                  onPress={() => {
                    handleClose();
                    router.push('/forgot-password');
                  }}
                >
                  <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Esqueceu a palavra-passe?</Text>
                </TouchableOpacity>
              )}

              {errorMessage ? (
                <View style={[styles.errorContainer, { backgroundColor: colors.error + '15', borderColor: colors.error + '30' }]}>
                  <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }, isLoading && styles.buttonDisabled]}
                onPress={handleAuth}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <View style={styles.buttonLoading}>
                    <LoadingSpinner size="small" />
                    <Text style={[styles.buttonText, { color: colors.white, marginLeft: 8 }]}>Aguarde...</Text>
                  </View>
                ) : (
                  <Text style={[styles.buttonText, { color: colors.white }]}>
                    {isLogin ? 'Entrar' : 'Criar Conta'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => {
                  setIsLogin(!isLogin);
                  setErrorMessage('');
                }}
              >
                <Text style={[styles.switchText, { color: colors.text }]}>
                  {isLogin ? 'Não tem conta? ' : 'Já tem conta? '}
                  <Text style={[styles.switchTextBold, { color: colors.primary }]}>
                    {isLogin ? 'Criar conta' : 'Entrar'}
                  </Text>
                </Text>
              </TouchableOpacity>

              {userType === 'promoter' && !isLogin && (
                <View style={[styles.promoterInfoBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
                  <Building2 size={14} color={colors.primary} />
                  <Text style={[styles.promoterInfoText, { color: colors.textSecondary }]}>
                    A sua conta de promotor ficará pendente de aprovação pelo administrador.
                  </Text>
                </View>
              )}
            </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    maxHeight: '92%',
    minHeight: '60%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  scrollContent: {
    padding: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: 120,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
  },
  closeButton: {
    padding: 4,
  },
  userTypeContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  userTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    height: 48,
    borderWidth: 1.5,
    gap: SPACING.sm,
  },
  userTypeText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
  },
  inputIcon: {
    marginRight: SPACING.md,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as const } : {}),
  } as any,
  button: {
    borderRadius: RADIUS.full,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  switchButton: {
    marginTop: SPACING.xl,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
  },
  switchTextBold: {
    fontWeight: '600' as const,
  },
  promoterInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
  },
  promoterInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.sm,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  errorContainer: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center' as const,
  },
  strengthContainer: {
    marginBottom: SPACING.md,
    gap: 4,
  },
  strengthBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  strengthBarFill: {
    height: '100%' as const,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    textAlign: 'right' as const,
  },
  requirementsList: {
    gap: 3,
    marginTop: 2,
  },
  requirementRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
  },
  requirementText: {
    fontSize: 11,
  },
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
