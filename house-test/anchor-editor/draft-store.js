// Images stay in IndexedDB as part of the editable project; never localStorage.
const DRAFT_DB_NAME = 'ojjuda-furniture-maker-drafts';
const DRAFT_DB_VERSION = 1;
const DRAFT_STORE_NAME = 'drafts';
let DRAFT_KEY = null;
export function setDraftOwner(owner){if(typeof owner!=='string'||!owner||owner.length>180)throw new Error('관리자 계정을 확인해 주세요.');DRAFT_KEY='owner:'+owner;}
function requireOwner(){if(!DRAFT_KEY)throw new Error('관리자 모드에서 제작실을 열어 주세요.');}
let draftOperations = Promise.resolve();

function draftStorageError(action, cause) {
  let message, code;
  if (cause?.name === 'QuotaExceededError') {
    message = '저장 공간이 부족해 임시 저장하지 못했어요. 작업 파일로 저장해 주세요.';
    code = 'DRAFT_QUOTA';
  } else if (['SecurityError', 'NotSupportedError', 'InvalidStateError', 'VersionError'].includes(cause?.name)) {
    message = '이 브라우저에서는 임시 저장 공간을 사용할 수 없어요. 작업 파일로 저장해 주세요.';
    code = 'DRAFT_UNAVAILABLE';
  } else {
    message = action === 'load' ? '임시 저장한 작업을 읽지 못했어요. 다시 시도해 주세요.'
      : action === 'clear' ? '임시 저장한 작업을 지우지 못했어요. 다시 시도해 주세요.'
      : '임시 저장하지 못했어요. 작업 파일로 저장해 주세요.';
    code = action === 'load' ? 'DRAFT_READ_FAILED' : action === 'clear' ? 'DRAFT_CLEAR_FAILED' : 'DRAFT_WRITE_FAILED';
  }
  return Object.assign(new Error(message, {cause}), {code});
}

function queueDraftOperation(operation) {
  const result = draftOperations.then(operation);
  // A failed write must not prevent the next save, read or clear from running.
  draftOperations = result.catch(() => {});
  return result;
}

function openDraftDatabase() {
  return new Promise((resolve, reject) => {
    let request, settled = false;
    const fail = cause => {
      if (settled) return;
      settled = true;
      reject(draftStorageError('save', cause));
    };
    try {
      const factory = globalThis.indexedDB;
      if (!factory) throw Object.assign(new Error('IndexedDB unavailable'), {name: 'NotSupportedError'});
      request = factory.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
    } catch (error) {
      fail(error);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        request.result.createObjectStore(DRAFT_STORE_NAME);
      }
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(Object.assign(new Error('IndexedDB upgrade blocked'), {name: 'InvalidStateError'}));
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

async function runDraftTransaction(mode, action, execute) {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let transaction, result, failure;
      try {
        transaction = db.transaction(DRAFT_STORE_NAME, mode);
      } catch (error) {
        reject(draftStorageError(action, error));
        return;
      }
      // Resolve only after commit. A failed replacement rolls back to the old key.
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => { failure ||= transaction.error; };
      transaction.onabort = () => reject(draftStorageError(action, failure || transaction.error));
      try {
        const request = execute(transaction.objectStore(DRAFT_STORE_NAME));
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => { failure = request.error; };
      } catch (error) {
        failure = error;
        try {
          transaction.abort();
        } catch {
          reject(draftStorageError(action, failure));
        }
      }
    });
  } finally {
    db.close();
  }
}

/** Save a call-time JSON snapshot. savedAt is an ISO date string. */
export function saveDraft(project) {
  requireOwner();
  let snapshot;
  try {
    if (!project || typeof project !== 'object' || Array.isArray(project)) throw new TypeError('Project object required');
    // Snapshot before entering the asynchronous queue, so later edits cannot
    // change this save or let a slow image decode overwrite a newer invocation.
    snapshot = JSON.parse(JSON.stringify(project));
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError('Project JSON object required');
  } catch (cause) {
    return Promise.reject(Object.assign(new Error('작업 내용을 임시 저장할 수 없어요. 저장할 작업을 확인해 주세요.', {cause}), {code: 'DRAFT_INVALID_PROJECT'}));
  }
  return queueDraftOperation(async () => {
    const savedAt = new Date().toISOString();
    await runDraftTransaction('readwrite', 'save', store => store.put({version: 1, project: snapshot, savedAt}, DRAFT_KEY));
    return {savedAt};
  });
}

/** Read after all operations already requested in this page have settled. */
export function loadDraft() {
  requireOwner();
  return queueDraftOperation(async () => {
    const record = await runDraftTransaction('readonly', 'load', store => store.get(DRAFT_KEY));
    if (record === undefined) return null;
    if (record?.version !== 1 || !record.project || typeof record.project !== 'object' || Array.isArray(record.project)
      || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))) {
      throw draftStorageError('load', new Error('Invalid draft record'));
    }
    return {project: record.project, savedAt: record.savedAt};
  });
}

/** Delete the single draft key, ordered with saves already requested. */
export function clearDraft() {
  requireOwner();
  return queueDraftOperation(async () => {
    await runDraftTransaction('readwrite', 'clear', store => store.delete(DRAFT_KEY));
  });
}
