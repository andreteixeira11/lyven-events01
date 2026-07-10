import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Search,
  Plus,
  X,
  Eye,
  MousePointer,
  TrendingUp,
  DollarSign,
  Calendar,
  Upload,
  Trash2,
  Edit3,
  BarChart3,
  Power,
  PowerOff,
  ChevronDown,
  User,
  LogOut,
  Target,
  Image as ImageIcon,
} from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useUser } from '@/hooks/user-context';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { uploadImageToBucket } from '@/utils/supabase-upload';
import DatePicker from '@/components/DatePicker';

type AdType = 'banner' | 'card' | 'sponsored_event';
type AdPosition = 'home_top' | 'home_middle' | 'search_results' | 'event_detail';

const AD_TYPES: { key: AdType; label: string }[] = [
  { key: 'banner', label: 'Banner' },
  { key: 'card', label: 'Card' },
  { key: 'sponsored_event', label: 'Evento Patrocinado' },
];

const AD_POSITIONS: { key: AdPosition; label: string; size: string }[] = [
  { key: 'home_top', label: 'Topo - Início', size: '1200 × 300 px' },
  { key: 'home_middle', label: 'Meio - Início', size: '1080 × 607 px (16:9)' },
  { key: 'search_results', label: 'Resultados de Pesquisa', size: '1080 × 270 px (4:1)' },
  { key: 'event_detail', label: 'Detalhe do Evento', size: '1080 × 607 px (16:9)' },
];

interface AdFormData {
  title: string;
  description: string;
  image: string;
  targetUrl: string;
  type: AdType;
  position: AdPosition;
  startDate: Date;
  endDate: Date;
  budget: string;
}

const initialFormData: AdFormData = {
  title: '',
  description: '',
  image: '',
  targetUrl: '',
  type: 'banner',
  position: 'home_top',
  startDate: new Date(),
  endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  budget: '',
};

