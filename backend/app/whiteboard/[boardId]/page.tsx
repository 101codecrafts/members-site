import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { WhiteboardClient } from "../../../components/canvas/WhiteboardClient";

export const metadata: Metadata = { title: "Team board · 101 Codecrafts", robots: { index: false } };

/** A saved board. Access (owner/editor/viewer) is enforced by Supabase RLS + Realtime policies. */
export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  if (!z.string().uuid().safeParse(boardId).success) notFound();
  return <WhiteboardClient boardId={boardId} />;
}
