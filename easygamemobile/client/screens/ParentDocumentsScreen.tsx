import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  ActionBarButton,
  ActionButton,
  BottomSheet,
  GlassRow,
  GlassSurface,
  IconChip,
  InfoNote,
  SecondaryScreenLayout,
  SectionLabel,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import {
  DOCUMENT_STATE_TINT,
  resolveDocumentIcon,
  resolveDocumentStatusTier,
} from "@/lib/parent-documents";
import { formatItalianDate } from "@/lib/mobile-ui";
import { EGGlass, EGShadow } from "@/constants/theme";
import type { FamilyDocumentItem } from "@/services/api";

/**
 * Documenti (WP7) — `data.documents.required`/`.uploaded` del cruscotto
 * aggregato, la stessa fonte che usa la Web app. Stato interamente derivato
 * server-side: qui non si ricalcola nulla.
 *
 * Composizione: prototipo `isPDocuments` / design turno 6 §3 — un elenco
 * solo ("Documenti di Matteo"), una scheda per documento: icona tinta dallo
 * stato, titolo, riga di contesto, pill a quattro livelli, e la barra
 * azioni etichettata — **Carica documento** (pieno), **Visualizza**,
 * **Scarica**, **Sostituisci**, **Carica nuova** su un file scaduto. Il
 * foglio di caricamento e un foglio di sola scelta (fotocamera · galleria ·
 * file): scegliere e l'azione, nessuna barra sotto; a invio riuscito un
 * foglio "Documento inviato" con "Chiudi".
 */
