import { useState } from "react";
import { validateStandardCustomsRecord } from "../validation/standardEngine.js";
import { DEFAULT_ORGANISATION } from "../tenant.js";
import { getCustomerStrategy } from "../domain/packData.js";
import { buildWorkingCustomsRecord } from "../domain/workingRecord.js";
import { runAutomatedEmailAudit } from "../services/agentService.js";
import { deleteUploadedDocument, getUploadedDocument, saveUploadedDocument } from "../services/documentStorage.js";

const toDataUrl = async (source, mimeType) => {
  const bytes = new Uint8Array(await source.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
};

const fetchStorageBlob = async (path, filename) => {
  const response = await fetch("/api/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "signed-url", path })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Storage access failed for " + filename + ": " + (data.error || ("HTTP " + response.status)));
  }
  if (!data.signedUrl) {
    throw new Error("Storage access failed for " + filename + ": no signed URL was returned");
  }

  const fileResponse = await fetch(data.signedUrl);
  if (!fileResponse.ok) {
    throw new Error("Document download failed for " + filename + ": HTTP " + fileResponse.status);
  }
  return fileResponse.blob();
};

const extractDocument = async (source, uploaded) => {
  const mimeType = source.type || uploaded.type || "application/octet-stream";
  const fileData = await toDataUrl(source, mimeType);
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileData,
      filename: uploaded.name,
      mimeType
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Extraction failed for " + uploaded.name + ": " + (result.error || ("HTTP " + response.status)));
  }
  if (!result.extraction) {
    throw new Error("Extraction failed for " + uploaded.name + ": no extraction result was returned");
  }

  return {
    id: uploaded.id,
    filename: uploaded.name,
    mimeType,
    extraction: result.extraction
  };
};

const buildExtractedPack = (pack, extractedDocuments) => {
  const primaryDoc =
    extractedDocuments.find(document => document.extraction?.documentType === "commercial_invoice") ||
    extractedDocuments[0];

  return {
    ...pack,
    status: "Needs review",
    extractedData: {
      ...(primaryDoc?.extraction || {}),
      documents: extractedDocuments,
      documentCount: extractedDocuments.length,
      sourceDocuments: extractedDocuments.map(document => ({
        id: document.id,
        filename: document.filename,
        mimeType: document.mimeType,
        documentType: document.extraction?.documentType || "unknown",
        confidence: document.extraction?.confidence || 0
      }))
    }
  };
};

