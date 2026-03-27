import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, LogOut, Building2 } from 'lucide-react-native';
import { router } from 'expo-router';
import { useUser } from '@/hooks/user-context';
import { useTheme } from '@/hooks/theme-context';
import { RADIUS, SPACING } from '@/constants/colors';

export default function PendingApprovalScreen() {
  const { logout, user } = useUser();
  const { colors } = useTheme();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Image
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/r0eawa35sn5kfssq1aek9' }}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
            <Clock size={48} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Registo Pendente
          </Text>

          <Text style={[styles.description, { color: colors.textSecondary }]}>
            O seu registo como promotor foi submetido com sucesso e está a aguardar aprovação pela administração.
          </Text>

          <View style={[styles.infoBox, { backgroundColor: colors.primary + '08', borderColor: colors.primary + '20' }]}>
            <Building2 size={18} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Será notificado assim que o seu perfil for aprovado. Poderá então aceder ao painel de promotor e criar eventos.
            </Text>
          </View>

          {user?.email && (
            <Text style={[styles.emailText, { color: colors.textSecondary }]}>
              Email registado: <Text style={{ color: colors.primary, fontWeight: '600' as const }}>{user.email}</Text>
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: colors.error + '12', borderColor: colors.error + '30' }]}
          onPress={handleLogout}
        >
          <LogOut size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Voltar ao Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoImage: {
    width: 240,
    height: 96,
  },
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.xxl,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.md,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  emailText: {
    fontSize: 13,
    textAlign: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginTop: SPACING.xxl,
    gap: SPACING.sm,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
});
