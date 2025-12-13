// Firebase Storage helper for image uploads
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app } from './firebase';

const storage = app ? getStorage(app) : null;

export interface UploadResult {
  url: string;
  path: string;
}

export async function uploadImage(file: File, userId: string): Promise<UploadResult> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized');
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('Image must be less than 10MB');
  }

  // Create unique filename
  const timestamp = Date.now();
  const extension = file.name.split('.').pop();
  const filename = `${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`;
  const path = `chat-images/${userId}/${filename}`;

  // Upload to Firebase Storage
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);

  // Get download URL
  const url = await getDownloadURL(storageRef);

  return { url, path };
}

export async function deleteImage(path: string): Promise<void> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized');
  }

  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' };
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'Image must be less than 10MB' };
  }

  return { valid: true };
}
