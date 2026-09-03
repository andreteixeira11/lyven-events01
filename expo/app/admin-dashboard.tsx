import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  AlertCircle,
  User,
  LogOut,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  Target,
  Plus,
} from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useUser } from '@/hooks/user-context';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

type TabType = 'users' | 'events' | 'approvals' | 'analytics' | 'ads';

const TAB_CONFIG: { key: TabType; label: string; icon: typeof Users }[] = [
  { key: 'users', label: 'Utilizadores', icon: Users },
  { key: 'events', label: 'Eventos', icon: Calendar },
  { key: 'approvals', label: 'Aprovações', icon: CheckCircle },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'ads', label: 'Anúncios', icon: Target },
];

export default function AdminDashboard() {
  const { logout } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: rawUsers = [], isLoading: usersLoading, refetch: refetchUsers } = api.users.list.useQuery();
  const { data: rawEvents = [], isLoading: eventsLoading, refetch: refetchEvents } = api.events.list.useQuery();
  const { data: pendingEventsData = [], isLoading: pendingEventsLoading, refetch: refetchPendingEvents } = api.events.listPending.useQuery();
  const { data: pendingPromotersData, isLoading: pendingPromotersLoading, refetch: refetchPendingPromoters } = api.promoters.listPending.useQuery();
  const { data: dashboardData, isLoading: dashboardLoading } = api.analytics.dashboard.useQuery();
  const { data: analyticsEvents } = api.analytics.events.useQuery();

  const approveMutation = api.events.approve.useMutation({
    onSuccess: () => {
      void refetchPendingEvents();
      void refetchEvents();
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const rejectMutation = api.events.reject.useMutation({
    onSuccess: () => {
      void refetchPendingEvents();
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const approvePromoterMutation = api.promoters.approve.useMutation({
    onSuccess: () => {
      void refetchPendingPromoters();
      void queryClient.invalidateQueries({ queryKey: ['promoters'] });
    },
  });

  const rejectPromoterMutation = api.promoters.reject.useMutation({
    onSuccess: () => {
      void refetchPendingPromoters();
      void queryClient.invalidateQueries({ queryKey: ['promoters'] });
    },
  });

  const users = useMemo(() => {
    const userStatsMap: Record<string, { totalSpent: number; ticketsBought: number }> = {};
    (analyticsEvents?.events || []).forEach((e: any) => {
      // We don't have per-user ticket data from analytics.events, so compute from tickets if available
    });
    return (rawUsers || []).map((u: any) => ({
      id: u.id,
      name: u.name || 'Sem nome',
      email: u.email || '',
      userType: u.user_type || 'normal',
      totalSpent: userStatsMap[u.id]?.totalSpent || 0,
      lastAccess: u.created_at || new Date().toISOString(),
      isActive: true,
    }));
  }, [rawUsers, analyticsEvents]);

  const events = useMemo(() => {
    const statsMap: Record<string, { ticketsSold: number; revenue: number }> = {};
    (analyticsEvents?.events || []).forEach((e: any) => {
      statsMap[e.id] = { ticketsSold: e.ticketsSold || 0, revenue: e.revenue || 0 };
    });
    return (rawEvents || []).map((e: any) => ({
      id: e.id,
      title: e.title || 'Sem título',
      imageUrl: e.image || '',
      ticketsSold: statsMap[e.id]?.ticketsSold || 0,
      revenue: statsMap[e.id]?.revenue || 0,
      date: e.date instanceof Date ? e.date.toISOString() : (e.date || ''),
      status: (e as any).status || 'active',
      promoterName: e.promoter?.name || 'Desconhecido',
    }));
  }, [rawEvents, analyticsEvents]);

  const pendingPromoters = useMemo(() => pendingPromotersData?.promoters || [], [pendingPromotersData]);

  const approvals = useMemo(() => {
    const items: { id: string; type: 'event' | 'promoter' | 'ad'; title: string; description: string; submittedBy: string; submittedAt: string; imageUrl?: string }[] = [];
    (pendingEventsData || []).forEach((e: any) => {
      items.push({
        id: e.id,
        type: 'event',
        title: e.title || 'Evento',
        description: e.description || 'Novo evento criado',
        submittedBy: e.promoter?.name || 'Desconhecido',
        submittedAt: e.createdAt || new Date().toISOString(),
        imageUrl: e.image,
      });
    });
    (pendingPromoters || []).forEach((p: any) => {
      items.push({
        id: p.id,
        type: 'promoter',
        title: p.company_name || 'Promotor',
        description: p.description || 'Pedido de conta de promotor',
        submittedBy: p.company_name || 'Promotor',
        submittedAt: p.created_at || new Date().toISOString(),
      });
    });
    return items;
  }, [pendingEventsData, pendingPromoters]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      const now = new Date();
      const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
      if (diffInHours < 1) return 'Agora mesmo';
      if (diffInHours < 24) return `Há ${diffInHours}h`;
      if (diffInHours < 48) return 'Ontem';
      return date.toLocaleDateString('pt-PT');
    } catch {
      return 'N/A';
    }
  };

  const handleApprove = useCallback((id: string, type: string) => {
    Alert.alert(
      'Aprovar',
      `Tem certeza que deseja aprovar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprovar',
          onPress: async () => {
            try {
              if (type === 'event') {
                await approveMutation.mutateAsync({ eventId: id });
              } else if (type === 'promoter') {
                await approvePromoterMutation.mutateAsync({ id });
              }
              Alert.alert('Sucesso', 'Aprovado com sucesso!');
            } catch (error) {
              console.error('Erro ao aprovar:', error);
              Alert.alert('Erro', 'Falha ao aprovar. Tente novamente.');
            }
          }
        }
      ]
    );
  }, [approveMutation, approvePromoterMutation]);

  const handleReject = useCallback((id: string, type: string) => {
    Alert.alert(
      'Rejeitar',
      `Tem certeza que deseja rejeitar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rejeitar',
          style: 'destructive',
          onPress: async () => {
            try {
              if (type === 'event') {
                await rejectMutation.mutateAsync({ eventId: id });
              } else if (type === 'promoter') {
                await rejectPromoterMutation.mutateAsync({ id });
              }
              Alert.alert('Rejeitado', 'Item rejeitado.');
            } catch (error) {
              console.error('Erro ao rejeitar:', error);
              Alert.alert('Erro', 'Falha ao rejeitar. Tente novamente.');
            }
          }
        }
      ]
    );
  }, [rejectMutation, rejectPromoterMutation]);

  const handleLogout = () => {
    Alert.alert(
      'Terminar Sessão',
      'Tem certeza que deseja terminar a sessão?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Terminar Sessão',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          }
        }
      ]
    );
  };

  const handleTabPress = useCallback((tab: TabType) => {
    if (tab === 'ads') {
      router.push('/admin-ads');
      return;
    }
    setActiveTab(tab);
    setSearchQuery('');
  }, []);

  const handleRefresh = useCallback(() => {
    void refetchUsers();
    void refetchEvents();
    void refetchPendingEvents();
    void refetchPendingPromoters();
    void queryClient.invalidateQueries({ queryKey: ['analytics'] });
  }, [refetchUsers, refetchEvents, refetchPendingEvents, refetchPendingPromoters, queryClient]);

  const ProfileButton = () => (
    <TouchableOpacity style={styles.profileButton} onPress={handleLogout}>
      <User size={20} color={COLORS.white} />
      <LogOut size={16} color={COLORS.white} />
    </TouchableOpacity>
  );

  const getApprovalTypeLabel = (type: string) => {
    switch (type) {
      case 'promoter': return 'Promotor';
      case 'event': return 'Evento';
      case 'ad': return 'Anúncio';
      default: return type;
    }
  };

  const getApprovalTypeColor = (type: string) => {
    switch (type) {
      case 'promoter': return COLORS.warning;
      case 'event': return COLORS.primary;
      case 'ad': return COLORS.info;
      default: return COLORS.gray;
    }
  };

  const renderUsersTab = () => (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
    >
      <View style={styles.searchContainer}>
        <Search size={20} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Procurar utilizadores..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={COLORS.textSecondary}
        />
      </View>

      <TouchableOpacity
        style={styles.createEventButton}
        onPress={() => router.push('/admin-users')}
      >
        <Users size={20} color={COLORS.white} />
        <Text style={styles.createEventButtonText}>Gerir Utilizadores (Detalhado)</Text>
      </TouchableOpacity>

      {usersLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>A carregar utilizadores...</Text>
        </View>
      ) : (
        <>
          <View style={styles.usersStatsRow}>
            <View style={styles.usersStatCard}>
              <Text style={styles.usersStatNumber}>{users.length}</Text>
              <Text style={styles.usersStatLabel}>Total</Text>
            </View>
            <View style={styles.usersStatCard}>
              <Text style={[styles.usersStatNumber, { color: COLORS.warning }]}>{users.filter(u => u.userType === 'promoter').length}</Text>
              <Text style={styles.usersStatLabel}>Promotores</Text>
            </View>
            <View style={styles.usersStatCard}>
              <Text style={[styles.usersStatNumber, { color: COLORS.info }]}>{users.filter(u => u.userType === 'normal').length}</Text>
              <Text style={styles.usersStatLabel}>Utilizadores</Text>
            </View>
          </View>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Nome</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Tipo</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Registo</Text>
          </View>
          {users
            .filter(user =>
              user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              user.email.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map(user => (
              <View key={user.id} style={styles.tableRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <View style={[styles.userTypeBadge, {
                    backgroundColor: user.userType === 'promoter' ? COLORS.warning + '20' :
                      user.userType === 'admin' ? COLORS.error + '20' : COLORS.info + '20'
                  }]}>
                    <Text style={[styles.userTypeText, {
                      color: user.userType === 'promoter' ? COLORS.warning :
                        user.userType === 'admin' ? COLORS.error : COLORS.info
                    }]}>
                      {user.userType === 'promoter' ? 'Promotor' : user.userType === 'admin' ? 'Admin' : 'Utilizador'}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lastAccessText}>{formatDate(user.lastAccess)}</Text>
                </View>
              </View>
            ))}
          {users.length === 0 && (
            <View style={styles.emptyState}>
              <Users size={48} color={COLORS.lightGray} />
              <Text style={styles.emptyStateText}>Nenhum utilizador encontrado</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );

  const renderEventsTab = () => (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
    >
      <View style={styles.searchContainer}>
        <Search size={20} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Procurar eventos..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={COLORS.textSecondary}
        />
      </View>

      <TouchableOpacity
        style={styles.createEventButton}
        onPress={() => router.push('/admin-events')}
      >
        <Plus size={20} color={COLORS.white} />
        <Text style={styles.createEventButtonText}>Gerir / Criar Eventos</Text>
      </TouchableOpacity>

      {eventsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>A carregar eventos...</Text>
        </View>
      ) : (
        <>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Nome</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Promotor</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Data</Text>
          </View>
          {events
            .filter(event =>
              event.title.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map(event => (
              <View key={event.id} style={styles.tableRow}>
                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {event.imageUrl ? (
                    <Image source={{ uri: event.imageUrl }} style={styles.eventImage} />
                  ) : (
                    <View style={[styles.eventImage, { backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center' }]}>
                      <Calendar size={20} color={COLORS.textSecondary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventPromoter}>por {event.promoterName}</Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventPromoter}>{event.promoterName}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lastAccessText}>{formatDate(event.date)}</Text>
                </View>
              </View>
            ))}
          {events.length === 0 && (
            <View style={styles.emptyState}>
              <Calendar size={48} color={COLORS.lightGray} />
              <Text style={styles.emptyStateText}>Nenhum evento encontrado</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );

  const renderApprovalsTab = () => (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
    >
      <View style={styles.approvalsHeader}>
        <Text style={styles.sectionTitle}>Pendentes de Aprovação</Text>
        <View style={styles.approvalCount}>
          <Text style={styles.approvalCountText}>{approvals.length}</Text>
        </View>
      </View>

      {(pendingEventsLoading || pendingPromotersLoading) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>A carregar aprovações...</Text>
        </View>
      ) : (
        <>
          {approvals.map(approval => (
            <View key={approval.id} style={styles.approvalCard}>
              <View style={styles.approvalHeader}>
                <View style={styles.approvalInfo}>
                  <View style={[styles.approvalTypeBadge, { backgroundColor: getApprovalTypeColor(approval.type) + '20' }]}>
                    <Text style={[styles.approvalTypeText, { color: getApprovalTypeColor(approval.type) }]}>
                      {getApprovalTypeLabel(approval.type)}
                    </Text>
                  </View>
                  <Text style={styles.approvalTitle}>{approval.title}</Text>
                  <Text style={styles.approvalDescription}>{approval.description}</Text>
                  <View style={styles.approvalMeta}>
                    <User size={12} color={COLORS.textSecondary} />
                    <Text style={styles.approvalMetaText}>por {approval.submittedBy}</Text>
                    <Clock size={12} color={COLORS.textSecondary} />
                    <Text style={styles.approvalMetaText}>{formatDate(approval.submittedAt)}</Text>
                  </View>
                </View>
                {approval.imageUrl && (
                  <Image source={{ uri: approval.imageUrl }} style={styles.approvalImage} />
                )}
              </View>
              <View style={styles.approvalActions}>
                <TouchableOpacity
                  style={[styles.approvalButton, styles.rejectButton]}
                  onPress={() => handleReject(approval.id, approval.type)}
                >
                  <XCircle size={18} color={COLORS.white} />
                  <Text style={styles.approvalButtonText}>Rejeitar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approvalButton, styles.approveButton]}
                  onPress={() => handleApprove(approval.id, approval.type)}
                >
                  <CheckCircle size={18} color={COLORS.white} />
                  <Text style={styles.approvalButtonText}>Aprovar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {approvals.length === 0 && (
            <View style={styles.emptyState}>
              <CheckCircle size={48} color={COLORS.lightGray} />
              <Text style={styles.emptyStateText}>Nenhuma aprovação pendente</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );

  const renderAnalyticsTab = () => {
    const stats = dashboardData || { totalUsers: 0, totalEvents: 0, totalTickets: 0, totalRevenue: 0 };

    return (
      <ScrollView
        style={styles.tabContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
      >
        {dashboardLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>A carregar analytics...</Text>
          </View>
        ) : (
          <>
            <View style={styles.analyticsGrid}>
              <View style={styles.analyticsCard}>
                <View style={[styles.analyticsIcon, { backgroundColor: COLORS.success + '20' }]}>
                  <DollarSign size={24} color={COLORS.success} />
                </View>
                <Text style={styles.analyticsValue}>€{(stats.totalRevenue || 0).toLocaleString()}</Text>
                <Text style={styles.analyticsLabel}>Receita Total</Text>
              </View>
              <View style={styles.analyticsCard}>
                <View style={[styles.analyticsIcon, { backgroundColor: COLORS.primary + '20' }]}>
                  <Target size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.analyticsValue}>{(stats.totalTickets || 0).toLocaleString()}</Text>
                <Text style={styles.analyticsLabel}>Bilhetes Vendidos</Text>
              </View>
              <View style={styles.analyticsCard}>
                <View style={[styles.analyticsIcon, { backgroundColor: COLORS.warning + '20' }]}>
                  <Calendar size={24} color={COLORS.warning} />
                </View>
                <Text style={styles.analyticsValue}>{stats.totalEvents || 0}</Text>
                <Text style={styles.analyticsLabel}>Total de Eventos</Text>
              </View>
              <View style={styles.analyticsCard}>
                <View style={[styles.analyticsIcon, { backgroundColor: COLORS.info + '20' }]}>
                  <Users size={24} color={COLORS.info} />
                </View>
                <Text style={styles.analyticsValue}>{stats.totalUsers || 0}</Text>
                <Text style={styles.analyticsLabel}>Total Utilizadores</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.viewMoreButton}
              onPress={() => router.push('/admin-analytics')}
            >
              <BarChart3 size={18} color={COLORS.primary} />
              <Text style={styles.viewMoreText}>Ver Analytics Detalhado</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Administração',
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: COLORS.white,
          headerTitleStyle: { fontWeight: 'bold' as const },
          headerRight: () => <ProfileButton />
        }}
      />

      <View style={styles.content}>
        {approvals.length > 0 && activeTab !== 'approvals' && (
          <TouchableOpacity
            style={styles.alertBanner}
            onPress={() => setActiveTab('approvals')}
            activeOpacity={0.7}
          >
            <AlertCircle size={16} color={COLORS.warning} />
            <Text style={styles.alertBannerText}>
              {approvals.length} {approvals.length === 1 ? 'aprovação pendente' : 'aprovações pendentes'}
            </Text>
          </TouchableOpacity>
        )}

        {activeTab === 'users' && renderUsersTab()}
        {activeTab === 'events' && renderEventsTab()}
        {activeTab === 'approvals' && renderApprovalsTab()}
        {activeTab === 'analytics' && renderAnalyticsTab()}
      </View>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.key;
          const IconComponent = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.bottomNavItem}
              onPress={() => handleTabPress(tab.key)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.bottomNavIconWrap,
                isActive && styles.bottomNavIconWrapActive,
              ]}>
                <IconComponent size={20} color={isActive ? COLORS.white : COLORS.textSecondary} />
                {tab.key === 'approvals' && approvals.length > 0 && (
                  <View style={styles.navBadge}>
                    <Text style={styles.navBadgeText}>{approvals.length}</Text>
                  </View>
                )}
              </View>
              <Text style={[
                styles.bottomNavLabel,
                isActive && styles.bottomNavLabelActive,
              ]} numberOfLines={1}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '15',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  alertBannerText: {
    fontSize: 13,
    color: COLORS.warning,
    fontWeight: '600' as const,
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  bottomNavIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  },
  bottomNavIconWrapActive: {
    backgroundColor: COLORS.primary,
  },
  bottomNavLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500' as const,
  },
  bottomNavLabelActive: {
    color: COLORS.primary,
    fontWeight: '700' as const,
  },
  navBadge: {
    position: 'absolute' as const,
    top: -2,
    right: -4,
    backgroundColor: COLORS.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  navBadgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: 'bold' as const,
  },
  tabContent: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    margin: 20,
    marginBottom: 15,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 9999,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightGray,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableHeaderText: {
    fontSize: 13,
    fontWeight: 'bold' as const,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: COLORS.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  userTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  userTypeText: {
    fontSize: 11,
    fontWeight: 'bold' as const,
  },
  lastAccessText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  eventImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: COLORS.text,
    marginBottom: 2,
  },
  eventPromoter: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  approvalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: COLORS.text,
  },
  approvalCount: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  approvalCountText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'bold' as const,
  },
  approvalCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  approvalHeader: {
    flexDirection: 'row',
    marginBottom: 15,
    gap: 12,
  },
  approvalInfo: {
    flex: 1,
  },
  approvalTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  approvalTypeText: {
    fontSize: 11,
    fontWeight: 'bold' as const,
    textTransform: 'uppercase',
  },
  approvalTitle: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: COLORS.text,
    marginBottom: 4,
  },
  approvalDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  approvalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  approvalMetaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  approvalImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  approvalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 9999,
    gap: 6,
  },
  rejectButton: {
    backgroundColor: COLORS.error,
  },
  approveButton: {
    backgroundColor: COLORS.success,
  },
  approvalButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: 'bold' as const,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 15,
  },
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 15,
  },
  analyticsCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  analyticsIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  analyticsValue: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: COLORS.text,
    marginBottom: 4,
  },
  analyticsLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  profileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 15,
    gap: 6,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  createEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    marginHorizontal: 20,
    marginBottom: 15,
    paddingVertical: 14,
    borderRadius: 9999,
    gap: 8,
  },
  createEventButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 9999,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  viewMoreText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  usersStatsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 15,
    gap: 10,
  },
  usersStatCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  usersStatNumber: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: COLORS.primary,
    marginBottom: 4,
  },
  usersStatLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});