export default function AdminAds() {
  const { logout } = useUser();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AdFormData>(initialFormData);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);

  const { data: adsData, isLoading, refetch } = api.advertisements.list.useQuery();
  const { data: adStats, isLoading: statsLoading } = api.advertisements.stats.useQuery(
    selectedAdId ? { id: selectedAdId } : undefined,
    { enabled: !!selectedAdId }
  );

  const createMutation = api.advertisements.create.useMutation({
    onSuccess: () => {
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['advertisements'] });
      setShowCreateModal(false);
      resetForm();
      Alert.alert('Sucesso', 'Anúncio criado com sucesso!');
    },
    onError: (err: Error) => {
      Alert.alert('Erro', err.message || 'Falha ao criar anúncio.');
    },
  });

  const updateMutation = api.advertisements.update.useMutation({
    onSuccess: () => {
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['advertisements'] });
      setShowCreateModal(false);
      setEditingAdId(null);
      resetForm();
      Alert.alert('Sucesso', 'Anúncio atualizado com sucesso!');
    },
    onError: (err: Error) => {
      Alert.alert('Erro', err.message || 'Falha ao atualizar anúncio.');
    },
  });

  const deleteMutation = api.advertisements.delete.useMutation({
    onSuccess: () => {
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['advertisements'] });
      Alert.alert('Sucesso', 'Anúncio eliminado.');
    },
  });

  const approveMutation = api.advertisements.approve.useMutation({
    onSuccess: () => {
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['advertisements'] });
    },
  });

  const ads = useMemo(() => {
    const list = adsData?.ads || [];
    if (!searchQuery) return list;
    return list.filter((ad: any) =>
      ad.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ad.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [adsData, searchQuery]);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setEditingAdId(null);
  }, []);

  const handlePickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão Necessária', 'Precisamos de acesso à galeria.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIsUploading(true);
        try {
          const publicUrl = await uploadImageToBucket('ads', result.assets[0].uri, 'ad');
          setFormData(p => ({ ...p, image: publicUrl }));
        } catch (uploadErr: any) {
          console.error('Upload failed:', uploadErr);
          setFormData(p => ({ ...p, image: result.assets[0]!.uri }));
          Alert.alert('Aviso', 'Upload para o servidor falhou. A imagem local será usada.');
        } finally {
          setIsUploading(false);
        }
      }
    } catch (error) {
      console.error('Erro ao selecionar imagem:', error);
      Alert.alert('Erro', 'Falha ao selecionar imagem.');
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.title.trim()) { Alert.alert('Erro', 'Preencha o título.'); return; }
    if (!formData.image) { Alert.alert('Erro', 'Adicione uma imagem.'); return; }
    if (!formData.budget.trim() || isNaN(Number(formData.budget))) { Alert.alert('Erro', 'Preencha o orçamento.'); return; }

    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        image: formData.image,
        targetUrl: formData.targetUrl.trim(),
        type: formData.type,
        position: formData.position,
        startDate: formData.startDate.toISOString(),
        endDate: formData.endDate.toISOString(),
        budget: parseFloat(formData.budget),
      };

      if (editingAdId) {
        await updateMutation.mutateAsync({ id: editingAdId, ...payload });
      } else {
        await createMutation.mutateAsync({ ...payload, isActive: true });
      }
    } catch {
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editingAdId, createMutation, updateMutation]);

  const handleEdit = useCallback((ad: any) => {
    setFormData({
      title: ad.title || '',
      description: ad.description || '',
      image: ad.image || '',
      targetUrl: ad.target_url || '',
      type: ad.type || 'banner',
      position: ad.position || 'home_top',
      startDate: ad.start_date ? new Date(ad.start_date) : new Date(),
      endDate: ad.end_date ? new Date(ad.end_date) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      budget: ad.budget?.toString() || '',
    });
    setEditingAdId(ad.id);
    setShowCreateModal(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Eliminar Anúncio', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
    ]);
  }, [deleteMutation]);

  const handleToggleActive = useCallback((ad: any) => {
    if (ad.is_active) {
      updateMutation.mutate({ id: ad.id, isActive: false });
    } else {
      approveMutation.mutate({ id: ad.id });
    }
  }, [updateMutation, approveMutation]);

  const handleViewStats = useCallback((adId: string) => {
    setSelectedAdId(adId);
    setShowStatsModal(true);
  }, []);

  const handleLogout = () => {
    Alert.alert('Terminar Sessão', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const formatDate = (dateString: string) => {
    try { return new Date(dateString).toLocaleDateString('pt-PT'); } catch { return 'N/A'; }
  };

  const getTypeLabel = (type: string) => AD_TYPES.find(t => t.key === type)?.label || type;
  const getPositionLabel = (pos: string) => AD_POSITIONS.find(p => p.key === pos)?.label || pos;

  const totalAds = ads.length;
  const activeAds = ads.filter((a: any) => a.is_active).length;
  const totalImpressions = ads.reduce((sum: number, a: any) => sum + (a.impressions || 0), 0);
  const totalClicks = ads.reduce((sum: number, a: any) => sum + (a.clicks || 0), 0);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: 'Gerir Anúncios',
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
        <TouchableOpacity style={styles.createButton} onPress={() => { resetForm(); setShowCreateModal(true); }}>
          <Plus size={20} color={COLORS.white} />
          <Text style={styles.createButtonText}>Criar Anúncio</Text>
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Target size={18} color={COLORS.primary} />
            <Text style={styles.statNumber}>{totalAds}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Power size={18} color={COLORS.success} />
            <Text style={[styles.statNumber, { color: COLORS.success }]}>{activeAds}</Text>
            <Text style={styles.statLabel}>Ativos</Text>
          </View>
          <View style={styles.statCard}>
            <Eye size={18} color={COLORS.info} />
            <Text style={[styles.statNumber, { color: COLORS.info }]}>{totalImpressions}</Text>
            <Text style={styles.statLabel}>Impressões</Text>
          </View>
          <View style={styles.statCard}>
            <MousePointer size={18} color={COLORS.warning} />
            <Text style={[styles.statNumber, { color: COLORS.warning }]}>{totalClicks}</Text>
            <Text style={styles.statLabel}>Cliques</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Search size={20} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Procurar anúncios..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>A carregar anúncios...</Text>
          </View>
        ) : (
          <>
            {ads.map((ad: any) => (
              <View key={ad.id} style={styles.adCard}>
                <View style={styles.adHeader}>
                  {ad.image ? (
                    <Image source={{ uri: ad.image }} style={styles.adImage} />
                  ) : (
                    <View style={[styles.adImage, styles.adImagePlaceholder]}>
                      <ImageIcon size={24} color={COLORS.textSecondary} />
                    </View>
                  )}
                  <View style={styles.adInfo}>
                    <Text style={styles.adTitle} numberOfLines={1}>{ad.title}</Text>
                    <Text style={styles.adDescription} numberOfLines={1}>{ad.description}</Text>
                    <View style={styles.adBadges}>
                      <View style={[styles.badge, { backgroundColor: COLORS.primary + '15' }]}>
                        <Text style={[styles.badgeText, { color: COLORS.primary }]}>{getTypeLabel(ad.type)}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: ad.is_active ? COLORS.success + '15' : COLORS.error + '15' }]}>
                        <Text style={[styles.badgeText, { color: ad.is_active ? COLORS.success : COLORS.error }]}>
                          {ad.is_active ? 'Ativo' : 'Inativo'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.adMetrics}>
                  <View style={styles.metric}>
                    <Eye size={14} color={COLORS.textSecondary} />
                    <Text style={styles.metricValue}>{ad.impressions || 0}</Text>
                    <Text style={styles.metricLabel}>Impressões</Text>
                  </View>
                  <View style={styles.metric}>
                    <MousePointer size={14} color={COLORS.textSecondary} />
                    <Text style={styles.metricValue}>{ad.clicks || 0}</Text>
                    <Text style={styles.metricLabel}>Cliques</Text>
                  </View>
                  <View style={styles.metric}>
                    <TrendingUp size={14} color={COLORS.textSecondary} />
                    <Text style={styles.metricValue}>
                      {ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) + '%' : '0%'}
                    </Text>
                    <Text style={styles.metricLabel}>CTR</Text>
                  </View>
                  <View style={styles.metric}>
                    <DollarSign size={14} color={COLORS.textSecondary} />
                    <Text style={styles.metricValue}>€{ad.budget || 0}</Text>
                    <Text style={styles.metricLabel}>Orçamento</Text>
                  </View>
                </View>

                <View style={styles.adDates}>
                  <View style={styles.dateItem}>
                    <Calendar size={12} color={COLORS.textSecondary} />
                    <Text style={styles.dateText}>Início: {formatDate(ad.start_date)}</Text>
                  </View>
                  <View style={styles.dateItem}>
                    <Calendar size={12} color={COLORS.textSecondary} />
                    <Text style={styles.dateText}>Fim: {formatDate(ad.end_date)}</Text>
                  </View>
                </View>

                <View style={styles.adActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: COLORS.info + '15' }]}
                    onPress={() => handleViewStats(ad.id)}
                  >
                    <BarChart3 size={16} color={COLORS.info} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: COLORS.warning + '15' }]}
                    onPress={() => handleEdit(ad)}
                  >
                    <Edit3 size={16} color={COLORS.warning} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: ad.is_active ? COLORS.error + '15' : COLORS.success + '15' }]}
                    onPress={() => handleToggleActive(ad)}
                  >
                    {ad.is_active ? (
                      <PowerOff size={16} color={COLORS.error} />
                    ) : (
                      <Power size={16} color={COLORS.success} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: COLORS.error + '15' }]}
                    onPress={() => handleDelete(ad.id)}
                  >
                    <Trash2 size={16} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {ads.length === 0 && !isLoading && (
              <View style={styles.emptyState}>
                <Target size={48} color={COLORS.lightGray} />
                <Text style={styles.emptyStateText}>Nenhum anúncio encontrado</Text>
                <Text style={styles.emptyStateSubtext}>Crie o primeiro anúncio</Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowCreateModal(false); resetForm(); }}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingAdId ? 'Editar Anúncio' : 'Criar Anúncio'}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Título *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Título do anúncio"
              value={formData.title}
              onChangeText={v => setFormData(p => ({ ...p, title: v }))}
              placeholderTextColor={COLORS.textSecondary}
              maxLength={60}
            />

            <Text style={styles.fieldLabel}>Descrição</Text>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Descrição do anúncio"
              value={formData.description}
              onChangeText={v => setFormData(p => ({ ...p, description: v }))}
              multiline
              placeholderTextColor={COLORS.textSecondary}
              maxLength={200}
            />

            <Text style={styles.fieldLabel}>Imagem *</Text>
            {formData.image ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: formData.image }} style={styles.imagePreview} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => setFormData(p => ({ ...p, image: '' }))}
                >
                  <X size={18} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.uploadArea} onPress={handlePickImage} disabled={isUploading}>
                {isUploading ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <>
                    <Upload size={28} color={COLORS.primary} />
                    <Text style={styles.uploadText}>Fazer upload da imagem</Text>
                    <Text style={styles.uploadSubtext}>Toque para selecionar da galeria</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {!formData.image && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>ou</Text>
                  <View style={styles.dividerLine} />
                </View>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Cole o URL da imagem"
                  value={formData.image}
                  onChangeText={v => setFormData(p => ({ ...p, image: v }))}
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </>
            )}

            <Text style={styles.fieldLabel}>Link de Destino</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="https://exemplo.com"
              value={formData.targetUrl}
              onChangeText={v => setFormData(p => ({ ...p, targetUrl: v }))}
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="url"
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Tipo de Anúncio *</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setShowTypePicker(!showTypePicker)}
            >
              <Text style={styles.selectorText}>{getTypeLabel(formData.type)}</Text>
              <ChevronDown size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            {showTypePicker && (
              <View style={styles.pickerList}>
                {AD_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.pickerItem, formData.type === t.key && styles.pickerItemActive]}
                    onPress={() => { setFormData(p => ({ ...p, type: t.key })); setShowTypePicker(false); }}
                  >
                    <Text style={[styles.pickerItemText, formData.type === t.key && styles.pickerItemTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>Posição *</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setShowPositionPicker(!showPositionPicker)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.selectorText}>{getPositionLabel(formData.position)}</Text>
                <Text style={styles.selectorSizeHint}>
                  {AD_POSITIONS.find(p => p.key === formData.position)?.size}
                </Text>
              </View>
              <ChevronDown size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            {showPositionPicker && (
              <View style={styles.pickerList}>
                {AD_POSITIONS.map(p => (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.pickerItem, formData.position === p.key && styles.pickerItemActive]}
                    onPress={() => { setFormData(prev => ({ ...prev, position: p.key })); setShowPositionPicker(false); }}
                  >
                    <Text style={[styles.pickerItemText, formData.position === p.key && styles.pickerItemTextActive]}>
                      {p.label}
                    </Text>
                    <Text style={[styles.pickerItemSize, formData.position === p.key && styles.pickerItemSizeActive]}>
                      {p.size}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>Data de Início *</Text>
            <DatePicker
              date={formData.startDate}
              onDateChange={d => setFormData(p => ({ ...p, startDate: d }))}
              minimumDate={new Date()}
            />

            <View style={{ height: 12 }} />

            <Text style={styles.fieldLabel}>Data de Fim *</Text>
            <DatePicker
              date={formData.endDate}
              onDateChange={d => setFormData(p => ({ ...p, endDate: d }))}
              minimumDate={formData.startDate}
            />

            <View style={{ height: 12 }} />

            <Text style={styles.fieldLabel}>Orçamento (€) *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: 100"
              value={formData.budget}
              onChangeText={v => setFormData(p => ({ ...p, budget: v }))}
              keyboardType="numeric"
              placeholderTextColor={COLORS.textSecondary}
            />

            <TouchableOpacity
              style={[styles.submitBtn, (isSubmitting || isUploading) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting || isUploading}
            >
              {isSubmitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Plus size={20} color={COLORS.white} />
                  <Text style={styles.submitBtnText}>
                    {editingAdId ? 'Guardar Alterações' : 'Criar Anúncio'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: 60 }} />
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showStatsModal} animationType="slide" transparent>
        <View style={styles.statsOverlay}>
          <View style={styles.statsContent}>
            <View style={styles.statsHeader}>
              <Text style={styles.statsTitle}>Estatísticas do Anúncio</Text>
              <TouchableOpacity onPress={() => { setShowStatsModal(false); setSelectedAdId(null); }}>
                <X size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {statsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : adStats ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.statsGrid}>
                  <View style={styles.statsCard}>
                    <View style={[styles.statsIcon, { backgroundColor: COLORS.info + '15' }]}>
                      <Eye size={22} color={COLORS.info} />
                    </View>
                    <Text style={styles.statsValue}>{adStats.impressions?.toLocaleString() || 0}</Text>
                    <Text style={styles.statsLabel}>Impressões</Text>
                  </View>
                  <View style={styles.statsCard}>
                    <View style={[styles.statsIcon, { backgroundColor: COLORS.warning + '15' }]}>
                      <MousePointer size={22} color={COLORS.warning} />
                    </View>
                    <Text style={styles.statsValue}>{adStats.clicks?.toLocaleString() || 0}</Text>
                    <Text style={styles.statsLabel}>Cliques</Text>
                  </View>
                  <View style={styles.statsCard}>
                    <View style={[styles.statsIcon, { backgroundColor: COLORS.success + '15' }]}>
                      <TrendingUp size={22} color={COLORS.success} />
                    </View>
                    <Text style={styles.statsValue}>{adStats.ctr || 0}%</Text>
                    <Text style={styles.statsLabel}>CTR</Text>
                  </View>
                  <View style={styles.statsCard}>
                    <View style={[styles.statsIcon, { backgroundColor: COLORS.primary + '15' }]}>
                      <DollarSign size={22} color={COLORS.primary} />
                    </View>
                    <Text style={styles.statsValue}>€{adStats.budget || 0}</Text>
                    <Text style={styles.statsLabel}>Orçamento</Text>
                  </View>
                </View>

                <View style={styles.statsDetailCard}>
                  <Text style={styles.statsDetailTitle}>Performance</Text>
                  <View style={styles.statsDetailRow}>
                    <Text style={styles.statsDetailLabel}>Custo por Clique (CPC)</Text>
                    <Text style={styles.statsDetailValue}>€{adStats.costPerClick || '0.00'}</Text>
                  </View>
                  <View style={styles.statsDetailRow}>
                    <Text style={styles.statsDetailLabel}>Custo por Impressão (CPM)</Text>
                    <Text style={styles.statsDetailValue}>€{adStats.costPerImpression || '0.0000'}</Text>
                  </View>
                  <View style={styles.statsDetailRow}>
                    <Text style={styles.statsDetailLabel}>Gasto Total</Text>
                    <Text style={styles.statsDetailValue}>€{adStats.spent || 0}</Text>
                  </View>
                </View>
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <BarChart3 size={48} color={COLORS.lightGray} />
                <Text style={styles.emptyStateText}>Sem dados disponíveis</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 20 },
  profileButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 15, gap: 6,
  },
  createButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, borderRadius: 9999, paddingVertical: 14, marginBottom: 15, gap: 8,
  },
  createButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' as const },
  statsRow: { flexDirection: 'row', marginBottom: 15, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  statNumber: { fontSize: 18, fontWeight: 'bold' as const, color: COLORS.primary },
  statLabel: { fontSize: 10, color: COLORS.textSecondary },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 9999, paddingHorizontal: 15, paddingVertical: 12, gap: 10, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.text },
  adCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 15, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  adHeader: { flexDirection: 'row', marginBottom: 12, gap: 12 },
  adImage: { width: 64, height: 64, borderRadius: 10 },
  adImagePlaceholder: { backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center' },
  adInfo: { flex: 1, justifyContent: 'center' },
  adTitle: { fontSize: 16, fontWeight: '700' as const, color: COLORS.text, marginBottom: 3 },
  adDescription: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 },
  adBadges: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' as const },
  adMetrics: { flexDirection: 'row', marginBottom: 10, gap: 4 },
  metric: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: 8, padding: 8, alignItems: 'center', gap: 3,
  },
  metricValue: { fontSize: 14, fontWeight: '700' as const, color: COLORS.text },
  metricLabel: { fontSize: 10, color: COLORS.textSecondary },
  adDates: { flexDirection: 'row', marginBottom: 10, gap: 16 },
  dateItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 12, color: COLORS.textSecondary },
  adActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionBtn: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 8 },
  emptyStateText: { fontSize: 16, color: COLORS.textSecondary, fontWeight: '600' as const },
  emptyStateSubtext: { fontSize: 14, color: COLORS.textSecondary },
  loadingContainer: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.white,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' as const, color: COLORS.text },
  modalContent: { flex: 1, padding: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600' as const, color: COLORS.text, marginBottom: 8, marginTop: 12 },
  modalInput: {
    backgroundColor: COLORS.white, borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: 4,
  },
  imagePreviewContainer: { position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  imagePreview: { width: '100%', height: 180, borderRadius: 12 },
  removeImageBtn: {
    position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center',
  },
  uploadArea: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 28, alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', marginBottom: 8, gap: 6,
  },
  uploadText: { fontSize: 15, fontWeight: '600' as const, color: COLORS.text },
  uploadSubtext: { fontSize: 13, color: COLORS.textSecondary },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 13, color: COLORS.textSecondary, marginHorizontal: 12 },
  selector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 4,
  },
  selectorText: { fontSize: 16, color: COLORS.text },
  selectorSizeHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  pickerList: {
    backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 8, overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  pickerItemActive: { backgroundColor: COLORS.primary + '10' },
  pickerItemText: { fontSize: 15, color: COLORS.text },
  pickerItemTextActive: { color: COLORS.primary, fontWeight: '600' as const },
  pickerItemSize: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  pickerItemSizeActive: { color: COLORS.primary },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, borderRadius: 9999, paddingVertical: 16, marginTop: 20, gap: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' as const },
  statsOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  statsContent: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '75%',
  },
  statsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
  },
  statsTitle: { fontSize: 20, fontWeight: 'bold' as const, color: COLORS.text },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statsCard: {
    flex: 1, minWidth: 140, backgroundColor: COLORS.background, borderRadius: 12, padding: 16, alignItems: 'center', gap: 8,
  },
  statsIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  statsValue: { fontSize: 22, fontWeight: 'bold' as const, color: COLORS.text },
  statsLabel: { fontSize: 12, color: COLORS.textSecondary },
  statsDetailCard: {
    backgroundColor: COLORS.background, borderRadius: 12, padding: 16, marginBottom: 16,
  },
  statsDetailTitle: { fontSize: 16, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 12 },
  statsDetailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  statsDetailLabel: { fontSize: 14, color: COLORS.textSecondary },
  statsDetailValue: { fontSize: 14, fontWeight: '600' as const, color: COLORS.text },
});
