import { error } from "@sveltejs/kit";
export const load = ({ params }) => {
  if (
    !["operations", "events", "workers", "incidents", "crm"].includes(
      params.section,
    )
  )
    error(404, { message: "Sección no encontrada" });
  return { section: params.section };
};
