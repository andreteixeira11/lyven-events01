import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import DatePicker from '@/components/DatePicker';
import TimePicker from '@/components/TimePicker';
import { Calendar, Clock } from 'lucide-react-native';

export type EventDurationType = 'single' | 'multi';

interface DateTimeStepProps {
  date: Date;
  endDate?: Date;
  time?: Date;
  durationType?: EventDurationType;
  onDateChange: (date: Date) => void;
  onEndDateChange?: (date: Date | undefined) => void;
  onTimeChange: (time: Date) => void;
  onDurationTypeChange?: (type: EventDurationType) => void;
}

export default function DateTimeStep({
  date,
  endDate,
  time,
  durationType = 'single',
  onDateChange,
  onEndDateChange,
  onTimeChange,
  onDurationTypeChange,
}: DateTimeStepProps) {

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Data e Hora</Text>
      <Text style={styles.subtitle}>
        Quando será o seu evento?
      </Text>

      <View style={styles.durationTypeContainer}>
        <TouchableOpacity
          style={[styles.durationTypeButton, durationType === 'single' && styles.durationTypeButtonActive]}
          onPress={() => {
            onDurationTypeChange?.('single');
            onEndDateChange?.(undefined);
          }}
        >
          <Calendar size={18} color={durationType === 'single' ? '#fff' : '#0099a8'} />
          <Text style={[styles.durationTypeText, durationType === 'single' && styles.durationTypeTextActive]}>
            Um dia
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.durationTypeButton, durationType === 'multi' && styles.durationTypeButtonActive]}
          onPress={() => {
            onDurationTypeChange?.('multi');
            if (!endDate) {
              const nextDay = new Date(date);
              nextDay.setDate(nextDay.getDate() + 1);
              onEndDateChange?.(nextDay);
            }
          }}
        >
          <Clock size={18} color={durationType === 'multi' ? '#fff' : '#0099a8'} />
          <Text style={[styles.durationTypeText, durationType === 'multi' && styles.durationTypeTextActive]}>
            Vários dias
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <DatePicker
          label={durationType === 'multi' ? 'Data de Início *' : 'Data do Evento *'}
          date={date}
          onDateChange={(newDate) => {
            onDateChange(newDate);
            if (durationType === 'multi' && endDate && newDate >= endDate) {
              const nextDay = new Date(newDate);
              nextDay.setDate(nextDay.getDate() + 1);
              onEndDateChange?.(nextDay);
            }
          }}
          minimumDate={new Date()}
        />
      </View>

      {durationType === 'multi' && (
        <View style={styles.inputContainer}>
          <DatePicker
            label="Data de Fim *"
            date={endDate || new Date(date.getTime() + 86400000)}
            onDateChange={(newDate) => onEndDateChange?.(newDate)}
            minimumDate={new Date(date.getTime() + 86400000)}
          />
          {endDate && (
            <View style={styles.durationInfo}>
              <Text style={styles.durationInfoText}>
                {Math.ceil((endDate.getTime() - date.getTime()) / 86400000)} dia(s) de evento
              </Text>
            </View>
          )}
        </View>
      )}

      {time && (
        <View style={styles.inputContainer}>
          <TimePicker
            label="Hora do Evento"
            time={time}
            onTimeChange={onTimeChange}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
  },
  durationTypeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  durationTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0099a8',
    backgroundColor: '#fff',
  },
  durationTypeButtonActive: {
    backgroundColor: '#0099a8',
    borderColor: '#0099a8',
  },
  durationTypeText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#0099a8',
  },
  durationTypeTextActive: {
    color: '#fff',
  },
  inputContainer: {
    marginBottom: 24,
  },
  durationInfo: {
    marginTop: 8,
    backgroundColor: '#e0f5f7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  durationInfoText: {
    fontSize: 14,
    color: '#0099a8',
    fontWeight: '500' as const,
  },
});
