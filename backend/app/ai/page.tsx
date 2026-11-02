import type { Metadata } from "next";
import { AiHub } from "../../components/ai/hub/AiHub";

export const metadata: Metadata = {
  title: "101 AI · Free AI for members · 101 Codecrafts",
  description: "Free AI chat, code helper and lesson explainer for 101 Codecrafts members.",
  robots: { index: false },
};

export default function AiHubPage() {
  return <AiHub />;
}
