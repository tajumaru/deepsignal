function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (params.formId) {
      return indexedResponse(params, readIndexPayload(params.formId, params.projectId || ""));
    }
    return indexedResponse(params, { ok: true, service: "deepsignal-drive-relay" });
  } catch (error) {
    return indexedResponse((e && e.parameter) || {}, {
      ok: false,
      error: String(error && error.message ? error.message : error),
      entries: []
    });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const entry = normalizeIndexEntry(body.indexEntry);
    if (!entry) {
      return jsonResponse({ ok: false, error: "Missing or invalid indexEntry" });
    }

    const root = getOrCreateRootFolder();
    const projectFolder = getOrCreateChildFolder(root, projectFolderName(entry.projectId));
    const fileName = "form_" + sanitizeFilePart(entry.formId) + "_index.json";
    const existing = projectFolder.getFilesByName(fileName);

    let file;
    let index = {
      version: 1,
      projectId: entry.projectId,
      formId: entry.formId,
      entries: []
    };

    if (existing.hasNext()) {
      file = existing.next();
      const text = file.getBlob().getDataAsString();
      if (text) {
        index = JSON.parse(text);
      }
    }

    const minimalEntry = {
      submissionId: entry.submissionId,
      projectId: entry.projectId,
      formId: entry.formId,
      signalId: entry.signalId,
      answerBlobId: entry.answerBlobId,
      createdAt: entry.createdAt,
      status: entry.status
    };

    index.version = 1;
    index.projectId = entry.projectId;
    index.formId = entry.formId;
    index.updatedAt = new Date().toISOString();
    index.entries = [
      minimalEntry
    ].concat((index.entries || []).filter(function (item) {
      return item.submissionId !== entry.submissionId;
    }));

    const content = JSON.stringify(index, null, 2);
    if (file) {
      file.setContent(content);
    } else {
      file = projectFolder.createFile(fileName, content, "application/json");
    }

    return jsonResponse({
      ok: true,
      id: entry.submissionId,
      blobId: entry.answerBlobId,
      answerBlobId: entry.answerBlobId,
      remoteIndexBlobId: file.getId(),
      remoteIndexTarget: "google-drive-index",
      remoteIndexUpdated: true,
      remoteIndexReadBack: true,
      ownerReadable: true,
      remoteSyncStatus: "remote_synced",
      folderId: projectFolder.getId(),
      fileUrl: file.getUrl()
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function normalizeIndexEntry(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const required = ["submissionId", "projectId", "formId", "signalId", "answerBlobId", "createdAt", "status"];
  for (let index = 0; index < required.length; index += 1) {
    if (typeof raw[required[index]] !== "string" || !raw[required[index]]) {
      return null;
    }
  }
  return {
    submissionId: raw.submissionId,
    projectId: raw.projectId,
    formId: raw.formId,
    signalId: raw.signalId,
    answerBlobId: raw.answerBlobId,
    createdAt: raw.createdAt,
    status: raw.status
  };
}

function getOrCreateRootFolder() {
  const props = PropertiesService.getScriptProperties();
  const savedFolderId = props.getProperty("DEEPSIGNAL_ROOT_FOLDER_ID");

  if (savedFolderId) {
    try {
      return DriveApp.getFolderById(savedFolderId);
    } catch (error) {
      props.deleteProperty("DEEPSIGNAL_ROOT_FOLDER_ID");
    }
  }

  const folders = DriveApp.getFoldersByName("DeepSignal");
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("DeepSignal");
  props.setProperty("DEEPSIGNAL_ROOT_FOLDER_ID", folder.getId());
  return folder;
}

function getOrCreateChildFolder(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(name);
}

function findChildFolder(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : null;
}

function readIndexPayload(formId, projectId) {
  if (!formId || !projectId) {
    return { entries: [] };
  }
  const root = getOrCreateRootFolder();
  const projectFolder = findChildFolder(root, projectFolderName(projectId));
  if (!projectFolder) {
    return { entries: [] };
  }
  const files = projectFolder.getFilesByName("form_" + sanitizeFilePart(formId) + "_index.json");
  if (!files.hasNext()) {
    return { entries: [] };
  }
  const file = files.next();
  const text = file.getBlob().getDataAsString();
  if (!text) {
    return { entries: [] };
  }
  const payload = JSON.parse(text);
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  return {
    entries: entries.filter(function (entry) {
      return entry && entry.formId === formId && entry.projectId === projectId && entry.answerBlobId;
    })
  };
}

function projectFolderName(projectId) {
  return "project_" + sanitizeFilePart(projectId).slice(0, 24) + "_" + shortHash(projectId);
}

function shortHash(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || "no-project"));
  return bytes.map(function (byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("").slice(0, 12);
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function indexedResponse(params, value) {
  const callback = params && params.callback ? String(params.callback) : "";
  if (callback && /^[a-zA-Z_$][0-9a-zA-Z_$]*(\.[a-zA-Z_$][0-9a-zA-Z_$]*)*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(value) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonResponse(value);
}

function sanitizeFilePart(value) {
  const sanitized = String(value || "")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .slice(0, 96);
  return sanitized || "unknown";
}
