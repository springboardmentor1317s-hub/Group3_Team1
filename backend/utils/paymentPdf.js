function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSimplePdf(lines) {
  const safeLines = (lines || []).map((line) => escapePdfText(line));
  const content = ['BT', '/F1 12 Tf', '50 780 Td'];

  safeLines.forEach((line, index) => {
    if (index > 0) {
      content.push('0 -20 Td');
    }
    content.push(`(${line}) Tj`);
  });

  content.push('ET');
  const stream = content.join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function buildPaymentReceiptPdf({ payment, studentName, eventName }) {
  const paymentDate = payment?.verifiedAt || payment?.updatedAt || payment?.createdAt || new Date();
  const lines = [
    'Campus Event Hub Payment Receipt',
    '',
    `Student Name: ${studentName || payment?.userName || 'Student'}`,
    `Student Email: ${payment?.userEmail || 'Not available'}`,
    `Event Name: ${eventName || payment?.eventName || 'Campus Event'}`,
    `Transaction ID: ${payment?.paymentId || 'Not available'}`,
    `Order ID: ${payment?.orderId || 'Not available'}`,
    `Amount: ${(payment?.currency || 'INR')} ${Number(payment?.amount || 0).toFixed(2)}`,
    `Status: ${String(payment?.status || 'success').toUpperCase()}`,
    `Verified: ${payment?.verified ? 'YES' : 'NO'}`,
    `Date: ${new Date(paymentDate).toLocaleString('en-US')}`
  ];

  return buildSimplePdf(lines);
}

module.exports = {
  buildPaymentReceiptPdf
};
