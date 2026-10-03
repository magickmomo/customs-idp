import { useRef, useState } from "react";
import { FileText, Plus, X } from "lucide-react";

function UploadConfirmModal({ files, setFiles, customer, setCustomer, customers, onAddFiles, onCancel, onConfirm }) {
  const inputRef=useRef(null);
  const [dragging,setDragging]=useState(false);

  const addFiles=event=>{
    onAddFiles(event.target.files);
    event.target.value="";
  };
  const removeFile=file=>setFiles(previous=>previous.filter(item=>item!==file));



  return <div className="upload-confirm-overlay" onClick={onCancel}>
    <div className="upload-confirm-modal" onClick={event=>event.stopPropagation()}>
      <div className="upload-confirm-head">
        <div><div className="eyebrow">New document pack</div><h2>Confirm documents</h2><p>Review the files before starting extraction.</p></div>
        <button className="row-btn" type="button" aria-label="Close" onClick={onCancel}><X size={17}/></button>
      </div>
      <div className={"upload-drop-zone "+(dragging?"dragging":"")} onDragOver={event=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);onAddFiles(event.dataTransfer.files)}}>
        <FileText size={24}/><b>Drop documents here</b><span>PDF, Excel, Word, image, CSV or email files</span>
        <button type="button" className="secondary" onClick={()=>inputRef.current?.click()}><Plus size={15}/> Add documents</button>
        <input ref={inputRef} hidden type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.png,.jpg,.jpeg,.eml,.msg" onChange={addFiles}/>
      </div>
      <div className="upload-file-list">{files.map(file=><div className="upload-file-row" key={file.name+file.size+file.lastModified}><FileText size={17}/><div><b>{file.name}</b><span>{file.size ? Math.ceil(file.size/1024)+" KB" : "Ready for upload"}</span></div><button type="button" className="row-btn" aria-label={"Remove "+file.name} onClick={()=>removeFile(file)}><X size={16}/></button></div>)}</div>
      <div className="upload-strategy-box">
        <label>
          <b>Customer</b>
          <select value={customer} onChange={event=>setCustomer(event.target.value)}>
            <option value="Auto-detect customer">Auto-detect customer</option>
            {customers
              .filter(item=>String(item.status||"active").toLowerCase()==="active")
              .map(item=><option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
        </label>
        <div className="strategy-empty">
          <b>{customer==="Auto-detect customer" ? "Customer will be identified automatically" : "Customer selected"}</b>
          <span>
            {customer==="Auto-detect customer"
              ? "The system will check the extracted exporter and importer against your active customers."
              : "This customer will be used for the document pack and its configured strategy will be applied."}
          </span>
        </div>
      </div>
      <div className="upload-confirm-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={!files.length} onClick={onConfirm}>Confirm and extract</button></div>
    </div>
  </div>;
}

export { UploadConfirmModal };
