import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

/** Renders a one-page landscape A4 certificate with a verification QR code. */
export async function renderCertificatePdf(c: { recipient: string; title: string; tutor: string | null; issuedAt: string; code: string; verifyUrl: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificate ${c.code}`);
  doc.setAuthor('101 Codecrafts');
  const page = doc.addPage([842, 595]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.043, 0.059, 0.078);
  const accent = rgb(0.133, 0.827, 0.651);
  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.97, 0.98, 0.98) });
  page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: accent, borderWidth: 3 });
  const center = (text: string, y: number, size: number, font = reg, color = ink) =>
    page.drawText(text, { x: (842 - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  center('101 CODECRAFTS', 500, 16, bold, accent);
  center('Certificate of Completion', 440, 34, bold);
  center('This certifies that', 395, 14);
  center(c.recipient.slice(0, 60), 350, 30, bold);
  center('has successfully completed', 315, 14);
  center(c.title.slice(0, 80), 280, 20, bold);
  if (c.tutor) center(`Tutor: ${c.tutor.slice(0, 60)}`, 248, 12);
  page.drawText(`Issued ${c.issuedAt.slice(0, 10)}  ·  Kampala, Uganda`, { x: 60, y: 70, size: 11, font: reg, color: ink });
  page.drawText(`Verify: ${c.verifyUrl}`, { x: 60, y: 52, size: 10, font: reg, color: ink });
  page.drawText(`Code ${c.code}`, { x: 60, y: 90, size: 12, font: bold, color: ink });
  const png = await QRCode.toBuffer(c.verifyUrl, { margin: 1, width: 240 });
  const img = await doc.embedPng(png);
  page.drawImage(img, { x: 842 - 60 - 110, y: 50, width: 110, height: 110 });
  return doc.save();
}