export default function ParentDocumentsScreen() {
  const { selectedChildId, selectedChild } = useParentContext();
  const queryClient = useQueryClient();
  const [pickerFor, setPickerFor] = useState<FamilyDocumentItem | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [sentTitle, setSentTitle] = useState<string | null>(null);

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
      setSentTitle(item.title);
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

  const pickGalleryPhoto = async (item: FamilyDocumentItem) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPickerFor(null);
      setActionError("Serve il permesso alla galleria per scegliere una foto.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
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
  const all = [...required, ...uploaded];
  const childFirstName = selectedChild?.name.split(/\s+/)[0] || "atleta";

  const renderDocument = (item: FamilyDocumentItem) => {
    const look = resolveDocumentStatusTier(item);
    const canUpload = item.action === "upload" || item.action === "replace";
    const hasFile = Boolean(item.fileUrl);
    const busy = uploadingId === item.id || downloadingId === item.id;
    const expired = item.state === "expired" || item.state === "overdue";
    const uploadLabel =
      item.action === "replace"
        ? expired
          ? "Carica nuova"
          : "Sostituisci"
        : "Carica documento";
    const meta = [
      item.state === "under_review" && item.submittedAt
        ? `Caricato il ${formatItalianDate(item.submittedAt)} · verifica del club`
        : item.state === "approved" && item.submittedAt
          ? `Caricato il ${formatItalianDate(item.submittedAt)}`
          : expired && item.validUntil
            ? `Scaduto il ${formatItalianDate(item.validUntil)} · da rinnovare`
            : item.dueDate
              ? `Entro il ${formatItalianDate(item.dueDate)}`
              : item.description || item.documentKindLabel,
      item.rejectionReason ? `Motivo: ${item.rejectionReason}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <GlassRow
        key={item.id}
        icon={resolveDocumentIcon(item.documentKind)}
        iconColor={DOCUMENT_STATE_TINT[item.state]}
        title={item.title}
        meta={meta}
        corner="card"
        borderColor={expired ? "rgba(239,68,68,0.35)" : undefined}
        trailing={
          <StatusPill
            label={item.stateLabel}
            tier={look.tier}
            tone={look.tone}
            small
          />
        }
        actions={
          canUpload || hasFile ? (
            <>
              {canUpload ? (
                <ActionBarButton
                  label={uploadLabel}
                  icon={
                    item.action === "replace" && !expired
                      ? "swap-horizontal-outline"
                      : "attach-outline"
                  }
                  variant="primary"
                  loading={uploadingId === item.id}
                  disabled={busy}
                  onPress={() => setPickerFor(item)}
                />
              ) : null}
              {hasFile ? (
                <ActionBarButton
                  label={canUpload ? "Visualizza" : "Scarica"}
                  icon={canUpload ? "eye-outline" : "download-outline"}
                  loading={downloadingId === item.id}
                  disabled={busy}
                  onPress={() => void handleDownload(item)}
                />
              ) : null}
            </>
          ) : undefined
        }
      />
    );
  };

  return (
    <SecondaryScreenLayout
      title="Documenti"
      eyebrow={`Segreteria · ${selectedChild?.name || "Atleta"}`}
      contentGap={8}
      club={
        selectedChild
          ? {
              name: selectedChild.clubName,
              avatarUrl: selectedChild.clubLogoUrl,
            }
          : undefined
      }
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
          <SectionLabel
            label={`Documenti di ${childFirstName}`}
            trailing={String(all.length)}
          />
          {actionError ? (
            <InfoNote tone="danger">{actionError}</InfoNote>
          ) : null}
          {all.map(renderDocument)}
          <InfoNote style={{ marginTop: 4 }}>
            Formati accettati: PDF, JPG, PNG · massimo 10 MB per file.
          </InfoNote>
        </>
      )}

      <BottomSheet
        visible={Boolean(pickerFor)}
        onClose={() => setPickerFor(null)}
        eyebrow={pickerFor?.title || pickerFor?.documentKindLabel}
        title="Allega un documento"
        hint="Tocca fuori o trascina verso il basso per chiudere"
      >
        <UploadOption
          icon="camera-outline"
          label="Scatta una foto"
          meta="Fotocamera"
          onPress={() => pickerFor && void pickCameraPhoto(pickerFor)}
        />
        <UploadOption
          icon="images-outline"
          label="Scegli dalla galleria"
          meta="Immagini"
          onPress={() => pickerFor && void pickGalleryPhoto(pickerFor)}
        />
        <UploadOption
          icon="folder-outline"
          label="Scegli un file"
          meta="PDF fino a 10 MB"
          onPress={() => pickerFor && void pickDocumentFile(pickerFor)}
        />
        <InfoNote>
          PDF, JPG o PNG · massimo 10 MB. Il club verifica il documento entro 48
          ore.
        </InfoNote>
      </BottomSheet>

      <BottomSheet
        visible={Boolean(sentTitle)}
        onClose={() => setSentTitle(null)}
        eyebrow={sentTitle || ""}
        title="Documento inviato"
        scrollable={false}
        actions={
          <ActionButton
            fullWidth
            trailingIcon="arrow-forward"
            onPress={() => setSentTitle(null)}
            style={{ flex: 1 }}
          >
            Chiudi
          </ActionButton>
        }
      >
        <View style={styles.done}>
          <IconChip name="checkmark-circle" color="#15803D" size={52} />
          <SignatureText style={styles.doneTitle}>
            Documento inviato
          </SignatureText>
          <SignatureText style={styles.doneBody}>
            {
              'Il club verifica il documento entro 48 ore. Lo stato passa a "In verifica".'
            }
          </SignatureText>
        </View>
      </BottomSheet>
    </SecondaryScreenLayout>
  );
}

function UploadOption({
  icon,
  label,
  meta,
  onPress,
}: {
  icon: "camera-outline" | "images-outline" | "folder-outline";
  label: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <GlassSurface
        tone="light"
        corner="control"
        style={[styles.option, EGShadow.row]}
      >
        <View style={styles.optionInner}>
          <IconChip name={icon} color="#2563EB" size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <SignatureText style={styles.optionTitle}>{label}</SignatureText>
            <SignatureText style={styles.optionMeta}>{meta}</SignatureText>
          </View>
        </View>
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: 64,
    borderColor: EGGlass.border,
  },
  optionInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  optionTitle: {
    color: "#0B1A3A",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  optionMeta: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  done: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  doneTitle: {
    color: "#0B1A3A",
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    textAlign: "center",
  },
  doneBody: {
    color: "rgba(11,26,58,0.62)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    textAlign: "center",
    maxWidth: 280,
  },
});
