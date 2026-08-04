import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';

interface DatePickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  label?: string;
  placeholder?: string;
}

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isDateDisabled(date: Date, min?: Date, max?: Date): boolean {
  if (min) {
    const minDay = new Date(min.getFullYear(), min.getMonth(), min.getDate());
    if (date < minDay) return true;
  }
  if (max) {
    const maxDay = new Date(max.getFullYear(), max.getMonth(), max.getDate());
    if (date > maxDay) return true;
  }
  return false;
}

function CustomCalendar({
  selectedDate,
  onSelect,
  minimumDate,
  maximumDate,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const days = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const cells: (Date | null)[] = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(viewYear, viewMonth, d));
    }
    return cells;
  }, [viewYear, viewMonth]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const today = new Date();

  return (
    <View style={calStyles.container}>
      <View style={calStyles.header}>
        <TouchableOpacity onPress={goToPrevMonth} style={calStyles.navBtn}>
          <ChevronLeft size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={calStyles.monthYear}>
          {MONTHS_PT[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={goToNextMonth} style={calStyles.navBtn}>
          <ChevronRight size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={calStyles.weekdaysRow}>
        {WEEKDAYS_PT.map(wd => (
          <View key={wd} style={calStyles.weekdayCell}>
            <Text style={calStyles.weekdayText}>{wd}</Text>
          </View>
        ))}
      </View>

      <View style={calStyles.daysGrid}>
        {days.map((day, idx) => {
          if (!day) {
            return <View key={`empty-${idx}`} style={calStyles.dayCell} />;
          }
          const disabled = isDateDisabled(day, minimumDate, maximumDate);
          const selected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, today);

          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={calStyles.dayCell}
              onPress={() => !disabled && onSelect(day)}
              disabled={disabled}
              activeOpacity={0.6}
            >
              <View
                style={[
                  calStyles.dayCircle,
                  selected && calStyles.dayCircleSelected,
                  isToday && !selected && calStyles.dayCircleToday,
                ]}
              >
                <Text
                  style={[
                    calStyles.dayText,
                    disabled && calStyles.dayTextDisabled,
                    selected && calStyles.dayTextSelected,
                    isToday && !selected && calStyles.dayTextToday,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background || '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthYear: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: COLORS.text,
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekdayText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: COLORS.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleSelected: {
    backgroundColor: COLORS.primary,
  },
  dayCircleToday: {
    backgroundColor: COLORS.primary + '15',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: COLORS.text,
  },
  dayTextDisabled: {
    color: COLORS.textSecondary + '60',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '700' as const,
  },
  dayTextToday: {
    color: COLORS.primary,
    fontWeight: '700' as const,
  },
});

export default function DatePicker({
  date,
  onDateChange,
  minimumDate,
  maximumDate,
  label,
}: DatePickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState(date);

  const formatShortDate = (d: Date): string => {
    try {
      return new Intl.DateTimeFormat('pt-PT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(d);
    } catch {
      return d.toLocaleDateString();
    }
  };

  const formatDate = (d: Date): string => {
    try {
      return new Intl.DateTimeFormat('pt-PT', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(d);
    } catch {
      return d.toLocaleDateString();
    }
  };

  const handleOpenPicker = () => {
    setTempDate(date);
    setShowPicker(true);
  };

  const handleConfirm = () => {
    onDateChange(tempDate);
    setShowPicker(false);
  };

  const handleCancel = () => {
    setTempDate(date);
    setShowPicker(false);
  };

  const handleSelectDay = (d: Date) => {
    setTempDate(d);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TouchableOpacity
        style={styles.dateButton}
        onPress={handleOpenPicker}
        activeOpacity={0.7}
      >
        <View style={styles.dateButtonContent}>
          <View style={styles.iconContainer}>
            <Calendar size={20} color={COLORS.primary} />
          </View>
          <Text style={styles.dateText}>{formatShortDate(date)}</Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={handleCancel}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCancel}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Data</Text>
              <Text style={styles.modalSubtitle}>{formatDate(tempDate)}</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <CustomCalendar
                selectedDate={tempDate}
                onSelect={handleSelectDay}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleConfirm}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmButtonText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#333',
    marginBottom: 8,
  },
  dateButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border || '#E5E5E5',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${COLORS.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#333',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    maxHeight: '80%',
  },
  modalHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#333',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#333',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
});
