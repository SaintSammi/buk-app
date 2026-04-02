import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type NativePrepareResult = {
  documentId?: string;
  pageCount?: number;
};

type NativeRenderResult = {
  uri?: string;
};

type NativeExtractorModule = {
  prepareDocument: (uri: string) => Promise<NativePrepareResult>;
  renderPageToImage: (params: {
    documentId: string;
    page: number;
    width: number;
    height: number;
    quality: number;
  }) => Promise<NativeRenderResult>;
  disposeDocument: (documentId: string) => Promise<void>;
};

const MODULE_NAME = 'BukPdfPageImageExtractor';

function getModule(): NativeExtractorModule | null {
  try {
    return requireNativeModule<NativeExtractorModule>(MODULE_NAME);
  } catch {
    return null;
  }
}

export function isPdfPageImageExtractorAvailable(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }

  return Boolean(getModule());
}

export async function preparePdfDocument(uri: string): Promise<{ documentId: string; pageCount: number | null }> {
  const moduleRef = getModule();
  if (!moduleRef) {
    throw new Error('native_extractor_unavailable');
  }

  const result = await moduleRef.prepareDocument(uri);
  const documentId = typeof result?.documentId === 'string' ? result.documentId : '';
  if (!documentId) {
    throw new Error('native_prepare_missing_document_id');
  }

  const pageCount = typeof result?.pageCount === 'number' && Number.isFinite(result.pageCount)
    ? Math.max(0, Math.floor(result.pageCount))
    : null;

  return { documentId, pageCount };
}

export async function renderPdfPageToImage(params: {
  documentId: string;
  page: number;
  width: number;
  height: number;
  quality?: number;
}): Promise<string> {
  const moduleRef = getModule();
  if (!moduleRef) {
    throw new Error('native_extractor_unavailable');
  }

  const result = await moduleRef.renderPageToImage({
    documentId: params.documentId,
    page: params.page,
    width: Math.max(1, Math.floor(params.width)),
    height: Math.max(1, Math.floor(params.height)),
    quality: typeof params.quality === 'number' ? params.quality : 90,
  });

  const uri = typeof result?.uri === 'string' ? result.uri : '';
  if (!uri) {
    throw new Error('native_render_missing_uri');
  }

  return uri;
}

export async function disposePdfDocument(documentId: string): Promise<void> {
  const moduleRef = getModule();
  if (!moduleRef || !documentId) {
    return;
  }

  try {
    await moduleRef.disposeDocument(documentId);
  } catch {
    // Cleanup should not block user flow.
  }
}
