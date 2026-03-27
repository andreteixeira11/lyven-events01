import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';

type BucketName = 'events' | 'ads';

function genFileName(prefix: string, ext: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
}

function getExtensionFromUri(uri: string): string {
  const match = uri.match(/\.(\w+)(\?.*)?$/);
  if (match) return match[1].toLowerCase();
  return 'jpg';
}

function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return mimeMap[ext] || 'image/jpeg';
}

export async function uploadImageToBucket(
  bucket: BucketName,
  imageUri: string,
  prefix: string = 'img'
): Promise<string> {
  try {
    console.log(`[uploadImageToBucket] Uploading to bucket: ${bucket}, uri: ${imageUri.substring(0, 60)}...`);

    const ext = getExtensionFromUri(imageUri);
    const fileName = genFileName(prefix, ext);
    const mimeType = getMimeType(ext);
    const filePath = `${fileName}`;

    let fileData: Blob | ArrayBuffer;

    if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      fileData = await response.blob();
    } else {
      const response = await fetch(imageUri);
      const arrayBuffer = await response.arrayBuffer();
      fileData = new Blob([arrayBuffer], { type: mimeType });
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileData, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error(`[uploadImageToBucket] Upload error:`, error.message);
      throw new Error(`Falha ao fazer upload da imagem: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    console.log(`[uploadImageToBucket] Upload success: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (err: any) {
    console.error(`[uploadImageToBucket] Error:`, err?.message || err);
    throw err;
  }
}

export async function deleteImageFromBucket(
  bucket: BucketName,
  publicUrl: string
): Promise<boolean> {
  try {
    const urlParts = publicUrl.split(`/storage/v1/object/public/${bucket}/`);
    if (urlParts.length < 2) return false;

    const filePath = urlParts[1];
    const { error } = await supabase.storage.from(bucket).remove([filePath]);

    if (error) {
      console.error(`[deleteImageFromBucket] Error:`, error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
