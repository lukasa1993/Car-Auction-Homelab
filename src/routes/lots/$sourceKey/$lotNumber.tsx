import { createFileRoute, notFound } from "@tanstack/react-router";
import { getLotDetailPageData, type LotDetailPageData } from "@/lib/auction-pages";
import { LotDetailPage } from "@/ui/pages/lot-detail-page";

export const Route = createFileRoute("/lots/$sourceKey/$lotNumber")({
  loader: async ({ params }) => {
    if (params.sourceKey !== "copart" && params.sourceKey !== "iaai") {
      throw notFound();
    }
    const data = (await getLotDetailPageData({
      data: {
        sourceKey: params.sourceKey,
        lotNumber: params.lotNumber,
      },
    })) as LotDetailPageData;
    if (!data.detail) {
      throw notFound();
    }
    return data;
  },
  component: LotDetail,
});

function LotDetail() {
  const data = Route.useLoaderData();
  return <LotDetailPage auth={data.auth} detail={data.detail!} />;
}
