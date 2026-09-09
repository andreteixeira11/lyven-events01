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

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodifica uma string base64 para ArrayBuffer (sem dependências nativas). */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const byteLength = Math.floor(clean.length / 4) * 3;
  const bytes = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = B64_ALPHABET.indexOf(clean[i]);
    const e2 = B64_ALPHABET.indexOf(clean[i + 1]);
    const e3 = clean[i + 2] === '=' ? -1 : B64_ALPHABET.indexOf(clean[i + 2]);
    const e4 = clean[i + 3] === '=' ? -1 : B64_ALPHABET.indexOf(clean[i + 3]);
    const n = (e1 << 18) | (e2 << 12) | ((e3 < 0 ? 0 : e3) << 6) | (e4 < 0 ? 0 : e4);
    bytes[p++] = (n >> 16) & 0xff;
    if (e3 >= 0) bytes[p++] = (n >> 8) & 0xff;
    if (e4 >= 0) bytes[p++] = n & 0xff;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + p) as ArrayBuffer;
}

export async function uploadImageToBucket(
  bucket: BucketName,
  imageUri: string,
  prefix: string = 'img',
  base64?: string | null
): Promise<string> {
  try {
    console.log(`[uploadImageToBucket] Uploading to bucket: ${bucket}, uri: ${imageUri.substring(0, 60)}...`);

    const ext = getExtensionFromUri(imageUri);
    const fileName = genFileName(prefix, ext);
    const mimeType = getMimeType(ext);
    const filePath = `${fileName}`;

    let fileData: Blob | ArrayBuffer;

    if (base64) {
      // Caminho preferido: o picker devolve a imagem já em base64, que
      // decodificamos para bytes binários. O fetch() do React Native não
      // suporta URIs file:// de forma fiável, por isso este é o caminho certo.
      fileData = base64ToArrayBuffer(base64);
    } else if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      fileData = await response.blob();
    } else {
      // Fallback nativo (funciona para URIs http/https/data, não para file://)
      const response = await fetch(imageUri);
      fileData = await response.arrayBuffer();
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
