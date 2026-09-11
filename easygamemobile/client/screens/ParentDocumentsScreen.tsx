import React, { useState } from "react";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  ActionButton,
  BottomSheet,
  DocumentCard,
  DocumentRow,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import { Spacing } from "@/constants/theme";
import type { FamilyDocumentItem } from "@/services/api";

/**
 * Documenti (WP7) — `data.documents.required`/`.uploaded` del cruscotto
 * aggregato, la stessa fonte che usa la Web app (la `GET .../documents`
 * dedicata e' legacy/inutilizzata, vedi KB). Stato interamente derivato
 * server-side: qui non si ricalcola nulla.
 */
export default function ParentDocumentsScreen() {
  const { selectedChildId } = useParentContext();
  const queryClient = useQueryClient();
  const [pickerFor, setPickerFor] = useState<FamilyDocumentItem | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(
    dashboardQuery,
    (data) =>
      data.documents.required.length === 0 &&
      data.documents.uploaded.length === 0,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["parent-dashboard", selectedChildId],
    });

  const runUpload = async (
    item: FamilyDocumentItem,
    file: { uri: string; name: string; mimeType: string },
  ) => {
    if (!selectedChildId) return;
    setPickerFor(null);
    setUploadingId(item.id);
    setActionError("");
    try {
      await mobileBackendStorage.uploadParentDocument(selectedChildId, file, {
        requestId: item.requestId || undefined,
        documentKind: item.documentKind,
      });
      await invalidate();
    } catch (error) {
      const kind = classifyFetchError(error);
      setActionError(
        fetchErrorMessage(
          error,
          kind === "forbidden"
            ? "Accesso non consentito."
            : "Caricamento non riuscito. Riprova.",
        ),
      );
    } finally {
      setUploadingId(null);
    }
  };

  const pickDocumentFile = async (item: FamilyDocumentItem) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "image/*",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await runUpload(item, {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || "application/octet-stream",
    });
  };

  const pickCameraPhoto = async (item: FamilyDocumentItem) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPickerFor(null);
      setActionError("Serve il permesso fotocamera per scattare una foto.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      mediaTypes: ["images"],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await runUpload(item, {
      uri: asset.uri,
      name: asset.fileName || `foto-${item.documentKind}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
    });
  };

  const handleDownload = async (item: FamilyDocumentItem) => {
    if (!item.fileUrl) return;
    setDownloadingId(item.id);
    setActionError("");
    try {
      const target = await mobileBackendStorage.resolveAuthorizedFileTarget(
        item.fileUrl,
      );
      const destination = new File(
        Paths.cache,
        item.fileName || `documento-${item.id}`,
      );
      const downloaded = await File.downloadFileAsync(target.url, destination, {
        headers: target.headers,
        idempotent: true,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloaded.uri);
      }
    } catch (error) {
      setActionError(
        fetchErrorMessage(error, "Apertura del documento non riuscita."),
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const required = dashboardQuery.data?.documents.required || [];
  const uploaded = dashboardQuery.data?.documents.uploaded || [];

  return (
    <SecondaryScreenLayout
      title="Documenti"
      eyebrow="Segreteria"
      skyHeight={360}
    >
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico i documenti…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso ai documenti."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : status === "empty" ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Nessun documento"
          message="Non ci sono documenti richiesti o caricati per questo figlio."
        />
      ) : (
        <>
          {actionError ? (
            <View style={{ marginBottom: Spacing.sm }}>
              <SignatureText
                variant="small"
                style={{ color: "#B91C1C", fontWeight: "600" }}
              >
                {actionError}
              </SignatureText>
            </View>
          ) : null}

          {required.length > 0 ? (
            <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
              <SignatureText variant="eyebrow" tone="faint">
                Da caricare
              </SignatureText>
              {required.map((item) => (
                <DocumentCard
                  key={item.id}
                  item={item}
                  uploading={uploadingId === item.id}
                  onUpload={() => setPickerFor(item)}
                />
              ))}
            </View>
          ) : null}

          {uploaded.length > 0 ? (
            <View style={{ gap: Spacing.sm }}>
              <SignatureText variant="eyebrow" tone="faint">
                Archivio
              </SignatureText>
              {uploaded.map((item) => (
                <DocumentRow
                  key={item.id}
                  item={item}
                  busy={downloadingId === item.id || uploadingId === item.id}
                  onUpload={
                    item.action !== "none"
                      ? () => setPickerFor(item)
                      : undefined
                  }
                  onDownload={
                    item.fileUrl ? () => void handleDownload(item) : undefined
                  }
                />
              ))}
            </View>
          ) : null}
        </>
      )}

      <BottomSheet
        visible={Boolean(pickerFor)}
        onClose={() => setPickerFor(null)}
        accessibilityLabel="Carica documento"
      >
        <SignatureText
          variant="eyebrow"
          tone="faint"
          style={{ marginBottom: 4 }}
        >
          {pickerFor?.documentKindLabel}
        </SignatureText>
        <SignatureText
          variant="h3"
          tone="ink"
          style={{ marginBottom: Spacing.md }}
        >
          Come vuoi caricarlo?
        </SignatureText>
        <View style={{ gap: Spacing.sm }}>
          <ActionButton
            icon="document-outline"
            fullWidth
            onPress={() => pickerFor && void pickDocumentFile(pickerFor)}
          >
            Scegli un file
          </ActionButton>
          <ActionButton
            variant="secondary"
            icon="camera-outline"
            fullWidth
            onPress={() => pickerFor && void pickCameraPhoto(pickerFor)}
          >
            Scatta una foto
          </ActionButton>
        </View>
      </BottomSheet>

      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
