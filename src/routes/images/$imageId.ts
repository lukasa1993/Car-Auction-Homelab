import { createFileRoute } from "@tanstack/react-router";
import { handleImageResponse } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/images/$imageId")({
  server: {
    handlers: {
      GET: async ({ params }) => await handleImageResponse(params.imageId),
    },
  },
});
