// 現在の日時を YYYY-MM-DD HH:mm:ss 形式で取得
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

// fonts/ フォルダから3種類のフォントを読み込んで登録する関数
async function loadFonts(doc) {
    const fontList = [
        { name: 'NotoSansJP-Medium', filename: 'fonts/NotoSansJP-Medium.ttf', style: 'normal' },
        { name: 'NotoSansJP-Bold', filename: 'fonts/NotoSansJP-Bold.ttf', style: 'bold' },
        { name: 'NotoSansJP-Light', filename: 'fonts/NotoSansJP-Light.ttf', style: 'light' }
    ];

    for (const font of fontList) {
        try {
            const response = await fetch(font.filename);
            if (!response.ok) {
                throw new Error(`${font.filename} が見つかりません。fonts/ フォルダを確認してください。`);
            }
            const fontBlob = await response.blob();
            
            const reader = new FileReader();
            const base64Font = await new Promise((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(fontBlob);
            });

            doc.addFileToVFS(`${font.name}.ttf`, base64Font);
            doc.addFont(`${font.name}.ttf`, font.name, font.style);
        } catch (e) {
            console.error(e);
            alert(`⚠️ フォントの読み込みエラー: ${font.filename}`);
        }
    }
}

// 共通のPDF生成ロジック
async function buildProcessedPdf() {
    const { jsPDF } = window.jspdf;
    const { PDFDocument } = PDFLib;

    const title = document.getElementById('titleInput').value.trim() || '無題';
    const dateMode = document.querySelector('input[name="dateMode"]:checked').value;
    const showDate = (dateMode === 'yes');
    const memoText = document.getElementById('memoInput').value;
    const orderMode = document.querySelector('input[name="orderMode"]:checked').value;
    const pdfFileInput = document.getElementById('pdfFileInput');

    // --- ステップ 1: jsPDF で表紙の PDF バイナリを作成 ---
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await loadFonts(doc);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    let currentY = 40;

    // 1. タイトル
    doc.setFont("NotoSansJP-Bold", "bold");
    doc.setFontSize(24);
    doc.setTextColor(30, 30, 30);
    const titleLines = doc.splitTextToSize(title, pageWidth - 50);
    doc.text(titleLines, pageWidth / 2, currentY, { align: 'center' });
    currentY += (titleLines.length * 9) + 4;

    // 2. 日付
    if (showDate) {
        doc.setFont("NotoSansJP-Light", "light");
        doc.setFontSize(10);
        doc.setTextColor(110, 110, 110);
        doc.text(`作成日時: ${getCurrentDateTime()}`, pageWidth / 2, currentY, { align: 'center' });
        currentY += 12;
    } else {
        currentY += 4;
    }

    // 3. メモ（Markdown解析）
    if (memoText.trim() !== "") {
        const leftMargin = 25;
        const maxLineWidth = pageWidth - (leftMargin * 2);
        
        doc.setFont("NotoSansJP-Medium", "normal");
        doc.setFontSize(10);
        doc.setTextColor(50, 50, 50);

        const rawLines = memoText.split('\n');
        const defaultLineSpacing = 5.2;

        let inTable = false;
        let tableRows = [];

        const renderTable = (rows) => {
            if (rows.length === 0) return;
            const validRows = rows.filter(r => !r.some(cell => /^:?-+:?$/.test(cell.trim())));
            if (validRows.length === 0) return;

            const colCount = Math.max(...validRows.map(r => r.length));
            const colWidth = maxLineWidth / colCount;

            doc.setFontSize(9.5);
            validRows.forEach((row, rowIndex) => {
                const isHeader = (rowIndex === 0);
                if (isHeader) {
                    doc.setFont("NotoSansJP-Bold", "bold");
                    doc.setTextColor(20, 20, 20);
                } else {
                    doc.setFont("NotoSansJP-Medium", "normal");
                    doc.setTextColor(60, 60, 60);
                }

                row.forEach((cellText, colIndex) => {
                    const xPos = leftMargin + (colIndex * colWidth);
                    const cleanCell = cellText.trim().replace(/\*\*(.*?)\*\*/g, '$1');
                    const wrappedCell = doc.splitTextToSize(cleanCell, colWidth - 3);
                    doc.text(wrappedCell, xPos, currentY, { align: 'left' });
                });

                currentY += (isHeader ? 6 : 5.2);
            });
            currentY += 3;
        };

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            const trimmed = line.trim();

            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                const cells = trimmed.substring(1, trimmed.length - 1).split('|');
                tableRows.push(cells);
                inTable = true;
                continue;
            } else if (inTable) {
                renderTable(tableRows);
                tableRows = [];
                inTable = false;
            }

            if (!trimmed) {
                currentY += 3;
                continue;
            }

            let drawText = trimmed;
            let fontSize = 10;
            let fontName = "NotoSansJP-Medium";
            let fontStyle = "normal";

            if (trimmed.startsWith('#')) {
                const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
                if (match) {
                    const level = match[1].length;
                    drawText = match[2];
                    fontName = "NotoSansJP-Bold";
                    fontStyle = "bold";
                    if (level === 1) fontSize = 13.5;
                    else if (level === 2) fontSize = 12;
                    else fontSize = 10.5;
                }
            } else if (/^[-*]\s*\[([ xX])\]\s+(.*)$/.test(trimmed)) {
                const match = trimmed.match(/^[-*]\s*\[([ xX])\]\s+(.*)$/);
                const isChecked = match[1].toLowerCase() === 'x';
                drawText = (isChecked ? '☑ ' : '☐ ') + match[2];
                if (isChecked) {
                    fontName = "NotoSansJP-Light";
                    fontStyle = "light";
                }
            } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                drawText = '• ' + trimmed.substring(2).trim();
            }

            drawText = drawText.replace(/\*\*(.*?)\*\*/g, '$1');

            doc.setFont(fontName, fontStyle);
            doc.setFontSize(fontSize);

            const wrappedLines = doc.splitTextToSize(drawText, maxLineWidth);
            const currentSpacing = (fontSize > 11) ? 6 : defaultLineSpacing;

            wrappedLines.forEach(wLine => {
                doc.text(wLine, leftMargin, currentY, { align: 'left' });
                currentY += currentSpacing;
            });
        }

        if (inTable) {
            renderTable(tableRows);
        }
    }

    const coverPdfBytes = doc.output('arraybuffer');

    // --- ステップ 2: pdf-lib を使ってPDFを組み立てる ---
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

    return { mergedPdf, originalPageCount, blankPagesCount };
}

