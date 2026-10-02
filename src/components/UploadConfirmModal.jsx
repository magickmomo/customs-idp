import { useRef, useState } from "react";
import { FileText, Plus, X } from "lucide-react";

function UploadConfirmModal({ files, setFiles, customer, setCustomer, customers, getStrategy, onAddFiles, onCancel, onConfirm }) {
  const inputRef=useRef(null);
  const [dragging,setDragging]=useState(false);
  const strategy=getStrategy(customer);
  const addFiles=event=>{
    onAddFiles(event.target.files);
    event.target.value="";
  };
  const removeFile=file=>setFiles(previous=>previous.filter(item=>item!==file));

  return <div className="upload-confirm-overlay" onClick={onCancel}>
    <div className="upload-confirm-modal" onClick={event=>event.stopPropagation()}>
      <div className="upload-confirm-head">
        <div><div className="eyebrow">New document pack</div><h2>Confirm documents</h2><p>Review the files and customer before starting extraction.</p></div>
        <button className="row-btn" type="button" aria-label="Close" onClick={onCancel}><X size={17}/></button>
      </div>
      <div className={"upload-drop-zone "+(dragging?"dragging":"")} onDragOver={event=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);onAddFiles(event.dataTransfer.files)}}>
        <FileText size={24}/><b>Drop documents here</b><span>PDF, Excel, Word, image, CSV or email files</span>
        <button type="button" className="secondary" onClick={()=>inputRef.current?.click()}><Plus size={15}/> Add documents</button>
        <input ref={inputRef} hidden type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.png,.jpg,.jpeg,.eml,.msg" onChange={addFiles}/>
      </div>
      <div className="upload-file-list">{files.map(file=><div className="upload-file-row" key={file.name+file.size+file.lastModified}><FileText size={17}/><div><b>{file.name}</b><span>{file.size ? Math.ceil(file.size/1024)+" KB" : "Ready for upload"}</span></div><button type="button" className="row-btn" aria-label={"Remove "+file.name} onClick={()=>removeFile(file)}><X size={16}/></button></div>)}</div>
      <div className="upload-strategy-box"><label><b>Customer</b><select value={customer} onChange={event=>setCustomer(event.target.value)}><option>Unassigned customer</option>{customers.filter(name=>name!=="Unassigned customer").map(name=><option key={name}>{name}</option>)}</select></label>{customer!=="Unassigned customer"&&strategy&&Object.keys(strategy).length ? <div className="strategy-detected"><b>Customer strategy detected</b><span>Configured extraction and validation rules will be applied.</span></div> : <div className="strategy-empty"><b>No customer strategy selected</b><span>You can assign the customer later.</span></div>}</div>
      <div className="upload-confirm-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={!files.length} onClick={onConfirm}>Confirm and extract</button></div>
    </div>
  </div>;
}

export { UploadConfirmModal };
