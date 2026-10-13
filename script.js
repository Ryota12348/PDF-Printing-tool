function getCurrentDateTime() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

document.getElementById('generateBtn').addEventListener('click', async () => {
    const { jsPDF } = window.jspdf;
    const { PDFDocument } = PDFLib;

    const title = document.getElementById('titleInput').value.trim() || '無題';
    const dateMode = document.querySelector('input[name="dateMode"]:checked').value; // 'yes' または 'no'
    const showDate = (dateMode === 'yes');
    const memoText = document.getElementById('memoInput').value;
    const orderMode = document.querySelector('input[name="orderMode"]:checked').value; // 'normal' または 'reverse'
    const pdfFileInput = document.getElementById('pdfFileInput');

    // --- ステップ 1: jsPDF で表紙の PDF バイナリを作成 ---
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // タイトル
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text(title, pageWidth / 2, pageHeight * 0.73, { align: 'center' });

    // 日付（「記入する」の場合のみ）
    if (showDate) {
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(11);
        doc.text(`作成日時: ${getCurrentDateTime()}`, pageWidth / 2, pageHeight * 0.65, { align: 'center' });
    }

    // メモ（Markdown風）
    if (memoText.trim() !== "") {
        const leftMargin = 25;
        let currentY = pageHeight * 0.56;
        const lineSpacing = 7;
        const lines = memoText.split('\n');

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                currentY -= 3;
                return;
            }
            let fontSize = 12;
            let drawText = trimmed;
            let xOffset = leftMargin;

            if (trimmed.startsWith('#')) {
                const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
                if (match) {
                    const level = match[1].length;
                    drawText = match[2];
                    fontSize = level === 1 ? 15 : (level === 2 ? 13 : 12);
                }
            } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                drawText = '• ' + trimmed.substring(2).trim();
                xOffset = leftMargin + 5;
            }
            drawText = drawText.replace(/\*\*(.*?)\*\*/g, '$1');

            doc.setFont("Helvetica", "normal");
            doc.setFontSize(fontSize);
            doc.text(drawText, xOffset, currentY);
            currentY -= lineSpacing;
        });
    }

    const coverPdfBytes = doc.output('arraybuffer');

    // --- ステップ 2: pdf-lib を使ってPDFを組み立てる ---
    try {
        const mergedPdf = await PDFDocument.create();
        
        const coverPdfDoc = await PDFDocument.load(coverPdfBytes);
        const [coverPage] = await mergedPdf.copyPages(coverPdfDoc, [0]);

        let mainPages = [];
        let originalPageCount = 0;

        if (pdfFileInput.files.length > 0) {
            const file = pdfFileInput.files[0];
            const arrayBuffer = await file.arrayBuffer();
            const sourcePdfDoc = await PDFDocument.load(arrayBuffer);
            originalPageCount = sourcePdfDoc.getPageCount();
            
            let indices = Array.from({ length: originalPageCount }, (_, i) => i);
            if (orderMode === 'reverse') {
                indices = indices.reverse();
            }

            mainPages = await mergedPdf.copyPages(sourcePdfDoc, indices);
        }

        const coverPageCount = 1;
        const contentTotal = originalPageCount + coverPageCount;
        let blankPagesCount = 0;
        
        if (orderMode === 'reverse' && originalPageCount > 0) {
            const remainder = contentTotal % 4;
            blankPagesCount = (4 - remainder) % 4;
        }

        const a4Width = 595.28;
        const a4Height = 841.89;

        if (orderMode === 'reverse') {
            for (let i = 0; i < blankPagesCount; i++) {
                mergedPdf.addPage([a4Width, a4Height]);
            }
            for (const page of mainPages) {
                mergedPdf.addPage(page);
            }
            mergedPdf.addPage(coverPage);
        } else {
            mergedPdf.addPage(coverPage);
            for (const page of mainPages) {
                mergedPdf.addPage(page);
            }
        }

        // --- ステップ 3: ダウンロード ---
        const mergedPdfBytes = await mergedPdf.save();
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        
        const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_');
        link.download = `${safeTitle}_processed.pdf`;
        link.click();

        const totalPages = mergedPdf.getPageCount();
        if (orderMode === 'reverse' && originalPageCount > 0) {
            alert(`✅ 処理完了（逆順・4の倍数調整）\n(空白: ${blankPagesCount}P + 本文: ${originalPageCount}P + 表紙: 1P = 計 ${totalPages}P)`);
        } else {
            alert(`✅ 処理完了（そのまま）\n(表紙: 1P + 本文: ${originalPageCount}P = 計 ${totalPages}P)`);
        }

    } catch (error) {
        console.error(error);
        alert("⚠️ PDFの処理中にエラーが発生しました。コンソールを確認してください。");
    }
});

