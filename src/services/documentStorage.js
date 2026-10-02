const DOC_DB_NAME="customs-idp-documents";
const DOC_STORE="files";
function openDocDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DOC_DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(DOC_STORE))req.result.createObjectStore(DOC_STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function saveUploadedDocument(id,file){const db=await openDocDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DOC_STORE,"readwrite");tx.objectStore(DOC_STORE).put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function deleteUploadedDocument(id){if(!id)return;try{const db=await openDocDb();await new Promise((resolve,reject)=>{const tx=db.transaction(DOC_STORE,"readwrite");tx.objectStore(DOC_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch{}}
async function getUploadedDocument(id){const db=await openDocDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DOC_STORE,"readonly");const req=tx.objectStore(DOC_STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
export { openDocDb, saveUploadedDocument, deleteUploadedDocument, getUploadedDocument };

