import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Stack, router } from 'expo-router';
import {
  Shield,
  Database,
  Share2,
  Lock,
  Eye,
  Mail,
  UserX,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/theme-context';
import BackButton from '@/components/BackButton';

const LAST_UPDATED = 'outubro de 2026';

const SECTIONS: { icon: React.ComponentType<{ size: number; color: string }>; title: string; paragraphs: string[] }[] = [
  {
    icon: Database,
    title: 'Dados que recolhemos',
    paragraphs: [
      'Para utilizares a Lyven precisamos de: nome, email e, se criares eventos como promotor, os dados do perfil público e dos eventos que publicas.',
      'Quando compras bilhetes, registamos os detalhes da encomenda (eventos, tipos de bilhete, quantidades e estado do pagamento). Se indicares um NIF no checkout, este é guardado apenas para efeitos de faturação.',
    ],
  },
  {
    icon: Eye,
    title: 'Como usamos os teus dados',
    paragraphs: [
      'Usamos os teus dados para: gerir a tua conta e bilhetes, processar pagamentos, emitir bilhetes com QR code, enviar confirmações e avisos importantes sobre eventos nos quais participaste.',
      'Nunca vendemos os teus dados pessoais a terceiros.',
    ],
  },
  {
    icon: Share2,
    title: 'Partilha de dados',
    paragraphs: [
      'Partilhamos apenas o necessário: com o promotor do evento (o teu nome e o número de bilhetes comprados, para o check-in à entrada) e com o Stripe (processador de pagamentos) para concluir transações em segurança.',
    ],
  },
  {
    icon: Lock,
    title: 'Segurança',
    paragraphs: [
      'As palavras-passe são guardadas com encriptação pela Supabase Auth e os pagamentos são processados pelo Stripe — nunca vemos nem guardamos os dados do teu cartão.',
      'Podes ativar a verificação em dois passos (2FA) na área de Segurança do teu perfil.',
    ],
  },
  {
    icon: UserX,
    title: 'Os teus direitos (RGPD)',
    paragraphs: [
      'Podes a qualquer momento: aceder, corrigir ou eliminar a tua conta e dados, exportar as tuas informações, retirar o consentimento para comunicações de email nas preferências de email.',
      'A eliminação da conta remove os teus dados pessoais; os registos contabilísticos das compras efetuadas mantêm-se pelo período legal.',
    ],
  },
  {
    icon: Mail,
    title: 'Contactos',
    paragraphs: [
      'Para exerceres os teus direitos ou esclareceres dúvidas sobre privacidade, escreve para info@lyven.pt.',
    ],
  },
];

export default function PrivacyScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Privacidade e Dados',
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '600' as const },
          headerLeft: () => (
            <BackButton onPress={() => router.back()} color={colors.white} />
          ),
        }}
      />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: colors.primaryLight }]}>
            <Shield size={36} color={colors.primary} />
          </View>
          <Text style={[styles.introTitle, { color: colors.text }]}>
            A tua privacidade é prioridade
          </Text>
          <Text style={[styles.introSubtitle, { color: colors.textSecondary }]}>
            Explicamos de forma simples como a Lyven recolhe, usa e protege os teus
            dados. Última atualização: {LAST_UPDATED}.
          </Text>
        </View>

        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <View key={section.title} style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIcon, { backgroundColor: colors.primaryLight }]}>
                  <Icon size={18} color={colors.primary} />
                </View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
              </View>
              {section.paragraphs.map((paragraph, index) => (
                <Text key={index} style={[styles.paragraph, { color: colors.textSecondary }]}>
                  {paragraph}
                </Text>
              ))}
            </View>
          );
        })}

        <View style={styles.footer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  intro: {
    alignItems: 'center',
    padding: 24,
    paddingBottom: 8,
  },
  introIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    textAlign: 'center',
    marginBottom: 8,
  },
  introSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    flex: 1,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  footer: {
    height: 32,
  },
});
