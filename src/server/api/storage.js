import { requireAuth } from "./authGuard.js";
import { createClient } from "@supabase/supabase-js";

const BUCKET="CUSTOMS-DOCUMENTS";
const SIGNED_URL_TTL_SECONDS=6*60*60;
const SIGNED_URL_REUSE_BUFFER_SECONDS=5*60;

function getClient(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured in Vercel.");
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

function cleanSegment(value){
  return String(value||"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"document";
}

async function supabaseFetch(path,options={}){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured in Vercel.");
  const response=await fetch(`${url}/rest/v1/${path}`,{
    ...options,
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      "Content-Type":"application/json",
      ...(options.headers||{})
    }
  });
  if(!response.ok) throw new Error(await response.text());
  const text=await response.text();
  return text?JSON.parse(text):[];
}

export default async function handler(req,res){
  const auth=requireAuth(req,res);
  if(!auth)return;
  try{
    const supabase=getClient();

    if(req.method==="POST"){
      const {action,packId,filename,contentType,path}=req.body||{};

      if(action==="upload-url"){
        if(!packId||!filename) return res.status(400).json({error:"packId and filename are required"});
        const safePackId=cleanSegment(packId);
        const safeName=cleanSegment(filename);
        const storagePath=`${safePackId}/${Date.now()}-${safeName}`;
        const {data,error}=await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath,{upsert:false});
        if(error) return res.status(500).json({error:error.message});
        const {data:accessData,error:accessError}=await supabase.storage.from(BUCKET).createSignedUrl(storagePath,SIGNED_URL_TTL_SECONDS);
        if(accessError) return res.status(500).json({error:accessError.message});
        return res.status(200).json({
          bucket:BUCKET,
          path:storagePath,
          signedUrl:data.signedUrl,
          accessUrl:accessData.signedUrl,
          accessUrlExpiresAt:new Date(Date.now()+SIGNED_URL_TTL_SECONDS*1000).toISOString()
        });
      }

      if(action==="signed-url"){
        if(!path) return res.status(400).json({error:"path is required"});

        const packIdValue=String(packId||"").trim();
        if(packIdValue){
          const rows=await supabaseFetch(
            `document_packs?id=eq.${encodeURIComponent(packIdValue)}&organisation_id=eq.${encodeURIComponent(auth.organisationId)}&select=id,extracted_data&limit=1`
          );
          const row=rows?.[0];
          if(!row) return res.status(404).json({error:"Pack not found or access denied"});

          const manager=row.extracted_data?._manager||{};
          const files=Array.isArray(manager.uploadedFiles)?manager.uploadedFiles:[];
          const cached=files.find(file=>file?.storagePath===path);
          const expiresAt=Date.parse(cached?.accessUrlExpiresAt||"");
          if(cached?.accessUrl && Number.isFinite(expiresAt) && expiresAt-Date.now()>SIGNED_URL_REUSE_BUFFER_SECONDS*1000){
            return res.status(200).json({
              bucket:BUCKET,
              path,
              signedUrl:cached.accessUrl,
              accessUrl:cached.accessUrl,
              accessUrlExpiresAt:cached.accessUrlExpiresAt,
              cached:true
            });
          }

          const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,SIGNED_URL_TTL_SECONDS);
          if(error) return res.status(404).json({error:error.message});
          const nextExpiry=new Date(Date.now()+SIGNED_URL_TTL_SECONDS*1000).toISOString();
          const nextFiles=files.map(file=>file?.storagePath===path
            ? {...file,accessUrl:data.signedUrl,accessUrlExpiresAt:nextExpiry}
            : file
          );
          if(nextFiles.some(file=>file?.storagePath===path)){
            const nextExtractedData={...(row.extracted_data||{}),_manager:{...manager,uploadedFiles:nextFiles}};
            await supabaseFetch(
              `document_packs?id=eq.${encodeURIComponent(packIdValue)}&organisation_id=eq.${encodeURIComponent(auth.organisationId)}`,
              {
                method:"PATCH",
                body:JSON.stringify({extracted_data:nextExtractedData,updated_at:new Date().toISOString()}),
                headers:{"Prefer":"return=minimal"}
              }
            );
          }
          return res.status(200).json({
            bucket:BUCKET,
            path,
            signedUrl:data.signedUrl,
            accessUrl:data.signedUrl,
            accessUrlExpiresAt:nextExpiry,
            cached:false
          });
        }

        const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,SIGNED_URL_TTL_SECONDS);
        if(error) return res.status(404).json({error:error.message});
        return res.status(200).json({
          bucket:BUCKET,
          path,
          signedUrl:data.signedUrl,
          accessUrl:data.signedUrl,
          accessUrlExpiresAt:new Date(Date.now()+SIGNED_URL_TTL_SECONDS*1000).toISOString()
        });
      }
      if(action==="list-pack"){
        if(!packId) return res.status(400).json({error:"packId is required"});
        const safePackId=cleanSegment(packId);
        const {data,error}=await supabase.storage.from(BUCKET).list(safePackId,{limit:100,offset:0,sortBy:{column:"name",order:"asc"}});
        if(error) return res.status(500).json({error:error.message});
        const files=(data||[]).filter(item=>item?.name).map(item=>({
          id:`${safePackId}/${item.name}`,
          name:item.name.replace(/^\d+-/,""),
          storagePath:`${safePackId}/${item.name}`,
          size:item.metadata?.size||0,
          type:item.metadata?.mimetype||item.metadata?.contentType||"application/octet-stream"
        }));
        return res.status(200).json({bucket:BUCKET,packId:safePackId,files});
      }


      return res.status(400).json({error:"Unknown storage action"});
    }

    if(req.method==="GET"){
      const requestedPath=typeof req.query?.path==="string"?req.query.path:"";
      if(!requestedPath) return res.status(400).json({error:"path is required"});
      const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(requestedPath,SIGNED_URL_TTL_SECONDS);
      if(error) return res.status(404).json({error:error.message});
      return res.status(200).json({
        bucket:BUCKET,
        path:requestedPath,
        signedUrl:data.signedUrl,
        accessUrl:data.signedUrl,
        accessUrlExpiresAt:new Date(Date.now()+SIGNED_URL_TTL_SECONDS*1000).toISOString()
      });
    }

    return res.status(405).json({error:"Method not allowed"});
  }catch(error){
    return res.status(500).json({error:error.message||"Storage operation failed"});
  }
}
