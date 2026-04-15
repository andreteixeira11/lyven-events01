import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { 
  Users, 
  Search, 
  Filter,
  UserCheck,
  UserX,
  User,
  LogOut,
} from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useUser } from '@/hooks/user-context';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function AdminPromoters() {
  const { logout } = useUser();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const { data: rawPromoters = [], isLoading, refetch } = api.promoters.list.useQuery();
  const { data: pendingData, refetch: refetchPending } = api.promoters.listPending.useQuery();

  const pendingPromoters = useMemo(() => pendingData?.promoters || [], [pendingData]);

  const approvePromoterMutation = api.promoters.approve.useMutation({
    onSuccess: () => { void refetch(); void refetchPending(); void queryClient.invalidateQueries({ queryKey: ['promoters'] }); },
  });
  const rejectPromoterMutation = api.promoters.reject.useMutation({
    onSuccess: () => { void refetch(); void refetchPending(); void queryClient.invalidateQueries({ queryKey: ['promoters'] }); },
  });

  const promoters = useMemo(() => {
    const active = (rawPromoters || []).map((p: any) => ({
      id: p.id,
      name: p.name || 'Sem nome',
      description: p.description || '',
      verified: p.verified || false,
      followersCount: p.followersCount || 0,
      status: 'active' as const,
      image: p.image || '',
    }));
    const pending = pendingPromoters.map((p: any) => ({
      id: p.id,
      name: p.company_name || 'Sem nome',
      description: p.description || '',
      verified: false,
      followersCount: 0,
      status: 'pending' as const,
      image: '',
    }));
    return [...pending, ...active];
  }, [rawPromoters, pendingPromoters]);

  const filteredPromoters = useMemo(() => promoters.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || p.status === filterStatus;
    return matchesSearch && matchesFilter;
  }), [promoters, searchQuery, filterStatus]);

  const handleAction = useCallback((id: string, action: 'approve' | 'reject') => {
    const label = action === 'approve' ? 'Aprovar' : 'Rejeitar';
    Alert.alert(label, 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: label, style: action === 'reject' ? 'destructive' : 'default', onPress: async () => {
        try {
          if (action === 'approve') await approvePromoterMutation.mutateAsync({ id });
          else await rejectPromoterMutation.mutateAsync({ id });
          Alert.alert('Sucesso', `${label} realizado com sucesso!`);
        } catch { Alert.alert('Erro', 'Falha na operação.'); }
      }},
    ]);
  }, [approvePromoterMutation, rejectPromoterMutation]);

  const handleLogout = () => {
    Alert.alert('Terminar Sessão', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const totalPromoters = promoters.length;
  const activePromoters = promoters.filter(p => p.status === 'active').length;
  const pendingCount = promoters.filter(p => p.status === 'pending').length;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: 'Gerir Promotores', headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white, headerTitleStyle: { fontWeight: 'bold' as const },
        headerRight: () => (
          <TouchableOpacity style={styles.profileButton} onPress={handleLogout}>
            <User size={20} color={COLORS.white} /><LogOut size={16} color={COLORS.white} />
          </TouchableOpacity>
        ),
      }} />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void refetch(); void refetchPending(); }} />}
      >
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Search size={20} color={COLORS.textSecondary} />
            <TextInput style={styles.searchInput} placeholder="Procurar promotores..." value={searchQuery} onChangeText={setSearchQuery} placeholderTextColor={COLORS.textSecondary} />
          </View>
          <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilters(!showFilters)}>
            <Filter size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filterOptions}>
            {(['all', 'active', 'pending'] as const).map(s => (
              <TouchableOpacity key={s} style={[styles.filterOption, filterStatus === s && styles.filterOptionActive]} onPress={() => setFilterStatus(s)}>
                <Text style={[styles.filterOptionText, filterStatus === s && styles.filterOptionTextActive]}>
                  {s === 'all' ? 'Todos' : s === 'active' ? 'Ativos' : 'Pendentes'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.statsContainer}>
          <View style={styles.statCard}><Text style={styles.statNumber}>{totalPromoters}</Text><Text style={styles.statLabel}>Total</Text></View>
          <View style={styles.statCard}><Text style={[styles.statNumber, { color: COLORS.success }]}>{activePromoters}</Text><Text style={styles.statLabel}>Ativos</Text></View>
          <View style={styles.statCard}><Text style={[styles.statNumber, { color: COLORS.warning }]}>{pendingCount}</Text><Text style={styles.statLabel}>Pendentes</Text></View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.loadingText}>A carregar...</Text></View>
        ) : (
          <>
            {filteredPromoters.map(promoter => (
              <View key={promoter.id} style={styles.promoterCard}>
                <View style={styles.promoterHeader}>
                  <View style={styles.promoterInfo}>
                    <View style={styles.promoterNameRow}>
                      <Text style={styles.promoterName}>{promoter.name}</Text>
                      {promoter.verified && <UserCheck size={16} color={COLORS.success} />}
                      <View style={[styles.statusBadge, { backgroundColor: (promoter.status === 'active' ? COLORS.success : COLORS.warning) + '20' }]}>
                        <Text style={[styles.statusText, { color: promoter.status === 'active' ? COLORS.success : COLORS.warning }]}>
                          {promoter.status === 'active' ? 'Ativo' : 'Pendente'}
                        </Text>
                      </View>
                    </View>
                    {promoter.description ? <Text style={styles.descriptionText} numberOfLines={2}>{promoter.description}</Text> : null}
                    <Text style={styles.followersText}>{promoter.followersCount} seguidores</Text>
                  </View>
                </View>

                {promoter.status === 'pending' && (
                  <View style={styles.promoterActionButtons}>
                    <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleAction(promoter.id, 'reject')}>
                      <UserX size={16} color={COLORS.white} /><Text style={styles.actionButtonText}>Rejeitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.success }]} onPress={() => handleAction(promoter.id, 'approve')}>
                      <UserCheck size={16} color={COLORS.white} /><Text style={styles.actionButtonText}>Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            {filteredPromoters.length === 0 && (
              <View style={styles.emptyState}><Users size={48} color={COLORS.lightGray} /><Text style={styles.emptyStateText}>Nenhum promotor encontrado</Text></View>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 20 },
  searchContainer: { flexDirection: 'row', marginBottom: 15, gap: 10 },
  searchInputContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 9999, paddingHorizontal: 15, paddingVertical: 12, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.text },
  filterButton: {
    backgroundColor: COLORS.white, borderRadius: 9999, padding: 12, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  filterOptions: { flexDirection: 'row', marginBottom: 15, gap: 10, flexWrap: 'wrap' },
  filterOption: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.lightGray },
  filterOptionActive: { backgroundColor: COLORS.primary },
  filterOptionText: { fontSize: 14, color: COLORS.textSecondary },
  filterOptionTextActive: { color: COLORS.white, fontWeight: 'bold' as const },
  statsContainer: { flexDirection: 'row', marginBottom: 20, gap: 10 },
  statCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 12, padding: 15, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  statNumber: { fontSize: 20, fontWeight: 'bold' as const, color: COLORS.primary, marginBottom: 5 },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },
  promoterCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 15, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  promoterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  promoterInfo: { flex: 1 },
  promoterNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' },
  promoterName: { fontSize: 18, fontWeight: 'bold' as const, color: COLORS.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: 'bold' as const },
  descriptionText: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 4 },
  followersText: { fontSize: 14, color: COLORS.textSecondary },
  promoterActionButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 9999, gap: 6,
  },
  actionButtonText: { color: COLORS.white, fontSize: 14, fontWeight: 'bold' as const },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 10 },
  loadingContainer: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  profileButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 15, gap: 6,
  },
});
