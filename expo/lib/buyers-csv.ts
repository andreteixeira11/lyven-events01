import { Alert, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export interface CsvBuyer {
  name: string;
  email: string;
  phone: string;
  ticketType: string;
  quantity: number;
  totalPaid: number;
  purchaseDate: Date;
  isValidated: boolean;
  validatedAt?: Date;
}

const fmt = (d?: Date) =>
  d ? new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) : '';

/** Exporta a lista de compradores para CSV (Excel pt-PT: separador ';' e BOM UTF-8). */
export async function exportBuyersCsv(eventTitle: string, buyers: CsvBuyer[]): Promise<void> {
  try {
    if (buyers.length === 0) {
      Alert.alert('Sem dados', 'Ainda não há compradores para exportar.');
      return;
    }
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nome', 'Email', 'Telefone', 'Tipo de Bilhete', 'Quantidade', 'Total Pago (EUR)', 'Data da Compra', 'Estado', 'Validado em'];
    const rows = buyers.map((b) => [
      b.name, b.email === '—' ? '' : b.email, b.phone === '—' ? '' : b.phone, b.ticketType,
      String(b.quantity), b.totalPaid.toFixed(2), fmt(b.purchaseDate),
      b.isValidated ? 'Validado' : 'Pendente', fmt(b.validatedAt),
    ]);
    const csv = '\ufeff' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    const slug = eventTitle.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'evento';
    const fileName = `compradores-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;

    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Exportar compradores (CSV)', UTI: 'public.comma-separated-values-text' });
    } else {
      Alert.alert('Erro', 'Não é possível partilhar o ficheiro neste dispositivo');
    }
  } catch (err) {
    console.error('[exportBuyersCsv] error:', err);
    Alert.alert('Erro', 'Ocorreu um erro ao exportar o CSV');
  }
}
