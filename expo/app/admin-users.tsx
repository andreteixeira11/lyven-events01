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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { 
  Users, 
  Search, 
  Filter,
  UserCheck,
  UserX,
  Calendar,
  Mail,
  User,
  LogOut,
  Shield,
  Crown,
  Trash2,
  X,
  Phone,
} from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useUser } from '@/hooks/user-context';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface MappedUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  userType: 'normal' | 'promoter' | 'admin';
  joinDate: string;
  isActive: boolean;
  isVerified: boolean;
}

export default function AdminUsers() {
  const { logout } = useUser();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'normal' | 'promoter' | 'admin'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedUser, setSelectedUser] = useState<MappedUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  const { data: rawUsers = [], isLoading, refetch } = api.users.list.useQuery();

  const deleteMutation = api.users.delete.useMutation({
    onSuccess: () => {
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const updateMutation = api.users.update.useMutation({
    onSuccess: () => {
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const users: MappedUser[] = useMemo(() => (rawUsers || []).map((u: any) => ({
    id: u.id,
    name: u.name || 'Sem nome',
    email: u.email || '',
    phone: u.phone || undefined,
    userType: (u.user_type || 'normal') as 'normal' | 'promoter' | 'admin',
    joinDate: u.created_at || new Date().toISOString(),
    isActive: true,
    isVerified: u.is_onboarding_complete || false,
  })), [rawUsers]);

  const filteredUsers = useMemo(() => users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' || user.userType === filterType;
    return matchesSearch && matchesFilter;
  }), [users, searchQuery, filterType]);

  const getUserTypeLabel = (type: string) => {
    switch (type) {
      case 'normal': return 'Utilizador';
      case 'promoter': return 'Promotor';
      case 'admin': return 'Admin';
      default: return type;
    }
  };

  const getUserTypeColor = (type: string) => {
    switch (type) {
      case 'normal': return COLORS.info;
      case 'promoter': return COLORS.warning;
      case 'admin': return COLORS.error;
      default: return COLORS.gray;
    }
  };

  const formatDate = (dateString: string) => {
    try { return new Date(dateString).toLocaleDateString('pt-PT'); } catch { return 'N/A'; }
  };

  const handleLogout = () => {
    Alert.alert('Terminar Sessão', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const handleDeleteUser = useCallback((userId: string, userName: string) => {
    Alert.alert(
      'Eliminar Utilizador',
      `Tem certeza que deseja eliminar ${userName}? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id: userId });
              setShowUserModal(false);
              setSelectedUser(null);
              Alert.alert('Sucesso', 'Utilizador eliminado com sucesso.');
            } catch (error) {
              console.error('Error deleting user:', error);
              Alert.alert('Erro', 'Não foi possível eliminar o utilizador.');
            }
          },
        },
      ]
    );
  }, [deleteMutation]);

  const handleChangeUserType = useCallback((userId: string, userName: string, newType: string) => {
    const typeLabel = getUserTypeLabel(newType);
    Alert.alert(
      'Alterar Tipo',
      `Alterar ${userName} para ${typeLabel}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await updateMutation.mutateAsync({ id: userId, userType: newType });
              setShowUserModal(false);
              setSelectedUser(null);
              Alert.alert('Sucesso', `Utilizador alterado para ${typeLabel}.`);
            } catch (error) {
              console.error('Error updating user type:', error);
              Alert.alert('Erro', 'Não foi possível alterar o tipo do utilizador.');
            }
          },
        },
      ]
    );
  }, [updateMutation]);

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const promoters = users.filter(u => u.userType === 'promoter').length;
  const normalUsers = users.filter(u => u.userType === 'normal').length;

  const [userTypeTab, setUserTypeTab] = useState<'all' | 'normal' | 'promoter' | 'admin'>('all');

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: 'Gerir Utilizadores', headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white, headerTitleStyle: { fontWeight: 'bold' as const },
        headerRight: () => (
          <TouchableOpacity style={styles.profileButton} onPress={handleLogout}>
            <User size={20} color={COLORS.white} />
            <LogOut size={16} color={COLORS.white} />
          </TouchableOpacity>
        ),
      }} />

            <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
<ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refetch()} />}
      >
        <View style={styles.userTypeTabs}>
          {([
            { key: 'all' as const, label: 'Todos', count: totalUsers },
            { key: 'normal' as const, label: 'Utilizadores', count: normalUsers },
            { key: 'promoter' as const, label: 'Promotores', count: promoters },
            { key: 'admin' as const, label: 'Admins', count: users.filter(u => u.userType === 'admin').length },
          ]).map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.userTypeTab, userTypeTab === tab.key && styles.userTypeTabActive]}
              onPress={() => { setUserTypeTab(tab.key); setFilterType(tab.key); }}
            >
              <Text style={[styles.userTypeTabText, userTypeTab === tab.key && styles.userTypeTabTextActive]}>
                {tab.label}
              </Text>
              <View style={[styles.userTypeTabBadge, userTypeTab === tab.key && styles.userTypeTabBadgeActive]}>
                <Text style={[styles.userTypeTabBadgeText, userTypeTab === tab.key && styles.userTypeTabBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Search size={20} color={COLORS.textSecondary} />
            <TextInput style={styles.searchInput} placeholder="Procurar utilizadores..." value={searchQuery} onChangeText={setSearchQuery} placeholderTextColor={COLORS.textSecondary} />
          </View>
          <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilters(!showFilters)}>
            <Filter size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filterOptions}>
            {(['all', 'normal', 'promoter', 'admin'] as const).map(type => (
              <TouchableOpacity key={type} style={[styles.filterOption, filterType === type && styles.filterOptionActive]} onPress={() => setFilterType(type)}>
                <Text style={[styles.filterOptionText, filterType === type && styles.filterOptionTextActive]}>
                  {type === 'all' ? 'Todos' : getUserTypeLabel(type)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{totalUsers}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.success }]}>{activeUsers}</Text>
            <Text style={styles.statLabel}>Ativos</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.warning }]}>{promoters}</Text>
            <Text style={styles.statLabel}>Promotores</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.info }]}>{normalUsers}</Text>
            <Text style={styles.statLabel}>Utilizadores</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>A carregar...</Text>
          </View>
        ) : (
          <>
            {filteredUsers.map(u => (
              <TouchableOpacity
                key={u.id}
                style={styles.userCard}
                activeOpacity={0.7}
                onPress={() => { setSelectedUser(u); setShowUserModal(true); }}
              >
                <View style={styles.userHeader}>
                  <View style={styles.userAvatarContainer}>
                    <View style={[styles.userAvatar, { backgroundColor: getUserTypeColor(u.userType) + '20' }]}>
                      <User size={20} color={getUserTypeColor(u.userType)} />
                    </View>
                  </View>
                  <View style={styles.userInfo}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{u.name}</Text>
                      {u.isVerified && <UserCheck size={14} color={COLORS.success} />}
                    </View>
                    <Text style={styles.userEmail}>{u.email}</Text>
                    <View style={[styles.userTypeBadge, { backgroundColor: getUserTypeColor(u.userType) + '20' }]}>
                      <Text style={[styles.userTypeText, { color: getUserTypeColor(u.userType) }]}>
                        {getUserTypeLabel(u.userType)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.userDetails}>
                  <View style={styles.detailRow}>
                    <Calendar size={13} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>Membro desde {formatDate(u.joinDate)}</Text>
                  </View>
                  {u.phone && (
                    <View style={styles.detailRow}>
                      <Phone size={13} color={COLORS.textSecondary} />
                      <Text style={styles.detailText}>{u.phone}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.userActions}>
                  {u.userType === 'normal' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: COLORS.warning }]}
                      onPress={(e) => { e.stopPropagation(); handleChangeUserType(u.id, u.name, 'promoter'); }}
                    >
                      <Crown size={14} color={COLORS.white} />
                      <Text style={styles.actionBtnText}>Promotor</Text>
                    </TouchableOpacity>
                  )}
                  {u.userType === 'promoter' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: COLORS.info }]}
                      onPress={(e) => { e.stopPropagation(); handleChangeUserType(u.id, u.name, 'normal'); }}
                    >
                      <UserX size={14} color={COLORS.white} />
                      <Text style={styles.actionBtnText}>Remover Promotor</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: COLORS.error }]}
                    onPress={(e) => { e.stopPropagation(); handleDeleteUser(u.id, u.name); }}
                  >
                    <Trash2 size={14} color={COLORS.white} />
                    <Text style={styles.actionBtnText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
            {filteredUsers.length === 0 && (
              <View style={styles.emptyState}>
                <Users size={48} color={COLORS.lightGray} />
                <Text style={styles.emptyStateText}>Nenhum utilizador encontrado</Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showUserModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowUserModal(false); setSelectedUser(null); }}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Detalhes do Utilizador</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedUser && (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.modalUserHeader}>
                <View style={[styles.modalAvatar, { backgroundColor: getUserTypeColor(selectedUser.userType) + '20' }]}>
                  <User size={40} color={getUserTypeColor(selectedUser.userType)} />
                </View>
                <Text style={styles.modalUserName}>{selectedUser.name}</Text>
                <View style={[styles.modalTypeBadge, { backgroundColor: getUserTypeColor(selectedUser.userType) + '20' }]}>
                  <Text style={[styles.modalTypeText, { color: getUserTypeColor(selectedUser.userType) }]}>
                    {getUserTypeLabel(selectedUser.userType)}
                  </Text>
                </View>
              </View>

              <View style={styles.modalInfoSection}>
                <Text style={styles.modalSectionTitle}>Informações</Text>
                <View style={styles.modalInfoRow}>
                  <Mail size={18} color={COLORS.primary} />
                  <View style={styles.modalInfoContent}>
                    <Text style={styles.modalInfoLabel}>Email</Text>
                    <Text style={styles.modalInfoValue}>{selectedUser.email}</Text>
                  </View>
                </View>
                {selectedUser.phone && (
                  <View style={styles.modalInfoRow}>
                    <Phone size={18} color={COLORS.primary} />
                    <View style={styles.modalInfoContent}>
                      <Text style={styles.modalInfoLabel}>Telefone</Text>
                      <Text style={styles.modalInfoValue}>{selectedUser.phone}</Text>
                    </View>
                  </View>
                )}
                <View style={styles.modalInfoRow}>
                  <Calendar size={18} color={COLORS.primary} />
                  <View style={styles.modalInfoContent}>
                    <Text style={styles.modalInfoLabel}>Membro desde</Text>
                    <Text style={styles.modalInfoValue}>{formatDate(selectedUser.joinDate)}</Text>
                  </View>
                </View>
                <View style={styles.modalInfoRow}>
                  <Shield size={18} color={COLORS.primary} />
                  <View style={styles.modalInfoContent}>
                    <Text style={styles.modalInfoLabel}>Estado</Text>
                    <Text style={styles.modalInfoValue}>
                      {selectedUser.isVerified ? 'Verificado' : 'Não verificado'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.modalInfoSection}>
                <Text style={styles.modalSectionTitle}>Ações</Text>

                {selectedUser.userType === 'normal' && (
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: COLORS.warning }]}
                    onPress={() => handleChangeUserType(selectedUser.id, selectedUser.name, 'promoter')}
                  >
                    <Crown size={18} color={COLORS.white} />
                    <Text style={styles.modalActionBtnText}>Promover a Promotor</Text>
                  </TouchableOpacity>
                )}

                {selectedUser.userType === 'promoter' && (
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: COLORS.info }]}
                    onPress={() => handleChangeUserType(selectedUser.id, selectedUser.name, 'normal')}
                  >
                    <UserX size={18} color={COLORS.white} />
                    <Text style={styles.modalActionBtnText}>Remover Acesso Promotor</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.modalActionBtn, { backgroundColor: COLORS.error }]}
                  onPress={() => handleDeleteUser(selectedUser.id, selectedUser.name)}
                >
                  <Trash2 size={18} color={COLORS.white} />
                  <Text style={styles.modalActionBtnText}>Eliminar Utilizador</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 60 }} />
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 20 },
  userTypeTabs: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 9999, padding: 4, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  userTypeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 6, borderRadius: 9999, gap: 4,
  },
  userTypeTabActive: { backgroundColor: COLORS.primary },
  userTypeTabText: { fontSize: 12, fontWeight: '600' as const, color: COLORS.textSecondary },
  userTypeTabTextActive: { color: COLORS.white },
  userTypeTabBadge: {
    backgroundColor: COLORS.lightGray, borderRadius: 10, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  userTypeTabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  userTypeTabBadgeText: { color: COLORS.textSecondary, fontSize: 10, fontWeight: 'bold' as const },
  userTypeTabBadgeTextActive: { color: COLORS.white },
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
  filterOptions: { flexDirection: 'row', marginBottom: 15, gap: 10 },
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
  userCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 15, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  userHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  userAvatarContainer: {},
  userAvatar: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center',
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  userName: { fontSize: 16, fontWeight: 'bold' as const, color: COLORS.text },
  userEmail: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 },
  userTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start' },
  userTypeText: { fontSize: 11, fontWeight: 'bold' as const },
  userDetails: { marginBottom: 12, gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, color: COLORS.textSecondary },
  userActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9999, gap: 4,
  },
  actionBtnText: { color: COLORS.white, fontSize: 12, fontWeight: 'bold' as const },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 10 },
  loadingContainer: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  profileButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 15, gap: 6,
  },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.white,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' as const, color: COLORS.text },
  modalContent: { flex: 1, padding: 20 },
  modalUserHeader: {
    alignItems: 'center', marginBottom: 24, paddingVertical: 20,
  },
  modalAvatar: {
    width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  modalUserName: {
    fontSize: 22, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 8,
  },
  modalTypeBadge: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
  },
  modalTypeText: {
    fontSize: 14, fontWeight: 'bold' as const,
  },
  modalInfoSection: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  modalSectionTitle: {
    fontSize: 16, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 16,
  },
  modalInfoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14,
  },
  modalInfoContent: { flex: 1 },
  modalInfoLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 },
  modalInfoValue: { fontSize: 15, color: COLORS.text, fontWeight: '500' as const },
  modalActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 9999, gap: 8, marginBottom: 10,
  },
  modalActionBtnText: {
    color: COLORS.white, fontSize: 16, fontWeight: 'bold' as const,
  },
});
