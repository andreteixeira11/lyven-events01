import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Stack, router } from 'expo-router';
import {
  FileText,
  UserCheck,
  Ticket,
  Megaphone,
  CreditCard,
  RotateCcw,
  ShieldAlert,
  Copyright,
  RefreshCw,
  Mail,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/theme-context';
import BackButton from '@/components/BackButton';

const LAST_UPDATED = 'outubro de 2026';

const SECTIONS: { icon: React.ComponentType<{ size: number; color: string }>; title: string; paragraphs: string[] }[] = [
  {
    icon: UserCheck,
    title: '1. Aceitação e contas',
    paragraphs: [
      'Ao usar a Lyven aceitas estes Termos de Serviço. Para comprares bilhetes precisas de uma conta com email válido; para publicares eventos precisas de uma conta de promotor aprovada pela equipa Lyven.',
      'É da tua responsabilidade manter as tuas credenciais seguras e os teus dados de conta atualizados.',
    ],
  },
  {
    icon: Ticket,
    title: '2. Bilhetes e validação',
    paragraphs: [
      'Os bilhetes são pessoais e identificáveis por QR code único. O bilhete é validado à entrada pelo organizador através da app.',
      'É proibida a revenda de bilhetes fora da Lyven. Bilhetes duplicados, alterados ou obtidos fraudulentamente podem ser recusados à entrada, sem direito a reembolso.',
    ],
  },
  {
    icon: Megaphone,
    title: '3. Promotores e eventos',
    paragraphs: [
      'O promotor é o organizador do evento e o responsável pelo seu conteúdo, data, local, lotação e condições. A Lyven é a plataforma de venda e emissão de bilhetes.',
      'A Lyven pode remover eventos que violem a lei ou estes Termos (incluindo conteúdo ofensivo ou enganoso) e suspender contas de promotores em incumprimento.',
    ],
  },
  {
    icon: CreditCard,
    title: '4. Pagamentos e taxas',
    paragraphs: [
      'Os preços são apresentados em euros e incluem a taxa de serviço da Lyven, calculada por escalão no checkout. Os pagamentos são processados pelo Stripe (cartão, MB WAY ou Multibanco).',
      'A partilha de receitas com os promotores segue as condições acordadas entre a Lyven e o promotor.',
    ],
  },
  {
    icon: RotateCcw,
    title: '5. Cancelamentos e reembolsos',
    paragraphs: [
      'A política de cancelamento de cada evento é da responsabilidade do promotor e está indicada na página do evento. Se um evento for cancelado, o valor dos bilhetes é reembolsado pelo respetivo promotor.',
      'Em caso de dúvida sobre um reembolso, contacta-nos em suporte@lyven.pt.',
    ],
  },
  {
    icon: ShieldAlert,
    title: '6. Conduta na plataforma',
    paragraphs: [
      'É proibido usar a Lyven para atividades ilegais, tentar aceder a contas alheias, contornar limites de compra ou interferir com o funcionamento da plataforma.',
    ],
  },
  {
    icon: Copyright,
    title: '7. Propriedade intelectual',
    paragraphs: [
      'Os conteúdos dos eventos pertencem aos respetivos promotores. A marca, o design e a tecnologia da Lyven pertencem à Lyven e não podem ser copiados sem autorização.',
    ],
  },
  {
    icon: RefreshCw,
    title: '8. Alterações a estes Termos',
    paragraphs: [
      'Podemos atualizar estes Termos para refletir melhorias na plataforma. As alterações publicam-se nesta página e aplicam-se a partir da data da sua publicação.',
    ],
  },
  {
    icon: Mail,
    title: '9. Contacto',
    paragraphs: [
      'Questões sobre estes Termos: geral@lyven.pt · Apoio a promotores: promotores@lyven.pt.',
    ],
  },
];

export default function TermsScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Termos de Serviço',
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
            <FileText size={36} color={colors.primary} />
          </View>
          <Text style={[styles.introTitle, { color: colors.text }]}>
            Termos de Serviço
          </Text>
          <Text style={[styles.introSubtitle, { color: colors.textSecondary }]}>
            As condições de utilização da Lyven, escritas de forma clara.
            Última atualização: {LAST_UPDATED}.
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
