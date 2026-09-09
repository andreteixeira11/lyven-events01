import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { Image as ImageIcon, Upload, Link2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

interface ImageStepProps {
  imageUrl: string;
  imageUri?: string;
  onImageUrlChange: (url: string) => void;
  onImageUriChange: (uri?: string) => void;
  onImageBase64Change?: (base64?: string) => void;
}

export default function ImageStep({
  imageUrl,
  imageUri,
  onImageUrlChange,
  onImageUriChange,
  onImageBase64Change,
}: ImageStepProps) {
  const [imageMode, setImageMode] = React.useState<'url' | 'upload'>(
    imageUrl ? 'url' : 'upload'
  );

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão Negada', 'Necessitamos de acesso à galeria para escolher uma imagem.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      // Necessário em nativo: o fetch() do React Native não consegue ler
      // URIs file://, por isso enviamos os bytes já em base64 para o bucket.
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      onImageUriChange(result.assets[0].uri);
      onImageBase64Change?.(result.assets[0].base64 ?? undefined);
      onImageUrlChange('');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Imagem do Evento</Text>
      <Text style={styles.subtitle}>
        Adicione uma imagem atrativa para o seu evento
      </Text>

      <View style={styles.inputLabel}>
        <ImageIcon size={20} color="#0099a8" />
        <Text style={styles.inputLabelText}>Imagem do Evento *</Text>
      </View>
      
      <View style={styles.imageModeSelector}>
        <TouchableOpacity 
          style={[styles.imageModeButton, imageMode === 'upload' && styles.imageModeButtonActive]}
          onPress={() => setImageMode('upload')}
        >
          <Upload size={16} color={imageMode === 'upload' ? '#0099a8' : '#666'} />
          <Text style={[styles.imageModeButtonText, imageMode === 'upload' && styles.imageModeButtonTextActive]}>
            Upload
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.imageModeButton, imageMode === 'url' && styles.imageModeButtonActive]}
          onPress={() => setImageMode('url')}
        >
          <Link2 size={16} color={imageMode === 'url' ? '#0099a8' : '#666'} />
          <Text style={[styles.imageModeButtonText, imageMode === 'url' && styles.imageModeButtonTextActive]}>
            URL
          </Text>
        </TouchableOpacity>
      </View>

      {imageMode === 'upload' ? (
        <>
          <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
            <Upload size={24} color="#0099a8" />
            <Text style={styles.uploadButtonText}>
              {imageUri ? 'Alterar Imagem' : 'Escolher Imagem'}
            </Text>
          </TouchableOpacity>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.imagePreview} />
          )}
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={imageUrl}
            onChangeText={(text) => {
              onImageUrlChange(text?.trim() || '');
              onImageUriChange(undefined);
              onImageBase64Change?.(undefined);
            }}
            placeholder="https://exemplo.com/imagem.jpg"
            placeholderTextColor="#999"
          />
          {imageUrl && (
            <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
          )}
        </>
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
    marginBottom: 32,
    lineHeight: 22,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  inputLabelText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#333',
  },
  imageModeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  imageModeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 9999,
    backgroundColor: '#fff',
  },
  imageModeButtonActive: {
    backgroundColor: '#e0f5f7',
    borderColor: '#0099a8',
  },
  imageModeButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#666',
  },
  imageModeButtonTextActive: {
    color: '#0099a8',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 32,
    backgroundColor: '#e0f5f7',
    borderWidth: 2,
    borderColor: '#0099a8',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#0099a8',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginTop: 16,
  },
});
