// src/upload/uploader.ts

import { LightCloudApi } from '../api/endpoints';

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export class SourceUploader {
  constructor(private api: LightCloudApi) {}

  async upload(
    organisationId: string,
    buffer: Buffer,
    fileName: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ uploadId: string } | { error: string }> {
    // Step 1: Request signed URL
    const urlResult = await this.api.requestUploadUrl({
      targetOrganisationId: organisationId,
      fileName,
      contentType: 'application/zip',
      fileSize: buffer.length,
    });

    if (!urlResult.success || !urlResult.data) {
      return { error: urlResult.error?.message || 'Failed to get upload URL' };
    }

    const { uploadId, signedUrl } = urlResult.data;

    // Step 2: Upload to signed URL
    try {
      const response = await this.uploadToSignedUrl(signedUrl, buffer, onProgress);

      if (!response.ok) {
        return { error: `Upload failed: ${response.status}` };
      }

      // Step 3: Confirm upload
      const completeResult = await this.api.completeUpload(organisationId, uploadId);

      if (!completeResult.success) {
        return { error: completeResult.error?.message || 'Failed to confirm upload' };
      }

      return { uploadId };

    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Upload failed' };
    }
  }

  private async uploadToSignedUrl(
    url: string,
    buffer: Buffer,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Response> {
    // Simple upload without detailed progress
    // In a real implementation, you might use XMLHttpRequest for progress events

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': buffer.length.toString(),
      },
      body: buffer,
    });

    // Report 100% on completion
    onProgress?.({
      loaded: buffer.length,
      total: buffer.length,
      percentage: 100,
    });

    return response;
  }
}
