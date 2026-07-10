import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { 
  Check, 
  X, 
  Calendar,
  MapPin,
  User,
  LogOut,
  Megaphone,
  Users,
  Image as ImageIcon,
  Mail,
} from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useUser } from '@/hooks/user-context';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

type TabType = 'promoters' | 'events' | 'ads';

export default function AdminApprovals() {
  const { logout } = useUser();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('promoters');

  const { data: pendingEvents = [], isLoading: eventsLoading, refetch: refetchEvents } = api.events.listPending.useQuery();
  const { data: pendingPromotersData, isLoading: promotersLoading, refetch: refetchPromoters } = api.promoters.listPending.useQuery();
  const { data: pendingAdsData = [], isLoading: adsLoading, refetch: refetchAds } = api.advertisements.listPending.useQuery();

  const pendingPromoters = useMemo(() => pendingPromotersData?.promoters || [], [pendingPromotersData]);

  const approveEventMutation = api.events.approve.useMutation({
    onSuccess: () => { void refetchEvents(); void queryClient.invalidateQueries({ queryKey: ['events'] }); },
  });
  const rejectEventMutation = api.events.reject.useMutation({
    onSuccess: () => { void refetchEvents(); void queryClient.invalidateQueries({ queryKey: ['events'] }); },
  });
  const approvePromoterMutation = api.promoters.approve.useMutation({
    onSuccess: () => { void refetchPromoters(); void queryClient.invalidateQueries({ queryKey: ['promoters'] }); },
  });
  const rejectPromoterMutation = api.promoters.reject.useMutation({
    onSuccess: () => { void refetchPromoters(); void queryClient.invalidateQueries({ queryKey: ['promoters'] }); },
  });
  const approveAdMutation = api.advertisements.approve.useMutation({
    onSuccess: () => { void refetchAds(); void queryClient.invalidateQueries({ queryKey: ['advertisements'] }); },
  });
  const rejectAdMutation = api.advertisements.reject.useMutation({
    onSuccess: () => { void refetchAds(); void queryClient.invalidateQueries({ queryKey: ['advertisements'] }); },
  });

  const handleApproveEvent = useCallback((eventId: string) => {
    Alert.alert('Aprovar Evento', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aprovar', onPress: async () => {
        try { await approveEventMutation.mutateAsync({ eventId }); Alert.alert('Sucesso', 'Evento aprovado!'); }
        catch { Alert.alert('Erro', 'Falha ao aprovar.'); }
      }},
    ]);
  }, [approveEventMutation]);

  const handleRejectEvent = useCallback((eventId: string) => {
    Alert.alert('Rejeitar Evento', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rejeitar', style: 'destructive', onPress: async () => {
        try { await rejectEventMutation.mutateAsync({ eventId }); Alert.alert('Rejeitado', 'Evento rejeitado.'); }
        catch { Alert.alert('Erro', 'Falha ao rejeitar.'); }
      }},
    ]);
  }, [rejectEventMutation]);

  const handleApprovePromoter = useCallback((id: string) => {
    Alert.alert('Aprovar Promotor', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aprovar', onPress: async () => {
        try { await approvePromoterMutation.mutateAsync({ id }); Alert.alert('Sucesso', 'Promotor aprovado!'); }
        catch { Alert.alert('Erro', 'Falha ao aprovar.'); }
      }},
    ]);
  }, [approvePromoterMutation]);

  const handleRejectPromoter = useCallback((id: string) => {
    Alert.alert('Rejeitar Promotor', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rejeitar', style: 'destructive', onPress: async () => {
        try { await rejectPromoterMutation.mutateAsync({ id }); Alert.alert('Rejeitado', 'Promotor rejeitado.'); }
        catch { Alert.alert('Erro', 'Falha ao rejeitar.'); }
      }},
    ]);
  }, [rejectPromoterMutation]);

  const handleApproveAd = useCallback((id: string) => {
    Alert.alert('Aprovar Anúncio', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aprovar', onPress: async () => {
        try { await approveAdMutation.mutateAsync({ id }); Alert.alert('Sucesso', 'Anúncio aprovado!'); }
        catch { Alert.alert('Erro', 'Falha ao aprovar.'); }
      }},
    ]);
  }, [approveAdMutation]);

  const handleRejectAd = useCallback((id: string) => {
    Alert.alert('Rejeitar Anúncio', 'Tem certeza? Esta ação vai eliminar o anúncio.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rejeitar', style: 'destructive', onPress: async () => {
        try { await rejectAdMutation.mutateAsync({ id }); Alert.alert('Rejeitado', 'Anúncio rejeitado.'); }
        catch { Alert.alert('Erro', 'Falha ao rejeitar.'); }
      }},
    ]);
  }, [rejectAdMutation]);

  const handleLogout = () => {
    Alert.alert('Terminar Sessão', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const handleRefresh = useCallback(() => {
    void refetchEvents(); void refetchPromoters(); void refetchAds();
  }, [refetchEvents, refetchPromoters, refetchAds]);

  const formatDate = (dateString: string) => {
    try { return new Date(dateString).toLocaleDateString('pt-PT'); } catch { return dateString; }
  };

  const pendingEventsCount = (pendingEvents || []).length;
  const pendingPromotersCount = pendingPromoters.length;
  const pendingAdsCount = (pendingAdsData || []).length;
  const totalPending = pendingEventsCount + pendingPromotersCount + pendingAdsCount;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: 'Aprovações',
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: 'bold' as const },
        headerRight: () => (
          <TouchableOpacity style={styles.profileButton} onPress={handleLogout}>
            <User size={20} color={COLORS.white} />
            <LogOut size={16} color={COLORS.white} />
          </TouchableOpacity>
        ),
      }} />

      <View style={styles.content}>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalPending}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.warning }]}>{pendingPromotersCount}</Text>
            <Text style={styles.statLabel}>Promotores</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.primary }]}>{pendingEventsCount}</Text>
            <Text style={styles.statLabel}>Eventos</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.info }]}>{pendingAdsCount}</Text>
            <Text style={styles.statLabel}>Anúncios</Text>
          </View>
        </View>

        <View style={styles.tabsContainer}>
          {([
            { key: 'promoters' as const, icon: Users, label: 'Promotores', color: COLORS.warning, count: pendingPromotersCount },
            { key: 'events' as const, icon: Megaphone, label: 'Eventos', color: COLORS.primary, count: pendingEventsCount },
            { key: 'ads' as const, icon: ImageIcon, label: 'Anúncios', color: COLORS.info, count: pendingAdsCount },
          ]).map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
              onPress={() => setActiveTab(tab.key)}
            >
              <tab.icon size={20} color={activeTab === tab.key ? COLORS.white : tab.color} />
              <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>{tab.label}</Text>
              {tab.count > 0 && (
                <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{tab.count}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
        >
          {activeTab === 'promoters' && (
            <View style={styles.section}>
              {promotersLoading ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ padding: 40 }} />
              ) : pendingPromoters.length === 0 ? (
                <View style={styles.emptyState}>
                  <Users size={48} color={COLORS.lightGray} />
                  <Text style={styles.emptyStateText}>Nenhum promotor pendente</Text>
                </View>
              ) : pendingPromoters.map((promoter: any) => (
                <View key={promoter.id} style={styles.card}>
                  <View style={[styles.cardTypeHeader, { backgroundColor: COLORS.warning + '15' }]}>
                    <Users size={20} color={COLORS.warning} />
                    <Text style={[styles.cardTypeText, { color: COLORS.warning }]}>PROMOTOR</Text>
                  </View>
                  <Text style={styles.cardTitle}>{promoter.company_name || promoter.user_name || 'Sem nome'}</Text>
                  {promoter.user_email && (
                    <View style={styles.detailRow}>
                      <Mail size={14} color={COLORS.textSecondary} />
                      <Text style={styles.detailText}>{promoter.user_email}</Text>
                    </View>
                  )}
                  {promoter.user_name && promoter.company_name && promoter.user_name !== promoter.company_name && (
                    <View style={styles.detailRow}>
                      <User size={14} color={COLORS.textSecondary} />
                      <Text style={styles.detailText}>{promoter.user_name}</Text>
                    </View>
                  )}
                  <Text style={styles.description}>{promoter.description || 'Sem descrição'}</Text>
                  <Text style={styles.submissionText}>Registado em: {promoter.created_at ? formatDate(promoter.created_at) : 'N/A'}</Text>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={() => handleRejectPromoter(promoter.id)}>
                      <X size={20} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Rejeitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={() => handleApprovePromoter(promoter.id)}>
                      <Check size={20} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'events' && (
            <View style={styles.section}>
              {eventsLoading ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ padding: 40 }} />
              ) : pendingEventsCount === 0 ? (
                <View style={styles.emptyState}>
                  <Megaphone size={48} color={COLORS.lightGray} />
                  <Text style={styles.emptyStateText}>Nenhum evento pendente</Text>
                </View>
              ) : (pendingEvents || []).map((event: any) => (
                <View key={event.id} style={styles.card}>
                  <View style={[styles.cardTypeHeader, { backgroundColor: COLORS.primary + '15' }]}>
                    <Megaphone size={20} color={COLORS.primary} />
                    <Text style={[styles.cardTypeText, { color: COLORS.primary }]}>EVENTO</Text>
                  </View>
                  <Text style={styles.cardTitle}>{event.title}</Text>
                  {event.image && <Image source={{ uri: event.image }} style={styles.cardImage} />}
                  <View style={styles.cardDetails}>
                    <View style={styles.detailRow}>
                      <User size={16} color={COLORS.textSecondary} />
                      <Text style={styles.detailText}>{event.promoter?.name || 'Desconhecido'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Calendar size={16} color={COLORS.textSecondary} />
                      <Text style={styles.detailText}>{formatDate(event.date)}</Text>
                    </View>
                    {event.venue?.city && (
                      <View style={styles.detailRow}>
                        <MapPin size={16} color={COLORS.textSecondary} />
                        <Text style={styles.detailText}>{event.venue.name}, {event.venue.city}</Text>
                      </View>
                    )}
                  </View>
                  {event.description && <Text style={styles.description} numberOfLines={3}>{event.description}</Text>}
                  <View style={styles.actionButtons}>
                    <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={() => handleRejectEvent(event.id)}>
                      <X size={20} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Rejeitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={() => handleApproveEvent(event.id)}>
                      <Check size={20} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'ads' && (
            <View style={styles.section}>
              {adsLoading ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ padding: 40 }} />
              ) : pendingAdsCount === 0 ? (
                <View style={styles.emptyState}>
                  <ImageIcon size={48} color={COLORS.lightGray} />
                  <Text style={styles.emptyStateText}>Nenhum anúncio pendente</Text>
                </View>
              ) : (pendingAdsData || []).map((ad: any) => (
                <View key={ad.id} style={styles.card}>
                  <View style={[styles.cardTypeHeader, { backgroundColor: COLORS.info + '15' }]}>
                    <ImageIcon size={20} color={COLORS.info} />
                    <Text style={[styles.cardTypeText, { color: COLORS.info }]}>ANÚNCIO</Text>
                  </View>
                  <Text style={styles.cardTitle}>{ad.title || 'Sem título'}</Text>
                  {ad.image && <Image source={{ uri: ad.image }} style={styles.cardImage} />}
                  <Text style={styles.description}>{ad.description || 'Sem descrição'}</Text>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={() => handleRejectAd(ad.id)}>
                      <X size={20} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Rejeitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={() => handleApproveAd(ad.id)}>
                      <Check size={20} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, paddingHorizontal: 20 },
  scrollView: { flex: 1 },
  statsContainer: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 12, padding: 16,
    marginTop: 10, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 4 },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' as const },
  tabsContainer: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 9999, padding: 4, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: 9999, gap: 6,
  },
  activeTab: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600' as const, color: COLORS.textSecondary },
  activeTabText: { color: COLORS.white },
  tabBadge: {
    backgroundColor: COLORS.error, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  tabBadgeText: { color: COLORS.white, fontSize: 11, fontWeight: 'bold' as const },
  section: { marginBottom: 30 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 15, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  cardTypeHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12, gap: 6,
  },
  cardTypeText: { fontSize: 12, fontWeight: 'bold' as const, letterSpacing: 0.5 },
  cardTitle: { fontSize: 18, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 8 },
  cardImage: { width: '100%', height: 150, borderRadius: 8, marginBottom: 10 },
  cardDetails: { marginBottom: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 8 },
  detailText: { fontSize: 14, color: COLORS.textSecondary },
  description: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 10 },
  submissionText: { fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' as const, marginBottom: 15 },
  actionButtons: { flexDirection: 'row', gap: 10 },
  actionButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 9999, gap: 8,
  },
  rejectButton: { backgroundColor: COLORS.error },
  approveButton: { backgroundColor: COLORS.success },
  actionButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' as const },
  emptyState: { alignItems: 'center', paddingVertical: 40, backgroundColor: COLORS.white, borderRadius: 12 },
  emptyStateText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 10 },
  profileButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 15, gap: 6,
  },
});
