import { useState } from "react";
import { DEFAULT_ORGANISATION } from "../tenant.js";
import { buildWorkingCustomsRecord } from "../domain/workingRecord.js";
import { buildValidatedPack } from "../domain/packValidation.js";
import { deleteUploadedDocument, saveUploadedDocument } from "../services/documentStorage.js";

const DEFAULT_CUSTOMER_STRATEGY={instructions:"",requiredFields:[],weightHandling:"ask_user"};

const loadCustomers = async () => {
  const response = await fetch("/api/organisation?action=customers", {
    credentials: "include"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Unable to load customers.");
  }

  return Array.isArray(data.customers) ? data.customers : [];
};

const buildCustomerContext = (customers, customerId) => {
  if (!customerId || customerId === "Auto-detect customer") {
    return {
      customerId: null,
      customerName: null,
      strategy: DEFAULT_CUSTOMER_STRATEGY,
      matched: false
    };
  }

  const customer = customers.find(item =>
    String(item.id) === String(customerId) &&
    String(item.status || "active").toLowerCase() === "active"
  );

  if (!customer) {
    return {
      customerId: null,
      customerName: null,
      strategy: DEFAULT_CUSTOMER_STRATEGY,
      matched: false
    };
  }

  return {
    customerId: customer.id,
    customerName: customer.name,
    strategy: {
      ...DEFAULT_CUSTOMER_STRATEGY,
      ...(customer.strategy || {})
    },
    matched: true,
    matchedBy: "manual"
  };
};

export function usePackActions({
  currentUserName,
  livePacks,
  setLivePacks,
  selectedPack,
  persistPack,
  navigate,
  notify,
  recordHistory
}) {
  const [pendingUploadFiles, setPendingUploadFiles] = useState([]);
  const [uploadCustomer,setUploadCustomer] = useState("Auto-detect customer");
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);

  const persistValidatedPack = async (pack, showToast = false) => {
    if (!pack) return pack;
    const validated = buildValidatedPack(pack);
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
          setLivePacks(previous => previous.map(item => item.id === pack.id ? pack : item));
          await persistPack(pack);
        }
      } catch {}
    }
    if (!files.length) {
      notify("No uploaded documents are available to reprocess");
      return;
    }
    const processing={...pack,uploadedFiles:files,status:"Processing",processingError:undefined};
    setLivePacks(previous => previous.map(item => item.id === pack.id ? processing : item));
    navigate("inbox");
    notify("Re-processing all documents — AI extraction started");
    try {
      const response=await fetch("/api/packs/process",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({packId:pack.id,reason:"reprocess"})});
      const data=await response.json().catch(()=>({}));
      if(data.pack)setLivePacks(previous=>previous.map(item=>item.id===data.pack.id?data.pack:item));
      if(!response.ok)throw new Error(data.error||"Pack re-processing failed");
      const completedPack=data.pack;
      setLivePacks(previous => previous.map(item => item.id === completedPack.id ? completedPack : item));
      notify("Re-processing complete — " + (completedPack.extractedData?.documents?.filter(document=>document.extraction).length||0) + " documents extracted and validation completed");
    } catch (error) {
      const message = error?.message || "Unknown re-processing error";
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

        const uploadResponse = await fetch(data.signedUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
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

    const manuallySelectedCustomer =
      uploadCustomer && uploadCustomer !== "Auto-detect customer"
        ? uploadCustomer
        : null;

    let uploadCustomerContext = {
      customerId: null,
      customerName: null,
      strategy: DEFAULT_CUSTOMER_STRATEGY,
      matched: false
    };

    if (manuallySelectedCustomer) {
      const customers = await loadCustomers();
      const selected = customers.find(customer =>
        String(customer.name || "") === String(manuallySelectedCustomer) &&
        String(customer.status || "active").toLowerCase() === "active"
      );

      if (!selected) {
        notify("Selected customer could not be found");
        return;
      }

      uploadCustomerContext = buildCustomerContext(customers, selected.id);
    }

    const strategyApplied = uploadCustomerContext.matched;

    const newPack = {
      organisationId: DEFAULT_ORGANISATION.id,
      organisationName: DEFAULT_ORGANISATION.name,
      id,
      packUuid: crypto.randomUUID(),
      customer: uploadCustomerContext.customerName,
      customerId: uploadCustomerContext.customerId,
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

    try {
      const filesWithAccess = await Promise.all(uploadedFiles.map(async file => {
        const accessResponse = await fetch("/api/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "signed-url", path: file.storagePath, packId: id })
        });
        const accessData = await accessResponse.json().catch(() => ({}));
        if (!accessResponse.ok) {
          throw new Error(accessData.error || "Could not create document access URL");
        }
        return {
          ...file,
          accessUrl: accessData.accessUrl || accessData.signedUrl,
          accessUrlExpiresAt: accessData.accessUrlExpiresAt
        };
      }));

      uploadedFiles = filesWithAccess;
      const withAccessUrls = { ...newPack, uploadedFiles };
      setLivePacks(previous => previous.map(pack => pack.id === id ? withAccessUrls : pack));
      await persistPack(withAccessUrls);
    } catch (error) {
      notify("Document access setup failed: " + (error?.message || "Unknown storage error"));
      return;
    }

    newPack.uploadedFiles = uploadedFiles;

    await recordHistory(
      newPack,
      "uploaded",
      `Uploaded ${selected.length} document${selected.length === 1 ? "" : "s"} and confirmed the document pack.`,
      null,
      {
        documents: selected.map(file => file.name),
        customer: uploadCustomerContext.customerName,
        customerId: uploadCustomerContext.customerId,
        strategyApplied
      }
    );

    setPendingUploadFiles([]);
    setShowUploadConfirm(false);
    setUploadCustomer("Auto-detect customer");
    navigate("inbox");
    notify("Document pack confirmed — AI extraction started");

    try {
      const response=await fetch("/api/packs/process",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({packId:id,reason:"initial"})});
      const data=await response.json().catch(()=>({}));
      if(data.pack)setLivePacks(previous=>previous.map(pack=>pack.id===id?data.pack:pack));
      if(!response.ok)throw new Error(data.error||"Pack processing failed");
      const completed=data.pack;
      setLivePacks(previous => previous.map(pack => pack.id === id ? completed : pack));
      notify(
        (completed.extractedData?.documents?.filter(document=>document.extraction).length||0) +
        " document" +
        ((completed.extractedData?.documents?.filter(document=>document.extraction).length||0) === 1 ? "" : "s") +
        " extracted and validation completed"
      );
    } catch (error) {
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

    setLivePacks(previous => previous.map(pack => pack.id === posted.id ? posted : pack));
    void persistPack(posted);
    void recordHistory(posted, "posted_to_lca", "Pack posted to LCA", null, { postedToLCAAt: now });
    notify("Pack posted to LCA");
    navigate("inbox");
  };

  return {
    pendingUploadFiles,
    uploadCustomer,
    setUploadCustomer,
    setPendingUploadFiles,
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
