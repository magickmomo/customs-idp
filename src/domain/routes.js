export function packRoute(packUuid){
  return "/inbox/"+encodeURIComponent(String(packUuid));
}

export function packUuidFromPath(pathname){
  if(typeof pathname!=="string"||!pathname.startsWith("/inbox/"))return "";
  const value=pathname.slice("/inbox/".length).split("/")[0];
  try{return decodeURIComponent(value);}
  catch{return "";}
}

export function findPackByUuid(packList,packUuid){
  return (Array.isArray(packList)?packList:[]).find(pack=>String(ensurePackUuid(pack))===String(packUuid))||null;
}
import { ensurePackUuid } from "./packData.js";