// プレビューボタンのイベント
document.getElementById('previewBtn').addEventListener('click', async () => {
    try {
        const { mergedPdf } = await buildProcessedPdf();
        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
    } catch (error) {
        console.error(error);
        alert("⚠️ プレビューの生成中にエラーが発生しました。");
    }
});

// ダウンロードボタンのイベント
document.getElementById('generateBtn').addEventListener('click', async () => {
    try {
        const title = document.getElementById('titleInput').value.trim() || '無題';
        const orderMode = document.querySelector('input[name="orderMode"]:checked').value;
        const pdfFileInput = document.getElementById('pdfFileInput');

        const { mergedPdf, originalPageCount, blankPagesCount } = await buildProcessedPdf();
        const mergedPdfBytes = await mergedPdf.save();
        
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        
        const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_');
        link.download = `${safeTitle}_processed.pdf`;
        link.click();

        const totalPages = mergedPdf.getPageCount();
        if (orderMode === 'reverse' && pdfFileInput.files.length > 0) {
            alert(`✅ 処理完了（逆順・4の倍数調整）\n(空白: ${blankPagesCount}P + 本文: ${originalPageCount}P + 表紙: 1P = 計 ${totalPages}P)`);
        } else {
            alert(`✅ 処理完了\n(計 ${totalPages}P)`);
        }
    } catch (error) {
        console.error(error);
        alert("⚠️ PDFの処理中にエラーが発生しました。");
    }
});