export function usePackActions({
  currentUserName,
  livePacks,
  setLivePacks,
  selectedPack,
  setSelectedPack,
  persistPack,
  navigate,
  notify,
  recordHistory
}) {
  const [pendingUploadFiles, setPendingUploadFiles] = useState([]);
  const [uploadCustomer, setUploadCustomer] = useState("Unassigned customer");
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);

  const buildValidatedPack = pack => {
    if (!pack) return pack;
    const data = buildWorkingCustomsRecord(pack);
    const standard = validateStandardCustomsRecord(data);
    const checks = standard.checks;
    const hasFail = checks.some(check => check.status === "fail");
    const hasReview = checks.some(check => check.status === "review");

    return {
      ...pack,
      workingRecord: data,
      status: hasFail || hasReview ? "Needs review" : "Ready",
      validationStatus: hasFail || hasReview ? "Failed" : "Validated",
      validationChecks: checks,
      validationSummary: standard.summary
    };
  };

  const persistValidatedPack = async (pack, showToast = false) => {
    if (!pack) return pack;
    const validated = buildValidatedPack(pack);
    setSelectedPack(validated);
    setLivePacks(previous => previous.map(item => item.id === validated.id ? validated : item));
    await persistPack(validated);
    await recordHistory(
      validated,
      "validated",
      validated.validationStatus === "Validated"
        ? "Pack validated successfully"
        : "Pack validation completed with issues",
      null,
      {
        status: validated.status,
        validationStatus: validated.validationStatus,
        checks: validated.validationChecks
      }
    );

    if (showToast) {
      const failed = validated.validationChecks.filter(check => check.status === "fail");
      const review = validated.validationChecks.filter(check => check.status === "review");
      notify(
        failed.length
          ? "Validation failed — " + failed.map(check => check.check).slice(0, 4).join(", ")
          : review.length
            ? "Validation requires review — " + review.map(check => check.check).slice(0, 4).join(", ")
            : "Data validation complete — all standard checks passed"
      );
    }

    return validated;
  };

  const reprocessPack = async pack => {
    if (!pack) return;

    let files = Array.isArray(pack.uploadedFiles) ? [...pack.uploadedFiles] : [];

    if (!files.length) {
      try {
        const response = await fetch("/api/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list-pack", packId: pack.id })
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(data.files) && data.files.length) {
          files = data.files.map(file => ({
            id: file.id,
            name: file.name,
            size: file.size || 0,
            type: file.type || "application/octet-stream",
            storagePath: file.storagePath
          }));
          pack = { ...pack, uploadedFiles: files, docs: Math.max(Number(pack.docs) || 0, files.length) };
          setSelectedPack(pack);
          setLivePacks(previous => previous.map(item => item.id === pack.id ? pack : item));
          await persistPack(pack);
        }
      } catch {}
    } else if (files.some(file => !file.storagePath)) {
      try {
        const response = await fetch("/api/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list-pack", packId: pack.id })
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(data.files) && data.files.length) {
          files = files.map(file => {
            if (file.storagePath) return file;
            const match = data.files.find(stored =>
              stored.name === file.name || stored.name === file.name.replace(/^\\d+-/, "")
            );
            return match
              ? { ...file, storagePath: match.storagePath, size: file.size || match.size || 0, type: file.type || match.type }
              : file;
          });
          pack = { ...pack, uploadedFiles: files };
          setSelectedPack(pack);
          setLivePacks(previous => previous.map(item => item.id === pack.id ? pack : item));
          await persistPack(pack);
        }
      } catch {}
    }

    if (!files.length) {
      notify("No uploaded documents are available to reprocess");
      return;
    }

    const processing = {
      ...pack,
      uploadedFiles: files,
      status: "Processing",
      processingError: undefined,
      validationStatus: undefined,
      validationChecks: undefined,
      postedToLCAAt: undefined
    };

    setSelectedPack(null);
    setLivePacks(previous => previous.map(item => item.id === pack.id ? processing : item));
    await persistPack(processing);
    navigate("inbox");
    notify("Re-processing all documents — AI extraction started");

    try {
      const extractedDocuments = [];

      for (const uploaded of files) {
        const source = uploaded.storagePath
          ? await fetchStorageBlob(uploaded.storagePath, uploaded.name)
          : await getUploadedDocument(uploaded.id);

        if (!source) {
          throw new Error("Uploaded document is unavailable: " + uploaded.name);
        }

        extractedDocuments.push(await extractDocument(source, uploaded));
      }

      const processed = {
        ...buildExtractedPack(processing, extractedDocuments),
        extractedData: {
          ...buildExtractedPack(processing, extractedDocuments).extractedData,
          agentMessages: [],
          extractionRunId: new Date().toISOString()
        }
      };

      let completedPack = buildValidatedPack(processed);
      completedPack = await runAutomatedEmailAudit(completedPack);
      setSelectedPack(completedPack);
      setLivePacks(previous => previous.map(item => item.id === completedPack.id ? completedPack : item));

      const saved = await persistPack(completedPack);
      if (!saved) throw new Error("Database save failed after re-processing completed");

      await recordHistory(
        completedPack,
        "reprocessed",
        "Pack reprocessed and extraction completed",
        null,
        { documentCount: extractedDocuments.length }
      );
      notify("Re-processing complete — " + extractedDocuments.length + " documents extracted and validation completed");
    } catch (error) {
      const message = error?.message || "Unknown re-processing error";
      const failed = { ...processing, status: "Needs review", processingError: message };
      setSelectedPack(failed);
      setLivePacks(previous => previous.map(item => item.id === failed.id ? failed : item));
      await persistPack(failed);
      notify("Re-processing failed: " + message);
    }
  };

  const handleUpload = files => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    setPendingUploadFiles(previous => {
      const seen = new Set(previous.map(file => file.name + "|" + file.size + "|" + file.lastModified));
      return [
        ...previous,
        ...selected.filter(file => !seen.has(file.name + "|" + file.size + "|" + file.lastModified))
      ];
    });
    setShowUploadConfirm(true);
  };

  const confirmUpload = async () => {
    const selected = [...pendingUploadFiles];
    if (!selected.length) return;

    const highest = livePacks.reduce(
      (max, pack) => Math.max(max, Number(String(pack.id || "").replace("PK-", "")) || 0),
      10482
    );
    const id = `PK-${highest + 1}`;
    const started = new Date().toISOString();
    let uploadedFiles;

    try {
      uploadedFiles = await Promise.all(selected.map(async (file, index) => {
        const localId = `${id}-${index}`;
        await saveUploadedDocument(localId, file);

        const response = await fetch("/api/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upload-url",
            packId: id,
            filename: file.name,
            contentType: file.type
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not create storage upload URL");

        const uploadResponse = await fetch(data.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file
        });
        if (!uploadResponse.ok) throw new Error(`Could not upload ${file.name}`);

        return {
          id: localId,
          name: file.name,
          size: file.size,
          type: file.type,
          storagePath: data.path
        };
      }));
    } catch (error) {
      notify("Document storage upload failed: " + error.message);
      return;
    }

    const strategy = getCustomerStrategy(uploadCustomer);
    const strategyApplied = uploadCustomer !== "Unassigned customer" && Object.keys(strategy || {}).length > 0;
    const newPack = {
      organisationId: DEFAULT_ORGANISATION.id,
      organisationName: DEFAULT_ORGANISATION.name,
      id,
      customer: uploadCustomer,
      docs: selected.length,
      status: "Processing",
      confidence: 0,
      received: started,
      processingStartedAt: started,
      ticket: "UPLOAD-" + Date.now().toString().slice(-5),
      assignedTo: "Unassigned",
      uploadedFiles,
      email: null,
      title: selected[0]?.name || id,
      customerStrategyApplied: strategyApplied
    };

    setLivePacks(previous => [newPack, ...previous]);
    await persistPack(newPack);
    await recordHistory(
      newPack,
      "uploaded",
      `Uploaded ${selected.length} document${selected.length === 1 ? "" : "s"} and confirmed the document pack.`,
      null,
      {
        documents: selected.map(file => file.name),
        customer: uploadCustomer,
        strategyApplied
      }
    );

    setPendingUploadFiles([]);
    setShowUploadConfirm(false);
    setUploadCustomer("Unassigned customer");
    navigate("inbox");
    notify("Document pack confirmed — AI extraction started");

    try {
      const extractedDocuments = [];
      for (const uploaded of uploadedFiles) {
        let source = selected.find(file => file.name === uploaded.name && file.size === uploaded.size)
          || selected.find(file => file.name === uploaded.name);

        if (!source && uploaded.storagePath) {
          source = await fetchStorageBlob(uploaded.storagePath, uploaded.name);
        }
        if (!source) throw new Error("Document " + uploaded.name + " is unavailable");

        extractedDocuments.push(await extractDocument(source, uploaded));
      }

      const processed = buildExtractedPack(newPack, extractedDocuments);
      let completed = buildValidatedPack(processed);
      completed = await runAutomatedEmailAudit(completed);

      setLivePacks(previous => previous.map(pack => pack.id === id ? completed : pack));
      setSelectedPack(completed);
      await persistPack(completed);
      await recordHistory(
        completed,
        "extracted",
        "Document Extraction Agent completed extraction",
        null,
        { documentCount: extractedDocuments.length },
        null,
        "agent",
        "Document Extraction Agent"
      );

      if (strategyApplied) {
        await recordHistory(
          completed,
          "strategy_applied",
          `Applied customer strategy for ${uploadCustomer}`,
          null,
          { customer: uploadCustomer },
          null,
          "system",
          "Customs IDP System"
        );
      }

      notify(
        extractedDocuments.length +
        " document" +
        (extractedDocuments.length === 1 ? "" : "s") +
        " extracted and validation completed"
      );
    } catch (error) {
      const failed = { ...newPack, status: "Needs review", processingError: error.message };
      setLivePacks(previous => previous.map(pack => pack.id === id ? failed : pack));
      setSelectedPack(failed);
      await persistPack(failed);
      await recordHistory(
        failed,
        "processing_error",
        "Document processing failed",
        null,
        { error: error.message },
        null,
        "system",
        "Customs IDP System"
      );
      notify("Extraction failed — check the pack for details");
    }
  };

  const deletePack = async pack => {
    if (!pack?.id || !window.confirm("Delete this pack? This will permanently remove the pack and its extracted customs data.")) return;

    try {
      const response = await fetch("/api/packs?id=" + encodeURIComponent(pack.id), {
        method: "DELETE",
        credentials: "include"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete pack");

      for (const file of pack.uploadedFiles || []) {
        await deleteUploadedDocument(file.id);
      }

      setLivePacks(previous => previous.filter(item => item.id !== pack.id));
      if (selectedPack?.id === pack.id) {
        setSelectedPack(null);
        navigate("inbox");
      }
      notify("Pack deleted");
    } catch (error) {
      notify(error.message || "Unable to delete pack");
    }
  };

  const assignPack = (packId, assignedTo) => {
    const previous = livePacks.find(pack => pack.id === packId);
    if (!previous) return;

    const updated = { ...previous, assignedTo };
    setLivePacks(packs => packs.map(pack => pack.id === packId ? updated : pack));
    if (selectedPack?.id === packId) setSelectedPack(pack => ({ ...pack, assignedTo }));
    void persistPack(updated);
    void recordHistory(
      updated,
      "assigned",
      `Pack assigned to ${assignedTo}`,
      { assignedTo: previous.assignedTo || "Unassigned" },
      { assignedTo }
    );
    notify(`Pack ${packId} assigned to ${assignedTo}`);
  };

  const updatePack = pack => {
    if (!pack) return;
    const next = pack.extractedData?.documents
      ? { ...pack, workingRecord: buildWorkingCustomsRecord(pack) }
      : pack;

    setSelectedPack(next);
    setLivePacks(previous => previous.map(item => item.id === next.id ? next : item));
    void persistPack(next);
  };

  const validatePack = () => {
    if (!selectedPack) return;
    void persistValidatedPack(selectedPack, true);
  };

  const postToLCA = () => {
    if (!selectedPack) return;

    if (selectedPack.validationStatus !== "Validated" || selectedPack.status !== "Ready") {
      notify("Validate the extracted data before posting to LCA");
      return;
    }

    const now = new Date().toISOString();
    const assignedTo =
      selectedPack.assignedTo && selectedPack.assignedTo !== "Unassigned"
        ? selectedPack.assignedTo
        : currentUserName;
    const posted = {
      ...selectedPack,
      status: "Posted to LCA",
      assignedTo,
      processingCompletedAt: selectedPack.processingCompletedAt || now,
      postedToLCAAt: now
    };

    setSelectedPack(posted);
    setLivePacks(previous => previous.map(pack => pack.id === posted.id ? posted : pack));
    void persistPack(posted);
    void recordHistory(posted, "posted_to_lca", "Pack posted to LCA", null, { postedToLCAAt: now });
    notify("Pack posted to LCA");
    navigate("inbox");
  };

  return {
    pendingUploadFiles,
    setPendingUploadFiles,
    uploadCustomer,
    setUploadCustomer,
    showUploadConfirm,
    setShowUploadConfirm,
    handleUpload,
    confirmUpload,
    reprocessPack,
    deletePack,
    assignPack,
    updatePack,
    buildValidatedPack,
    persistValidatedPack,
    validatePack,
    postToLCA
  };
}
