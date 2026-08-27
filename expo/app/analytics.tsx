import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Stack, router } from 'expo-router';
import {
  Users,
  Calendar,
  BarChart3,
  Percent,
  Wallet,
} from 'lucide-react-native';
import { useUser } from '@/hooks/user-context';
import { api } from '@/lib/api';
import { LoadingSpinner, ErrorState } from '@/components/LoadingStates';
import { handleError } from '@/lib/error-handler';
import BackButton from '@/components/BackButton';
import { COMMISSION_TIERS_DESCRIPTION } from '@/utils/commission';

export default function Analytics() {
  const { user } = useUser();

  const { data: profileByUser } = api.promoters.getByUserId.useQuery(
    { userId: user?.id ?? '' },
    { enabled: !!user?.id && user?.userType === 'promoter' }
  );
  const promoterId = profileByUser?.id ?? null;

  const { data: statsData, isLoading, error, refetch } = api.analytics.promoterStats.useQuery(
    { promoterId: promoterId ?? '' },
    { enabled: !!promoterId }
  );

  const stats = useMemo(() => statsData ?? {
    totalSold: 0,
    grossRevenue: 0,
    totalCommission: 0,
    netToPromoter: 0,
    perEvent: [] as any[],
  }, [statsData]);

  const formatCurrency = (value: number) => `€${(value || 0).toFixed(2)}`;

  if (user?.userType !== 'promoter') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Acesso negado</Text>
      </View>
    );
  }
  if (user?.id && profileByUser === undefined) {
    return (
      <View style={styles.container}>
        <LoadingSpinner message="A carregar perfil..." />
      </View>
    );
  }
  if (promoterId && error) {
    return (
      <View style={styles.container}>
        <ErrorState message={handleError(error)} onRetry={() => refetch()} />
      </View>
    );
  }
  if (promoterId && isLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner message="A carregar estatísticas..." />
      </View>
    );
  }

  const currencyIcon = (color: string): React.ReactNode => (
    <Text style={{ fontSize: 22, fontWeight: '700' as const, lineHeight: 27, color }}>{'€'}</Text>
  );

  const StatCard = ({ icon, title, value, subtitle }: { icon: React.ReactNode; title: string; value: string; subtitle?: string }) => (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        {icon}
        <Text style={styles.statTitle}>{title}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Estatísticas',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <BackButton onPress={() => router.back()} color="#fff" />
          ),
        }}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Visão Geral</Text>
          <Text style={styles.subtitle}>Vendas reais dos seus eventos</Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            icon={currencyIcon('#00C851')}
            title="Receita Bruta"
            value={formatCurrency(stats.grossRevenue)}
            subtitle="Valor total dos bilhetes vendidos"
          />

          <StatCard
            icon={<Percent size={24} color="#FF6B6B" />}
            title="Comissão Lyven"
            value={formatCurrency(stats.totalCommission)}
            subtitle="Bruto menos líquido do promotor"
          />

          <StatCard
            icon={<Wallet size={24} color="#007AFF" />}
            title="Líquido p/ Promotor"
            value={formatCurrency(stats.netToPromoter)}
            subtitle="Valor dos bilhetes que fica no promotor"
          />

          <StatCard
            icon={<Users size={24} color="#FF385C" />}
            title="Bilhetes Vendidos"
            value={stats.totalSold.toString()}
            subtitle="Total de vendas"
          />
        </View>

        <View style={styles.commissionNote}>
          <Percent size={16} color="#FF6B6B" />
          <Text style={styles.commissionNoteText}>{COMMISSION_TIERS_DESCRIPTION}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <BarChart3 size={20} color="#fff" />
            <Text style={styles.sectionTitle}>Vendas por Evento</Text>
          </View>

          {stats.perEvent.length > 0 ? (
            stats.perEvent.map((event: any) => (
              <TouchableOpacity
                key={event.eventId}
                style={styles.eventCard}
                onPress={() => router.push(`/event-buyers/${event.eventId}`)}
              >
                <View style={styles.eventHeader}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventDate}>
                    {event.date ? new Date(event.date).toLocaleDateString('pt-PT') : ''}
                  </Text>
                </View>

                <View style={styles.eventStats}>
                  <View style={styles.eventStat}>
                    <Users size={16} color="#999" />
                    <Text style={styles.eventStatText}>{event.sold} vendidos</Text>
                  </View>
                  <View style={styles.eventStat}>
                    <Text style={{ fontSize: 15, fontWeight: '700' as const, color: '#00C851', lineHeight: 19 }}>{'€'}</Text>
                    <Text style={styles.eventStatText}>{formatCurrency(event.gross)}</Text>
                  </View>
                </View>

                <View style={styles.performanceMetrics}>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Valor dos Bilhetes:</Text>
                    <Text style={styles.metricValue}>{formatCurrency(event.gross)}</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Comissão Lyven:</Text>
                    <Text style={[styles.metricValue, styles.commissionValue]}>
                      -{formatCurrency(event.commission)}
                    </Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Líquido p/ Promotor:</Text>
                    <Text style={[styles.metricValue, styles.netValue]}>
                      {formatCurrency(event.net)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Calendar size={48} color="#666" />
              <Text style={styles.emptyText}>Sem vendas registadas</Text>
              <Text style={styles.emptySubtext}>
                Os seus eventos aparecerão aqui quando houver bilhetes vendidos
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  statCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    width: '47%',
    borderWidth: 1,
    borderColor: '#333',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statTitle: {
    color: '#999',
    fontSize: 13,
    marginLeft: 8,
    flexShrink: 1,
  },
  statValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold' as const,
    marginBottom: 4,
  },
  statSubtitle: {
    color: '#666',
    fontSize: 11,
  },
  commissionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#333',
    gap: 10,
  },
  commissionNoteText: {
    color: '#999',
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  section: {
    padding: 20,
    paddingTop: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginLeft: 8,
  },
  eventCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold' as const,
    flex: 1,
  },
  eventDate: {
    color: '#999',
    fontSize: 14,
  },
  eventStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eventStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventStatText: {
    color: '#999',
    fontSize: 12,
    marginLeft: 4,
  },
  performanceMetrics: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricLabel: {
    color: '#999',
    fontSize: 12,
  },
  metricValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold' as const,
  },
  commissionValue: {
    color: '#FF6B6B',
  },
  netValue: {
    color: '#00C851',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#FF385C',
    fontSize: 18,
    textAlign: 'center' as const,
    marginTop: 50,
  },
});
