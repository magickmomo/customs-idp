export const DEFAULT_ORGANISATION = {
  id: "demo-organisation",
  name: "Customs IDP Demo Organisation"
};

export function getOrganisationId(value){
  return String(value||DEFAULT_ORGANISATION.id).trim() || DEFAULT_ORGANISATION.id;
}

export function getOrganisationName(value){
  return String(value||DEFAULT_ORGANISATION.name).trim() || DEFAULT_ORGANISATION.name;
}
