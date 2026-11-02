import type { Metadata } from "next";
import { AssistantWorkspace } from "../../components/ai/AssistantWorkspace";
import { loadFaqs } from "../../lib/ai/knowledge";

export const metadata: Metadata = {
  title: "101 Assistant · 101 Codecrafts",
  description: "Ask the 101 Codecrafts AI assistant about joining, learning paths, courses, events and payments.",
};

export default function AssistantPage() {
  return <AssistantWorkspace faqs={loadFaqs()} />;
}
